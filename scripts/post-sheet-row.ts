// @ts-nocheck
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import OpenAI from 'openai'
import { execSync } from 'child_process'
import { google } from 'googleapis'
import { Storage } from '@google-cloud/storage'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

type SheetRow = Record<string, string>

const ROOT = process.cwd()
const CONFIG_DIR = path.resolve(ROOT, 'config')
const TOP_PRODUCTS_PATH = path.resolve(CONFIG_DIR, 'top-products.json')
const CREATIVE_PROFILES_PATH = path.resolve(CONFIG_DIR, 'creative-profiles.json')
const SHEET_STATE_PATH = path.resolve(ROOT, process.env.SHEET_ROW_STATE_FILE || 'data/sheet-row-state.json')
const DEFAULT_PUBLIC_VIDEO_BUCKET = 'natureswaysoil-social-videos'
const DEFAULT_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1dtUYrSy18_D2updwCpVa5wXfgf0hzAXaiQTQqMQnrSc/export?format=csv&gid=916620075'

const SECRET_NAMES = [
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'PEXELS_API_KEY',
  'YT_CLIENT_ID',
  'YT_CLIENT_SECRET',
  'YT_REFRESH_TOKEN',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_IG_ID',
  'INSTAGRAM_USER_ID',
  'INSTAGRAM_ACCOUNT_ID',
  'FB_PAGE_ACCESS_TOKEN',
  'FB_PAGE_ID',
  'FACEBOOK_PAGE_ACCESS_TOKEN',
  'FACEBOOK_PAGE_ID',
  'FACEBOOK_GROUPS_ACCESS_TOKEN',
  'TIKTOK_ACCESS_TOKEN',
  'TIKTOK_OPEN_ID',
  'GCS_PUBLIC_BUCKET',
  'VIDEO_PUBLIC_BUCKET',
  'VIDEO_PUBLIC_URL_BASE',
  'SHEET_CSV_URL',
  'GOOGLE_SHEET_CSV_URL',
  'SHEET_ROW_START',
  'SHEET_ROW_STATE_GCS_BUCKET',
  'SHEET_ROW_STATE_GCS_OBJECT'
]

function log(message: string, data?: any) {
  if (data === undefined) console.log(message)
  else console.log(message, data)
}

function hasValue(name: string): boolean {
  const value = process.env[name]
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized !== '' && !/your-|your_|changeme|placeholder|paste_|replace_|dummy_|example_/i.test(normalized)
}

function pickEnv(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

function secretCandidates(name: string): string[] {
  const upper = name.trim().replace(/[\s-]+/g, '_').toUpperCase()
  const lowerHyphen = upper.toLowerCase().replace(/_/g, '-')
  const lowerUnderscore = upper.toLowerCase()
  return [...new Set([upper, lowerHyphen, name, name.replace(/_/g, '-'), lowerUnderscore])]
}

function isNotFoundSecretError(error: any): boolean {
  return Number(error?.code) === 5 || String(error?.message || '').toUpperCase().includes('NOT_FOUND')
}

function isPermissionDeniedSecretError(error: any): boolean {
  const message = String(error?.message || '').toUpperCase()
  return Number(error?.code) === 7 || message.includes('PERMISSION_DENIED') || message.includes('PERMISSION DENIED')
}

async function loadSecrets() {
  const useSecretManager = String(process.env.USE_SECRET_MANAGER || 'true').toLowerCase() !== 'false'
  if (!useSecretManager) return
  const enforceSecretManagerAccess = String(process.env.REQUIRE_SECRET_MANAGER_ACCESS || process.env.CI || '').toLowerCase() === 'true'
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  const hasAdc = !!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.GOOGLE_GHA_CREDS_PATH

  if (dryRun && !hasAdc) {
    log('Secret Manager lookup skipped for local dry run without ADC credentials')
    return
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'natureswaysoil-video'
  const client = new SecretManagerServiceClient()

  for (const secretName of SECRET_NAMES) {
    if (hasValue(secretName) && !enforceSecretManagerAccess) continue

    for (const candidate of secretCandidates(secretName)) {
      try {
        const [version] = await client.accessSecretVersion({ name: `projects/${projectId}/secrets/${candidate}/versions/latest` })
        const value = version.payload?.data?.toString().trim()
        if (value) {
          process.env[secretName] = value
          process.env[candidate] = value
          log(`Loaded secret: ${candidate}${candidate === secretName ? '' : ` -> ${secretName}`}`)
          break
        }
      } catch (error: any) {
        if (isNotFoundSecretError(error)) continue
        if (isPermissionDeniedSecretError(error)) {
          throw new Error(`Secret Manager permission denied for ${candidate}: ${error?.message || error}`)
        }
        log(`Could not load secret ${candidate}: ${error?.message || error}`)
        break
      }
    }
  }
}

function readJson(file: string, fallback: any) {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: any) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function parseCsv(csv: string): SheetRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i]
    const next = csv[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++
      row.push(field)
      if (row.some((value) => String(value || '').trim() !== '')) rows.push(row)
      row = []
      field = ''
      continue
    }

    field += char
  }

  row.push(field)
  if (row.some((value) => String(value || '').trim() !== '')) rows.push(row)

  const headers = (rows.shift() || []).map((h) => String(h || '').trim())
  return rows.map((values) => {
    const out: SheetRow = {}
    headers.forEach((header, index) => {
      out[header || `Unnamed_${index}`] = String(values[index] || '').trim()
    })
    return out
  })
}

