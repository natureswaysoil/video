import 'dotenv/config'
import axios from 'axios'
import { createClientWithSecrets } from './did'
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

const BLOG_TOPICS = [
  'soil health',
  'organic gardening',
  'composting tips',
  'plant nutrition',
  'sustainable farming',
  'garden fertilizers',
  'soil amendments',
  'worm castings benefits',
  'biochar uses',
  'hydroponic gardening',
  'lawn care',
  'vegetable gardening',
  'indoor plants',
  'orchid care',
  'tomato growing tips'
]

export async function generateBlogArticle(): Promise<BlogPost> {
  const topic = BLOG_TOPICS[Math.floor(Math.random() * BLOG_TOPICS.length)]
  console.log(`\n🎯 Generating blog article about: ${topic}`)

  const prompt = `You are an expert in organic gardening and soil science. Write a comprehensive, SEO-optimized blog article for Nature's Way Soil website.

Topic: ${topic}

Requirements:
1. Title: Catchy, SEO-friendly (60-70 characters)
2. Excerpt: Engaging summary (150-160 characters)
3. Content: 1200-1800 words, well-structured with headings
4. Include actionable tips and science-backed information
5. Naturally mention Nature's Way Soil products where relevant
6. Professional yet accessible tone
7. Include a call-to-action at the end

Format your response as JSON:
{
  "title": "...",
  "excerpt": "...",
  "content": "...",
  "category": "...",
  "tags": ["...", "..."],
  "seoKeywords": ["...", "..."],
  "videoPrompt": "A 15-second visual description for video generation"
}

The content should use Markdown formatting with ## for headings.`

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_BLOG_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert content writer specializing in organic gardening, soil science, and sustainable agriculture.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    })

    const content = response.choices?.[0]?.message?.content
    if (!content) throw new Error('No content generated')
    const blogData = JSON.parse(content)
    const slug = blogData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

    const blogPost: BlogPost = { ...blogData, slug, publishDate: new Date().toISOString() }
    console.log('✅ Blog article generated successfully!')
    console.log(`   Title: ${blogPost.title}`)
    console.log(`   Word Count: ~${blogPost.content.split(' ').length} words`)
    console.log(`   Tags: ${blogPost.tags.join(', ')}`)
    return blogPost
  } catch (error: any) {
    console.error('❌ Failed to generate blog article:', error.message)
    throw error
  }
}

export async function generateBlogVideo(blogPost: BlogPost): Promise<string | null> {
  console.log(`\n🎬 Generating video for: ${blogPost.title}`)

  if (!process.env.DID_API_KEY && !process.env.DiD) {
    console.log('⚠️  D-ID API key not configured, skipping video generation')
    return null
  }

  try {
    const did = await createClientWithSecrets()
    const script = `${blogPost.title}. ${blogPost.excerpt} ${blogPost.videoPrompt}. Visit natureswaysoil.com for more info.`
    const jobId = await did.createVideoJob({
      script,
      title: blogPost.title,
      sourceUrl: process.env.DID_SOURCE_URL,
      presenterId: process.env.DID_PRESENTER_ID,
      voiceId: process.env.DID_VOICE_ID,
      webhook: process.env.DID_WEBHOOK_URL,
      subtitles: { enabled: true },
      meta: { blogSlug: blogPost.slug, category: blogPost.category }
    })

    console.log(`✅ D-ID job created: ${jobId}`)
    console.log('⏳ Waiting for video to be ready...')
    const videoUrl = await did.pollJobForVideoUrl(jobId, { timeoutMs: 20 * 60_000, intervalMs: 10_000 })
    console.log(`✅ Video ready: ${videoUrl}`)
    return videoUrl
  } catch (error: any) {
    console.error('❌ Video generation failed:', error.message)
    return null
  }
}

