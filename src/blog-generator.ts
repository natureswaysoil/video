/**
 * Automated Blog Article & Video Generator
 * Generates buyer-intent Nature's Way Soil blog posts and posts them for traffic.
 */

import 'dotenv/config'
import axios from 'axios'
import { createClientWithSecrets } from './heygen'
import { postToYouTube } from './youtube'
import { postToInstagram } from './instagram'
import { postToTwitter } from './twitter'
import { postToPinterest } from './pinterest'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface BlogPost {
  title: string
  slug: string
  excerpt: string
  content: string
  category: string
  tags: string[]
  videoPrompt: string
  seoKeywords: string[]
  publishDate: string
}

type ProductTopic = {
  targetKeyword: string
  buyerProblem: string
  product: string
  internalLink: string
  category: string
  tags: string[]
  audience: string
  visualPrompt: string
}

const PRODUCT_TOPICS: ProductTopic[] = [
  {
    targetKeyword: 'dog urine spots on lawn',
    buyerProblem: 'homeowners with yellow dog urine spots, lawn odor, and repeat pet areas',
    product: "Dog Urine Neutralizer & Lawn Repair",
    internalLink: 'https://natureswaysoil.com/pet-lawn-spot-odor-control',
    category: 'Lawn Care',
    tags: ['dog urine spots', 'pet lawn care', 'lawn repair', 'odor control'],
    audience: 'dog owners, lawn care customers, pet facilities, and property managers',
    visualPrompt: 'Dog on green lawn, close-up of yellow lawn spots, homeowner applying lawn-safe spray, grass recovery visuals'
  },
  {
    targetKeyword: 'compacted clay soil lawn treatment',
    buyerProblem: 'lawns and gardens where water runs off, roots stay shallow, or clay soil gets hard after heat',
    product: 'Liquid Lawn Soil Conditioner with humic acid and kelp',
    internalLink: 'https://natureswaysoil.com/compacted-clay-soil',
    category: 'Soil Health',
    tags: ['compacted soil', 'clay soil', 'liquid aeration', 'soil conditioner'],
    audience: 'homeowners, landscapers, gardeners, and lawn care crews',
    visualPrompt: 'Hard clay soil, water runoff, soil close-ups, lawn sprayer application, deeper grass roots'
  },
  {
    targetKeyword: 'liquid biochar for soil',
    buyerProblem: 'tired garden soil, drought-stressed lawns, weak pasture soil, and poor water retention',
    product: 'Liquid Biochar Soil Restoration products',
    internalLink: 'https://natureswaysoil.com/liquid-biochar-soil-restoration',
    category: 'Soil Health',
    tags: ['liquid biochar', 'soil restoration', 'water retention', 'soil carbon'],
    audience: 'gardeners, landowners, pasture owners, food plot managers, and soil-health buyers',
    visualPrompt: 'Liquid biochar mixing, dark rich soil, roots in soil, pasture and garden recovery scenes'
  },
  {
    targetKeyword: 'humic acid fulvic acid kelp lawn',
    buyerProblem: 'customers who want greener growth, better nutrient uptake, and root-zone support without a harsh program',
    product: 'Liquid Humic & Fulvic Acid with Kelp',
    internalLink: 'https://natureswaysoil.com/shop',
    category: 'Product Guide',
    tags: ['humic acid', 'fulvic acid', 'kelp', 'root growth'],
    audience: 'homeowners, gardeners, greenhouse growers, and turf managers',
    visualPrompt: 'Humic liquid being measured, kelp seaweed visuals, roots absorbing nutrients, green lawn close-up'
  },
  {
    targetKeyword: 'pasture recovery fertilizer for horses',
    buyerProblem: 'thin hay fields, horse pastures, food plots, and large lawns stressed by heat, drought, and low soil activity',
    product: "Hay, Pasture & Lawn Recovery System with Liquid Biochar",
    internalLink: 'https://natureswaysoil.com/pasture-lawn-recovery',
    category: 'Farming',
    tags: ['pasture recovery', 'hay field fertilizer', 'horse pasture', 'liquid biochar'],
    audience: 'horse owners, small farms, landowners, food plot managers, and grounds crews',
    visualPrompt: 'Horse pasture, hay field, broadcast spraying, drought stressed grass, greener recovery strips'
  },
  {
    targetKeyword: 'living soil amendment for raised beds',
    buyerProblem: 'raised beds, containers, and garden rows with tired soil, low organic matter, or weak root growth',
    product: "Living Soil Revitalizer with worm castings and activated biochar",
    internalLink: 'https://natureswaysoil.com/shop',
    category: 'Organic Gardening',
    tags: ['living soil', 'worm castings', 'activated biochar', 'raised beds'],
    audience: 'vegetable gardeners, homesteaders, container growers, and organic gardening customers',
    visualPrompt: 'Raised bed soil, worm castings, biochar pieces, gardener topdressing vegetables, healthy roots'
  },
  {
    targetKeyword: 'grounds maintenance soil products for government facilities',
    buyerProblem: 'parks, cemeteries, military housing, municipal grounds, and facility turf that need practical soil-support products',
    product: 'Nature’s Way Soil grounds maintenance product line',
    internalLink: 'https://natureswaysoil.com/government',
    category: 'Government Grounds',
    tags: ['government grounds', 'facility turf', 'parks maintenance', 'soil restoration'],
    audience: 'government buyers, prime contractors, facility managers, and public works teams',
    visualPrompt: 'Public park turf, municipal grounds crew, sprayer on facility lawn, healthy maintained grounds'
  }
]

