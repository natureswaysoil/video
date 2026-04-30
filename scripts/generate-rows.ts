import 'dotenv/config'
import { google } from 'googleapis'
import { createGoogleAuthClient } from '../src/google-auth'
import { getDailySeeds } from '../src/content-seed-bank'
import { loadSecretsToEnv } from '../src/secret-manager'

async function main() {
  await loadSecretsToEnv(['CSV_URL', 'GOOGLE_SHEET_CSV_URL', 'GS_SHEET_NAME'])

  const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL
  if (!csvUrl) throw new Error('CSV_URL / GOOGLE_SHEET_CSV_URL not set. Add it to Google Secret Manager or .env.local.')

  const match = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) throw new Error('Invalid sheet URL')

  const spreadsheetId = match[1]
  const sheetName = process.env.GS_SHEET_NAME || 'Product_Automation'
  const count = Number(process.env.DAILY_ROW_COUNT || '5')

  const authClient = await createGoogleAuthClient(['https://www.googleapis.com/auth/spreadsheets'])
  const sheets = google.sheets({ version: 'v4', auth: authClient })

  const seeds = getDailySeeds(count)

  const rows = seeds.map((seed) => [
    seed.title,
    seed.productDescription,
    seed.visualPrompt,
    seed.websiteUrl,
    seed.platform,
    '', // Posted
    '', // Posted_At
  ])

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: rows,
    },
  })

  console.log(`✅ Added ${rows.length} new rows to ${sheetName}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
