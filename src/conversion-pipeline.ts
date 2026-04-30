export type ProductLike = Record<string, any>

export type ConversionAssetPack = {
  websiteUrl: string
  utmUrl: string
  youtubeUrl: string
  instagramUrl: string
  facebookUrl: string
  socialCaption: string
  youtubeCaption: string
  instagramCaption: string
  facebookCaption: string
  shortCaption: string
  adAngles: string[]
  facebookGroupPost: string
  emailSubject: string
  emailBody: string
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

function addUtm(url: string, source: string, medium: string, campaign: string, content = 'short-form-video'): string {
  const sep = url.includes('?') ? '&' : '?'
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: content,
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

  const youtubeUrl = addUtm(websiteUrl, 'youtube', 'organic_shorts', campaign, 'youtube-shorts')
  const instagramUrl = addUtm(websiteUrl, 'instagram', 'organic_reels', campaign, 'instagram-reels')
  const facebookUrl = addUtm(websiteUrl, 'facebook', 'organic_reels_groups', campaign, 'facebook-reels-groups')
  const utmUrl = youtubeUrl

  const categoryHook: Record<string, string> = {
    'dog-lawn': 'Yellow dog spots do not have to ruin your lawn.',
    'soil-conditioner': 'Weak soil leads to weak plants.',
    'lawn-pasture': 'Thin grass usually starts below the surface.',
    compost: 'Better gardens start with better soil biology.',
    'bloom-root': 'Bigger blooms start with stronger roots.',
    'general-soil': 'Healthy plants start with living soil.',
  }

  const hook = categoryHook[category] || categoryHook['general-soil']

  const socialCaption = `${hook}\n\n${title} is built for soil-first results — helping support stronger roots, healthier growth, and better-looking lawns, gardens, and plants without overcomplicating your routine.\n\nOrder direct from Nature's Way Soil here:\n${utmUrl}`

  const youtubeCaption = `${hook}\n\n${title} helps support better growth from the soil up.\n\nOrder direct from Nature's Way Soil:\n${youtubeUrl}\n\n#gardening #lawncare #soilhealth #organicgardening #natureswaysoil`

  const instagramCaption = `${hook}\n\nSoil-first care for better-looking plants, lawns, and gardens.\n\nTap the link in bio or visit:\n${instagramUrl}\n\n#gardeningtips #lawncaretips #soilhealth #organicgardening #smallbusiness`

  const facebookCaption = `${hook}\n\n${title} was made for people who want practical, soil-focused lawn and garden care. Order direct and support a small soil-focused business here:\n${facebookUrl}`

  const shortCaption = `${hook} See ${title} here: ${utmUrl}`

  const adAngles = [
    `${hook} Try a soil-first solution from Nature's Way Soil.`,
    `Stop guessing. Feed the soil and support better growth with ${title}.`,
    `Built for gardeners, lawns, and small farms that want cleaner soil-focused inputs.`,
    `Order direct from Nature's Way Soil and support a small family business.`,
  ]

  const facebookGroupPost = `Question for gardeners and lawn owners: have you noticed that the real problem usually starts in the soil?\n\n${title} is one of our soil-first products made to help support stronger roots and healthier-looking growth.\n\nI made a short video showing the product and the problem it helps with. You can see it and order direct here:\n${facebookUrl}`

  const emailSubject = `${hook.replace(/\.$/, '')}`
  const emailBody = `Hi,\n\n${hook}\n\nWe made ${title} for customers who want a simple soil-first way to support healthier-looking growth. Instead of chasing surface symptoms, this product is built around the idea that stronger plants and better lawns start below ground.\n\nWatch the short video and order direct here:\n${websiteUrl}\n\nNaturally Stronger Soil Starts Here,\nNature's Way Soil`

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
    youtubeUrl,
    instagramUrl,
    facebookUrl,
    socialCaption,
    youtubeCaption,
    instagramCaption,
    facebookCaption,
    shortCaption,
    adAngles,
    facebookGroupPost,
    emailSubject,
    emailBody,
    amazonRepurposeNotes,
    aPlusModules,
    retargetingAudience: `Retarget visitors from YouTube, Instagram, and Facebook who watched or clicked ${category} videos but did not purchase within 14 days. Send them to ${websiteUrl} with a direct-order bundle, refill, or first-order offer.`,
  }
}

export function buildSheetUpdatesForConversionPack(pack: ConversionAssetPack): Record<string, string> {
  return {
    Website_URL: pack.websiteUrl,
    UTM_URL: pack.utmUrl,
    YouTube_URL: pack.youtubeUrl,
    Instagram_URL: pack.instagramUrl,
    Facebook_URL: pack.facebookUrl,
    Social_Caption: pack.socialCaption,
    YouTube_Caption: pack.youtubeCaption,
    Instagram_Caption: pack.instagramCaption,
    Facebook_Caption: pack.facebookCaption,
    Facebook_Group_Post: pack.facebookGroupPost,
    Short_Caption: pack.shortCaption,
    Email_Subject: pack.emailSubject,
    Email_Body: pack.emailBody,
    Ad_Angles: pack.adAngles.join('\n'),
    Amazon_Repurpose_Notes: pack.amazonRepurposeNotes.join('\n'),
    APlus_Module_Plan: pack.aPlusModules.map((m) => `${m.module}: ${m.headline} — ${m.copy}`).join('\n'),
    Retargeting_Audience: pack.retargetingAudience,
  }
}
