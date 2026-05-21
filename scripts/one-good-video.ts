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

// Split a script into N scenes at sentence boundaries.
function splitIntoScenes(script: string, count: number): string[] {
  const sentences = script.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) ?? [script]
  if (sentences.length <= count) {
    // Pad by repeating the last sentence if we have fewer sentences than scenes
    while (sentences.length < count) sentences.push(sentences[sentences.length - 1])
    return sentences
  }
  const perScene = Math.ceil(sentences.length / count)
  return Array.from({ length: count }, (_, i) =>
    sentences.slice(i * perScene, (i + 1) * perScene).join(' ').trim()
  ).filter(Boolean)
}

// Build a Pexels query from the adapter's visualHint rather than the generic product title.
function buildPexelsQuery(title: string, visualHint: string): string {
  // Use the first 3 comma-separated terms from visualHint for a focused search
  const hintTerms = visualHint.split(',').map(s => s.trim()).filter(Boolean)
  return hintTerms.slice(0, 3).join(' ') || `${title} garden organic`
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

  const title = pick(row.record, [‘Title’, ‘title’, ‘Product_Name’, ‘Product’, ‘name’]) || row.product.title || row.product.name || ‘Nature\’s Way Soil product’
  const details = pick(row.record, [‘Description’, ‘description’, ‘Details’, ‘details’, ‘Caption’, ‘caption’]) || row.product.details || ‘’

  // Product image URL used as the background for the product-shot scene
  const productImageUrl = pick(row.record, [
    ‘Image_URL’, ‘image_url’, ‘Product_Image_URL’, ‘Main_Image_URL’, ‘Hero_Image_URL’,
  ])

  console.log(`Creating one good video for row ${row.rowNumber}: ${title}`)

  // --- Step 1: resolve adapter mapping (gives us visualHint for Pexels query) ---
  const mapping = mapProductToHeyGenPayload(row.record)

  // Build a focused Pexels query from the adapter’s visualHint rather than the product title
  const pexelsQuery = pick(row.record, [‘Broll_Query’, ‘B-Roll_Query’, ‘Pexels_Query’]) ||
    buildPexelsQuery(title, mapping.visualHint)
  console.log(`Pexels b-roll query: ${pexelsQuery}`)

  const brollUrl = await findPexelsBroll(pexelsQuery)
  if (brollUrl) console.log(‘Selected Pexels b-roll:’, brollUrl)

  // --- Step 2: generate script ---
  const script = await generateScript({ ...row.product, title, details })

  // --- Step 3: split script into 3 scenes for visual variety ---
  const [hookText, featureText, ctaRaw] = splitIntoScenes(script, 3)
  // Append brand CTA to the final scene so it appears in captions
  const ctaText = `${ctaRaw} Find it at natureswaysoil.com.`

  const scenes = [
    // Scene 1 — Hook: b-roll background sets context
    {
      seconds: ‘8’,
      avatarText: hookText,
      brollUrl: brollUrl || undefined,
    },
    // Scene 2 — Product shot: product image if available, else second b-roll search
    {
      seconds: ‘10’,
      avatarText: featureText,
      imageUrl: productImageUrl || undefined,
      brollUrl: productImageUrl ? undefined : brollUrl || undefined,
      visualDesc: ‘product shot’,
    },
    // Scene 3 — CTA: b-roll returns, avatar delivers brand URL (captured in captions)
    {
      seconds: ‘7’,
      avatarText: ctaText,
      brollUrl: brollUrl || undefined,
    },
  ]

  const payload = {
    ...mapping.payload,
    script,
    imageUrl: productImageUrl || brollUrl || mapping.payload.imageUrl,
    scenes,
  }

  // --- Step 4: DRY_RUN guard — log and exit without spending a HeyGen credit ---
  if (String(process.env.DRY_RUN || ‘’).toLowerCase() === ‘true’) {
    console.log(‘DRY_RUN=true — skipping HeyGen submission’)
    console.log(JSON.stringify({ title, pexelsQuery, brollUrl, productImageUrl, scenes }, null, 2))
    return
  }

  const heygen = await createHeyGenClient()
  const videoId = await heygen.createVideoJob(payload)

  console.log(‘HeyGen video ID:’, videoId)
  console.log(‘Polling for completed video...’)

  const videoUrl = await heygen.pollJobForVideoUrl(videoId, {
    timeoutMs: Number(process.env.HEYGEN_POLL_TIMEOUT_MS || 1200000),
    intervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 15000),
  })

  console.log(‘DONE - one good video created:’)
  console.log(videoUrl)
}

main().catch((error) => {
  console.error('One good video failed:', error)
  process.exit(1)
})