function slugify(value: string): string {
  return String(value || 'nature-way-soil-blog')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 75) || 'nature-way-soil-blog'
}

function todayTopic(): ProductTopic {
  const index = Math.floor(Math.random() * PRODUCT_TOPICS.length)
  return PRODUCT_TOPICS[index]
}

function extractJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('OpenAI did not return JSON')
  return JSON.parse(match[0])
}

function fallbackArticle(topic: ProductTopic): BlogPost {
  const title = `How to Fix ${topic.targetKeyword.replace(/\b\w/g, c => c.toUpperCase())}`
  const content = `# ${title}

## Quick answer

The best way to handle ${topic.targetKeyword} is to treat the soil problem, not just the surface symptom. Start with water movement, root-zone health, organic matter, and consistent application. For this buyer problem, Nature's Way Soil recommends ${topic.product}.

## Why this problem happens

${topic.buyerProblem} often shows up when the soil is stressed, compacted, low in biology, short on organic matter, or unable to move water and nutrients into the root zone. A quick green-up can help for a few days, but long-term improvement usually comes from supporting the soil system.

## What to do first

1. Identify whether the problem is fresh, repeated, or seasonal.
2. Water the area so product and nutrients can move into the root zone.
3. Apply according to the product label during cooler morning or evening conditions.
4. Repeat as directed and watch for better water movement, rooting, and recovery.

## Recommended Nature's Way Soil Product

For this issue, look at ${topic.product}. It is built for ${topic.audience} who want a practical soil-first solution.

[View the recommended Nature's Way Soil solution](${topic.internalLink})

## Final tip

Use the product as part of a routine instead of a one-time rescue. Soil responds best when moisture, organic matter, nutrients, and biology are supported together.

Shop or request a quote at natureswaysoil.com.`

  return {
    title,
    slug: slugify(title),
    excerpt: `A practical soil-first guide for ${topic.targetKeyword}, with steps, product guidance, and a direct Nature's Way Soil solution.`,
    content,
    category: topic.category,
    tags: topic.tags,
    videoPrompt: topic.visualPrompt,
    seoKeywords: [topic.targetKeyword, topic.product, ...topic.tags],
    publishDate: new Date().toISOString(),
  }
}

/**
 * Generate a comprehensive blog article with OpenAI.
 */
