import 'dotenv/config'
import { processCsvUrl } from './core'
import { postToInstagram } from './instagram'
import { postToTwitter } from './twitter'
import { postToPinterest } from './pinterest'
import { postToYouTube } from './youtube'
import { createClientWithSecrets as createHeyGenClient } from './heygen'
import { mapProductToHeyGenPayload } from './heygen-adapter'
import { generateScript } from './openai'
import { markRowPosted, writeColumnValues, resetPostedColumn } from './sheets'
import {
  startHealthServer,
  stopHealthServer,
  updateStatus,
  incrementSuccessfulPost,
  incrementFailedPost,
  addError
} from './health-server'
import { getAuditLogger } from './audit-logger'
import { hasConfiguredGoogleCredentials } from './google-auth'
import { validateConfig } from './config-validator'

const auditLogger = getAuditLogger()

type VideoState = {
  videoId?: string
  videoUrl?: string
  videoStatus?: string
}

function pickFirstNonEmpty(record: Record<string, any> | undefined, keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return ''
}

function getVideoState(record: Record<string, any> | undefined): VideoState {
  return {
    videoId: pickFirstNonEmpty(record, ['Video_ID', 'HEYGEN_VIDEO_ID', 'HeyGen_Video_ID', 'video_id']),
    videoUrl: pickFirstNonEmpty(record, ['Video_URL', 'Video URL', 'video_url', 'VideoURL']),
    videoStatus: pickFirstNonEmpty(record, ['Video_Status', 'HEYGEN_VIDEO_STATUS', 'video_status']),
  }
}

async function writeRowFields(
  csvUrl: string,
  headers: string[],
  rowNumber: number,
  updates: Record<string, string>
) {
  const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
  const sheetGid = extractGidFromCsv(csvUrl)

  for (const [columnName, value] of Object.entries(updates)) {
    await writeColumnValues({
      spreadsheetId,
      sheetGid,
      headers,
      columnName,
      rows: [{ rowNumber, value }],
    })
  }
}

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelayMs?: number
    maxDelayMs?: number
    operation?: string
    shouldRetry?: (error: any) => boolean
  } = {}
): Promise<T | null> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 16000,
    operation = 'Operation',
    shouldRetry = () => true,
  } = options

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
      if (!shouldRetry(error)) {
        console.error(`❌ ${operation} failed (non-retryable):`, { error: error?.message || String(error) })
        return null
      }
      console.error(`❌ ${operation} attempt ${attempt}/${maxRetries} failed:`, {
        error: error?.message || String(error),
        willRetry: !isLastAttempt,
        nextRetryIn: isLastAttempt ? null : `${delay}ms`
      })

      if (isLastAttempt) {
        return null
      }

      await sleep(delay)
    }
  }

  return null
}

