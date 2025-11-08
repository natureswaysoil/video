import 'dotenv/config'
import http from 'http'
import { processCsvUrl } from './core'
import { postToInstagram } from './instagram'
import { postToTwitter } from './twitter'
import { postToPinterest } from './pinterest'

async function runJob() {
  const csvUrl = process.env.CSV_URL as string
  if (!csvUrl) throw new Error('CSV_URL not set in .env')
  
  const result = await processCsvUrl(csvUrl)
  if (result.skipped) {
    console.log('No valid product found in sheet.');
    return { success: false, message: 'No valid product found' };
  }
  
  const { product, jobId } = result
  const videoUrl = jobId ? `https://wavespeed.ai/jobs/${jobId}/video.mp4` : undefined
  const caption = product.details || product.title || product.name
  const results: string[] = []

  if (videoUrl) {
    if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
      await postToInstagram(videoUrl, caption, process.env.INSTAGRAM_ACCESS_TOKEN, process.env.INSTAGRAM_IG_ID)
      results.push('Posted to Instagram')
    }
    if (process.env.TWITTER_BEARER_TOKEN) {
      await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN)
      results.push('Posted to Twitter')
    }
    if (process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
      await postToPinterest(videoUrl, caption, process.env.PINTEREST_ACCESS_TOKEN, process.env.PINTEREST_BOARD_ID)
      results.push('Posted to Pinterest')
    }
  } else {
    results.push('No video URL found')
  }

  return { success: true, results }
}

const server = http.createServer(async (req, res) => {
  // Health check endpoint
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('OK')
    return
  }

  // Job trigger endpoint
  if (req.url === '/run' && req.method === 'POST') {
    try {
      const result = await runJob()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      console.error('Job error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: String(error) }))
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
})

const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