async function fetchGoogleSheetCsv(): Promise<string> {
  const url = pickEnv(['SHEET_CSV_URL', 'GOOGLE_SHEET_CSV_URL']) || DEFAULT_SHEET_CSV_URL

  try {
    const response = await axios.get(url, { timeout: 120000, responseType: 'text' })
    return String(response.data || '')
  } catch (publicError: any) {
    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly']
      })
      const client = await auth.getClient()
      const tokenResponse = await client.getAccessToken()
      const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token
      if (!token) throw new Error('Google auth returned no access token')

      const response = await axios.get(url, {
        timeout: 120000,
        responseType: 'text',
        headers: { Authorization: `Bearer ${token}` }
      })
      return String(response.data || '')
    } catch (authError: any) {
      throw new Error(`Could not fetch Google Sheet CSV. Public fetch failed: ${publicError?.message || publicError}. Auth fetch failed: ${authError?.message || authError}`)
    }
  }
}

function splitList(value: string): string[] {
  return String(value || '')
    .split(/[,\n;|]+/g)
    .map((v) => v.trim())
    .filter(Boolean)
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function pickFirst(row: SheetRow, keys: string[]) {
  for (const key of keys) if (row[key]) return row[key]

  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(row)) normalized[normalizeKey(key)] = value

  for (const key of keys) {
    const found = normalized[normalizeKey(key)]
    if (found) return found
  }

  return ''
}