async function main() {
  try {
    console.log('Validating configuration before starting polling...')
    await validateConfig()
    console.log('Configuration validated')
  } catch (error) {
    console.error('❌ Configuration validation failed:', error)
    process.exit(1)
  }

  const csvUrl = process.env.CSV_URL as string
  if (!csvUrl) throw new Error('CSV_URL not set in .env')

  const seen = new Set<string>()
  const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? '60000')
  const runOnce = String(process.env.RUN_ONCE || '').toLowerCase() === 'true'
  const rowsPerRun = Number(process.env.ROWS_PER_RUN ?? '1')
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase()
  const enabledPlatforms = new Set(enabledPlatformsEnv.split(',').map(s => s.trim()).filter(Boolean))
  const enforcePostingWindows = String(process.env.ENFORCE_POSTING_WINDOWS || 'false').toLowerCase() === 'true'

  if (!process.env.VERCEL) {
    startHealthServer()
  }

  getAuditLogger().logEvent({
    level: 'INFO',
    category: 'SYSTEM',
    message: 'Video posting system started',
    details: {
      runOnce,
      dryRun,
      enforcePostingWindows,
      enabledPlatforms: enabledPlatformsEnv || 'all',
      pollIntervalMs: intervalMs
    }
  })

  if (dryRun) {
    getAuditLogger().logEvent({
      level: 'WARN',
      category: 'SYSTEM',
      message: 'DRY RUN MODE ENABLED - No actual posts will be sent',
    })
  }

  if (enforcePostingWindows) {
    getAuditLogger().logEvent({
      level: 'WARN',
      category: 'SYSTEM',
      message: 'Posting windows enforced - will only post at 9AM/5PM ET',
    })
  }

  const cycle = async () => {
    try {
      updateStatus({ status: 'processing', rowsProcessed: 0 })
      const result = await processCsvUrl(csvUrl)

      if (!result.skipped && result.rows.length > 0) {
        updateStatus({ status: 'processing-rows', rowsProcessed: 0 })
        let rowsThisCycle = 0

        for (const { product, jobId, rowNumber, headers, record } of result.rows) {
          if (!jobId || seen.has(jobId)) continue
          if (rowsThisCycle >= rowsPerRun) {
            console.log(`⏸️  ROWS_PER_RUN limit (${rowsPerRun}) reached — remaining rows deferred to next cycle`)
            break
          }

          console.log(`\n========== Processing Row ${rowNumber} ==========`) 
          console.log('Product:', product)

          const videoState = getVideoState(record)
          let videoUrl = videoState.videoUrl || await resolveVideoUrlAsync({ jobId, record })
          const asin =
            getValueFromRecord(record, process.env.CSV_COL_ASIN || 'ASIN,Parent_ASIN,SKU,Product_ID') || jobId

          const alwaysGenerate = String(process.env.ALWAYS_GENERATE_NEW_VIDEO || 'false').toLowerCase() === 'true'

          if (videoState.videoUrl && !alwaysGenerate) {
            console.log('✅ Using existing video:', videoUrl)
          } else if (
            !alwaysGenerate &&
            videoState.videoId &&
            (videoState.videoStatus || '').toLowerCase() === 'processing'
          ) {
            console.log(`⏳ Existing HeyGen job found for row ${rowNumber}: ${videoState.videoId}`)

            try {
              const heygenClient = await createHeyGenClient()
              videoUrl = await heygenClient.pollJobForVideoUrl(videoState.videoId, {
                timeoutMs: Number(process.env.HEYGEN_POLL_TIMEOUT_MS || 120000),
                intervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 15000)
              })

              if (videoUrl) {
                console.log('✅ Existing HeyGen video ready:', videoUrl)
                if (hasConfiguredGoogleCredentials()) {
                  try {
                    await writeRowFields(csvUrl, headers, rowNumber, {
                      Video_URL: videoUrl,
                      Video_Status: 'Completed',
                      Video_Completed_At: new Date().toISOString(),
                    })
                    console.log('✅ Wrote completed video URL/state to sheet')
                  } catch (e: any) {
                    console.error('⚠️  Failed to write completed video URL/state to sheet:', e?.message || e)
                  }
                }
              }
            } catch (e: any) {
              console.error('⚠️ Existing HeyGen job not ready yet:', e?.message || e)
            }

            if (!videoUrl) {
              console.log('⏭️  Leaving row in Processing state for next cycle')
              continue
            }
          } else if (!videoUrl || alwaysGenerate || !(await urlLooksReachable(videoUrl))) {
            console.log('No existing completed video found. Creating new video with HeyGen...')

            let script: string | undefined
            if (process.env.OPENAI_API_KEY) {
              try {
                script = await generateScript(product)
                console.log('✅ Generated script with OpenAI:', script.substring(0, 100) + '...')
              } catch (e: any) {
                console.error('❌ OpenAI script generation failed:', e?.message || e)
              }
            } else {
              console.log('⚠️  OPENAI_API_KEY not set, using product description as script')
              script = (product?.details ?? product?.title ?? product?.name ?? '').toString()
            }

            if (!script) {
              console.error('❌ No script available for video generation')
              console.warn('⏭️  Skipping row - cannot generate video without script')
              continue
            }

            const hasHeyGenCreds = process.env.HEYGEN_API_KEY || process.env.GCP_SECRET_HEYGEN_API_KEY
            if (!hasHeyGenCreds) {
              console.error('❌ HeyGen credentials not configured. Set HEYGEN_API_KEY or GCP_SECRET_HEYGEN_API_KEY')
              console.warn('⏭️  Skipping row - cannot generate video without HeyGen credentials')
              continue
            }

            try {
              console.log('🎬 Creating video with HeyGen...')
              const heygenClient = await createHeyGenClient()

              const mapping = mapProductToHeyGenPayload(record)
              const payload = {
                ...mapping.payload,
                script,
                title: `${product?.title || product?.name || 'Product Video'} (${asin})`,
                meta: { asin, jobId }
              }

              console.log('📝 HeyGen mapping:', {
                avatar: mapping.avatar,
                voice: mapping.voice,
                lengthSeconds: mapping.lengthSeconds,
                reason: mapping.reason
              })

              const heygenJobId = await heygenClient.createVideoJob(payload)
              console.log('✅ Created HeyGen video job:', heygenJobId)

              if (hasConfiguredGoogleCredentials()) {
                try {
                  await writeRowFields(csvUrl, headers, rowNumber, {
                    Video_ID: heygenJobId,
                    Video_Status: 'Processing',
                    Script_Status: 'Generated',
                    Script_Generated_Date: new Date().toISOString(),
                    Video_Requested_At: new Date().toISOString(),
                    HEYGEN_AVATAR: mapping.avatar,
                    HEYGEN_VOICE: mapping.voice,
                    HEYGEN_LENGTH_SECONDS: String(mapping.lengthSeconds),
                    HEYGEN_MAPPING_REASON: mapping.reason,
                    HEYGEN_MAPPED_AT: new Date().toISOString(),
                  })
                  console.log('✅ Saved HeyGen job state to sheet')
                } catch (e: any) {
                  console.error('⚠️  Failed to save HeyGen job state to sheet:', e?.message || e)
                }
              }

              console.log('⏭️  Video job created; will poll on next cycle')
              continue
            } catch (e: any) {
              console.error('❌ HeyGen video generation failed:', e?.message || e)
              console.warn('⏭️  Skipping row - video generation failed')
              addError(`HeyGen: ${product?.title || jobId} - ${e?.message || String(e)}`)

              if (hasConfiguredGoogleCredentials()) {
                try {
                  await writeRowFields(csvUrl, headers, rowNumber, {
                    Video_Status: 'Failed',
                    Error_Message: String(e?.message || e).slice(0, 500),
                  })
                } catch {}
              }
              continue
            }
          } else {
            console.log('✅ Using existing video:', videoUrl)
          }

          if (!videoUrl) {
            console.warn(`❌ No video URL available for row ${rowNumber}; skipping`)
            continue
          }

          console.log('🔍 Validating video URL accessibility...')
          const isReachable = alwaysGenerate || await urlLooksReachable(videoUrl)
          if (!isReachable) {
            console.error(`❌ Video URL not reachable for row ${rowNumber}:`, {
              url: videoUrl,
              product: product?.title || product?.name,
              jobId
            })
            console.warn('⏭️  Skipping posting to platforms - video not accessible')
            continue
          }
          console.log('✅ Video URL validated successfully')

          console.log('🔑 CLOUDINARY_API_KEY present:', !!process.env.CLOUDINARY_API_KEY)
          if (process.env.CLOUDINARY_API_KEY) {
            try {
              const { uploadVideoToCloudinary } = await import('./cloudinary-upload')
              const cloudUrl = await uploadVideoToCloudinary(videoUrl)
              videoUrl = cloudUrl
            } catch (err: any) {
              console.warn('⚠️  Cloudinary upload failed, falling back to original URL:', err.message)
            }
          }

          const caption: string = (product?.details ?? product?.title ?? product?.name ?? '').toString()

          const canPostNow = !enforcePostingWindows || isWithinPostingWindow()
          if (!canPostNow) {
            console.log('🕘 Outside posting window (9AM/5PM ET). Will not post, but video URL is ready:', videoUrl)
            getAuditLogger().logEvent({
              level: 'SKIP',
              category: 'POSTING',
              message: 'Outside posting window',
              rowNumber,
              product: product?.title || product?.name,
              details: { enforcePostingWindows, videoUrl }
            })
          }

          let postedAtLeastOne = false
          const platformResults: Record<string, { success: boolean; result?: any; error?: string }> = {}

          const platformStatus = checkPlatformAvailability(enabledPlatforms)

          if (!platformStatus.anyEnabled && !dryRun) {
            getAuditLogger().logEvent({
              level: 'ERROR',
              category: 'PLATFORM',
              message: 'No platforms enabled with valid credentials',
              rowNumber,
              product: product?.title || product?.name,
              details: {
                ...platformStatus.credentials,
                enabledPlatforms: Array.from(enabledPlatforms)
              }
            })
          } else if (!dryRun && canPostNow) {
            getAuditLogger().logEvent({
              level: 'INFO',
              category: 'PLATFORM',
              message: 'Platforms ready for posting',
              rowNumber,
              details: platformStatus.enabled
            })
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Instagram:', { videoUrl, caption })
            platformResults.instagram = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('instagram')) && process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
            getAuditLogger().logEvent({
              level: 'INFO',
              category: 'POSTING',
              message: 'Attempting Instagram post',
              rowNumber,
              product: product?.title || product?.name
            })
            const result = await retryWithBackoff(
              () => postToInstagram(videoUrl!, caption, process.env.INSTAGRAM_ACCESS_TOKEN!, process.env.INSTAGRAM_IG_ID!),
              {
                maxRetries: 3,
                operation: 'Instagram post',
                initialDelayMs: 2000
              }
            )
            if (result) {
              console.log('✅ Posted to Instagram:', result)
              platformResults.instagram = { success: true, result }
              postedAtLeastOne = true
              incrementSuccessfulPost()
              getAuditLogger().logEvent({
                level: 'SUCCESS',
                category: 'POSTING',
                message: 'Instagram post successful',
                rowNumber,
                product: product?.title || product?.name,
                details: { mediaId: result }
              })
            } else {
              console.error('❌ Instagram post failed after all retries')
              platformResults.instagram = { success: false, error: 'Failed after 3 retries' }
              incrementFailedPost()
              addError(`Instagram: ${product?.title || jobId} - Failed after 3 retries`)
              getAuditLogger().logEvent({
                level: 'ERROR',
                category: 'POSTING',
                message: 'Instagram post failed',
                rowNumber,
                product: product?.title || product?.name,
                details: { error: 'Failed after 3 retries' }
              })
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Twitter:', { videoUrl, caption })
            platformResults.twitter = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('twitter')) && (process.env.TWITTER_BEARER_TOKEN || hasTwitterUploadCreds())) {
            getAuditLogger().logEvent({
              level: 'INFO',
              category: 'POSTING',
              message: 'Attempting Twitter post',
              rowNumber,
              product: product?.title || product?.name
            })
            const result = await retryWithBackoff(
              async () => {
                if (hasTwitterUploadCreds()) {
                  return await postToTwitter(videoUrl!, caption, process.env.TWITTER_BEARER_TOKEN ?? '')
                } else if (process.env.TWITTER_BEARER_TOKEN) {
                  return await postToTwitter(videoUrl!, caption, process.env.TWITTER_BEARER_TOKEN)
                }
                return null
              },
              {
                maxRetries: 3,
                operation: 'Twitter post',
                initialDelayMs: 2000,
                shouldRetry: (err: any) => err?.response?.status !== 403,
              }
            )
            if (result) {
              console.log('✅ Posted to Twitter:', result)
              platformResults.twitter = { success: true, result }
              postedAtLeastOne = true
              incrementSuccessfulPost()
              getAuditLogger().logEvent({
                level: 'SUCCESS',
                category: 'POSTING',
                message: 'Twitter post successful',
                rowNumber,
                product: product?.title || product?.name
              })
            } else {
              console.error('❌ Twitter post failed after all retries')
              platformResults.twitter = { success: false, error: 'Failed after 3 retries' }
              incrementFailedPost()
              addError(`Twitter: ${product?.title || jobId} - Failed after 3 retries`)
              getAuditLogger().logEvent({
                level: 'ERROR',
                category: 'POSTING',
                message: 'Twitter post failed',
                rowNumber,
                product: product?.title || product?.name,
                details: { error: 'Failed after 3 retries' }
              })
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Pinterest:', { videoUrl, caption })
            platformResults.pinterest = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('pinterest')) && process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
            getAuditLogger().logEvent({
              level: 'INFO',
              category: 'POSTING',
              message: 'Attempting Pinterest post',
              rowNumber,
              product: product?.title || product?.name
            })
            const result = await retryWithBackoff(
              () => postToPinterest(videoUrl!, caption, process.env.PINTEREST_ACCESS_TOKEN!, process.env.PINTEREST_BOARD_ID!),
              {
                maxRetries: 3,
                operation: 'Pinterest post',
                initialDelayMs: 2000
              }
            )
            if (result) {
              console.log('✅ Posted to Pinterest:', result)
              platformResults.pinterest = { success: true, result }
              postedAtLeastOne = true
              incrementSuccessfulPost()
              getAuditLogger().logEvent({
                level: 'SUCCESS',
                category: 'POSTING',
                message: 'Pinterest post successful',
                rowNumber,
                product: product?.title || product?.name
              })
            } else {
              console.error('❌ Pinterest post failed after all retries')
              platformResults.pinterest = { success: false, error: 'Failed after 3 retries' }
              incrementFailedPost()
              addError(`Pinterest: ${product?.title || jobId} - Failed after 3 retries`)
              getAuditLogger().logEvent({
                level: 'ERROR',
                category: 'POSTING',
                message: 'Pinterest post failed',
                rowNumber,
                product: product?.title || product?.name,
                details: { error: 'Failed after 3 retries' }
              })
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would upload to YouTube:', { videoUrl, caption })
            platformResults.youtube = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('youtube')) && process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
            getAuditLogger().logEvent({
              level: 'INFO',
              category: 'POSTING',
              message: 'Attempting YouTube upload',
              rowNumber,
              product: product?.title || product?.name
            })
            const result = await retryWithBackoff(
              () => postToYouTube(
                videoUrl!,
                caption,
                process.env.YT_CLIENT_ID!,
                process.env.YT_CLIENT_SECRET!,
                process.env.YT_REFRESH_TOKEN!,
                (process.env.YT_PRIVACY_STATUS as any) || 'unlisted'
              ),
              {
                maxRetries: 2,
                operation: 'YouTube upload',
                initialDelayMs: 5000
              }
            )
            if (result) {
              console.log('✅ Posted to YouTube:', result)
              platformResults.youtube = { success: true, result }
              postedAtLeastOne = true
              incrementSuccessfulPost()
              getAuditLogger().logEvent({
                level: 'SUCCESS',
                category: 'POSTING',
                message: 'YouTube upload successful',
                rowNumber,
                product: product?.title || product?.name
              })
            } else {
              console.error('❌ YouTube upload failed after all retries')
              platformResults.youtube = { success: false, error: 'Failed after 2 retries' }
              incrementFailedPost()
              addError(`YouTube: ${product?.title || jobId} - Failed after 2 retries`)
              getAuditLogger().logEvent({
                level: 'ERROR',
                category: 'POSTING',
                message: 'YouTube upload failed',
                rowNumber,
                product: product?.title || product?.name,
                details: { error: 'Failed after 2 retries' }
              })
            }
          }

          if (dryRun) {
            console.log('[DRY RUN] Would create blog article:', {
              productTitle: product?.title || product?.name,
              videoUrl
            })
            platformResults.blog = { success: true, result: 'DRY_RUN' }
          } else if (process.env.ENABLE_BLOG_POSTING === 'true' && process.env.GITHUB_TOKEN) {
            const { postBlogArticle } = await import('./blog')
            const result = await retryWithBackoff(
              () => postBlogArticle(
                {
                  productTitle: product?.title || product?.name || 'Product',
                  productDescription: product?.details,
                  videoUrl: videoUrl!,
                  productUrl: product?.url
                },
                process.env.GITHUB_TOKEN!,
                process.env.GITHUB_REPO,
                process.env.GITHUB_BRANCH
              ),
              {
                maxRetries: 2,
                operation: 'Blog article posting',
                initialDelayMs: 3000
              }
            )
            if (result) {
              console.log('✅ Blog article published:', {
                articleId: result.articleId,
                commitSha: result.commitSha?.substring(0, 7)
              })
              platformResults.blog = { success: true, result: result.articleId }
              postedAtLeastOne = true
              incrementSuccessfulPost()
            } else {
              console.error('❌ Blog article posting failed after all retries')
              platformResults.blog = { success: false, error: 'Failed after 2 retries' }
              incrementFailedPost()
              addError(`Blog: ${product?.title || jobId} - Failed after 2 retries`)
            }
          } else if (process.env.ENABLE_BLOG_POSTING === 'true') {
            console.log('⚠️ Blog posting enabled but GITHUB_TOKEN not set')
          }

          if (false && process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
            console.log('[FACEBOOK DISABLED] Skipping until token is fixed')
          } else if (false) {
            getAuditLogger().logEvent({ level: 'INFO', category: 'POSTING', message: 'Attempting Facebook post', rowNumber, product: product?.title || product?.name })
            try {
              const fbResult = await retryWithBackoff(async () => {
                const axios = await import('axios')
                const res = await axios.default.post(
                  `https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/videos`,
                  {
                    file_url: videoUrl,
                    description: caption,
                    title: (product?.title || product?.name || 'Nature\'s Way Soil').substring(0, 100),
                    published: true,
                    access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
                  }
                )
                console.log('📘 Facebook video URL:', videoUrl)
                return res.data
              }, { maxRetries: 2, operation: 'Facebook post', initialDelayMs: 3000 })
              if (fbResult?.id) {
                console.log('✅ Posted to Facebook:', fbResult.id)
                platformResults.facebook = { success: true, result: fbResult.id }
                postedAtLeastOne = true
                incrementSuccessfulPost()
                getAuditLogger().logEvent({ level: 'SUCCESS', category: 'POSTING', message: 'Facebook post successful', rowNumber, product: product?.title || product?.name })
              }
            } catch (err: any) {
              const fbError = err?.response?.data || err?.message || err
              console.error('❌ Facebook post failed (skipping, continuing):', JSON.stringify(fbError))
              platformResults.facebook = { success: false, error: err?.message || String(err) }
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to LinkedIn:', { videoUrl, caption })
            platformResults.linkedin = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('linkedin')) && process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID) {
            getAuditLogger().logEvent({ level: 'INFO', category: 'POSTING', message: 'Attempting LinkedIn post', rowNumber, product: product?.title || product?.name })
            try {
              const liResult = await retryWithBackoff(async () => {
                const axios = await import('axios')
                const res = await axios.default.post(
                  'https://api.linkedin.com/v2/ugcPosts',
                  {
                    author: `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`,
                    lifecycleState: 'PUBLISHED',
                    specificContent: {
                      'com.linkedin.ugc.ShareContent': {
                        shareCommentary: { text: caption },
                        shareMediaCategory: 'VIDEO',
                        media: [{
                          status: 'READY',
                          description: { text: caption.substring(0, 200) },
                          media: videoUrl,
                          title: { text: product?.title || product?.name || 'Nature\'s Way Soil' },
                        }],
                      },
                    },
                    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
                  },
                  {
                    headers: {
                      Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
                      'Content-Type': 'application/json',
                      'X-Restli-Protocol-Version': '2.0.0'
                    }
                  }
                )
                return res.data
              }, { maxRetries: 2, operation: 'LinkedIn post', initialDelayMs: 3000 })
              if (liResult?.id) {
                console.log('✅ Posted to LinkedIn:', liResult.id)
                platformResults.linkedin = { success: true, result: liResult.id }
                postedAtLeastOne = true
                incrementSuccessfulPost()
                getAuditLogger().logEvent({ level: 'SUCCESS', category: 'POSTING', message: 'LinkedIn post successful', rowNumber, product: product?.title || product?.name })
              }
            } catch (err: any) {
              console.error('❌ LinkedIn post failed:', err?.response?.data || err?.message || err)
              platformResults.linkedin = { success: false, error: err?.message || String(err) }
              incrementFailedPost()
              addError(`LinkedIn: ${product?.title || jobId} - ${err?.message || err}`)
              getAuditLogger().logEvent({ level: 'ERROR', category: 'POSTING', message: 'LinkedIn post failed', rowNumber, product: product?.title || product?.name, details: { error: err?.message } })
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Google Business Profile:', { videoUrl, caption })
            platformResults.googleBusiness = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('googlebusiness')) && process.env.GOOGLE_BUSINESS_ACCESS_TOKEN && process.env.GOOGLE_BUSINESS_ACCOUNT_ID && process.env.GOOGLE_BUSINESS_LOCATION_ID) {
            getAuditLogger().logEvent({ level: 'INFO', category: 'POSTING', message: 'Attempting Google Business post', rowNumber, product: product?.title || product?.name })
            try {
              const { postToGoogleBusiness } = await import('./google-business')
              const gbResult = await retryWithBackoff(
                () => postToGoogleBusiness(caption, videoUrl, 'https://natureswaysoil.com'),
                { maxRetries: 2, operation: 'Google Business post', initialDelayMs: 3000 }
              )
              console.log('✅ Posted to Google Business Profile:', gbResult?.name)
              platformResults.googleBusiness = { success: true, result: gbResult?.name }
              incrementSuccessfulPost()
              getAuditLogger().logEvent({ level: 'SUCCESS', category: 'POSTING', message: 'Google Business post successful', rowNumber, product: product?.title || product?.name })
            } catch (err: any) {
              console.error('❌ Google Business post failed:', err?.response?.data || err?.message || err)
              platformResults.googleBusiness = { success: false, error: err?.message || String(err) }
              incrementFailedPost()
              addError(`Google Business: ${product?.title || jobId} - ${err?.message || err}`)
              getAuditLogger().logEvent({ level: 'ERROR', category: 'POSTING', message: 'Google Business post failed', rowNumber, product: product?.title || product?.name, details: { error: err?.message } })
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to TikTok:', { videoUrl, caption })
            platformResults.tiktok = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('tiktok')) && process.env.TIKTOK_ACCESS_TOKEN) {
            getAuditLogger().logEvent({ level: 'INFO', category: 'POSTING', message: 'Attempting TikTok post', rowNumber, product: product?.title || product?.name })
            try {
              const ttResult = await retryWithBackoff(async () => {
                const axios = await import('axios')
                const initRes = await axios.default.post(
                  'https://open.tiktokapis.com/v2/post/publish/video/init/',
                  {
                    post_info: {
                      title: caption.substring(0, 150),
                      privacy_level: process.env.TIKTOK_PRIVACY_LEVEL || 'PUBLIC_TO_EVERYONE',
                      disable_duet: false,
                      disable_comment: false,
                      disable_stitch: false,
                    },
                    source_info: {
                      source: 'PULL_FROM_URL',
                      video_url: videoUrl,
                    },
                  },
                  { headers: { Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`, 'Content-Type': 'application/json; charset=UTF-8' } }
                )
                return initRes.data
              }, { maxRetries: 2, operation: 'TikTok post', initialDelayMs: 3000 })
              if (ttResult?.data?.publish_id) {
                console.log('✅ Posted to TikTok, publish_id:', ttResult.data.publish_id)
                platformResults.tiktok = { success: true, result: ttResult.data.publish_id }
                postedAtLeastOne = true
                incrementSuccessfulPost()
                getAuditLogger().logEvent({ level: 'SUCCESS', category: 'POSTING', message: 'TikTok post successful', rowNumber, product: product?.title || product?.name })
              }
            } catch (err: any) {
              console.error('❌ TikTok post failed:', err?.response?.data || err?.message || err)
              platformResults.tiktok = { success: false, error: err?.message || String(err) }
              incrementFailedPost()
              addError(`TikTok: ${product?.title || jobId} - ${err?.message || err}`)
              getAuditLogger().logEvent({ level: 'ERROR', category: 'POSTING', message: 'TikTok post failed', rowNumber, product: product?.title || product?.name, details: { error: err?.message } })
            }
          }

          console.log('\n📊 Platform Posting Summary:', {
            product: product?.title || product?.name,
            videoUrl,
            captionLength: caption.length,
            results: platformResults,
            successCount: Object.values(platformResults).filter(r => r.success).length,
            totalAttempted: Object.keys(platformResults).length
          })

          if (!dryRun && postedAtLeastOne) {
            try {
              if (hasConfiguredGoogleCredentials()) {
                const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
                const sheetGid = extractGidFromCsv(csvUrl)
                await markRowPosted({
                  spreadsheetId,
                  sheetGid,
                  rowNumber,
                  headers,
                  postedColumn: process.env.CSV_COL_POSTED || 'Posted',
                  timestampColumn: process.env.CSV_COL_POSTED_AT || 'Posted_At',
                })
              }
            } catch (err) {
              console.error('Failed to mark row posted:', err)
            }
            seen.add(jobId)
            rowsThisCycle++
          }

          updateStatus({
            status: 'processing',
            rowsProcessed: seen.size
          })
        }

        updateStatus({
          status: 'idle',
          rowsProcessed: seen.size
        })
      } else {
        const spreadsheetIdMatch = csvUrl.match(/spreadsheets\/d\/([^/]+)/)
        const gidMatch = csvUrl.match(/[?&]gid=(\d+)/)
        const spreadsheetId = spreadsheetIdMatch?.[1]
        const sheetGid = gidMatch?.[1]

        if (spreadsheetId && result.skipped === false) {
          console.log('🔁 All rows already posted — resetting Posted column to loop from row 1')
          try {
            const axios = require('axios')
            const csvResp = await axios.get(csvUrl, { responseType: 'text', timeout: 15000 })
            const lines = (csvResp.data as string).trim().split('\n')
            const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''))
            const totalDataRows = lines.length - 1
            await resetPostedColumn({ spreadsheetId, sheetGid, totalRows: totalDataRows, headers })
            seen.clear()
            console.log(`✅ Reset ${totalDataRows} rows — will post from row 1 on next cycle`)
          } catch (resetErr: any) {
            console.error('❌ Failed to reset Posted column:', resetErr?.message)
          }
        } else {
          console.log('⚠️  No valid products found in sheet. Check CSV_URL and column mappings.')
        }
        updateStatus({ status: 'idle-no-products' })
      }
    } catch (e: any) {
      console.error('Polling error:', e)
      addError(`Cycle error: ${e?.message || String(e)}`)
      getAuditLogger().logEvent({
        level: 'ERROR',
        category: 'SYSTEM',
        message: 'Cycle error',
        details: { error: e?.message || String(e) }
      })
      updateStatus({ status: 'error' })
    }

    getAuditLogger().printSummary()

    if (!runOnce) {
      getAuditLogger().clear()
    }
  }

  if (runOnce) {
    let exitCode = 0
    try {
      await cycle()
    } catch (error) {
      console.error('Error during cycle:', error)
      exitCode = 1
    } finally {
      await stopHealthServer()
      process.exit(exitCode)
    }
  }

  while (true) {
    await cycle()
    await sleep(intervalMs)
  }
}

main().catch(e => console.error(e))

function hasTwitterUploadCreds(): boolean {
  return Boolean(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET
  )
}

function checkPlatformAvailability(enabledPlatforms: Set<string>) {
  const hasInstagramCreds = Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID)
  const hasTwitterCreds = Boolean(process.env.TWITTER_BEARER_TOKEN || hasTwitterUploadCreds())
  const hasPinterestCreds = Boolean(process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID)
  const hasYouTubeCreds = Boolean(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN)
  const hasFacebookCreds = Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID)
  const hasLinkedInCreds = Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID)
  const hasTikTokCreds = Boolean(process.env.TIKTOK_ACCESS_TOKEN)

  const instagramEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('instagram')) && hasInstagramCreds
  const twitterEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('twitter')) && hasTwitterCreds
  const pinterestEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('pinterest')) && hasPinterestCreds
  const youtubeEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('youtube')) && hasYouTubeCreds
  const facebookEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('facebook')) && hasFacebookCreds
  const linkedinEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('linkedin')) && hasLinkedInCreds
  const tiktokEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('tiktok')) && hasTikTokCreds

  return {
    credentials: {
      hasInstagramCreds,
      hasTwitterCreds,
      hasPinterestCreds,
      hasYouTubeCreds,
      hasFacebookCreds,
      hasLinkedInCreds,
      hasTikTokCreds,
    },
    enabled: {
      instagram: instagramEnabled,
      twitter: twitterEnabled,
      pinterest: pinterestEnabled,
      youtube: youtubeEnabled,
      facebook: facebookEnabled,
      linkedin: linkedinEnabled,
      tiktok: tiktokEnabled,
    },
    anyEnabled: instagramEnabled || twitterEnabled || pinterestEnabled || youtubeEnabled || facebookEnabled || linkedinEnabled || tiktokEnabled
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractSpreadsheetIdFromCsv(csvUrl: string): string {
  const m = csvUrl.match(/\/spreadsheets\/d\/([^/]+)/)
  if (!m) throw new Error('Unable to parse spreadsheetId from CSV_URL')
  return m[1]
}

function extractGidFromCsv(csvUrl: string): number | undefined {
  const m = csvUrl.match(/[?&]gid=(\d+)/)
  return m ? Number(m[1]) : undefined
}

async function resolveVideoUrlAsync(params: { jobId: string; record?: Record<string, string> }): Promise<string | undefined> {
  const { jobId, record } = params
  const directCol = (process.env.CSV_COL_VIDEO_URL || 'video_url,Video URL,VideoURL,Video_URL').split(',').map((s: string) => s.trim())
  if (record) {
    for (const key of directCol) {
      const v = record[key]
      if (v && /^https?:\/\//i.test(v)) return v
    }
  }
  const template = process.env.VIDEO_URL_TEMPLATE || process.env.WAVE_VIDEO_URL_TEMPLATE || 'https://heygen.ai/jobs/{jobId}/video.mp4'
  return template
    .replaceAll('{jobId}', jobId)
    .replaceAll('{asin}', jobId)
}

async function urlLooksReachable(url: string): Promise<boolean> {
  const axios = await import('axios')
  try {
    const res = await axios.default.head(url, { validateStatus: () => true })
    if (res.status >= 400) return false
    if (res.status === 405 || res.status === 403) {
    } else if (res.status >= 200 && res.status < 400) {
      const ct: string = (res.headers['content-type'] || '').toLowerCase()
      if (ct.includes('text/html')) {
        console.warn('⚠️  Video URL returned HTML — URL has expired:', url)
        return false
      }
      return true
    }
  } catch {}

  try {
    const res = await axios.default.get(url, {
      headers: { Range: 'bytes=0-0' },
      validateStatus: () => true,
      responseType: 'stream',
    })
    if (res.status >= 200 && res.status < 400) {
      const ct: string = (res.headers['content-type'] || '').toLowerCase()
      if (ct.includes('text/html')) {
        console.warn('⚠️  Video URL returned HTML on GET — URL has expired:', url)
        return false
      }
      return true
    }
    return false
  } catch {
    return false
  }
}

function isWithinPostingWindow(): boolean {
  try {
    const nowUtc = new Date()
    const offset = Number(process.env.EASTERN_UTC_OFFSET_HOURS || '-4')
    const nowEt = new Date(nowUtc.getTime() + offset * 3600 * 1000)
    const hour = nowEt.getUTCHours()
    const minute = nowEt.getUTCMinutes()
    const windows = [
      { h: (9 - offset + 24) % 24, m: 0 },
      { h: (17 - offset + 24) % 24, m: 0 },
    ]
    for (const w of windows) {
      if (hour === w.h && Math.abs(minute - w.m) <= 5) return true
    }
    return false
  } catch {
    return true
  }
}

function getValueFromRecord(record: Record<string, string> | undefined, columnsCsv: string): string | undefined {
  if (!record) return undefined
  for (const key of columnsCsv.split(',').map(s => s.trim())) {
    const v = record[key]
    if (v && String(v).trim().length > 0) return v
  }
  return undefined
}
