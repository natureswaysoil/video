/**
 * Automated Blog Article & Video Generator
 * Generates gardening/soil-related blog content and creates matching videos
 */

import 'dotenv/config'
import axios from 'axios'
import { generateScript } from './openai'
import { createClientWithSecrets } from './heygen'
import { postToYouTube } from './youtube'
import { postToInstagram } from './instagram'
import { postToTwitter } from './twitter'
import { postToPinterest } from './pinterest'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

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

/**
 * Generate a comprehensive blog article with OpenAI
 */
export async function generateBlogArticle(): Promise<BlogPost> {
  const topic = BLOG_TOPICS[Math.floor(Math.random() * BLOG_TOPICS.length)]
  
  console.log(`\nðŸŽ¯ Generating blog article about: ${topic}`)
  
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
        {
          role: 'system',
          content: 'You are an expert content writer specializing in organic gardening, soil science, and sustainable agriculture.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    })

    const choice = response.choices?.[0]
    const content = choice?.message?.content
    if (!content) throw new Error('No content generated')

    const blogData = JSON.parse(content)
    
    // Generate slug from title
    const slug = blogData.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    
    // Add publish date
    const publishDate = new Date().toISOString()

    const blogPost: BlogPost = {
      ...blogData,
      slug,
      publishDate
    }

    console.log('âœ… Blog article generated successfully!')
    console.log(`   Title: ${blogPost.title}`)
    console.log(`   Word Count: ~${blogPost.content.split(' ').length} words`)
    console.log(`   Tags: ${blogPost.tags.join(', ')}`)

    return blogPost
  } catch (error: any) {
    console.error('âŒ Failed to generate blog article:', error.message)
    throw error
  }
}

/**
 * Generate video for the blog post using HeyGen
 */
export async function generateBlogVideo(blogPost: BlogPost): Promise<string | null> {
  console.log(`\nðŸŽ¬ Generating video for: ${blogPost.title}`)
  
  if (!process.env.HEYGEN_API_KEY && !process.env.GCP_SECRET_HEYGEN_API_KEY) {
    console.log('âš ï¸  HeyGen API key not configured, skipping video generation')
    return null
  }

  try {
    // Generate customer-facing narration from the article. `videoPrompt` is
    // visual direction and must never be sent to HeyGen as spoken text.
    const videoScript = await generateScript({
      id: blogPost.slug,
      title: blogPost.title,
      details: `${blogPost.excerpt}\n\n${blogPost.content.slice(0, 3500)}`,
    } as any)

    console.log('Creating HeyGen video job...')
    
    // Initialize HeyGen client with secrets support
    const heygen = await createClientWithSecrets()
    
    // Get avatar and voice settings with fallback defaults
    const avatar = process.env.HEYGEN_DEFAULT_AVATAR || 'garden_expert_01'
    const voice = process.env.HEYGEN_DEFAULT_VOICE || 'en_us_warm_female_01'
    const lengthSeconds = parseInt(process.env.HEYGEN_VIDEO_DURATION_SECONDS || '30')
    
    // Create video generation job
    const jobId = await heygen.createVideoJob({
      script: videoScript,
      title: blogPost.title,
      lengthSeconds,
      avatar,
      voice,
      music: {
        style: 'nature',
        volume: 0.15
      },
      subtitles: {
        enabled: true,
        style: 'modern'
      },
      webhook: process.env.HEYGEN_WEBHOOK_URL,
      meta: {
        blogSlug: blogPost.slug,
        category: blogPost.category
      }
    })

    console.log(`âœ… HeyGen job created: ${jobId}`)
    console.log('â³ Waiting for video to be ready...')

    // Poll for completion (timeout 20 minutes)
    const videoUrl = await heygen.pollJobForVideoUrl(jobId, {
      timeoutMs: 20 * 60_000,
      intervalMs: 10_000
    })
    
    if (videoUrl) {
      console.log(`âœ… Video ready: ${videoUrl}`)
      return videoUrl
    } else {
      console.log('âš ï¸  Video generation timed out or failed')
      return null
    }
  } catch (error: any) {
    console.error('âŒ Video generation failed:', error.message)
    return null
  }
}

/**
 * Save blog post to Supabase or file system
 */
