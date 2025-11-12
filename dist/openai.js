"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateScript = generateScript;
exports.generateBlogArticle = generateBlogArticle;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const rate_limiter_1 = require("./rate-limiter");
const config_validator_1 = require("./config-validator");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const rateLimiters = (0, rate_limiter_1.getRateLimiters)();
async function generateScript(product, opts) {
    const startTime = Date.now();
    try {
        const config = (0, config_validator_1.getConfig)();
        const apiKey = config.OPENAI_API_KEY;
        if (!apiKey) {
            throw new errors_1.AppError('OPENAI_API_KEY not configured', errors_1.ErrorCode.MISSING_CONFIG, 500);
        }
        const model = opts?.model || config.OPENAI_MODEL;
        const systemPrompt = opts?.systemPrompt || config.OPENAI_SYSTEM_PROMPT || "You are a concise 'how-to' script writer for ~30 second social videos about gardening products by Nature's Way Soil. Use clear steps and keep it friendly and practical.";
        const userTemplate = opts?.userTemplate || config.OPENAI_USER_TEMPLATE || "Write a how-to style voiceover script about {title}. Length: about 30 seconds. Give 3-5 quick, actionable steps the viewer can follow. Keep it approachable and helpful. End with exactly: 'Visit natureswaysoil.com for more info'. Product details to incorporate where helpful: {details}.";
        const title = String(product.title || product.name || product.id || '').trim();
        const details = String(product.details || '').trim();
        if (!title) {
            throw new errors_1.AppError('Product must have a title, name, or id', errors_1.ErrorCode.VALIDATION_ERROR, 400);
        }
        const filled = userTemplate
            .replaceAll('{title}', title)
            .replaceAll('{details}', details);
        logger.info('Generating script with OpenAI', 'OpenAI', {
            model,
            productTitle: title,
        });
        // Apply rate limiting and retry logic
        const text = await rateLimiters.execute('openai', async () => {
            return (0, errors_1.withRetry)(async () => {
                const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: filled },
                    ],
                    temperature: 0.7,
                    max_tokens: 300,
                }, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                    timeout: config.TIMEOUT_OPENAI,
                });
                const content = res.data?.choices?.[0]?.message?.content?.trim();
                if (!content) {
                    throw new errors_1.AppError('OpenAI returned no content', errors_1.ErrorCode.OPENAI_API_ERROR, 500);
                }
                return content;
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
        logger.info('Successfully generated script', 'OpenAI', {
            duration,
            scriptLength: text.length,
        });
        return text;
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('openai.error');
        metrics.recordHistogram('openai.error_duration', duration);
        logger.error('Failed to generate script', 'OpenAI', { duration }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        if (axios_1.default.isAxiosError(error)) {
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.OPENAI_API_ERROR, {
                productTitle: product.title || product.name,
            });
        }
        throw new errors_1.AppError(`OpenAI script generation failed: ${error.message || String(error)}`, errors_1.ErrorCode.OPENAI_API_ERROR, 500, true, { productTitle: product.title || product.name }, error instanceof Error ? error : undefined);
    }
}
/**
 * Generate a comprehensive blog article about a product using OpenAI
 */
