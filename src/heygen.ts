// src/heygen.ts
// Compatibility module for the blog generator.
// The old blog code imports './heygen'. This restores that import and turns it
// into an OpenAI-powered blog package generator instead of a dead HeyGen call.

import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'

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

function productName(input: BlogVideoInput): string {
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

function ctaUrl(input: BlogVideoInput): string {
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

function buildFallbackBroll(input: BlogVideoInput): string[] {
  const name = productName(input)
  const category = input.category || input.product?.category || input.product?.Category || ''
  const keywords = asList(input.keywords || input.product?.keywords || input.product?.Keywords)
  const benefits = asList(input.benefits || input.product?.benefits || input.product?.Benefits)
  const text = `${name} ${category} ${keywords.join(' ')} ${benefits.join(' ')}`.toLowerCase()

  if (/dog|urine|pet|odor|yellow spot/.test(text)) {
    return ['dog on green lawn', 'yellow lawn spots grass', 'homeowner spraying lawn', 'healthy green turf close up', 'garden hose sprayer lawn']
  }

  if (/pasture|hay|field|farm|acre|horse|cattle/.test(text)) {
    return ['farmer pasture field', 'hay field grass', 'tractor spraying pasture', 'healthy pasture close up', 'farm soil grass roots']
  }

  if (/tomato|vegetable|pepper|fruit|berry|flower|bloom/.test(text)) {
    return ['vegetable garden tomatoes', 'gardener watering tomato plants', 'raised bed garden soil', 'healthy vegetable plants close up', 'garden harvest vegetables']
  }

  if (/orchid|house plant|indoor/.test(text)) {
    return ['gardener caring for potted plants', 'orchid plant close up', 'potting soil indoor plants', 'houseplant watering', 'healthy roots potting mix']
  }

  if (/biochar|charcoal|compost|worm|casting|soil|humic|fulvic|kelp/.test(text)) {
    return ['hands holding rich soil', 'garden compost soil close up', 'biochar soil amendment', 'raised bed garden soil', 'healthy garden plants']
  }

  return ['organic garden soil', 'gardener spraying plants', 'healthy garden plants', 'soil close up roots', 'farm garden rows']
}

function fallbackBlog(input: BlogVideoInput): BlogVideoResult {
  const name = productName(input)
  const url = ctaUrl(input)
  const keywords = asList(input.keywords || input.product?.keywords || input.product?.Keywords)
  const benefits = asList(input.benefits || input.product?.benefits || input.product?.Benefits)
  const slug = slugify(name)
  const brollQueries = input.brollQueries?.length ? input.brollQueries : buildFallbackBroll(input)

  const blogTitle = `How ${name} Supports Healthier Soil and Stronger Plants`
  const metaDescription = `${name} from Nature’s Way Soil helps support practical lawn, garden, and soil care. Learn how to use it and when it fits your routine.`.slice(0, 155)

  const script = [
    `Hook: If your lawn, garden, or soil is not responding the way it should, the problem may start below the surface.`,
    `Problem: Weak roots, tired soil, poor drainage, and low soil activity can hold plants back.`,
    `Solution: ${name} is designed as a practical soil-first product for regular lawn, garden, farm, or plant-care use.`,
    benefits.length ? `Key benefits: ${benefits.slice(0, 4).join(', ')}.` : '',
    `CTA: Learn more at ${url}.`
  ].filter(Boolean).join(' ')

  const markdown = `---
title: "${blogTitle.replace(/"/g, '\\"')}"
description: "${metaDescription.replace(/"/g, '\\"')}"
slug: "${slug}"
---

# ${blogTitle}

If your lawn, garden, pasture, or potted plants are not responding the way they should, the problem often starts in the soil. Soil structure, root-zone activity, moisture movement, and nutrient availability all affect how well plants can grow.

## The problem this product helps address

${name} is a Nature’s Way Soil product built for practical soil and plant care. It fits homeowners, gardeners, landowners, and growers who want a simple way to support healthier soil routines.

${keywords.length ? `Common related topics include: ${keywords.slice(0, 10).join(', ')}.` : ''}

## How ${name} fits into a soil-care routine

Use ${name} as part of a regular lawn, garden, pasture, or plant-care program according to the label directions. It is meant to support the soil environment around the root zone rather than act like a quick cosmetic cover-up.

${benefits.length ? `Key benefits listed for this product include ${benefits.slice(0, 5).join(', ')}.` : ''}

## Best visual scenes for a short video

${brollQueries.map((query) => `- ${query}`).join('\n')}

## Learn more

See product details and application guidance here:

[Visit Nature’s Way Soil](${url})
`

  return {
    videoUrl: '',
    videoId: '',
    status: 'blog_ready_video_not_generated_here',
    provider: 'openai-blog-compatibility',
    skipped: true,
    message: 'Blog package generated. Video posting is handled by the scheduled social video pipeline.',
    script,
    blogTitle,
    metaDescription,
    slug,
    markdown,
    brollQueries,
    ctaUrl: url
  }
}

async function generateOpenAIBlog(input: BlogVideoInput): Promise<BlogVideoResult> {
  if (!process.env.OPENAI_API_KEY) return fallbackBlog(input)

  const name = productName(input)
  const url = ctaUrl(input)
  const keywords = asList(input.keywords || input.product?.keywords || input.product?.Keywords)
  const benefits = asList(input.benefits || input.product?.benefits || input.product?.Benefits)
  const brollQueries = input.brollQueries?.length ? input.brollQueries : buildFallbackBroll(input)

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const prompt = `Create a traffic-driving blog package for Nature's Way Soil.

Product: ${name}
Category: ${input.category || input.product?.category || input.product?.Category || ''}
Keywords: ${keywords.join(', ')}
Benefits: ${benefits.join(', ')}
Target audience: ${input.targetAudience || input.product?.targetAudience || input.product?.Target_Audience || 'homeowners, gardeners, lawn care customers, farmers, and homesteaders'}
CTA URL: ${url}
B-roll ideas: ${brollQueries.join(', ')}

Return JSON only with:
{
  "blogTitle": "...",
  "metaDescription": "...",
  "slug": "...",
  "script": "25-35 second video script with hook, problem, solution, CTA",
  "markdown": "complete SEO blog post in Markdown with H1, H2 sections, internal CTA link, and practical product use guidance"
}

Rules:
- Plainspoken and helpful.
- No guaranteed results.
- No pesticide, disease, or cure claims.
- Keep it farm, lawn, garden, pasture, soil, compost, roots, watering, or sprayer related.
- CTA should point to the product landing page if available, otherwise natureswaysoil.com.`

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens: 1400
    })

    const text = response.choices[0]?.message?.content?.trim() || ''
    const match = text.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    const fallback = fallbackBlog(input)

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
    const fallback = fallbackBlog(input)
    return {
      ...fallback,
      message: `OpenAI blog generation failed, fallback blog returned: ${error?.message || error}`
    }
  }
}

// Old names that blog-generator.ts may import.
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
  fs.writeFileSync(file, result.markdown || '', 'utf8')
  return file
}

export default {
  generateHeyGenVideo,
  createHeyGenVideo,
  createVideo,
  generateBlogVideo,
  generateBlogPackage,
  saveBlogMarkdown
}
