import axios from 'axios'
import FormData from 'form-data'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()

/**
 * Register a new video media item with Pinterest and upload the bytes to the
 * returned S3 endpoint. Polls until the media is ready and returns the media_id.
 *
 * Pinterest v5 API requires this 2-step flow for video pins —
 * `source_type: 'video_url'` is NOT supported by /v5/pins.
 */
async function uploadVideoToPinterest(
  videoUrl: string,
  accessToken: string,
  timeoutMs: number
): Promise<string> {
  // 1. Register the upload
  const registerRes = await axios.post(
    'https://api.pinterest.com/v5/media',
    { media_type: 'video' },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: timeoutMs,
    }
  )
  const mediaId: string = registerRes.data?.media_id
  const uploadUrl: string = registerRes.data?.upload_url
  const uploadParameters: Record<string, string> = registerRes.data?.upload_parameters || {}
  if (!mediaId || !uploadUrl) {
    throw new AppError(
      'Pinterest /v5/media did not return media_id/upload_url',
      ErrorCode.PINTEREST_API_ERROR,
      500,
      true,
      { response: registerRes.data }
    )
  }

  // 2. Download the source video into memory
  const videoResp = await axios.get<ArrayBuffer>(videoUrl, {
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    maxContentLength: 500 * 1024 * 1024,
  })

  // 3. Upload to S3 — order matters: all upload_parameters before `file`
  const form = new FormData()
  for (const [k, v] of Object.entries(uploadParameters)) {
    form.append(k, v)
  }
  form.append('file', Buffer.from(videoResp.data), {
    filename: 'video.mp4',
    contentType: 'video/mp4',
  })
  await axios.post(uploadUrl, form, {
    headers: form.getHeaders(),
    timeout: timeoutMs,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })

  // 4. Poll for ready state (Pinterest processes video asynchronously)
  const pollTimeoutMs = 5 * 60_000
  const pollIntervalMs = 5_000
  const start = Date.now()
  while (Date.now() - start < pollTimeoutMs) {
    const statusRes = await axios.get(`https://api.pinterest.com/v5/media/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: timeoutMs,
    })
    const status: string = statusRes.data?.status
    if (status === 'succeeded') return mediaId
    if (status === 'failed') {
      throw new AppError(
        'Pinterest media processing failed',
        ErrorCode.PINTEREST_API_ERROR,
        500,
        true,
        { mediaId, response: statusRes.data }
      )
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
  throw new AppError(
    'Pinterest media processing timed out',
    ErrorCode.PINTEREST_API_ERROR,
    504,
    true,
    { mediaId }
  )
}

export async function postToPinterest(
  videoUrl: string,
  caption: string,
  accessToken: string,
  boardId: string
): Promise<string> {
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
    const pinId = await rateLimiters.execute('pinterest', async () => {
      return withRetry(
        async () => {
          // Step 1+2+3+4: register, upload, and wait for processing
          const mediaId = await uploadVideoToPinterest(
            videoUrl,
            accessToken,
            config.TIMEOUT_SOCIAL_POST
          )

          // Step 5: create the pin referencing the uploaded media_id
          const mediaSource: Record<string, string> = {
            source_type: 'video_id',
            media_id: mediaId,
          }
          if (process.env.PINTEREST_COVER_IMAGE_URL) {
            mediaSource.cover_image_url = process.env.PINTEREST_COVER_IMAGE_URL
          }

          const res = await axios.post(
            `https://api.pinterest.com/v5/pins`,
            {
              board_id: boardId,
              media_source: mediaSource,
              title: caption.substring(0, 100), // Pinterest title max length
              description: caption,
            },
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              timeout: config.TIMEOUT_SOCIAL_POST,
            }
          )
          return String(res.data?.id ?? '')
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
    return pinId
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
