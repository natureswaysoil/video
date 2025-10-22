import 'dotenv/config'
import { processCsvUrl } from './core'
import { postToInstagram } from './instagram'
import { postToTwitter } from './twitter'
import { postToPinterest } from './pinterest'
import { postToYouTube } from './youtube'
import { createClientWithSecrets as createHeyGenClient } from './heygen'
import { mapProductToHeyGenPayload } from './heygen-adapter'
import { generateScript } from './openai'
import { markRowPosted, writeColumnValues } from './sheets'
import { updateStatus, incrementSuccessfulPost, incrementFailedPost, addError } from './health-server'

// Start health check server
import './health-server'

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelayMs?: number
    maxDelayMs?: number
    operation?: string
  } = {}
): Promise<T | null> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 16000,
    operation = 'Operation'
  } = options

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
      
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
  const csvUrl = process.env.CSV_URL as string
  if (!csvUrl) throw new Error('CSV_URL not set in .env')
  const seen = new Set<string>()
  const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? '60000')
  const runOnce = String(process.env.RUN_ONCE || '').toLowerCase() === 'true'
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase()
  const enabledPlatforms = new Set(enabledPlatformsEnv.split(',').map(s => s.trim()).filter(Boolean))
  const enforcePostingWindows = String(process.env.ENFORCE_POSTING_WINDOWS || 'false').toLowerCase() === 'true'
  const targetColumnLetter = (process.env.SHEET_VIDEO_TARGET_COLUMN_LETTER || 'AB').toUpperCase()
  const cycle = async () => {
    try {
      updateStatus({ status: 'processing', rowsProcessed: 0 })
      const result = await processCsvUrl(csvUrl)
      if (!result.skipped && result.rows.length > 0) {
        updateStatus({ status: 'processing-rows', rowsProcessed: 0 })
        for (const { product, jobId, rowNumber, headers, record } of result.rows) {
          if (!jobId || seen.has(jobId)) continue
          
          console.log(`\n========== Processing Row ${rowNumber} ==========`)
          console.log('Product:', product)
          
          // Step 1: Try to get existing video URL
          let videoUrl = await resolveVideoUrlAsync({ jobId, record })

          // Prefer ASIN from the sheet for identification
          const asin = getValueFromRecord(record, process.env.CSV_COL_ASIN || 'ASIN,Parent_ASIN,SKU,Product_ID') || jobId
          
          // Step 2: If no video exists, create one with HeyGen
          if (!videoUrl || !(await urlLooksReachable(videoUrl))) {
            console.log('No existing video found. Creating new video with HeyGen...')
            
            // 2a: Generate marketing script with OpenAI
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
            
            // 2b: Create video with HeyGen
            if (script) {
              const hasHeyGenCreds = process.env.HEYGEN_API_KEY || process.env.GCP_SECRET_HEYGEN_API_KEY
              
              if (!hasHeyGenCreds) {
                console.error('❌ HeyGen credentials not configured. Set HEYGEN_API_KEY or GCP_SECRET_HEYGEN_API_KEY')
                console.warn('⏭️  Skipping row - cannot generate video without HeyGen credentials')
                continue
              }

              try {
                console.log('🎬 Creating video with HeyGen...')
                const heygenClient = await createHeyGenClient()
                
                // Map product to HeyGen payload with avatar/voice selection
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
                
                // Create video job
                const heygenJobId = await heygenClient.createVideoJob(payload)
                console.log('✅ Created HeyGen video job:', heygenJobId)
                
                // Write HeyGen mapping info back to sheet (optional)
                if (process.env.GS_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                  try {
                    const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
                    const sheetGid = extractGidFromCsv(csvUrl)
                    const { writeBackMappingsToSheet } = await import('./heygen-adapter')
                    await writeBackMappingsToSheet(spreadsheetId, String(sheetGid || 0), [{
                      HEYGEN_AVATAR: mapping.avatar,
                      HEYGEN_VOICE: mapping.voice,
                      HEYGEN_LENGTH_SECONDS: String(mapping.lengthSeconds),
                      HEYGEN_MAPPING_REASON: mapping.reason,
                      HEYGEN_MAPPED_AT: new Date().toISOString()
                    }])
                    console.log('✅ Wrote HeyGen mapping to sheet')
                  } catch (e: any) {
                    console.error('⚠️  Failed to write HeyGen mapping to sheet:', e?.message || e)
                  }
                }
                
                // Poll for video completion
                console.log('⏳ Waiting for HeyGen video completion...')
                videoUrl = await heygenClient.pollJobForVideoUrl(heygenJobId, {
                  timeoutMs: 25 * 60_000, // 25 minutes
                  intervalMs: 15_000 // Check every 15 seconds
                })
                console.log('✅ HeyGen video ready:', videoUrl)
              } catch (e: any) {
                console.error('❌ HeyGen video generation failed:', e?.message || e)
                console.warn('⏭️  Skipping row - video generation failed')
                addError(`HeyGen: ${product?.title || jobId} - ${e?.message || String(e)}`)
                continue
              }
            } else {
              console.error('❌ No script available for video generation')
              console.warn('⏭️  Skipping row - cannot generate video without script')
              continue
            }
            
            // 2c: Write video URL back to sheet (prefer fixed column letter if configured)
            if (videoUrl && (process.env.GS_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
              try {
                const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
                const sheetGid = extractGidFromCsv(csvUrl)
                if (targetColumnLetter) {
                  const { writeColumnLetterValues } = await import('./sheets')
                  await writeColumnLetterValues({
                    spreadsheetId,
                    sheetGid,
                    columnLetter: targetColumnLetter,
                    rows: [{ rowNumber, value: videoUrl }]
                  })
                } else {
                  await writeColumnValues({
                    spreadsheetId,
                    sheetGid,
                    headers,
                    columnName: process.env.CSV_COL_VIDEO_URL || 'Video URL',
                    rows: [{ rowNumber, value: videoUrl }],
                  })
                }
                console.log('✅ Wrote video URL to sheet')
              } catch (e: any) {
                console.error('⚠️  Failed to write video URL to sheet:', e?.message || e)
              }
            }
          } else {
            console.log('✅ Using existing video:', videoUrl)
          }
          
          // Step 3: If we still don't have a video, skip this row
          if (!videoUrl) {
            console.warn(`❌ No video URL available for row ${rowNumber}; skipping`)
            continue
          }
          
          // Step 3.5: Validate video URL is actually reachable before posting
          console.log('🔍 Validating video URL accessibility...')
          const isReachable = await urlLooksReachable(videoUrl)
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
          
          const caption: string = (product?.details ?? product?.title ?? product?.name ?? '').toString()

          // Respect posting windows: 9:00 AM and 5:00 PM Eastern
          const canPostNow = !enforcePostingWindows || isWithinPostingWindow()
          if (!canPostNow) {
            console.log('🕘 Outside posting window (9AM/5PM ET). Will not post, but video URL is ready:', videoUrl)
          }
          let postedAtLeastOne = false
          const platformResults: Record<string, { success: boolean; result?: any; error?: string }> = {}
          
          // Instagram
          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Instagram:', { videoUrl, caption })
            platformResults.instagram = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('instagram')) && process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
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
            } else {
              console.error('❌ Instagram post failed after all retries')
              platformResults.instagram = { success: false, error: 'Failed after 3 retries' }
              incrementFailedPost()
              addError(`Instagram: ${product?.title || jobId} - Failed after 3 retries`)
            }
          }
          // Twitter
          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Twitter:', { videoUrl, caption })
            platformResults.twitter = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('twitter')) && (process.env.TWITTER_BEARER_TOKEN || hasTwitterUploadCreds())) {
            const result = await retryWithBackoff(
              async () => {
                if (hasTwitterUploadCreds()) {
                  return await postToTwitter(videoUrl!, caption, process.env.TWITTER_BEARER_TOKEN ?? '')
                } else if (process.env.TWITTER_BEARER_TOKEN) {
                  return await postToTwitter(videoUrl!, caption, process.env.TWITTER_BEARER_TOKEN)
                }
              },
              { 
                maxRetries: 3,
                operation: 'Twitter post',
                initialDelayMs: 2000
              }
            )
            if (result) {
              console.log('✅ Posted to Twitter:', result)
              platformResults.twitter = { success: true, result }
              postedAtLeastOne = true
              incrementSuccessfulPost()
            } else {
              console.error('❌ Twitter post failed after all retries')
              platformResults.twitter = { success: false, error: 'Failed after 3 retries' }
              incrementFailedPost()
              addError(`Twitter: ${product?.title || jobId} - Failed after 3 retries`)
            }
          }
          // Pinterest
          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would post to Pinterest:', { videoUrl, caption })
            platformResults.pinterest = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('pinterest')) && process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
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
            } else {
              console.error('❌ Pinterest post failed after all retries')
              platformResults.pinterest = { success: false, error: 'Failed after 3 retries' }
              incrementFailedPost()
              addError(`Pinterest: ${product?.title || jobId} - Failed after 3 retries`)
            }
          }
          // YouTube
          if (dryRun || !canPostNow) {
            console.log('[DRY RUN] Would upload to YouTube:', { videoUrl, caption })
            platformResults.youtube = { success: true, result: 'DRY_RUN' }
          } else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('youtube')) && process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
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
                maxRetries: 2, // YouTube uploads are longer, fewer retries
                operation: 'YouTube upload',
                initialDelayMs: 5000
              }
            )
            if (result) {
              console.log('✅ Posted to YouTube:', result)
              platformResults.youtube = { success: true, result }
              postedAtLeastOne = true
              incrementSuccessfulPost()
            } else {
              console.error('❌ YouTube upload failed after all retries')
              platformResults.youtube = { success: false, error: 'Failed after 2 retries' }
              incrementFailedPost()
              addError(`YouTube: ${product?.title || jobId} - Failed after 2 retries`)
            }
          }
          
          
          // Blog Posting
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
          // Summary of platform results
          console.log('\n📊 Platform Posting Summary:', {
            product: product?.title || product?.name,
            videoUrl,
            captionLength: caption.length,
            results: platformResults,
            successCount: Object.values(platformResults).filter(r => r.success).length,
            totalAttempted: Object.keys(platformResults).length
          })
          
          // Mark row as posted if at least one platform succeeded
          if (!dryRun && postedAtLeastOne) {
            try {
              if (process.env.GS_SERVICE_ACCOUNT_EMAIL && process.env.GS_SERVICE_ACCOUNT_KEY) {
                const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
                const sheetGid = extractGidFromCsv(csvUrl)
                await markRowPosted({
                  spreadsheetId,
                  sheetGid,
                  rowNumber: rowNumber,
                  headers,
                  postedColumn: process.env.CSV_COL_POSTED || 'Posted',
                  timestampColumn: process.env.CSV_COL_POSTED_AT || 'Posted_At',
                })
              }
            } catch (err) {
              console.error('Failed to mark row posted:', err)
            }
            seen.add(jobId)
          }
          
          // Update status after each row
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
        console.log('No valid products found in sheet.')
        updateStatus({ status: 'idle-no-products' })
      }
    } catch (e: any) {
      console.error('Polling error:', e)
      addError(`Cycle error: ${e?.message || String(e)}`)
      updateStatus({ status: 'error' })
    }
  }
  if (runOnce) {
    await cycle()
    return
  }
  while (true) {
    await cycle()
    await sleep(intervalMs)
  }
}

