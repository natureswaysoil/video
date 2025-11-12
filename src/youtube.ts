import { google } from 'googleapis'
import axios from 'axios'
import type { Readable } from 'stream'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()

export async function postToYouTube(
  videoUrl: string,
  caption: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  privacyStatus: 'public' | 'unlisted' | 'private' = 'unlisted'
): Promise<string> {
  const startTime = Date.now()

  try {
    const config = getConfig()

    if (!videoUrl || !caption || !clientId || !clientSecret || !refreshToken) {
      throw new AppError(
        'Missing required parameters for YouTube posting',
        ErrorCode.VALIDATION_ERROR,
        400,
        true,
        {
          hasVideoUrl: !!videoUrl,
          hasCaption: !!caption,
          hasClientId: !!clientId,
          hasClientSecret: !!clientSecret,
          hasRefreshToken: !!refreshToken,
        }
      )
    }

    logger.info('Posting to YouTube', 'YouTube', {
      privacyStatus,
      captionLength: caption.length,
    })

    const videoId = await rateLimiters.execute('youtube', async () => {
      return withRetry(
        async () => {
          // Create OAuth2 client and set credentials
          const oauth2Client = new google.auth.OAuth2({ clientId, clientSecret })
          oauth2Client.setCredentials({ refresh_token: refreshToken })

          const youtube = google.youtube({ version: 'v3', auth: oauth2Client })

          // Stream the video from the remote URL to YouTube
          logger.debug('Streaming video from URL', 'YouTube', { videoUrl })
          
          let mediaBody: Readable
          try {
            const res = await axios.get<Readable>(videoUrl, {
              responseType: 'stream',
              timeout: config.TIMEOUT_SOCIAL_POST,
            })
            mediaBody = res.data as unknown as Readable

            // Add error handling for the stream
            mediaBody.on('error', (error: any) => {
              logger.error('Video stream error', 'YouTube', {}, error)
            })
          } catch (downloadError) {
            throw new AppError(
              'Failed to stream video from URL',
              ErrorCode.NETWORK_ERROR,
              500,
              true,
              { videoUrl },
              downloadError instanceof Error ? downloadError : undefined
            )
          }

          const title = caption?.slice(0, 95) || 'Video'
          const description = caption || ''

          logger.debug('Uploading video to YouTube', 'YouTube', { title })

          const upload = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: {
              snippet: {
                title,
                description,
                categoryId: '22', // People & Blogs default
              },
              status: { privacyStatus },
            },
            media: { body: mediaBody },
          })

          const uploadedVideoId = upload.data.id
          if (!uploadedVideoId) {
            throw new AppError(
              'YouTube upload did not return a video ID',
              ErrorCode.YOUTUBE_API_ERROR,
              500
            )
          }

          logger.debug('Video uploaded successfully', 'YouTube', { videoId: uploadedVideoId })
          return uploadedVideoId
        },
        {
          maxRetries: 3,
          onRetry: (error, attempt) => {
            logger.warn('Retrying YouTube upload', 'YouTube', {
              attempt,
              error: error instanceof Error ? error.message : String(error),
            })
          },
        }
      )
    })

    const duration = Date.now() - startTime
    metrics.incrementCounter('youtube.success')
    metrics.recordHistogram('youtube.duration', duration)

    logger.info('Successfully posted to YouTube', 'YouTube', {
      duration,
      videoId,
    })

    return videoId
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('youtube.error')
    metrics.recordHistogram('youtube.error_duration', duration)

    logger.error('Failed to post to YouTube', 'YouTube', { duration }, error)

    if (error instanceof AppError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      throw fromAxiosError(error, ErrorCode.YOUTUBE_API_ERROR, {
        videoUrl,
      })
    }

    // Handle Google API errors
    if (error.code || error.errors) {
      throw new AppError(
        `YouTube API error: ${error.message || String(error)}`,
        ErrorCode.YOUTUBE_API_ERROR,
        error.code || 500,
        true,
        {
          googleError: error.errors,
          code: error.code,
        },
        error
      )
    }

    throw new AppError(
      `YouTube posting failed: ${error.message || String(error)}`,
      ErrorCode.YOUTUBE_API_ERROR,
      500,
      true,
      {},
      error instanceof Error ? error : undefined
    )
  }
}
