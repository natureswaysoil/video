import assert from 'assert'
import { decodeMarketingCampaign, marketingCaption, marketingProduct, marketingScenes } from './lib/marketing-campaign'

const campaign = {
  id: 'campaign-1', productId: 'dog-urine-neutralizer-32oz', productName: "Nature's Way Soil Dog Urine Neutralizer", audience: 'dog owners', angle: 'outdoor odor care', hook: 'Love your dog and your lawn', callToAction: 'Learn more at natureswaysoil.com.', factualClaims: ['Helps control outdoor pet odors'],
  videoBrief: { durationSeconds: 30, voiceover: 'Dogs bring joy. Lawn spots can be frustrating. Use a practical lawn-care routine. Follow label directions. Learn more today.', overlayText: ['Love your dog and lawn', 'Outdoor odor help'], brollQueries: ['dog on lawn', 'homeowner spraying lawn'] },
  posts: [{ channel: 'youtube', caption: 'Approved YouTube caption' }, { channel: 'instagram', caption: 'Approved social caption' }]
}
const encoded = Buffer.from(JSON.stringify(campaign)).toString('base64url')
const decoded = decodeMarketingCampaign(encoded)!
assert.equal(decoded.id, campaign.id)
assert.equal(marketingProduct(decoded).id, campaign.productId)
assert.equal(marketingScenes(decoded).length, 5)
assert.equal(marketingScenes(decoded)[4].useProductImage, true)
assert.equal(marketingCaption(decoded, 'tiktok', 'fallback'), 'Approved social caption')
assert.equal(marketingCaption(decoded, 'youtube', 'fallback'), 'Approved YouTube caption')
console.log('Marketing campaign integration tests passed')
