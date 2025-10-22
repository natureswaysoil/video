import axios, { AxiosInstance } from 'axios'

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
      throw new Error('HeyGen API key is required')
    }

    this.axios = axios.create({
      baseURL: this.apiEndpoint,
      timeout: 30_000,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      }
    })
  }

  /**
   * Create a new video generation job
   * @param payload Video generation parameters
   * @returns Job ID for polling
   */
  async createVideoJob(payload: HeyGenVideoPayload): Promise<string> {
    const response = await this.axios.post('/v1/video.generate', payload)
    const jobId = response.data?.data?.video_id || response.data?.video_id || response.data?.jobId
    if (!jobId) {
      throw new Error('HeyGen API did not return a job ID')
    }
    return jobId
  }

  /**
   * Check the status of a video generation job
   * @param jobId Job ID returned from createVideoJob
   * @returns Job status and result
   */
  async getJobStatus(jobId: string): Promise<HeyGenJobResult> {
    const response = await this.axios.get(`/v1/video_status.get?video_id=${jobId}`)
    const data = response.data?.data || response.data
    
    return {
      jobId,
      status: this.normalizeStatus(data?.status),
      videoUrl: data?.video_url || data?.videoUrl || data?.url,
      error: data?.error || data?.error_message
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
    const timeoutMs = opts?.timeoutMs ?? 20 * 60_000 // 20 minutes default
    const intervalMs = opts?.intervalMs ?? 10_000 // 10 seconds default
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.getJobStatus(jobId)
        
        if (result.status === 'completed' && result.videoUrl) {
          return result.videoUrl
        }
        
        if (result.status === 'failed') {
          throw new Error(`HeyGen job failed: ${result.error || 'Unknown error'}`)
        }
        
        // Still processing, wait and retry
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      } catch (error: any) {
        // If it's a job failure, rethrow immediately
        if (error?.message?.includes('job failed')) {
          throw error
        }
        // For other errors (network issues, etc.), continue polling
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      }
    }

    throw new Error(`HeyGen job timed out after ${timeoutMs}ms`)
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
  let apiKey = process.env.HEYGEN_API_KEY

  // Try loading from GCP Secret Manager if not in env
  if (!apiKey && process.env.GCP_SECRET_HEYGEN_API_KEY) {
    const v = await getSecretFromGcp(process.env.GCP_SECRET_HEYGEN_API_KEY)
    if (v) apiKey = v
  }

  return new HeyGenClient({ apiKey: apiKey || undefined })
}

export default HeyGenClient