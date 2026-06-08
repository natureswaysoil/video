import 'dotenv/config'
import fetch from 'node-fetch'
import path from 'path'
import { loadSecretsToEnv } from '../src/secret-manager'
import { processCsvUrl } from '../src/core'
import { getProductLandingConfigByAsin } from '../src/product-assets'

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

function findAsin(record: Record<string, any> | undefined): string {
  return pick(record, ['ASIN', 'asin', 'Parent_ASIN', 'parent_asin', 'SKU', 'sku']).toUpperCase()
}

function productDefaults(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('hay') || lower.includes('pasture')) {
    return {
      hook: 'Feed 5 Acres for Under $20',
      benefit1: '1:50 Dilution — Boom Sprayer',
      benefit2: 'Livestock Safe When Dry',
      benefit3: 'Color Change in 7-10 Days',
      cta: 'Shop NaturesWaySoil.com',
      landingUrl: 'natureswaysoil.com/product/NWS_021',
      queries: ['green pasture field aerial', 'boom sprayer tractor field', 'cattle grazing green pasture', 'lush green grass lawn', 'farm fertilizer spraying'],
    }
  }
  if (lower.includes('dog') || lower.includes('urine')) {
    return {
      hook: 'Yellow Lawn Spots? Fixed.',
      benefit1: 'Works At Soil Level',
      benefit2: 'Enzymes + Humic Support',
      benefit3: 'Pet-Safe Lawn Care',
      cta: 'Shop NaturesWaySoil.com',
      landingUrl: 'natureswaysoil.com/product/NWS_014',
      queries: ['green lawn dog backyard', 'watering lawn close up', 'healthy grass sunlight', 'family dog grass yard', 'repairing lawn grass'],
    }
  }
  if (lower.includes('fruit') || lower.includes('tree')) {
    return {
      hook: 'Your Trees Are Starving.',
      benefit1: 'N-P-K + Humic Trace Minerals',
      benefit2: 'Apply at Bud Break + Fruit Set',
      benefit3: 'Covers Up to 20 Trees / App',
      cta: 'Shop NaturesWaySoil.com',
      landingUrl: 'natureswaysoil.com/product/NWS_021',
      queries: ['apple fruit tree orchard harvest', 'fruit tree bud break spring blossoms', 'watering fruit tree base roots', 'lush fruit tree green canopy orchard', 'picking ripe peach apple orchard'],
    }
  }
  if (lower.includes('kelp') || lower.includes('seaweed')) {
    return {
      hook: 'Icelandic Kelp. Unlocked.',
      benefit1: 'Enzymatic Hydrolysis Process',
      benefit2: '60+ Bioavailable Trace Minerals',
      benefit3: '2.5 gal = 100+ gal Finished',
      cta: 'Shop NaturesWaySoil.com',
      landingUrl: 'natureswaysoil.com/product/NWS_006',
      queries: ['ocean kelp seaweed harvest', 'foliar spray tomato plant garden', 'drip irrigation garden vegetable', 'lush green crop field', 'concentrated liquid fertilizer pour'],
    }
  }
  if (lower.includes('humic') || lower.includes('fulvic')) {
    return {
      hook: 'Feed the Soil. Feed the Plant.',
      benefit1: 'Boosts Cation Exchange Capacity',
      benefit2: 'Fulvic Acid Drives Cell Uptake',
      benefit3: 'Drench, Foliar, or Fertigation',
      cta: 'Shop NaturesWaySoil.com',
      landingUrl: 'natureswaysoil.com/product/NWS_011',
      queries: ['plant roots close up soil', 'dark liquid pouring concentrate', 'corn field green healthy crop', 'drip irrigation fertigation farm', 'soil microbes biology garden'],
    }
  }
  if (lower.includes('bone')) {
    return {
      hook: 'Stronger Roots Start Here',
      benefit1: 'Phosphorus + Calcium Support',
      benefit2: 'For Roots, Blooms & Fruit',
      benefit3: 'Easy Liquid Feeding',
      cta: 'Shop NaturesWaySoil.com',
      landingUrl: 'natureswaysoil.com/shop',
      queries: ['blooming garden flowers close up', 'gardener watering plants', 'healthy vegetable garden sunlight', 'plant roots soil close up', 'gardener pouring liquid fertilizer'],
    }
  }
  return {
    hook: 'Stronger Growth Starts Below',
    benefit1: 'Soil-Focused Plant Care',
    benefit2: 'Easy Liquid Application',
    benefit3: 'For Lawns & Gardens',
    cta: 'Shop NaturesWaySoil.com',
    landingUrl: 'natureswaysoil.com/shop',
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

function buildFallbackClip(clipPath: string, query: string, clipIndex: number): void {
  const fallbackSource = path.join(process.cwd(), 'amazon-video-final.mp4')

  if (fileExists(fallbackSource)) {
    try {
      const startSeconds = String(clipIndex * 5)
      runFfmpeg([
        '-y',
        '-ss', startSeconds,
        '-t', '6',
        '-i', fallbackSource,
        '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720',
        '-an',
        '-r', '30',
        '-pix_fmt', 'yuv420p',
        clipPath,
      ])
      return
    } catch (error: any) {
      console.warn(`Fallback source video unusable; switching to synthetic clip: ${error?.message || error}`)
    }
  }

  runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc2=s=1280x720:r=30:d=6',
    '-vf', `drawbox=x=120:y=575:w=1040:h=92:color=black@0.55:t=fill,drawtext=text='Fallback clip - ${safeText(query, 42)}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=605`,
    '-an',
    '-r', '30',
    '-pix_fmt', 'yuv420p',
    clipPath,
  ])
}

