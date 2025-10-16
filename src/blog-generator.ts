/**
 * Automated Blog Article & Video Generator
 * Generates gardening/soil-related blog content and creates matching videos
 */

import 'dotenv/config'
import { generateScript } from './openai'
import { createWaveSpeedPrediction, pollWaveSpeedUntilReady } from './wavespeed'
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
  
  console.log(`\n🎯 Generating blog article about: ${topic}`)
  
  const prompt = `You are an expert in organic gardening and soil science. Write a comprehensive, SEO-optimized blog article for Nature's Way Soil website.

Topic: ${topic}

Requirements:
1. Title: Catchy, SEO-friendly (60-70 characters)
2. Excerpt: Engaging summary (150-160 characters)
3. Content: 800-1200 words, well-structured with headings
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
      model: 'gpt-4-turbo-preview',
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
      max_tokens: 2500,
      response_format: { type: 'json_object' }
    })

    const content = response.choices[0].message.content
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

/**
 * Generate video for the blog post using WaveSpeed
 */
export async function generateBlogVideo(blogPost: BlogPost): Promise<string | null> {
  console.log(`\n🎬 Generating video for: ${blogPost.title}`)
  
  if (!process.env.WAVE_SPEED_API_KEY && !process.env.WAVESPEED_API_KEY) {
    console.log('⚠️  WaveSpeed API key not configured, skipping video generation')
    return null
  }

  try {
    // Create a compelling video script from the blog content
    const videoScript = `${blogPost.videoPrompt}. Professional, cinematic style. Nature, garden, soil close-ups. Vibrant green plants. Healthy soil texture.`

    console.log('Creating WaveSpeed prediction...')
    const { id: predictionId } = await createWaveSpeedPrediction({
      script: videoScript,
      jobId: `blog-${blogPost.slug}`
    })

    console.log(`✅ Prediction created: ${predictionId}`)
    console.log('⏳ Waiting for video to be ready...')

    const videoUrl = await pollWaveSpeedUntilReady(predictionId)
    
    if (videoUrl) {
      console.log(`✅ Video ready: ${videoUrl}`)
      return videoUrl
    } else {
      console.log('⚠️  Video generation timed out or failed')
      return null
    }
  } catch (error: any) {
    console.error('❌ Video generation failed:', error.message)
    return null
  }
}

/**
 * Save blog post to Supabase or file system
 */
export async function saveBlogPost(blogPost: BlogPost, videoUrl: string | null) {
  console.log(`\n💾 Saving blog post: ${blogPost.slug}`)
  
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

    console.log('✅ Blog post saved to database')
    console.log(`   URL: https://natureswaysoil.com/blog/${blogPost.slug}`)
    
    return data
  } catch (error: any) {
    console.log('⚠️  Database save failed, saving to file instead')
    
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
    
    console.log(`✅ Blog post saved to file: ${filename}`)
    
    return blogData
  }
}

/**
 * Post video to social media platforms
 */
export async function postBlogVideoToSocial(blogPost: BlogPost, videoUrl: string) {
  console.log('\n📱 Posting video to social media...')
  
  const caption = `${blogPost.title}\n\n${blogPost.excerpt}\n\nRead more: https://natureswaysoil.com/blog/${blogPost.slug}\n\n#organicgardening #soilhealth #naturalgardening`
  
  const results: any = {}
  
  // YouTube (caption used as title, first 5000 chars of content as description)
  if (process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
    try {
      console.log('📺 Uploading to YouTube...')
      const ytVideoId = await postToYouTube(
        videoUrl,
        blogPost.title,
        process.env.YT_CLIENT_ID,
        process.env.YT_CLIENT_SECRET,
        process.env.YT_REFRESH_TOKEN,
        (process.env.YT_PRIVACY_STATUS as 'public' | 'unlisted' | 'private') || 'public'
      )
      console.log('✅ Posted to YouTube:', ytVideoId)
      results.youtube = { success: true, videoId: ytVideoId }
    } catch (error: any) {
      console.error('❌ YouTube upload failed:', error.message)
      results.youtube = { success: false, error: error.message }
    }
  } else {
    console.log('⏭️  Skipping YouTube - credentials not configured')
  }
  
  // Instagram
  if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
    try {
      console.log('📸 Posting to Instagram...')
      const igResult = await postToInstagram(
        videoUrl,
        caption,
        process.env.INSTAGRAM_ACCESS_TOKEN,
        process.env.INSTAGRAM_IG_ID
      )
      console.log('✅ Posted to Instagram:', igResult?.id || 'success')
      results.instagram = { success: true, mediaId: igResult?.id }
    } catch (error: any) {
      console.error('❌ Instagram post failed:', error.message)
      results.instagram = { success: false, error: error.message }
    }
  } else {
    console.log('⏭️  Skipping Instagram - credentials not configured')
  }
  
  // Twitter
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
  } else {
    console.log('⏭️  Skipping Twitter - credentials not configured')
  }
  
  // Pinterest (requires board ID)
  if (process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
    try {
      console.log('📌 Posting to Pinterest...')
      await postToPinterest(
        videoUrl,
        caption,
        process.env.PINTEREST_ACCESS_TOKEN,
        process.env.PINTEREST_BOARD_ID
      )
      console.log('✅ Posted to Pinterest')
      results.pinterest = { success: true }
    } catch (error: any) {
      console.error('❌ Pinterest post failed:', error.message)
      results.pinterest = { success: false, error: error.message }
    }
  } else {
    console.log('⏭️  Skipping Pinterest - board ID not configured')
  }
  
  return results
}

/**
 * Main execution function
 */
export async function runBlogGeneration() {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 AUTOMATED BLOG & VIDEO GENERATION')
  console.log('='.repeat(60))
  console.log(`Started at: ${new Date().toISOString()}`)
  
  try {
    // Step 1: Generate blog article
    const blogPost = await generateBlogArticle()
    
    // Step 2: Generate video
    const videoUrl = await generateBlogVideo(blogPost)
    
    // Step 3: Save blog post
    await saveBlogPost(blogPost, videoUrl)
    
    // Step 4: Post to social media (if video was generated)
    let socialResults: any = {}
    if (videoUrl) {
      socialResults = await postBlogVideoToSocial(blogPost, videoUrl)
    } else {
      console.log('\n⏭️  Skipping social media posting - no video generated')
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Blog generation completed successfully!')
    console.log('='.repeat(60))
    console.log(`Title: ${blogPost.title}`)
    console.log(`Slug: ${blogPost.slug}`)
    console.log(`Video: ${videoUrl || 'Not generated'}`)
    console.log(`Social Media:`)
    console.log(`  YouTube: ${socialResults.youtube?.success ? '✅' : '❌'}`)
    console.log(`  Instagram: ${socialResults.instagram?.success ? '✅' : '❌'}`)
    console.log(`  Twitter: ${socialResults.twitter?.success ? '✅' : '❌'}`)
    console.log(`  Pinterest: ${socialResults.pinterest?.success ? '✅' : '❌'}`)
    console.log('='.repeat(60) + '\n')
    
  } catch (error: any) {
    console.error('\n❌ Blog generation failed:', error.message)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  runBlogGeneration().then(() => {
    console.log('✅ Done')
    process.exit(0)
  }).catch((error) => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  })
}
