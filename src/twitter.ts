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

/**
 * Posts to Twitter/X.
 * If OAuth 1.0a credentials are present (env), uploads the video and posts a tweet with the media.
 * Otherwise, falls back to a simple text tweet (caption + URL) using Bearer token.
 */
export async function postToTwitter(
  videoUrl: string,
  caption: string,
  bearerToken?: string
): Promise<void> {
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

    if (canUpload) {
      await rateLimiters.execute('twitter', async () => {
        return withRetry(
          async () => {
            const client = new TwitterApi({
              appKey: process.env.TWITTER_API_KEY as string,
              appSecret: process.env.TWITTER_API_SECRET as string,
              accessToken: process.env.TWITTER_ACCESS_TOKEN as string,
              accessSecret: process.env.TWITTER_ACCESS_SECRET as string,
            })
            const rwClient = client.readWrite

            // Check memory before downloading video
            const memoryBefore = getMemoryUsage()
            logger.debug('Memory before video download', 'Twitter', {
              heapUsedMB: memoryBefore.heapUsedMB,
            })

            // Check video size before downloading
            try {
              const headResponse = await axios.head(videoUrl)
              const contentLength = parseInt(headResponse.headers['content-length'] || '0', 10)
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
              type: 'video/mp4',
            })

            // Post tweet with media
            logger.debug('Posting tweet', 'Twitter')
            await rwClient.v2.tweet({
              text: caption,
              media: { media_ids: [mediaId] },
            })

            logger.debug('Tweet posted successfully', 'Twitter')
          },
          {
            maxRetries: 3,
            retryIf: (error) => {
              // Don't retry for validation errors or video too large
              if (error instanceof AppError && error.code === ErrorCode.VALIDATION_ERROR) {
                return false
              }
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
      // Fallback to bearer token (text only)
      if (!bearerToken) {
        throw new AppError(
          'Twitter bearer token missing and upload credentials not provided',
          ErrorCode.MISSING_CONFIG,
          500
        )
      }

      await rateLimiters.execute('twitter', async () => {
        return withRetry(
          async () => {
            await axios.post(
              'https://api.twitter.com/2/tweets',
              { text: `${caption}\n${videoUrl}` },
              {
                headers: { Authorization: `Bearer ${bearerToken}` },
                timeout: config.TIMEOUT_SOCIAL_POST,
              }
            )
          },
          {
            maxRetries: 3,
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
