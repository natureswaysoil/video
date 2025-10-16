import 'dotenv/config'
import { processCsvUrl } from '../src/core'
import { generateScript } from '../src/openai'
import { createWaveSpeedPrediction, pollWaveSpeedUntilReady } from '../src/wavespeed'
import { writeColumnValues, markRowPosted } from '../src/sheets'
import { postToTwitter } from '../src/twitter'

function extractSpreadsheetIdFromCsv(csvUrl: string): string {
  const m = csvUrl.match(/\/spreadsheets\/d\/([^/]+)/)
  if (!m) throw new Error('Unable to parse spreadsheetId from CSV_URL')
  return m[1]
}

function extractGidFromCsv(csvUrl: string): number | undefined {
  const m = csvUrl.match(/[?&]gid=(\d+)/)
  return m ? Number(m[1]) : undefined
}

async function main() {
  const csvUrl = process.env.CSV_URL as string
  if (!csvUrl) throw new Error('CSV_URL not set')

  // 1) Get first eligible row
  const { rows } = await processCsvUrl(csvUrl)
  if (!rows.length) {
    console.log('No rows to process')
    return
  }
  const row = rows[0]
  const product = row.product
  const jobIdHint = row.jobId // may be ASIN or your own ID; used only for context

  // 2) Generate a short marketing script with OpenAI
  let script: string | undefined
  if (process.env.OPENAI_API_KEY) {
    try {
      script = await generateScript(product)
      console.log('Generated script:', script)
    } catch (e: any) {
      console.log('OpenAI script generation failed:', e?.message || e)
    }
  } else {
    console.log('OPENAI_API_KEY missing; skipping script generation')
  }

  // 3) Create a WaveSpeed prediction (requires WAVE_CREATE_PATH + API key)
  let predictionId: string | undefined
  if (script && (process.env.WAVE_SPEED_API_KEY || process.env.WAVESPEED_API_KEY || process.env.GS_API_KEY) && process.env.WAVE_CREATE_PATH) {
    try {
      const { id } = await createWaveSpeedPrediction({ script, jobId: jobIdHint })
      predictionId = id
      console.log('Created WaveSpeed prediction:', id)
    } catch (e: any) {
      console.log('WaveSpeed create failed:', e?.message || e)
    }
  } else {
    console.log('Skipping WaveSpeed create (missing script or API create config)')
  }

  // 4) Poll for result and get video URL
  let videoUrl: string | undefined
  if (predictionId) {
    try {
      videoUrl = await pollWaveSpeedUntilReady(predictionId, { timeoutMs: 10 * 60_000, intervalMs: 10_000 })
      console.log('Resolved video URL:', videoUrl)
    } catch (e: any) {
      console.log('WaveSpeed poll failed:', e?.message || e)
    }
  }

  // 5) Write Video URL back to the sheet (requires Sheets access)
  if (videoUrl && (process.env.GS_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    try {
      const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
      const sheetGid = extractGidFromCsv(csvUrl)
      await writeColumnValues({
        spreadsheetId,
        sheetGid,
        headers: row.headers,
        columnName: process.env.CSV_COL_VIDEO_URL || 'Video URL',
        rows: [{ rowNumber: row.rowNumber, value: videoUrl }],
      })
      console.log('Wrote Video URL to sheet')
    } catch (e: any) {
      console.log('Failed to write Video URL to sheet:', e?.message || e)
    }
  }

  // 6) Post to Twitter (text-only) if bearer token is present
  if (videoUrl && process.env.TWITTER_BEARER_TOKEN) {
    const caption = String(product.details || product.title || '')
    try {
      await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN)
      console.log('Posted to Twitter')
    } catch (e: any) {
      console.log('Twitter post failed:', e?.message || e)
    }
  }

  // 7) Mark row posted if write-back is configured
  if (process.env.GS_SERVICE_ACCOUNT_EMAIL && process.env.GS_SERVICE_ACCOUNT_KEY) {
    try {
      const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
      const sheetGid = extractGidFromCsv(csvUrl)
      await markRowPosted({
        spreadsheetId,
        sheetGid,
        rowNumber: row.rowNumber,
        headers: row.headers,
        postedColumn: process.env.CSV_COL_POSTED || 'Posted',
        timestampColumn: process.env.CSV_COL_POSTED_AT || 'Posted_At',
      })
      console.log('Marked row as Posted')
    } catch (e: any) {
      console.log('Failed to mark row posted:', e?.message || e)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
