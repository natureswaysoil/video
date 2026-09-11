type MarketingPost = { channel: string, caption: string }

export type ApprovedMarketingCampaign = {
  id: string
  productId: string
  productName: string
  audience: string
  angle: string
  hook: string
  callToAction: string
  factualClaims: string[]
  videoBrief: { durationSeconds: number, voiceover: string, overlayText: string[], brollQueries: string[] }
  posts: MarketingPost[]
}

export function decodeMarketingCampaign(encoded = process.env.MARKETING_CAMPAIGN_B64 || ''): ApprovedMarketingCampaign | null {
  if (!encoded.trim()) return null
  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  if (!parsed.id || !parsed.productId || !parsed.productName || !parsed.videoBrief?.voiceover || !Array.isArray(parsed.posts)) {
    throw new Error('Marketing campaign input is incomplete')
  }
  return parsed as ApprovedMarketingCampaign
}

export function marketingProduct(campaign: ApprovedMarketingCampaign) {
  return {
    id: campaign.productId,
    name: campaign.productName,
    description: [campaign.angle, ...campaign.factualClaims].join('. '),
    category: 'Nature’s Way Soil product',
    websiteUrl: 'https://natureswaysoil.com',
    amazonUrl: '',
    keywords: [campaign.audience, campaign.angle, ...campaign.factualClaims],
    brollQueries: campaign.videoBrief.brollQueries
  }
}

export function marketingScenes(campaign: ApprovedMarketingCampaign) {
  const sentences = campaign.videoBrief.voiceover.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(value => value.trim()).filter(Boolean) || [campaign.videoBrief.voiceover]
  const sceneCount = 5
  const buckets = Array.from({ length: sceneCount }, () => [] as string[])
  sentences.forEach((sentence, index) => buckets[Math.min(sceneCount - 1, Math.floor(index * sceneCount / sentences.length))].push(sentence))
  for (let index = 1; index < buckets.length; index++) {
    if (!buckets[index].length) buckets[index].push(buckets[index - 1][buckets[index - 1].length - 1] || campaign.callToAction)
  }
  const names = ['Hook', 'Problem', 'Solution', 'Use', 'CTA']
  const duration = Math.max(15, Math.min(60, Number(campaign.videoBrief.durationSeconds) || 30))
  return names.map((name, index) => ({
    name,
    seconds: Math.max(3, Math.round(duration / sceneCount)),
    voiceover: index === 4 ? campaign.callToAction : buckets[index].join(' '),
    brollQuery: campaign.videoBrief.brollQueries[index] || campaign.videoBrief.brollQueries[0] || campaign.angle,
    brollQueries: [campaign.videoBrief.brollQueries[index] || campaign.videoBrief.brollQueries[0] || campaign.angle],
    caption: campaign.videoBrief.overlayText[index] || (index === 0 ? campaign.hook : name),
    useProductImage: index === 4
  }))
}

export function marketingCaption(campaign: ApprovedMarketingCampaign | null, channel: string, fallback: string): string {
  if (!campaign) return fallback
  const aliases: Record<string, string[]> = { tiktok: ['instagram'], facebook_groups: ['facebook'] }
  const accepted = [channel, ...(aliases[channel] || [])]
  return campaign.posts.find(post => accepted.includes(post.channel))?.caption || fallback
}
