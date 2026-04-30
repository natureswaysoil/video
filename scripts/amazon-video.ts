import 'dotenv/config'
import fetch from 'node-fetch'
import path from 'path'
import { execFileSync } from 'child_process'
import { loadSecretsToEnv } from '../src/secret-manager'
import { processCsvUrl } from '../src/core'

const fs: any = require('fs')

const DEFAULT_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1dtUYrSy18_D2updwCpVa5wXfgf0hzAXaiQTQqMQnrSc/export?format=csv&gid=916620075'

function pick(record: Record<string, any> | undefined, keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function safeText(value: string): string {
  return String(value || '')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, 70)
}

function slugify(value: string): string {
  return String(value || 'video')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'video'
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
  const first = files[0]
  const selected = hd || sd || first

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

async function main(): Promise<void> {
  await loadSecretsToEnv(['CSV_URL', 'GOOGLE_SHEET_CSV_URL', 'PEXELS_API_KEY'])

  const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL || DEFAULT_SHEET_CSV_URL
  const result = await processCsvUrl(csvUrl)
  const row = result.rows[0]
  if (!row) throw new Error('No ready/unposted product rows found')

  const record = row.record
  const title = pick(record, ['Title', 'title', 'Product_Name', 'Product', 'name']) || row.product.title || row.product.name || 'Nature’s Way Soil'
  const hook = pick(record, ['Amazon_Hook', 'Hook', 'Video_Hook']) || 'Stronger growth starts with better soil'
  const benefit1 = pick(record, ['Benefit_1', 'Benefits', 'Benefit']) || 'Supports Strong Roots'
  const benefit2 = pick(record, ['Benefit_2']) || 'Feeds Soil & Plants'
  const benefit3 = pick(record, ['Benefit_3']) || 'Easy Liquid Application'
  const cta = pick(record, ['CTA', 'Call_To_Action']) || 'Nature’s Way Soil'

  const queries = [
    pick(record, ['Broll_Query_1', 'Broll_Query', 'Pexels_Query']) || `${title} garden soil plants`,
    pick(record, ['Broll_Query_2']) || 'gardener watering plants close up',
    pick(record, ['Broll_Query_3']) || 'healthy garden plants sunlight',
    pick(record, ['Broll_Query_4']) || 'rich soil roots garden close up',
  ]

  const outDir = path.join(process.cwd(), 'output', slugify(title))
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`Building Amazon-style video for row ${row.rowNumber}: ${title}`)

  const clipPaths: string[] = []
  for (let i = 0; i < queries.length; i++) {
    console.log(`Searching Pexels: ${queries[i]}`)
    const clipUrl = await findPexelsClip(queries[i])
    const clipPath = path.join(outDir, `clip-${i + 1}.mp4`)
    console.log(`Downloading clip ${i + 1}`)
    await downloadFile(clipUrl, clipPath)
    clipPaths.push(clipPath)
  }

  const textLines = [hook, benefit1, benefit2, benefit3]
  const processedClips: string[] = []

  for (let i = 0; i < clipPaths.length; i++) {
    const processed = path.join(outDir, `processed-${i + 1}.mp4`)
    const text = safeText(textLines[i] || cta)
    runFfmpeg([
      '-y',
      '-i', clipPaths[i],
      '-t', '5',
      '-vf', `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,drawbox=y=500:color=black@0.45:width=iw:height=120:t=fill,drawtext=text='${text}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=535`,
      '-an',
      '-r', '30',
      '-pix_fmt', 'yuv420p',
      processed,
    ])
    processedClips.push(processed)
  }

  const listFile = path.join(outDir, 'clips.txt')
  fs.writeFileSync(listFile, processedClips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join('\n'))

  const combined = path.join(outDir, `${slugify(title)}-amazon-video.mp4`)
  runFfmpeg([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-c', 'copy',
    combined,
  ])

  const final = path.join(outDir, `${slugify(title)}-amazon-video-final.mp4`)
  runFfmpeg([
    '-y',
    '-i', combined,
    '-vf', `drawbox=y=610:color=black@0.55:width=iw:height=90:t=fill,drawtext=text='${safeText(cta)}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=638`,
    '-c:a', 'copy',
    final,
  ])

  console.log('DONE - Amazon-style video created:')
  console.log(final)
}

main().catch((error) => {
  console.error('Amazon video failed:', error)
  process.exit(1)
})
