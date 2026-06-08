import axios from 'axios'
import { Product } from './core'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'

const logger = getLogger()
const metrics = getMetrics()
const rateLimiters = getRateLimiters()
const SCRIPT_CTA = 'Visit natureswaysoil.com for more info'

function looksLikeMetaNarration(text: string): boolean {
  const bannedPatterns = [
    /\bthis video\b/i,
    /\bin this video\b/i,
    /\bwe see\b/i,
    /\bon screen\b/i,
    /\bthe scene\b/i,
    /\bscene opens\b/i,
    /\bhere('?s| is) how\b/i,
    /\bstep\s*1\b/i,
    /\bfirst[, ]/i,
    /\bnext[, ]/i,
    /\bfinally[, ]/i,
    /\bshot list\b/i,
    /\bcamera\b/i,
    /\bvisuals?\b/i,
  ]

  return bannedPatterns.some((pattern) => pattern.test(text))
}

function normalizeScriptCta(text: string): string {
  const escapedCta = SCRIPT_CTA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ctaPattern = new RegExp(`(?:\\s*[.!?]?\\s*${escapedCta}\\.?)+\\s*$`, 'i')
  const withoutTrailingCtas = text.trim().replace(ctaPattern, '').trim().replace(/[.\s]*$/, '')
  return `${withoutTrailingCtas}. ${SCRIPT_CTA}`.trim()
}

function buildFallbackScript(title: string): string {
  return `Tired of guessing what your soil needs? ${title} helps feed the soil so your plants, lawn, or garden can perform better from the roots up. Use it as part of your regular care routine for stronger growth, better vigor, and healthier-looking results. Give your soil the support it has been missing. ${SCRIPT_CTA}`
}

export async function generateScript(product: Product, opts?: {
  model?: string
  systemPrompt?: string
  userTemplate?: string
}): Promise<string> {
  const startTime = Date.now()
  
  try {
    const config = getConfig()
    const apiKey = config.OPENAI_API_KEY
    if (!apiKey) {
      throw new AppError(
        'OPENAI_API_KEY not configured',
        ErrorCode.MISSING_CONFIG,
        500
      )
    }

    const model = opts?.model || config.OPENAI_MODEL || 'gpt-4o'

    const systemPrompt =
      opts?.systemPrompt ||
      config.OPENAI_SYSTEM_PROMPT ||
      `You are a direct-response product video copywriter for Nature's Way Soil.

Write ONLY the spoken voiceover for a short vertical product ad.

Conversion structure:
1. First sentence must be a scroll-stopping hook under 9 words.
2. Name the pain/problem fast.
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
- Avoid exaggerated claims such as instant results, guaranteed results, cure, kill, pesticide, or disease claims.
- Do not mention Amazon reviews, discounts, or medical/pesticide claims.

Do NOT describe the video.
Do NOT describe scenes.
Do NOT explain what the video will show.
Do NOT write shot lists, stage directions, labels, or production notes.
Do NOT use phrases like "this video shows", "in this video", "we see", "on screen", "the scene", "first", "next", or "finally".

Return plain text only.`

    const userTemplate =
      opts?.userTemplate ||
      config.OPENAI_USER_TEMPLATE ||
      `Write the spoken voiceover for a conversion-focused vertical product ad about {title}.

Product details:
{details}

Audience:
Home gardeners, lawn owners, landscapers, small farms, and people who want natural soil-focused products.

The voiceover must follow this exact sales flow without numbering it:
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

End with exactly: "${SCRIPT_CTA}".`

    const title = String(product.title || product.name || product.id || '').trim()
    const details = String(product.details || product.description || product.Description || product.caption || '').trim()
    
    if (!title) {
      throw new AppError(
        'Product must have a title, name, or id',
        ErrorCode.VALIDATION_ERROR,
        400
      )
    }

    const filled = userTemplate
      .replaceAll('{title}', title)
      .replaceAll('{details}', details)

    logger.info('Generating script with OpenAI', 'OpenAI', {
      model,
      productTitle: title,
    })

    const text = await rateLimiters.execute('openai', async () => {
      return withRetry(
        async () => {
          const res = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: filled },
              ],
              temperature: 0.62,
              max_tokens: 260,
            },
            {
              headers: { Authorization: `Bearer ${apiKey}` },
              timeout: config.TIMEOUT_OPENAI,
            }
          )

          const content = res.data?.choices?.[0]?.message?.content?.trim()

          if (!content) {
            throw new AppError(
              'OpenAI returned no content',
              ErrorCode.OPENAI_API_ERROR,
              500
            )
          }

          if (looksLikeMetaNarration(content)) {
            throw new AppError(
              'OpenAI returned meta/instructional narration instead of spoken ad copy',
              ErrorCode.OPENAI_API_ERROR,
              500,
              true,
              { preview: content.substring(0, 200) }
            )
          }

          return normalizeScriptCta(content)
        },
        {
          maxRetries: 3,
          onRetry: (error, attempt) => {
            logger.warn('Retrying OpenAI request', 'OpenAI', {
              attempt,
              error: error instanceof Error ? error.message : String(error),
            })
          },
        }
      )
    })

    const duration = Date.now() - startTime
    metrics.incrementCounter('openai.success')
    metrics.recordHistogram('openai.duration', duration)

    logger.info('Successfully generated script', 'OpenAI', {
      duration,
      scriptLength: text.length,
    })

    return text
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('openai.error')
    metrics.recordHistogram('openai.error_duration', duration)

    logger.error('Failed to generate script', 'OpenAI', { duration }, error)

    if (String(process.env.OPENAI_ALLOW_FALLBACK_SCRIPT || 'true').toLowerCase() === 'true') {
      const title = String(product.title || product.name || product.id || 'Nature\'s Way Soil').trim()
      logger.warn('Using fallback conversion script', 'OpenAI', { productTitle: title })
      return buildFallbackScript(title)
    }

    if (error instanceof AppError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      throw fromAxiosError(error, ErrorCode.OPENAI_API_ERROR, {
        productTitle: product.title || product.name,
      })
    }

    throw new AppError(
      `OpenAI script generation failed: ${error.message || String(error)}`,
      ErrorCode.OPENAI_API_ERROR,
      500,
      true,
      { productTitle: product.title || product.name },
      error instanceof Error ? error : undefined
    )
  }
}