export async function saveBlogPost(blogPost: BlogPost, videoUrl: string | null) {
  console.log(`\nðŸ’¾ Saving blog post: ${blogPost.slug}`)
  
  // Try to save to Supabase first
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

    console.log('âœ… Blog post saved to database')
    console.log(`   URL: https://natureswaysoil.com/blog/${blogPost.slug}`)
    
    return data
  } catch (error: any) {
    console.log('âš ï¸  Database save failed, saving to file instead')
    
    // Fallback: Save to file system
    const fs = await import('fs')
    const path = await import('path')
    
    const blogDir = path.join(process.cwd(), 'generated-blogs')
    if (!fs.existsSync(blogDir)) {
      fs.mkdirSync(blogDir, { recursive: true })
    }

    const blogData = {
      ...blogPost,
      videoUrl,
      generatedAt: new Date().toISOString()
    }

    const filename = path.join(blogDir, `${blogPost.slug}.json`)
    fs.writeFileSync(filename, JSON.stringify(blogData, null, 2))
    
    console.log(`âœ… Blog post saved to file: ${filename}`)
    
    return blogData
  }
}

/**
 * Post video to social media platforms
 */
export async function postBlogVideoToSocial(blogPost: BlogPost, videoUrl: string) {
  console.log('\nðŸ“± Posting video to social media...')
  
  const caption = `${blogPost.title}\n\n${blogPost.excerpt}\n\nRead more: https://natureswaysoil.com/blog/${blogPost.slug}\n\n#organicgardening #soilhealth #naturalgardening`
  
  const results: any = {}
  
  // YouTube (caption used as title, first 5000 chars of content as description)
  if (process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
    try {
      console.log('ðŸ“º Uploading to YouTube...')
      const ytVideoId = await postToYouTube(
        videoUrl,
        blogPost.title,
        process.env.YT_CLIENT_ID,
        process.env.YT_CLIENT_SECRET,
        process.env.YT_REFRESH_TOKEN,
        (process.env.YT_PRIVACY_STATUS as 'public' | 'unlisted' | 'private') || 'public'
      )
      console.log('âœ… Posted to YouTube:', ytVideoId)
      results.youtube = { success: true, videoId: ytVideoId }
    } catch (error: any) {
      console.error('âŒ YouTube upload failed:', error.message)
      results.youtube = { success: false, error: error.message }
    }
  } else {
    console.log('â­ï¸  Skipping YouTube - credentials not configured')
  }
  
  // Instagram
  if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
    try {
      console.log('ðŸ“¸ Posting to Instagram...')
      const igResult = await postToInstagram(
        videoUrl,
        caption,
        process.env.INSTAGRAM_ACCESS_TOKEN,
        process.env.INSTAGRAM_IG_ID
      )
      console.log('âœ… Posted to Instagram:', igResult || 'success')
      results.instagram = { success: true, mediaId: igResult }
    } catch (error: any) {
      console.error('âŒ Instagram post failed:', error.message)
      results.instagram = { success: false, error: error.message }
    }
  } else {
    console.log('â­ï¸  Skipping Instagram - credentials not configured')
  }
  
  // Twitter
  if (process.env.TWITTER_BEARER_TOKEN) {
    try {
      console.log('ðŸ¦ Posting to Twitter...')
      await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN)
      console.log('âœ… Posted to Twitter')
      results.twitter = { success: true }
    } catch (error: any) {
      console.error('âŒ Twitter post failed:', error.message)
      results.twitter = { success: false, error: error.message }
    }
  } else {
    console.log('â­ï¸  Skipping Twitter - credentials not configured')
  }
  
  // Pinterest (requires board ID)
  if (process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
    try {
      console.log('ðŸ“Œ Posting to Pinterest...')
      await postToPinterest(
        videoUrl,
        caption,
        process.env.PINTEREST_ACCESS_TOKEN,
        process.env.PINTEREST_BOARD_ID
      )
      console.log('âœ… Posted to Pinterest')
      results.pinterest = { success: true }
    } catch (error: any) {
      console.error('âŒ Pinterest post failed:', error.message)
      results.pinterest = { success: false, error: error.message }
    }
  } else {
    console.log('â­ï¸  Skipping Pinterest - board ID not configured')
  }

  // Facebook
  if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID) {
    try {
      console.log('ðŸ‘¤ Posting to Facebook...')
      const fbRes = await axios.post(
        `https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/videos`,
        {
          file_url: videoUrl,
          description: caption,
          access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
        }
      )
      console.log('âœ… Posted to Facebook:', fbRes.data?.id)
      results.facebook = { success: true, postId: fbRes.data?.id }
    } catch (error: any) {
      console.error('âŒ Facebook post failed:', error?.response?.data || error.message)
      results.facebook = { success: false, error: error.message }
    }
  } else {
    console.log('â­ï¸  Skipping Facebook - credentials not configured')
  }

  // LinkedIn
  if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID) {
    try {
      console.log('ðŸ’¼ Posting to LinkedIn...')
      const liRes = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: caption },
              shareMediaCategory: 'VIDEO',
              media: [{
                status: 'READY',
                description: { text: blogPost.excerpt.substring(0, 200) },
                media: videoUrl,
                title: { text: blogPost.title },
              }],
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
      console.log('âœ… Posted to LinkedIn:', liRes.data?.id)
      results.linkedin = { success: true, postId: liRes.data?.id }
    } catch (error: any) {
      console.error('âŒ LinkedIn post failed:', error?.response?.data || error.message)
      results.linkedin = { success: false, error: error.message }
    }
  } else {
    console.log('â­ï¸  Skipping LinkedIn - credentials not configured')
  }

  // TikTok
  if (process.env.TIKTOK_ACCESS_TOKEN) {
    try {
      console.log('ðŸŽµ Posting to TikTok...')
      const ttRes = await axios.post(
        'https://open.tiktokapis.com/v2/post/publish/video/init/',
        {
          post_info: {
            title: blogPost.title.substring(0, 150),
            privacy_level: process.env.TIKTOK_PRIVACY_LEVEL || 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        }
      )
      console.log('âœ… Posted to TikTok, publish_id:', ttRes.data?.data?.publish_id)
      results.tiktok = { success: true, publishId: ttRes.data?.data?.publish_id }
    } catch (error: any) {
      console.error('âŒ TikTok post failed:', error?.response?.data || error.message)
      results.tiktok = { success: false, error: error.message }
    }
  } else {
    console.log('â­ï¸  Skipping TikTok - access token not configured')
  }

  return results
}

