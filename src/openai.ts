import axios from 'axios'
import { Product } from './core'

export async function generateScript(product: Product, opts?: {
  model?: string
  systemPrompt?: string
  userTemplate?: string
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')
  const model = opts?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const systemPrompt = opts?.systemPrompt || process.env.OPENAI_SYSTEM_PROMPT || "You are a concise 'how-to' script writer for ~30 second social videos about gardening products by Nature's Way Soil. Use clear steps and keep it friendly and practical."
  const userTemplate = opts?.userTemplate || process.env.OPENAI_USER_TEMPLATE || "Write a how-to style voiceover script about {title}. Length: about 30 seconds. Give 3-5 quick, actionable steps the viewer can follow. Keep it approachable and helpful. End with exactly: 'Visit natureswaysoil.com for more info'. Product details to incorporate where helpful: {details}."

  const title = String(product.title || product.name || product.id || '').trim()
  const details = String(product.details || '').trim()
  const filled = userTemplate
    .replaceAll('{title}', title)
    .replaceAll('{details}', details)

  const res = await axios.post('https://api.openai.com/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: filled },
      ],
      temperature: 0.7,
      max_tokens: 300,
    },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  )
  const text = res.data?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('OpenAI returned no content')
  return text
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

/**
 * Generate a comprehensive blog article about a product using OpenAI
 */
export async function generateBlogArticle(
  articleData: BlogArticleData,
  opts?: {
    model?: string
    maxTokens?: number
  }
): Promise<GeneratedBlogArticle> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')
  
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

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: maxTokens
    },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  )
  
  const text = res.data?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('OpenAI returned no content')
  
  const parsed = JSON.parse(text)
  
  // Generate ID and slug
  const timestamp = Date.now()
  const id = `article_${timestamp}`
  const slug = articleData.productTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  
  return {
    id,
    slug,
    title: parsed.title,
    excerpt: parsed.excerpt,
    content: parsed.content,
    category: parsed.category || 'Product Spotlight',
    featuredImage: articleData.videoUrl.replace('.mp4', '-thumbnail.jpg'),
    tags: parsed.tags || [],
    metaDescription: parsed.metaDescription || parsed.excerpt
  }
}
