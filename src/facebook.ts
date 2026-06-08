import axios from 'axios'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()

export async function postToFacebook(
  videoUrl: string,
  caption: string,
  pageAccessToken: string,
  pageId: string
): Promise<string> {
  const startTime = Date.now()

  try {
    const config = getConfig()

    if (!videoUrl || !pageAccessToken || !pageId) {
      throw new AppError(
        'Missing required parameters for Facebook posting',
        ErrorCode.FACEBOOK_API_ERROR,
        400,
        true,
        { hasVideoUrl: !!videoUrl, hasPageAccessToken: !!pageAccessToken, hasPageId: !!pageId }
      )
    }

    logger.info('Posting to Facebook', 'Facebook', {
      pageId,
      captionLength: caption.length,
    })

    const postId = await rateLimiters.execute('instagram', async () => {
      return withRetry(
        async () => {
          const res = await axios.post(
            `https://graph.facebook.com/v19.0/${pageId}/videos`,
            {
              file_url: videoUrl,
              description: caption,
              access_token: pageAccessToken,
            },
            {
              timeout: config.TIMEOUT_SOCIAL_POST,
            }
          )
          return String(res.data?.id || '')
        },
        {
          maxRetries: 3,
          onRetry: (error, attempt) => {
            logger.warn('Retrying Facebook post', 'Facebook', {
              attempt,
              error: error instanceof Error ? error.message : String(error),
            })
          },
        }
      )
    })

    const duration = Date.now() - startTime
    metrics.incrementCounter('facebook.success')
    metrics.recordHistogram('facebook.duration', duration)

    logger.info('Successfully posted to Facebook', 'Facebook', {
      duration,
      postId,
    })

    return postId
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('facebook.error')
    metrics.recordHistogram('facebook.error_duration', duration)

    logger.error('Failed to post to Facebook', 'Facebook', { duration }, error)

    if (error instanceof AppError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      throw fromAxiosError(error, ErrorCode.FACEBOOK_API_ERROR, {
        pageId,
        videoUrl,
      })
    }

    throw new AppError(
      `Facebook posting failed: ${error.message || String(error)}`,
      ErrorCode.FACEBOOK_API_ERROR,
      500,
      true,
      { pageId },
      error instanceof Error ? error : undefined
    )
  }
}