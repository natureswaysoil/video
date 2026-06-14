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

function statusCode(error: any): number | undefined {
  return error?.response?.status ?? error?.data?.status ?? error?.code
}

function twitterForbiddenMessage(error: any): string {
  return error?.data?.detail || error?.response?.data?.detail || error?.message || String(error)
}

async function postTextTweetWithUrl(caption: string, videoUrl: string, bearerToken?: string): Promise<string> {
  const config = getConfig()
  const text = `${caption}\n${videoUrl}`.slice(0, 275)

  if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET) {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY as string,
      appSecret: process.env.TWITTER_API_SECRET as string,
      accessToken: process.env.TWITTER_ACCESS_TOKEN as string,
      accessSecret: process.env.TWITTER_ACCESS_SECRET as string,
    })
    const tweetResult = await client.readWrite.v2.tweet(text)
    return tweetResult.data.id
  }

  if (!bearerToken) {
    throw new AppError(
      'Twitter bearer token missing and upload credentials not provided',
      ErrorCode.MISSING_CONFIG,
      500
    )
  }

  const res = await axios.post(
    'https://api.twitter.com/2/tweets',
    { text },
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      timeout: config.TIMEOUT_SOCIAL_POST,
    }
  )
  return String(res.data?.data?.id ?? '')
}

/**
 * Posts to Twitter/X.
 * If OAuth 1.0a credentials are present, tries video upload first.
 * If X rejects media upload with 403, falls back to a link tweet so the run can still post.
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

    const canUpload = Boolean(
      process.env.TWITTER_API_KEY &&
        process.env.TWITTER_API_SECRET &&
        process.env.TWITTER_ACCESS_TOKEN &&
        process.env.TWITTER_ACCESS_SECRET
    )

    logger.info('Posting to Twitter', 'Twitter', {
      canUpload,
      captionLength: caption.length,
    })

    let postId = ''

    if (canUpload) {
      try {
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

              const memoryBefore = getMemoryUsage()
              logger.debug('Memory before video download', 'Twitter', {
                heapUsedMB: memoryBefore.heapUsedMB,
              })

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
                logger.warn('Could not check video size', 'Twitter', {}, error)
              }

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

              logger.debug('Uploading video to Twitter', 'Twitter')
              const mediaId = await rwClient.v1.uploadMedia(Buffer.from(resp.data), {
                mimeType: 'video/mp4',
              })

              logger.debug('Posting tweet', 'Twitter')
              const tweetResult = await rwClient.v2.tweet({
                text: caption,
                media: { media_ids: [mediaId] },
              })

              logger.debug('Tweet posted successfully', 'Twitter')
              return tweetResult.data.id
            },
            {
              maxRetries: 3,
              retryIf: (error) => {
                if (error instanceof AppError && error.code === ErrorCode.VALIDATION_ERROR) return false
                const s = statusCode(error)
                if (s === 403) return false
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
      } catch (uploadError: any) {
        if (statusCode(uploadError) === 403) {
          logger.warn('Twitter video upload forbidden; falling back to link tweet', 'Twitter', {
            reason: twitterForbiddenMessage(uploadError),
          })
          postId = await rateLimiters.execute('twitter', async () => postTextTweetWithUrl(caption, videoUrl, bearerToken))
        } else {
          throw uploadError
        }
      }
    } else {
      postId = await rateLimiters.execute('twitter', async () => {
        return withRetry(
          async () => postTextTweetWithUrl(caption, videoUrl, bearerToken),
          {
            maxRetries: 3,
            retryIf: (error) => {
              const s = statusCode(error)
              if (s === 403) return false
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
