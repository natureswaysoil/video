"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeyGenClient = void 0;
exports.createClientWithSecrets = createClientWithSecrets;
exports.generateHeyGenVideo = generateHeyGenVideo;
exports.createHeyGenVideo = createHeyGenVideo;
exports.createVideo = createVideo;
exports.generateBlogVideo = generateBlogVideo;
exports.generateBlogPackage = generateBlogPackage;
exports.saveBlogMarkdown = saveBlogMarkdown;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const openai_1 = __importDefault(require("openai"));
function asList(value) {
    if (Array.isArray(value))
        return value.map(String).map((v) => v.trim()).filter(Boolean);
    return String(value || '').split(/[,\n;|]+/g).map((v) => v.trim()).filter(Boolean);
}
function slugify(value) {
    return String(value || 'nature-way-soil-blog')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'nature-way-soil-blog';
}
function productName(input) {
    return input.productName || input.productTitle || input.title || input.product?.name || input.product?.title || input.product?.Title || "Nature's Way Soil product";
}
function ctaUrl(input) {
    const url = input.landingPageUrl || input.websiteUrl || input.product?.landingPageUrl || input.product?.websiteUrl || input.product?.Landing_Page_URL || input.product?.Website_URL || '';
    if (/^https?:\/\//i.test(String(url)))
        return String(url);
    if (String(url).startsWith('/'))
        return `https://www.natureswaysoil.com${url}`;
    return 'https://www.natureswaysoil.com/';
}
function fallbackBroll(input) {
    const text = `${productName(input)} ${input.category || input.product?.category || ''} ${asList(input.keywords || input.product?.keywords).join(' ')}`.toLowerCase();
    if (/dog|urine|pet|odor|yellow spot/.test(text))
        return ['dog on green lawn', 'yellow lawn spots grass', 'homeowner spraying lawn', 'healthy green turf close up'];
    if (/pasture|hay|field|farm|acre|horse|cattle/.test(text))
        return ['green pasture field', 'tractor spraying pasture', 'healthy forage close up', 'farm soil grass roots'];
    if (/orchid|house plant|indoor/.test(text))
        return ['orchid plant close up', 'potting soil indoor plants', 'houseplant watering', 'healthy roots potting mix'];
    if (/biochar|compost|worm|casting|soil|humic|fulvic|kelp/.test(text))
        return ['hands holding rich soil', 'garden soil close up', 'raised bed garden', 'healthy plants'];
    return ['organic garden soil', 'gardener spraying plants', 'healthy garden plants', 'soil roots close up'];
}
function fallbackBlog(input) {
    const name = productName(input);
    const url = ctaUrl(input);
    const brollQueries = input.brollQueries?.length ? input.brollQueries : fallbackBroll(input);
    const slug = slugify(name);
    const blogTitle = `How ${name} Supports Healthier Soil and Stronger Plants`;
    const metaDescription = `${name} from Nature's Way Soil supports practical lawn, garden, and soil care. Learn how it fits your routine.`.slice(0, 155);
    const script = `If your lawn, garden, or soil is struggling, start at the root zone. ${name} is designed for practical soil-first care and regular use according to the label. Learn more at ${url}.`;
    const markdown = `---\ntitle: "${blogTitle.replace(/"/g, '\\"')}"\ndescription: "${metaDescription.replace(/"/g, '\\"')}"\nslug: "${slug}"\n---\n\n# ${blogTitle}\n\nHealthy plants start with a healthy root zone. ${name} is a Nature's Way Soil product designed for practical lawn, garden, pasture, or plant-care routines.\n\n## How it fits your routine\n\nUse the product according to its label directions and pair it with consistent watering and sound soil-care practices.\n\n## Useful video scenes\n\n${brollQueries.map((q) => `- ${q}`).join('\n')}\n\n## Learn more\n\n[Visit Nature's Way Soil](${url})\n`;
    return { videoUrl: '', videoId: '', status: 'blog_ready_video_not_generated_here', provider: 'openai-blog-compatibility', skipped: true, script, blogTitle, metaDescription, slug, markdown, brollQueries, ctaUrl: url };
}
async function generateOpenAIBlog(input) {
    if (!process.env.OPENAI_API_KEY)
        return fallbackBlog(input);
    const fallback = fallbackBlog(input);
    const name = productName(input);
    const url = ctaUrl(input);
    const client = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [{ role: 'user', content: `Create a concise SEO blog package for Nature's Way Soil. Product: ${name}. CTA: ${url}. Return JSON with blogTitle, metaDescription, slug, script, markdown. Keep claims practical and label-safe; no pesticide or cure claims.` }],
            temperature: 0.25,
            max_tokens: 1400,
            response_format: { type: 'json_object' },
        });
        const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
        return { ...fallback, ...parsed, status: 'blog_ready', skipped: false };
    }
    catch (error) {
        return { ...fallback, message: `OpenAI blog generation failed; fallback returned: ${error?.message || error}` };
    }
}
function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
}
function backgroundForScene(scene, fallbackImage) {
    if (isHttpUrl(scene?.brollUrl))
        return { type: 'video', url: String(scene.brollUrl), play_style: 'loop' };
    if (isHttpUrl(scene?.imageUrl))
        return { type: 'image', url: String(scene.imageUrl) };
    if (isHttpUrl(fallbackImage))
        return { type: 'image', url: String(fallbackImage) };
    return undefined;
}
class HeyGenClient {
    constructor(apiKey, endpoint = process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com') {
        if (!apiKey.trim())
            throw new Error('HEYGEN_API_KEY is not configured');
        this.client = axios_1.default.create({
            baseURL: endpoint,
            timeout: Number(process.env.TIMEOUT_HEYGEN || 60_000),
            headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        });
    }
    async resolveId(kind, requested) {
        const value = String(requested || '').trim();
        if (!value)
            throw new Error(`A HeyGen ${kind === 'avatars' ? 'avatar' : 'voice'} ID is required`);
        try {
            const endpoint = kind === 'avatars' ? '/v2/avatars' : '/v2/voices';
            const response = await this.client.get(endpoint, { timeout: 30_000 });
            const data = response.data?.data || response.data || {};
            const items = data[kind] || data.items || [];
            const idKey = kind === 'avatars' ? 'avatar_id' : 'voice_id';
            const nameKey = kind === 'avatars' ? 'avatar_name' : 'name';
            const lowered = value.toLowerCase();
            const match = items.find((item) => String(item?.[idKey] || item?.id || '') === value)
                || items.find((item) => String(item?.[nameKey] || item?.name || '').toLowerCase() === lowered);
            return String(match?.[idKey] || match?.id || value);
        }
        catch (error) {
            console.warn(`Could not resolve HeyGen ${kind}; using configured ID directly:`, error?.message || error);
            return value;
        }
    }
    async createVideoJob(payload) {
        const script = String(payload?.script || '').trim();
        if (!script)
            throw new Error('Spoken script is required for HeyGen video generation');
        const avatarId = await this.resolveId('avatars', payload.avatar || process.env.HEYGEN_DEFAULT_AVATAR || '');
        const voiceId = await this.resolveId('voices', payload.voice || process.env.HEYGEN_DEFAULT_VOICE || '');
        const scenes = Array.isArray(payload.scenes) && payload.scenes.length ? payload.scenes : [{ avatarText: script, imageUrl: payload.imageUrl }];
        const videoInputs = scenes.map((scene, index) => {
            const text = String(scene.avatarText || script).trim();
            const background = backgroundForScene(scene, payload.imageUrl);
            if (!background) {
                throw new Error(`Scene ${index + 1} has no real image or video background. Refusing to create a blank/green-screen marketing video.`);
            }
            return {
                character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
                voice: { type: 'text', input_text: text, voice_id: voiceId, speed: 1.0 },
                background,
            };
        });
        const response = await this.client.post('/v2/video/generate', {
            video_inputs: videoInputs,
            dimension: { width: 1080, height: 1920 },
            caption: true,
            ...(payload.title ? { title: payload.title } : {}),
            ...(payload.webhook ? { callback_url: payload.webhook } : {}),
        });
        const jobId = response.data?.data?.video_id || response.data?.video_id || response.data?.jobId;
        if (!jobId)
            throw new Error(`HeyGen did not return a video ID: ${JSON.stringify(response.data)}`);
        return String(jobId);
    }
    async pollJobForVideoUrl(jobId, options = {}) {
        const timeoutMs = options.timeoutMs ?? 20 * 60_000;
        const intervalMs = options.intervalMs ?? 15_000;
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const response = await this.client.get('/v1/video_status.get', { params: { video_id: jobId } });
            const data = response.data?.data || response.data || {};
            const status = String(data.status || '').toLowerCase();
            const videoUrl = data.captioned_video_url || data.captionedVideoUrl || data.video_url || data.videoUrl || data.url;
            if ((status === 'completed' || status === 'success') && videoUrl)
                return String(videoUrl);
            if (status === 'failed' || status === 'error')
                throw new Error(`HeyGen job failed: ${data.error || data.error_message || data.failure_message || 'unknown error'}`);
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        throw new Error(`HeyGen job ${jobId} timed out`);
    }
}
exports.HeyGenClient = HeyGenClient;
async function createClientWithSecrets() {
    return new HeyGenClient(process.env.HEYGEN_API_KEY || '');
}
async function generateHeyGenVideo(input) { return generateOpenAIBlog(input); }
async function createHeyGenVideo(input) { return generateOpenAIBlog(input); }
async function createVideo(input) { return generateOpenAIBlog(input); }
async function generateBlogVideo(input) { return generateOpenAIBlog(input); }
async function generateBlogPackage(input) { return generateOpenAIBlog(input); }
function saveBlogMarkdown(result, outputDir = 'content/blog') {
    const slug = result.slug || slugify(result.blogTitle || 'nature-way-soil-blog');
    const dir = path.resolve(process.cwd(), outputDir);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.resolve(dir, `${slug}.md`);
    fs.writeFileSync(file, result.markdown || '', 'utf8');
    return file;
}
exports.default = { createClientWithSecrets, generateHeyGenVideo, createHeyGenVideo, createVideo, generateBlogVideo, generateBlogPackage, saveBlogMarkdown };
