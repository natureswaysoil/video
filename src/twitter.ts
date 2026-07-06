import axios from 'axios'
import { TwitterApi } from 'twitter-api-v2'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'
import { getMemoryUsage } from './memory-manager'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()

// Maximum video size for Twitter (500MB)
const MAX_VIDEO_SIZE_MB = 500

function twitterText(caption: string, url?: string): string {
  const base = String(caption || '').trim()
  const link = String(url || '').trim()
  const text = link && !base.includes(link) ? `${base}\n${link}` : base
  return text.slice(0, 275)
}

function hasOAuth1TwitterCreds(): boolean {
  return Boolean(
    process.env.TWITTER_API_KEY &&
      process.env.TWITTER_API_SECRET &&
      process.env.TWITTER_ACCESS_TOKEN &&
      process.env.TWITTER_ACCESS_SECRET
  )
}

async function postTextWithOAuth1(text: string): Promise<string> {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY as string,
    appSecret: process.env.TWITTER_API_SECRET as string,
    accessToken: process.env.TWITTER_ACCESS_TOKEN as string,
    accessSecret: process.env.TWITTER_ACCESS_SECRET as string,
  })

  const result = await client.readWrite.v2.tweet(text.slice(0, 275))
  return result.data.id
}

/** Posts a text/link-only tweet. Prefer OAuth 1.0a user context because app-only bearer auth cannot post. */
export async function postTextToTwitter(text: string, bearerToken?: string): Promise<string> {
  const config = getConfig()
  const safeText = twitterText(text)

  if (!safeText) {
    throw new AppError('Missing text for Twitter post', ErrorCode.VALIDATION_ERROR, 400, true)
  }

  if (hasOAuth1TwitterCreds()) {
    return rateLimiters.execute('twitter', async () => {
      return withRetry(
        async () => postTextWithOAuth1(safeText),
        {
          maxRetries: 2,
          retryIf: (error) => {
            const s = (error as any)?.response?.status ?? (error as any)?.data?.status ?? (error as any)?.code
            if (s === 401 || s === 402 || s === 403) return false
            return true
          },
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

  if (!bearerToken) {
    throw new AppError(
      'Twitter OAuth 1.0a credentials missing and bearer token not provided',
      ErrorCode.MISSING_CONFIG,
      500
    )
  }

  return rateLimiters.execute('twitter', async () => {
    return withRetry(
      async () => {
        const res = await axios.post(
          'https://api.twitter.com/2/tweets',
          { text: safeText },
          {
            headers: { Authorization: `Bearer ${bearerToken}` },
            timeout: config.TIMEOUT_SOCIAL_POST,
          }
        )
        return String(res.data?.data?.id ?? '')
      },
      {
        maxRetries: 2,
        retryIf: (error) => {
          // 403 = app-only bearer token cannot write tweets; retrying always fails.
          const s = (error as any)?.response?.status ?? (error as any)?.data?.status
          if (s === 401 || s === 402 || s === 403) return false
          return true
        },
        onRetry: (error, attempt) => {
          logger.warn('Retrying Twitter bearer text post', 'Twitter', {
            attempt,
            error: error instanceof Error ? error.message : String(error),
          })
        },
      }
    )
  })
}

/**
 * Posts to Twitter/X.
 * If OAuth 1.0a credentials are present, tries to upload the video and post a media tweet.
 * If X blocks the media upload/API tier, falls back to a normal text/link tweet so traffic does not stop.
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

    const canUpload = hasOAuth1TwitterCreds()

    logger.info('Posting to Twitter', 'Twitter', {
      canUpload,
      captionLength: caption.length,
    })

    let postId = ''

    if (canUpload) {
      postId = await rateLimiters.execute('twitter', async () => {
        return withRetry(
          async () => {
            const client = new TwitterApi({
              appKey: process.env.TWITTER_API_KEY as string,
              appSecret: process.env.TWITTER_API_SECRET as string,
              accessToken: process.env.TWITTER_ACCESS_TOKEN as string,
              accessSecret: process.env.TWITTER_ACCESS_SECRET as string,
            })
            const rwClient = client.readWrite

            try {
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

              // Upload media
              logger.debug('Uploading video to Twitter', 'Twitter')
              const mediaId = await rwClient.v1.uploadMedia(Buffer.from(resp.data), {
                mimeType: 'video/mp4',
              } as any)

              // Post tweet with media
              logger.debug('Posting tweet with media', 'Twitter')
              const tweetResult = await rwClient.v2.tweet({
                text: caption,
                media: { media_ids: [mediaId] },
              })

              logger.debug('Tweet posted successfully with media', 'Twitter')
              return tweetResult.data.id
            } catch (mediaError: any) {
              const status = mediaError?.response?.status ?? mediaError?.data?.status ?? mediaError?.code
              logger.warn('Twitter video upload failed; falling back to text/link tweet', 'Twitter', {
                status,
                message: mediaError?.message || String(mediaError),
              })

              const fallbackText = twitterText(caption, videoUrl)
              const textResult = await rwClient.v2.tweet(fallbackText)
              logger.info('Posted Twitter fallback text/link tweet', 'Twitter')
              return textResult.data.id
            }
          },
          {
            maxRetries: 2,
            retryIf: (error) => {
              if (error instanceof AppError && error.code === ErrorCode.VALIDATION_ERROR) return false
              const s = (error as any)?.response?.status ?? (error as any)?.data?.status
              if (s === 401 || s === 402 || s === 403) return false
              return true
            },
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
      // Fallback to text-only post. Bearer app-only auth normally cannot write tweets, but keep this for older configs.
      postId = await postTextToTwitter(twitterText(caption, videoUrl), bearerToken)
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
