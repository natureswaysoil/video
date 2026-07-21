// src/heygen.ts
// Compatibility module for legacy blog-generator imports.
// Actual social video rendering is handled by the scheduled posting pipeline.

import OpenAI from 'openai'

const fs: any = require('fs')
const path: any = require('path')

export type BlogVideoInput = {
  title?: string
  productName?: string
  productTitle?: string
  product?: any
  keywords?: string[] | string
  benefits?: string[] | string
  targetAudience?: string
  category?: string
  landingPageUrl?: string
  websiteUrl?: string
  script?: string
  voiceover?: string
  brollQueries?: string[]
  [key: string]: any
}

export type BlogVideoResult = {
  videoUrl: string
  videoId: string
  status: string
  provider: string
  skipped?: boolean
  message?: string
  script?: string
  blogTitle?: string
  metaDescription?: string
  slug?: string
  markdown?: string
  brollQueries?: string[]
  ctaUrl?: string
}

function asList(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean)
  return String(value || '')
    .split(/[,\n;|]+/g)
    .map((v) => v.trim())
    .filter(Boolean)
}

function slugify(value: string): string {
  return String(value || 'nature-way-soil-blog')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'nature-way-soil-blog'
}

function getProductName(input: BlogVideoInput): string {
  return (
    input.productName ||
    input.productTitle ||
    input.title ||
    input.product?.name ||
    input.product?.title ||
    input.product?.Title ||
    'Nature’s Way Soil product'
  )
}

function getCtaUrl(input: BlogVideoInput): string {
  const url =
    input.landingPageUrl ||
    input.websiteUrl ||
    input.product?.landingPageUrl ||
    input.product?.websiteUrl ||
    input.product?.Landing_Page_URL ||
    input.product?.Website_URL ||
    ''

  if (/^https?:\/\//i.test(String(url))) return String(url)
  if (String(url).startsWith('/')) return `https://www.natureswaysoil.com${url}`
  return 'https://www.natureswaysoil.com/'
}

function fallbackBlog(input: BlogVideoInput): BlogVideoResult {
  const name = getProductName(input)
  const url = getCtaUrl(input)
  const benefits = asList(input.benefits || input.product?.benefits || input.product?.Benefits)
  const slug = slugify(name)
  const blogTitle = `How ${name} Supports Healthier Soil and Stronger Plants`
  const metaDescription = `${name} from Nature’s Way Soil supports practical lawn, garden, and soil care. Learn how it fits your routine.`.slice(0, 155)
  const script = [
    `If your lawn, garden, or soil is struggling, the problem may start below the surface.`,
    `${name} is designed for practical soil-first care.`,
    benefits.length ? `Key benefits include ${benefits.slice(0, 3).join(', ')}.` : '',
    `Use according to label directions. Learn more at ${url}.`
  ].filter(Boolean).join(' ')
  const markdown = `# ${blogTitle}\n\n${name} is a Nature’s Way Soil product made for practical soil and plant care.\n\n## Learn more\n\n[Visit Nature’s Way Soil](${url})\n`

  return {
    videoUrl: '',
    videoId: '',
    status: 'blog_ready_video_not_generated_here',
    provider: 'openai-blog-compatibility',
    skipped: true,
    message: 'Blog package generated. Video rendering is handled by the scheduled social video pipeline.',
    script,
    blogTitle,
    metaDescription,
    slug,
    markdown,
    brollQueries: input.brollQueries || [],
    ctaUrl: url
  }
}

async function generateOpenAIBlog(input: BlogVideoInput): Promise<BlogVideoResult> {
  const fallback = fallbackBlog(input)
  if (!process.env.OPENAI_API_KEY) return fallback

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Create a plainspoken Nature's Way Soil blog package for ${getProductName(input)}. Return JSON with blogTitle, metaDescription, slug, script, and markdown. Do not include production directions in the script. CTA: ${getCtaUrl(input)}`
      }],
      temperature: 0.25,
      max_tokens: 1400
    })

    const text = response.choices[0]?.message?.content?.trim() || ''
    const match = text.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    return {
      ...fallback,
      blogTitle: parsed?.blogTitle || fallback.blogTitle,
      metaDescription: parsed?.metaDescription || fallback.metaDescription,
      slug: parsed?.slug || fallback.slug,
      script: parsed?.script || fallback.script,
      markdown: parsed?.markdown || fallback.markdown,
      status: 'blog_ready',
      skipped: false
    }
  } catch (error: any) {
    return { ...fallback, message: `OpenAI blog generation failed; fallback returned: ${error?.message || error}` }
  }
}

// Legacy client expected by blog-generator.ts. It deliberately skips the retired
// HeyGen rendering path instead of attempting to call an incompatible API.
export async function createClientWithSecrets() {
  return {
    async createVideoJob(_input: any): Promise<string> {
      return 'video-generation-skipped'
    },
    async pollJobForVideoUrl(_jobId: string, _options?: any): Promise<string | null> {
      return null
    }
  }
}

export async function generateHeyGenVideo(input: BlogVideoInput): Promise<BlogVideoResult> {
  return generateOpenAIBlog(input)
}

export async function createHeyGenVideo(input: BlogVideoInput): Promise<BlogVideoResult> {
  return generateOpenAIBlog(input)
}

export async function createVideo(input: BlogVideoInput): Promise<BlogVideoResult> {
  return generateOpenAIBlog(input)
}

export async function generateBlogVideo(input: BlogVideoInput): Promise<BlogVideoResult> {
  return generateOpenAIBlog(input)
}

export async function generateBlogPackage(input: BlogVideoInput): Promise<BlogVideoResult> {
  return generateOpenAIBlog(input)
}

export function saveBlogMarkdown(result: BlogVideoResult, outputDir = 'content/blog') {
  const slug = result.slug || slugify(result.blogTitle || 'nature-way-soil-blog')
  const dir = path.resolve(process.cwd(), outputDir)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.resolve(dir, `${slug}.md`)
  fs.writeFileSync(file, result.markdown || '')
  return file
}

export default {
  createClientWithSecrets,
  generateHeyGenVideo,
  createHeyGenVideo,
  createVideo,
  generateBlogVideo,
  generateBlogPackage,
  saveBlogMarkdown
}
