import { automaticXPostingAllowed, MANUAL_X_POSTING_REASON } from '../../src/x-posting-policy'
import axios from 'axios'
import { google } from 'googleapis'
import { publishFundedXVideo } from '../../src/x-funded-publisher'
import { waitForTikTokPublish } from './tiktok-publish-status'

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

// Paid X publishing uses only the funded consumer-key app and verifies the account.
export async function postToTwitter(videoFileOrUrl: string, caption: string) {
  if (!automaticXPostingAllowed()) return { skipped: true, reason: MANUAL_X_POSTING_REASON }
  return publishFundedXVideo(videoFileOrUrl, caption)
}

export async function postToTikTok(videoUrl: string, caption: string) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN
  if (!accessToken) {
    console.log('TikTok posting skipped: missing TIKTOK_ACCESS_TOKEN')
    return { skipped: true, reason: 'Missing TIKTOK_ACCESS_TOKEN' }
  }
  if (!/^https?:\/\//i.test(videoUrl)) throw new Error('TikTok posting requires a public HTTPS video URL')

  const host = process.env.TIKTOK_API_HOST || 'open.tiktokapis.com'
  const init = await axios.post(`https://${host}/v2/post/publish/video/init/`, {
    post_info: { title: caption.slice(0, 2200), privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
    source_info: { source: 'PULL_FROM_URL', video_url: videoUrl }
  }, { headers: { Authorization: 'Bearer ' + accessToken }, timeout: 120000 })

  const publishId = init.data?.data?.publish_id || init.data?.publish_id || ''
  if (!publishId) throw new Error(`TikTok init failed: ${JSON.stringify(init.data)}`)

  return waitForTikTokPublish(publishId, async () => {
    const response = await axios.post(`https://${host}/v2/post/publish/status/fetch/`, {
      publish_id: publishId
    }, { headers: { Authorization: 'Bearer ' + accessToken }, timeout: 30000 })
    const error = response.data?.error
    if (error?.code && error.code !== 'ok') throw new Error(`TikTok status failed: ${error.code} ${error.message || ''}`)
    return response.data?.data || {}
  })
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