function cleanTitle(title: string) {
  return String(title || '')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function landingUrl(row: SheetRow) {
  const explicit = pickFirst(row, [
    'Landing_Page_URL',
    'Landing Page URL',
    'Landing_URL',
    'Landing Page',
    'Website_URL',
    'Website',
    'URL',
    'Product_URL',
    'Shopify_URL'
  ])

  if (/^https?:\/\//i.test(explicit)) return explicit
  if (explicit && explicit.startsWith('/')) return `https://www.natureswaysoil.com${explicit}`
  return 'https://www.natureswaysoil.com/'
}

function isActiveRow(row: SheetRow) {
  const active = String(pickFirst(row, ['Active']) || '').trim().toLowerCase()
  return active === '' || active === 'true' || active === 'yes' || active === '1'
}

function makeProduct(row: SheetRow, sheetIndex: number) {
  const title = cleanTitle(pickFirst(row, ['Title', 'Product_Title', 'Name', 'Product Name']) || row.Product_ID || `Sheet row ${sheetIndex + 1}`)
  const shortName = pickFirst(row, ['Short_Name', 'Short Name'])
  const category = pickFirst(row, ['Category']) || 'Soil Amendment'
  const benefits = pickFirst(row, ['Benefits'])
  const targetAudience = pickFirst(row, ['Target_Audience', 'Target Audience'])
  const keywords = splitList([
    pickFirst(row, ['Keywords']),
    pickFirst(row, ['Research_Keywords']),
    pickFirst(row, ['Problem_Keywords', 'Problem Keywords']),
    pickFirst(row, ['Ingredient_Keywords']),
    pickFirst(row, ['Long_Tail_Keywords'])
  ].filter(Boolean).join(','))

  const name = shortName || title
  const description = [
    title,
    category ? `Category: ${category}.` : '',
    benefits ? `Benefits: ${benefits}.` : '',
    targetAudience ? `Audience: ${targetAudience}.` : '',
    keywords.length ? `Keywords: ${keywords.slice(0, 12).join(', ')}.` : ''
  ].filter(Boolean).join(' ')

  return {
    id: pickFirst(row, ['Product_ID']) || pickFirst(row, ['ASIN']) || pickFirst(row, ['SKU']) || `SHEET_ROW_${sheetIndex + 1}`,
    name,
    description,
    category,
    websiteUrl: landingUrl(row),
    amazonUrl: pickFirst(row, ['ASIN']) ? `https://www.amazon.com/dp/${pickFirst(row, ['ASIN'])}` : '',
    keywords,
    brollQueries: buildBrollQueries(row, title, category, keywords, benefits),
    productImageUrl: pickFirst(row, ['Image_URL', 'Image URL', 'Product_Image_URL', 'productImageUrl'])
  }
}

function buildBrollQueries(row: SheetRow, title: string, category: string, keywords: string[], benefits: string) {
  const text = `${title} ${category} ${keywords.join(' ')} ${benefits}`.toLowerCase()
  const problem = splitList(pickFirst(row, ['Problem_Keywords', 'Problem Keywords']))
  const ingredient = splitList(pickFirst(row, ['Ingredient_Keywords']))

  const base: string[] = []
  if (/dog|urine|pet|odor|yellow spot/.test(text)) {
    base.push('dog on green lawn', 'yellow lawn spots grass', 'homeowner spraying lawn', 'healthy green turf close up', 'garden hose sprayer lawn')
  } else if (/pasture|hay|field|farm|acre|horse|cattle/.test(text)) {
    base.push('farmer pasture field', 'hay field grass', 'tractor spraying pasture', 'healthy pasture close up', 'farm soil grass roots')
  } else if (/tomato|vegetable|pepper|fruit|berry/.test(text)) {
    base.push('vegetable garden tomatoes', 'gardener watering tomato plants', 'raised bed garden soil', 'healthy vegetable plants close up', 'garden harvest vegetables')
  } else if (/orchid|house plant|indoor/.test(text)) {
    base.push('gardener caring for potted plants', 'orchid plant close up', 'potting soil indoor plants', 'houseplant watering', 'healthy roots potting mix')
  } else if (/biochar|charcoal|compost|worm|casting|soil/.test(text)) {
    base.push('hands holding rich soil', 'garden compost soil close up', 'biochar soil amendment', 'raised bed garden soil', 'healthy garden plants')
  } else {
    base.push('organic garden soil', 'gardener spraying plants', 'healthy garden plants', 'soil close up roots', 'farm garden rows')
  }

  return [
    ...problem.map((item) => `${item} garden problem`),
    ...ingredient.map((item) => `${item} soil garden`),
    ...base,
    ...keywords.slice(0, 5).map((item) => `${item} farm garden`)
  ].filter(Boolean).slice(0, 12)
}

async function restoreStateFromGcs() {
  if (String(process.env.SHEET_ROW_STATE_PERSIST_TO_GCS || 'true').toLowerCase() === 'false') return
  try {
    const bucketName = pickEnv(['SHEET_ROW_STATE_GCS_BUCKET', 'GCS_PUBLIC_BUCKET', 'VIDEO_PUBLIC_BUCKET']) || DEFAULT_PUBLIC_VIDEO_BUCKET
    const objectName = process.env.SHEET_ROW_STATE_GCS_OBJECT || 'state/sheet-row-state.json'
    const storage = new Storage()
    const file = storage.bucket(bucketName).file(objectName)
    const [exists] = await file.exists()
    if (!exists) return
    fs.mkdirSync(path.dirname(SHEET_STATE_PATH), { recursive: true })
    await file.download({ destination: SHEET_STATE_PATH })
    log('Restored sheet row state from GCS', { bucketName, objectName })
  } catch (error: any) {
    log('Sheet row state restore skipped', error?.message || error)
  }
}

async function persistStateToGcs() {
  if (!fs.existsSync(SHEET_STATE_PATH)) return
  if (String(process.env.SHEET_ROW_STATE_PERSIST_TO_GCS || 'true').toLowerCase() === 'false') return
  try {
    const bucketName = pickEnv(['SHEET_ROW_STATE_GCS_BUCKET', 'GCS_PUBLIC_BUCKET', 'VIDEO_PUBLIC_BUCKET']) || DEFAULT_PUBLIC_VIDEO_BUCKET
    const objectName = process.env.SHEET_ROW_STATE_GCS_OBJECT || 'state/sheet-row-state.json'
    const storage = new Storage()
    await storage.bucket(bucketName).upload(SHEET_STATE_PATH, {
      destination: objectName,
      resumable: false,
      metadata: { contentType: 'application/json' }
    })
    log('Persisted sheet row state to GCS', { bucketName, objectName })
  } catch (error: any) {
    log('Sheet row state persistence skipped', error?.message || error)
  }
}

function selectNextRow(rows: SheetRow[]) {
  const state = readJson(SHEET_STATE_PATH, { nextIndex: Number(process.env.SHEET_ROW_START || 1) - 1, completed: [] })
  const forced = process.env.SHEET_ROW_FORCE_INDEX ? Number(process.env.SHEET_ROW_FORCE_INDEX) - 1 : NaN
  const startIndex = Number.isFinite(forced) && forced >= 0 ? forced : Number(state.nextIndex || 0)

  for (let offset = 0; offset < rows.length; offset++) {
    const sheetIndex = (startIndex + offset) % rows.length
    const row = rows[sheetIndex]
    if (!row || !isActiveRow(row)) continue
    return { row, sheetIndex, state }
  }

  throw new Error('No active product row found in Google Sheet')
}

function fallbackScenes(product: any) {
  const q = product.brollQueries || []
  return [
    {
      name: 'Hook',
      seconds: 5,
      voiceover: `${product.name} helps solve a real soil or plant-care problem.`,
      brollQuery: q[0] || 'farm garden soil',
      brollQueries: [q[0] || 'farm garden soil'],
      caption: product.name,
      useProductImage: false
    },
    {
      name: 'Problem',
      seconds: 6,
      voiceover: 'If growth is weak, roots struggle, or the soil is tired, the issue often starts below the surface.',
      brollQuery: q[1] || 'poor garden soil',
      brollQueries: [q[1] || 'poor garden soil'],
      caption: 'Problem starts in the soil',
      useProductImage: false
    },
    {
      name: 'Solution',
      seconds: 7,
      voiceover: `${product.name} is built for practical soil support in lawns, gardens, fields, and potted plants.`,
      brollQuery: q[2] || 'gardener applying fertilizer',
      brollQueries: [q[2] || 'gardener applying fertilizer'],
      caption: 'Soil-first support',
      useProductImage: true
    },
    {
      name: 'Use',
      seconds: 6,
      voiceover: 'Use it as part of your regular care routine according to label directions.',
      brollQuery: q[3] || 'healthy green garden',
      brollQueries: [q[3] || 'healthy green garden'],
      caption: 'Farm & garden ready',
      useProductImage: false
    },
    {
      name: 'CTA',
      seconds: 5,
      voiceover: `Learn more at ${product.websiteUrl || 'natureswaysoil.com'}.`,
      brollQuery: q[4] || 'healthy garden plants',
      brollQueries: [q[4] || 'healthy garden plants'],
      caption: 'Learn more',
      useProductImage: true
    }
  ]
}

function parseJson(text: string): any {
  try { return JSON.parse(text) } catch {
    const match = String(text || '').match(/\{[\s\S]*\}/)
    if (!match) return null
    try { return JSON.parse(match[0]) } catch { return null }
  }
}

async function generateScenes(product: any, row: SheetRow) {
  const fallback = fallbackScenes(product)
  if (!hasValue('OPENAI_API_KEY')) return fallback

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const prompt = `Write a 25-35 second vertical marketing video script for Nature's Way Soil using this Google Sheet product row.

Product ID: ${product.id}
Title: ${product.name}
Category: ${product.category}
Description: ${product.description}
Keywords: ${(product.keywords || []).join(', ')}
Benefits: ${pickFirst(row, ['Benefits'])}
Target audience: ${pickFirst(row, ['Target_Audience', 'Target Audience'])}
Season: ${pickFirst(row, ['Season'])}
Content type: ${pickFirst(row, ['Content_Type', 'Content Type'])}
CTA URL: ${product.websiteUrl}

Required structure:
1. Hook
2. Problem
3. Solution
4. Farm/garden use scene
5. CTA

Rules:
- Make the visuals farm, lawn, garden, pasture, soil, compost, roots, watering, sprayer, or plant related.
- Use b-roll search phrases that match the product, not generic random clips.
- Keep the language plainspoken and practical.
- No guaranteed results.
- No pesticide, disease, or cure claims.
- If the product has a landing page URL, use that CTA URL. Otherwise use natureswaysoil.com.
- Return JSON only:
{
  "scenes": [
    {"name":"Hook","seconds":5,"voiceover":"...","brollQuery":"...","brollQueries":["..."],"caption":"...","useProductImage":false},
    {"name":"Problem","seconds":6,"voiceover":"...","brollQuery":"...","brollQueries":["..."],"caption":"...","useProductImage":false},
    {"name":"Solution","seconds":7,"voiceover":"...","brollQuery":"...","brollQueries":["..."],"caption":"...","useProductImage":true},
    {"name":"Use","seconds":6,"voiceover":"...","brollQuery":"...","brollQueries":["..."],"caption":"...","useProductImage":false},
    {"name":"CTA","seconds":5,"voiceover":"...","brollQuery":"...","brollQueries":["..."],"caption":"...","useProductImage":true}
  ]
}`

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens: 900
    })
    const parsed = parseJson(response.choices[0]?.message?.content?.trim() || '')
    if (parsed?.scenes?.length) {
      return parsed.scenes.slice(0, 5).map((scene: any, index: number) => ({
        name: String(scene?.name || fallback[index]?.name || `Scene ${index + 1}`),
        seconds: Number(scene?.seconds || fallback[index]?.seconds || 6),
        voiceover: String(scene?.voiceover || fallback[index]?.voiceover || '').trim(),
        brollQuery: String(scene?.brollQuery || fallback[index]?.brollQuery || product.brollQueries?.[index] || product.category),
        brollQueries: Array.isArray(scene?.brollQueries) && scene.brollQueries.length
          ? scene.brollQueries.map(String)
          : [String(scene?.brollQuery || product.brollQueries?.[index] || product.category)],
        caption: String(scene?.caption || scene?.name || fallback[index]?.caption || product.name).trim(),
        useProductImage: Boolean(scene?.useProductImage) || index === 2 || index === 4
      }))
    }
  } catch (error: any) {
    log('OpenAI scene generation failed; using fallback scenes', error?.message || error)
  }

  return fallback
}