main().catch(e => console.error(e))

function hasTwitterUploadCreds(): boolean {
  return Boolean(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractSpreadsheetIdFromCsv(csvUrl: string): string {
  // Expects /spreadsheets/d/<id>/export
  const m = csvUrl.match(/\/spreadsheets\/d\/([^/]+)/)
  if (!m) throw new Error('Unable to parse spreadsheetId from CSV_URL')
  return m[1]
}

function extractGidFromCsv(csvUrl: string): number | undefined {
  const m = csvUrl.match(/[?&]gid=(\d+)/)
  return m ? Number(m[1]) : undefined
}

// Build the video URL from CSV or template
async function resolveVideoUrlAsync(params: { jobId: string; record?: Record<string, string> }): Promise<string | undefined> {
  const { jobId, record } = params
  // 1) If CSV provides a direct video URL column (configurable), prefer that
  const directCol = (process.env.CSV_COL_VIDEO_URL || 'video_url,Video URL,VideoURL').split(',').map(s => s.trim())
  if (record) {
    for (const key of directCol) {
      const v = record[key]
      if (v && /^https?:\/\//i.test(v)) return v
    }
  }
  // 2) Template-based resolution (for backward compatibility with existing sheets)
  const template = process.env.VIDEO_URL_TEMPLATE || process.env.WAVE_VIDEO_URL_TEMPLATE || 'https://heygen.ai/jobs/{jobId}/video.mp4'
  return template
    .replaceAll('{jobId}', jobId)
    .replaceAll('{asin}', jobId)
}

// Quickly check if a URL is likely reachable. HEAD if supported; fallback to GET range probe.
async function urlLooksReachable(url: string): Promise<boolean> {
  const axios = await import('axios')
  try {
    const res = await axios.default.head(url, { validateStatus: () => true })
    if (res.status >= 200 && res.status < 400) return true
    if (res.status === 405 || res.status === 403) return true // HEAD not allowed but likely exists
  } catch {}
  try {
    const res = await axios.default.get(url, {
      headers: { Range: 'bytes=0-0' },
      validateStatus: () => true,
      responseType: 'stream',
    })
    return res.status >= 200 && res.status < 400
  } catch {
    return false
  }
}

// Posting windows: allow posting within 5 minutes of 9:00 AM or 5:00 PM Eastern
function isWithinPostingWindow(): boolean {
  try {
    const nowUtc = new Date()
    // Offsets to Eastern Time (naive: use -4 in DST, -5 otherwise); allow override via env
    const offset = Number(process.env.EASTERN_UTC_OFFSET_HOURS || '-4')
    const nowEt = new Date(nowUtc.getTime() + offset * 3600 * 1000)
    const hour = nowEt.getUTCHours()
    const minute = nowEt.getUTCMinutes()
    // 9:00 and 17:00 ET with 5-minute window
    const windows = [
      { h: (9 - offset + 24) % 24, m: 0 },
      { h: (17 - offset + 24) % 24, m: 0 },
    ]
    for (const w of windows) {
      if (hour === w.h && Math.abs(minute - w.m) <= 5) return true
    }
    return false
  } catch {
    return true // fail-open to avoid blocking
  }
}

// Helper: pull first non-empty value for comma-separated header candidates
function getValueFromRecord(record: Record<string, string> | undefined, columnsCsv: string): string | undefined {
  if (!record) return undefined
  for (const key of columnsCsv.split(',').map(s => s.trim())) {
    const v = record[key]
    if (v && String(v).trim().length > 0) return v
  }
  return undefined
}