export async function generateBlogArticle(): Promise<BlogPost> {
  const topic = todayTopic()
  console.log(`\n🎯 Generating buyer-intent blog article about: ${topic.targetKeyword}`)

  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY missing; using fallback article')
    return fallbackArticle(topic)
  }

  const prompt = `Write one buyer-intent SEO blog article for Nature's Way Soil.

Business: Nature's Way Soil, a small family farm in Snow Hill, NC.
Target keyword: ${topic.targetKeyword}
Buyer problem: ${topic.buyerProblem}
Recommended product/page: ${topic.product}
Required internal link: ${topic.internalLink}
Audience: ${topic.audience}

Hard rules:
- Mention ONLY real Nature's Way Soil products or pages named here: Dog Urine Neutralizer & Lawn Repair, Liquid Lawn Soil Conditioner, Liquid Biochar, Liquid Humic & Fulvic Acid with Kelp, Hay/Pasture/Lawn Recovery System, Living Soil Revitalizer, government grounds quote page, shop page.
- Do NOT invent products such as turning forks, compost bins, soil test kits, potting mixes, organic mulch, or tools.
- No guaranteed results, no pesticide claims, no disease/cure claims.
- Include a short answer in the first 120 words.
- Include practical steps the reader can use today.
- Include a section titled exactly: Recommended Nature's Way Soil Product
- Include this exact markdown link once: [View the recommended Nature's Way Soil solution](${topic.internalLink})
- End with a clear CTA to shop or request a quote at natureswaysoil.com.
- 900 to 1200 words. Use markdown headings.

Return JSON only:
{
  "title": "SEO title, 50-65 characters",
  "excerpt": "150-160 character summary",
  "content": "full markdown article",
  "category": "${topic.category}",
  "tags": ${JSON.stringify(topic.tags)},
  "seoKeywords": ["${topic.targetKeyword}", "${topic.product}"],
  "videoPrompt": "15-25 second visual prompt for a short social video"
}`

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_BLOG_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You write useful, specific, buyer-intent lawn, garden, pasture, and soil-health content for Nature\'s Way Soil. Return valid JSON only.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.35,
      max_tokens: 4200,
      response_format: { type: 'json_object' }
    })

    const raw = response.choices?.[0]?.message?.content || ''
    const blogData = extractJson(raw)
    const title = String(blogData.title || fallbackArticle(topic).title)
    const slug = slugify(title)

    const blogPost: BlogPost = {
      title,
      slug,
      excerpt: String(blogData.excerpt || '').slice(0, 180) || fallbackArticle(topic).excerpt,
      content: String(blogData.content || fallbackArticle(topic).content),
      category: String(blogData.category || topic.category),
      tags: Array.isArray(blogData.tags) ? blogData.tags.map(String) : topic.tags,
      videoPrompt: String(blogData.videoPrompt || topic.visualPrompt),
      seoKeywords: Array.isArray(blogData.seoKeywords) ? blogData.seoKeywords.map(String) : [topic.targetKeyword, topic.product, ...topic.tags],
      publishDate: new Date().toISOString(),
    }

    console.log('✅ Blog article generated successfully!')
    console.log(`   Title: ${blogPost.title}`)
    console.log(`   Word Count: ~${blogPost.content.split(/\s+/).length} words`)
    console.log(`   Tags: ${blogPost.tags.join(', ')}`)
    return blogPost
  } catch (error: any) {
    console.error('❌ Failed to generate blog article, using fallback:', error.message)
    return fallbackArticle(topic)
  }
}

/**
 * Generate video for the blog post using HeyGen.
 * No fake default avatar is used. Set HEYGEN_DEFAULT_AVATAR and HEYGEN_DEFAULT_VOICE to valid IDs from the HeyGen account.
 */
