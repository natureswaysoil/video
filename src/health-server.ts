import http from 'http'
import { resolveByJobId, markProcessed, isProcessed } from './webhook-cache'
import { postToTwitter } from './twitter'
import { postToYouTube } from './youtube'
import { postToInstagram } from './instagram'
import { postToPinterest } from './pinterest'
import { verifyWebhookSignatureWithPrefix } from './webhook-auth'

/** Allowed URL schemes and hostname patterns for incoming webhook video URLs (SSRF protection) */
const ALLOWED_VIDEO_URL_RE = /^https:\/\//i

function isAllowedVideoUrl(url: string): boolean {
  if (!ALLOWED_VIDEO_URL_RE.test(url)) return false
  try {
    const parsed = new URL(url)
    // Block private/link-local ranges
    const blocked = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fd[0-9a-f]{2}:)/i
    if (blocked.test(parsed.hostname)) return false
    return true
  } catch {
    return false
  }
}

const PORT = parseInt(process.env.PORT || '8080', 10)

let server: http.Server | null = null
let serverStarted = false

let lastRunStatus = {
  timestamp: new Date().toISOString(),
  status: 'starting',
  rowsProcessed: 0,
  successfulPosts: 0,
  failedPosts: 0,
  errors: [] as string[]
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  const isWebhook = req.url?.startsWith('/webhooks/')

  // CORS only for non-webhook browser-accessible endpoints
  if (!isWebhook) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.statusCode = 200
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'video-automation',
      version: '2.0.0',
      uptime: Math.floor(process.uptime()),
      uptimeFormatted: formatUptime(process.uptime()),
      timestamp: new Date().toISOString(),
      lastRun: lastRunStatus,
      env: {
        runOnce: process.env.RUN_ONCE === 'true',
        dryRun: process.env.DRY_RUN_LOG_ONLY === 'true',
        pollInterval: process.env.POLL_INTERVAL_MS || '60000'
      }
    }, null, 2))
  } else if (req.url === '/status' && req.method === 'GET') {
    res.statusCode = 200
    res.end(JSON.stringify(lastRunStatus, null, 2))
  } else if (req.url === '/' && req.method === 'GET') {
    res.statusCode = 200
    res.end(JSON.stringify({
      service: 'video-automation',
      status: 'running',
      endpoints: {
        health: '/health',
        status: '/status'
      }
    }, null, 2))
  } else if (req.url?.startsWith('/webhooks/pictory') && (req.method === 'POST' || req.method === 'GET')) {
    // Minimal webhook receiver to flip status or log render job completions
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const raw = Buffer.concat(chunks).toString('utf8')

      // Verify webhook signature if WEBHOOK_SECRET is configured
      const webhookSecret = process.env.WEBHOOK_SECRET
      if (!webhookSecret) {
        res.statusCode = 500
        return res.end(JSON.stringify({ ok: false, error: 'Webhook authentication is not configured' }))
      }
      const signature = (req.headers['x-signature'] || req.headers['x-pictory-signature'] || '') as string
      if (!signature || !verifyWebhookSignatureWithPrefix(raw, signature, webhookSecret)) {
        res.statusCode = 401
        return res.end(JSON.stringify({ ok: false, error: 'Invalid webhook signature' }))
      }

      let body: any = null
      try { body = raw ? JSON.parse(raw) : {} } catch { body = { raw } }
      console.log('📨 Pictory webhook received:', body)
      updateStatus({ status: 'webhook-received' })

      // Try to extract job id and video URL
      const data = body?.data || body || {}
      const jobId: string | undefined = data.job_id || data.renderJobId || data.id || body?.job_id
      const rawVideoUrl: string | undefined = data.videoUrl || data.url || data.video_url || body?.videoUrl

      // Validate video URL to prevent SSRF
      const videoUrl: string | undefined = rawVideoUrl && isAllowedVideoUrl(rawVideoUrl) ? rawVideoUrl : undefined
      if (rawVideoUrl && !videoUrl) {
        console.warn('⚠️ Webhook video URL rejected (not an allowed HTTPS URL):', rawVideoUrl)
      }
      if (!jobId) {
        console.log('⚠️ Pictory webhook missing job_id')
        res.statusCode = 200
        return res.end(JSON.stringify({ ok: true }))
      }
      const ctx = resolveByJobId(jobId)
      if (!ctx) {
        console.log('⚠️ No cached context for jobId:', jobId)
        res.statusCode = 200
        return res.end(JSON.stringify({ ok: true }))
      }
      if (isProcessed(jobId)) {
        console.log('ℹ️ Webhook already processed for jobId:', jobId)
        res.statusCode = 200
        return res.end(JSON.stringify({ ok: true }))
      }
      if (videoUrl) {
        try {
          const { writeColumnLetterValues } = await import('./sheets')
          const columnLetter = (process.env.SHEET_VIDEO_TARGET_COLUMN_LETTER || 'AB').toUpperCase()
          await writeColumnLetterValues({
            spreadsheetId: ctx.spreadsheetId,
            sheetGid: ctx.sheetGid,
            columnLetter,
            rows: [{ rowNumber: ctx.rowNumber, value: videoUrl }]
          })
          console.log('✅ Wrote video URL to sheet column', columnLetter)
        } catch (e: any) {
          console.error('❌ Failed writing video URL to sheet from webhook:', e?.message || e)
        }
      }

      // Post immediately (time window not enforced for webhooks)
      const caption = ctx.caption
      const enabledPlatforms = new Set((ctx.enabledPlatformsCsv || '').split(',').map((s: string) => s.trim()).filter(Boolean))
      const postTwitter = enabledPlatforms.size === 0 || enabledPlatforms.has('twitter')
      const postYouTube = enabledPlatforms.size === 0 || enabledPlatforms.has('youtube')
      const postInstagram = enabledPlatforms.size === 0 || enabledPlatforms.has('instagram')
      const postPinterest = enabledPlatforms.size === 0 || enabledPlatforms.has('pinterest')

      if (videoUrl) {
        if (postInstagram && process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
          try {
            await postToInstagram(videoUrl, caption, process.env.INSTAGRAM_ACCESS_TOKEN, process.env.INSTAGRAM_IG_ID)
            console.log('✅ Webhook: posted to Instagram')
          } catch (e: any) {
            console.error('❌ Webhook Instagram post failed:', e?.message || e)
          }
        }
        if (postPinterest && process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
          try {
            await postToPinterest(videoUrl, caption, process.env.PINTEREST_ACCESS_TOKEN, process.env.PINTEREST_BOARD_ID)
            console.log('✅ Webhook: posted to Pinterest')
          } catch (e: any) {
            console.error('❌ Webhook Pinterest post failed:', e?.message || e)
          }
        }
        if (postTwitter && (process.env.TWITTER_BEARER_TOKEN || (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET))) {
          try {
            await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN ?? '')
            console.log('✅ Webhook: posted to Twitter')
          } catch (e: any) {
            console.error('❌ Webhook Twitter post failed:', e?.message || e)
          }
        }
        if (postYouTube && process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
          try {
            await postToYouTube(
              videoUrl,
              caption,
              process.env.YT_CLIENT_ID,
              process.env.YT_CLIENT_SECRET,
              process.env.YT_REFRESH_TOKEN,
              (process.env.YT_PRIVACY_STATUS as any) || 'unlisted'
            )
            console.log('✅ Webhook: uploaded to YouTube')
          } catch (e: any) {
            console.error('❌ Webhook YouTube upload failed:', e?.message || e)
          }
        }
      }

      markProcessed(jobId)
      res.statusCode = 200
      res.end(JSON.stringify({ ok: true }))
    } catch (e: any) {
      console.error('❌ Webhook handler error:', e?.message || e)
      res.statusCode = 500
      res.end(JSON.stringify({ ok: false, error: 'Internal server error' }))
    }
  } else {
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'Not found' }))
  }
}

