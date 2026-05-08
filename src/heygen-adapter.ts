import { generateScript } from './openai'
import { selectPexelsBackground } from './pexels'

type ProductRow = Record<string, any>

const DEFAULTS = {
  avatar: 'Daisy-inskirt-20220818',
  voice: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
  lengthSeconds: 60,
  music: { style: 'upbeat', volume: 0.2 },
}

type CategoryRule = {
  pattern: RegExp
  avatar: string
  voice: string
  lengthSeconds?: number
  reason: string
  visualHint: string
}

const CATEGORY_MAP: CategoryRule[] = [
  {
    pattern: /dog\s?urine|yellow\s?spot|lawn\s?repair/i,
    avatar: DEFAULTS.avatar,
    voice: DEFAULTS.voice,
    lengthSeconds: 60,
    reason: 'dog-urine-lawn',
    visualHint: 'dog walking on lawn, yellow grass spot, product bottle, healthy green grass close-up',
  },
  {
    pattern: /humic|fulvic|kelp|seaweed|soil\s?boost/i,
    avatar: DEFAULTS.avatar,
    voice: DEFAULTS.voice,
    lengthSeconds: 60,
    reason: 'soil-booster',
    visualHint: 'rich soil close-up, plant roots, kelp ocean, vegetable garden',
  },
  {
    pattern: /compost|worm\s?cast|biochar|duckweed/i,
    avatar: DEFAULTS.avatar,
    voice: DEFAULTS.voice,
    lengthSeconds: 60,
    reason: 'living-compost',
    visualHint: 'compost soil close-up, worm castings, raised bed garden, hands holding healthy soil',
  },
  {
    pattern: /hay|pasture|forage|cattle|livestock/i,
    avatar: DEFAULTS.avatar,
    voice: DEFAULTS.voice,
    lengthSeconds: 60,
    reason: 'hay-pasture',
    visualHint: 'green pasture field, hay bales, cattle grazing, lush grass close-up',
  },
]

function first(row: ProductRow, keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return ''
}

function buildVisualPrompt(row: ProductRow, title: string, details: string, visualHint: string): string {
  const parts = [
    `Premium 9:16 vertical product ad for ${title}.`,
    details ? `Context: ${details}` : '',
    `Visual style: ${visualHint}.`,
    'Realistic outdoor footage, shallow depth of field, natural sunlight, close-up product shots, soil/root/grass details.',
  ].filter(Boolean)
  return parts.join(' ')
}