function writeTempPostingConfig(product: any, scenes: any[]) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })

  const originalTopProducts = fs.existsSync(TOP_PRODUCTS_PATH) ? fs.readFileSync(TOP_PRODUCTS_PATH, 'utf8') : ''
  const originalCreativeProfiles = fs.existsSync(CREATIVE_PROFILES_PATH) ? fs.readFileSync(CREATIVE_PROFILES_PATH, 'utf8') : ''

  writeJson(TOP_PRODUCTS_PATH, { topProducts: [product] })
  writeJson(CREATIVE_PROFILES_PATH, {
    defaults: {
      audience: 'homeowners, gardeners, lawn care, farmers, land owners',
      angle: 'hook problem solution farm garden use cta',
      tone: 'plainspoken and practical',
      cta: `Learn more at ${product.websiteUrl || 'https://www.natureswaysoil.com/'}`
    },
    profiles: {
      [product.id]: {
        audience: 'homeowners, gardeners, lawn care, farmers, land owners',
        angle: 'hook problem solution farm garden use cta',
        tone: 'plainspoken and practical',
        cta: `Learn more at ${product.websiteUrl || 'https://www.natureswaysoil.com/'}`,
        scenes
      }
    }
  })

  return () => {
    if (originalTopProducts) fs.writeFileSync(TOP_PRODUCTS_PATH, originalTopProducts, 'utf8')
    if (originalCreativeProfiles) fs.writeFileSync(CREATIVE_PROFILES_PATH, originalCreativeProfiles, 'utf8')
  }
}

