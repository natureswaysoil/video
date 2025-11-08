import 'dotenv/config'
import { processCsvUrl } from './core'
import { postToInstagram } from './instagram'
import { postToTwitter } from './twitter'
import { postToPinterest } from './pinterest'

async function main() {
  const csvUrl = process.env.CSV_URL as string
  if (!csvUrl) throw new Error('CSV_URL not set in .env')
  
  const result = await processCsvUrl(csvUrl)
  if (result.skipped) {
    console.log('No valid product found in sheet.');
    return;
  }
  
  const { product, jobId } = result
  const videoUrl = jobId ? `https://wavespeed.ai/jobs/${jobId}/video.mp4` : undefined
  const caption = product.details || product.title || product.name || ''

  if (videoUrl) {
    if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
      await postToInstagram(videoUrl, caption, process.env.INSTAGRAM_ACCESS_TOKEN, process.env.INSTAGRAM_IG_ID)
      console.log('Posted to Instagram')
    }
    if (process.env.TWITTER_BEARER_TOKEN) {
      await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN)
      console.log('Posted to Twitter')
    }
    if (process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
      await postToPinterest(videoUrl, caption, process.env.PINTEREST_ACCESS_TOKEN, process.env.PINTEREST_BOARD_ID)
      console.log('Posted to Pinterest')
    }
  } else {
    console.log('No video URL found')
  }
}

main().catch(e => console.error(e))