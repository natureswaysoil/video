import 'dotenv/config'
import { createClientWithSecrets } from '../src/heygen'
import { mapProductToHeyGenPayload } from '../src/heygen-adapter'

/**
 * Test HeyGen integration:
 * 1. Creates a HeyGen client with credentials
 * 2. Maps a sample product to HeyGen payload
 * 3. Creates a video generation job
 * 4. Polls for completion (with configurable timeout)
 * 5. Verifies video URL is returned
 */

async function main() {
  console.log('🎬 Testing HeyGen Integration...\n')
  
  // Check credentials
  const hasDirectKey = Boolean(process.env.HEYGEN_API_KEY)
  const hasGcpSecret = Boolean(process.env.GCP_SECRET_HEYGEN_API_KEY)
  
  console.log('Credentials check:')
  console.log('  HEYGEN_API_KEY:', hasDirectKey ? '✓ SET' : '✗ NOT SET')
  console.log('  GCP_SECRET_HEYGEN_API_KEY:', hasGcpSecret ? '✓ SET' : '✗ NOT SET')
  
  if (!hasDirectKey && !hasGcpSecret) {
    console.error('\n❌ No HeyGen credentials found!')
    console.error('Set either HEYGEN_API_KEY or GCP_SECRET_HEYGEN_API_KEY')
    process.exit(1)
  }
  
  console.log('\n📦 Creating sample product for testing...')
  
  // Create a sample product row
  const sampleProduct = {
    Title: 'Nature\'s Way Kelp Meal - Organic Seaweed Fertilizer',
    Description: 'Premium Norwegian kelp meal for gardens. Rich in natural minerals and growth hormones. Perfect for all plants.',
    ASIN: 'TEST-KELP-001',
    'Short_Description': 'Organic kelp fertilizer for healthier plants'
  }
  
  console.log('Sample product:', {
    title: sampleProduct.Title,
    asin: sampleProduct.ASIN
  })
  
  // Step 1: Map product to HeyGen payload
  console.log('\n🗺️  Mapping product to HeyGen payload...')
  const mapping = mapProductToHeyGenPayload(sampleProduct)
  console.log('Mapping result:')
  console.log('  Avatar:', mapping.avatar)
  console.log('  Voice:', mapping.voice)
  console.log('  Length:', mapping.lengthSeconds, 'seconds')
  console.log('  Reason:', mapping.reason)
  
  // Use a shorter, test-friendly script
  const testScript = process.env.TEST_SCRIPT || 
    'Transform your garden naturally with premium organic kelp meal. Rich in minerals and growth hormones for healthier, more vibrant plants.'
  
  console.log('\n📝 Test script:', testScript)
  
  // Step 2: Create HeyGen client
  console.log('\n🔌 Creating HeyGen client...')
  try {
    const client = await createClientWithSecrets()
    console.log('✓ HeyGen client created successfully')
    
    // Step 3: Create video job
    console.log('\n🎥 Creating video generation job...')
    const payload = {
      ...mapping.payload,
      script: testScript,
      title: `Test Video - ${sampleProduct.ASIN}`,
      meta: { 
        test: true,
        asin: sampleProduct.ASIN,
        timestamp: new Date().toISOString()
      }
    }
    
    const jobId = await client.createVideoJob(payload)
    console.log('✓ Video job created!')
    console.log('  Job ID:', jobId)
    
    // Step 4: Poll for completion
    const timeoutMinutes = Number(process.env.TEST_TIMEOUT_MINUTES || '25')
    const timeoutMs = timeoutMinutes * 60_000
    const pollIntervalMs = 15_000 // Check every 15 seconds
    
    console.log(`\n⏳ Polling for video completion (timeout: ${timeoutMinutes} minutes)...`)
    console.log('  Check interval:', pollIntervalMs / 1000, 'seconds')
    console.log('  This may take 10-20 minutes...\n')
    
    const videoUrl = await client.pollJobForVideoUrl(jobId, {
      timeoutMs,
      intervalMs: pollIntervalMs
    })
    
    console.log('\n✅ SUCCESS! Video generation completed!')
    console.log('  Video URL:', videoUrl)
    console.log('\n📊 Test Summary:')
    console.log('  ✓ HeyGen client creation')
    console.log('  ✓ Product mapping')
    console.log('  ✓ Video job creation')
    console.log('  ✓ Video generation and polling')
    console.log('  ✓ Video URL retrieval')
    console.log('\n🎉 All HeyGen integration tests passed!')
    
  } catch (error: any) {
    console.error('\n❌ HeyGen integration test failed!')
    console.error('Error:', error?.message || error)
    if (error?.response?.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2))
    }
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
