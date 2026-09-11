import axios from 'axios'
import { google } from 'googleapis'
import { TwitterApi } from 'twitter-api-v2'
import { addSecretVersion } from '../../src/secret-manager'
import { twitterAuthMode } from './twitter-auth'

export { twitterAuthMode } from './twitter-auth'

function pickEnv(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

function apiError(error: any): string {
  const status = error?.response?.status
  const body = error?.response?.data
  const detail = body?.error?.message || body?.message || error?.message || String(error)
  return status ? `HTTP ${status}: ${detail}` : detail
}

// ---------------------------------------------------------------------------
// Twitter / X video posting via twitter-api-v2. OAuth 2.0 user authorization
// is preferred because its access token is refreshed automatically. Rotated
// refresh tokens are written back to Google Secret Manager. OAuth 1.0a remains
// available as a fallback.
// ---------------------------------------------------------------------------
function createTwitterOAuth1Client(): TwitterApi {
  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY as string,
    appSecret: process.env.TWITTER_API_SECRET as string,
    accessToken: process.env.TWITTER_ACCESS_TOKEN as string,
    accessSecret: (process.env.TWITTER_ACCESS_TOKEN_SECRET || process.env.TWITTER_ACCESS_SECRET) as string
  })
}

async function createTwitterUserClient(): Promise<{ client: TwitterApi, authMode: 'oauth2-user' | 'oauth1-user' }> {
  const mode = twitterAuthMode()
  if (mode === 'oauth2-user') {
    const currentRefreshToken = process.env.TWITTER_REFRESH_TOKEN!.trim()
    try {
      const oauthClient = new TwitterApi({
        clientId: process.env.TWITTER_CLIENT_ID!.trim(),
        clientSecret: process.env.TWITTER_CLIENT_SECRET!.trim()
      })
      const refreshed = await oauthClient.refreshOAuth2Token(currentRefreshToken)
      console.log('Refreshed Twitter OAuth 2.0 user authorization', { scopes: refreshed.scope })

      if (refreshed.refreshToken && refreshed.refreshToken !== currentRefreshToken) {
        process.env.TWITTER_REFRESH_TOKEN = refreshed.refreshToken
        try {
          await addSecretVersion('TWITTER_REFRESH_TOKEN', refreshed.refreshToken)
          console.log('Stored rotated Twitter refresh token in Secret Manager')
        } catch (error: any) {
          console.warn('Could not persist rotated Twitter refresh token; continuing with refreshed access token:', error?.message || String(error))
        }
      }
      return { client: refreshed.client, authMode: 'oauth2-user' }
    } catch (error: any) {
      const hasOAuth1Fallback = twitterAuthMode({
        ...process.env,
        TWITTER_CLIENT_ID: '',
        TWITTER_CLIENT_SECRET: '',
        TWITTER_REFRESH_TOKEN: ''
      }) === 'oauth1-user'
      if (!hasOAuth1Fallback) throw error
      console.warn('Twitter OAuth 2.0 refresh failed; falling back to OAuth 1.0a:', error?.message || String(error))
    }
  }
  return { client: createTwitterOAuth1Client(), authMode: 'oauth1-user' }
}

export async function postToTwitter(videoFileOrUrl: string, caption: string) {
  if (twitterAuthMode() === 'none') {
    console.log('Twitter posting skipped: missing OAuth 2.0 refresh credentials and OAuth 1.0a fallback credentials')
    return { skipped: true }
  }

  // Resolve to a local file path; download if a URL was passed.
  let localPath = videoFileOrUrl
  let cleanup = false
  if (/^https?:\/\//i.test(videoFileOrUrl)) {
    const fs = await import('fs')
    const os = await import('os')
    const path = await import('path')
    const tmp = path.join(os.tmpdir(), `tw-${Date.now()}.mp4`)
    const resp = await axios.get(videoFileOrUrl, { responseType: 'arraybuffer', timeout: 180000 })
    fs.writeFileSync(tmp, Buffer.from(resp.data))
    localPath = tmp
    cleanup = true
  }

  try {
    const { client, authMode } = await createTwitterUserClient()
    const rwClient = client.readWrite
    let mediaId: string
    const fsBuf = await import('fs')
    const buf = fsBuf.readFileSync(localPath)
    try {
      mediaId = await rwClient.v2.uploadMedia(buf, { media_type: 'video/mp4', media_category: 'tweet_video' })
    } catch (error: any) {
      if (authMode !== 'oauth1-user') throw error
      console.warn('Twitter API v2 media upload failed; trying OAuth 1.0a v1.1 upload:', error?.message || String(error))
      mediaId = await rwClient.v1.uploadMedia(localPath, { mimeType: 'video/mp4', target: 'tweet' })
    }
    const { data } = await rwClient.v2.tweet({ text: String(caption || '').slice(0, 280), media: { media_ids: [mediaId] } })
    const tweetId = data?.id
    if (!tweetId) throw new Error('Twitter did not return a tweet id')
    return { platform: 'twitter', tweetId, mediaId, authMode }
  } finally {
    if (cleanup) { try { (await import('fs')).unlinkSync(localPath) } catch {} }
  }
}

