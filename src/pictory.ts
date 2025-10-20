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

export type PictoryConfig = {
  clientId?: string
  clientSecret?: string
  pictoryUserId?: string
  apiEndpoint?: string
  getSecret?: (name: string) => Promise<string | null>
}

export class PictoryClient {
  private axios: AxiosInstance
  private clientId?: string
  private clientSecret?: string
  private pictoryUserId?: string
  private apiEndpoint: string

  constructor(cfg: PictoryConfig = {}) {
    this.clientId = cfg.clientId || process.env.PICTORY_CLIENT_ID
    this.clientSecret = cfg.clientSecret || process.env.PICTORY_CLIENT_SECRET
    this.pictoryUserId = cfg.pictoryUserId || process.env.X_PICTORY_USER_ID
    this.apiEndpoint = cfg.apiEndpoint || process.env.PICTORY_API_ENDPOINT || 'https://api.pictory.ai'
    this.axios = axios.create({ baseURL: this.apiEndpoint, timeout: 30_000 })
  }

  private headers(token: string | null) {
    const h: Record<string, string> = {}
    if (token) h.Authorization = `Bearer ${token}`
    if (this.pictoryUserId) h['X-Pictory-User-Id'] = this.pictoryUserId
    return h
  }

  async getAccessToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret) throw new Error('PICTORY credentials missing')
    const res = await this.axios.post('/pictoryapis/v1/oauth2/token', {
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })
    return res.data?.access_token
  }

  async createStoryboard(token: string, payload: any): Promise<string> {
    const res = await this.axios.post('/pictoryapis/v1/video/storyboard', payload, { headers: this.headers(token) })
    return res.data?.data?.job_id
  }

  async pollJobForRenderParams(jobId: string, token: string, opts?: { timeoutMs?: number }) {
    const url = `/pictoryapis/v1/jobs/${jobId}`
    const timeoutMs = opts?.timeoutMs ?? 2 * 60_000
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const res = await this.axios.get(url, { headers: this.headers(token) })
      const renderParams = res.data?.data?.renderParams
      if (renderParams) return renderParams
      await new Promise((r) => setTimeout(r, 3000))
    }
    throw new Error('Timed out waiting for renderParams')
  }

  async renderVideo(token: string, storyboardJobId: string, opts?: { webhook?: string }) {
    const url = `/pictoryapis/v1/video/render/${storyboardJobId}`
    const body: any = {}
    if (opts?.webhook) body.webhook = opts.webhook
    const res = await this.axios.put(url, body, { headers: this.headers(token) })
    return res.data?.data?.job_id
  }

  async pollRenderJob(jobId: string, token: string, opts?: { timeoutMs?: number }) {
    const url = `/pictoryapis/v1/jobs/${jobId}`
    const timeoutMs = opts?.timeoutMs ?? 10 * 60_000
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const res = await this.axios.get(url, { headers: this.headers(token) })
      const status = res.data?.data?.status
      if (status === 'completed') return res.data?.data
      if (status === 'failed' || status === 'Failed') throw new Error('Render job failed')
      await new Promise((r) => setTimeout(r, 5000))
    }
    throw new Error('Timed out waiting for render job')
  }
}

// Convenience helper that can load secrets from the environ or GCP Secret Manager
export async function createClientWithSecrets(): Promise<PictoryClient> {
  let clientId = process.env.PICTORY_CLIENT_ID
  let clientSecret = process.env.PICTORY_CLIENT_SECRET
  let pictoryUserId = process.env.X_PICTORY_USER_ID

  // If running on GCP and secrets are stored there, try loading them
  if (!clientId && process.env.GCP_SECRET_PICTORY_CLIENT_ID) {
    const v = await getSecretFromGcp(process.env.GCP_SECRET_PICTORY_CLIENT_ID)
    if (v) clientId = v
  }
  if (!clientSecret && process.env.GCP_SECRET_PICTORY_CLIENT_SECRET) {
    const v = await getSecretFromGcp(process.env.GCP_SECRET_PICTORY_CLIENT_SECRET)
    if (v) clientSecret = v
  }
  if (!pictoryUserId && process.env.GCP_SECRET_X_PICTORY_USER_ID) {
    const v = await getSecretFromGcp(process.env.GCP_SECRET_X_PICTORY_USER_ID)
    if (v) pictoryUserId = v
  }

  return new PictoryClient({ clientId: clientId || undefined, clientSecret: clientSecret || undefined, pictoryUserId: pictoryUserId || undefined })
}

export default PictoryClient