function runExistingPoster(product: any) {
  const env = {
    ...process.env,
    SEED_PRODUCT_LIMIT: '1',
    VARIATIONS_PER_PRODUCT: '1',
    NEXT_PRODUCT_PREFERRED_ID: product.id,
    ROTATION_STATE_FILE: process.env.SHEET_ROTATION_STATE_FILE || 'data/sheet-row-rotation-state.json',
    USE_OPENAI_SCENE_PLAN: 'false',
    VIDEO_STYLE: 'broll_ken_burns',
    VIDEO_PROVIDER: 'openai_tts'
  }

  execSync('npx ts-node --transpile-only scripts/post-scheduled.ts', {
    cwd: ROOT,
    env,
    stdio: 'inherit'
  })
}

function advanceState(state: any, sheetIndex: number, product: any) {
  state.nextIndex = sheetIndex + 1
  state.lastCompletedIndex = sheetIndex
  state.lastCompletedRowNumber = sheetIndex + 1
  state.lastProductId = product.id
  state.lastProductName = product.name
  state.lastCompletedAt = new Date().toISOString()
  state.completed = Array.isArray(state.completed) ? state.completed : []
  state.completed.push({
    rowNumber: sheetIndex + 1,
    productId: product.id,
    productName: product.name,
    completedAt: state.lastCompletedAt
  })
  writeJson(SHEET_STATE_PATH, state)
}

