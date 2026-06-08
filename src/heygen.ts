import axios, { AxiosInstance } from 'axios'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()

function isPlaceholderApiKey(value: string | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase()
  return !normalized || normalized.includes('your-') || normalized.includes('paste_') || normalized.includes('replace_') || normalized === 'changeme'
}

// Optional: load secrets from Google Secret Manager
async function getSecretFromGcp(name: string): Promise<string | null> {
  try {
    const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
    const client = new SecretManagerServiceClient()
    const [accessResponse] = await client.accessSecretVersion({ name })
    const payload = accessResponse.payload?.data?.toString('utf8')
    return payload || null
  } catch (e) {
    logger.debug('Could not load secret from GCP', 'HeyGen', { error: e })
    return null
  }
}

export type HeyGenConfig = {
  apiKey?: string
  apiEndpoint?: string
}

export type HeyGenVideoPayload = {
  script: string
  avatar?: string
  voice?: string
  lengthSeconds?: number
  imageUrl?: string
  visualPrompt?: string
  music?: {
    style?: string
    volume?: number
  }
  subtitles?: {
    enabled?: boolean
    style?: string
  }
  webhook?: string
  title?: string
  meta?: Record<string, any>
  // NEW: Multi-scene + Pexels B-roll support
  scenes?: Array<{
    seconds: string
    avatarText: string
    brollUrl?: string
    imageUrl?: string  // per-scene product/image background (overrides payload.imageUrl)
    visualDesc?: string
  }>
}

export type HeyGenJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type HeyGenJobResult = {
  jobId: string
  status: HeyGenJobStatus
  videoUrl?: string
  error?: string
}

export class HeyGenClient {
  private axios: AxiosInstance
  private apiKey: string
  private apiEndpoint: string
  private _avatarCache: Record<string, string> = {}
  private _voiceCache: Record<string, string> = {}

  constructor(cfg: HeyGenConfig = {}) {
    this.apiKey = cfg.apiKey || process.env.HEYGEN_API_KEY || ''
    this.apiEndpoint = cfg.apiEndpoint || process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com'
    if (isPlaceholderApiKey(this.apiKey)) {
      throw new AppError(
        'HeyGen API key is missing or still set to a placeholder.',
        ErrorCode.MISSING_CONFIG,
        500,
        true,
        { hasHeyGenApiKey: !!this.apiKey }
      )
    }
    this.axios = axios.create({
      baseURL: this.apiEndpoint,
      timeout: 30_000,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    })
  }

  async resolveAvatarId(nameOrId: string): Promise<string> {
    if (this._avatarCache[nameOrId]) return this._avatarCache[nameOrId]
    try {
      const res = await this.axios.get('/v2/avatars')
      const avatars: any[] = res.data?.data?.avatars || res.data?.avatars || []
      const match = avatars.find((a: any) => a.avatar_id === nameOrId) || avatars.find((a: any) => (a.avatar_name || '').toLowerCase().includes(nameOrId.toLowerCase())) || avatars[0]
      const id = match?.avatar_id || nameOrId
      for (const a of avatars) {
        if (a.avatar_id) {
          this._avatarCache[a.avatar_name || a.avatar_id] = a.avatar_id
          this._avatarCache[a.avatar_id] = a.avatar_id
        }
      }
      return id
    } catch (e: any) {
      console.warn('Could not list HeyGen avatars:', e?.message)
      return nameOrId
    }
  }

  async resolveVoiceId(nameOrId: string): Promise<string> {
    if (this._voiceCache[nameOrId]) return this._voiceCache[nameOrId]
    try {
      const res = await this.axios.get('/v2/voices')
      const voices: any[] = res.data?.data?.voices || res.data?.voices || []
      const match = voices.find((v: any) => v.voice_id === nameOrId) || voices.find((v: any) => (v.name || '').toLowerCase().includes(nameOrId.toLowerCase())) || voices[0]
      const id = match?.voice_id || nameOrId
      for (const v of voices) {
        if (v.voice_id) {
          this._voiceCache[v.name || v.voice_id] = v.voice_id
          this._voiceCache[v.voice_id] = v.voice_id
        }
      }
      return id
    } catch (e: any) {
      console.warn('Could not list HeyGen voices:', e?.message)
      return nameOrId
    }
  }