async function generateBlogArticle(articleData, opts) {
    const startTime = Date.now();
    try {
        const config = (0, config_validator_1.getConfig)();
        const apiKey = config.OPENAI_API_KEY;
        if (!apiKey) {
            throw new errors_1.AppError('OPENAI_API_KEY not configured', errors_1.ErrorCode.MISSING_CONFIG, 500);
        }
        if (!articleData.productTitle || !articleData.videoUrl) {
            throw new errors_1.AppError('Product title and video URL are required', errors_1.ErrorCode.VALIDATION_ERROR, 400);
        }
        const model = opts?.model || process.env.OPENAI_MODEL || 'gpt-4o';
        const maxTokens = opts?.maxTokens || 4000;
        const systemPrompt = `You are an expert content writer for Nature's Way Soil, a company specializing in organic soil amendments and fertilizers. Write informative, engaging blog articles that educate readers about natural gardening while highlighting product benefits. Use a friendly, authoritative tone with practical tips and scientific backing.`;
        const userPrompt = `Write a comprehensive blog article about this product:

Product: ${articleData.productTitle}
${articleData.productDescription ? `Description: ${articleData.productDescription}` : ''}
${articleData.productUrl ? `Product URL: ${articleData.productUrl}` : ''}
Video URL: ${articleData.videoUrl}

Requirements:
1. Create an engaging title (60-80 characters)
2. Write a compelling excerpt (150-200 characters)
3. Generate full article content (1500-2500 words) in Markdown format
4. Include:
   - Introduction explaining the problem this product solves
   - Benefits and how it works
   - Usage tips and best practices
   - Scientific backing where relevant
   - Embed the video with: ![Product Video](${articleData.videoUrl})
   - Link to product: [${articleData.productTitle}](${articleData.productUrl || 'https://natureswaysoil.com'})
   - Call-to-action encouraging readers to try the product
5. Suggest 5-10 relevant tags
6. Create SEO-friendly meta description (150-160 characters)
7. Assign appropriate category (e.g., "Product Spotlight", "Soil Health", "Plant Care", "Organic Gardening")

Return as JSON with this structure:
{
  "title": "...",
  "excerpt": "...",
  "content": "... (full markdown content) ...",
  "category": "...",
  "tags": ["tag1", "tag2", ...],
  "metaDescription": "..."
}`;
        logger.info('Generating blog article with OpenAI', 'OpenAI', {
            model,
            productTitle: articleData.productTitle,
        });
        // Apply rate limiting and retry logic
        const parsed = await rateLimiters.execute('openai', async () => {
            return (0, errors_1.withRetry)(async () => {
                const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.7,
                    max_tokens: maxTokens,
                }, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                    timeout: config.TIMEOUT_OPENAI * 2, // Longer timeout for blog articles
                });
                const text = res.data?.choices?.[0]?.message?.content?.trim();
                if (!text) {
                    throw new errors_1.AppError('OpenAI returned no content', errors_1.ErrorCode.OPENAI_API_ERROR, 500);
                }
                try {
                    return JSON.parse(text);
                }
                catch (parseError) {
                    throw new errors_1.AppError('Failed to parse OpenAI response as JSON', errors_1.ErrorCode.OPENAI_API_ERROR, 500, true, { response: text.substring(0, 200) });
                }
            }, {
                maxRetries: 3,
                onRetry: (error, attempt) => {
                    logger.warn('Retrying OpenAI blog generation', 'OpenAI', {
                        attempt,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });
        });
        // Generate ID and slug
        const timestamp = Date.now();
        const id = `article_${timestamp}`;
        const slug = articleData.productTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const result = {
            id,
            slug,
            title: parsed.title,
            excerpt: parsed.excerpt,
            content: parsed.content,
            category: parsed.category || 'Product Spotlight',
            featuredImage: articleData.videoUrl.replace('.mp4', '-thumbnail.jpg'),
            tags: parsed.tags || [],
            metaDescription: parsed.metaDescription || parsed.excerpt,
        };
        const duration = Date.now() - startTime;
        metrics.incrementCounter('openai.blog_article.success');
        metrics.recordHistogram('openai.blog_article.duration', duration);
        logger.info('Successfully generated blog article', 'OpenAI', {
            duration,
            articleLength: result.content.length,
        });
        return result;
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('openai.blog_article.error');
        metrics.recordHistogram('openai.blog_article.error_duration', duration);
        logger.error('Failed to generate blog article', 'OpenAI', { duration }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        if (axios_1.default.isAxiosError(error)) {
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.OPENAI_API_ERROR, {
                productTitle: articleData.productTitle,
            });
        }
        throw new errors_1.AppError(`OpenAI blog generation failed: ${error.message || String(error)}`, errors_1.ErrorCode.OPENAI_API_ERROR, 500, true, { productTitle: articleData.productTitle }, error instanceof Error ? error : undefined);
    }
}
