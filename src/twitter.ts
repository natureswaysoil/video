import axios from 'axios'
import { TwitterApi } from 'twitter-api-v2'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'
import { getMemoryUsage } from './memory-manager'
import { addSecretVersion } from './secret-manager'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()

// Maximum video size for Twitter (500MB)
const MAX_VIDEO_SIZE_MB = 500
const MAX_TWEET_LENGTH = 280

function fitTweetText(value: string): string {
  const text = value.trim()
  if (text.length <= MAX_TWEET_LENGTH) return text
  return `${text.slice(0, MAX_TWEET_LENGTH - 3).trimEnd()}...`
}

async function createTwitterUserClient(): Promise<TwitterApi> {
  const clientId = process.env.TWITTER_CLIENT_ID?.trim()
  const clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim()
  const refreshToken = process.env.TWITTER_REFRESH_TOKEN?.trim()

  if (clientId && clientSecret && refreshToken) {
    const oauthClient = new TwitterApi({ clientId, clientSecret })
    const refreshed = await oauthClient.refreshOAuth2Token(refreshToken)

    logger.info('Refreshed Twitter OAuth 2.0 user authorization', 'Twitter', {
      scopes: refreshed.scope,
    })

    if (refreshed.refreshToken && refreshed.refreshToken !== refreshToken) {
      await addSecretVersion('TWITTER_REFRESH_TOKEN', refreshed.refreshToken)
      logger.info('Stored rotated Twitter refresh token', 'Twitter')
    }

    return refreshed.client
  }

  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY as string,
    appSecret: process.env.TWITTER_API_SECRET as string,
    accessToken: process.env.TWITTER_ACCESS_TOKEN as string,
    accessSecret: process.env.TWITTER_ACCESS_SECRET as string,
  })
}

export function getTwitterErrorStatus(error: unknown): number | undefined {
  const candidate =
    (error as any)?.response?.status ??
    (error as any)?.data?.status ??
    (error as any)?.code
  const status = Number(candidate)
  return Number.isFinite(status) ? status : undefined
}

export function isRetryableTwitterError(error: unknown): boolean {
  if (error instanceof AppError && error.code === ErrorCode.VALIDATION_ERROR) {
    return false
  }

  const status = getTwitterErrorStatus(error)
  if (status === undefined) return true
  if (status === 429) return true
  return status >= 500
}

/**
 * Posts to Twitter/X.
 * If OAuth 1.0a credentials are present (env), uploads the video and posts a tweet with the media.
 * Otherwise, falls back to a simple text tweet (caption + URL) using Bearer token.
 */
