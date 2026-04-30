import 'dotenv/config'
import { loadSecretsToEnv } from './secret-manager'
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
  addError,
} from './health-server'
import { getAuditLogger } from './audit-logger'
import { validateConfig } from './config-validator'

// 🔐 NEW: Load ALL secrets at startup (once)
async function bootstrapSecrets() {
  console.log('🔐 Loading secrets from Google Secret Manager...')
  await loadSecretsToEnv()
  console.log('🔐 Secret load complete')
}

const auditLogger = getAuditLogger()

type VideoState = {
  videoId?: string
  videoUrl?: string
  videoStatus?: string
}

type Platform = 'instagram' | 'twitter' | 'pinterest' | 'youtube'

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

function extractSpreadsheetIdFromCsv(csvUrl: string): string {
  const match = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (match?.[1]) return match[1]
  const idParam = csvUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/)
  if (idParam?.[1]) return idParam[1]
  throw new Error('Could not extract spreadsheet ID from CSV URL')
}

function extractGidFromCsv(csvUrl: string): string | undefined {
  const match = csvUrl.match(/[?&]gid=([^&]+)/)
  return match?.[1]
}

function getValueFromRecord(record: Record<string, any> | undefined, keysCsv: string): string {
  const keys = keysCsv.split(',').map((key) => key.trim()).filter(Boolean)
  return pickFirstNonEmpty(record, keys)
}

function isRowDeferred(record: Record<string, any> | undefined): boolean {
  const raw = pickFirstNonEmpty(record, ['Post_Next_Attempt_At'])
  if (!raw) return false
  const when = Date.parse(raw)
  return Number.isFinite(when) && when > Date.now()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadSecretToEnv(secretName: string): Promise<void> {
  if (process.env[secretName]) return

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT
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
    }
  } catch (error: any) {
    console.warn(`Could not load secret ${secretName}:`, error?.message || error)
  }
}

async function writeRowFields(
  csvUrl: string,
  headers: string[],
  rowNumber: number,
  updates: Record<string, string>
): Promise<void> {
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

async function resolveVideoUrlAsync(params: {
  jobId: string
  record: Record<string, any> | undefined
}): Promise<string> {
  const directUrl = pickFirstNonEmpty(params.record, [
    'Video_URL',
    'Video URL',
    'video_url',
    'VideoURL',
    'WAVESPEED_VIDEO_URL',
    'WaveSpeed Video URL',
  ])
  return directUrl
}

async function postToEnabledPlatforms(params: {
  videoUrl: string
  product: Record<string, any>
  enabledPlatforms: Set<string>
  dryRun: boolean
}): Promise<void> {
  const { videoUrl, product, enabledPlatforms, dryRun } = params
  const caption = String(product.caption || product.Caption || product.details || product.description || product.title || product.name || '').trim()
  const title = String(product.title || product.name || 'Nature\'s Way Soil').trim()

  const allPlatforms: Platform[] = ['instagram', 'twitter', 'pinterest', 'youtube']
  const shouldPost = (platform: Platform) => enabledPlatforms.size === 0 || enabledPlatforms.has(platform)

  if (dryRun) {
    console.log('DRY_RUN_LOG_ONLY=true — skipping platform posting', { title, videoUrl })
    return
  }

  if (shouldPost('instagram')) await postToInstagram({ videoUrl, caption })
  if (shouldPost('twitter')) await postToTwitter({ videoUrl, text: caption || title })
  if (shouldPost('pinterest')) await postToPinterest({ videoUrl, title, description: caption })
  if (shouldPost('youtube')) await postToYouTube({ videoUrl, title, description: caption })

  const skipped = allPlatforms.filter((platform) => !shouldPost(platform))
  if (skipped.length > 0) console.log('Skipped disabled platforms:', skipped.join(', '))
}

async function createOrPollVideo(params: {
  product: Record<string, any>
  record: Record<string, any>
  headers: string[]
  rowNumber: number
  csvUrl: string
  alwaysGenerate: boolean
}): Promise<string> {
  const { product, record, headers, rowNumber, csvUrl, alwaysGenerate } = params
  const videoState = getVideoState(record)

  if (videoState.videoUrl && !alwaysGenerate) {
    console.log('✅ Using existing video:', videoState.videoUrl)
    return videoState.videoUrl
  }

  const heygenClient = await createHeyGenClient()

  if (!alwaysGenerate && videoState.videoId && (videoState.videoStatus || '').toLowerCase() === 'processing') {
    console.log(`⏳ Polling existing HeyGen job for row ${rowNumber}: ${videoState.videoId}`)
    const videoUrl = await heygenClient.pollJobForVideoUrl(videoState.videoId, {
      timeoutMs: Number(process.env.HEYGEN_POLL_TIMEOUT_MS || 120000),
      intervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 15000),
    })
    await writeRowFields(csvUrl, headers, rowNumber, {
      Video_URL: videoUrl,
      Video_Status: 'completed',
      Video_Completed_At: new Date().toISOString(),
    })
    return videoUrl
  }

  const mapping = mapProductToHeyGenPayload(record)
  const generatedScript = await generateScript(product)
  const payload = {
    ...mapping.payload,
    script: generatedScript,
  }

  const videoId = await heygenClient.createVideoJob(payload)
  await writeRowFields(csvUrl, headers, rowNumber, {
    Video_ID: videoId,
    Video_Status: 'processing',
    HEYGEN_AVATAR: mapping.avatar,
    HEYGEN_VOICE: mapping.voice,
    HEYGEN_LENGTH_SECONDS: String(mapping.lengthSeconds),
    HEYGEN_MAPPING_REASON: mapping.reason,
    HEYGEN_MAPPED_AT: new Date().toISOString(),
  })

  const videoUrl = await heygenClient.pollJobForVideoUrl(videoId, {
    timeoutMs: Number(process.env.HEYGEN_POLL_TIMEOUT_MS || 120000),
    intervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 15000),
  })

  await writeRowFields(csvUrl, headers, rowNumber, {
    Video_URL: videoUrl,
    Video_Status: 'completed',
    Video_Completed_At: new Date().toISOString(),
  })

  return videoUrl
}

