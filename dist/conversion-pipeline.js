"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIORITY_PRODUCT_PLANS = void 0;
exports.buildConversionAssetPack = buildConversionAssetPack;
exports.buildSheetUpdatesForConversionPack = buildSheetUpdatesForConversionPack;
exports.PRIORITY_PRODUCT_PLANS = [
    {
        key: 'dog-urine',
        match: /dog|urine|yellow spot|pet/i,
        landingPath: '/dog-urine-lawn-repair',
        priority: 1,
        recommendedPostsPerWeek: 5,
        variations: [
            { angle: 'problem-aware', hook: 'Yellow dog spots start below the surface.', visual: 'dog on lawn, close-up yellow spot, soil/root-zone shot', cta: 'Order direct with Link checkout.' },
            { angle: 'not-a-dye', hook: 'This is not green paint for your lawn.', visual: 'product bottle beside stressed spot, no fake color, real lawn application', cta: 'See the soil-first lawn recovery page.' },
            { angle: 'repeat-spot-owner', hook: 'Same dog. Same spot. Same lawn problem.', visual: 'dog using same lawn area, homeowner applying product with sprayer', cta: 'Order the 1 gallon direct.' },
            { angle: 'bundle', hook: 'Treat the spot and support the soil.', visual: 'product plus sprayer or soil booster bundle, lawn recovery routine', cta: 'Get the direct-site bundle.' },
        ],
    },
    {
        key: 'hay-pasture',
        match: /hay|pasture|forage|horse|livestock/i,
        landingPath: '/products/horse-safe-hay-pasture-lawn-fertilizer',
        priority: 2,
        recommendedPostsPerWeek: 4,
        variations: [
            { angle: 'thin-pasture', hook: 'Thin pasture usually starts in the soil.', visual: 'pasture field, grass stand, sprayer application, farm fence', cta: 'Order direct for pasture care.' },
            { angle: 'horse-safe-positioning', hook: 'Pasture care should be practical and simple.', visual: 'horses near pasture, product bottle, grass close-ups', cta: 'See the hay and pasture formula.' },
            { angle: 'cost-per-acre', hook: 'Better grass starts before the next rain.', visual: 'farm application, rainfall, recovering forage, bottle close-up', cta: 'Shop the 1 gallon or 2.5 gallon.' },
            { angle: 'small-farm', hook: 'Small farms need simple grass support.', visual: 'small farm, hay grass, mixing and spraying routine', cta: 'Order direct from Nature’s Way Soil.' },
        ],
    },
    {
        key: 'lawn-fertilizer',
        match: /lawn fertilizer|lawn care|grass|turf|seaweed.*humic|humic.*lawn/i,
        landingPath: '/products/seaweed-humic-acid-lawn-treatment',
        priority: 3,
        recommendedPostsPerWeek: 4,
        variations: [
            { angle: 'thin-lawn', hook: 'Thin grass is usually a soil problem.', visual: 'thin lawn before, soil close-up, greener lawn after-style shot', cta: 'Order direct for lawn care.' },
            { angle: 'humic-kelp', hook: 'Feed the soil before you blame the grass.', visual: 'kelp/humic bottle, watering can, roots, lawn application', cta: 'See the lawn fertilizer page.' },
            { angle: 'sprayer-use', hook: 'One simple lawn spray routine.', visual: 'hose-end sprayer or pump sprayer, lawn pass, product close-up', cta: 'Shop the lawn treatment direct.' },
            { angle: 'seasonal-care', hook: 'Your lawn needs more than quick green-up.', visual: 'seasonal lawn care, spring/summer grass, soil/root graphics', cta: 'Build your lawn care routine.' },
        ],
    },
    {
        key: 'fruit-tree',
        match: /fruit tree|apple|peach|pear|citrus|banana|bloom|fruit set/i,
        landingPath: '/products/fruit-tree-fertilizer',
        priority: 4,
        recommendedPostsPerWeek: 3,
        variations: [
            { angle: 'blooms-fruit-set', hook: 'Better fruit starts before the fruit appears.', visual: 'fruit tree blooms, developing fruit, root-zone feeding', cta: 'See the fruit tree fertilizer.' },
            { angle: 'backyard-orchard', hook: 'Backyard fruit trees need steady support.', visual: 'home orchard, apple/peach/citrus trees, bottle application', cta: 'Order direct for fruit trees.' },
            { angle: 'root-strength', hook: 'Strong roots support better blooms.', visual: 'root-zone soil drench, tree canopy, healthy fruit close-up', cta: 'Start your fruit tree feeding routine.' },
            { angle: 'all-fruit-trees', hook: 'One simple feed for backyard fruit trees.', visual: 'apple, peach, citrus, banana visual montage with product bottle', cta: 'Shop the fruit tree formula.' },
        ],
    },
];
function first(product, keys) {
    for (const key of keys) {
        const value = product[key];
        if (value !== undefined && value !== null && String(value).trim() !== '')
            return String(value).trim();
    }
    return '';
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
function getPriorityPlan(product) {
    const text = [
        first(product, ['Title', 'title', 'Product', 'product', 'Name', 'name']),
        first(product, ['Description', 'description', 'Details', 'details', 'Product Description', 'caption', 'Caption']),
        first(product, ['Category', 'category', 'Tags', 'tags']),
    ].join(' ');
    return exports.PRIORITY_PRODUCT_PLANS.find((plan) => plan.match.test(text));
}
function buildWebsiteUrl(product) {
    const direct = first(product, ['Website_URL', 'website_url', 'Product_URL', 'product_url', 'Landing_Page_URL', 'landing_page_url']);
    if (direct)
        return direct;
    const base = (process.env.NWS_WEBSITE_BASE_URL || 'https://natureswaysoil.com').replace(/\/$/, '');
    const plan = getPriorityPlan(product);
    if (plan)
        return `${base}${plan.landingPath}`;
    const slug = first(product, ['Slug', 'slug']) || slugify(first(product, ['Title', 'title', 'Product', 'product', 'Name', 'name']) || 'product');
    return `${base}/products/${slug}`;
}
function addUtm(url, source, medium, campaign, content = 'short-form-video') {
    const sep = url.includes('?') ? '&' : '?';
    const params = new URLSearchParams({
        utm_source: source,
        utm_medium: medium,
        utm_campaign: campaign,
        utm_content: content,
    });
    return `${url}${sep}${params.toString()}`;
}
function categoryFromText(text) {
    const lower = text.toLowerCase();
    if (/(dog|urine|yellow spot|pet)/.test(lower))
        return 'dog-lawn';
    if (/(fruit tree|apple|peach|pear|citrus|banana|bloom|fruit set)/.test(lower))
        return 'fruit-tree';
    if (/(hay|pasture|forage|horse|livestock)/.test(lower))
        return 'hay-pasture';
    if (/(lawn fertilizer|lawn care|grass|turf|seaweed.*humic|humic.*lawn)/.test(lower))
        return 'lawn-fertilizer';
    if (/(kelp|seaweed|humic|fulvic)/.test(lower))
        return 'soil-conditioner';
    if (/(compost|biochar|worm casting)/.test(lower))
        return 'compost';
    if (/(bone meal|bloom|fruit|tree)/.test(lower))
        return 'bloom-root';
    return 'general-soil';
}
function buildConversionAssetPack(product, videoUrl) {
    const title = first(product, ['Title', 'title', 'Product', 'product', 'Name', 'name']) || 'Nature\'s Way Soil';
    const details = first(product, ['Description', 'description', 'Details', 'details', 'Product Description', 'caption', 'Caption']);
    const category = categoryFromText(`${title} ${details}`);
    const plan = getPriorityPlan(product);
    const variation = plan?.variations[0];
    const websiteUrl = buildWebsiteUrl(product);
    const campaign = plan?.key || `${category}-${slugify(title).slice(0, 48)}`;
    const youtubeUrl = addUtm(websiteUrl, 'youtube', 'organic_shorts', campaign, variation?.angle || 'youtube-shorts');
    const instagramUrl = addUtm(websiteUrl, 'instagram', 'organic_reels', campaign, variation?.angle || 'instagram-reels');
    const facebookUrl = addUtm(websiteUrl, 'facebook', 'organic_reels_groups', campaign, variation?.angle || 'facebook-reels-groups');
    const utmUrl = youtubeUrl;
    const categoryHook = {
        'dog-lawn': 'Yellow dog spots do not have to ruin your lawn.',
        'hay-pasture': 'Thin pasture usually starts below the surface.',
        'lawn-fertilizer': 'Thin grass is usually a soil problem.',
        'fruit-tree': 'Better fruit starts before the fruit appears.',
        'soil-conditioner': 'Weak soil leads to weak plants.',
        compost: 'Better gardens start with better soil biology.',
        'bloom-root': 'Bigger blooms start with stronger roots.',
        'general-soil': 'Healthy plants start with living soil.',
    };
    const hook = variation?.hook || categoryHook[category] || categoryHook['general-soil'];
    const socialCaption = `${hook}\n\n${title} is built for soil-first results — helping support stronger roots, healthier growth, and better-looking lawns, gardens, trees, or pasture without overcomplicating your routine.\n\nOrder direct from Nature's Way Soil here:\n${utmUrl}`;
    const youtubeCaption = `${hook}\n\n${title} helps support better growth from the soil up.\n\nOrder direct from Nature's Way Soil:\n${youtubeUrl}\n\n#gardening #lawncare #soilhealth #organicgardening #natureswaysoil`;
    const instagramCaption = `${hook}\n\nSoil-first care for better-looking plants, lawns, trees, and pastures.\n\nTap the link in bio or visit:\n${instagramUrl}\n\n#gardeningtips #lawncaretips #soilhealth #organicgardening #smallbusiness`;
    const facebookCaption = `${hook}\n\n${title} was made for people who want practical, soil-focused lawn, garden, tree, or pasture care. Order direct and support a small soil-focused business here:\n${facebookUrl}`;
    const shortCaption = `${hook} See ${title} here: ${utmUrl}`;
    const adAngles = plan
        ? plan.variations.map((v) => `${v.hook} ${v.cta}`)
        : [
            `${hook} Try a soil-first solution from Nature's Way Soil.`,
            `Stop guessing. Feed the soil and support better growth with ${title}.`,
            `Built for gardeners, lawns, and small farms that want cleaner soil-focused inputs.`,
            `Order direct from Nature's Way Soil and support a small family business.`,
        ];
    const facebookGroupPost = `Question for gardeners, lawn owners, and small farms: have you noticed that the real problem usually starts in the soil?\n\n${title} is one of our soil-first products made to help support stronger roots and healthier-looking growth.\n\nI made a short video showing the product and the problem it helps with. You can see it and order direct here:\n${facebookUrl}`;
    const emailSubject = `${hook.replace(/\.$/, '')}`;
    const emailBody = `Hi,\n\n${hook}\n\nWe made ${title} for customers who want a simple soil-first way to support healthier-looking growth. Instead of chasing surface symptoms, this product is built around the idea that stronger plants, lawns, trees, and pastures start below ground.\n\nWatch the short video and order direct here:\n${websiteUrl}\n\nNaturally Stronger Soil Starts Here,\nNature's Way Soil`;
    const amazonRepurposeNotes = [
        'Use the same video as Amazon listing video only after removing website-only pricing or direct-site exclusive language.',
        'Use the strongest 3-second hook as Image 2 or A+ headline text.',
        'Turn the application scene into an Amazon image that shows dilution/use clearly.',
        'Turn the benefit scene into an A+ module with one claim per panel.',
        'Keep Amazon claims compliant: avoid guaranteed, instant, pesticide, disease, cure, or kill language.',
    ];
    const aPlusModules = [
        {
            module: 'Hero Banner',
            headline: hook,
            visual: variation?.visual || 'Product bottle beside healthy lawn/garden result with warm natural light.',
            copy: `${title} helps support better growth from the soil up.`,
        },
        {
            module: 'Problem / Solution',
            headline: 'Treat the Soil, Not Just the Surface',
            visual: 'Split visual: stressed soil, lawn, pasture, or tree on left; healthier growth on right.',
            copy: 'Designed for customers who want practical soil-focused plant, lawn, tree, or pasture care.',
        },
        {
            module: 'How to Use',
            headline: 'Simple to Mix. Easy to Apply.',
            visual: 'Measuring cup, watering can, hose-end sprayer, pump sprayer, or backpack sprayer application.',
            copy: 'Follow label directions and apply as part of your regular care routine.',
        },
        {
            module: 'Brand Trust',
            headline: 'Naturally Stronger Soil Starts Here',
            visual: 'Nature’s Way Soil farm/soil/compost imagery with clean brand badge treatment.',
            copy: 'Made by a small soil-focused business that believes healthier plants start below ground.',
        },
    ];
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
    };
}
function buildSheetUpdatesForConversionPack(pack) {
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
    };
}
