/**
 * Adapter: map a product row into a safe HeyGen payload.
 * Category rules control creative direction only. Avatar/voice IDs come from
 * configured HeyGen defaults or sheet overrides so fake IDs are never sent.
 */

import { google } from 'googleapis'
import { createGoogleAuthClient } from './google-auth'

type ProductRow = Record<string, string>

const DEFAULTS = {
  lengthSeconds: 30,
  music: { style: 'acoustic_nature', volume: 0.16 },
}

const CATEGORY_MAP: { pattern: RegExp; lengthSeconds?: number; reason: string; visualHint: string }[] = [
  { pattern: /\b(dog|urine|pet|odor|yellow spot)\b/i, lengthSeconds: 30, reason: 'matched keyword: dog/pet lawn', visualHint: 'dog on lawn, yellow grass spot problem, homeowner using hose-end sprayer, even lawn application, healthy green turf, product bottle visible' },
  { pattern: /\b(spray\s*pattern|indicator|coverage\s*indicator|applicator|lawn\s*spray)\b/i, lengthSeconds: 30, reason: 'matched keyword: spray/indicator', visualHint: 'lawn sprayer application, visible spray coverage on grass, hose-end sprayer, even distribution, product bottle on lawn, healthy green grass' },
  { pattern: /\b(kelp|seaweed|algae)\b/i, lengthSeconds: 30, reason: 'matched keyword: kelp', visualHint: 'healthy green plants, liquid seaweed fertilizer, measuring cup, watering can, garden beds, close plant detail, natural sunlight' },
  { pattern: /\b(bone ?meal|bonemeal|bone)\b/i, lengthSeconds: 32, reason: 'matched keyword: bone meal', visualHint: 'flowering plants, root-zone soil, liquid fertilizer application, garden bed, product bottle near plants, healthy blooms' },
  { pattern: /\b(hay|pasture|forage)\b/i, lengthSeconds: 35, reason: 'matched keyword: hay/pasture', visualHint: 'green pasture field, healthy forage, tractor or sprayer application, farm fence line, close grass growth, product container' },
  { pattern: /\b(humic|fulvic|humate|fulvate|biochar|compost|worm|casting|soil conditioner)\b/i, lengthSeconds: 30, reason: 'matched keyword: soil amendment', visualHint: 'dark rich soil, active root zone, hands holding healthy soil, raised beds, lawn and garden application, product bottle, healthy plants' },
]

