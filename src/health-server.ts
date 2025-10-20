import http from 'http'
import { resolveByJobId, markProcessed, isProcessed } from './webhook-cache'
import { postToTwitter } from './twitter'
import { postToYouTube } from './youtube'
import { postToInstagram } from './instagram'
import { postToPinterest } from './pinterest'

const PORT = parseInt(process.env.PORT || '8080', 10)

let lastRunStatus = {
  timestamp: new Date().toISOString(),
  status: 'starting',
  rowsProcessed: 0,
  successfulPosts: 0,
  failedPosts: 0,
  errors: [] as string[]
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  
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
      let body: any = null
      try { body = raw ? JSON.parse(raw) : {} } catch { body = { raw } }
      console.log('📨 Pictory webhook received:', body)
      updateStatus({ status: 'webhook-received' })

      // Try to extract job id and video URL
      const data = body?.data || body || {}
      const jobId: string | undefined = data.job_id || data.renderJobId || data.id || body?.job_id
      const videoUrl: string | undefined = data.videoUrl || data.url || data.video_url || body?.videoUrl
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
      const enabledPlatforms = new Set((ctx.enabledPlatformsCsv || '').split(',').map((s) => s.trim()).filter(Boolean))
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
      res.statusCode = 500
      res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }))
    }
  } else {
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'Not found' }))
  }
})

server.listen(PORT, () => {
  console.log(`🏥 Health check server running on port ${PORT}`)
  console.log(`   GET http://localhost:${PORT}/health`)
  console.log(`   GET http://localhost:${PORT}/status`)
})

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
