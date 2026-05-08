import 'dotenv/config'
import fetch from 'node-fetch'
import { loadSecretsToEnv } from '../src/secret-manager'
import { processCsvUrl } from '../src/core'
import { generateScript } from '../src/openai'
import { mapProductToHeyGenPayload } from '../src/heygen-adapter'
import { createClientWithSecrets as createHeyGenClient } from '../src/heygen'

const DEFAULT_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1dtUYrSy18_D2updwCpVa5wXfgf0hzAXaiQTQqMQnrSc/export?format=csv&gid=916620075'

function pick(record: Record<string, any> | undefined, keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

async function findPexelsBroll(query: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) {
    console.warn('PEXELS_API_KEY not loaded; continuing without Pexels b-roll')
    return ''
  }

  const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`, {
    headers: { Authorization: apiKey },
  })

  if (!response.ok) {
    const body = await response.text()
    console.warn(`Pexels search failed ${response.status}: ${body}`)
    return ''
  }

  const data: any = await response.json()
  const video = data.videos?.[0]
  const files = video?.video_files || []
  const portrait = files.find((file: any) => Number(file.height || 0) > Number(file.width || 0))
  const sd = files.find((file: any) => file.quality === 'sd')
  return portrait?.link || sd?.link || files[0]?.link || ''
}

async function main(): Promise<void> {
  await loadSecretsToEnv([
    'CSV_URL',
    'GOOGLE_SHEET_CSV_URL',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'HEYGEN_API_KEY',
    'HEYGEN_DEFAULT_AVATAR',
    'HEYGEN_DEFAULT_VOICE',
    'HEYGEN_WEBHOOK_URL',
    'PEXELS_API_KEY',
  ])

  const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL || DEFAULT_SHEET_CSV_URL
  console.log('Using Google Sheet CSV:', csvUrl)

  const result = await processCsvUrl(csvUrl)
  const row = result.rows[0]
  if (!row) throw new Error('No ready/unposted product rows found')

  const title = pick(row.record, ['Title', 'title', 'Product_Name', 'Product', 'name']) || row.product.title || row.product.name || 'Nature’s Way Soil product'
  const details = pick(row.record, ['Description', 'description', 'Details', 'details', 'Caption', 'caption']) || row.product.details || ''
  const brollQuery = pick(row.record, ['Broll_Query', 'B-Roll Query', 'Pexels_Query', 'Visual_Prompt']) || `${title} garden soil plants lawn`

  console.log(`Creating one good video for row ${row.rowNumber}: ${title}`)
  console.log(`Pexels b-roll query: ${brollQuery}`)

  const brollUrl = await findPexelsBroll(brollQuery)
  if (brollUrl) console.log('Selected Pexels b-roll:', brollUrl)

  const script = await generateScript({
    ...row.product,
    title,
    details,
  })

  const mapping = await mapProductToHeyGenPayload(row.record)
  const payload = {
    ...mapping.payload,
    script,
    imageUrl: brollUrl || mapping.payload.imageUrl,
  }

  const heygen = await createHeyGenClient()
  const videoId = await heygen.createVideoJob(payload)

  console.log('HeyGen video ID:', videoId)
  console.log('Polling for completed video...')

  const videoUrl = await heygen.pollJobForVideoUrl(videoId, {
    timeoutMs: Number(process.env.HEYGEN_POLL_TIMEOUT_MS || 1200000),
    intervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 15000),
  })

  console.log('DONE - one good video created:')
  console.log(videoUrl)
}

main().catch((error) => {
  console.error('One good video failed:', error)
  process.exit(1)
})
