import axios from 'axios'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export async function callWaveSpeed<T = any>(opts: {
  path: string
  method?: HttpMethod
  body?: any
  apiKey: string
  baseUrl?: string
  headers?: Record<string, string>
}): Promise<T> {
  const baseUrl = (opts.baseUrl || process.env.WAVE_API_BASE_URL || 'https://api.wavespeed.ai').replace(/\/$/, '')
  const path = opts.path.startsWith('/') ? opts.path : `/${opts.path}`
  const url = `${baseUrl}${path}`
  const method = (opts.method || 'POST').toUpperCase() as HttpMethod
  const headers = {
    Authorization: `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  }
  const debug = String(process.env.WAVE_DEBUG || '').toLowerCase() === 'true'
  if (debug) {
    console.log(`[WaveSpeed] Request: ${method} ${url}`)
  }
  try {
    const res = await axios.request<T>({ url, method, headers, data: opts.body })
    if (debug) {
      const ct = (res.headers?.['content-type'] || '') as string
      console.log(`[WaveSpeed] Response: ${res.status} ${res.statusText} content-type=${ct}`)
    }
    return res.data
  } catch (e: any) {
    if (debug) {
      const status = e?.response?.status
      const statusText = e?.response?.statusText
      const data = e?.response?.data
      console.log(`[WaveSpeed] Error response: ${status} ${statusText} body=${safeStringify(data)}`)
    }
    throw e
  }
}

export async function fetchVideoUrlFromWaveSpeed(jobId: string): Promise<string | undefined> {
  const apiKey = process.env.WAVE_SPEED_API_KEY || process.env.WAVESPEED_API_KEY || process.env.GS_API_KEY
  const rawPath = process.env.WAVE_VIDEO_LOOKUP_PATH
  if (!apiKey || !rawPath) return undefined
  const method = ((process.env.WAVE_VIDEO_LOOKUP_METHOD || 'POST').toUpperCase() as HttpMethod)
  const baseUrl = process.env.WAVE_API_BASE_URL || process.env.GS_API_BASE || 'https://api.wavespeed.ai'
  const rawTemplate = process.env.WAVE_VIDEO_LOOKUP_BODY_TEMPLATE || '{"jobId":"{jobId}"}'
  const rendered = renderTemplate(rawTemplate, { jobId })
  let body: any = undefined
  try {
    body = JSON.parse(rendered)
  } catch {
    // if body is not valid JSON, send as string
    body = rendered
  }

  // Render path template with jobId/asin substitutions
  const path = renderTemplate(rawPath, { jobId, asin: jobId })

  try {
    const data = await callWaveSpeed<any>({ path, method, body, apiKey, baseUrl })
    const debug = String(process.env.WAVE_DEBUG || '').toLowerCase() === 'true'
    // JSON Pointer path to the URL field
    const pointer = process.env.WAVE_VIDEO_LOOKUP_JSON_POINTER || '/video_url'
    const value = getByJsonPointer(data, pointer)
    if (debug) {
      console.log(`[WaveSpeed] Lookup pointer=${pointer} resolvedType=${typeof value}`)
    }
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
    // common fallbacks
    const url =
      value?.url ||
      data?.video_url ||
      data?.url ||
      (Array.isArray(data?.data?.outputs) ? data?.data?.outputs?.[0] : undefined) ||
      data?.data?.video_url ||
      data?.data?.url
    if (debug) {
      console.log(`[WaveSpeed] Fallback url candidate type=${typeof url}`)
    }
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url
  } catch (e) {
    // Swallow errors and let caller fall back to template
    if (String(process.env.WAVE_DEBUG || '').toLowerCase() === 'true') {
      console.log('[WaveSpeed] Lookup error, falling back to template:', (e as any)?.message || String(e))
    }
  }
  return undefined
}

export async function createWaveSpeedPrediction(params: {
  script: string
  jobId?: string
}): Promise<{ id: string }> {
  const apiKey = process.env.WAVE_SPEED_API_KEY || process.env.WAVESPEED_API_KEY || process.env.GS_API_KEY
  const baseUrl = process.env.WAVE_API_BASE_URL || process.env.GS_API_BASE || 'https://api.wavespeed.ai'
  const rawPath = process.env.WAVE_CREATE_PATH
  if (!apiKey || !rawPath) throw new Error('WaveSpeed create endpoint not configured (WAVE_CREATE_PATH and API key required)')
  const method = ((process.env.WAVE_CREATE_METHOD || 'POST').toUpperCase() as HttpMethod)
  const path = renderTemplate(rawPath, { jobId: params.jobId || '' })
  
  // Build body - check if custom template is provided, otherwise use default structure for WAN 2.5
  let body: any
  if (process.env.WAVE_CREATE_BODY_TEMPLATE) {
    const template = process.env.WAVE_CREATE_BODY_TEMPLATE
    const bodyRendered = renderTemplate(template, { script: JSON.stringify(params.script), jobId: params.jobId || '' })
    try { body = JSON.parse(bodyRendered) } catch { body = bodyRendered }
  } else {
    // Default structure for Alibaba WAN 2.5
    body = {
      prompt: params.script,
      duration: parseInt(process.env.WAVE_VIDEO_DURATION || '5'),
      size: process.env.WAVE_VIDEO_SIZE || '1280*720',
      seed: parseInt(process.env.WAVE_VIDEO_SEED || '-1'),
      enable_prompt_expansion: String(process.env.WAVE_ENABLE_PROMPT_EXPANSION || 'false').toLowerCase() === 'true'
    }
  }
  
  // Debug: log the request body
  if (String(process.env.WAVE_DEBUG || '').toLowerCase() === 'true') {
    console.log('[WaveSpeed] Create request body:', JSON.stringify(body, null, 2))
  }
  
  const data = await callWaveSpeed<any>({ path, method, body, apiKey, baseUrl })
  const id = data?.data?.id || data?.id
  if (!id) throw new Error('WaveSpeed create did not return a prediction id')
  return { id }
}

export async function pollWaveSpeedUntilReady(predictionId: string, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<string | undefined> {
  const timeoutMs = opts?.timeoutMs ?? 10 * 60_000
  const intervalMs = opts?.intervalMs ?? 10_000
  const start = Date.now()
  const baseUrl = process.env.WAVE_API_BASE_URL || process.env.GS_API_BASE || 'https://api.wavespeed.ai'
  const apiKey = process.env.WAVE_SPEED_API_KEY || process.env.WAVESPEED_API_KEY || process.env.GS_API_KEY
  if (!apiKey) throw new Error('WaveSpeed API key missing')

  // Try status endpoint first; fallback to checking result availability
  while (Date.now() - start < timeoutMs) {
    try {
      // Status endpoint
      const statusRes = await callWaveSpeed<any>({ path: `/api/v3/predictions/${predictionId}`, method: 'GET', apiKey, baseUrl })
      const status = statusRes?.data?.status || statusRes?.status
      if (String(process.env.WAVE_DEBUG || '').toLowerCase() === 'true') {
        console.log(`[WaveSpeed] Status for ${predictionId}:`, status)
      }
      if (status && ['succeeded', 'success', 'completed'].includes(String(status).toLowerCase())) {
        // fetch result url
        const url = await fetchVideoUrlFromWaveSpeed(predictionId)
        if (url) return url
      }
      if (status && ['failed', 'error'].includes(String(status).toLowerCase())) {
        throw new Error(`Prediction failed: ${status}`)
      }
    } catch (e) {
      // Ignore and try direct result check next
    }
    try {
      const url = await fetchVideoUrlFromWaveSpeed(predictionId)
      if (url) return url
    } catch {}
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return undefined
}

function renderTemplate(input: string, params: Record<string, string>): string {
  let out = input
  for (const [k, v] of Object.entries(params)) {
    out = out.split(`{${k}}`).join(v)
  }
  return out
}

function getByJsonPointer(obj: any, pointer: string): any {
  if (!pointer || pointer === '/') return obj
  const parts = pointer.replace(/^\//, '').split('/')
  let cur = obj
  for (const raw of parts) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (cur && Object.prototype.hasOwnProperty.call(cur, key)) {
      cur = cur[key]
    } else {
      return undefined
    }
  }
  return cur
}

function safeStringify(obj: any): string {
  try { return JSON.stringify(obj) } catch { return String(obj) }
}
