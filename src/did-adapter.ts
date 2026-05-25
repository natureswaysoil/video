type ProductRow = Record<string, string>

const DEFAULTS = {
  lengthSeconds: 30,
}

function first(row: ProductRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

export function mapProductToDidPayload(row: ProductRow) {
  const title = first(row, ['Title', 'title', 'Product', 'product', 'Name', 'name']) || "Nature's Way Soil product"
  const details = first(row, ['Product Description', 'description', 'Description', 'Details', 'details', 'caption', 'Caption'])
  const script = (row['Product Description'] || row.description || row.Details || row.details || row.Title || row.title || '').toString()

  const imageUrl = first(row, [
    'DID_SOURCE_URL', 'Did_Source_URL', 'D_ID_SOURCE_URL', 'Source_URL', 'source_url',
    'Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url', 'Main_Image_URL', 'main_image_url',
    'Background_Image_URL', 'background_image_url', 'Hero_Image_URL', 'hero_image_url'
  ])

  const presenterId = first(row, ['DID_PRESENTER_ID', 'D_ID_PRESENTER_ID', 'Presenter_ID', 'presenter_id'])
  const voiceId = first(row, ['DID_VOICE_ID', 'D_ID_VOICE_ID', 'Voice_ID', 'voice_id'])
  const lengthSeconds = Number(first(row, ['DID_LENGTH_SECONDS', 'Video_Length_Seconds', 'lengthSeconds'])) || DEFAULTS.lengthSeconds

  const payload = {
    script,
    title,
    sourceUrl: imageUrl || process.env.DID_SOURCE_URL || process.env.D_ID_SOURCE_URL || undefined,
    presenterId: presenterId || process.env.DID_PRESENTER_ID || process.env.D_ID_PRESENTER_ID || undefined,
    voiceId: voiceId || process.env.DID_VOICE_ID || process.env.D_ID_VOICE_ID || undefined,
    webhook: process.env.DID_WEBHOOK_URL || undefined,
    subtitles: { enabled: true },
    meta: {
      productTitle: title,
      details,
      sourceImageUrl: imageUrl || undefined,
    },
  }

  return {
    payload,
    avatar: presenterId || imageUrl || process.env.DID_PRESENTER_ID || process.env.DID_SOURCE_URL || 'did-default',
    voice: voiceId || process.env.DID_VOICE_ID || 'did-default-voice',
    lengthSeconds,
    reason: presenterId ? 'D-ID clips presenter' : 'D-ID talks source image',
  }
}

export default {
  mapProductToDidPayload,
}