export async function postToTwitter(
  videoUrl: string,
  caption: string,
  bearerToken?: string
): Promise<string> {
  const startTime = Date.now()

  try {
    const config = getConfig()

    if (!videoUrl || !caption) {
      throw new AppError(
        'Missing required parameters for Twitter posting',
        ErrorCode.VALIDATION_ERROR,
        400,
        true,
        { hasVideoUrl: !!videoUrl, hasCaption: !!caption }
      )
    }

    const hasOAuth2User = Boolean(
      process.env.TWITTER_CLIENT_ID &&
        process.env.TWITTER_CLIENT_SECRET &&
        process.env.TWITTER_REFRESH_TOKEN
    )
    const hasOAuth1User = Boolean(
      process.env.TWITTER_API_KEY &&
        process.env.TWITTER_API_SECRET &&
        process.env.TWITTER_ACCESS_TOKEN &&
        process.env.TWITTER_ACCESS_SECRET
    )
    const canUpload = hasOAuth2User || hasOAuth1User

    logger.info('Posting to Twitter', 'Twitter', {
      canUpload,
      authMode: hasOAuth2User ? 'oauth2-user' : hasOAuth1User ? 'oauth1-user' : 'bearer',
      captionLength: caption.length,
    })

    let postId = ''

    if (canUpload) {
      postId = await rateLimiters.execute('twitter', async () => {
        return withRetry(
          async () => {
            const client = await createTwitterUserClient()
            const rwClient = client.readWrite

            // Check memory before downloading video
            const memoryBefore = getMemoryUsage()
            logger.debug('Memory before video download', 'Twitter', {
              heapUsedMB: memoryBefore.heapUsedMB,
            })

            // Check video size before downloading
            try {
              const headResponse = await axios.head(videoUrl)
              const contentLength = parseInt(String(headResponse.headers['content-length'] || '0'), 10)
              const sizeMB = contentLength / (1024 * 1024)

              if (sizeMB > MAX_VIDEO_SIZE_MB) {
                throw new AppError(
                  `Video too large for Twitter: ${sizeMB.toFixed(2)}MB (max ${MAX_VIDEO_SIZE_MB}MB)`,
                  ErrorCode.VALIDATION_ERROR,
                  400,
                  true,
                  { videoSizeMB: sizeMB, maxSizeMB: MAX_VIDEO_SIZE_MB }
                )
              }

              logger.debug('Video size check', 'Twitter', { sizeMB: sizeMB.toFixed(2) })
            } catch (error) {
              // If HEAD request fails, continue anyway (some servers don't support HEAD)
              logger.warn('Could not check video size', 'Twitter', {}, error)
            }

            // Download the video file into memory for upload
            logger.debug('Downloading video for Twitter upload', 'Twitter')
            const resp = await axios.get<ArrayBuffer>(videoUrl, {
              responseType: 'arraybuffer',
              timeout: config.TIMEOUT_SOCIAL_POST,
              maxContentLength: MAX_VIDEO_SIZE_MB * 1024 * 1024,
            })

            const memoryAfter = getMemoryUsage()
            const memoryUsedMB = memoryAfter.heapUsedMB - memoryBefore.heapUsedMB
            logger.debug('Video downloaded', 'Twitter', {
              heapUsedMB: memoryAfter.heapUsedMB,
              memoryUsedForVideoMB: memoryUsedMB,
            })

            // X's pay-per-use platform exposes media upload through API v2.
            // The former v1.1 upload endpoint can return 403 even when the app
            // has valid read/write credentials and a funded credit balance.
            logger.debug('Uploading video to Twitter with API v2', 'Twitter')
            const mediaId = await rwClient.v2.uploadMedia(Buffer.from(resp.data), {
              media_type: 'video/mp4',
              media_category: 'tweet_video',
            })

            // Post tweet with media
            logger.debug('Posting tweet', 'Twitter')
            const tweetText = fitTweetText(caption)
            const tweetResult = await rwClient.v2.tweet({
              text: tweetText,
              media: { media_ids: [mediaId] },
            })

            logger.debug('Tweet posted successfully', 'Twitter')
            return tweetResult.data.id
          },
          {
            maxRetries: 3,
            retryIf: isRetryableTwitterError,
            onRetry: (error, attempt) => {
              logger.warn('Retrying Twitter post', 'Twitter', {
                attempt,
                error: error instanceof Error ? error.message : String(error),
              })
            },
          }
        )
      })
    } else {
      // Fallback to bearer token (text only)
      if (!bearerToken) {
        throw new AppError(
          'Twitter bearer token missing and upload credentials not provided',
          ErrorCode.MISSING_CONFIG,
          500
        )
      }

      postId = await rateLimiters.execute('twitter', async () => {
        return withRetry(
          async () => {
            const res = await axios.post(
              'https://api.twitter.com/2/tweets',
              { text: `${caption}\n${videoUrl}` },
              {
                headers: { Authorization: `Bearer ${bearerToken}` },
                timeout: config.TIMEOUT_SOCIAL_POST,
              }
            )
            return String(res.data?.data?.id ?? '')
          },
          {
            maxRetries: 3,
            retryIf: isRetryableTwitterError,
            onRetry: (error, attempt) => {
              logger.warn('Retrying Twitter text post', 'Twitter', {
                attempt,
                error: error instanceof Error ? error.message : String(error),
              })
            },
          }
        )
      })
    }

    const duration = Date.now() - startTime
    metrics.incrementCounter('twitter.success')
    metrics.recordHistogram('twitter.duration', duration)

    logger.info('Successfully posted to Twitter', 'Twitter', { duration })
    return postId
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('twitter.error')
    metrics.recordHistogram('twitter.error_duration', duration)

    logger.error('Failed to post to Twitter', 'Twitter', { duration }, error)

    if (error instanceof AppError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      throw fromAxiosError(error, ErrorCode.TWITTER_API_ERROR, {
        videoUrl,
      })
    }

    throw new AppError(
      `Twitter posting failed: ${error.message || String(error)}`,
      ErrorCode.TWITTER_API_ERROR,
      500,
      true,
      {},
      error instanceof Error ? error : undefined
    )
  }
}