export async function postToTikTok(videoUrl: string, caption: string) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN
  const openId = process.env.TIKTOK_OPEN_ID
  if (!accessToken || !openId) {
    console.log('TikTok posting skipped: missing TIKTOK_ACCESS_TOKEN or TIKTOK_OPEN_ID')
    return { skipped: true }
  }
  if (!/^https?:\/\//i.test(videoUrl)) throw new Error('TikTok posting requires a public HTTPS video URL')

  const host = process.env.TIKTOK_API_HOST || 'open.tiktokapis.com'
  const init = await axios.post(`https://${host}/v2/post/publish/video/init/`, {
    post_info: { title: caption.slice(0, 2200), privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
    source_info: { source: 'PULL_FROM_URL', video_url: videoUrl }
  }, { headers: { Authorization: 'Bearer ' + accessToken }, timeout: 120000 })

  const publishId = init.data?.data?.publish_id || init.data?.publish_id || ''
  if (!publishId) throw new Error(`TikTok init failed: ${JSON.stringify(init.data)}`)

  return { platform: 'tiktok', publishId, status: init.data?.data?.status || init.data?.status || 'submitted' }
}

export async function postToFacebookReels(videoUrl: string, caption: string) {
  if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN || !process.env.FACEBOOK_PAGE_ID) {
    console.log('Facebook Reels skipped: missing page credentials')
    return { skipped: true }
  }
  return { platform: 'facebook_reels', queued: true, videoUrl, caption }
}

export async function autoReplyTemplates() {
  return [
    'Thanks for checking out Nature\'s Way Soil.',
    'We appreciate the support.',
    'Let us know if you have application questions.',
    'Thanks for supporting a small family business.'
  ]
}

export async function fetchBasicMetrics(videoIds: { youtubeId?: string, instagramId?: string, facebookId?: string }) {
  const metrics: any = {
    youtube: { views: 0, likes: 0, comments: 0 },
    instagram: { views: 0, likes: 0, comments: 0, reach: 0 },
    facebook: { views: 0, likes: 0, comments: 0 }
  }
  if (videoIds.youtubeId) {
    try {
      const clientId = pickEnv(['YT_CLIENT_ID', 'YOUTUBE_CLIENT_ID'])
      const clientSecret = pickEnv(['YT_CLIENT_SECRET', 'YOUTUBE_CLIENT_SECRET'])
      const refreshToken = pickEnv(['YT_REFRESH_TOKEN', 'YOUTUBE_REFRESH_TOKEN'])
      if (clientId && clientSecret && refreshToken) {
        const oauth2Client = new google.auth.OAuth2({ clientId, clientSecret })
        oauth2Client.setCredentials({ refresh_token: refreshToken })
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
        const response = await youtube.videos.list({ part: ['statistics'], id: [videoIds.youtubeId] })
        const stats = response.data.items?.[0]?.statistics
        metrics.youtube = { views: Number(stats?.viewCount || 0), likes: Number(stats?.likeCount || 0), comments: Number(stats?.commentCount || 0) }
      }
    } catch (error: any) { metrics.youtube.error = error?.message || String(error) }
  }
  if (videoIds.instagramId && process.env.INSTAGRAM_ACCESS_TOKEN) {
    try {
      const apiVersion = process.env.INSTAGRAM_API_VERSION || 'v20.0'
      const host = process.env.INSTAGRAM_API_HOST || 'graph.facebook.com'
      const response = await axios.get(`https://${host}/${apiVersion}/${videoIds.instagramId}`, {
        params: { fields: 'like_count,comments_count' },
        headers: { Authorization: 'Bearer ' + process.env.INSTAGRAM_ACCESS_TOKEN }, timeout: 60000
      })
      metrics.instagram.likes = Number(response.data?.like_count || 0)
      metrics.instagram.comments = Number(response.data?.comments_count || 0)

      try {
        const insights = await axios.get(`https://${host}/${apiVersion}/${videoIds.instagramId}/insights`, {
          params: { metric: 'views,reach' },
          headers: { Authorization: 'Bearer ' + process.env.INSTAGRAM_ACCESS_TOKEN }, timeout: 60000
        })
        for (const item of insights.data?.data || []) {
          if (item.name === 'views') metrics.instagram.views = Number(item.values?.[0]?.value || item.total_value?.value || 0)
          if (item.name === 'reach') metrics.instagram.reach = Number(item.values?.[0]?.value || item.total_value?.value || 0)
        }
      } catch (error: any) {
        metrics.instagram.insightsError = apiError(error)
      }
    } catch (error: any) { metrics.instagram.error = apiError(error) }
  }
  if (videoIds.facebookId) {
    try {
      const accessToken = pickEnv(['FB_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN'])
      if (accessToken) {
        const apiVersion = process.env.FACEBOOK_API_VERSION || process.env.INSTAGRAM_API_VERSION || 'v20.0'
        const host = process.env.FACEBOOK_API_HOST || 'graph.facebook.com'
        const summary = await axios.get(`https://${host}/${apiVersion}/${videoIds.facebookId}`, {
          params: { fields: 'reactions.summary(true),comments.summary(true)' },
          headers: { Authorization: 'Bearer ' + accessToken }, timeout: 60000
        })
        metrics.facebook.likes = Number(summary.data?.reactions?.summary?.total_count || 0)
        metrics.facebook.comments = Number(summary.data?.comments?.summary?.total_count || 0)
      }
    } catch (error: any) { metrics.facebook.error = apiError(error) }
  }
  return metrics
}
