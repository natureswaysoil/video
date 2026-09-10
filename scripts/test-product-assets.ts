import assert from 'node:assert/strict'
import { productImageSources } from './lib/product-assets'

const sources = productImageSources({
  id: 'NWS_026',
  asin: 'B0FFZRM6BD',
  name: 'Liquid Humic & Fulvic Acid 32 oz',
  description: 'Soil conditioner with organic kelp'
})

assert.equal(sources[0], 'https://m.media-amazon.com/images/P/B0FFZRM6BD.01._SCLZZZZZZZ_.jpg')
assert.ok(
  sources.includes('https://raw.githubusercontent.com/natureswaysoil/best/main/public/images/products/NWS_021/main.jpg'),
  'expected maintained catalog fallback for humic/fulvic variants'
)

console.log('Product asset fallback tests passed')
