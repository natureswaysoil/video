import fs from 'fs'
import path from 'path'
import { generateScript } from './openai'
import { selectPexelsBackground } from './pexels'

type ProductRow = Record<string, any>

type HeyGenMappingDefaults = {
  avatar: string
  voice: string
  lengthSeconds: number
  avatarScale: number
  avatarOffsetX: number
  avatarOffsetY: number
  avatarStyle: string
}

type HeyGenMappingRule = Partial<HeyGenMappingDefaults> & {
  name: string
  pattern: string
  visualHint: string
}

type HeyGenMappingConfig = {
  defaults: HeyGenMappingDefaults
  rules: HeyGenMappingRule[]
}

const FALLBACK_MAPPING: HeyGenMappingConfig = {
  defaults: {
    avatar: 'Daisy-inskirt-20220818',
    voice: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
    lengthSeconds: 45,
    avatarScale: 0.58,
    avatarOffsetX: 0,
    avatarOffsetY: 0.08,
    avatarStyle: 'normal',
  },
  rules: [],
}

function loadHeyGenMapping(): HeyGenMappingConfig {
  const mappingPath = process.env.HEYGEN_MAPPING_FILE || path.resolve(process.cwd(), 'config', 'heygen-mapping.json')
  try {
    if (!fs.existsSync(mappingPath)) return FALLBACK_MAPPING
    const parsed = JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
    return {
      defaults: { ...FALLBACK_MAPPING.defaults, ...(parsed.defaults || {}) },
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
    }
  } catch (error) {
    console.warn('Could not load HeyGen mapping config, using fallback mapping:', error)
    return FALLBACK_MAPPING
  }
}

function first(row: ProductRow, keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return ''
}

function numberFromRow(row: ProductRow, keys: string[], fallback: number): number {
  const raw = first(row, keys)
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
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

function pickMapping(row: ProductRow, textFields: string) {
  const mapping = loadHeyGenMapping()
  const defaults = mapping.defaults
  const matchedRule = mapping.rules.find((rule) => {
    try {
      return new RegExp(rule.pattern, 'i').test(textFields)
    } catch {
      return false
    }
  })
  const selected = { ...defaults, ...(matchedRule || {}) }

  const avatar = first(row, ['HEYGEN_AVATAR', 'HeyGen_Avatar', 'Avatar_ID', 'avatar_id']) || process.env.HEYGEN_DEFAULT_AVATAR || selected.avatar
  const voice = first(row, ['HEYGEN_VOICE', 'HeyGen_Voice', 'Voice_ID', 'voice_id']) || process.env.HEYGEN_DEFAULT_VOICE || selected.voice
  const lengthSeconds = numberFromRow(row, ['HEYGEN_LENGTH_SECONDS', 'Length_Seconds', 'lengthSeconds'], Number(selected.lengthSeconds || defaults.lengthSeconds))
  const avatarScale = numberFromRow(row, ['HEYGEN_AVATAR_SCALE', 'Avatar_Scale', 'avatarScale'], Number(selected.avatarScale || defaults.avatarScale))
  const avatarOffsetX = numberFromRow(row, ['HEYGEN_AVATAR_OFFSET_X', 'Avatar_Offset_X', 'avatarOffsetX'], Number(selected.avatarOffsetX || defaults.avatarOffsetX))
  const avatarOffsetY = numberFromRow(row, ['HEYGEN_AVATAR_OFFSET_Y', 'Avatar_Offset_Y', 'avatarOffsetY'], Number(selected.avatarOffsetY || defaults.avatarOffsetY))
  const avatarStyle = first(row, ['HEYGEN_AVATAR_STYLE', 'Avatar_Style', 'avatarStyle']) || selected.avatarStyle || defaults.avatarStyle

  return {
    avatar,
    voice,
    lengthSeconds,
    avatarScale,
    avatarOffsetX,
    avatarOffsetY,
    avatarStyle,
    reason: matchedRule?.name || 'default',
    visualHint: matchedRule?.visualHint || 'organic garden product, healthy plants, rich soil, roots, lawn and garden care, product bottle, natural outdoor setting',
  }
}

export async function mapProductToHeyGenPayload(row: ProductRow) {
  const textFields = [
    row.title, row.Title,
    row.name, row.Name,
    row.description, row.Description,
    row.details, row.Details,
    row.Category, row.category,
    row.Keywords, row.keywords,
    row.Benefits, row.benefits,
    row['Short Description'], row['short_description'], row['Short_Description']
  ].filter(Boolean).map(String).join(' ')

  const selectedMapping = pickMapping(row, textFields)
  const { avatar, voice, lengthSeconds, avatarScale, avatarOffsetX, avatarOffsetY, avatarStyle } = selectedMapping
  const reason = selectedMapping.reason
  const visualHint = selectedMapping.visualHint

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
  const totalSeconds = lengthSeconds || FALLBACK_MAPPING.defaults.lengthSeconds

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
    avatarScale,
    avatarOffsetX,
    avatarOffsetY,
    avatarStyle,
    music: { style: 'upbeat', volume: 0.2 },
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
      heygenAvatar: avatar,
      heygenVoice: voice,
      avatarScale,
      avatarOffsetX,
      avatarOffsetY,
      avatarStyle,
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
