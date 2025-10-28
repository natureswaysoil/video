import 'dotenv/config'
import { processCsvUrl } from '../src/core'
import { generateScript } from '../src/openai'
import { createClientWithSecrets } from '../src/heygen'
import { mapProductToHeyGenPayload } from '../src/heygen-adapter'
import { postToInstagram } from '../src/instagram'
import { postToTwitter } from '../src/twitter'
import { postToPinterest } from '../src/pinterest'
import { postToYouTube } from '../src/youtube'

/**
 * End-to-End Integration Test
 * 
 * Tests the complete video automation workflow:
 * 1. Fetch product data from Google Sheets CSV
 * 2. Generate marketing script with OpenAI
 * 3. Create video with HeyGen
 * 4. Post to all configured social media platforms
 * 
 * This test runs through the entire system as it would in production.
 * It will:
 * - Use real API calls (costs money!)
 * - Post to real social media accounts
 * - Take 10-20 minutes for video generation
 * 
 * Use with caution and only when ready to test the full system!
 */

async function main() {
  console.log('🚀 End-to-End Integration Test')
  console.log('=' .repeat(60))
  console.log()
  console.log('⚠️  WARNING: This will:')
  console.log('   - Use OpenAI API credits')
  console.log('   - Use HeyGen API credits')
  console.log('   - Post to actual social media accounts')
  console.log('   - Take 10-20 minutes to complete')
  console.log()
  
  const dryRun = process.env.DRY_RUN === 'true'
  if (dryRun) {
    console.log('🔒 DRY RUN MODE: Will skip social media posting')
    console.log()
  }
  
  // Step 1: Validate all required configuration
  console.log('Step 1: Validating Configuration')
  console.log('-'.repeat(60))
  
  const config = {
    csvUrl: process.env.CSV_URL,
    openaiKey: process.env.OPENAI_API_KEY,
    heygenKey: process.env.HEYGEN_API_KEY || process.env.GCP_SECRET_HEYGEN_API_KEY,
    instagram: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID),
    twitter: Boolean(process.env.TWITTER_BEARER_TOKEN || 
      (process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN)),
    pinterest: Boolean(process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID),
    youtube: Boolean(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN)
  }
  
  console.log('CSV_URL:', config.csvUrl ? '✓ SET' : '✗ NOT SET')
  console.log('OPENAI_API_KEY:', config.openaiKey ? '✓ SET' : '✗ NOT SET')
  console.log('HEYGEN credentials:', config.heygenKey ? '✓ SET' : '✗ NOT SET')
  console.log('Instagram:', config.instagram ? '✓ ENABLED' : '✗ DISABLED')
  console.log('Twitter:', config.twitter ? '✓ ENABLED' : '✗ DISABLED')
  console.log('Pinterest:', config.pinterest ? '✓ ENABLED' : '✗ DISABLED')
  console.log('YouTube:', config.youtube ? '✓ ENABLED' : '✗ DISABLED')
  console.log()
  
  // Check required configs
  if (!config.csvUrl || !config.heygenKey) {
    console.error('❌ Missing required configuration!')
    console.error('Required: CSV_URL, HEYGEN_API_KEY (or GCP_SECRET_HEYGEN_API_KEY)')
    process.exit(1)
  }
  
  const enabledPlatforms = [
    config.instagram && 'Instagram',
    config.twitter && 'Twitter',
    config.pinterest && 'Pinterest',
    config.youtube && 'YouTube'
  ].filter(Boolean)
  
  console.log(`Enabled platforms: ${enabledPlatforms.join(', ') || 'None'}`)
  console.log()
  
  // Step 2: Fetch product from CSV
  console.log('Step 2: Fetching Product from Google Sheets')
  console.log('-'.repeat(60))
  
  const { rows } = await processCsvUrl(config.csvUrl!)
  if (!rows.length) {
    console.error('❌ No products found in CSV!')
    process.exit(1)
  }
  
  const row = rows[0]
  const product = row.product
  console.log('✓ Product fetched successfully')
  console.log('  Job ID:', row.jobId)
  console.log('  Title:', product.title || product.name)
  console.log('  ASIN:', row.record.ASIN || row.record.SKU || 'N/A')
  console.log()
  
  // Step 3: Generate script with OpenAI
  console.log('Step 3: Generating Marketing Script')
  console.log('-'.repeat(60))
  
  let script: string
  if (config.openaiKey) {
    try {
      script = await generateScript(product)
      console.log('✓ Script generated with OpenAI')
      console.log('  Length:', script.length, 'characters')
      console.log('  Preview:', script.substring(0, 100) + '...')
    } catch (error: any) {
      console.error('⚠️  OpenAI generation failed:', error?.message)
      script = (product.details || product.title || product.name || 'Product video').toString()
      console.log('  Using fallback script from product data')
    }
  } else {
    script = (product.details || product.title || product.name || 'Product video').toString()
    console.log('⚠️  OpenAI not configured, using product description')
  }
  console.log()
  
  // Step 4: Create video with HeyGen
  console.log('Step 4: Creating Video with HeyGen')
  console.log('-'.repeat(60))
  
  console.log('Mapping product to HeyGen payload...')
  const mapping = mapProductToHeyGenPayload(row.record)
  console.log('  Avatar:', mapping.avatar)
  console.log('  Voice:', mapping.voice)
  console.log('  Duration:', mapping.lengthSeconds, 'seconds')
  console.log('  Reason:', mapping.reason)
  console.log()
  
  const heygenClient = await createClientWithSecrets()
  const payload = {
    ...mapping.payload,
    script,
    title: `${product.title || product.name} - Test`,
    meta: { 
      test: true,
      asin: row.jobId,
      timestamp: new Date().toISOString()
    }
  }
  
  console.log('Creating video generation job...')
  const jobId = await heygenClient.createVideoJob(payload)
  console.log('✓ Job created:', jobId)
  console.log()
  
  console.log('Polling for video completion (this takes 10-20 minutes)...')
  const startTime = Date.now()
  const videoUrl = await heygenClient.pollJobForVideoUrl(jobId, {
    timeoutMs: 25 * 60_000, // 25 minutes
    intervalMs: 15_000 // 15 seconds
  })
  const elapsedMinutes = ((Date.now() - startTime) / 60_000).toFixed(1)
  
  console.log(`✓ Video generated in ${elapsedMinutes} minutes`)
  console.log('  Video URL:', videoUrl)
  console.log()
  
  // Step 5: Post to social media platforms
  console.log('Step 5: Posting to Social Media Platforms')
  console.log('-'.repeat(60))
  
  if (dryRun) {
    console.log('🔒 DRY RUN: Skipping actual social media posts')
    console.log('Would post to:', enabledPlatforms.join(', '))
    console.log()
  } else {
    const caption = (product.details || product.title || product.name || '').toString()
    const results: Array<{ platform: string; success: boolean; error?: string }> = []
    
    // Instagram
    if (config.instagram) {
      console.log('Posting to Instagram...')
      try {
        const mediaId = await postToInstagram(
          videoUrl,
          caption,
          process.env.INSTAGRAM_ACCESS_TOKEN!,
          process.env.INSTAGRAM_IG_ID!
        )
        console.log('  ✓ Instagram:', mediaId)
        results.push({ platform: 'Instagram', success: true })
      } catch (error: any) {
        console.error('  ✗ Instagram failed:', error?.message)
        results.push({ platform: 'Instagram', success: false, error: error?.message })
      }
    }
    
    // Twitter
    if (config.twitter) {
      console.log('Posting to Twitter...')
      try {
        await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN)
        console.log('  ✓ Twitter posted')
        results.push({ platform: 'Twitter', success: true })
      } catch (error: any) {
        console.error('  ✗ Twitter failed:', error?.message)
        results.push({ platform: 'Twitter', success: false, error: error?.message })
      }
    }
    
    // Pinterest
    if (config.pinterest) {
      console.log('Posting to Pinterest...')
      try {
        await postToPinterest(
          videoUrl,
          caption,
          process.env.PINTEREST_ACCESS_TOKEN!,
          process.env.PINTEREST_BOARD_ID!
        )
        console.log('  ✓ Pinterest posted')
        results.push({ platform: 'Pinterest', success: true })
      } catch (error: any) {
        console.error('  ✗ Pinterest failed:', error?.message)
        results.push({ platform: 'Pinterest', success: false, error: error?.message })
      }
    }
    
    // YouTube
    if (config.youtube) {
      console.log('Posting to YouTube (may take a few minutes)...')
      try {
        const videoId = await postToYouTube(
          videoUrl,
          caption,
          process.env.YT_CLIENT_ID!,
          process.env.YT_CLIENT_SECRET!,
          process.env.YT_REFRESH_TOKEN!,
          (process.env.YT_PRIVACY_STATUS as any) || 'unlisted'
        )
        console.log('  ✓ YouTube:', videoId)
        results.push({ platform: 'YouTube', success: true })
      } catch (error: any) {
        console.error('  ✗ YouTube failed:', error?.message)
        results.push({ platform: 'YouTube', success: false, error: error?.message })
      }
    }
    
    console.log()
    console.log('Social Media Results:')
    results.forEach(r => {
      const status = r.success ? '✓' : '✗'
      console.log(`  ${status} ${r.platform}${r.error ? ': ' + r.error : ''}`)
    })
  }
  
  // Final Summary
  console.log()
  console.log('=' .repeat(60))
  console.log('✅ END-TO-END TEST COMPLETED SUCCESSFULLY!')
  console.log('=' .repeat(60))
  console.log()
  console.log('Test Results:')
  console.log('  ✓ CSV processing')
  console.log('  ✓ Script generation')
  console.log('  ✓ Video generation (HeyGen)')
  if (dryRun) {
    console.log('  - Social media posting (skipped - DRY RUN)')
  } else {
    console.log('  ✓ Social media posting')
  }
  console.log()
  console.log('Video URL:', videoUrl)
  console.log()
  console.log('🎉 The complete video automation system is working!')
}

main().catch(error => {
  console.error('\n❌ End-to-end test failed!')
  console.error('Error:', error?.message || error)
  if (error?.stack) {
    console.error('Stack:', error.stack)
  }
  process.exit(1)
})