export async function generateBlogVideo(blogPost: BlogPost): Promise<string | null> {
  console.log(`\n🎬 Generating video for: ${blogPost.title}`)

  if (!process.env.HEYGEN_API_KEY && !process.env.GCP_SECRET_HEYGEN_API_KEY) {
    console.log('⚠️  HeyGen API key not configured, skipping video generation')
    return null
  }

  const avatar = process.env.HEYGEN_DEFAULT_AVATAR
  const voice = process.env.HEYGEN_DEFAULT_VOICE

  if (!avatar || !voice) {
    console.log('⚠️  Missing valid HEYGEN_DEFAULT_AVATAR or HEYGEN_DEFAULT_VOICE; skipping video so the run can still publish/link-post the blog')
    return null
  }

  try {
    const videoScript = `${blogPost.videoPrompt}. Use a warm helpful farming and garden tone. Show Nature's Way Soil style product and soil close-ups. End with: Read the full guide at natureswaysoil.com/blog/${blogPost.slug}.`
    const heygen = await createClientWithSecrets()
    const lengthSeconds = parseInt(process.env.HEYGEN_VIDEO_DURATION_SECONDS || '30')

    const jobId = await heygen.createVideoJob({
      script: videoScript,
      title: blogPost.title,
      lengthSeconds,
      avatar,
      voice,
      music: { style: 'nature', volume: 0.15 },
      subtitles: { enabled: true, style: 'modern' },
      webhook: process.env.HEYGEN_WEBHOOK_URL,
      meta: { blogSlug: blogPost.slug, category: blogPost.category }
    })

    console.log(`✅ HeyGen job created: ${jobId}`)
    const videoUrl = await heygen.pollJobForVideoUrl(jobId, {
      timeoutMs: 20 * 60_000,
      intervalMs: 10_000
    })

    if (videoUrl) {
      console.log(`✅ Video ready: ${videoUrl}`)
      return videoUrl
    }

    console.log('⚠️  Video generation timed out or failed')
    return null
  } catch (error: any) {
    const details = error?.response?.data || error?.message || String(error)
    console.error('❌ Video generation failed:', details)
    console.error('   Check HEYGEN_DEFAULT_AVATAR and HEYGEN_DEFAULT_VOICE; the old hard-coded garden_expert_01 value was removed.')
    return null
  }
}

/** Save blog post to Supabase or file system. */
export async function saveBlogPost(blogPost: BlogPost, videoUrl: string | null) {
  console.log(`\n💾 Saving blog post: ${blogPost.slug}`)

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const { data, error } = await supabase
      .from('blog_posts')
      .insert([
        {
          title: blogPost.title,
          slug: blogPost.slug,
          excerpt: blogPost.excerpt,
          content: blogPost.content,
          category: blogPost.category,
          tags: blogPost.tags,
          seo_keywords: blogPost.seoKeywords,
          video_url: videoUrl,
          published_at: blogPost.publishDate,
          status: 'published'
        }
      ])
      .select()

    if (error) throw error
    console.log('✅ Blog post saved to database')
    console.log(`   URL: https://natureswaysoil.com/blog/${blogPost.slug}`)
    return data
  } catch (error: any) {
    console.log('⚠️  Database save failed, saving to file instead:', error?.message || String(error))
    const fs = await import('fs')
    const path = await import('path')
    const blogDir = path.join(process.cwd(), 'generated-blogs')
    if (!fs.existsSync(blogDir)) fs.mkdirSync(blogDir, { recursive: true })
    const blogData = { ...blogPost, videoUrl, generatedAt: new Date().toISOString() }
    const filename = path.join(blogDir, `${blogPost.slug}.json`)
    fs.writeFileSync(filename, JSON.stringify(blogData, null, 2))
    console.log(`✅ Blog post saved to file: ${filename}`)
    return blogData
  }
}

function socialCaption(blogPost: BlogPost): string {
  return `${blogPost.title}\n\n${blogPost.excerpt}\n\nRead the full guide: https://natureswaysoil.com/blog/${blogPost.slug}\n\n#soilhealth #lawncare #organicgardening #natureswaysoil`
}