export async function saveBlogPost(blogPost: BlogPost, videoUrl: string | null) {
  console.log(`\n💾 Saving blog post: ${blogPost.slug}`)

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
    const { data, error } = await supabase.from('blog_posts').insert([{ title: blogPost.title, slug: blogPost.slug, excerpt: blogPost.excerpt, content: blogPost.content, category: blogPost.category, tags: blogPost.tags, seo_keywords: blogPost.seoKeywords, video_url: videoUrl, published_at: blogPost.publishDate, status: 'published' }]).select()
    if (error) throw error
    console.log('✅ Blog post saved to database')
    console.log(`   URL: https://natureswaysoil.com/blog/${blogPost.slug}`)
    return data
  } catch (error: any) {
    console.log('⚠️  Database save failed, saving to file instead')
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

export async function postBlogVideoToSocial(blogPost: BlogPost, videoUrl: string) {
  console.log('\n📱 Posting video to social media...')
  const caption = `${blogPost.title}\n\n${blogPost.excerpt}\n\nRead more: https://natureswaysoil.com/blog/${blogPost.slug}\n\n#organicgardening #soilhealth #naturalgardening`
  const results: any = {}

  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN) {
    try {
      console.log('📺 Uploading to YouTube...')
      const ytVideoId = await postToYouTube(videoUrl, blogPost.title, process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET, process.env.YOUTUBE_REFRESH_TOKEN, (process.env.YOUTUBE_PRIVACY_STATUS as 'public' | 'unlisted' | 'private') || 'public')
      console.log('✅ Posted to YouTube:', ytVideoId)
      results.youtube = { success: true, videoId: ytVideoId }
    } catch (error: any) {
      console.error('❌ YouTube upload failed:', error.message)
      results.youtube = { success: false, error: error.message }
    }
  } else console.log('⏭️  Skipping YouTube - credentials not configured')

  if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID) {
    try {
      console.log('📸 Posting to Instagram...')
      const igResult = await postToInstagram(videoUrl, caption, process.env.INSTAGRAM_ACCESS_TOKEN, process.env.INSTAGRAM_USER_ID)
      console.log('✅ Posted to Instagram:', igResult || 'success')
      results.instagram = { success: true, mediaId: igResult }
    } catch (error: any) {
      console.error('❌ Instagram post failed:', error.message)
      results.instagram = { success: false, error: error.message }
    }
  } else console.log('⏭️  Skipping Instagram - credentials not configured')

  if (process.env.TWITTER_BEARER_TOKEN) {
    try {
      console.log('🐦 Posting to Twitter...')
      await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN)
      console.log('✅ Posted to Twitter')
      results.twitter = { success: true }
    } catch (error: any) {
      console.error('❌ Twitter post failed:', error.message)
      results.twitter = { success: false, error: error.message }
    }
  } else console.log('⏭️  Skipping Twitter - credentials not configured')

  if (process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
    try {
      console.log('📌 Posting to Pinterest...')
      await postToPinterest(videoUrl, caption, process.env.PINTEREST_ACCESS_TOKEN, process.env.PINTEREST_BOARD_ID)
      console.log('✅ Posted to Pinterest')
      results.pinterest = { success: true }
    } catch (error: any) {
      console.error('❌ Pinterest post failed:', error.message)
      results.pinterest = { success: false, error: error.message }
    }
  } else console.log('⏭️  Skipping Pinterest - board ID not configured')

  if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID) {
    try {
      console.log('👤 Posting to Facebook...')
      const fbRes = await axios.post(`https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/videos`, { file_url: videoUrl, description: caption, access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN })
      console.log('✅ Posted to Facebook:', fbRes.data?.id)
      results.facebook = { success: true, postId: fbRes.data?.id }
    } catch (error: any) {
      console.error('❌ Facebook post failed:', error?.response?.data || error.message)
      results.facebook = { success: false, error: error.message }
    }
  } else console.log('⏭️  Skipping Facebook - credentials not configured')

  return results
}

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
    if (existingTitles.has(blogPost.title.toLowerCase())) return { success: true, skipped: true, reason: 'duplicate-title' }
    const slug = existingSlugs.has(blogPost.slug) ? `${blogPost.slug}-${Date.now()}` : blogPost.slug
    const newArticle = { id: `article_${Date.now()}`, slug, title: blogPost.title, excerpt: blogPost.excerpt, content: blogPost.content, publishDate: blogPost.publishDate, category: blogPost.category || 'Gardening Tips', featuredImage: 'https://natureswaysoil.com/images/blog/default-blog-thumbnail.jpg', author: "Nature's Way Soil Team", tags: blogPost.tags || [], metaDescription: blogPost.excerpt?.substring(0, 160) || '', featuredPost: false, videoUrl: videoUrl || undefined, seoKeywords: blogPost.seoKeywords || [] }
    currentArticles.unshift(newArticle)
    const updateResponse = await axios.put(fileUrl, { message: `Add blog article: ${newArticle.title}`, content: Buffer.from(JSON.stringify(currentArticles, null, 2)).toString('base64'), sha: fileResponse.data.sha, branch }, { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' } })
    const commitSha = updateResponse.data?.commit?.sha
    console.log('✅ Blog published to GitHub')
    console.log(`   Slug: ${newArticle.slug}`)
    console.log(`   Commit: ${commitSha}`)
    return { success: true, commitSha }
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || String(error)
    console.error('❌ Failed to publish blog to GitHub:', message)
    return { success: false, error: message }
  }
}

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
    if (videoUrl) socialResults = await postBlogVideoToSocial(blogPost, videoUrl)
    else console.log('\n⏭️  Skipping social media posting - no video generated')

    console.log('\n' + '='.repeat(60))
    console.log('✅ Blog generation completed successfully!')
    console.log('='.repeat(60))
    console.log(`Title: ${blogPost.title}`)
    console.log(`Slug: ${blogPost.slug}`)
    console.log(`Video: ${videoUrl || 'Not generated'}`)
    console.log(`GitHub Blog: ${githubResult.success ? (githubResult.skipped ? '⏭️  skipped (' + githubResult.reason + ')' : '✅ ' + (githubResult.commitSha || 'committed')) : '❌ ' + (githubResult.error || 'failed')}`)
    console.log(`Social Media:`)
    console.log(`  YouTube:   ${socialResults.youtube?.success ? '✅' : socialResults.youtube ? '❌' : '⏭️  skipped'}`)
    console.log(`  Instagram: ${socialResults.instagram?.success ? '✅' : socialResults.instagram ? '❌' : '⏭️  skipped'}`)
    console.log(`  Twitter:   ${socialResults.twitter?.success ? '✅' : socialResults.twitter ? '❌' : '⏭️  skipped'}`)
    console.log(`  Pinterest: ${socialResults.pinterest?.success ? '✅' : socialResults.pinterest ? '❌' : '⏭️  skipped'}`)
    console.log(`  Facebook:  ${socialResults.facebook?.success ? '✅' : socialResults.facebook ? '❌' : '⏭️  skipped'}`)
    console.log('='.repeat(60) + '\n')
  } catch (error: any) {
    console.error('\n❌ Blog generation failed:', error?.message || String(error))
    throw error
  }
}

if (require.main === module) {
  runBlogGeneration().then(() => { console.log('✅ Done'); process.exit(0) }).catch((error) => { console.error('❌ Fatal error:', error); process.exit(1) })
}
