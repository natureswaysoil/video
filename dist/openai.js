"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
    const bannedPatterns = [
        /\bthis video\b/i,
        /\bin this video\b/i,
        /\bwe see\b/i,
        /\bon screen\b/i,
        /\bthe scene\b/i,
        /\bscene opens\b/i,
        /\bstep\s*1\b/i,
        /\bfirst[, ]/i,
        /\bnext[, ]/i,
        /\bfinally[, ]/i,
        /\bshot list\b/i,
        /\bcamera\b/i,
        /\bvisuals?\b/i,
    ];
    return bannedPatterns.some((pattern) => pattern.test(text));
}
function normalizeScriptCta(text) {
    const withoutTrailingCtas = text
        .trim()
        .replace(/Visit natureswaysoil\.com for more info\.?\s*$/i, '')
        .trim()
        .replace(/[.\s]*$/, '');
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
        const systemPrompt = opts?.systemPrompt ||
            config.OPENAI_SYSTEM_PROMPT ||
            `You are a direct-response product video copywriter for Nature's Way Soil.

Write ONLY the spoken voiceover for a short vertical product ad.

Conversion structure:
1. First sentence must be a scroll-stopping hook under 9 words.
2. Name the pain or desired outcome fast.
3. Introduce the product as the simple solution.
4. Give 2-3 concrete benefits.
5. Add one trust or usage cue.
6. Close with exactly: "${SCRIPT_CTA}"

Rules:
- 75 to 95 words total.
- Natural spoken English.
- Short punchy sentences.
- Confident, benefit-driven, easy to understand.
- Write like a farmer/soil educator, not a corporate ad.
- Keep claims practical, support-focused, and label-safe.
- Do not mention Amazon reviews, discounts, or unsupported certifications.

Do NOT describe the video, scenes, camera, captions, or visuals.
Return plain text only.`;
        const userTemplate = opts?.userTemplate ||
            config.OPENAI_USER_TEMPLATE ||
            `Write the spoken voiceover for a conversion-focused vertical product ad about {title}.

Product-specific template:
{templateContext}

Product details:
{details}

Audience:
Home gardeners, lawn owners, landscapers, small farms, and people who want soil-focused products.

The voiceover must follow this sales flow without numbering it:
- 0-3 seconds: strong hook about the customer's problem or desired result
- 3-8 seconds: name the problem clearly
- 8-18 seconds: introduce the product and what it helps do
- 18-25 seconds: reinforce the main benefit and ease of use
- 25-30 seconds: confident call to action

Important:
- write ONLY what the narrator should say
- do NOT describe visuals
- do NOT explain the video
- do NOT turn this into a how-to lesson
- do NOT give numbered steps
- do NOT overpromise

End with exactly: "${SCRIPT_CTA}".`;
        const title = String(product.title || product.name || product.id || '').trim();
        const details = String(product.details || product.description || product.Description || product.caption || '').trim();
        if (!title)
            throw new errors_1.AppError('Product must have a title, name, or id', errors_1.ErrorCode.VALIDATION_ERROR, 400);
        const filled = userTemplate
            .replaceAll('{title}', title)
            .replaceAll('{details}', details)
            .replaceAll('{templateContext}', (0, product_templates_1.buildProductTemplateContext)(product));
        logger.info('Generating script with OpenAI', 'OpenAI', { model, productTitle: title });
        const text = await rateLimiters.execute('openai', async () => {
            return (0, errors_1.withRetry)(async () => {
                const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: filled },
                    ],
                    temperature: 0.62,
                    max_tokens: 260,
                }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: config.TIMEOUT_OPENAI });
                const content = res.data?.choices?.[0]?.message?.content?.trim();
                if (!content)
                    throw new errors_1.AppError('OpenAI returned no content', errors_1.ErrorCode.OPENAI_API_ERROR, 500);
                if (looksLikeMetaNarration(content)) {
                    throw new errors_1.AppError('OpenAI returned production notes instead of spoken ad copy', errors_1.ErrorCode.OPENAI_API_ERROR, 500, true, { preview: content.substring(0, 200) });
                }
                const normalized = normalizeScriptCta(content);
                (0, claim_safety_1.assertMarketingClaimsSafe)(normalized, { productTitle: title, source: 'openai-script' });
                return normalized;
            }, {
                maxRetries: 3,
                onRetry: (error, attempt) => {
                    logger.warn('Retrying OpenAI request', 'OpenAI', {
                        attempt,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });
        });
        const duration = Date.now() - startTime;
        metrics.incrementCounter('openai.success');
        metrics.recordHistogram('openai.duration', duration);
        logger.info('Successfully generated script', 'OpenAI', { duration, scriptLength: text.length });
        return text;
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('openai.error');
        metrics.recordHistogram('openai.error_duration', duration);
        logger.error('Failed to generate script', 'OpenAI', { duration }, error);
        if (String(process.env.OPENAI_ALLOW_FALLBACK_SCRIPT || 'true').toLowerCase() === 'true') {
            const title = String(product.title || product.name || product.id || 'Nature\'s Way Soil').trim();
            const fallback = buildFallbackScript(title);
            (0, claim_safety_1.assertMarketingClaimsSafe)(fallback, { productTitle: title, source: 'fallback-script' });
            logger.warn('Using fallback conversion script', 'OpenAI', { productTitle: title });
            return fallback;
        }
        if (error instanceof errors_1.AppError)
            throw error;
        if (axios_1.default.isAxiosError(error))
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.OPENAI_API_ERROR, { productTitle: product.title || product.name });
        throw new errors_1.AppError(`OpenAI script generation failed: ${error.message || String(error)}`, errors_1.ErrorCode.OPENAI_API_ERROR, 500, true, { productTitle: product.title || product.name }, error instanceof Error ? error : undefined);
    }
}