export async function mapProductToHeyGenPayload(row: ProductRow) {
  const textFields = [
    row.title, row.Title,
    row.name, row.Name,
    row.description, row.Description,
    row.details, row.Details,
    row['Short Description'], row['short_description'], row['Short_Description']
  ].filter(Boolean).map(String).join(' ')

  let avatar = process.env.HEYGEN_DEFAULT_AVATAR || DEFAULTS.avatar
  let voice = process.env.HEYGEN_DEFAULT_VOICE || DEFAULTS.voice
  let lengthSeconds = DEFAULTS.lengthSeconds
  let reason = 'default'
  let visualHint = 'organic garden product, healthy plants, rich soil, roots, lawn and garden care, product bottle, natural outdoor setting'

  for (const rule of CATEGORY_MAP) {
    if (rule.pattern.test(textFields)) {
      avatar = rule.avatar
      voice = rule.voice
      lengthSeconds = rule.lengthSeconds || lengthSeconds
      reason = rule.reason
      visualHint = rule.visualHint
      break
    }
  }

  const title = first(row, ['Title', 'title', 'Product', 'product', 'Name', 'name']) || 'Nature\'s Way Soil product'
  const details = first(row, ['Product Description', 'description', 'Description', 'Details', 'details', 'caption', 'Caption'])

  // === Generate voiceover script (plain text or structured JSON) ===
  let scriptData: { voiceover: string; scenes: Array<any> } = { voiceover: '', scenes: [] }
  let rawScript = ''
  try {
    const product = {
      id: row.id || row.ID || '',
      title,
      details,
      description: details,
      name: title,
    } as any
    rawScript = await generateScript(product)
    try {
      const parsed = JSON.parse(rawScript)
      if (parsed && typeof parsed === 'object') {
        scriptData = {
          voiceover: parsed.voiceover || rawScript,
          scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
        }
      } else {
        scriptData.voiceover = rawScript
      }
    } catch {
      // GPT returned plain text — that's the normal path
      scriptData.voiceover = rawScript
    }
  } catch (err) {
    console.warn('Script generation failed, falling back to row description', err)
    scriptData.voiceover = details || title
  }

  // === Build scenes for HeyGen + Pexels b-roll ===
  // Priority order:
  //   1. GPT-supplied structured scenes (if openai.ts returns JSON in future)
  //   2. Rotation-supplied product.scenes[] (deterministic per-product queries)
  //   3. CATEGORY_MAP visualHint (single-scene fallback)
  const rotationScenes: Array<{ query: string; seconds?: number }> = Array.isArray(row.scenes) ? row.scenes : []
  const totalSeconds = lengthSeconds || DEFAULTS.lengthSeconds

  type PreparedScene = { query: string; seconds: number; avatarText: string; visualDesc: string }
  let preparedScenes: PreparedScene[] = []

  if (scriptData.scenes.length > 0) {
    preparedScenes = scriptData.scenes.map((s: any, i: number) => ({
      query: String(s.brollKeyword || s.visualDesc || rotationScenes[i]?.query || visualHint),
      seconds: Number(s.seconds) || totalSeconds / scriptData.scenes.length,
      avatarText: String(s.avatarText || ''),
      visualDesc: String(s.visualDesc || s.brollKeyword || ''),
    }))
  } else if (rotationScenes.length > 0) {
    const evenSeconds = totalSeconds / rotationScenes.length
    // Crude but useful: split voiceover into N chunks for per-scene avatarText
    const voSentences = (scriptData.voiceover || '')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const chunkSize = Math.max(1, Math.ceil(voSentences.length / rotationScenes.length))
    preparedScenes = rotationScenes.map((s, i) => ({
      query: s.query,
      seconds: s.seconds || evenSeconds,
      avatarText: voSentences.slice(i * chunkSize, (i + 1) * chunkSize).join(' '),
      visualDesc: s.query,
    }))
  }

  // === Resolve a Pexels b-roll URL for each prepared scene ===
  const scenes: any[] = []
  for (const sc of preparedScenes) {
    let brollUrl = ''
    try {
      const picked = await selectPexelsBackground({
        product: { title, details, name: title },
        record: { Category: sc.query },
        orientation: 'portrait',
        minDurationSeconds: Math.max(3, Math.ceil(sc.seconds)),
      })
      if (picked) brollUrl = picked.url
    } catch (e) {
      console.warn('Pexels b-roll lookup failed for scene', sc.query, e)
    }

    scenes.push({
      seconds: String(sc.seconds.toFixed(1)),
      avatarText: sc.avatarText,
      brollUrl,
      visualDesc: sc.visualDesc,
    })
  }

  // Build the final payload (HeyGen will now get scenes + B-roll)
  const payload = {
    script: scriptData.voiceover || details,   // full narration
    avatar,
    voice,
    lengthSeconds,
    music: DEFAULTS.music,
    subtitles: { enabled: true, style: 'short_lines' },
    webhook: process.env.HEYGEN_WEBHOOK_URL || undefined,
    title,
    visualPrompt: buildVisualPrompt(row, title, details, visualHint),
    imageUrl: first(row, ['Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url', 'Main_Image_URL', 'main_image_url']) || undefined,
    meta: {
      productTitle: title,
      visualHint,
      sourceImageUrl: first(row, ['Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url', 'Main_Image_URL', 'main_image_url']) || undefined,
      mappingReason: reason,
      sceneSource:
        scriptData.scenes.length > 0 ? 'gpt-structured' : rotationScenes.length > 0 ? 'rotation-config' : 'none',
    },
    scenes,
    structuredScript: scriptData,
  }

  return {
    payload,
    avatar,
    voice,
    lengthSeconds,
    reason,
    scenes,
    voiceover: scriptData.voiceover,
  }
}
