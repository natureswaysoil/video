import 'dotenv/config'
import fetch from 'node-fetch'
import path from 'path'
import { loadSecretsToEnv } from '../src/secret-manager'
import { processCsvUrl } from '../src/core'

const fs: any = require('fs')
const { execFileSync }: any = require('child_process')

const DEFAULT_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1dtUYrSy18_D2updwCpVa5wXfgf0hzAXaiQTQqMQnrSc/export?format=csv&gid=916620075'

function pick(record: Record<string, any> | undefined, keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function safeText(value: string, max = 52): string {
  return String(value || '')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, max)
}

function slugify(value: string): string {
  return String(value || 'video')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'video'
}

function productDefaults(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('bone')) {
    return {
      hook: 'Stronger Roots Start Here',
      benefit1: 'Phosphorus + Calcium Support',
      benefit2: 'For Roots, Blooms & Fruit',
      benefit3: 'Easy Liquid Feeding',
      cta: 'Shop Nature’s Way Soil',
      landingUrl: 'natureswaysoil.com',
      queries: ['blooming garden flowers close up', 'gardener watering plants', 'healthy vegetable garden sunlight', 'plant roots soil close up', 'gardener pouring liquid fertilizer'],
    }
  }
  if (lower.includes('dog') || lower.includes('urine')) {
    return {
      hook: 'Yellow Lawn Spots?',
      benefit1: 'Works At Soil Level',
      benefit2: 'Enzymes + Humic Support',
      benefit3: 'Pet-Safe Lawn Care',
      cta: 'Shop Nature’s Way Soil',
      landingUrl: 'natureswaysoil.com',
      queries: ['green lawn dog backyard', 'watering lawn close up', 'healthy grass sunlight', 'family dog grass yard', 'repairing lawn grass'],
    }
  }
  return {
    hook: 'Stronger Growth Starts Below',
    benefit1: 'Soil-Focused Plant Care',
    benefit2: 'Easy Liquid Application',
    benefit3: 'For Lawns & Gardens',
    cta: 'Shop Nature’s Way Soil',
    landingUrl: 'natureswaysoil.com',
    queries: ['healthy garden plants sunlight', 'gardener watering plants close up', 'rich soil garden close up', 'green lawn plants', 'pouring liquid fertilizer plants'],
  }
}

async function findPexelsClip(query: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) throw new Error('PEXELS_API_KEY is required for amazon:video')

  const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=8`, {
    headers: { Authorization: apiKey },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Pexels search failed ${response.status}: ${body}`)
  }

  const data: any = await response.json()
  const videos = data.videos || []
  const files = videos.flatMap((video: any) => video.video_files || [])
  const hd = files.find((file: any) => file.quality === 'hd' && Number(file.width || 0) >= 1280)
  const sd = files.find((file: any) => file.quality === 'sd')
  const selected = hd || sd || files[0]
  if (!selected?.link) throw new Error(`No Pexels video found for query: ${query}`)
  return selected.link
}