/**
 * Publish the blog post to the Nature's Way Soil website by committing it
 * to public/blog_articles.json on the configured GitHub repo.
 *
 * Gated by ENABLE_BLOG_POSTING=true and a valid GITHUB_TOKEN.
 * Defaults: repo=natureswaysoil/best, branch=main.
 */
export async function publishBlogToGitHub(
  blogPost: BlogPost,
  videoUrl: string | null
): Promise<{ success: boolean; commitSha?: string; skipped?: boolean; reason?: string; error?: string }> {
  if (process.env.ENABLE_BLOG_POSTING !== 'true') {
    console.log('â­ï¸  Skipping GitHub blog publish - ENABLE_BLOG_POSTING is not true')
    return { success: false, skipped: true, reason: 'ENABLE_BLOG_POSTING!=true' }
  }
  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) {
    console.log('â­ï¸  Skipping GitHub blog publish - GITHUB_TOKEN not set')
    return { success: false, skipped: true, reason: 'missing GITHUB_TOKEN' }
  }

  const repo = process.env.GITHUB_REPO || 'natureswaysoil/best'
  const branch = process.env.GITHUB_BRANCH || 'main'
  const filePath = process.env.GITHUB_BLOG_FILE || 'public/blog_articles.json'
  const fileUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`

  try {
    console.log(`\nðŸ“° Publishing blog to GitHub: ${repo}@${branch}:${filePath}`)

    // Fetch current articles file
    const fileResponse = await axios.get(fileUrl, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    const currentContent = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8')
    const currentArticles: any[] = JSON.parse(currentContent)

    // Skip if a post with the same title or slug already exists
    const existingSlugs = new Set(currentArticles.map((a: any) => a.slug))
    const existingTitles = new Set(currentArticles.map((a: any) => String(a.title || '').toLowerCase()))
    if (existingTitles.has(blogPost.title.toLowerCase())) {
      console.log(`âš ï¸  Blog article "${blogPost.title}" already exists on GitHub - skipping duplicate`)
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

    // Prepend so newest appears first
    currentArticles.unshift(newArticle)

    const updatedContent = JSON.stringify(currentArticles, null, 2)
    const updateResponse = await axios.put(
      fileUrl,
      {
        message: `Add blog article: ${newArticle.title}`,
        content: Buffer.from(updatedContent).toString('base64'),
        sha: fileResponse.data.sha,
        branch,
      },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    const commitSha = updateResponse.data?.commit?.sha
    console.log('âœ… Blog published to GitHub')
    console.log(`   Slug: ${newArticle.slug}`)
    console.log(`   Commit: ${commitSha}`)
    console.log(`   URL:  https://natureswaysoil.com/blog/${newArticle.slug}`)
    return { success: true, commitSha }
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || String(error)
    console.error('âŒ Failed to publish blog to GitHub:', message)
    return { success: false, error: message }
  }
}