/** Post video to social media platforms. */
export async function postBlogVideoToSocial(blogPost: BlogPost, videoUrl: string) {
  console.log('\n📱 Posting video to social media...')
  const caption = socialCaption(blogPost)
  const results: any = {}

  if (process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
    try {
      console.log('📺 Uploading to YouTube...')
      const ytVideoId = await postToYouTube(videoUrl, blogPost.title, process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET, process.env.YT_REFRESH_TOKEN, (process.env.YT_PRIVACY_STATUS as 'public' | 'unlisted' | 'private') || 'public')
      results.youtube = { success: true, videoId: ytVideoId }
      console.log('✅ Posted to YouTube:', ytVideoId)
    } catch (error: any) {
      results.youtube = { success: false, error: error.message }
      console.error('❌ YouTube upload failed:', error.message)
    }
  } else {
    console.log('⏭️  Skipping YouTube - credentials not configured')
  }

  if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
    try {
      console.log('📸 Posting to Instagram...')
      const igResult = await postToInstagram(videoUrl, caption, process.env.INSTAGRAM_ACCESS_TOKEN, process.env.INSTAGRAM_IG_ID)
      results.instagram = { success: true, mediaId: igResult }
      console.log('✅ Posted to Instagram:', igResult || 'success')
    } catch (error: any) {
      results.instagram = { success: false, error: error.message }
      console.error('❌ Instagram post failed:', error.message)
    }
  } else {
    console.log('⏭️  Skipping Instagram - credentials not configured')
  }

  if (process.env.TWITTER_BEARER_TOKEN) {
    try {
      console.log('🐦 Posting to Twitter/X...')
      await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN)
      results.twitter = { success: true }
      console.log('✅ Posted to Twitter/X')
    } catch (error: any) {
      results.twitter = { success: false, error: error.message }
      console.error('❌ Twitter/X post failed:', error.message)
    }
  } else {
    console.log('⏭️  Skipping Twitter/X - credentials not configured')
  }

  if (process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
    try {
      console.log('📌 Posting to Pinterest...')
      await postToPinterest(videoUrl, caption, process.env.PINTEREST_ACCESS_TOKEN, process.env.PINTEREST_BOARD_ID)
      results.pinterest = { success: true }
      console.log('✅ Posted to Pinterest')
    } catch (error: any) {
      results.pinterest = { success: false, error: error.message }
      console.error('❌ Pinterest post failed:', error.message)
    }
  } else {
    console.log('⏭️  Skipping Pinterest - credentials not configured')
  }

  if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID) {
    try {
      console.log('👤 Posting video to Facebook...')
      const fbRes = await axios.post(`https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/videos`, {
        file_url: videoUrl,
        description: caption,
        access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
      })
      results.facebook = { success: true, postId: fbRes.data?.id }
      console.log('✅ Posted to Facebook:', fbRes.data?.id)
    } catch (error: any) {
      results.facebook = { success: false, error: error.message }
      console.error('❌ Facebook video post failed:', error?.response?.data || error.message)
    }
  } else {
    console.log('⏭️  Skipping Facebook - credentials not configured')
  }

  if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID) {
    try {
      console.log('💼 Posting video to LinkedIn...')
      const liRes = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
        author: `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: caption },
            shareMediaCategory: 'VIDEO',
            media: [{ status: 'READY', description: { text: blogPost.excerpt.substring(0, 200) }, media: videoUrl, title: { text: blogPost.title } }],
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }, {
        headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
      })
      results.linkedin = { success: true, postId: liRes.data?.id }
      console.log('✅ Posted to LinkedIn:', liRes.data?.id)
    } catch (error: any) {
      results.linkedin = { success: false, error: error.message }
      console.error('❌ LinkedIn video post failed:', error?.response?.data || error.message)
    }
  } else {
    console.log('⏭️  Skipping LinkedIn - credentials not configured')
  }

  if (process.env.TIKTOK_ACCESS_TOKEN) {
    try {
      console.log('🎵 Posting to TikTok...')
      const ttRes = await axios.post('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        post_info: {
          title: blogPost.title.substring(0, 150),
          privacy_level: process.env.TIKTOK_PRIVACY_LEVEL || 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
      }, {
        headers: { Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`, 'Content-Type': 'application/json; charset=UTF-8' },
      })
      results.tiktok = { success: true, publishId: ttRes.data?.data?.publish_id }
      console.log('✅ Posted to TikTok, publish_id:', ttRes.data?.data?.publish_id)
    } catch (error: any) {
      results.tiktok = { success: false, error: error.message }
      console.error('❌ TikTok post failed:', error?.response?.data || error.message)
    }
  } else {
    console.log('⏭️  Skipping TikTok - access token not configured')
  }

  return results
}

