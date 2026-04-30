export type SeedVariation = {
  angle: string
  title: string
  productDescription: string
  visualPrompt: string
  websiteUrl: string
  platform: string
}

export const CONTENT_SEED_BANK: SeedVariation[] = [
  {
    angle: 'dog-problem-aware',
    title: 'Dog Urine Neutralizer & Lawn Revitalizer - Yellow Spot Recovery',
    productDescription: 'Yellow dog spots usually start below the surface. Nature’s Way Soil Dog Urine Neutralizer & Lawn Revitalizer helps support lawn and soil recovery where dog urine has stressed the grass. Soil-first lawn care, not a temporary green dye.',
    visualPrompt: 'Vertical product video. Dog on green lawn, close-up of yellow spot, product bottle, homeowner applying with sprayer, soil/root-zone close-up, healthier lawn result. Warm natural light. Do not show text as the main visual.',
    websiteUrl: 'https://natureswaysoil.com/dog-urine-lawn-repair',
    platform: 'youtube,instagram,facebook',
  },
  {
    angle: 'dog-not-a-dye',
    title: 'Dog Urine Neutralizer & Lawn Revitalizer - Not a Green Dye',
    productDescription: 'This is not green paint for your lawn. Nature’s Way Soil Dog Urine Neutralizer & Lawn Revitalizer supports soil-level recovery in dog urine-stressed lawn areas with simple spot treatment use.',
    visualPrompt: 'Vertical ad. Show product bottle beside stressed lawn spot, no fake paint, real lawn application with watering can or sprayer, dog nearby, healthy grass close-up. Premium Amazon-style product ad.',
    websiteUrl: 'https://natureswaysoil.com/dog-urine-lawn-repair',
    platform: 'youtube,instagram,facebook',
  },
  {
    angle: 'hay-thin-pasture',
    title: 'Hay, Pasture & Lawn Fertilizer - Thin Pasture Support',
    productDescription: 'Thin pasture usually starts below the surface. Nature’s Way Soil Hay, Pasture & Lawn Fertilizer helps support grass vigor, soil biology, and better-looking pasture growth as part of a practical farm care routine.',
    visualPrompt: 'Vertical farm product video. Green pasture field, thin grass area, farm fence, product bottle, sprayer application, close-up of forage grass, small farm setting. Natural sunlight, practical farm feel.',
    websiteUrl: 'https://natureswaysoil.com/hay-pasture-fertilizer',
    platform: 'youtube,instagram,facebook',
  },
  {
    angle: 'hay-small-farm',
    title: 'Hay, Pasture & Lawn Fertilizer - Small Farm Grass Support',
    productDescription: 'Small farms need simple grass support. Nature’s Way Soil Hay, Pasture & Lawn Fertilizer is built for pasture, hay fields, and lawn areas where stronger soil and healthier grass matter.',
    visualPrompt: 'Vertical video. Small farm pasture, hay grass, product bottle on fence post, mixing in sprayer, application across field, close-up of healthy blades. No script or storyboard text.',
    websiteUrl: 'https://natureswaysoil.com/hay-pasture-fertilizer',
    platform: 'youtube,instagram,facebook',
  },
  {
    angle: 'lawn-thin-grass',
    title: 'Liquid Lawn Fertilizer - Thin Grass Soil Support',
    productDescription: 'Thin grass is usually a soil problem. Nature’s Way Soil Liquid Lawn Fertilizer supports stronger lawn growth from the soil up with a simple liquid routine for homeowners and landscapers.',
    visualPrompt: 'Vertical lawn ad. Thin lawn before-style shot, soil close-up, product bottle, hose-end sprayer or pump sprayer, homeowner walking lawn, healthy green grass result. Clean direct-response ad.',
    websiteUrl: 'https://natureswaysoil.com/lawn-fertilizer',
    platform: 'youtube,instagram,facebook',
  },
  {
    angle: 'lawn-sprayer-routine',
    title: 'Liquid Lawn Fertilizer - Simple Sprayer Routine',
    productDescription: 'A better lawn routine starts with the soil. Nature’s Way Soil Liquid Lawn Fertilizer is easy to mix and apply with a sprayer to support greener, stronger-looking lawns.',
    visualPrompt: 'Vertical video. Product bottle, measuring cup, hose-end sprayer, spraying lawn in passes, root-zone soil visual, healthier grass. Warm outdoor light, no text-heavy visuals.',
    websiteUrl: 'https://natureswaysoil.com/lawn-fertilizer',
    platform: 'youtube,instagram,facebook',
  },
  {
    angle: 'fruit-blooms',
    title: 'Fruit Tree Fertilizer - Blooms and Fruit Set Support',
    productDescription: 'Better fruit starts before the fruit appears. Nature’s Way Soil Fruit Tree Fertilizer helps support blooms, fruit set, root strength, and seasonal tree vigor for backyard fruit trees.',
    visualPrompt: 'Vertical fruit tree ad. Apple, peach, citrus, pear, and backyard fruit tree visuals, blooms, developing fruit, product bottle, root-zone soil drench, healthy orchard feel.',
    websiteUrl: 'https://natureswaysoil.com/fruit-tree-fertilizer',
    platform: 'youtube,instagram,facebook',
  },
  {
    angle: 'fruit-root-strength',
    title: 'Fruit Tree Fertilizer - Root Strength for Backyard Trees',
    productDescription: 'Strong roots support better blooms. Nature’s Way Soil Fruit Tree Fertilizer is made for apple, peach, pear, citrus, banana, and other fruit-bearing trees as part of a regular feeding routine.',
    visualPrompt: 'Vertical video. Backyard fruit trees, close-up blooms, fruit forming, product bottle, watering around tree root zone, healthy leaves. Premium clean garden ad.',
    websiteUrl: 'https://natureswaysoil.com/fruit-tree-fertilizer',
    platform: 'youtube,instagram,facebook',
  }
]

export function getDailySeeds(count: number, date = new Date()): SeedVariation[] {
  const start = Math.floor(date.getTime() / 86400000) % CONTENT_SEED_BANK.length
  const rows: SeedVariation[] = []
  for (let i = 0; i < count; i++) {
    rows.push(CONTENT_SEED_BANK[(start + i) % CONTENT_SEED_BANK.length])
  }
  return rows
}
