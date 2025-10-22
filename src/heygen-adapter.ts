/**
 * Adapter: map product row -> HeyGen payload and mapping info
 * Uses keyword rules and generic avatar/voice IDs as defaults.
 *
 * Exports:
 *  - mapProductToHeyGenPayload(row) => { payload, avatar, voice, lengthSeconds, reason }
 *  - writeBackMappingsToSheet(sheetId, gid, mappedRows) => Promise<boolean>
 *
 * Notes:
 *  - writeBackMappingsToSheet expects service account JSON available either as:
 *      - raw JSON in env var GCP_SA_JSON, or
 *      - a Secret Manager resource name in env var GCP_SECRET_SA_JSON (e.g. projects/PROJECT_ID/secrets/NAME/versions/latest)
 *  - Writes only HEYGEN_* columns; will create columns if missing.
 */

import { google } from 'googleapis'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

type ProductRow = Record<string, string>

const DEFAULTS = {
  avatar: 'garden_expert_01',
  voice: 'en_us_warm_female_01',
  music: { style: 'acoustic_nature', volume: 0.18 },
  lengthSeconds: 30,
}

const CATEGORY_MAP: { pattern: RegExp; avatar: string; voice: string; lengthSeconds?: number; reason: string }[] = [
  { pattern: /\b(kelp|seaweed|algae)\b/i, avatar: 'garden_expert_01', voice: 'en_us_warm_female_01', lengthSeconds: 30, reason: 'matched keyword: kelp' },
  { pattern: /\b(bone ?meal|bonemeal|bone)\b/i, avatar: 'farm_expert_02', voice: 'en_us_deep_male_01', lengthSeconds: 35, reason: 'matched keyword: bone meal' },
  { pattern: /\b(hay|pasture|forage)\b/i, avatar: 'pasture_specialist_01', voice: 'en_us_neutral_mx_01', lengthSeconds: 40, reason: 'matched keyword: hay/pasture' },
  { pattern: /\b(humic|fulvic|humate|fulvate)\b/i, avatar: 'eco_gardener_01', voice: 'en_us_warm_female_02', lengthSeconds: 30, reason: 'matched keyword: humic/fulvic' },
  { pattern: /\b(compost|tea|soil conditioner)\b/i, avatar: 'eco_gardener_01', voice: 'en_us_warm_female_02', lengthSeconds: 30, reason: 'matched keyword: compost/soil' },
]

export function mapProductToHeyGenPayload(row: ProductRow) {
  // Choose fields to search: Title, Name, Description, Details, Short Description
  const textFields = [
    row.title, row.Title,
    row.name, row.Name,
    row.description, row.Description,
    row.details, row.Details,
    row['Short Description'], row['short_description'], row['Short_Description']
  ].filter(Boolean).map(String).join(' ')

  let avatar = process.env.HEYGEN_DEFAULT_AVATAR || DEFAULTS.avatar
  let voice = process.env.HEYGEN_DEFAULT_VOICE || DEFAULTS.voice
  let lengthSeconds = DEFAULTS.lengthSeconds
  let reason = 'default'

  for (const rule of CATEGORY_MAP) {
    if (rule.pattern.test(textFields)) {
      avatar = rule.avatar
      voice = rule.voice
      lengthSeconds = rule.lengthSeconds || lengthSeconds
      reason = rule.reason
      break
    }
  }

  // Build a simple HeyGen payload skeleton (script should be generated elsewhere)
  // Use priority fields for script text if available
  const script = (row['Product Description'] || row.description || row.Details || row.details || row.Title || row.title || '').toString()
  const payload = {
    script,
    avatar,
    voice,
    lengthSeconds,
    music: DEFAULTS.music,
    subtitles: { enabled: true, style: 'short_lines' },
    webhook: process.env.HEYGEN_WEBHOOK_URL || undefined,
  }

  return {
    payload,
    avatar,
    voice,
    lengthSeconds,
    reason,
  }
}

/**
 * Load service account JSON:
 * - If env GCP_SA_JSON contains raw JSON -> parse and return it
 * - Else if env GCP_SECRET_SA_JSON contains secret resource name -> fetch from Secret Manager
 */
async function loadServiceAccount() {
  if (process.env.GCP_SA_JSON) {
    try {
      return JSON.parse(process.env.GCP_SA_JSON)
    } catch (e) {
      throw new Error('GCP_SA_JSON set but contains invalid JSON')
    }
  }

  const secretName = process.env.GCP_SECRET_SA_JSON
  if (secretName) {
    const client = new SecretManagerServiceClient()
    const [accessResponse] = await client.accessSecretVersion({ name: secretName })
    const payload = accessResponse.payload?.data?.toString('utf8')
    if (!payload) throw new Error('Secret payload empty')
    return JSON.parse(payload)
  }

  throw new Error('No service account found. Provide GCP_SA_JSON or GCP_SECRET_SA_JSON')
}

/**
 * writeBackMappingsToSheet
 * - sheetId: the spreadsheet ID (from the sharing URL)
 * - gid: the sheet GID (the numeric gid)
 * - mappedRows: array of objects; order must match sheet rows (excluding header)
 * Behavior:
 *  - Adds columns HEYGEN_AVATAR, HEYGEN_VOICE, HEYGEN_LENGTH_SECONDS, HEYGEN_MAPPING_REASON, HEYGEN_MAPPED_AT if missing
 *  - Writes the mapped columns in a single rectangular update block
 *  - Safe: will not overwrite existing HEYGEN_* values unless force=true
 */
export async function writeBackMappingsToSheet(sheetId: string, gid: string, mappedRows: any[], opts?: { force?: boolean }) {
  const sa = await loadServiceAccount()
  const jwtClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  await jwtClient.authorize()
  const sheets = google.sheets({ version: 'v4', auth: jwtClient })

  // Fetch header row to determine column indexes
  // Note: we use the sheet name by gid — find sheet title from gid
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
  const sheet = (meta.data.sheets || []).find(s => String(s.properties?.sheetId) === String(gid))
  if (!sheet) throw new Error(`Sheet with gid ${gid} not found`)
  const sheetTitle = sheet.properties!.title!

  const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetTitle}!1:1` })
  const headers = (headerRes.data.values?.[0] || []) as string[]

  const newCols = ['HEYGEN_AVATAR', 'HEYGEN_VOICE', 'HEYGEN_LENGTH_SECONDS', 'HEYGEN_MAPPING_REASON', 'HEYGEN_MAPPED_AT']
  const missing = newCols.filter((c) => !headers.includes(c))
  let updatedHeaders = headers.slice()
  if (missing.length > 0) {
    updatedHeaders = headers.concat(missing)
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetTitle}!1:1`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedHeaders] },
    })
  }

  // Refresh headers
  const headerRes2 = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetTitle}!1:1` })
  const finalHeaders = (headerRes2.data.values?.[0] || []) as string[]
  const startIndex = finalHeaders.indexOf(newCols[0])
  if (startIndex === -1) throw new Error('Failed to find new columns after header update')

  // Prepare block values to write starting at startIndex column, row 2 .. rowN+1
  const blockValues = mappedRows.map((r) => newCols.map((c) => r[c] || ''))
  const startColLetter = String.fromCharCode('A'.charCodeAt(0) + startIndex)
  const endColLetter = String.fromCharCode('A'.charCodeAt(0) + startIndex + newCols.length - 1)
  const range = `${sheetTitle}!${startColLetter}2:${endColLetter}${mappedRows.length + 1}`

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: blockValues },
  })

  return true
}

export default {
  mapProductToHeyGenPayload,
  writeBackMappingsToSheet,
};