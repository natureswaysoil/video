// @ts-nocheck
import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import fetch from 'node-fetch'
import { loadSecretsToEnv } from '../src/secret-manager'
import { getTestVideoCampaignSeeds } from '../src/content-seed-bank'
import { createClientWithSecrets as createDIDClientWithSecrets } from '../src/did'
import { generateScript } from '../src/openai'

// VIDEO_PROVIDER=did (default) → D-ID talking head (single scene, no b-roll)
// VIDEO_PROVIDER=heygen → HeyGen multi-scene with Pexels b-roll
const VIDEO_PROVIDER = (process.env.VIDEO_PROVIDER || 'did').toLowerCase()

const SECRETS_TO_LOAD = [
  // D-ID
  'DID_API_KEY',
  'DiD',
  // Shared
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'PEXELS_API_KEY',
  // HeyGen (only needed when VIDEO_PROVIDER=heygen)
  'HEYGEN_API_KEY',
  'HEYGEN_DEFAULT_AVATAR',
  'HEYGEN_DEFAULT_VOICE',
]

const SCENE_SECONDS = ['6', '7', '8', '7', '6'] // hook, context, solution, proof, cta
const TEST_VIDEOS_DIR = path.resolve(process.cwd(), 'test-campaign-videos')

// ── Angle-specific OpenAI voiceover templates ─────────────────────────────
const ANGLE_USER_TEMPLATES: Record<string, string> = {
  'problem-hook': `Write the spoken voiceover for a problem-first product ad about {title}.

Product details: {details}

Lead with a vivid hook naming the customer's frustrating problem in the first 4-5 words — something they feel right now in their yard or garden. Name the problem clearly. Introduce the product as the direct fix. Give 2-3 concrete benefits. Add an ease-of-use note.
End with exactly: "Visit natureswaysoil.com for more info"`,

  'solution-reveal': `Write the spoken voiceover for a product-reveal ad about {title}.

Product details: {details}

Lead by naming the product and what it does in one crisp, confident sentence. Create a "discover this fix" feeling. Briefly contrast the problem with the fix. Give 2-3 benefits. Make it feel like an exciting find for the viewer.
End with exactly: "Visit natureswaysoil.com for more info"`,

  'soil-science': `Write the spoken voiceover for a soil-education product ad about {title}.

Product details: {details}

Lead with a surprising insight about soil biology, root health, or plant nutrition that most homeowners don't know. Use that insight to explain why this product works at the root level. Give 2-3 benefits grounded in soil science language that still sounds natural.
End with exactly: "Visit natureswaysoil.com for more info"`,

  'results-proof': `Write the spoken voiceover for a results-focused product ad about {title}.

Product details: {details}

Lead with describing a specific visible result someone would see or experience after consistent use — something tangible they can picture in their yard, garden, or grow room. Make it feel real and proven. Give 2-3 benefits framed as outcomes, not features.
End with exactly: "Visit natureswaysoil.com for more info"`,

  'easy-routine': `Write the spoken voiceover for a simplicity-focused product ad about {title}.

Product details: {details}

Lead with how fast and easy this product is to use — make it feel achievable for any homeowner, grower, or farmer with no prior experience. Emphasize the simple routine. Give 2-3 benefits. Make the viewer feel like they can start today.
End with exactly: "Visit natureswaysoil.com for more info"`,
}

// ── Scene 1 (Hook) Pexels queries — angle × product ──────────────────────
// Each angle type opens on a different visual concept.
const HOOK_QUERIES: Record<string, Record<string, string>> = {
  'problem-hook': {
    'dog-urine':  'dead grass lawn brown spots yard',
    'garden-mix': 'wilting plants garden dry soil',
    'hydroponic': 'indoor plants grow light hydroponics',
    'fruit-tree': 'fruit tree orchard spring blossoms',
  },
  'solution-reveal': {
    'dog-urine':  'organic lawn care green grass spray',
    'garden-mix': 'organic garden fertilizer outdoor plants',
    'hydroponic': 'hydroponic system indoor plants growing',
    'fruit-tree': 'fruit tree garden care outdoor',
  },
  'soil-science': {
    'dog-urine':  'soil roots grass lawn close up',
    'garden-mix': 'dark rich garden soil organic',
    'hydroponic': 'plant roots water growing closeup',
    'fruit-tree': 'tree roots soil garden organic',
  },
  'results-proof': {
    'dog-urine':  'lush green lawn backyard sunlight',
    'garden-mix': 'vegetable garden harvest summer',
    'hydroponic': 'indoor plants thriving grow room',
    'fruit-tree': 'apple orchard fruit harvest summer',
  },
  'easy-routine': {
    'dog-urine':  'spraying lawn garden hose yard',
    'garden-mix': 'watering garden plants outdoor hose',
    'hydroponic': 'indoor garden simple routine plants',
    'fruit-tree': 'watering fruit tree garden outdoor',
  },
}

