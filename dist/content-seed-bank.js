"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_VIDEO_CAMPAIGN_SEEDS = exports.CONTENT_SEED_BANK = void 0;
exports.getTestVideoCampaignSeeds = getTestVideoCampaignSeeds;
exports.getDailySeeds = getDailySeeds;
function cinematic(base) {
    return `${base} Create a premium vertical 9:16 direct-response product ad with motion in every shot. Use 5 fast scenes: 1) scroll-stopping problem close-up, 2) product bottle hero shot, 3) mixing or spraying application, 4) soil/root/grass/tree benefit close-up, 5) healthier result with product bottle and call-to-action mood. Use realistic outdoor footage style, shallow depth of field, camera push-in, handheld natural movement, sunlight, close-ups, before-and-after style contrast. Avoid a plain talking head. Avoid static backgrounds. Avoid showing a script, storyboard, or large text blocks as the main visual.`;
}
exports.CONTENT_SEED_BANK = [
    {
        angle: 'dog-problem-aware',
        title: 'Dog Urine Neutralizer & Lawn Revitalizer - Yellow Spot Recovery',
        productDescription: 'Yellow dog spots usually start below the surface. Nature’s Way Soil Dog Urine Neutralizer & Lawn Revitalizer helps support lawn and soil recovery where dog urine has stressed the grass. Soil-first lawn care, not a temporary green dye.',
        visualPrompt: cinematic('Dog on green lawn, close-up of yellow dog urine spot, product bottle in hand, homeowner spraying affected area, soil/root-zone close-up, healthier lawn result.'),
        websiteUrl: 'https://natureswaysoil.com/dog-urine-lawn-repair',
        platform: 'youtube,instagram,facebook',
    },
    {
        angle: 'dog-not-a-dye',
        title: 'Dog Urine Neutralizer & Lawn Revitalizer - Not a Green Dye',
        productDescription: 'This is not green paint for your lawn. Nature’s Way Soil Dog Urine Neutralizer & Lawn Revitalizer supports soil-level recovery in dog urine-stressed lawn areas with simple spot treatment use.',
        visualPrompt: cinematic('Show stressed yellow lawn spot, product bottle beside grass, no fake paint or color spray, real lawn application with watering can or pump sprayer, dog nearby, healthy grass close-up.'),
        websiteUrl: 'https://natureswaysoil.com/dog-urine-lawn-repair',
        platform: 'youtube,instagram,facebook',
    },
    {
        angle: 'hay-thin-pasture',
        title: 'Hay, Pasture & Lawn Fertilizer - Thin Pasture Support',
        productDescription: 'Thin pasture usually starts below the surface. Nature’s Way Soil Hay, Pasture & Lawn Fertilizer helps support grass vigor, soil biology, and better-looking pasture growth as part of a practical farm care routine.',
        visualPrompt: cinematic('Green pasture field, thin grass area, farm fence, product bottle on tailgate, backpack sprayer or ATV sprayer application, close-up of forage grass, small farm setting.'),
        websiteUrl: 'https://natureswaysoil.com/hay-pasture-fertilizer',
        platform: 'youtube,instagram,facebook',
    },
    {
        angle: 'hay-small-farm',
        title: 'Hay, Pasture & Lawn Fertilizer - Small Farm Grass Support',
        productDescription: 'Small farms need simple grass support. Nature’s Way Soil Hay, Pasture & Lawn Fertilizer is built for pasture, hay fields, and lawn areas where stronger soil and healthier grass matter.',
        visualPrompt: cinematic('Small farm pasture, hay grass, product bottle on fence post, farmer mixing fertilizer in sprayer, application across field, close-up of healthy grass blades moving in wind.'),
        websiteUrl: 'https://natureswaysoil.com/hay-pasture-fertilizer',
        platform: 'youtube,instagram,facebook',
    },
    {
        angle: 'lawn-thin-grass',
        title: 'Liquid Lawn Fertilizer - Thin Grass Soil Support',
        productDescription: 'Thin grass is usually a soil problem. Nature’s Way Soil Liquid Lawn Fertilizer supports stronger lawn growth from the soil up with a simple liquid routine for homeowners and landscapers.',
        visualPrompt: cinematic('Thin lawn before-style shot, soil close-up, product bottle on grass, hose-end sprayer or pump sprayer, homeowner spraying in smooth passes, healthy green grass result.'),
        websiteUrl: 'https://natureswaysoil.com/lawn-fertilizer',
        platform: 'youtube,instagram,facebook',
    },
    {
        angle: 'lawn-sprayer-routine',
        title: 'Liquid Lawn Fertilizer - Simple Sprayer Routine',
        productDescription: 'A better lawn routine starts with the soil. Nature’s Way Soil Liquid Lawn Fertilizer is easy to mix and apply with a sprayer to support greener, stronger-looking lawns.',
        visualPrompt: cinematic('Product bottle close-up, measuring cup pour, hose-end sprayer attachment, spraying lawn in even passes, root-zone soil visual, healthier grass under sunlight.'),
        websiteUrl: 'https://natureswaysoil.com/lawn-fertilizer',
        platform: 'youtube,instagram,facebook',
    },
    {
        angle: 'fruit-blooms',
        title: 'Fruit Tree Fertilizer - Blooms and Fruit Set Support',
        productDescription: 'Better fruit starts before the fruit appears. Nature’s Way Soil Fruit Tree Fertilizer helps support blooms, fruit set, root strength, and seasonal tree vigor for backyard fruit trees.',
        visualPrompt: cinematic('Apple, peach, citrus, pear, and backyard fruit tree visuals, bloom close-ups, developing fruit, product bottle near tree trunk, watering around root zone, healthy orchard feel.'),
        websiteUrl: 'https://natureswaysoil.com/fruit-tree-fertilizer',
        platform: 'youtube,instagram,facebook',
    },
    {
        angle: 'fruit-root-strength',
        title: 'Fruit Tree Fertilizer - Root Strength for Backyard Trees',
        productDescription: 'Strong roots support better blooms. Nature’s Way Soil Fruit Tree Fertilizer is made for apple, peach, pear, citrus, banana, and other fruit-bearing trees as part of a regular feeding routine.',
        visualPrompt: cinematic('Backyard fruit trees, close-up blooms, fruit forming, product bottle, watering around tree root zone, healthy leaves moving in breeze, fruit tree result shot.'),
        websiteUrl: 'https://natureswaysoil.com/fruit-tree-fertilizer',
        platform: 'youtube,instagram,facebook',
    }
];
exports.TEST_VIDEO_CAMPAIGN_SEEDS = [
    {
        angle: 'pasture-revival-test',
        title: 'Pasture Revival Soil Support',
        productDescription: 'Bring tired pasture back to life with soil-first nutrition support designed for stronger root activity and more resilient forage growth.',
        visualPrompt: 'Pasture grass before/after, product bottle hero shot, root-zone support visuals, and healthy green field recovery.',
        websiteUrl: 'https://natureswaysoil.com/pasture-revival',
        platform: 'youtube,instagram,twitter,pinterest',
        videoFileName: 'pasture-revival-test.mp4',
        hashtags: ['#PastureRevival', '#SoilHealth', '#RegenerativeAgriculture', '#NaturesWaySoil'],
    },
    {
        angle: 'dog-urine-neutralizer-test',
        title: 'Dog Urine Neutralizer Lawn Recovery',
        productDescription: 'Treat yellow dog spots at the soil level with a cleaner lawn recovery approach that supports healthier, greener regrowth over time.',
        visualPrompt: 'Dog spot close-up, spray application, root-zone support, and greener lawn recovery.',
        websiteUrl: 'https://natureswaysoil.com/dog-urine-neutralizer',
        platform: 'youtube,instagram,twitter,pinterest',
        videoFileName: 'dog-urine-neutralizer-test.mp4',
        hashtags: ['#DogUrineNeutralizer', '#LawnCare', '#SoilFirst', '#NaturesWaySoil'],
    },
    {
        angle: 'garden-mix-test',
        title: 'Garden Mix Nutrient Boost',
        productDescription: 'Help vegetables and flowers establish stronger roots and balanced growth with a biologically friendly garden mix routine.',
        visualPrompt: 'Raised bed visuals, mixing and watering sequence, healthy plants and blooms.',
        websiteUrl: 'https://natureswaysoil.com/garden-mix',
        platform: 'youtube,instagram,twitter,pinterest',
        videoFileName: 'garden-mix-test.mp4',
        hashtags: ['#GardenMix', '#OrganicGardening', '#HealthySoil', '#NaturesWaySoil'],
    },
    {
        angle: 'hydroponic-nutrients-test',
        title: 'Hydroponic Nutrient Performance',
        productDescription: 'Support cleaner hydroponic nutrient uptake and stronger plant vitality with a formulation built for indoor and greenhouse growers.',
        visualPrompt: 'Hydroponic reservoir prep, nutrient mixing, root and canopy growth progression.',
        websiteUrl: 'https://natureswaysoil.com/hydroponic-nutrients',
        platform: 'youtube,instagram,twitter,pinterest',
        videoFileName: 'hydroponic-nutrients-test.mp4',
        hashtags: ['#Hydroponics', '#HydroponicNutrients', '#IndoorGrowing', '#NaturesWaySoil'],
    },
    {
        angle: 'fruit-tree-fertilizer-test',
        title: 'Fruit Tree Fertilizer Seasonal Support',
        productDescription: 'Feed fruit trees for stronger bloom cycles, healthier root zones, and improved seasonal fruit development with a soil-first program.',
        visualPrompt: 'Backyard orchard shots, tree feeding around drip line, blooms and fruit set progression.',
        websiteUrl: 'https://natureswaysoil.com/fruit-tree-fertilizer',
        platform: 'youtube,instagram,twitter,pinterest',
        videoFileName: 'fruit-tree-fertilizer-test.mp4',
        hashtags: ['#FruitTreeFertilizer', '#BackyardOrchard', '#TreeCare', '#NaturesWaySoil'],
    },
];
function getTestVideoCampaignSeeds() {
    return exports.TEST_VIDEO_CAMPAIGN_SEEDS;
}
function getDailySeeds(count, date = new Date()) {
    const start = Math.floor(date.getTime() / 86400000) % exports.CONTENT_SEED_BANK.length;
    const rows = [];
    for (let i = 0; i < count; i++) {
        rows.push(exports.CONTENT_SEED_BANK[(start + i) % exports.CONTENT_SEED_BANK.length]);
    }
    return rows;
}
