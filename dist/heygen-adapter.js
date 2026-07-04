"use strict";
/**
 * Adapter: map product row -> HeyGen payload and mapping info
 * Uses keyword rules and generic avatar/voice IDs as defaults.
 *
 * Exports:
 *  - mapProductToHeyGenPayload(row) => { payload, avatar, voice, lengthSeconds, reason }
 *  - writeBackMappingsToSheet(sheetId, gid, mappedRows) => Promise<boolean>
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapProductToHeyGenPayload = mapProductToHeyGenPayload;
exports.writeBackMappingsToSheet = writeBackMappingsToSheet;
const googleapis_1 = require("googleapis");
const google_auth_1 = require("./google-auth");
const DEFAULTS = {
    avatar: 'garden_expert_01',
    voice: 'en_us_warm_female_01',
    music: { style: 'acoustic_nature', volume: 0.18 },
    lengthSeconds: 30,
};
const CATEGORY_MAP = [
    { pattern: /\b(spray\s*pattern|indicator|coverage\s*indicator|applicator|lawn\s*spray)\b/i, avatar: 'garden_expert_01', voice: 'en_us_warm_female_01', lengthSeconds: 30, reason: 'matched keyword: spray/indicator', visualHint: 'lawn sprayer application, spray coverage on grass, hose-end sprayer, even spray distribution, product bottle on lawn, green grass' },
    { pattern: /\b(kelp|seaweed|algae)\b/i, avatar: 'garden_expert_01', voice: 'en_us_warm_female_01', lengthSeconds: 30, reason: 'matched keyword: kelp', visualHint: 'healthy green plants, liquid seaweed fertilizer, measuring cup, watering can, garden beds, natural sunlight' },
    { pattern: /\b(bone ?meal|bonemeal|bone)\b/i, avatar: 'farm_expert_02', voice: 'en_us_deep_male_01', lengthSeconds: 35, reason: 'matched keyword: bone meal', visualHint: 'strong roots, blooming plants, calcium and phosphorus support, liquid bottle near garden soil' },
    { pattern: /\b(hay|pasture|forage)\b/i, avatar: 'pasture_specialist_01', voice: 'en_us_neutral_mx_01', lengthSeconds: 40, reason: 'matched keyword: hay/pasture', visualHint: 'green pasture field, hay grass, sprayer application, farm fence line, healthy forage growth' },
    { pattern: /\b(humic|fulvic|humate|fulvate)\b/i, avatar: 'eco_gardener_01', voice: 'en_us_warm_female_02', lengthSeconds: 30, reason: 'matched keyword: humic/fulvic', visualHint: 'dark rich soil, active roots, lawn and garden soil conditioner, close-up of root zone moisture' },
    { pattern: /\b(compost|tea|soil conditioner)\b/i, avatar: 'eco_gardener_01', voice: 'en_us_warm_female_02', lengthSeconds: 30, reason: 'matched keyword: compost/soil', visualHint: 'living compost, worm castings, biochar, raised beds, vegetables, rich dark soil texture' },
];
function first(row, keys) {
    for (const key of keys) {
        const value = row[key];
        if (value !== undefined && value !== null && String(value).trim() !== '')
            return String(value).trim();
    }
    return '';
}
function cleanForPrompt(value) {
    return value.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim().slice(0, 900);
}
function buildVisualPrompt(row, title, details, visualHint) {
    const existingPrompt = first(row, [
        'Visual_Prompt', 'visual_prompt', 'Video_Prompt', 'video_prompt', 'Scene_Prompt', 'scene_prompt',
        'Image_Prompt', 'image_prompt', 'Creative_Brief', 'creative_brief'
    ]);
    if (existingPrompt)
        return cleanForPrompt(existingPrompt);
    return cleanForPrompt(`Create a premium vertical product marketing video for Nature's Way Soil. Show real garden and lawn visuals, not text describing the scene. Product: ${title}. Details: ${details}. Visual direction: ${visualHint}. Use close-up soil, roots, plants, product bottle, watering or spraying application, healthy before-and-after style transformation, warm natural light, clean Amazon-ready commercial look. Do not show a script, storyboard, captions as the main visual, or a person explaining what should be shown.`);
}
function mapProductToHeyGenPayload(row) {
    const textFields = [
        row.title, row.Title,
        row.name, row.Name,
        row.description, row.Description,
        row.details, row.Details,
        row['Short Description'], row['short_description'], row['Short_Description']
    ].filter(Boolean).map(String).join(' ');
    let avatar = process.env.HEYGEN_DEFAULT_AVATAR || DEFAULTS.avatar;
    let voice = process.env.HEYGEN_DEFAULT_VOICE || DEFAULTS.voice;
    let lengthSeconds = DEFAULTS.lengthSeconds;
    let reason = 'default';
    let visualHint = 'organic garden product, healthy plants, rich soil, roots, lawn and garden care, product bottle, natural outdoor setting';
    for (const rule of CATEGORY_MAP) {
        if (rule.pattern.test(textFields)) {
            avatar = rule.avatar;
            voice = rule.voice;
            lengthSeconds = rule.lengthSeconds || lengthSeconds;
            reason = rule.reason;
            visualHint = rule.visualHint;
            break;
        }
    }
    const title = first(row, ['Title', 'title', 'Product', 'product', 'Name', 'name']) || 'Nature\'s Way Soil product';
    const details = first(row, ['Product Description', 'description', 'Description', 'Details', 'details', 'caption', 'Caption']);
    const script = (row['Product Description'] || row.description || row.Details || row.details || row.Title || row.title || '').toString();
    const imageUrl = first(row, [
        'Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url', 'Main_Image_URL', 'main_image_url',
        'Background_Image_URL', 'background_image_url', 'Hero_Image_URL', 'hero_image_url'
    ]);
    const visualPrompt = buildVisualPrompt(row, title, details, visualHint);
    const payload = {
        script,
        avatar,
        voice,
        lengthSeconds,
        music: DEFAULTS.music,
        subtitles: { enabled: true, style: 'short_lines' },
        webhook: process.env.HEYGEN_WEBHOOK_URL || undefined,
        title,
        visualPrompt,
        imageUrl: imageUrl || undefined,
        meta: {
            productTitle: title,
            visualHint,
            sourceImageUrl: imageUrl || undefined,
        },
    };
    return {
        payload,
        avatar,
        voice,
        lengthSeconds,
        reason,
        visualHint,
    };
}
async function createSheetsAuthClient() {
    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
    return (0, google_auth_1.createGoogleAuthClient)(scopes);
}
async function writeBackMappingsToSheet(sheetId, gid, mappedRows, opts) {
    const authClient = await createSheetsAuthClient();
    if (typeof authClient.authorize === 'function') {
        await authClient.authorize();
    }
    const sheets = googleapis_1.google.sheets({ version: 'v4', auth: authClient });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheet = (meta.data.sheets || []).find((s) => String(s.properties?.sheetId) === String(gid));
    if (!sheet)
        throw new Error(`Sheet with gid ${gid} not found`);
    const sheetTitle = sheet.properties.title;
    const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetTitle}!1:1` });
    const headers = (headerRes.data.values?.[0] || []);
    const newCols = ['HEYGEN_AVATAR', 'HEYGEN_VOICE', 'HEYGEN_LENGTH_SECONDS', 'HEYGEN_MAPPING_REASON', 'HEYGEN_MAPPED_AT'];
    const missing = newCols.filter((c) => !headers.includes(c));
    let updatedHeaders = headers.slice();
    if (missing.length > 0) {
        updatedHeaders = headers.concat(missing);
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheetTitle}!1:1`,
            valueInputOption: 'RAW',
            requestBody: { values: [updatedHeaders] },
        });
    }
    const headerRes2 = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetTitle}!1:1` });
    const finalHeaders = (headerRes2.data.values?.[0] || []);
    const startIndex = finalHeaders.indexOf(newCols[0]);
    if (startIndex === -1)
        throw new Error('Failed to find new columns after header update');
    const blockValues = mappedRows.map((r) => newCols.map((c) => r[c] || ''));
    const startColLetter = columnToLetter(startIndex + 1);
    const endColLetter = columnToLetter(startIndex + newCols.length);
    const range = `${sheetTitle}!${startColLetter}2:${endColLetter}${mappedRows.length + 1}`;
    await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: blockValues },
    });
    return true;
}
exports.default = {
    mapProductToHeyGenPayload,
    writeBackMappingsToSheet,
};
function columnToLetter(col) {
    let temp = '';
    while (col > 0) {
        const rem = (col - 1) % 26;
        temp = String.fromCharCode(65 + rem) + temp;
        col = Math.floor((col - 1) / 26);
    }
    return temp;
}
