import 'dotenv/config'
import { postToInstagram } from '../src/instagram'
import { postToTwitter } from '../src/twitter'
import { postToPinterest } from '../src/pinterest'
import { postToYouTube } from '../src/youtube'

/**
 * Test social media posting to all platforms:
 * 1. Validates credentials for each platform
 * 2. Posts a test video to configured platforms
 * 3. Reports success/failure for each platform
 * 
 * NOTE: This will post to actual social media accounts!
 * Use with caution and configure TEST_VIDEO_URL to a real video.
 */

async function main() {
  console.log('📱 Testing Social Media Posting (All Platforms)...\n')
  console.log('⚠️  WARNING: This will post to actual social media accounts!')
  console.log()
  
  // Use environment variable or default test video
  const testVideoUrl = process.env.TEST_VIDEO_URL || 
    'https://d1q70pf5vjeyhc.cloudfront.net/predictions/49f692482b6a461c9aa1eac28ab8be21/1.mp4'
  
  const testCaption = process.env.TEST_CAPTION ||
    '🌱 Transform your garden naturally! Premium organic soil amendments for healthier plants. #OrganicGardening #SoilHealth #NaturesWaySoil'
  
  console.log('Test video URL:', testVideoUrl)
  console.log('Test caption:', testCaption)
  console.log()
  
  // Check which platforms are configured
  const platforms = {
    instagram: {
      enabled: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID),
      name: 'Instagram'
    },
    twitter: {
      enabled: Boolean(process.env.TWITTER_BEARER_TOKEN || 
        (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && 
         process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET)),
      name: 'Twitter/X'
    },
    pinterest: {
      enabled: Boolean(process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID),
      name: 'Pinterest'
    },
    youtube: {
      enabled: Boolean(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN),
      name: 'YouTube'
    }
  }
  
  console.log('Platform Configuration:')
  Object.entries(platforms).forEach(([key, { name, enabled }]) => {
    console.log(`  ${name}:`, enabled ? '✓ ENABLED' : '✗ DISABLED (missing credentials)')
  })
  console.log()
  
  const enabledCount = Object.values(platforms).filter(p => p.enabled).length
  if (enabledCount === 0) {
    console.error('❌ No platforms are configured!')
    console.error('Configure at least one platform to test posting.')
    process.exit(1)
  }
  
  console.log(`Testing ${enabledCount} enabled platform(s)...\n`)
  
  // Results tracking
  const results: Array<{ platform: string; success: boolean; result?: any; error?: string }> = []
  
  // Test Instagram
  if (platforms.instagram.enabled) {
    console.log('--- Testing Instagram ---')
    try {
      const result = await postToInstagram(
        testVideoUrl,
        testCaption,
        process.env.INSTAGRAM_ACCESS_TOKEN!,
        process.env.INSTAGRAM_IG_ID!
      )
      console.log('✓ Instagram post successful!')
      console.log('  Media ID:', result)
      console.log('  View at: https://www.instagram.com/')
      results.push({ platform: 'Instagram', success: true, result })
    } catch (error: any) {
      console.error('✗ Instagram post failed!')
      console.error('  Error:', error?.message || error)
      if (error?.response?.data) {
        console.error('  API Response:', JSON.stringify(error.response.data, null, 2))
      }
      results.push({ platform: 'Instagram', success: false, error: error?.message || String(error) })
    }
    console.log()
  }
  
  // Test Twitter
  if (platforms.twitter.enabled) {
    console.log('--- Testing Twitter/X ---')
    try {
      const hasUploadCreds = Boolean(
        process.env.TWITTER_API_KEY && 
        process.env.TWITTER_API_SECRET && 
        process.env.TWITTER_ACCESS_TOKEN && 
        process.env.TWITTER_ACCESS_SECRET
      )
      
      if (hasUploadCreds) {
        console.log('  Using OAuth 1.0a (video upload)')
      } else {
        console.log('  Using Bearer token (text with link)')
      }
      
      await postToTwitter(
        testVideoUrl,
        testCaption,
        process.env.TWITTER_BEARER_TOKEN
      )
      console.log('✓ Twitter post successful!')
      console.log('  View at: https://twitter.com/')
      results.push({ platform: 'Twitter', success: true })
    } catch (error: any) {
      console.error('✗ Twitter post failed!')
      console.error('  Error:', error?.message || error)
      results.push({ platform: 'Twitter', success: false, error: error?.message || String(error) })
    }
    console.log()
  }
  
  // Test Pinterest
  if (platforms.pinterest.enabled) {
    console.log('--- Testing Pinterest ---')
    try {
      await postToPinterest(
        testVideoUrl,
        testCaption,
        process.env.PINTEREST_ACCESS_TOKEN!,
        process.env.PINTEREST_BOARD_ID!
      )
      console.log('✓ Pinterest post successful!')
      console.log('  View at: https://www.pinterest.com/')
      results.push({ platform: 'Pinterest', success: true })
    } catch (error: any) {
      console.error('✗ Pinterest post failed!')
      console.error('  Error:', error?.message || error)
      if (error?.response?.data) {
        console.error('  API Response:', JSON.stringify(error.response.data, null, 2))
      }
      results.push({ platform: 'Pinterest', success: false, error: error?.message || String(error) })
    }
    console.log()
  }
  
  // Test YouTube
  if (platforms.youtube.enabled) {
    console.log('--- Testing YouTube ---')
    console.log('  This may take a few minutes to upload...')
    try {
      const privacyStatus = (process.env.YT_PRIVACY_STATUS as any) || 'unlisted'
      const videoId = await postToYouTube(
        testVideoUrl,
        testCaption,
        process.env.YT_CLIENT_ID!,
        process.env.YT_CLIENT_SECRET!,
        process.env.YT_REFRESH_TOKEN!,
        privacyStatus
      )
      console.log('✓ YouTube upload successful!')
      console.log('  Video ID:', videoId)
      console.log('  Watch at: https://www.youtube.com/watch?v=' + videoId)
      console.log('  Privacy:', privacyStatus)
      results.push({ platform: 'YouTube', success: true, result: videoId })
    } catch (error: any) {
      console.error('✗ YouTube upload failed!')
      console.error('  Error:', error?.message || error)
      results.push({ platform: 'YouTube', success: false, error: error?.message || String(error) })
    }
    console.log()
  }
  
  // Summary
  console.log('\n📊 Test Summary:')
  console.log('  Platforms tested:', results.length)
  console.log('  Successful posts:', results.filter(r => r.success).length)
  console.log('  Failed posts:', results.filter(r => !r.success).length)
  console.log()
  
  results.forEach(r => {
    const status = r.success ? '✓' : '✗'
    console.log(`  ${status} ${r.platform}`)
    if (!r.success && r.error) {
      console.log(`    Error: ${r.error}`)
    }
  })
  
  const allSuccess = results.every(r => r.success)
  if (allSuccess) {
    console.log('\n✅ All platform posting tests passed!')
  } else {
    console.log('\n⚠️  Some platforms failed. See details above.')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
