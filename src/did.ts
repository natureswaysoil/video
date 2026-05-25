import axios, { AxiosInstance } from 'axios'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'
import { loadSecretToEnv } from './secret-manager'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()

export type DidVideoPayload = {
  script: string
  title?: string
  sourceUrl?: string
  presenterId?: string
  voiceId?: string
  webhook?: string
  subtitles?: {
    enabled?: boolean
  }
  meta?: Record<string, any>
}

export type DidJobResult = {
  jobId: string
  status: string
  videoUrl?: string
  error?: string
}

export class DidClient {
  private axios: AxiosInstance

  constructor() {
    const apiKey = process.env.DID_API_KEY || process.env.DiD || ''
    const apiEndpoint = process.env.DID_API_ENDPOINT || 'https://api.d-id.com'

    if (!apiKey) {
      throw new AppError('D-ID API key missing', ErrorCode.MISSING_CONFIG, 500)
    }

    this.axios = axios.create({
      baseURL: apiEndpoint,
      timeout: 30000,
      headers: {
        Authorization: `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })
  }

  async createVideoJob(payload: DidVideoPayload): Promise<string> {
    const config = getConfig()

    const useClips = !!payload.presenterId

    const body: Record<string, any> = useClips
      ? {
          presenter_id: payload.presenterId,
          script: {
            type: 'text',
            input: payload.script,
          },
          webhook: payload.webhook,
          metadata: payload.meta,
        }
      : {
          source_url: payload.sourceUrl,
          script: {
            type: 'text',
            input: payload.script,
          },
          webhook: payload.webhook,
          metadata: payload.meta,
        }

    const endpoint = useClips ? '/clips' : '/talks'

    const jobId = await rateLimiters.execute('heygen', async () => {
      return withRetry(async () => {
        const response = await this.axios.post(endpoint, body, {
          timeout: config.TIMEOUT_HEYGEN,
        })

        const id = response.data?.id || response.data?.data?.id

        if (!id) {
          throw new AppError('D-ID did not return a job id', ErrorCode.HEYGEN_API_ERROR, 500)
        }

        return id
      })
    })

    metrics.incrementCounter('did.create.success')
    logger.info('Created D-ID job', 'D-ID', { jobId })

    return jobId
  }

  async getJobStatus(jobId: string): Promise<DidJobResult> {
    const mode = process.env.DID_PRESENTER_ID ? 'clips' : 'talks'

    const response = await this.axios.get(`/${mode}/${jobId}`)

    const data = response.data || {}

    return {
      jobId,
      status: String(data.status || '').toLowerCase(),
      videoUrl: data.result_url || data.video_url || data.url,
      error: data.error?.message || data.error,
    }
  }

  async pollJobForVideoUrl(jobId: string, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<string> {
    const timeoutMs = opts?.timeoutMs || 20 * 60 * 1000
    const intervalMs = opts?.intervalMs || 15000
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      const result = await this.getJobStatus(jobId)

      if (result.status.includes('done') || result.status.includes('complete')) {
        if (result.videoUrl) return result.videoUrl
      }

      if (result.status.includes('error') || result.status.includes('fail')) {
        throw new AppError(`D-ID generation failed: ${result.error}`, ErrorCode.HEYGEN_API_ERROR, 500)
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    throw new AppError('D-ID job timed out', ErrorCode.TIMEOUT_ERROR, 500)
  }
}

export async function createClientWithSecrets(): Promise<DidClient> {
  await loadSecretToEnv('DID_API_KEY')
  await loadSecretToEnv('DiD')

  if (!process.env.DID_API_KEY && process.env.DiD) {
    process.env.DID_API_KEY = process.env.DiD
  }

  return new DidClient()
}

export default DidClient
