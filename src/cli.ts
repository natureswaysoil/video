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

             