/** Post blog link when video is unavailable, so traffic does not stop just because HeyGen fails. */
export async function postBlogLinkToSocial(blogPost: BlogPost) {
  console.log('\n📣 Posting blog link to social media because no video was generated...')
  const caption = socialCaption(blogPost)
  const blogUrl = `https://natureswaysoil.com/blog/${blogPost.slug}`
  const results: any = {}

  if (process.env.TWITTER_BEARER_TOKEN) {
    try {
      const res = await axios.post('https://api.twitter.com/2/tweets', { text: caption.substring(0, 275) }, {
        headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` }
      })
      results.twitter = { success: true, postId: res.data?.data?.id }
      console.log('✅ Posted blog link to Twitter/X')
    } catch (error: any) {
      results.twitter = { success: false, error: error.message }
      console.error('❌ Twitter/X link post failed:', error?.response?.data || error.message)
    }
  }

  if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID) {
    try {
      const fbRes = await axios.post(`https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/feed`, {
        message: caption,
        link: blogUrl,
        access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
      })
      results.facebook = { success: true, postId: fbRes.data?.id }
      console.log('✅ Posted blog link to Facebook')
    } catch (error: any) {
      results.facebook = { success: false, error: error.message }
      console.error('❌ Facebook link post failed:', error?.response?.data || error.message)
    }
  }

  if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID) {
    try {
      const liRes = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
        author: `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: `${caption}\n${blogUrl}` },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }, {
        headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
      })
      results.linkedin = { success: true, postId: liRes.data?.id }
      console.log('✅ Posted blog link to LinkedIn')
    } catch (error: any) {
      results.linkedin = { success: false, error: error.message }
      console.error('❌ LinkedIn link post failed:', error?.response?.data || error.message)
    }
  }

  if (!Object.keys(results).length) {
    console.log('⏭️  No text/link social credentials configured')
  }

  return results
}

/** Publish the blog post to the Nature's Way Soil website by committing it to public/blog_articles.json. */
export async function publishBlogToGitHub(blogPost: BlogPost, videoUrl: string | null): Promise<{ success: boolean; commitSha?: string; skipped?: boolean; reason?: string; error?: string }> {
  if (process.env.ENABLE_BLOG_POSTING !== 'true') {
    console.log('⏭️  Skipping GitHub blog publish - ENABLE_BLOG_POSTING is not true')
    return { success: false, skipped: true, reason: 'ENABLE_BLOG_POSTING!=true' }
  }

  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) {
    console.log('⏭️  Skipping GitHub blog publish - GITHUB_TOKEN not set')
    return { success: false, skipped: true, reason: 'missing GITHUB_TOKEN' }
  }

  const repo = process.env.GITHUB_REPO || 'natureswaysoil/best'
  const branch = process.env.GITHUB_BRANCH || 'main'
  const filePath = process.env.GITHUB_BLOG_FILE || 'public/blog_articles.json'
  const fileUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`

  try {
    console.log(`\n📰 Publishing blog to GitHub: ${repo}@${branch}:${filePath}`)
    const fileResponse = await axios.get(fileUrl, { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' } })
    const currentContent = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8')
    const currentArticles: any[] = JSON.parse(currentContent)

    const existingSlugs = new Set(currentArticles.map((a: any) => a.slug))
    const existingTitles = new Set(currentArticles.map((a: any) => String(a.title || '').toLowerCase()))
    if (existingTitles.has(blogPost.title.toLowerCase())) {
      console.log(`⚠️  Blog article "${blogPost.title}" already exists on GitHub - skipping duplicate`)
      return { success: true, skipped: true, reason: 'duplicate-title' }
    }

    const slug = existingSlugs.has(blogPost.slug) ? `${blogPost.slug}-${Date.now()}` : blogPost.slug
    const newArticle = {
      id: `article_${Date.now()}`,
      slug,
      title: blogPost.title,
      excerpt: blogPost.excerpt,
      content: blogPost.content,
      publishDate: blogPost.publishDate,
      category: blogPost.category || 'Gardening Tips',
      featuredImage: 'https://natureswaysoil.com/images/blog/default-blog-thumbnail.jpg',
      author: "Nature's Way Soil Team",
      tags: blogPost.tags || [],
      metaDescription: blogPost.excerpt?.substring(0, 160) || '',
      featuredPost: false,
      videoUrl: videoUrl || undefined,
      seoKeywords: blogPost.seoKeywords || [],
    }

    currentArticles.unshift(newArticle)
    const updatedContent = JSON.stringify(currentArticles, null, 2)
    const updateResponse = await axios.put(fileUrl, {
      message: `Add blog article: ${newArticle.title}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: fileResponse.data.sha,
      branch,
    }, { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' } })

    const commitSha = updateResponse.data?.commit?.sha
    console.log('✅ Blog published to GitHub')
    console.log(`   Slug: ${newArticle.slug}`)
    console.log(`   Commit: ${commitSha}`)
    console.log(`   URL:  https://natureswaysoil.com/blog/${newArticle.slug}`)
    return { success: true, commitSha }
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || String(error)
    console.error('❌ Failed to publish blog to GitHub:', message)
    return { success: false, error: message }
  }
}

