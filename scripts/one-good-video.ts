import 'dotenv/config'
import fetch from 'node-fetch'
import { loadSecretsToEnv } from '../src/secret-manager'
import { processCsvUrl } from '../src/core'
import { generateScript } from '../src/openai'
import { mapProductToHeyGenPayload } from '../src/heygen-adapter'
import { createClientWithSecrets as createHeyGenClient } from '../src/heygen'
import { applySalesVideoStrategy, getSalesVideoStrategy } from '../src/sales-video-strategy'

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
  const sentences = script.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) ?? [script]
  if (sentences.length <= count) {
    while (sentences.length < count) sentences.push(sentences[sentences.length - 1])
    return sentences
  }
  const perScene = Math.ceil(sentences.length / count)
  return Array.from({ length: count }, (_, i) => sentences.slice(i * perScene, (i + 1) * perScene).join(' ').trim()).filter(Boolean)
}

function buildPexelsQuery(title: string, visualHint: string): string {
  const hintTerms = visualHint.split(',').map(s => s.trim()).filter(Boolean)
  return hintTerms.slice(0, 3).join(' ') || `${title} garden organic`
}

async function findPexelsBroll(query: string, exclude: string[] = []): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return ''
  const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=10`, { headers: { Authorization: apiKey } })
  if (!response.ok) return ''
  const data: any = await response.json()
  for (const video of data.videos || []) {
    const files = video?.video_files || []
    const choices = [
      ...files.filter((file: any) => Number(file.height || 0) > Number(file.width || 0) && Number(file.height || 0) >= 720),
      ...files.filter((file: any) => file.quality === 'sd'),
      ...files,
    ]
    const found = choices.find((file: any) => file?.link && !exclude.includes(file.link))
    if (found?.link) return found.link
  }
  return ''
}

function forceSalesOpening(script: string, hook?: string): string {
  if (!hook) return script
  const sentences = script.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) || []
  if (!sentences.length) return `${hook} ${script}`.trim()
  sentences[0] = hook.endsWith('?') || hook.endsWith('!') || hook.endsWith('.') ? hook : `${hook}.`
  return sentences.join(' ')
}

async function main(): Promise<void> {
  await loadSecretsToEnv(['CSV_URL','GOOGLE_SHEET_CSV_URL','OPENAI_API_KEY','OPENAI_MODEL','HEYGEN_API_KEY','HEYGEN_DEFAULT_AVATAR','HEYGEN_DEFAULT_VOICE','HEYGEN_WEBHOOK_URL','PEXELS_API_KEY'])
  const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL || DEFAULT_SHEET_CSV_URL
  const result = await processCsvUrl(csvUrl)
  const row = result.rows[0]
  if (!row) throw new Error('No ready/unposted product rows found')

  const title = pick(row.record, ['Title','title','Product_Name','Product','name']) || row.product.title || row.product.name || "Nature's Way Soil product"
  const details = pick(row.record, ['Description','description','Details','details','Caption','caption']) || row.product.details || ''
  const productImageUrl = pick(row.record, ['Image_URL','image_url','Product_Image_URL','Main_Image_URL','Hero_Image_URL'])
  const baseProduct = { ...row.product, title, details }
  const strategy = getSalesVideoStrategy(baseProduct)
  const salesProduct = applySalesVideoStrategy(baseProduct)
  const mapping = mapProductToHeyGenPayload(row.record)

  const strategyQueries = strategy?.visualQueries || []
  const fallbackQuery = pick(row.record, ['Broll_Query','B-Roll_Query','Pexels_Query']) || buildPexelsQuery(title, mapping.visualHint)
  const queries = [...strategyQueries, fallbackQuery].filter(Boolean).slice(0, 3)
  const broll: string[] = []
  for (const query of queries) {
    const found = await findPexelsBroll(query, broll)
    if (found) broll.push(found)
  }
  if (!broll.length && !productImageUrl) throw new Error('No product image or usable Pexels b-roll found; refusing to create a weak marketing video')

  let script = await generateScript(salesProduct)
  script = forceSalesOpening(script, strategy?.hook)
  const [hookText, featureText, ctaRaw] = splitIntoScenes(script, 3)
  const ctaText = strategy?.cta || `${ctaRaw} Visit natureswaysoil.com for more info`

  const scenes = [
    { seconds: '7', avatarText: hookText, brollUrl: broll[0] || broll[1] || undefined },
    productImageUrl
      ? { seconds: '10', avatarText: featureText, imageUrl: productImageUrl, visualDesc: 'product and benefit proof' }
      : { seconds: '10', avatarText: featureText, brollUrl: broll[1] || broll[0] || undefined },
    { seconds: '8', avatarText: ctaText, brollUrl: broll[2] || broll[1] || broll[0] || undefined },
  ]

  const payload = { ...mapping.payload, script, imageUrl: productImageUrl || undefined, scenes }
  console.log(JSON.stringify({ title, salesPriority: strategy?.priority || 0, hook: strategy?.hook, queries, productImageUrl, scenes }, null, 2))

  if (String(process.env.DRY_RUN || '').toLowerCase() === 'true') return
  const heygen = await createHeyGenClient()
  const videoId = await heygen.createVideoJob(payload)
  const videoUrl = await heygen.pollJobForVideoUrl(videoId, {
    timeoutMs: Number(process.env.HEYGEN_POLL_TIMEOUT_MS || 1200000),
    intervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 15000),
  })
  console.log('DONE - sales video created:', videoUrl)
}

main().catch((error) => { console.error('One good video failed:', error); process.exit(1) })
