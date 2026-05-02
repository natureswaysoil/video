// src/analytics-tracker.ts
import { google } from 'googleapis'
import { createGoogleAuthClient } from './google-auth'
import { getLogger } from './logger'

const logger = getLogger()

/**
 * Logs video post details + platform URLs back to your exact Google Sheet
 */
export async function logVideoPost(
  sheetId: string,
  gid: string,
  rows: Array<{
    rowIndex: number
    productId: string
    postedAt: string
    instagramUrl?: string
    xUrl?: string
    pinterestUrl?: string
    youtubeUrl?: string
  }>
) {
  try {
    const auth = await createGoogleAuthClient(['https://www.googleapis.com/auth/spreadsheets'])
    const sheets = google.sheets({ version: 'v4', auth: auth as any })

    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
    const sheet = meta.data.sheets?.find((s: any) => String(s.properties?.sheetId) === String(gid))
    if (!sheet) throw new Error(`Sheet gid ${gid} not found`)

    const sheetTitle = sheet.properties!.title!

    // Write the data into the exact columns you just added
    const values = rows.map(r => [
      r.postedAt,                    // Instagram_Post_URL
      r.instagramUrl || '',
      r.xUrl || '',
      r.pinterestUrl || '',
      r.youtubeUrl || '',
      new Date().toISOString()       // Last_Metrics_Checked_At
    ])

    // Find the starting column (your new columns start at BZ)
    const startCol = 'BZ'   // ← matches the 5 columns you just added

    const range = `${sheetTitle}!${startCol}2:${startCol}999`

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values },
    })

    logger.info(`✅ Logged ${rows.length} video posts to your sheet`, 'Analytics')
    return true
  } catch (error) {
    logger.error('Failed to log video posts', 'Analytics', {}, error)
    return false
  }
}

export default { logVideoPost }