// ── 4 scenes per product: [problem, application, mechanism, result] ────────
// Each scene has multiple fallback queries tried in order.
const PRODUCT_SCENE_QUERY_SETS: Record<string, string[][]> = {
  'dog-urine': [
    ['dead grass yard', 'brown lawn spots', 'yellow grass lawn', 'lawn damage'],
    ['dog playing yard', 'dog grass outdoor', 'pet yard lawn', 'dog running grass'],
    ['spraying lawn garden', 'lawn spray hose', 'garden hose watering', 'watering lawn'],
    ['green lawn backyard', 'lush grass yard', 'healthy green grass', 'beautiful lawn'],
  ],
  'garden-mix': [
    ['garden soil planting', 'raised garden bed', 'vegetable garden outdoor', 'garden bed soil'],
    ['watering garden plants', 'garden care outdoor', 'watering vegetable garden', 'plant garden hose'],
    ['organic soil garden', 'garden amendment soil', 'planting outdoor garden', 'garden digging soil'],
    ['vegetable garden harvest', 'garden vegetables summer', 'healthy garden plants', 'summer harvest garden'],
  ],
  'hydroponic': [
    ['indoor plants growing', 'hydroponic system plants', 'indoor garden lights', 'plant growing indoor'],
    ['plant roots water', 'hydroponic roots closeup', 'water plants growing', 'indoor plants roots'],
    ['mixing garden nutrients', 'liquid fertilizer measuring', 'indoor garden routine', 'plant nutrient solution'],
    ['indoor harvest plants', 'hydroponic vegetables harvest', 'indoor garden yield', 'growing vegetables indoor'],
  ],
  'fruit-tree': [
    ['apple tree blossoms spring', 'fruit tree orchard', 'orchard trees blooming', 'fruit tree outdoor'],
    ['watering fruit tree', 'orchard tree care', 'tree watering garden', 'fruit tree outdoor care'],
    ['garden soil organic', 'tree care soil', 'organic garden outdoor', 'garden fertilizer outdoor'],
    ['fruit harvest basket', 'apple picking orchard', 'fresh fruit garden harvest', 'orchard fruit picking'],
  ],
}
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function findPexelsPhotoUrl(query: string, apiKey: string): Promise<string> {
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=10`
    const res = await fetch(url, { headers: { Authorization: apiKey } })
    if (!res.ok) return ''
    const data: any = await res.json()
    const photo = (data.photos || [])[0]
    return photo?.src?.portrait || photo?.src?.large || ''
  } catch {
    return ''
  }
}

function extractAngleType(angle: string): string {
  const parts = angle.split('-')
  // Last two segments give the angle type: 'problem-hook', 'soil-science', etc.
  return parts.slice(-2).join('-')
}

function extractProductKey(angle: string): string {
  if (angle.startsWith('dog-urine'))  return 'dog-urine'
  if (angle.startsWith('garden-mix')) return 'garden-mix'
  if (angle.startsWith('hydroponic')) return 'hydroponic'
  if (angle.startsWith('fruit-tree')) return 'fruit-tree'
  return 'garden-mix'
}

async function findPortraitBroll(
  queries: string[],
  apiKey: string,
  label: string
): Promise<string> {
  for (const query of queries) {
    try {
      const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=10&min_duration=5`
      const res = await fetch(url, { headers: { Authorization: apiKey } })
      if (!res.ok) { console.warn(`  Pexels ${res.status} for "${query}"`); continue }
      const data: any = await res.json()
      for (const video of (data.videos || [])) {
        const files: any[] = video.video_files || []
        const portrait = files.find((f: any) => Number(f.height) > Number(f.width) && f.link)
        const sd = files.find((f: any) => f.quality === 'sd' && f.link)
        const link = portrait?.link || sd?.link || files.find((f: any) => f.link)?.link
        if (link) {
          console.log(`  ${label}: "${query}" -> clip found`)
          return link
        }
      }
    } catch (e: any) {
      console.warn(`  Pexels error "${query}": ${e.message}`)
    }
  }
  console.log(`  ${label}: no portrait clip found, will use solid background`)
  return ''
}

