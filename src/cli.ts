import 'dotenv/config'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
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
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
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

async function loadSecretToEnv(secretName: string): Promise<void> {
  if (process.env[secretName]) return

  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT

  if (!projectId) {
    console.warn(`No GCP project ID found; skipping Secret Manager lookup for ${secretName}`)
    return
  }

  try {
    const client = new SecretManagerServiceClient()
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`
    const [version] = await client.accessSecretVersion({ name })
    const value = version.payload?.data?.toString()

    if (value) {
      process.env[secretName] = value
      console.log(`Loaded secret: ${secretName}`)
    } else {
      console.warn(`Secret ${secretName} was empty`)
    }
  } catch (error: any) {
    console.warn(`Could not load secret ${secretName}:`, error?.message || error)
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

  await loadSecretToEnv('GOOGLE_SHEET_CSV_URL')
  await loadSecretToEnv('CSV_URL')

  const csvUrl =
    process.env.CSV_URL ||
    process.env.GOOGLE_SHEET_CSV_URL

  console.log('GOOGLE_SHEET_CSV_URL loaded:', !!process.env.GOOGLE_SHEET_CSV_URL)

  if (!csvUrl) {
    throw new Error('CSV_URL / GOOGLE_SHEET_CSV_URL not set')
  }

  const seen = new Set<string>()
  const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? '60000')
  const runOnce = String(process.env.RUN_ONCE || '').toLowerCase() === 'true'
  const rowsPerRun = Number(process.env.ROWS_PER_RUN ?? '1')
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase()
  const enabledPlatforms = new Set(enabledPlatformsEnv.split(',').map(s => s.trim()).filter(Boolean))
  const enforcePostingWindows = String(process.env.ENFORCE_POSTING_WINDOWS || 'false').toLowerCase() === 'true'
  const loopResetPosted = String(process.env.LOOP_RESET_POSTED || 'false').toLowerCase() === 'true'

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
          if (isRowDeferred(record)) {
            const nextAt = pickFirstNonEmpty(record, ['Post_Next_Attempt_At'])
            console.log(`⏳ Row ${rowNumber} deferred until ${nextAt} — skipping this cycle`)
            getAuditLogger().logEvent({
              level: 'SKIP',
              category: 'POSTING',
              message: 'Row deferred — skipping until Post_Next_Attempt_At',
              rowNumber,
              product: product?.title || product?.name,
              details: { nextAt }
            })
            continue
          }
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
                console.log('🔥 FULL GENERATED SCRIPT:')
                console.log(script)

                const lower = script?.toLowerCase() || ''
                if (
                  !script ||
                  script.length < 50 ||
                  lower.includes('in this video') ||
                  lower.includes('show') ||
                  lower.includes('step') ||
                  lower.includes('scene') ||
                  lower.includes('camera') ||
                  lower.includes('demonstrate')
                ) {
                  throw new Error('Bad instruction-style script detected. Stopping before HeyGen.')
                }

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

              rowsThisCycle++
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
              rowsThisCycle++
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
          const platformErrors: Record<string, { message: string; retryable: boolean; raw: any }> = {}

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

          if (!dryRun && canPostNow && hasConfiguredGoogleCredentials()) {
            const attempts = getPostAttempts(record) + 1
            try {
              await writeRowFields(csvUrl, headers, rowNumber, {
                Post_Status: 'Attempting',
                Post_Attempts: String(attempts),
                Post_Last_Attempt_At: new Date().toISOString(),
              })
            } catch (e: any) {
              console.warn('⚠️ Failed to write pre-posting state to sheet:', e?.message)
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Instagram:', { videoUrl, caption })
            platformResults.instagram = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('instagram')) && process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
            const existingId = pickFirstNonEmpty(record, ['Instagram_Media_ID'])
            if (existingId) {
              console.log(`⏭️  Row ${rowNumber} already posted to Instagram (${existingId}) — skipping`)
              platformResults.instagram = { success: true, result: existingId }
              postedAtLeastOne = true
            } else {
              try {
                const mediaId = await postToInstagram(videoUrl!, caption, process.env.INSTAGRAM_ACCESS_TOKEN!, process.env.INSTAGRAM_IG_ID!)
                console.log('✅ Posted to Instagram:', mediaId)
                platformResults.instagram = { success: true, result: mediaId }
                postedAtLeastOne = true
                incrementSuccessfulPost()
                if (hasConfiguredGoogleCredentials()) {
                  try {
                    await writeRowFields(csvUrl, headers, rowNumber, { Instagram_Media_ID: mediaId })
                  } catch (e: any) {
                    console.warn('⚠️ Failed to persist Instagram_Media_ID:', e?.message)
                  }
                }
              } catch (err: any) {
                console.error('❌ Instagram post failed:', err?.message || err)
                platformResults.instagram = { success: false, error: err?.message || String(err) }
                platformErrors.instagram = { message: err?.message || String(err), retryable: isRetryableError(err), raw: err }
                incrementFailedPost()
                addError(`Instagram: ${product?.title || jobId} - ${err?.message || String(err)}`)
              }
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Twitter:', { videoUrl, caption })
            platformResults.twitter = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('twitter')) && (process.env.TWITTER_BEARER_TOKEN || hasTwitterUploadCreds())) {
            const existingId = pickFirstNonEmpty(record, ['Twitter_Post_ID'])
            if (existingId) {
              console.log(`⏭️  Row ${rowNumber} already posted to Twitter (${existingId}) — skipping`)
              platformResults.twitter = { success: true, result: existingId }
              postedAtLeastOne = true
            } else {
              try {
                const tweetId = await postToTwitter(videoUrl!, caption, process.env.TWITTER_BEARER_TOKEN ?? '')
                console.log('✅ Posted to Twitter:', tweetId)
                platformResults.twitter = { success: true, result: tweetId }
                postedAtLeastOne = true
                incrementSuccessfulPost()
                if (hasConfiguredGoogleCredentials() && tweetId.length > 0) {
                  try {
                    await writeRowFields(csvUrl, headers, rowNumber, { Twitter_Post_ID: tweetId })
                  } catch (e: any) {
                    console.warn('⚠️ Failed to persist Twitter_Post_ID:', e?.message)
                  }
                }
              } catch (err: any) {
                console.error('❌ Twitter post failed:', err?.message || err)
                platformResults.twitter = { success: false, error: err?.message || String(err) }
                platformErrors.twitter = { message: err?.message || String(err), retryable: isRetryableError(err), raw: err }
                incrementFailedPost()
                addError(`Twitter: ${product?.title || jobId} - ${err?.message || String(err)}`)
              }
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Pinterest:', { videoUrl, caption })
            platformResults.pinterest = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('pinterest')) && process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
            const existingId = pickFirstNonEmpty(record, ['Pinterest_Pin_ID'])
            if (existingId) {
              console.log(`⏭️  Row ${rowNumber} already posted to Pinterest (${existingId}) — skipping`)
              platformResults.pinterest = { success: true, result: existingId }
              postedAtLeastOne = true
            } else {
              try {
                const pinId = await postToPinterest(videoUrl!, caption, process.env.PINTEREST_ACCESS_TOKEN!, process.env.PINTEREST_BOARD_ID!)
                console.log('✅ Posted to Pinterest:', pinId)
                platformResults.pinterest = { success: true, result: pinId }
                postedAtLeastOne = true
                incrementSuccessfulPost()
                if (hasConfiguredGoogleCredentials() && pinId.length > 0) {
                  try {
                    await writeRowFields(csvUrl, headers, rowNumber, { Pinterest_Pin_ID: pinId })
                  } catch (e: any) {
                    console.warn('⚠️ Failed to persist Pinterest_Pin_ID:', e?.message)
                  }
                }
              } catch (err: any) {
                console.error('❌ Pinterest post failed:', err?.message || err)
                platformResults.pinterest = { success: false, error: err?.message || String(err) }
                platformErrors.pinterest = { message: err?.message || String(err), retryable: isRetryableError(err), raw: err }
                incrementFailedPost()
                addError(`Pinterest: ${product?.title || jobId} - ${err?.message || String(err)}`)
              }
            }
          }

          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would upload to YouTube:', { videoUrl, caption })
            platformResults.youtube = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('youtube')) && process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
            const existingId = pickFirstNonEmpty(record, ['YouTube_Video_ID'])
            if (existingId) {
              console.log(`⏭️  Row ${rowNumber} already uploaded to YouTube (${existingId}) — skipping`)
              platformResults.youtube = { success: true, result: existingId }
              postedAtLeastOne = true
            } else {
              try {
                const videoId = await postToYouTube(
                  videoUrl!,
                  caption,
                  process.env.YT_CLIENT_ID!,
                  process.env.YT_CLIENT_SECRET!,
                  process.env.YT_REFRESH_TOKEN!,
                  (process.env.YT_PRIVACY_STATUS as any) || 'unlisted'
                )
                console.log('✅ Posted to YouTube:', videoId)
                platformResults.youtube = { success: true, result: videoId }
                postedAtLeastOne = true
                incrementSuccessfulPost()
                if (hasConfiguredGoogleCredentials() && videoId.length > 0) {
                  try {
                    await writeRowFields(csvUrl, headers, rowNumber, { YouTube_Video_ID: videoId })
                  } catch (e: any) {
                    console.warn('⚠️ Failed to persist YouTube_Video_ID:', e?.message)
                  }
                }
              } catch (err: any) {
                console.error('❌ YouTube upload failed:', err?.message || err)
                platformResults.youtube = { success: false, error: err?.message || String(err) }
                platformErrors.youtube = { message: err?.message || String(err), retryable: isRetryableError(err), raw: err }
                incrementFailedPost()
                addError(`YouTube: ${product?.title || jobId} - ${err?.message || String(err)}`)
              }
            }
          }

          if (dryRun) {
            platformResults.blog = { success: true, result: 'DRY_RUN' }
          } else if (process.env.ENABLE_BLOG_POSTING === 'true' && process.env.GITHUB_TOKEN) {
            const { postBlogArticle } = await import('./blog')
            try {
              const blogResult = await postBlogArticle(
                {
                  productTitle: product?.title || product?.name || 'Product',
                  productDescription: product?.details,
                  videoUrl: videoUrl!,
                  productUrl: product?.url
                },
                process.env.GITHUB_TOKEN!,
                process.env.GITHUB_REPO,
                process.env.GITHUB_BRANCH
              )
              console.log('✅ Blog article published:', {
                articleId: blogResult.articleId,
                commitSha: blogResult.commitSha?.substring(0, 7)
              })
              platformResults.blog = { success: true, result: blogResult.articleId }
              postedAtLeastOne = true
              incrementSuccessfulPost()
            } catch (err: any) {
              console.error('❌ Blog article posting failed:', err?.message || err)
              platformResults.blog = { success: false, error: err?.message || String(err) }
              platformErrors.blog = { message: err?.message || String(err), retryable: isRetryableError(err), raw: err }
              incrementFailedPost()
              addError(`Blog: ${product?.title || jobId} - ${err?.message || String(err)}`)
            }
          }

          if ((enabledPlatforms.size === 0 || enabledPlatforms.has('facebook')) && process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID) {
            try {
              const axios = await import('axios')
              const fbResult = await retryWithBackoff(async () => {
                const res = await axios.default.post(
                  `https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/videos`,
                  {
                    file_url: videoUrl,
                    description: caption,
                    title: (product?.title || product?.name || "Nature's Way Soil").