async function main(): Promise<void> {
  // 🔐 ensure secrets are loaded before anything else
  await bootstrapSecrets()

  try {
    console.log('Validating configuration before starting polling...')
    await validateConfig()
    console.log('Configuration validated')
  } catch (error) {
    console.error('❌ Configuration validation failed:', error)
    process.exit(1)
  }

  // Backward compatibility: still attempt specific loads if missing
  await loadSecretToEnv('GOOGLE_SHEET_CSV_URL')
  await loadSecretToEnv('CSV_URL')

  const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL
  console.log('GOOGLE_SHEET_CSV_URL loaded:', !!process.env.GOOGLE_SHEET_CSV_URL)

  if (!csvUrl) throw new Error('CSV_URL / GOOGLE_SHEET_CSV_URL not set')

  const seen = new Set<string>()
  const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? '60000')
  const runOnce = String(process.env.RUN_ONCE || '').toLowerCase() === 'true'
  const rowsPerRun = Number(process.env.ROWS_PER_RUN ?? '1')
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase()
  const enabledPlatforms = new Set(enabledPlatformsEnv.split(',').map((s) => s.trim()).filter(Boolean))
  const loopResetPosted = String(process.env.LOOP_RESET_POSTED || 'false').toLowerCase() === 'true'
  const alwaysGenerate = String(process.env.ALWAYS_GENERATE_NEW_VIDEO || 'false').toLowerCase() === 'true'

  if (!process.env.VERCEL) startHealthServer()

  auditLogger.logEvent({
    level: 'INFO',
    category: 'SYSTEM',
    message: 'Video posting system started',
    details: { runOnce, dryRun, enabledPlatforms: enabledPlatformsEnv || 'all', pollIntervalMs: intervalMs },
  })

  const cycle = async (): Promise<void> => {
    updateStatus({ status: 'processing', rowsProcessed: 0 })
    const result = await processCsvUrl(csvUrl)

    if (result.skipped || result.rows.length === 0) {
      updateStatus({ status: 'idle', rowsProcessed: 0 })
      return
    }

    let rowsThisCycle = 0

    for (const { product, jobId, rowNumber, headers, record } of result.rows) {
      if (!jobId || seen.has(jobId)) continue
      if (isRowDeferred(record)) continue
      if (rowsThisCycle >= rowsPerRun) break

      console.log(`\n========== Processing Row ${rowNumber} ==========`)
      console.log('Product:', product)

      try {
        const videoUrl = await createOrPollVideo({ product, record, headers, rowNumber, csvUrl, alwaysGenerate })
        await postToEnabledPlatforms({ videoUrl, product, enabledPlatforms, dryRun })

        const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
        const sheetGid = extractGidFromCsv(csvUrl)
        await markRowPosted({ spreadsheetId, sheetGid, rowNumber, headers })

        seen.add(jobId)
        rowsThisCycle++
        incrementSuccessfulPost()
        updateStatus({ status: 'processed-row', rowsProcessed: rowsThisCycle })
      } catch (error: any) {
        incrementFailedPost()
        addError(error?.message || String(error))
        auditLogger.logEvent({
          level: 'ERROR',
          category: 'POSTING',
          message: 'Failed to process row',
          rowNumber,
          product: product?.title || product?.name,
          details: { error: error?.message || String(error) },
        })
        await writeRowFields(csvUrl, headers, rowNumber, {
          Video_Status: 'failed',
          Last_Error: error?.message || String(error),
          Last_Error_At: new Date().toISOString(),
        })
      }
    }

    if (loopResetPosted && rowsThisCycle === 0) {
      const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
      const sheetGid = extractGidFromCsv(csvUrl)
      await resetPostedColumn({
        spreadsheetId,
        sheetGid,
        totalRows: result.rows.length,
        headers: result.rows[0]?.headers || [],
      })
      seen.clear()
    }

    updateStatus({ status: 'idle', rowsProcessed: rowsThisCycle })
  }

  do {
    await cycle()
    if (!runOnce) await sleep(intervalMs)
  } while (!runOnce)
}

process.on('SIGINT', async () => {
  stopHealthServer()
  process.exit(0)
})

main().catch((error) => {
  console.error('Fatal error:', error)
  addError(error?.message || String(error))
  stopHealthServer()
  process.exit(1)
})
