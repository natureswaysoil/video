import 'dotenv/config'
import { loadSecretsToEnv } from '../src/secret-manager'
import { selectPexelsBackground } from '../src/pexels'
import { uploadVideoToCloudinary } from '../src/cloudinary-upload'
import { postToFacebook } from '../src/facebook'
import { postToInstagram } from '../src/instagram'
import { postToYouTube } from '../src/youtube'
import { postToPinterest } from '../src/pinterest'
import { postToTwitter } from '../src/twitter'

const fs = require('fs')
const childProcess = require('child_process')

type BlogJson = {
  title?: string
  excerpt?: string
  slug?: string
  category?: string
  tags?: string[]
  videoPrompt?: string
  content?: string
}

function latestBlogFile(): string {
  return childProcess
    .execFileSync('bash', ['-lc', 'ls -t generated-blogs/*.json 2>/dev/null | head -1'])
    .toString()
    .trim()
}

function readLatestBlog(): BlogJson {
  const file = latestBlogFile()
  if (!file) {
    return {
      title: process.env.VIDEO_TITLE || 'Nature’s Way Soil Garden Tip',
      excerpt: process.env.VIDEO_CAPTION || 'Healthier soil starts with practical, soil-first care.',
      slug: 'garden-tip',
      category: 'Gardening Tips',
    }
  }

  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function blogUrl(blog: BlogJson): string {
  const base = process.env.BLOG_BASE_URL || 'https://natureswaysoil.com/blog'
  const slug = blog.slug || 'garden-tip'
  return `${base.replace(/\/$/, '')}/${slug}`
}

function captionFor(blog: BlogJson): string {
  return [
    blog.title || 'Nature’s Way Soil Garden Tip',
    '',
    blog.excerpt || 'Support healthier soil and stronger plants with Nature’s Way Soil.',
    '',
    `Read more: ${blogUrl(blog)}`,
    '',
    '#NaturesWaySoil #OrganicGardening #SoilHealth #GardenTips',
  ].join('\n')
}

async function chooseVideoUrl(blog: BlogJson): Promise<string> {
  const existing = String(process.env.VIDEO_URL || '').trim()
  if (existing) return existing

  await loadSecretsToEnv(['PEXELS_API_KEY', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])

  const picked = await selectPexelsBackground({
    product: {
      title: blog.title || process.env.VIDEO_TITLE || 'organic gardening soil health',
      name: blog.title || process.env.VIDEO_TITLE || 'Nature’s Way Soil',
      details: [blog.excerpt, blog.videoPrompt, blog.category, (blog.tags || []).join(', ')].filter(Boolean).join(' '),
    },
    orientation: 'portrait',
    minDurationSeconds: Number(process.env.VIDEO_BROLL_MIN_DURATION_SECONDS || 8),
  })

  if (!picked?.url) {
    throw new Error('No VIDEO_URL provided and no Pexels video could be selected. Set PEXELS_API_KEY or VIDEO_URL.')
  }

  console.log(`Selected Pexels video: ${picked.query} (${picked.id})`)

  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    return uploadVideoToCloudinary(picked.url)
  }

  console.log('Cloudinary credentials not configured; using Pexels URL directly')
  return picked.url
}

async function main() {
  await loadSecretsToEnv([
    'FACEBOOK_PAGE_ACCESS_TOKEN',
    'FACEBOOK_PAGE_ID',
    'INSTAGRAM_ACCESS_TOKEN',
    'INSTAGRAM_USER_ID',
    'YOUTUBE_CLIENT_ID',
    'YOUTUBE_CLIENT_SECRET',
    'YOUTUBE_REFRESH_TOKEN',
    'PINTEREST_ACCESS_TOKEN',
    'PINTEREST_BOARD_ID',
    'TWITTER_BEARER_TOKEN',
  ])

  const blog = readLatestBlog()
  const caption = captionFor(blog)
  const videoUrl = await chooseVideoUrl(blog)
  const enabled = new Set(
    String(process.env.ENABLE_PLATFORMS || 'facebook')
      .toLowerCase()
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  )

  const shouldPost = (platform: string) => enabled.has(platform)
  let successCount = 0

  if (shouldPost('facebook')) {
    if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID) {
      const id = await postToFacebook(videoUrl, caption, process.env.FACEBOOK_PAGE_ACCESS_TOKEN, process.env.FACEBOOK_PAGE_ID)
      console.log('Facebook video posted:', id)
      successCount++
    } else {
      console.log('Facebook skipped - missing credentials')
    }
  }

  if (shouldPost('instagram')) {
    if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID) {
      const id = await postToInstagram(videoUrl, caption, process.env.INSTAGRAM_ACCESS_TOKEN, process.env.INSTAGRAM_USER_ID)
      console.log('Instagram video posted:', id)
      successCount++
    } else {
      console.log('Instagram skipped - missing credentials')
    }
  }

  if (shouldPost('youtube')) {
    if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN) {
      const id = await postToYouTube(videoUrl, blog.title || 'Nature’s Way Soil Garden Tip', process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET, process.env.YOUTUBE_REFRESH_TOKEN)
      console.log('YouTube video posted:', id)
      successCount++
    } else {
      console.log('YouTube skipped - missing credentials')
    }
  }

  if (shouldPost('pinterest')) {
    if (process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
      await postToPinterest(videoUrl, caption, process.env.PINTEREST_ACCESS_TOKEN, process.env.PINTEREST_BOARD_ID)
      console.log('Pinterest video posted')
      successCount++
    } else {
      console.log('Pinterest skipped - missing credentials')
    }
  }

  if (shouldPost('twitter')) {
    if (process.env.TWITTER_BEARER_TOKEN || (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET)) {
      await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN)
      console.log('Twitter/X video posted')
      successCount++
    } else {
      console.log('Twitter/X skipped - missing credentials')
    }
  }

  if (successCount === 0) {
    throw new Error('No social platform post succeeded. Check ENABLE_PLATFORMS and credentials.')
  }
}

main().catch((error: any) => {
  console.error('Social video auto posting failed:', error?.message || error)
  process.exit(1)
})
