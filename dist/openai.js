"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.looksLikeMetaNarration = looksLikeMetaNarration;
exports.extractSpokenVoiceover = extractSpokenVoiceover;
exports.generateScript = generateScript;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const rate_limiter_1 = require("./rate-limiter");
const config_validator_1 = require("./config-validator");
const product_templates_1 = require("./product-templates");
const claim_safety_1 = require("./claim-safety");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const rateLimiters = (0, rate_limiter_1.getRateLimiters)();
const SCRIPT_CTA = 'Visit natureswaysoil.com for more info';
function looksLikeMetaNarration(text) {
    const bannedPatterns = [/\bthis video\b/i, /\bin this video\b/i, /\bwe see\b/i, /\bon screen\b/i, /\bthe scene\b/i, /\bscene opens\b/i, /\bscene\s*\d+\b/i, /\bcut(?:s)? to\b/i, /\bvoiceover\s*:/i, /\bnarrator\s*:/i, /\bhook\s*:/i, /\bvisual\s*:/i, /\bdirection\s*:/i, /\bstep\s*1\b/i, /\bfirst[, ]/i, /\bnext[, ]/i, /\bfinally[, ]/i, /\bshot list\b/i, /\bcamera\b/i, /\bvisuals?\b/i, /\bb-?roll\b/i, /\bclose[- ]?up\b/i, /\bpan(?:s|ning)?\b/i, /\bzoom(?:s|ing)?\b/i, /\bfade(?:s)?\b/i, /\btransition(?:s)?\b/i, /\b\d+\s*(?:second|sec)\b/i, /\[(?:scene|shot|camera|visual|music|sfx)[^\]]*\]/i];
    return bannedPatterns.some((pattern) => pattern.test(text));
}
function extractSpokenVoiceover(rawContent) {
    const raw = String(rawContent || '').trim();
    if (!raw)
        throw new errors_1.AppError('OpenAI returned no content', errors_1.ErrorCode.OPENAI_API_ERROR, 500);
    let voiceover = raw;
    try {
        const parsed = JSON.parse(raw);
        voiceover = String(parsed?.voiceover || '').trim();
    }
    catch {
        voiceover = raw.replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```$/i, '').replace(/^(?:voiceover|narration|script)\s*:\s*/i, '').trim();
    }
    if (!voiceover)
        throw new errors_1.AppError('OpenAI returned no spoken voiceover', errors_1.ErrorCode.OPENAI_API_ERROR, 500);
    if (looksLikeMetaNarration(voiceover))
        throw new errors_1.AppError('OpenAI returned production notes instead of spoken ad copy', errors_1.ErrorCode.OPENAI_API_ERROR, 500, true, { preview: voiceover.substring(0, 200) });
    return voiceover;
}
function normalizeScriptCta(text) {
    const withoutTrailingCtas = text.trim().replace(/Visit natureswaysoil\.com for more info\.?\s*$/i, '').trim().replace(/[.!?\s]*$/, '');
    return `${withoutTrailingCtas}. ${SCRIPT_CTA}`.trim();
}
function buildFallbackScript(title) {
    return `Tired of guessing what your soil needs? ${title} helps feed the soil so your plants, lawn, or garden can perform better from the roots up. Use it as part of your regular care routine for stronger growth, better vigor, and healthier-looking results. Give your soil the support it has been missing. ${SCRIPT_CTA}`;
}
async function generateScript(product, opts) {
    const startTime = Date.now();
    try {
        const config = (0, config_validator_1.getConfig)();
        const apiKey = config.OPENAI_API_KEY;
        if (!apiKey)
            throw new errors_1.AppError('OPENAI_API_KEY not configured', errors_1.ErrorCode.MISSING_CONFIG, 500);
        const model = opts?.model || config.OPENAI_MODEL || 'gpt-4o';
        const salesHook = String(product?.salesHook || '').trim();
        const salesProblem = String(product?.salesProblem || '').trim();
        const salesProofCue = String(product?.salesProofCue || '').trim();
        const salesCta = String(product?.salesCta || '').trim();
        const systemPrompt = opts?.systemPrompt || config.OPENAI_SYSTEM_PROMPT || `You are a direct-response product video copywriter for Nature's Way Soil. Write ONLY the spoken voiceover for a short vertical product ad. First sentence must be a scroll-stopping hook under 9 words. Name the pain or desired outcome fast. Introduce the product as the simple solution. Give 2-3 concrete benefits. Add one trust or usage cue. Keep claims practical and label-safe. Use natural spoken English, short punchy sentences, and a farmer/soil-educator voice. Do not describe scenes, camera, captions, visuals, editing, timing, music, or sound effects. Never include labels such as Hook, Scene, Narrator, Voiceover, Visual, or CTA. Return one JSON object only: {"voiceover":"the words the customer will hear"}.`;
        const userTemplate = opts?.userTemplate || config.OPENAI_USER_TEMPLATE || `Write a 75-95 word conversion-focused vertical ad about {title}.\n\nProduct-specific template:\n{templateContext}\n\nProduct details:\n{details}\n\nSales direction:\nPreferred hook: {salesHook}\nCustomer problem: {salesProblem}\nTrust/usage cue: {salesProofCue}\nPreferred CTA: {salesCta}\n\nUse the preferred hook when supplied, or a close variant no longer than 9 words. Focus on one customer problem, one clear outcome, 2-3 benefits, and one trust cue. Avoid generic filler. End with exactly: "${SCRIPT_CTA}".`;
        const title = String(product.title || product.name || product.id || '').trim();
        const details = String(product.details || product.description || product.Description || product.caption || '').trim();
        if (!title)
            throw new errors_1.AppError('Product must have a title, name, or id', errors_1.ErrorCode.VALIDATION_ERROR, 400);
        const filled = userTemplate.replaceAll('{title}', title).replaceAll('{details}', details).replaceAll('{templateContext}', (0, product_templates_1.buildProductTemplateContext)(product)).replaceAll('{salesHook}', salesHook).replaceAll('{salesProblem}', salesProblem).replaceAll('{salesProofCue}', salesProofCue).replaceAll('{salesCta}', salesCta);
        logger.info('Generating script with OpenAI', 'OpenAI', { model, productTitle: title });
        const text = await rateLimiters.execute('openai', async () => (0, errors_1.withRetry)(async () => {
            const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: filled }], temperature: 0.58, max_tokens: 260, response_format: { type: 'json_object' } }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: config.TIMEOUT_OPENAI });
            const normalized = normalizeScriptCta(extractSpokenVoiceover(res.data?.choices?.[0]?.message?.content));
            (0, claim_safety_1.assertMarketingClaimsSafe)(normalized, { productTitle: title, source: 'openai-script' });
            return normalized;
        }, { maxRetries: 3 }));
        metrics.incrementCounter('openai.success');
        metrics.recordHistogram('openai.duration', Date.now() - startTime);
        return text;
    }
    catch (error) {
        metrics.incrementCounter('openai.error');
        metrics.recordHistogram('openai.error_duration', Date.now() - startTime);
        logger.error('Failed to generate script', 'OpenAI', { duration: Date.now() - startTime }, error);
        if (String(process.env.OPENAI_ALLOW_FALLBACK_SCRIPT || 'true').toLowerCase() === 'true') {
            const title = String(product.title || product.name || product.id || "Nature's Way Soil").trim();
            const fallback = buildFallbackScript(title);
            (0, claim_safety_1.assertMarketingClaimsSafe)(fallback, { productTitle: title, source: 'fallback-script' });
            return fallback;
        }
        if (error instanceof errors_1.AppError)
            throw error;
        if (axios_1.default.isAxiosError(error))
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.OPENAI_API_ERROR, { productTitle: product.title || product.name });
        throw new errors_1.AppError(`OpenAI script generation failed: ${error.message || String(error)}`, errors_1.ErrorCode.OPENAI_API_ERROR, 500, true, { productTitle: product.title || product.name }, error instanceof Error ? error : undefined);
    }
}