function first(row: ProductRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function cleanForPrompt(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim().slice(0, 1100)
}

function buildVisualPrompt(row: ProductRow, title: string, details: string, visualHint: string): string {
  const existingPrompt = first(row, ['Visual_Prompt', 'visual_prompt', 'Video_Prompt', 'video_prompt', 'Scene_Prompt', 'scene_prompt', 'Image_Prompt', 'image_prompt', 'Creative_Brief', 'creative_brief'])
  if (existingPrompt) return cleanForPrompt(existingPrompt)

  return cleanForPrompt(
    `Create a conversion-focused vertical product ad for Nature's Way Soil. Product: ${title}. Details: ${details}. ` +
    `Visual direction: ${visualHint}. Open with the customer's problem or desired result, quickly show the product, then show realistic use and a healthy outcome. ` +
    `Favor real lawn, garden, pasture, soil, roots, watering, and spraying footage. Keep the product visually prominent in at least one scene. ` +
    `Use warm natural light and a clean trustworthy farm-and-garden look. Do not use blank color cards, green screens, fake product labels, storyboard text, or production notes as visuals.`
  )
}

export function mapProductToHeyGenPayload(row: ProductRow) {
  const textFields = [row.title, row.Title, row.name, row.Name, row.description, row.Description, row.details, row.Details, row['Short Description'], row.short_description, row.Short_Description]
    .filter(Boolean).map(String).join(' ')

  let lengthSeconds = DEFAULTS.lengthSeconds
  let reason = 'default'
  let visualHint = 'organic lawn and garden product, customer problem, product bottle, real application, healthy plants, rich soil, natural outdoor setting'

  for (const rule of CATEGORY_MAP) {
    if (rule.pattern.test(textFields)) {
      lengthSeconds = rule.lengthSeconds || lengthSeconds
      reason = rule.reason
      visualHint = rule.visualHint
      break
    }
  }

  const avatar = first(row, ['HEYGEN_AVATAR', 'HeyGen_Avatar', 'Avatar_ID']) || process.env.HEYGEN_DEFAULT_AVATAR || ''
  const voice = first(row, ['HEYGEN_VOICE', 'HeyGen_Voice', 'Voice_ID']) || process.env.HEYGEN_DEFAULT_VOICE || ''
  const title = first(row, ['Title', 'title', 'Product', 'product', 'Name', 'name']) || "Nature's Way Soil product"
  const details = first(row, ['Product Description', 'description', 'Description', 'Details', 'details', 'caption', 'Caption'])
  const script = (row['Product Description'] || row.description || row.Details || row.details || row.Title || row.title || '').toString()
  const imageUrl = first(row, ['Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url', 'Main_Image_URL', 'main_image_url', 'Background_Image_URL', 'background_image_url', 'Hero_Image_URL', 'hero_image_url'])
  const visualPrompt = buildVisualPrompt(row, title, details, visualHint)

  return {
    payload: {
      script,
      avatar,
      voice,
      lengthSeconds,
      music: DEFAULTS.music,
      subtitles: { enabled: true, style: 'short_lines' },
      webhook: process.env.HEYGEN_WEBHOOK_URL || undefined,
      title,
      visualPrompt,
      imageUrl: imageUrl || undefined,
      meta: { productTitle: title, visualHint, sourceImageUrl: imageUrl || undefined },
    },
    avatar,
    voice,
    lengthSeconds,
    reason,
    visualHint,
  }
}

async function createSheetsAuthClient() {
  return createGoogleAuthClient(['https://www.googleapis.com/auth/spreadsheets'])
}

export async function writeBackMappingsToSheet(sheetId: string, gid: string, mappedRows: any[], opts?: { force?: boolean }) {
  const authClient = await createSheetsAuthClient()
  if (typeof (authClient as any).authorize === 'function') await (authClient as any).authorize()
  const sheets = google.sheets({ version: 'v4', auth: authClient as any })

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
  const sheet = (meta.data.sheets || []).find((s: any) => String(s.properties?.sheetId) === String(gid))
  if (!sheet) throw new Error(`Sheet with gid ${gid} not found`)
  const sheetTitle = sheet.properties!.title!

  const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetTitle}!1:1` })
  const headers = (headerRes.data.values?.[0] || []) as string[]
  const newCols = ['HEYGEN_AVATAR', 'HEYGEN_VOICE', 'HEYGEN_LENGTH_SECONDS', 'HEYGEN_MAPPING_REASON', 'HEYGEN_MAPPED_AT']
  const missing = newCols.filter((c) => !headers.includes(c))

  if (missing.length > 0) {
    await sheets.spreadsheets.values.update({ spreadsheetId: sheetId, range: `${sheetTitle}!1:1`, valueInputOption: 'RAW', requestBody: { values: [headers.concat(missing)] } })
  }

  const headerRes2 = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetTitle}!1:1` })
  const finalHeaders = (headerRes2.data.values?.[0] || []) as string[]
  const startIndex = finalHeaders.indexOf(newCols[0])
  if (startIndex === -1) throw new Error('Failed to find new columns after header update')

  const blockValues = mappedRows.map((r) => newCols.map((c) => r[c] || ''))
  const range = `${sheetTitle}!${columnToLetter(startIndex + 1)}2:${columnToLetter(startIndex + newCols.length)}${mappedRows.length + 1}`
  await sheets.spreadsheets.values.update({ spreadsheetId: sheetId, range, valueInputOption: 'RAW', requestBody: { values: blockValues } })
  return true
}

function columnToLetter(col: number): string {
  let temp = ''
  while (col > 0) {
    const rem = (col - 1) % 26
    temp = String.fromCharCode(65 + rem) + temp
    col = Math.floor((col - 1) / 26)
  }
  return temp
}

export default { mapProductToHeyGenPayload, writeBackMappingsToSheet }
