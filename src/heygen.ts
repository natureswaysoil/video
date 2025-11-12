import axios, { AxiosInstance } from 'axios'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()

// Optional: load secrets from Google Secret Manager (only if running on GCP)
async function getSecretFromGcp(name: string): Promise<string | null> {
  try {
    // lazy-import so module doesn't require @google-cloud/secret-manager when not used
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
    const client = new SecretManagerServiceClient()
    const [accessResponse] = await client.accessSecretVersion({ name })
    const payload = accessResponse.payload?.data?.toString('utf8')
    return payload || null
  } catch (e) {
    // Not fatal - return null so caller can fall back to env var
    logger.debug('Could not load secret from GCP', 'HeyGen', {}, e)
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

  constructor(cfg: HeyGenConfig = {}) {
    this.apiKey = cfg.apiKey || process.env.HEYGEN_API_KEY || ''
    this.apiEndpoint = cfg.apiEndpoint || process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com'

    if (!this.apiKey) {
      throw new AppError(
        'HeyGen API key is required',
        ErrorCode.MISSING_CONFIG,
        500
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

  /**
   * Create a new video generation job
   * @param payload Video generation parameters
   * @returns Job ID for polling
   */
  async createVideoJob(payload: HeyGenVideoPayload): Promise<string> {
    const startTime = Date.now()

    try {
      const config = getConfig()

      if (!payload.script) {
        throw new AppError(
          'Script is required for HeyGen video generation',
          ErrorCode.VALIDATION_ERROR,
          400,
          true,
          { hasScript: !!payload.script }
        )
      }

      logger.info('Creating HeyGen video job', 'HeyGen', {
        scriptLength: payload.script.length,
        avatar: payload.avatar,
        voice: payload.voice,
      })

      const jobId = await rateLimiters.execute('heygen', async () => {
        return withRetry(
          async () => {
            const response = await this.axios.post('/v1/video.generate', payload, {
              timeout: config.TIMEOUT_HEYGEN,
            })
            
            const id =
              response.data?.data?.video_id ||
              response.data?.video_id ||
              response.data?.jobId
              
            if (!id) {
              throw new AppError(
                'HeyGen API did not return a job ID',
                ErrorCode.HEYGEN_API_ERROR,
                500,
                true,
                { responseData: response.data }
              )
            }

            return id
          },
          {
            maxRetries: 3,
            onRetry: (error, attempt) => {
              logger.warn('Retrying HeyGen job creation', 'HeyGen', {
                attempt,
                error: error instanceof Error ? error.message : String(error),
              })
            },
          }
        )
      })

      const duration = Date.now() - startTime
      metrics.incrementCounter('heygen.create_job.success')
      metrics.recordHistogram('heygen.create_job.duration', duration)

      logger.info('HeyGen video job created', 'HeyGen', {
        jobId,
        duration,
      })

      return jobId
    } catch (error: any) {
      const duration = Date.now() - startTime
      metrics.incrementCounter('heygen.create_job.error')
      metrics.recordHistogram('heygen.create_job.error_duration', duration)

      logger.error('Failed to create HeyGen video job', 'HeyGen', { duration }, error)

      if (error instanceof AppError) {
        throw error
      }

      if (axios.isAxiosError(error)) {
        throw fromAxiosError(error, ErrorCode.HEYGEN_API_ERROR, {
          payload: { scriptLength: payload.script.length },
        })
      }

      throw new AppError(
        `HeyGen job creation failed: ${error.message || String(error)}`,
        ErrorCode.HEYGEN_API_ERROR,
        500,
        true,
        {},
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Check the status of a video generation job
   * @param jobId Job ID returned from createVideoJob
   * @returns Job status and result
   */
  async getJobStatus(jobId: string): Promise<HeyGenJobResult> {
    try {
      const config = getConfig()

      if (!jobId) {
        throw new AppError(
          'Job ID is required',
          ErrorCode.VALIDATION_ERROR,
          400,
          true,
          { hasJobId: !!jobId }
        )
      }

      const response = await this.axios.get(`/v1/video_status.get?video_id=${jobId}`, {
        timeout: config.TIMEOUT_HEYGEN,
      })
      
      const data = response.data?.data || response.data

      const result: HeyGenJobResult = {
        jobId,
        status: this.normalizeStatus(data?.status),
        videoUrl: data?.video_url || data?.videoUrl || data?.url,
        error: data?.error || data?.error_message,
      }

      logger.debug('HeyGen job status', 'HeyGen', {
        jobId,
        status: result.status,
        hasVideoUrl: !!result.videoUrl,
      })

      return result
    } catch (error: any) {
      logger.error('Failed to get HeyGen job status', 'HeyGen', { jobId }, error)

      if (error instanceof AppError) {
        throw error
      }

      if (axios.isAxiosError(error)) {
        throw fromAxiosError(error, ErrorCode.HEYGEN_API_ERROR, { jobId })
      }

      throw new AppError(
        `Failed to get HeyGen job status: ${error.message || String(error)}`,
        ErrorCode.HEYGEN_API_ERROR,
        500,
        true,
        { jobId },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Poll a job until it completes or times out
   * @param jobId Job ID to poll
   * @param opts Polling options
   * @returns Video URL when ready
   */
  async pollJobForVideoUrl(
    jobId: string,
    opts?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<string> {
    const startTime = Date.now()
    const timeoutMs = opts?.timeoutMs ?? 20 * 60_000 // 20 minutes default
    const intervalMs = opts?.intervalMs ?? 10_000 // 10 seconds default

    try {
      logger.info('Polling HeyGen job', 'HeyGen', {
        jobId,
        timeoutMs,
        intervalMs,
      })

      while (Date.now() - startTime < timeoutMs) {
        try {
          const result = await this.getJobStatus(jobId)

          if (result.status === 'completed' && result.videoUrl) {
            const duration = Date.now() - startTime
            metrics.incrementCounter('heygen.poll.success')
            metrics.recordHistogram('heygen.poll.duration', duration)

            logger.info('HeyGen job completed', 'HeyGen', {
              jobId,
              duration,
              videoUrl: result.videoUrl,
            })

            return result.videoUrl
          }

          if (result.status === 'failed') {
            throw new AppError(
              `HeyGen job failed: ${result.error || 'Unknown error'}`,
              ErrorCode.HEYGEN_API_ERROR,
              500,
              true,
              { jobId, error: result.error }
            )
          }

          // Still processing, wait and retry
          logger.debug('HeyGen job still processing', 'HeyGen', {
            jobId,
            status: result.status,
          })

          await new Promise((resolve) => setTimeout(resolve, intervalMs))
        } catch (error: any) {
          // If it's a job failure, rethrow immediately
          if (error instanceof AppError && error.message.includes('job failed')) {
            throw error
          }
          // For other errors (network issues, etc.), continue polling
          logger.warn('Error polling HeyGen job, will retry', 'HeyGen', {
            jobId,
          }, error)
          
          await new Promise((resolve) => setTimeout(resolve, intervalMs))
        }
      }

      const duration = Date.now() - startTime
      metrics.incrementCounter('heygen.poll.timeout')
      metrics.recordHistogram('heygen.poll.timeout_duration', duration)

      throw new AppError(
        `HeyGen job timed out after ${timeoutMs}ms`,
        ErrorCode.TIMEOUT_ERROR,
        500,
        true,
        { jobId, timeoutMs }
      )
    } catch (error: any) {
      const duration = Date.now() - startTime
      metrics.incrementCounter('heygen.poll.error')
      metrics.recordHistogram('heygen.poll.error_duration', duration)

      logger.error('Failed to poll HeyGen job', 'HeyGen', { jobId, duration }, error)

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(
        `HeyGen polling failed: ${error.message || String(error)}`,
        ErrorCode.HEYGEN_API_ERROR,
        500,
        true,
        { jobId },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Normalize various status strings to our enum
   */
  private normalizeStatus(status: string | undefined): HeyGenJobStatus {
    const s = (status || '').toLowerCase()
    if (s.includes('complet') || s === 'success') return 'completed'
    if (s.includes('fail') || s === 'error') return 'failed'
    if (s.includes('process') || s === 'running') return 'processing'
    return 'pending'
  }
}

/**
 * Create a HeyGen client with credentials loaded from env or GCP Secret Manager
 */
export async function createClientWithSecrets(): Promise<HeyGenClient> {
  try {
    let apiKey = process.env.HEYGEN_API_KEY

    // Try loading from GCP Secret Manager if not in env
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