async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`)
  const arrayBuffer = await response.arrayBuffer()
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer))
}

function runFfmpeg(args: string[]): void {
  execFileSync('ffmpeg', args, { stdio: 'inherit' })
}

function fileExists(value: string): boolean {
  return !!value && fs.existsSync(value)
}

async function main(): Promise<void> {
  await loadSecretsToEnv(['CSV_URL', 'GOOGLE_SHEET_CSV_URL', 'PEXELS_API_KEY'])

  const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL || DEFAULT_SHEET_CSV_URL
  const result = await processCsvUrl(csvUrl)
  const row = result.rows[0]
  if (!row) throw new Error('No ready/unposted product rows found')

  const record = row.record
  const title = pick(record, ['Title', 'title', 'Product_Name', 'Product', 'name']) || row.product.title || row.product.name || 'Nature’s Way Soil'
  const defaults = productDefaults(title)
  const hook = pick(record, ['Amazon_Hook', 'Hook', 'Video_Hook']) || defaults.hook
  const benefit1 = pick(record, ['Benefit_1']) || defaults.benefit1
  const benefit2 = pick(record, ['Benefit_2']) || defaults.benefit2
  const benefit3 = pick(record, ['Benefit_3']) || defaults.benefit3
  const cta = pick(record, ['CTA', 'Call_To_Action']) || defaults.cta
  const landingUrl = pick(record, ['Landing_URL', 'Landing Page', 'URL', 'Product_URL']) || defaults.landingUrl
  const productImage = pick(record, ['Product_Image', 'Product_Image_Path', 'Image_Path'])

  const queries = [
    pick(record, ['Broll_Query_1', 'Broll_Query', 'Pexels_Query']) || defaults.queries[0],
    pick(record, ['Broll_Query_2']) || defaults.queries[1],
    pick(record, ['Broll_Query_3']) || defaults.queries[2],
    pick(record, ['Broll_Query_4']) || defaults.queries[3],
    pick(record, ['Broll_Query_5']) || defaults.queries[4],
  ]

  const outDir = path.join(process.cwd(), 'output', slugify(title))
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`Building Amazon-style video for row ${row.rowNumber}: ${title}`)
  if (!fileExists(productImage)) console.warn('No product image found. Add Product_Image_Path in the sheet for bottle overlay.')

  const clipPaths: string[] = []
  for (let i = 0; i < queries.length; i++) {
    console.log(`Searching Pexels: ${queries[i]}`)
    const clipUrl = await findPexelsClip(queries[i])
    const clipPath = path.join(outDir, `clip-${i + 1}.mp4`)
    console.log(`Downloading clip ${i + 1}`)
    await downloadFile(clipUrl, clipPath)
    clipPaths.push(clipPath)
  }

  const textLines = [hook, benefit1, benefit2, benefit3, cta]
  const processedClips: string[] = []

  for (let i = 0; i < clipPaths.length; i++) {
    const processed = path.join(outDir, `scene-${i + 1}.mp4`)
    const text = safeText(textLines[i] || cta)
    const duration = i === 0 ? '5' : '4.5'
    const fontSize = i === 0 ? '54' : '44'
    const overlay = fileExists(productImage)
      ? `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.06:saturation=1.10[bg];[1:v]scale=260:-1[prod];[bg][prod]overlay=W-w-60:H-h-70,drawbox=x=55:y=500:color=black@0.50:width=790:height=105:t=fill,drawtext=text='${text}':fontcolor=white:fontsize=${fontSize}:x=85:y=532`
      : `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.06:saturation=1.10,drawbox=x=55:y=500:color=black@0.50:width=1170:height=105:t=fill,drawtext=text='${text}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=532`

    const args = ['-y', '-i', clipPaths[i]]
    if (fileExists(productImage)) args.push('-i', productImage)
    args.push('-t', duration, '-vf', overlay, '-an', '-r', '30', '-pix_fmt', 'yuv420p', processed)
    runFfmpeg(args)
    processedClips.push(processed)
  }

  const endCard = path.join(outDir, 'end-card.mp4')
  runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=0x1f3d2b:s=1280x720:d=5',
    '-vf', `drawtext=text='${safeText(cta, 55)}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=250,drawtext=text='${safeText(landingUrl, 60)}':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=340,drawtext=text='Use as directed':fontcolor=white@0.82:fontsize=26:x=(w-text_w)/2:y=430`,
    '-r', '30',
    '-pix_fmt', 'yuv420p',
    endCard,
  ])
  processedClips.push(endCard)

  const listFile = path.join(outDir, 'clips-with-endcard.txt')
  fs.writeFileSync(listFile, processedClips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join('\n'))

  const silent = path.join(outDir, `${slugify(title)}-amazon-video-silent.mp4`)
  runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent])

  const final = path.join(outDir, `${slugify(title)}-amazon-video-with-audio.mp4`)
  runFfmpeg([
    '-y',
    '-i', silent,
    '-f', 'lavfi',
    '-i', 'sine=frequency=220:sample_rate=44100:duration=30',
    '-shortest',
    '-filter:a', 'volume=0.08',
    '-c:v', 'copy',
    '-c:a', 'aac',
    final,
  ])

  fs.copyFileSync(final, path.join(process.cwd(), 'amazon-video-premium.mp4'))

  console.log('DONE - Amazon-style video with audio/end card created:')
  console.log(final)
  console.log('Copied to: amazon-video-premium.mp4')
}

main().catch((error) => {
  console.error('Amazon video failed:', error)
  process.exit(1)
})