/** Main execution function. */
export async function runBlogGeneration() {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 AUTOMATED BLOG & VIDEO GENERATION')
  console.log('='.repeat(60))
  console.log(`Started at: ${new Date().toISOString()}`)

  try {
    const blogPost = await generateBlogArticle()
    const videoUrl = await generateBlogVideo(blogPost)
    await saveBlogPost(blogPost, videoUrl)
    const githubResult = await publishBlogToGitHub(blogPost, videoUrl)

    let socialResults: any = {}
    if (videoUrl) {
      socialResults = await postBlogVideoToSocial(blogPost, videoUrl)
    } else if (githubResult.success && !githubResult.skipped) {
      socialResults = await postBlogLinkToSocial(blogPost)
    } else {
      console.log('\n⏭️  Skipping social media posting - no video generated and blog was not newly published')
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ Blog generation completed successfully!')
    console.log('='.repeat(60))
    console.log(`Title: ${blogPost.title}`)
    console.log(`Slug: ${blogPost.slug}`)
    console.log(`Video: ${videoUrl || 'Not generated'}`)
    console.log(`GitHub Blog: ${githubResult.success ? (githubResult.skipped ? '⏭️  skipped (' + githubResult.reason + ')' : '✅ ' + (githubResult.commitSha || 'committed')) : '❌ ' + (githubResult.error || 'failed')}`)
    console.log('Social Media:')
    console.log(`  YouTube:   ${socialResults.youtube?.success ? '✅' : socialResults.youtube ? '❌' : '⏭️  skipped'}`)
    console.log(`  Instagram: ${socialResults.instagram?.success ? '✅' : socialResults.instagram ? '❌' : '⏭️  skipped'}`)
    console.log(`  Twitter:   ${socialResults.twitter?.success ? '✅' : socialResults.twitter ? '❌' : '⏭️  skipped'}`)
    console.log(`  Pinterest: ${socialResults.pinterest?.success ? '✅' : socialResults.pinterest ? '❌' : '⏭️  skipped'}`)
    console.log(`  Facebook:  ${socialResults.facebook?.success ? '✅' : socialResults.facebook ? '❌' : '⏭️  skipped'}`)
    console.log(`  LinkedIn:  ${socialResults.linkedin?.success ? '✅' : socialResults.linkedin ? '❌' : '⏭️  skipped'}`)
    console.log(`  TikTok:    ${socialResults.tiktok?.success ? '✅' : socialResults.tiktok ? '❌' : '⏭️  skipped'}`)
    console.log('='.repeat(60) + '\n')
  } catch (error: any) {
    const message = error?.message || String(error)
    console.error('\n❌ Blog generation failed:', message)
    throw error
  }
}

if (require.main === module) {
  runBlogGeneration()
    .then(() => {
      console.log('✅ Done')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error)
      process.exit(1)
    })
}