async function main() {
  await loadSecrets()
  await restoreStateFromGcs()

  const csv = await fetchGoogleSheetCsv()
  const rows = parseCsv(csv)
  if (!rows.length) throw new Error('Google Sheet CSV returned no product rows')

  const { row, sheetIndex, state } = selectNextRow(rows)
  const product = makeProduct(row, sheetIndex)
  const scenes = await generateScenes(product, row)

  log('Selected Google Sheet row for video', {
    rowNumber: sheetIndex + 1,
    productId: product.id,
    productName: product.name,
    category: product.category,
    landingUrl: product.websiteUrl,
    brollQueries: product.brollQueries,
    scenes: scenes.map((scene: any, index: number) => ({
      idx: index + 1,
      name: scene.name,
      seconds: scene.seconds,
      brollQuery: scene.brollQuery,
      useProductImage: !!scene.useProductImage
    }))
  })

  if (String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true') {
    log('Dry run enabled; not rendering/posting and not advancing sheet row state', { product, scenes })
    return
  }

  const restoreConfig = writeTempPostingConfig(product, scenes)
  try {
    runExistingPoster(product)
    advanceState(state, sheetIndex, product)
    await persistStateToGcs()
    log('Google Sheet row completed; next run will move to next row', {
      completedRowNumber: sheetIndex + 1,
      nextRowNumber: sheetIndex + 2,
      productId: product.id
    })
  } finally {
    restoreConfig()
  }
}

main().catch((error) => {
  console.error('Google Sheet row social video failed:', error?.message || error)
  process.exit(1)
})
