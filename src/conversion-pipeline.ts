export type ProductLike = Record<string, any>

export type ConversionAssetPack = {
  websiteUrl: string
  utmUrl: string
  socialCaption: string
  shortCaption: string
  adAngles: string[]
  amazonRepurposeNotes: string[]
  aPlusModules: Array<{ module: string; headline: string; visual: string; copy: string }>
  retargetingAudience: string
}

function first(product: ProductLike, keys: string[]): string {
  for (const key of keys) {
    const value = product[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildWebsiteUrl(product: ProductLike): string {
  const direct = first(product, ['Website_URL', 'website_url', 'Product_URL', 'product_url', 'Landing_Page_URL', 'landing_page_url'])
  if (direct) return direct

  const base = (process.env.NWS_WEBSITE_BASE_URL || 'https://natureswaysoil.com').replace(/\/$/, '')
  const slug = first(product, ['Slug', 'slug']) || slugify(first(product, ['Title', 'title', 'Product', 'product', 'Name', 'name']) || 'product')
  return `${base}/products/${slug}`
}

function addUtm(url: string, source: string, medium: string, campaign: string): string {
  const sep = url.includes('?') ? '&' : '?'
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: 'short-form-video',
  })
  return `${url}${sep}${params.toString()}`
}

function categoryFromText(text: string): string {
  const lower = text.toLowerCase()
  if (/(dog|urine|yellow spot|pet)/.test(lower)) return 'dog-lawn'
  if (/(kelp|seaweed|humic|fulvic)/.test(lower)) return 'soil-conditioner'
  if (/(hay|pasture|forage|lawn)/.test(lower)) return 'lawn-pasture'
  if (/(compost|biochar|worm casting)/.test(lower)) return 'compost'
  if (/(bone meal|bloom|fruit|tree)/.test(lower)) return 'bloom-root'
  return 'general-soil'
}

export function buildConversionAssetPack(product: ProductLike, videoUrl: string): ConversionAssetPack {
  const title = first(product, ['Title', 'title', 'Product', 'product', 'Name', 'name']) || 'Nature\'s Way Soil'
  const details = first(product, ['Description', 'description', 'Details', 'details', 'Product Description', 'caption', 'Caption'])
  const category = categoryFromText(`${title} ${details}`)
  const websiteUrl = buildWebsiteUrl(product)
  const campaign = `${category}-${slugify(title).slice(0, 48)}`
  const utmUrl = addUtm(websiteUrl, 'social', 'organic_video', campaign)

  const categoryHook: Record<string, string> = {
    'dog-lawn': 'Yellow dog spots do not have to ruin your lawn.',
    'soil-conditioner': 'Weak soil leads to weak plants.',
    'lawn-pasture': 'Thin grass usually starts below the surface.',
    compost: 'Better gardens start with better soil biology.',
    'bloom-root': 'Bigger blooms start with stronger roots.',
    'general-soil': 'Healthy plants start with living soil.',
  }

  const hook = categoryHook[category] || categoryHook['general-soil']

  const socialCaption = `${hook}\n\n${title} is built for soil-first results — helping support stronger roots, healthier growth, and better-looking lawns, gardens, and plants without overcomplicating your routine.\n\nWatch the full product video and order direct here:\n${utmUrl}`

  const shortCaption = `${hook} See ${title} here: ${utmUrl}`

  const adAngles = [
    `${hook} Try a soil-first solution from Nature's Way Soil.`,
    `Stop guessing. Feed the soil and support better growth with ${title}.`,
    `Built for gardeners, lawns, and small farms that want cleaner soil-focused inputs.`,
    `Order direct from Nature's Way Soil and support a small family business.`,
  ]

  const amazonRepurposeNotes = [
    'Use the same video as Amazon listing video only after removing website-only pricing or direct-site exclusive language.',
    'Use the strongest 3-second hook as Image 2 or A+ headline text.',
    'Turn the application scene into an Amazon image that shows dilution/use clearly.',
    'Turn the benefit scene into an A+ module with one claim per panel.',
    'Keep Amazon claims compliant: avoid guaranteed, instant, pesticide, disease, cure, or kill language.',
  ]

  const aPlusModules = [
    {
      module: 'Hero Banner',
      headline: hook,
      visual: 'Product bottle beside healthy lawn/garden result with warm natural light.',
      copy: `${title} helps support better growth from the soil up.`,
    },
    {
      module: 'Problem / Solution',
      headline: 'Treat the Soil, Not Just the Surface',
      visual: 'Split visual: stressed soil or lawn on left, healthier growth on right.',
      copy: 'Designed for customers who want practical soil-focused plant and lawn care.',
    },
    {
      module: 'How to Use',
      headline: 'Simple to Mix. Easy to Apply.',
      visual: 'Measuring cup, watering can, hose-end sprayer, or backpack sprayer application.',
      copy: 'Follow label directions and apply as part of your regular care routine.',
    },
    {
      module: 'Brand Trust',
      headline: 'Naturally Stronger Soil Starts Here',
      visual: 'Nature’s Way Soil farm/soil/compost imagery with clean brand badge treatment.',
      copy: 'Made by a small soil-focused business that believes healthier plants start below ground.',
    },
  ]

  return {
    websiteUrl,
    utmUrl,
    socialCaption,
    shortCaption,
    adAngles,
    amazonRepurposeNotes,
    aPlusModules,
    retargetingAudience: `Retarget visitors who watched or clicked ${category} videos but did not purchase within 14 days. Send them to ${websiteUrl} with a direct-order offer or bundle.`,
  }
}

export function buildSheetUpdatesForConversionPack(pack: ConversionAssetPack): Record<string, string> {
  return {
    Website_URL: pack.websiteUrl,
    UTM_URL: pack.utmUrl,
    Social_Caption: pack.socialCaption,
    Short_Caption: pack.shortCaption,
    Ad_Angles: pack.adAngles.join('\n'),
    Amazon_Repurpose_Notes: pack.amazonRepurposeNotes.join('\n'),
    APlus_Module_Plan: pack.aPlusModules.map((m) => `${m.module}: ${m.headline} — ${m.copy}`).join('\n'),
    Retargeting_Audience: pack.retargetingAudience,
  }
}
