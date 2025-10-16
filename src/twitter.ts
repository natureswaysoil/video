import axios from 'axios'
import { TwitterApi } from 'twitter-api-v2'

// Posts to Twitter/X.
// If OAuth 1.0a credentials are present (env), uploads the video and posts a tweet with the media.
// Otherwise, falls back to a simple text tweet (caption + URL) using Bearer token.
export async function postToTwitter(videoUrl: string, caption: string, bearerToken?: string): Promise<void> {
  const canUpload = Boolean(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET)
  if (canUpload) {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY as string,
      appSecret: process.env.TWITTER_API_SECRET as string,
      accessToken: process.env.TWITTER_ACCESS_TOKEN as string,
      accessSecret: process.env.TWITTER_ACCESS_SECRET as string,
    })
    const rwClient = client.readWrite
    // Download the video file into memory for upload
    const resp = await axios.get<ArrayBuffer>(videoUrl, { responseType: 'arraybuffer' })
    const mediaId = await rwClient.v1.uploadMedia(Buffer.from(resp.data), { type: 'video/mp4' })
    await rwClient.v2.tweet({ text: caption, media: { media_ids: [mediaId] } })
    return
  }
  if (!bearerToken) throw new Error('Twitter bearer token missing and upload credentials not provided')
  await axios.post(
    'https://api.twitter.com/2/tweets',
    { text: `${caption}\n${videoUrl}` },
    { headers: { 'Authorization': `Bearer ${bearerToken}` } }
  )
}