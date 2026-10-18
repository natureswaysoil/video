import assert from 'node:assert/strict'
import {marketingProduct,marketingScenes} from './lib/marketing-campaign'
import {productImageSources} from './lib/product-assets'
const campaign:any={id:'a',productId:'NWS_012',productName:'Liquid Bone Meal Fertilizer',websiteUrl:'https://natureswaysoil.com/product/NWS_012',productImageUrl:'https://raw.githubusercontent.com/natureswaysoil/best/main/public/images/products/NWS_012/main.jpg',asin:'B0F9W7B3NL',angle:'Garden care',audience:'Gardeners',factualClaims:['Contains calcium and phosphorus'],callToAction:'Explore liquid bone meal at natureswaysoil.com.',videoBrief:{durationSeconds:30,voiceover:'Liquid bone meal fertilizer. Contains calcium and phosphorus. Follow the label directions. Explore liquid bone meal at natureswaysoil.com.',overlayText:['Bone meal','Garden care'],brollQueries:['vegetable garden','flowers']},posts:[]}
const product=marketingProduct(campaign);assert.equal(product.id,'NWS_012');assert.equal(product.productImageUrl,campaign.productImageUrl);assert.equal(product.asin,campaign.asin)
const sources=productImageSources(product);assert(sources.some(s=>s.includes('NWS_012')));assert(!sources.some(s=>s.includes('NWS_016')))
const narration=marketingScenes(campaign).map((s:any)=>s.voiceover).filter(Boolean).join(' ');assert.equal(narration,campaign.videoBrief.voiceover)
console.log('Automatic marketing product identity, image mapping, and lossless narration checks passed')
