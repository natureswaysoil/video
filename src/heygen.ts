// src/heygen.ts
// Lightweight HeyGen client used by the scheduled blog/video generator.

import axios, { AxiosInstance } from 'axios'

type CreateVideoPayload = {
  script: string
  title?: string
  lengthSeconds?: number
  avatar?: string
  voice?: string
  imageUrl?: string
  scenes?: Array<{
    avatarText?: string
    brollUrl?: string
  }>
  music?: any
  subtitles?: any
  webhook?: string
  meta?: Record<string, any>
}

type JobStatus = {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  error?: string
}

type PollOptions = {
  timeoutMs?: number
  intervalMs?: number
  initialDelayMs?: number
  notFoundGracePeriodMs?: number
}

function isPlaceholderApiKey(value: string | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase()
  return (
    !normalized ||
    normalized.includes('your-') ||
    normalized.includes('paste_') ||
    normalized.includes('replace_') ||
    normalized === 'changeme'
  )
}

async function getSecretFromGcp(name: string): Promise<string | null> {
  try {
    // Keep this dynamic import so local development does not require GCP auth.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
    const client = new SecretManagerServiceClient()
    const [accessResponse] = await client.accessSecretVersion({ name })
    return accessResponse.payload?.data?.toString('utf8') || null
  } catch (error: any) {
    console.warn('Could not load HeyGen secret from GCP:', error?.message || error)
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class HeyGenClient {
  private readonly apiKey: string
  private readonly apiEndpoint: string
  private readonly axios: AxiosInstance
  private readonly avatarCache: Record<string, string> = {}
  private readonly voiceCache: Record<string, string> = {}

  constructor(cfg: { apiKey?: string; apiEndpoint?: string } = {}) {
    this.apiKey = cfg.apiKey || process.env.HEYGEN_API_KEY || ''
    this.apiEndpoint = cfg.apiEndpoint || process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com'

    if (isPlaceholderApiKey(this.apiKey)) {
      throw new Error('HeyGen API key is missing or still set to a placeholder.')
    }

    this.axios = axios.create({
      baseURL: this.apiEndpoint,
      timeout: Number(process.env.TIMEOUT_HEYGEN || 60_000),
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    })
  }

  async resolveAvatarId(nameOrId: string): Promise<string> {
    if (!nameOrId) return nameOrId
    if (this.avatarCache[nameOrId]) return this.avatarCache[nameOrId]

    try {
      const res = await this.axios.get('/v2/avatars', { timeout: 30_000 })
      const avatars = res.data?.data?.avatars || res.data?.avatars || []
      const lowered = nameOrId.toLowerCase()
      const match =
        avatars.find((a: any) => a.avatar_id === nameOrId) ||
        avatars.find((a: any) => String(a.avatar_name || '').toLowerCase() === lowered) ||
        avatars.find((a: any) => String(a.avatar_name || '').toLowerCase().includes(lowered))

      for (const avatar of avatars) {
        if (avatar?.avatar_id) {
          this.avatarCache[avatar.avatar_id] = avatar.avatar_id
          if (avatar.avatar_name) this.avatarCache[avatar.avatar_name] = avatar.avatar_id
        }
      }

      return match?.avatar_id || nameOrId
    } catch (error: any) {
      console.warn('Could not list HeyGen avatars:', error?.response?.data || error?.message || error)
      return nameOrId
    }
  }

  async resolveVoiceId(nameOrId: string): Promise<string> {
    if (!nameOrId) return nameOrId
    if (this.voiceCache[nameOrId]) return this.voiceCache[nameOrId]

    try {
      const res = await this.axios.get('/v2/voices', { timeout: 30_000 })
      const voices = res.data?.data?.voices || res.data?.voices || []
      const lowered = nameOrId.toLowerCase()
      const match =
        voices.find((v: any) => v.voice_id === nameOrId) ||
        voices.find((v: any) => String(v.name || '').toLowerCase() === lowered) ||
        voices.find((v: any) => String(v.name || '').toLowerCase().includes(lowered))

      for (const voice of voices) {
        if (voice?.voice_id) {
          this.voiceCache[voice.voice_id] = voice.voice_id
          if (voice.name) this.voiceCache[voice.name] = voice.voice_id
        }
      }

      return match?.voice_id || nameOrId
    } catch (error: any) {
      console.warn('Could not list HeyGen voices:', error?.response?.data || error?.message || error)
      return nameOrId
    }
  }

  async createVideoJob(payload: CreateVideoPayload): Promise<string> {
    if (!payload.script) throw new Error('Script is required for HeyGen video generation')

    const resolvedAvatarId = await this.resolveAvatarId(payload.avatar || process.env.HEYGEN_DEFAULT_AVATAR || '')
    const resolvedVoiceId = await this.resolveVoiceId(payload.voice || process.env.HEYGEN_DEFAULT_VOICE || '')

    if (!resolvedAvatarId || !resolvedVoiceId) {
      throw new Error('Missing HEYGEN_DEFAULT_AVATAR or HEYGEN_DEFAULT_VOICE')
    }

    const videoInputs = payload.scenes?.length
      ? payload.scenes.map(scene => ({
          character: {
            type: 'avatar',
            avatar_id: resolvedAvatarId,
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            input_text: scene.avatarText || payload.script,
            voice_id: resolvedVoiceId,
            speed: 1.0,
          },
          background: scene.brollUrl
            ? { type: 'video', url: scene.brollUrl }
            : payload.imageUrl
              ? { type: 'image', url: payload.imageUrl }
              : { type: 'color', value: '#1a3a1a' },
        }))
      : [
          {
            character: {
              type: 'avatar',
              avatar_id: resolvedAvatarId,
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              input_text: payload.script,
              voice_id: resolvedVoiceId,
              speed: 1.0,
            },
            background: payload.imageUrl
              ? { type: 'image', url: payload.imageUrl }
              : { type: 'color', value: '#1a3a1a' },
          },
        ]

    const body = {
      video_inputs: videoInputs,
      dimension: { width: 720, height: 1280 },
      ...(payload.title ? { title: payload.title } : {}),
      ...(payload.webhook ? { callback_url: payload.webhook } : {}),
    }

    const response = await this.axios.post('/v2/video/generate', body, {
      timeout: Number(process.env.TIMEOUT_HEYGEN || 60_000),
    })

    const jobId = response.data?.data?.video_id || response.data?.video_id || response.data?.jobId
    if (!jobId) {
      throw new Error(`HeyGen API did not return a video job ID: ${JSON.stringify(response.data)}`)
    }

    return String(jobId)
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await this.axios.get(`/v1/video_status.get?video_id=${encodeURIComponent(jobId)}`, {
      timeout: Number(process.env.TIMEOUT_HEYGEN || 60_000),
    })
    const data = response.data?.data || response.data || {}

    return {
      jobId,
      status: this.normalizeStatus(data?.status),
      videoUrl: data?.video_url || data?.videoUrl || data?.url,
      error: data?.error || data?.error_message,
    }
  }

  async pollJobForVideoUrl(jobId: string, opts: PollOptions = {}): Promise<string> {
    const startedAt = Date.now()
    const timeoutMs = opts.timeoutMs ?? 20 * 60_000
    const intervalMs = opts.intervalMs ?? 15_000
    const initialDelayMs = opts.initialDelayMs ?? 0

    if (initialDelayMs > 0) await sleep(initialDelayMs)

    while (Date.now() - startedAt < timeoutMs) {
      const result = await this.getJobStatus(jobId)
      if (result.status === 'completed' && result.videoUrl) return result.videoUrl
      if (result.status === 'failed') throw new Error(`HeyGen job failed: ${result.error || 'unknown error'}`)
      await sleep(intervalMs)
    }

    throw new Error('HeyGen job timed out')
  }

  private normalizeStatus(status: string): JobStatus['status'] {
    const s = String(status || '').toLowerCase()
    if (s.includes('complet') || s === 'success') return 'completed'
    if (s.includes('fail') || s === 'error') return 'failed'
    if (s.includes('process') || s === 'running') return 'processing'
    return 'pending'
  }
}

export async function createClientWithSecrets(): Promise<HeyGenClient> {
  let apiKey = process.env.HEYGEN_API_KEY

  if (!apiKey && process.env.GCP_SECRET_HEYGEN_API_KEY) {
    const secret = await getSecretFromGcp(process.env.GCP_SECRET_HEYGEN_API_KEY)
    if (secret) apiKey = secret
  }

  return new HeyGenClient({ apiKey: apiKey || undefined })
}

export default HeyGenClient
