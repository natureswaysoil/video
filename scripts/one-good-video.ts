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

function splitIntoScenes(script: string, count: number): string[] {
  const sentences = script.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [script]
  if (sentences.length <= count) {
    const copy = sentences.slice()
    while (copy.length < count) copy.push(copy[copy.length - 1] || script)
    return copy
  }

  const perScene = Math.ceil(sentences.length / count)
  return Array.from({ length: count }, (_, i) =>
    sentences.slice(i * perScene, (i + 1) * perScene).join(' ').trim()
  ).filter(Boolean)
}

function buildPexelsQuery(title: string, visualHint: string): string {
  const hintTerms = visualHint.split(',').map((s) => s.trim()).filter(Boolean)
  return hintTerms.slice(0, 4).join(' ') || `${title} lawn garden`
}

async function findPexelsBroll(query: string, count = 3): Promise<string[]> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) {
    console.warn('PEXELS_API_KEY not loaded; continuing without Pexels b-roll')
    return []
  }

  const response = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=12`,
    { headers: { Authorization: apiKey } }
  )

  if (!response.ok) {
    const body = await response.text()
    console.warn(`Pexels search failed ${response.status}: ${body}`)
    return []
  }

  const data: any = await response.json()
  const urls: string[] = []

  for (const video of data.videos || []) {
    const files = video?.video_files || []
    const portraitFiles = files
      .filter((file: any) => Number(file.height || 0) > Number(file.width || 0))
      .sort((a: any, b: any) => {
        const aPixels = Number(a.width || 0) * Number(a.height || 0)
        const bPixels = Number(b.width || 0) * Number(b.height || 0)
        const target = 1080 * 1920
        return Math.abs(aPixels - target) - Math.abs(bPixels - target)
      })

    const chosen = portraitFiles[0] || files.find((file: any) => file.quality === 'hd') || files[0]
    if (chosen?.link && !urls.includes(chosen.link)) urls.push(chosen.link)
    if (urls.length >= count) break
  }

  return urls
}

function ensureHttpUrl(value: string): string {
  return /^https?:\/\//i.test(value || '') ? value.trim() : ''
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

  const title = pick(row.record, ['Title', 'title', 'Product_Name', 'Product', 'name']) || row.product.title || row.product.name || "Nature's Way Soil product"
  const details = pick(row.record, ['Description', 'description', 'Details', 'details', 'Caption', 'caption']) || row.product.details || ''
  const productImageUrl = ensureHttpUrl(pick(row.record, ['Image_URL', 'image_url', 'Product_Image_URL', 'Main_Image_URL', 'Hero_Image_URL']))

  console.log(`Creating one good video for row ${row.rowNumber}: ${title}`)

  const mapping = mapProductToHeyGenPayload(row.record)
  if (!mapping.avatar) throw new Error('HEYGEN_DEFAULT_AVATAR is not configured with a real HeyGen avatar ID')
  if (!mapping.voice) throw new Error('HEYGEN_DEFAULT_VOICE is not configured with a real HeyGen voice ID')

  const pexelsQuery = pick(row.record, ['Broll_Query', 'B-Roll_Query', 'Pexels_Query']) || buildPexelsQuery(title, mapping.visualHint)
  console.log(`Pexels b-roll query: ${pexelsQuery}`)

  const broll = await findPexelsBroll(pexelsQuery, 3)
  if (broll.length) console.log(`Selected ${broll.length} Pexels b-roll clips`)

  if (!productImageUrl && broll.length === 0) {
    throw new Error('No real product image or Pexels b-roll was available. Refusing to create a placeholder/green-screen marketing video.')
  }

  const script = await generateScript({ ...row.product, title, details })
  const [hookText, featureText, ctaText] = splitIntoScenes(script, 3)

  const hookBackground = broll[0] || broll[1] || broll[2]
  const featureBackground = productImageUrl || broll[1] || broll[0]
  const ctaBackground = broll[2] || broll[1] || productImageUrl || broll[0]

  const scenes = [
    {
      seconds: 8,
      avatarText: hookText,
      brollUrl: hookBackground || undefined,
      visualDesc: 'customer problem or desired outcome',
    },
    {
      seconds: 10,
      avatarText: featureText,
      imageUrl: productImageUrl || undefined,
      brollUrl: productImageUrl ? undefined : featureBackground || undefined,
      visualDesc: productImageUrl ? 'clear product shot' : 'realistic product-use context',
    },
    {
      seconds: 8,
      avatarText: ctaText,
      brollUrl: ctaBackground && ctaBackground !== productImageUrl ? ctaBackground : undefined,
      imageUrl: ctaBackground === productImageUrl ? productImageUrl : undefined,
      visualDesc: 'healthy outcome and call to action',
    },
  ]

  const payload = {
    ...mapping.payload,
    avatar: mapping.avatar,
    voice: mapping.voice,
    script,
    // Only a real image may populate imageUrl. Never put a Pexels MP4 in an image field.
    imageUrl: productImageUrl || undefined,
    scenes,
  }

  if (String(process.env.DRY_RUN || '').toLowerCase() === 'true') {
    console.log('DRY_RUN=true — skipping HeyGen submission')
    console.log(JSON.stringify({ title, pexelsQuery, broll, productImageUrl, scenes }, null, 2))
    return
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