export function startHealthServer(): http.Server {
  if (server && serverStarted) {
    return server
  }
  const newServer = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    handleRequest(req, res).catch((err) => {
      console.error('❌ Unhandled request error:', err?.message || err)
      res.statusCode = 500
      res.end(JSON.stringify({ ok: false, error: 'Internal server error' }))
    })
  })
  server = newServer
  newServer.listen(PORT, () => {
    serverStarted = true
    console.log(`🏥 Health check server running on port ${PORT}`)
    console.log(`   GET http://localhost:${PORT}/health`)
    console.log(`   GET http://localhost:${PORT}/status`)
  })
  return newServer
}

export async function stopHealthServer(): Promise<void> {
  if (!server || !serverStarted) return
  await new Promise<void>((resolve, reject) => {
    server!.close((err: Error | undefined) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
  server = null
  serverStarted = false
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${secs}s`)
  
  return parts.join(' ')
}

export function updateStatus(update: Partial<typeof lastRunStatus>) {
  lastRunStatus = {
    ...lastRunStatus,
    ...update,
    timestamp: new Date().toISOString()
  }
}

export function incrementSuccessfulPost() {
  lastRunStatus.successfulPosts++
}

export function incrementFailedPost() {
  lastRunStatus.failedPosts++
}

export function addError(error: string) {
  lastRunStatus.errors.push(error)
  // Keep only last 20 errors
  if (lastRunStatus.errors.length > 20) {
    lastRunStatus.errors = lastRunStatus.errors.slice(-20)
  }
}