  /**
   * Create a new video generation job — NOW SUPPORTS MULTI-SCENE + PEXELS B-ROLL
   */
  async createVideoJob(payload: HeyGenVideoPayload): Promise<string> {
    const startTime = Date.now()
    try {
      const config = getConfig()
      if (!payload.script) {
        throw new AppError('Script is required for HeyGen video generation', ErrorCode.VALIDATION_ERROR, 400, true)
      }

      logger.info('Creating HeyGen video job', 'HeyGen', {
        scriptLength: payload.script.length,
        avatar: payload.avatar,
        voice: payload.voice,
        hasScenes: !!(payload.scenes && payload.scenes.length > 0),
        sceneCount: payload.scenes?.length || 1,
      })

      const jobId = await rateLimiters.execute('heygen', async () => {
        return withRetry(
          async () => {
            const resolvedAvatarId = await this.resolveAvatarId(payload.avatar || 'default')
            const resolvedVoiceId = await this.resolveVoiceId(payload.voice || 'default')

            let videoInputs: any[] = []

            if (payload.scenes && payload.scenes.length > 0) {
              // Multi-scene mode with Pexels B-roll
              for (const scene of payload.scenes) {
                const background = scene.brollUrl
                  ? { type: 'video', url: scene.brollUrl }
                  : (scene.imageUrl || payload.imageUrl)
                    ? { type: 'image', url: scene.imageUrl || payload.imageUrl }
                    : { type: 'color', value: '#1a3a1a' }

                videoInputs.push({
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
                  background,
                })
              }
            } else {
              // Fallback to single-scene (old behavior)
              videoInputs = [{
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
              }]
            }

            const v2Body: Record<string, any> = {
              video_inputs: videoInputs,
              dimension: { width: 720, height: 1280 },
              ...(payload.title ? { title: payload.title } : {}),
              // Burn captions into the video for silent viewing
              ...(payload.subtitles?.enabled ? {
                caption_option: {
                  position: 'bottom_center',
                  display_option: 'word_by_word',
                },
              } : {}),
            }

            const response = await this.axios.post('/v2/video/generate', v2Body, {
              timeout: config.TIMEOUT_HEYGEN,
            })

            const id = response.data?.data?.video_id || response.data?.video_id || response.data?.jobId
            if (!id) throw new AppError('HeyGen API did not return a job ID', ErrorCode.HEYGEN_API_ERROR, 500, true)
            return id
          },
          { maxRetries: 3 }
        )
      })

      const duration = Date.now() - startTime
      metrics.incrementCounter('heygen.create_job.success')
      metrics.recordHistogram('heygen.create_job.duration', duration)
      logger.info('HeyGen video job created', 'HeyGen', { jobId, duration, sceneCount: payload.scenes?.length || 1 })
      return jobId
    } catch (error: any) {
      const duration = Date.now() - startTime
      metrics.incrementCounter('heygen.create_job.error')
      metrics.recordHistogram('heygen.create_job.error_duration', duration)
      logger.error('Failed to create HeyGen video job', 'HeyGen', { duration, heygenError: error?.response?.data }, error)
      if (error instanceof AppError) throw error
      if (axios.isAxiosError(error)) throw fromAxiosError(error, ErrorCode.HEYGEN_API_ERROR)
      throw new AppError(`HeyGen job creation failed: ${error.message || String(error)}`, ErrorCode.HEYGEN_API_ERROR, 500, true)
    }
  }

