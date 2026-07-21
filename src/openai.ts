import axios from 'axios'
import { Product } from './core'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getRateLimiters } from './rate-limiter'
import { getConfig } from './config-validator'
import { buildProductTemplateContext } from './product-templates'
import { assertMarketingClaimsSafe } from './claim-safety'

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
    /\bstep\s*1\b/i,
    /\bfirst[, ]/i,
    /\bnext[, ]/i,
    /\bfinally[, ]/i,
    /\bshot list\b/i,
    /\bcamera\b/i,
    /\bvisuals?\b/i,
    /\b(?:the\s+)?(?:speaker|narrator|voiceover|host|presenter)\s+(?:should|will|can|needs?\s+to)\s+(?:say|mention|explain|describe|talk)/i,
    /\bwhat\s+(?:the\s+)?(?:speaker|narrator|voiceover|host|presenter)\s+(?:should|will|can)\s+say\b/i,
    /\b(?:say|mention|explain|describe|talk about)\s+(?:this|that|the following)\s+in\s+the\s+video\b/i,
    /\b(?:voiceover|narration|spoken script)\s*:/i,
    /\b(?:instruction|direction|production note|stage direction)s?\b/i,
    /\bshow\s+(?:the\s+)?(?:product|bottle|package|label|scene|clip)\b/i,
    /\bcut\s+to\b/i,
    /\btransition\s+to\b/i,
    /\buse\s+(?:a|an|the)\s+(?:shot|clip|image|visual|scene)\b/i,
  ]

  return bannedPatterns.some((pattern) => pattern.test(text))
}

function normalizeScriptCta(text: string): string {
  const withoutTrailingCtas = text
    .trim()
    .replace(/Visit natureswaysoil\.com for more info\.?\s*$/i, '')
    .trim()
    .replace(/[.\s]*$/, '')
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
    if (!apiKey) throw new AppError('OPENAI_API_KEY not configured', ErrorCode.MISSING_CONFIG, 500)

    const model = opts?.model || config.OPENAI_MODEL || 'gpt-4o'

    const systemPrompt =
      opts?.systemPrompt ||
      config.OPENAI_SYSTEM_PROMPT ||
      `You are a direct-response product video copywriter for Nature's Way Soil.

Write ONLY the exact words a customer should hear in the finished advertisement.
Never write instructions for a speaker, narrator, editor, camera operator, or video creator.
Never preface the copy with labels such as "Voiceover," "Narration," "Script," or "The speaker should say."

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

Do NOT describe the video, scenes, camera, captions, visuals, editing, or what anyone should say.
Return the finished spoken advertisement as plain text only.`

    const userTemplate =
      opts?.userTemplate ||
      config.OPENAI_USER_TEMPLATE ||
      `Create the finished spoken advertisement for {title}.

Product-specific template:
{templateContext}

Product details:
{details}

Audience:
Home gardeners, lawn owners, landscapers, small farms, and people who want soil-focused products.

The advertisement must follow this sales flow without numbering it:
- 0-3 seconds: strong hook about the customer's problem or desired result
- 3-8 seconds: name the problem clearly
- 8-18 seconds: introduce the product and what it helps do
- 18-25 seconds: reinforce the main benefit and ease of use
- 25-30 seconds: confident call to action

Important:
- output only the exact customer-facing words to be spoken
- do not refer to a speaker, narrator, voiceover, script, scene, video, shot, clip, or visual
- do not include directions, labels, headings, brackets, or production notes
- do not turn this into a how-to lesson
- do not give numbered steps
- do not overpromise

End with exactly: "${SCRIPT_CTA}".`

    const title = String(product.title || product.name || product.id || '').trim()
    const details = String(product.details || product.description || product.Description || product.caption || '').trim()

    if (!title) throw new AppError('Product must have a title, name, or id', ErrorCode.VALIDATION_ERROR, 400)

    const filled = userTemplate
      .replaceAll('{title}', title)
      .replaceAll('{details}', details)
      .replaceAll('{templateContext}', buildProductTemplateContext(product))

    logger.info('Generating script with OpenAI', 'OpenAI', { model, productTitle: title })

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
            { headers: { Authorization: `Bearer ${apiKey}` }, timeout: config.TIMEOUT_OPENAI }
          )

          const content = res.data?.choices?.[0]?.message?.content?.trim()
          if (!content) throw new AppError('OpenAI returned no content', ErrorCode.OPENAI_API_ERROR, 500)
          if (looksLikeMetaNarration(content)) {
            throw new AppError('OpenAI returned production notes instead of spoken ad copy', ErrorCode.OPENAI_API_ERROR, 500, true, { preview: content.substring(0, 200) })
          }

          const normalized = normalizeScriptCta(content)
          if (looksLikeMetaNarration(normalized)) {
            throw new AppError('Normalized script still contains production notes', ErrorCode.OPENAI_API_ERROR, 500, true, { preview: normalized.substring(0, 200) })
          }
          assertMarketingClaimsSafe(normalized, { productTitle: title, source: 'openai-script' })
          return normalized
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
    logger.info('Successfully generated script', 'OpenAI', { duration, scriptLength: text.length })
    return text
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('openai.error')
    metrics.recordHistogram('openai.error_duration', duration)
    logger.error('Failed to generate script', 'OpenAI', { duration }, error)

    if (String(process.env.OPENAI_ALLOW_FALLBACK_SCRIPT || 'true').toLowerCase() === 'true') {
      const title = String(product.title || product.name || product.id || 'Nature\'s Way Soil').trim()
      const fallback = buildFallbackScript(title)
      assertMarketingClaimsSafe(fallback, { productTitle: title, source: 'fallback-script' })
      logger.warn('Using fallback conversion script', 'OpenAI', { productTitle: title })
      return fallback
    }

    if (error instanceof AppError) throw error
    if (axios.isAxiosError(error)) throw fromAxiosError(error, ErrorCode.OPENAI_API_ERROR, { productTitle: product.title || product.name })

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