/**
 * Main execution function
 */
export async function runBlogGeneration() {
  console.log('\n' + '='.repeat(60))
  console.log('ðŸš€ AUTOMATED BLOG & VIDEO GENERATION')
  console.log('='.repeat(60))
  console.log(`Started at: ${new Date().toISOString()}`)
  
  try {
    // Step 1: Generate blog article
    const blogPost = await generateBlogArticle()
    
    // Step 2: Generate video
    const videoUrl = await generateBlogVideo(blogPost)
    
    // Step 3: Save blog post
    await saveBlogPost(blogPost, videoUrl)

    // Step 4: Publish blog to website via GitHub (gated by ENABLE_BLOG_POSTING)
    const githubResult = await publishBlogToGitHub(blogPost, videoUrl)

    // Step 5: Post to social media (if video was generated)
    let socialResults: any = {}
    if (videoUrl) {
      socialResults = await postBlogVideoToSocial(blogPost, videoUrl)
    } else {
      console.log('\nâ­ï¸  Skipping social media posting - no video generated')
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('âœ… Blog generation completed successfully!')
    console.log('='.repeat(60))
    console.log(`Title: ${blogPost.title}`)
    console.log(`Slug: ${blogPost.slug}`)
    console.log(`Video: ${videoUrl || 'Not generated'}`)
    console.log(`GitHub Blog: ${githubResult.success ? (githubResult.skipped ? 'â­ï¸  skipped (' + githubResult.reason + ')' : 'âœ… ' + (githubResult.commitSha || 'committed')) : 'âŒ ' + (githubResult.error || 'failed')}`)
    console.log(`Social Media:`)
    console.log(`  YouTube:   ${socialResults.youtube?.success   ? 'âœ…' : socialResults.youtube   ? 'âŒ' : 'â­ï¸  skipped'}`)
    console.log(`  Instagram: ${socialResults.instagram?.success ? 'âœ…' : socialResults.instagram ? 'âŒ' : 'â­ï¸  skipped'}`)
    console.log(`  Twitter:   ${socialResults.twitter?.success   ? 'âœ…' : socialResults.twitter   ? 'âŒ' : 'â­ï¸  skipped'}`)
    console.log(`  Pinterest: ${socialResults.pinterest?.success ? 'âœ…' : socialResults.pinterest ? 'âŒ' : 'â­ï¸  skipped'}`)
    console.log(`  Facebook:  ${socialResults.facebook?.success  ? 'âœ…' : socialResults.facebook  ? 'âŒ' : 'â­ï¸  skipped'}`)
    console.log(`  LinkedIn:  ${socialResults.linkedin?.success  ? 'âœ…' : socialResults.linkedin  ? 'âŒ' : 'â­ï¸  skipped'}`)
    console.log(`  TikTok:    ${socialResults.tiktok?.success    ? 'âœ…' : socialResults.tiktok    ? 'âŒ' : 'â­ï¸  skipped'}`)
    console.log('='.repeat(60) + '\n')
    
  } catch (error: any) {
    const message = error?.message || String(error)
    console.error('\nâŒ Blog generation failed:', message)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  runBlogGeneration().then(() => {
    console.log('âœ… Done')
    process.exit(0)
  }).catch((error) => {
    console.error('âŒ Fatal error:', error)
    process.exit(1)
  })
}
