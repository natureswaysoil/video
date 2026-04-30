import 'dotenv/config'
import { google } from 'googleapis'
import { createGoogleAuthClient } from '../src/google-auth'
import { getDailySeeds } from '../src/content-seed-bank'

async function main() {
  const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL
  if (!csvUrl) throw new Error('CSV_URL not set')

  const match = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) throw new Error('Invalid sheet URL')

  const spreadsheetId = match[1]

  const authClient = await createGoogleAuthClient(['https://www.googleapis.com/auth/spreadsheets'])
  const sheets = google.sheets({ version: 'v4', auth: authClient })

  const seeds = getDailySeeds(5)

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
    range: 'Product_Automation!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: rows,
    },
  })

  console.log(`✅ Added ${rows.length} new rows for today`)
}

main().catch(console.error)