async function main(): Promise<void> {
  if (process.env.SKIP_SECRET_MANAGER !== 'true') {
    try {
      await loadSecretsToEnv(['CSV_URL', 'GOOGLE_SHEET_CSV_URL', 'PEXELS_API_KEY'])
    } catch (error: any) {
      console.warn(`Secret loading failed; continuing with environment/default values: ${error?.message || error}`)
    }
  }

  const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL || DEFAULT_SHEET_CSV_URL
  const result = await processCsvUrl(csvUrl)

  const targetAsin = String(process.env.ASIN || '').trim().toUpperCase()
  const row = targetAsin
    ? (result.rows.find((r: any) => [r.record?.ASIN, r.record?.Parent_ASIN, r.record?.asin].map((value: string) => String(value || '').toUpperCase()).includes(targetAsin)) ?? result.rows[0])
    : result.rows[0]
  if (!row) throw new Error('No ready/unposted product rows found')

  const record = row.record
  const asin = findAsin(record)
  const mappedLanding = getProductLandingConfigByAsin(asin)

  const title = pick(record, ['Title', 'title', 'Product_Name', 'Product', 'name']) || row.product?.title || row.product?.name || "Nature's Way Soil"
  const defaults = productDefaults(title)
  const hook = pick(record, ['Amazon_Hook', 'Hook', 'Video_Hook']) || defaults.hook
  const benefit1 = pick(record, ['Benefit_1']) || defaults.benefit1
  const benefit2 = pick(record, ['Benefit_2']) || defaults.benefit2
  const benefit3 = pick(record, ['Benefit_3']) || defaults.benefit3
  const cta = pick(record, ['CTA', 'Call_To_Action']) || mappedLanding?.cta || defaults.cta
  const landingUrl = mappedLanding?.url || pick(record, ['Landing_URL', 'Landing Page', 'URL', 'Product_URL']) || defaults.landingUrl
  const productImage = pick(record, ['Product_Image', 'Product_Image_Path', 'Image_Path'])
  const logoPath = process.env.BRAND_LOGO_PATH || '/home/ubuntu/Uploads/top of label.png'
  const bottomThirdText = `Shop now: ${landingUrl}`

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
  if (asin) console.log(`ASIN: ${asin}`)
  if (mappedLanding) console.log(`Mapped landing page: ${mappedLanding.url}`)
  console.log(`Landing URL: ${landingUrl}`)
  if (!fileExists(productImage)) console.warn('No product image found. Add Product_Image_Path in the sheet for bottle overlay.')
  if (!fileExists(logoPath)) console.warn(`Brand logo not found at ${logoPath}. End card will render without logo.`)

  const clipPaths: string[] = []
  for (let i = 0; i < queries.length; i++) {
    const clipPath = path.join(outDir, `clip-${i + 1}.mp4`)

    try {
      console.log(`Searching Pexels: ${queries[i]}`)
      const clipUrl = await findPexelsClip(queries[i])
      console.log(`Downloading clip ${i + 1}`)
      await downloadFile(clipUrl, clipPath)
    } catch (error: any) {
      console.warn(`Pexels clip retrieval failed for scene ${i + 1}; using fallback clip.`, error?.message || error)
      buildFallbackClip(clipPath, queries[i], i)
    }

    clipPaths.push(clipPath)
  }

  const textLines = [hook, benefit1, benefit2, benefit3, cta]
  const safeBottomThird = safeText(bottomThirdText, 72)
  const processedClips: string[] = []

  for (let i = 0; i < clipPaths.length; i++) {
    const processed = path.join(outDir, `scene-${i + 1}.mp4`)
    const text = safeText(textLines[i] || cta)
    const duration = i === 0 ? '5' : '4.5'
    const fontSize = i === 0 ? '54' : '44'
    const overlay = fileExists(productImage)
      ? `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.06:saturation=1.10[bg];[1:v]scale=260:-1[prod];[bg][prod]overlay=W-w-60:H-h-92,drawbox=x=55:y=490:color=black@0.52:width=790:height=105:t=fill,drawtext=text='${text}':fontcolor=white:fontsize=${fontSize}:x=85:y=522,drawbox=x=0:y=650:w=iw:h=70:color=0x122a1e@0.78:t=fill,drawtext=text='${safeBottomThird}':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=670`
      : `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.06:saturation=1.10,drawbox=x=55:y=490:color=black@0.52:width=1170:height=105:t=fill,drawtext=text='${text}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=522,drawbox=x=0:y=650:w=iw:h=70:color=0x122a1e@0.78:t=fill,drawtext=text='${safeBottomThird}':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=670`

    const args = ['-y', '-i', clipPaths[i]]
    if (fileExists(productImage)) args.push('-i', productImage)
    args.push('-t', duration, '-vf', overlay, '-an', '-r', '30', '-pix_fmt', 'yuv420p', processed)
    runFfmpeg(args)
    processedClips.push(processed)
  }

  const endCard = path.join(outDir, 'end-card.mp4')
  const endCardDuration = String(Number(process.env.END_CARD_DURATION_SECONDS || '4'))
  const endCardUrl = safeText(landingUrl, 68)
  const endCardCta = safeText(cta, 52)

  if (fileExists(logoPath)) {
    runFfmpeg([
      '-y', '-f', 'lavfi',
      '-i', `color=c=0x123423:s=1280x720:d=${endCardDuration}`,
      '-i', logoPath,
      '-filter_complex', `[1:v]scale=640:-1[logo];[0:v][logo]overlay=(W-w)/2:45:format=auto,drawbox=x=150:y=420:w=980:h=170:color=0x0f2518@0.86:t=fill,drawtext=text='${endCardCta}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=455,drawtext=text='${endCardUrl}':fontcolor=0xb4ff8a:fontsize=42:x=(w-text_w)/2:y=535,drawtext=text='Nature\'s Way Soil':fontcolor=white@0.80:fontsize=28:x=(w-text_w)/2:y=640`,
      '-r', '30', '-pix_fmt', 'yuv420p', endCard,
    ])
  } else {
    runFfmpeg([
      '-y', '-f', 'lavfi',
      '-i', `color=c=0x123423:s=1280x720:d=${endCardDuration}`,
      '-vf', `drawbox=x=150:y=270:w=980:h=320:color=0x0f2518@0.86:t=fill,drawtext=text='Nature\'s Way Soil':fontcolor=white:fontsize=58:x=(w-text_w)/2:y=315,drawtext=text='${endCardCta}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=410,drawtext=text='${endCardUrl}':fontcolor=0xb4ff8a:fontsize=40:x=(w-text_w)/2:y=500`,
      '-r', '30', '-pix_fmt', 'yuv420p', endCard,
    ])
  }

  processedClips.push(endCard)

  const listFile = path.join(outDir, 'clips-with-endcard.txt')
  fs.writeFileSync(listFile, processedClips.map((clip: string) => `file '${clip.replace(/'/g, "'\\''")}'`).join('\n'))

  const silent = path.join(outDir, `${slugify(title)}-amazon-video-silent.mp4`)
  runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent])

  const final = path.join(outDir, `${slugify(title)}-amazon-video-with-audio.mp4`)
  runFfmpeg([
    '-y', '-i', silent,
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=30',
    '-shortest', '-filter:a', 'volume=0.08',
    '-c:v', 'copy', '-c:a', 'aac', final,
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
