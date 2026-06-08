"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchPexelsVideo = searchPexelsVideo;
exports.selectPexelsBackground = selectPexelsBackground;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("./logger");
const logger = (0, logger_1.getLogger)();
function isPortrait(width, height) {
    return height > width;
}
function pickBestVideoFile(video) {
    const mp4Files = (video.video_files || []).filter((f) => (f.file_type || '').toLowerCase() === 'video/mp4');
    if (mp4Files.length === 0)
        return undefined;
    const sorted = mp4Files.sort((a, b) => {
        const scoreA = Math.abs(a.width - 1080) + Math.abs(a.height - 1920);
        const scoreB = Math.abs(b.width - 1080) + Math.abs(b.height - 1920);
        return scoreA - scoreB;
    });
    return sorted[0];
}
function toSearchTerms(product, record) {
    const text = [
        product?.title,
        product?.name,
        product?.details,
        record?.Category,
        record?.category,
        record?.Type,
        record?.type,
    ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
        .join(' ');
    const terms = [];
    if (/kelp|seaweed|algae/.test(text))
        terms.push('seaweed fertilizer');
    if (/bone\s?meal|bonemeal|bone/.test(text))
        terms.push('organic garden fertilizer');
    if (/compost|soil|garden/.test(text))
        terms.push('gardening soil');
    if (/pasture|hay|forage|livestock/.test(text))
        terms.push('farm field');
    if (/humic|fulvic|humate/.test(text))
        terms.push('healthy soil close up');
    if (terms.length === 0) {
        terms.push('organic gardening', 'healthy plants', 'farm soil');
    }
    return terms;
}
async function searchPexelsVideo(query, opts) {
    const apiKey = process.env.PEXELS_API_KEY?.trim();
    if (!apiKey)
        return null;
    const orientation = opts?.orientation || 'portrait';
    const minDurationSeconds = opts?.minDurationSeconds ?? 8;
    const response = await axios_1.default.get('https://api.pexels.com/videos/search', {
        headers: { Authorization: apiKey },
        params: {
            query,
            per_page: 15,
            orientation,
            size: 'large',
        },
        timeout: 20_000,
    });
    const videos = response.data?.videos || [];
    for (const video of videos) {
        if (video.duration < minDurationSeconds)
            continue;
        if (orientation === 'portrait' && !isPortrait(video.width, video.height))
            continue;
        const selectedFile = pickBestVideoFile(video);
        if (!selectedFile?.link)
            continue;
        return {
            id: String(video.id),
            url: selectedFile.link,
            query,
            durationSeconds: video.duration,
        };
    }
    return null;
}
async function selectPexelsBackground(params) {
    const terms = toSearchTerms(params.product, params.record);
    for (const term of terms) {
        try {
            const picked = await searchPexelsVideo(term, {
                orientation: params.orientation,
                minDurationSeconds: params.minDurationSeconds,
            });
            if (picked) {
                logger.info('Selected Pexels background clip', 'Pexels', {
                    query: picked.query,
                    pexelsVideoId: picked.id,
                    durationSeconds: picked.durationSeconds,
                });
                return picked;
            }
        }
        catch (error) {
            logger.warn('Pexels query failed', 'Pexels', { term }, error);
        }
    }
    return null;
}