// Split script text into exactly N parts at sentence boundaries.
function splitScript(text: string, count: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]
  if (sentences.length <= count) {
    while (sentences.length < count) sentences.push(sentences[sentences.length - 1])
    return sentences.slice(0, count)
  }
  const perScene = Math.ceil(sentences.length / count)
  const result = Array.from({ length: count }, (_, i) =>
    sentences.slice(i * perScene, (i + 1) * perScene).join(' ').trim()
  ).filter(Boolean)
  while (result.length < count) result.push(result[result.length - 1])
  return result.slice(0, count)
}

async function downloadVideo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { timeout: 120_000 } as any)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  const buffer = await res.arrayBuffer()
  fs.writeFileSync(destPath, Buffer.from(buffer))
  const sizeMb = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1)
  console.log(`  Saved ${sizeMb} MB -> ${path.basename(destPath)}`)
}

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const proc = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', videoPath
    ])
    let out = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', (code: number) => {
      const dur = parseFloat(out.trim())
      if (code === 0 && !isNaN(dur)) resolve(dur)
      else reject(new Error(`ffprobe failed (code ${code})`))
    })
  })
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', (d: Buffer) => { err += d.toString() })
    proc.on('close', (code: number) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg failed (code ${code}): ${err.slice(-400)}`))
    })
  })
}

// Composite 4 Pexels clips as background scenes with D-ID presenter overlay.
// Layout: b-roll fills the frame, presenter anchored at bottom-center.
async function compositeMultiScene(
  didVideoPath: string,
  brollPaths: string[],  // 1-4 local clip paths (may be fewer if Pexels failed)
  outputPath: string
): Promise<void> {
  if (brollPaths.length === 0) {
    fs.copyFileSync(didVideoPath, outputPath)
    return
  }

  const totalDur  = await getVideoDuration(didVideoPath)
  const segDur    = totalDur / brollPaths.length

  // Build ffmpeg inputs
  const ffArgs: string[] = ['-y', '-i', didVideoPath]
  for (const p of brollPaths) {
    ffArgs.push('-stream_loop', '-1', '-i', p)
  }

  // Build filter_complex
  const filterParts: string[] = []
  const W = 720, H = 1280
  const presenterW = 360  // presenter occupies bottom-center at half width

  // Scale each b-roll clip to portrait, trim to segment duration
  for (let i = 0; i < brollPaths.length; i++) {
    filterParts.push(
      `[${i + 1}:v]trim=duration=${segDur.toFixed(3)},setpts=PTS-STARTPTS,` +
      `scale=${W}:${H}:flags=lanczos:force_original_aspect_ratio=increase,` +
      `crop=${W}:${H},setsar=1[b${i}]`
    )
  }

  // Concat b-roll segments into one background track
  const concatLabels = brollPaths.map((_, i) => `[b${i}]`).join('')
  filterParts.push(`${concatLabels}concat=n=${brollPaths.length}:v=1:a=0[bg]`)

  // Scale D-ID presenter; anchor bottom-center with 20px margin
  filterParts.push(`[0:v]scale=${presenterW}:-2:flags=lanczos[pres]`)
  filterParts.push(`[bg][pres]overlay=(W-w)/2:H-h-20,format=yuv420p[v]`)

  ffArgs.push(
    '-filter_complex', filterParts.join(';'),
    '-map', '[v]',
    '-map', '0:a',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    outputPath
  )

  console.log(`  Compositing ${brollPaths.length} scenes with D-ID presenter...`)
  await runFfmpeg(ffArgs)
  const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)
  console.log(`  Composited video: ${sizeMb} MB`)
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Loading secrets from Google Secret Manager...')
  await loadSecretsToEnv(SECRETS_TO_LOAD)
  console.log('Secrets loaded')

  const pexelsApiKey = process.env.PEXELS_API_KEY?.trim()
  if (!pexelsApiKey && VIDEO_PROVIDER !== 'did') {
    throw new Error('PEXELS_API_KEY not found in Google Secret Manager or .env')
  }

  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true'
  if (dryRun) console.log('DRY_RUN=true - HeyGen jobs will NOT be submitted')

  // Filter to a specific angle if requested: ONLY_ANGLE=dog-urine-problem-hook
  const onlyAngle = process.env.ONLY_ANGLE?.trim()

  const avatar = process.env.HEYGEN_DEFAULT_AVATAR?.trim() || 'garden_expert_01'
  const voice  = process.env.HEYGEN_DEFAULT_VOICE?.trim()  || 'en_us_warm_female_01'

  let heygen: any = null
  let did: any = null
  if (!dryRun) {
    if (VIDEO_PROVIDER === 'did') {
      did = await createDIDClientWithSecrets()
      console.log('Video provider: D-ID')
    } else {
      heygen = await createHeyGenClient()
      console.log('Video provider: HeyGen')
    }
  }

  const seeds = getTestVideoCampaignSeeds().filter((s) => !onlyAngle || s.angle === onlyAngle)
  if (seeds.length === 0) throw new Error(`No seeds matched${onlyAngle ? ` ONLY_ANGLE=${onlyAngle}` : ''}`)

  fs.mkdirSync(TEST_VIDEOS_DIR, { recursive: true })

  const results: { angle: string; status: string; file?: string }[] = []

  for (const seed of seeds) {
    if (!seed.videoFileName) {
      console.warn(`Skipping "${seed.angle}" - no videoFileName`)
      continue
    }

    console.log(`\n=== ${seed.angle} ===`)
    console.log(`    ${seed.title}`)

    try {
      const angleType  = extractAngleType(seed.angle)
      const productKey = extractProductKey(seed.angle)

      // 1. Generate voiceover script via OpenAI
      console.log('  Generating voiceover script...')
      const userTemplate = ANGLE_USER_TEMPLATES[angleType] || ANGLE_USER_TEMPLATES['problem-hook']
      const script = await generateScript(
        { title: seed.title, details: seed.productDescription } as any,
        { userTemplate }
      )
      console.log(`  Script (${script.split(' ').length} words): ${script.slice(0, 80)}...`)

      let videoUrl: string

      if (VIDEO_PROVIDER === 'did') {
        // ── D-ID: talking-head composited over 4 Pexels b-roll scenes ────────
        const didPayload = {
          script,
          voiceId:   process.env.DID_VOICE_ID || 'en-US-JennyNeural',
          sourceUrl: process.env.DID_SOURCE_URL || undefined,
          title:     seed.title,
        }

        if (dryRun) {
          console.log('  DRY_RUN (D-ID) payload:')
          console.log(JSON.stringify({ angle: seed.angle, provider: 'did', script: script.slice(0, 120) + '...', voiceId: didPayload.voiceId, scenes: sceneQueryList }, null, 2))
          results.push({ angle: seed.angle, status: 'dry-run' })
          continue
        }

        // Fetch 4 Pexels portrait clips in parallel (each with multiple fallback queries)
        console.log('  Fetching 4 Pexels b-roll clips...')
        const sceneSets = PRODUCT_SCENE_QUERY_SETS[productKey] || sceneQueryList.map(q => [q])
        const brollUrls = await Promise.all(
          sceneSets.map((queries, i) => findPortraitBroll(queries, pexelsApiKey || '', `Scene ${i + 1}`))
        )

        console.log('  Submitting D-ID job...')
        const didJobId = await did!.createVideoJob(didPayload)
        console.log(`  Job ID: ${didJobId}`)

        console.log('  Polling for completion (up to 15 min)...')
        videoUrl = await did!.pollJobForVideoUrl(didJobId, {
          timeoutMs:      15 * 60_000,
          intervalMs:     10_000,
          initialDelayMs:  5_000,
        })

        // Download D-ID video to temp, download Pexels clips, composite, save final
        const tmpDir = path.join(TEST_VIDEOS_DIR, '.tmp')
        fs.mkdirSync(tmpDir, { recursive: true })
        const didTmp = path.join(tmpDir, `${seed.angle}-did.mp4`)
        console.log('  Downloading D-ID presenter...')
        await downloadVideo(videoUrl, didTmp)

        const brollPaths: string[] = []
        for (let i = 0; i < brollUrls.length; i++) {
          if (!brollUrls[i]) continue
          const bp = path.join(tmpDir, `${seed.angle}-broll${i}.mp4`)
          console.log(`  Downloading b-roll ${i + 1}...`)
          await downloadVideo(brollUrls[i], bp)
          brollPaths.push(bp)
        }

        const finalPath = path.join(TEST_VIDEOS_DIR, seed.videoFileName)
        await compositeMultiScene(didTmp, brollPaths, finalPath)

        // Clean up temp files
        try { fs.unlinkSync(didTmp) } catch {}
        for (const bp of brollPaths) { try { fs.unlinkSync(bp) } catch {} }

        results.push({ angle: seed.angle, status: 'success', file: seed.videoFileName })
        continue
      } else {
        // ── HeyGen: multi-scene with Pexels b-roll ─────────────────────────
        // 2. Fetch 5 portrait Pexels clips — one per scene
        console.log('  Fetching Pexels b-roll clips...')
        const hookQuery  = HOOK_QUERIES[angleType]?.[productKey] || 'organic garden healthy plants'
        const baseScenes = PRODUCT_SCENE_QUERIES[productKey] || ['organic garden', 'healthy plants', 'natural soil', 'green garden']

        const sceneQueries = [
          [hookQuery, 'organic garden healthy plants outdoor'],
          [baseScenes[0], 'lawn garden outdoor spray'],
          [baseScenes[1], 'soil healthy root zone garden'],
          [baseScenes[2], 'organic garden care natural'],
          [baseScenes[3], 'healthy green plants garden outdoor'],
        ]

        const brollUrls: string[] = []
        for (let i = 0; i < 5; i++) {
          const url = await findPortraitBroll(sceneQueries[i], pexelsApiKey, `Scene ${i + 1}`)
          brollUrls.push(url)
        }

        // 3. Split script into 5 scenes
        const sceneTexts = splitScript(script, 5)
        const scenes = sceneTexts.map((text, i) => ({
          seconds: SCENE_SECONDS[i] || '7',
          avatarText: text,
          brollUrl: brollUrls[i] || undefined,
        }))

        const heygenPayload = {
          script,
          avatar,
          voice,
          title: seed.title,
          subtitles: { enabled: true, style: 'short_lines' },
          scenes,
          meta: { angle: seed.angle, angleType, productKey, generatedAt: new Date().toISOString() },
        }

        if (dryRun) {
          console.log('  DRY_RUN (HeyGen) payload:')
          console.log(JSON.stringify({
            angle: seed.angle,
            script: script.slice(0, 120) + '...',
            scenes: scenes.map((s) => ({ seconds: s.seconds, avatarText: s.avatarText.slice(0, 40), hasBroll: !!s.brollUrl })),
          }, null, 2))
          results.push({ angle: seed.angle, status: 'dry-run' })
          continue
        }

        console.log('  Submitting HeyGen job...')
        const heygenJobId = await heygen!.createVideoJob(heygenPayload)
        console.log(`  Job ID: ${heygenJobId}`)

        console.log('  Polling for completion (up to 20 min)...')
        videoUrl = await heygen!.pollJobForVideoUrl(heygenJobId, {
          timeoutMs:             20 * 60_000,
          intervalMs:            15_000,
          initialDelayMs:        30_000,
          notFoundGracePeriodMs:  2 * 60_000,
        })
      }

      console.log(`  Completed: ${videoUrl.slice(0, 70)}...`)

      // 6. Download to test-campaign-videos/
      console.log('  Downloading...')
      await downloadVideo(videoUrl, path.join(TEST_VIDEOS_DIR, seed.videoFileName))

      results.push({ angle: seed.angle, status: 'success', file: seed.videoFileName })
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.error(`  Failed: ${msg}`)
      results.push({ angle: seed.angle, status: `error: ${msg}` })
    }
  }

  console.log('\n\nSummary:')
  console.log('─'.repeat(50))
  for (const r of results) {
    const tag = r.status === 'success' ? 'OK ' : r.status === 'dry-run' ? 'DRY' : 'ERR'
    console.log(`[${tag}] ${r.angle}${r.file ? ' -> ' + r.file : ''}`)
    if (r.status !== 'success' && r.status !== 'dry-run') console.log(`      ${r.status}`)
  }

  if (results.some((r) => r.status.startsWith('error'))) process.exit(1)
}

main().catch((error) => {
  console.error('generate-test-campaign-videos failed:', error)
  process.exit(1)
})
