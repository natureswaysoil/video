import { generateScript } from './openai'
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

  // === NEW: Generate structured script with scenes + B-roll ===
  let scriptData: any = { voiceover: '', scenes: [] }
  try {
    // Convert row to simple Product object that generateScript expects
    const product = {
      id: row.id || row.ID || '',
      title: title,
      details: details,
      description: details,
      name: title
    } as any

    const rawScript = await generateScript(product)   // ← uses your updated openai.ts
    scriptData = JSON.parse(rawScript)
  } catch (err) {
    console.warn('Structured script failed, falling back to row description', err)
    scriptData.voiceover = details || title
  }

  // === Fetch Pexels B-roll for every scene ===
  const pexels = PexelsService.getInstance()
  const scenes: any[] = []

  for (const scene of scriptData.scenes || []) {
    let brollUrl = ''
    if (scene.brollKeyword) {
      brollUrl = await pexels.getBrollVideo(scene.brollKeyword, 12)
    }

    scenes.push({
      seconds: scene.seconds || '0-8',
      avatarText: scene.avatarText || '',
      brollUrl: brollUrl,
      visualDesc: scene.visualDesc || ''
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
      sourceImageUrl: first(row, ['Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url']) || undefined,
      mappingReason: reason
    },
    // NEW: Multi-scene + B-roll support
    scenes: scenes,
    structuredScript: scriptData
  }

  return {
    payload,
    avatar,
    voice,
    lengthSeconds,
    reason,
    scenes   // extra for logging/debugging
  }
}
