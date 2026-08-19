export type CaptionPlatform = 'youtube' | 'instagram' | 'facebook' | 'tiktok' | 'facebook_groups'

const SITE_URL = 'https://www.natureswaysoil.com'

function clamp(text: string, max: number) {
  return String(text || '').slice(0, max)
}

function hashtags(platform: CaptionPlatform) {
  if (platform === 'instagram') {
    return [
      '#NaturesWaySoil', '#SoilHealth', '#LawnCare', '#GardenTips', '#PastureCare',
      '#OrganicGardening', '#Homesteading', '#RegenerativeAgriculture', '#HealthySoil', '#LawnRepair',
      '#GardenSoil', '#RootHealth', '#PlantCare', '#BackyardGarden', '#SoilBiology',
      '#GrassCare', '#TurfCare', '#GardenLife', '#FarmLife', '#Compost', '#Biochar',
      '#HumicAcid', '#FulvicAcid', '#Kelp', '#SoilFirst'
    ]
  }
  if (platform === 'tiktok') return ['#NaturesWaySoil', '#LawnCare', '#SoilHealth', '#GardenTips', '#PastureCare']
  if (platform === 'youtube') return ['#NaturesWaySoil', '#SoilHealth', '#LawnCare', '#Gardening', '#PastureCare']
  return ['#NaturesWaySoil', '#SoilHealth', '#LawnCare', '#Gardening']
}

function trackedLandingUrl(product: any, platform: CaptionPlatform) {
  const productId = String(product?.id || '').trim()
  const configured = String(product?.websiteUrl || '').trim()
  const funnelByProduct: Record<string, string> = {
    NWS_014: '/dog-urine-lawn-repair',
    NWS_002: '/liquid-biochar-soil-restoration',
    NWS_021: '/pasture-lawn-recovery',
    NWS_022: '/pasture-lawn-recovery',
  }
  const funnel = funnelByProduct[productId]
  const destination = funnel ? `${SITE_URL}${funnel}` : configured || SITE_URL
  const url = new URL(destination.startsWith('http') ? destination : `${SITE_URL}${destination.startsWith('/') ? '' : '/'}${destination}`)
  url.searchParams.set('utm_source', platform)
  url.searchParams.set('utm_medium', 'organic_social')
  url.searchParams.set('utm_campaign', productId ? `product_${productId.toLowerCase()}` : 'scheduled_product_video')
  url.searchParams.set('utm_content', 'scheduled_video')
  return url.toString()
}

function siteCta(product: any, platform: CaptionPlatform) {
  const url = trackedLandingUrl(product, platform)
  return platform === 'instagram' ? `Shop through the link in our bio: ${url}` : `Shop direct: ${url}`
}

export function formatCaption(product: any, scenePlan: any, platform: CaptionPlatform) {
  const title = String(product?.name || '').trim()
  const description = String(product?.description || '').trim()
  const hook = String(scenePlan?.scenes?.[0]?.voiceover || scenePlan?.scenes?.[0]?.caption || '').trim()
  const tags = hashtags(platform).join(' ')

  if (platform === 'youtube') {
    const lines = [title, description, siteCta(product, platform), tags]
    return clamp(lines.filter(Boolean).join('\n\n'), 5000)
  }

  if (platform === 'instagram') {
    const lines = [title, hook || description, siteCta(product, platform), tags]
    return clamp(lines.filter(Boolean).join('\n\n'), 2200)
  }

  if (platform === 'tiktok') {
    const firstLine = hook || `Soil-first support with ${title}`
    const lines = [`${firstLine}\n${siteCta(product, platform)}`, description, tags]
    return clamp(lines.filter(Boolean).join('\n\n'), 2200)
  }

  const lines = [title, description, siteCta(product, platform), tags]
  return clamp(lines.filter(Boolean).join('\n\n'), 63206)
}
