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
    'dog-urine':  'dog yellow lawn dead spot grass',
    'garden-mix': 'struggling garden plants wilting soil',
    'hydroponic': 'hydroponic plant deficiency struggling leaves',
    'fruit-tree': 'fruit tree sparse blooms bare branches',
  },
  'solution-reveal': {
    'dog-urine':  'organic lawn care bottle product outdoor',
    'garden-mix': 'organic garden liquid fertilizer bottle',
    'hydroponic': 'hydroponic nutrient solution bottle label',
    'fruit-tree': 'organic tree fertilizer bottle garden drip',
  },
  'soil-science': {
    'dog-urine':  'lawn soil biology roots macro close up',
    'garden-mix': 'rich dark organic garden soil close up',
    'hydroponic': 'plant roots water nutrient solution close',
    'fruit-tree': 'tree root zone soil organic matter close up',
  },
  'results-proof': {
    'dog-urine':  'lush green lawn healthy yard sunlight',
    'garden-mix': 'abundant vegetable garden healthy harvest',
    'hydroponic': 'thriving hydroponic plants lush green canopy',
    'fruit-tree': 'abundant fruit harvest orchard apple peach',
  },
  'easy-routine': {
    'dog-urine':  'homeowner simple lawn spray routine yard',
    'garden-mix': 'simple garden watering routine outdoor hose',
    'hydroponic': 'mixing hydroponic nutrients measuring simple',
    'fruit-tree': 'simple fruit tree care watering routine',
  },
}

// ── Scenes 2-5 (Context → Application → Benefit → CTA) per product ───────
const PRODUCT_SCENE_QUERIES: Record<string, string[]> = {
  'dog-urine': [
    'dog urine yellow spot lawn grass',
    'homeowner spraying lawn pump sprayer',
    'grass roots soil healthy close up',
    'green healthy lawn backyard sunlight',
  ],
  'garden-mix': [
    'raised bed vegetable garden planting',
    'watering garden plants organic can',
    'plant root system soil healthy',
    'lush vegetable garden harvest summer',
  ],
  'hydroponic': [
    'hydroponic reservoir nutrient mixing',
    'plant roots water healthy hydroponic',
    'indoor grow room lights plants',
    'hydroponic vegetable harvest yield',
  ],
  'fruit-tree': [
    'apple peach tree blooms spring',
    'watering around fruit tree drip line',
    'fruit tree root zone healthy soil',
    'backyard orchard citrus fruit harvest',
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
        // ── D-ID: talking-head with Pexels photo background ────────────────
        let backgroundImageUrl: string | undefined
        if (pexelsApiKey) {
          const hookQuery = HOOK_QUERIES[angleType]?.[productKey] || 'organic garden healthy plants'
          console.log(`  Fetching Pexels background photo: "${hookQuery}"...`)
          backgroundImageUrl = await findPexelsPhotoUrl(hookQuery, pexelsApiKey) || undefined
          if (backgroundImageUrl) console.log('  Background photo found')
          else console.log('  No background photo found, using default')
        }

        const didPayload = {
          script,
          voiceId:            process.env.DID_VOICE_ID || 'en-US-JennyNeural',
          sourceUrl:          process.env.DID_SOURCE_URL || undefined,
          backgroundImageUrl,
          title:              seed.title,
        }

        if (dryRun) {
          console.log('  DRY_RUN (D-ID) payload:')
          console.log(JSON.stringify({ angle: seed.angle, provider: 'did', script: script.slice(0, 120) + '...', voiceId: didPayload.voiceId }, null, 2))
          results.push({ angle: seed.angle, status: 'dry-run' })
          continue
        }

        console.log('  Submitting D-ID job...')
        const didJobId = await did!.createVideoJob(didPayload)
        console.log(`  Job ID: ${didJobId}`)

        console.log('  Polling for completion (up to 15 min)...')
        videoUrl = await did!.pollJobForVideoUrl(didJobId, {
          timeoutMs:      15 * 60_000,
          intervalMs:     10_000,
          initialDelayMs:  5_000,
        })
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
