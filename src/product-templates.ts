import { Product } from './core'

export type ProductTemplate = {
  key: string
  audience: string
  problem: string
  positioning: string
  proofCue: string
  usageCue: string
  tone: string
}

const templates: ProductTemplate[] = [
  {
    key: 'dog urine',
    audience: 'dog owners with yellow lawn spots and outdoor pet odor problems',
    problem: 'urine salts can stress grass and soil biology',
    positioning: 'a lawn and soil recovery support product for pet areas',
    proofCue: 'made fresh weekly by Nature’s Way Soil in North Carolina',
    usageCue: 'spray the affected area, soak the soil, and water in as directed',
    tone: 'practical, neighborly, pet-owner friendly',
  },
  {
    key: 'hay pasture',
    audience: 'small farms, hay producers, horse owners, and pasture managers',
    problem: 'thin forage, drought stress, weak soil activity, and tired pasture ground',
    positioning: 'a soil-first recovery blend for hay, pasture, and lawns',
    proofCue: 'built around soil biology, carbon, humic substances, kelp, and plant nutrition',
    usageCue: 'apply through a sprayer or irrigation-compatible setup and water in when possible',
    tone: 'direct farm supply language, no hype',
  },
  {
    key: 'biochar',
    audience: 'gardeners, lawn owners, landscapers, and soil builders',
    problem: 'poor nutrient holding, compacted tired soil, and weak microbial habitat',
    positioning: 'liquid biochar support for better soil structure and biology',
    proofCue: 'combines carbon-rich biochar with soil-focused inputs',
    usageCue: 'use as a soil drench or tank-mix partner as directed',
    tone: 'educational but sales-focused',
  },
  {
    key: 'kelp',
    audience: 'gardeners, fruit growers, lawn owners, and plant-care customers',
    problem: 'plants under heat, transplant, or seasonal stress need steady support',
    positioning: 'liquid kelp plant and soil support from Ascophyllum nodosum',
    proofCue: 'kelp is valued for natural plant-support compounds and trace minerals',
    usageCue: 'use as a foliar spray or soil drench according to the label',
    tone: 'clean, natural, garden-center friendly',
  },
  {
    key: 'bone meal',
    audience: 'tomato growers, flower gardeners, vegetable gardeners, and bloom-focused buyers',
    problem: 'root and bloom crops need phosphorus and calcium support',
    positioning: 'liquid bone meal for root, bloom, and fruiting support',
    proofCue: 'made as an easy-to-apply liquid concentrate',
    usageCue: 'apply as a soil drench around the root zone as directed',
    tone: 'simple and benefit-driven',
  },
  {
    key: 'fruit bloom',
    audience: 'tomato, pepper, berry, fruit tree, and flower growers',
    problem: 'fruiting and flowering plants need balanced bloom-stage nutrition',
    positioning: 'Fruit & Bloom Booster for flowering, fruit set, and root support',
    proofCue: 'combines fish, kelp, humic, fulvic, and bloom-focused nutrition',
    usageCue: 'use as a soil drench or foliar spray according to the label',
    tone: 'bright, garden-focused, results-oriented without overpromising',
  },
]

function getText(product: Product): string {
  return [product.title, product.name, product.details, product.description, product.Caption, product.caption]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function selectProductTemplate(product: Product): ProductTemplate {
  const text = getText(product)

  if (text.includes('dog') || text.includes('urine') || text.includes('pet')) return templates[0]
  if (text.includes('hay') || text.includes('pasture') || text.includes('forage')) return templates[1]
  if (text.includes('biochar')) return templates[2]
  if (text.includes('kelp') || text.includes('seaweed')) return templates[3]
  if (text.includes('bone meal') || text.includes('phosphorus') || text.includes('calcium')) return templates[4]
  if (text.includes('fruit') || text.includes('bloom') || text.includes('flower')) return templates[5]

  return {
    key: 'general soil product',
    audience: 'gardeners, lawn owners, landscapers, and soil-focused buyers',
    problem: 'tired soil and plants that need better root-zone support',
    positioning: 'a Nature’s Way Soil product built to support healthier soil and stronger plants',
    proofCue: 'made fresh weekly by Nature’s Way Soil in North Carolina',
    usageCue: 'apply according to the product label and water in when needed',
    tone: 'clear, practical, soil-educator voice',
  }
}

export function buildProductTemplateContext(product: Product): string {
  const template = selectProductTemplate(product)
  return [
    `Template: ${template.key}`,
    `Audience: ${template.audience}`,
    `Main problem: ${template.problem}`,
    `Positioning: ${template.positioning}`,
    `Trust cue: ${template.proofCue}`,
    `Usage cue: ${template.usageCue}`,
    `Tone: ${template.tone}`,
  ].join('\n')
}
