import axios from 'axios'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()

export async function postToPinterest(
  videoUrl: string,
  caption: string,
  accessToken: string,
  boardId: string
): Promise<void> {
  const startTime = Date.now()

  try {
    const config = getConfig()

    if (!videoUrl || !caption || !accessToken || !boardId) {
      throw new AppError(
        'Missing required parameters for Pinterest posting',
        ErrorCode.VALIDATION_ERROR,
        400,
        true,
        { hasVideoUrl: !!videoUrl, hasCaption: !!caption, hasAccessToken: !!accessToken, hasBoardId: !!boardId }
      )
    }

    logger.info('Posting to Pinterest', 'Pinterest', {
      boardId,
      captionLength: caption.length,
    })

    // Apply rate limiting and retry logic
    await rateLimiters.execute('pinterest', async () => {
      return withRetry(
        async () => {
          await axios.post(
            `https://api.pinterest.com/v5/pins`,
            {
              board_id: boardId,
              media_source: { source_type: 'video_url', url: videoUrl },
              title: caption.substring(0, 100), // Pinterest title max length
              description: caption,
            },
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              timeout: config.TIMEOUT_SOCIAL_POST,
            }
          )
        },
        {
          maxRetries: 3,
          onRetry: (error, attempt) => {
            logger.warn('Retrying Pinterest post', 'Pinterest', {
              attempt,
              error: error instanceof Error ? error.message : String(error),
            })
          },
        }
      )
    })

    const duration = Date.now() - startTime
    metrics.incrementCounter('pinterest.success')
    metrics.recordHistogram('pinterest.duration', duration)

    logger.info('Successfully posted to Pinterest', 'Pinterest', { duration })
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('pinterest.error')
    metrics.recordHistogram('pinterest.error_duration', duration)

    logger.error('Failed to post to Pinterest', 'Pinterest', { duration }, error)

    if (error instanceof AppError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      throw fromAxiosError(error, ErrorCode.PINTEREST_API_ERROR, {
        boardId,
        videoUrl,
      })
    }

    throw new AppError(
      `Pinterest posting failed: ${error.message || String(error)}`,
      ErrorCode.PINTEREST_API_ERROR,
      500,
      true,
      { boardId },
      error instanceof Error ? error : undefined
    )
  }
}