export interface BlogArticleData {
  productTitle: string
  productDescription?: string
  videoUrl: string
  productUrl?: string
}

export interface GeneratedBlogArticle {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  category: string
  featuredImage: string
  tags: string[]
  metaDescription: string
}

export async function generateBlogArticle(
  articleData: BlogArticleData,
  opts?: {
    model?: string
    maxTokens?: number
  }
): Promise<GeneratedBlogArticle> {
  const startTime = Date.now()
  
  try {
    const config = getConfig()
    const apiKey = config.OPENAI_API_KEY
    if (!apiKey) {
      throw new AppError(
        'OPENAI_API_KEY not configured',
        ErrorCode.MISSING_CONFIG,
        500
      )
    }

    if (!articleData.productTitle || !articleData.videoUrl) {
      throw new AppError(
        'Product title and video URL are required',
        ErrorCode.VALIDATION_ERROR,
        400
      )
    }

    const model = opts?.model || process.env.OPENAI_MODEL || 'gpt-4o'
    const maxTokens = opts?.maxTokens || 4000

    const systemPrompt = `You are an expert content writer for Nature's Way Soil, a company specializing in organic soil amendments and fertilizers. Write informative, engaging blog articles that educate readers about natural gardening while highlighting product benefits. Use a friendly, authoritative tone with practical tips and scientific backing.`

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
}`

    logger.info('Generating blog article with OpenAI', 'OpenAI', {
      model,
      productTitle: articleData.productTitle,
    })

    const parsed = await rateLimiters.execute('openai', async () => {
      return withRetry(
        async () => {
          const res = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.7,
              max_tokens: maxTokens,
            },
            {
              headers: { Authorization: `Bearer ${apiKey}` },
              timeout: config.TIMEOUT_OPENAI * 2,
            }
          )

          const text = res.data?.choices?.[0]?.message?.content?.trim()
          if (!text) {
            throw new AppError(
              'OpenAI returned no content',
              ErrorCode.OPENAI_API_ERROR,
              500
            )
          }

          try {
            return JSON.parse(text)
          } catch (parseError) {
            throw new AppError(
              'Failed to parse OpenAI response as JSON',
              ErrorCode.OPENAI_API_ERROR,
              500,
              true,
              { response: text.substring(0, 200) }
            )
          }
        },
        {
          maxRetries: 3,
          onRetry: (error, attempt) => {
            logger.warn('Retrying OpenAI blog generation', 'OpenAI', {
              attempt,
              error: error instanceof Error ? error.message : String(error),
            })
          },
        }
      )
    })

    const timestamp = Date.now()
    const id = `article_${timestamp}`
    const slug = articleData.productTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const result: GeneratedBlogArticle = {
      id,
      slug,
      title: parsed.title,
      excerpt: parsed.excerpt,
      content: parsed.content,
      category: parsed.category || 'Product Spotlight',
      featuredImage: articleData.videoUrl.replace('.mp4', '-thumbnail.jpg'),
      tags: parsed.tags || [],
      metaDescription: parsed.metaDescription || parsed.excerpt,
    }

    const duration = Date.now() - startTime
    metrics.incrementCounter('openai.blog_article.success')
    metrics.recordHistogram('openai.blog_article.duration', duration)

    logger.info('Successfully generated blog article', 'OpenAI', {
      duration,
      articleLength: result.content.length,
    })

    return result
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('openai.blog_article.error')
    metrics.recordHistogram('openai.blog_article.error_duration', duration)

    logger.error('Failed to generate blog article', 'OpenAI', { duration }, error)

    if (error instanceof AppError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      throw fromAxiosError(error, ErrorCode.OPENAI_API_ERROR, {
        productTitle: articleData.productTitle,
      })
    }

    throw new AppError(
      `OpenAI blog generation failed: ${error.message || String(error)}`,
      ErrorCode.OPENAI_API_ERROR,
      500,
      true,
      { productTitle: articleData.productTitle },
      error instanceof Error ? error : undefined
    )
  }
}