  async getJobStatus(jobId: string): Promise<HeyGenJobResult> {
    try {
      const config = getConfig()
      // v1/video_status.get is the correct endpoint for checking async generation status.
      // GET /v2/video/{id} is for accessing completed library videos and 404s on in-progress jobs.
      const response = await this.axios.get(`/v1/video_status.get?video_id=${jobId}`, { timeout: config.TIMEOUT_HEYGEN })
      const data = response.data?.data || response.data
      // v1 can return 200 with an error code meaning "not found"
      if (response.data?.code && response.data.code !== 100) {
        throw new AppError(
          `HeyGen job expired or not found: ${jobId}`,
          ErrorCode.HEYGEN_API_ERROR,
          404,
          false
        )
      }
      return {
        jobId,
        status: this.normalizeStatus(data?.status),
        videoUrl: data?.video_url || data?.videoUrl || data?.url,
        error: data?.error || data?.error_message,
      }
    } catch (error: any) {
      if (error instanceof AppError) throw error
      logger.error('Failed to get HeyGen job status', 'HeyGen', { jobId, heygenError: (error as any)?.response?.data }, error)
      // 404 = job expired or never existed — permanent failure, never retry
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new AppError(
          `HeyGen job expired or not found: ${jobId}`,
          ErrorCode.HEYGEN_API_ERROR,
          404,
          false
        )
      }
      throw error
    }
  }

  async pollJobForVideoUrl(jobId: string, opts?: { timeoutMs?: number; intervalMs?: number; initialDelayMs?: number; notFoundGracePeriodMs?: number }): Promise<string> {
    const startTime = Date.now()
    const timeoutMs = opts?.timeoutMs ?? 20 * 60_000
    const intervalMs = opts?.intervalMs ?? 15_000
    const initialDelayMs = opts?.initialDelayMs ?? 0
    // How long to keep retrying 404s before treating as permanent (0 = fail immediately on first 404)
    const notFoundGracePeriodMs = opts?.notFoundGracePeriodMs ?? 0

    if (initialDelayMs > 0) {
      logger.info(`Waiting ${initialDelayMs}ms before first poll`, 'HeyGen', { jobId })
      await new Promise(resolve => setTimeout(resolve, initialDelayMs))
    }

    try {
      while (Date.now() - startTime < timeoutMs) {
        let result: HeyGenJobResult
        try {
          result = await this.getJobStatus(jobId)
        } catch (statusError: any) {
          if (statusError instanceof AppError && statusError.statusCode === 404) {
            const elapsed = Date.now() - startTime
            if (elapsed < notFoundGracePeriodMs) {
              // Still in grace period — job is likely still indexing on HeyGen's side
              logger.info(`Job ${jobId} not found yet (${Math.round(elapsed/1000)}s elapsed), retrying...`, 'HeyGen', { jobId, elapsed })
              await new Promise(resolve => setTimeout(resolve, intervalMs))
              continue
            }
            // Grace period expired — treat as permanent failure
            throw statusError
          }
          // Transient error — wait and retry
          await new Promise(resolve => setTimeout(resolve, intervalMs))
          continue
        }
        if (result.status === 'completed' && result.videoUrl) return result.videoUrl
        if (result.status === 'failed') throw new AppError(`HeyGen job failed: ${result.error}`, ErrorCode.HEYGEN_API_ERROR)
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }
      throw new AppError(`HeyGen job timed out`, ErrorCode.TIMEOUT_ERROR)
    } catch (error: any) {
      logger.error('Failed to poll HeyGen job', 'HeyGen', { jobId }, error)
      throw error
    }
  }

  private normalizeStatus(status: string | undefined): HeyGenJobStatus {
    const s = (status || '').toLowerCase()
    if (s.includes('complet') || s === 'success') return 'completed'
    if (s.includes('fail') || s === 'error') return 'failed'
    if (s.includes('process') || s === 'running') return 'processing'
    return 'pending'
  }
}

export async function createClientWithSecrets(): Promise<HeyGenClient> {
  try {
    let apiKey = process.env.HEYGEN_API_KEY
    if (!apiKey && process.env.GCP_SECRET_HEYGEN_API_KEY) {
      const v = await getSecretFromGcp(process.env.GCP_SECRET_HEYGEN_API_KEY)
      if (v) apiKey = v
    }
    return new HeyGenClient({ apiKey: apiKey || undefined })
  } catch (error) {
    logger.error('Failed to create HeyGen client', 'HeyGen', {}, error)
    throw error
  }
}

export default HeyGenClient
