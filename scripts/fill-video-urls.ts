import 'dotenv/config'
import axios from 'axios'
import { processCsvUrl } from '../src/core'
import { fetchVideoUrlFromWaveSpeed } from '../src/wavespeed'
import { writeColumnValues } from '../src/sheets'

function extractSpreadsheetIdFromCsv(csvUrl: string): string {
  const m = csvUrl.match(/\/spreadsheets\/d\/([^/]+)/)
  if (!m) throw new Error('Unable to parse spreadsheetId from CSV_URL')
  return m[1]
}

function extractGidFromCsv(csvUrl: string): number | undefined {
  const m = csvUrl.match(/[?&]gid=(\d+)/)
  return m ? Number(m[1]) : undefined
}

async function urlLooksReachable(url: string): Promise<boolean> {
  try {
    const res = await axios.head(url, { validateStatus: () => true })
    if (res.status >= 200 && res.status < 400) return true
    if (res.status === 405 || res.status === 403) return true
  } catch {}
  try {
    const res = await axios.get(url, { headers: { Range: 'bytes=0-0' }, validateStatus: () => true, responseType: 'stream' })
    return res.status >= 200 && res.status < 400
  } catch { return false }
}

async function main() {
  const csvUrl = process.env.CSV_URL as string
  if (!csvUrl) throw new Error('CSV_URL not set')
  const columnName = process.env.CSV_COL_VIDEO_URL || 'Video URL'

  const result = await processCsvUrl(csvUrl)
  if (result.skipped || result.rows.length === 0) {
    console.log('No rows found')
    return
  }
  const toWrite: Array<{ rowNumber: number; value: string | undefined }> = []
  for (const row of result.rows) {
    const jobId = row.jobId
    // Try API lookup first
    const viaApi = await fetchVideoUrlFromWaveSpeed(jobId)
    let chosen = viaApi
    if (!chosen) {
      // Fallback to template
      const template = process.env.WAVE_VIDEO_URL_TEMPLATE || 'https://wavespeed.ai/jobs/{jobId}/video.mp4'
      chosen = template.replaceAll('{jobId}', jobId).replaceAll('{asin}', jobId)
    }
    if (chosen) {
      const ok = await urlLooksReachable(chosen)
      if (!ok) {
        console.log(`Unreachable: ${chosen} for row ${row.rowNumber}`)
      }
      toWrite.push({ rowNumber: row.rowNumber, value: chosen })
    }
  }
  const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl)
  const sheetGid = extractGidFromCsv(csvUrl)
  await writeColumnValues({
    spreadsheetId,
    sheetGid,
    headers: result.rows[0].headers,
    columnName,
    rows: toWrite,
  })
  console.log(`Wrote ${toWrite.length} values to column "${columnName}"`)
}

main().catch(e => { console.error(e); process.exit(1) })
