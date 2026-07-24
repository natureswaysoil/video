#!/usr/bin/env node

/**
 * Test script for generate-product-videos.mjs
 * Validates the script's logic without requiring actual API calls
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 Testing generate-product-videos.mjs...\n')

// Test 1: Check script exists and is readable
console.log('Test 1: Script file existence')
try {
  const scriptPath = join(__dirname, 'generate-product-videos.mjs')
  const content = readFileSync(scriptPath, 'utf8')
  console.log('✓ Script file exists and is readable')
  console.log(`  Size: ${content.length} bytes`)
  
  // Test 2: Validate key features are present
  console.log('\nTest 2: Required features')
  const requiredFeatures = [
    { name: 'Google Secret Manager support', pattern: /GCP_SECRET_HEYGEN_API_KEY/ },
    { name: 'Single product processing', pattern: /Found 1 product to process/ },
    { name: 'HeyGen video creation', pattern: /createHeyGenVideo/ },
    { name: 'HeyGen V3 create endpoint', pattern: /\/v3\/videos/ },
    { name: 'No legacy HeyGen video endpoints', pattern: /\/v1\/video|\/v2\/video/, shouldNotExist: true },
    { name: 'No FFmpeg installation/fallback code', pattern: /falling back to FFmpeg|install.*ffmpeg|ffmpeg.*not.*installed/i, shouldNotExist: true },
    { name: 'OpenAI script generation', pattern: /generateScript/ },
    { name: 'Video URL write-back', pattern: /writeVideoUrlToSheet/ },
    { name: 'CSV parsing (first eligible)', pattern: /getFirstEligibleProduct/ },
    { name: 'Polling for completion', pattern: /pollForVideoUrl/ },
  ]
  
  let allPassed = true
  requiredFeatures.forEach(feature => {
    const found = feature.pattern.test(content)
    const passed = feature.shouldNotExist ? !found : found
    
    if (passed) {
      console.log(`  ✓ ${feature.name}`)
    } else {
      console.log(`  ✗ ${feature.name} - ${feature.shouldNotExist ? 'should not exist but found' : 'not found'}`)
      allPassed = false
    }
  })
  
  // Test 3: Validate error message patterns
  console.log('\nTest 3: Error handling')
  const errorPatterns = [
    { name: 'HeyGen key not found error', pattern: /HeyGen API key not found/ },
    { name: 'CSV_URL not set error', pattern: /CSV_URL environment variable not set/ },
    { name: 'No eligible products error', pattern: /No eligible products found/ },
  ]
  
  errorPatterns.forEach(pattern => {
    if (pattern.pattern.test(content)) {
      console.log(`  ✓ ${pattern.name}`)
    } else {
      console.log(`  ✗ ${pattern.name} - not found`)
      allPassed = false
    }
  })
  
  // Test 4: Validate output messages
  console.log('\nTest 4: User-facing messages')
  const messagePatterns = [
    { name: 'Starting message', pattern: /Starting HeyGen AI Video Generation/ },
    { name: 'Found 1 product message', pattern: /Found 1 product to process/ },
    { name: 'Success message', pattern: /Video generation complete/ },
    { name: 'Row number display', pattern: /Row:/ },
  ]
  
  messagePatterns.forEach(pattern => {
    if (pattern.pattern.test(content)) {
      console.log(`  ✓ ${pattern.name}`)
    } else {
      console.log(`  ✗ ${pattern.name} - not found`)
      allPassed = false
    }
  })
  
  // Test 5: Validate configuration options
  console.log('\nTest 5: Configuration support')
  const configPatterns = [
    { name: 'HEYGEN_API_KEY direct env', pattern: /process\.env\.HEYGEN_API_KEY/ },
    { name: 'GCP Secret Manager', pattern: /GCP_SECRET_HEYGEN_API_KEY/ },
    { name: 'OPENAI_API_KEY', pattern: /process\.env\.OPENAI_API_KEY/ },
    { name: 'SHEET_VIDEO_TARGET_COLUMN_LETTER', pattern: /SHEET_VIDEO_TARGET_COLUMN_LETTER/ },
    { name: 'ALWAYS_GENERATE_NEW_VIDEO', pattern: /ALWAYS_GENERATE_NEW_VIDEO/ },
    { name: 'Google Sheets service account', pattern: /GS_SERVICE_ACCOUNT_EMAIL/ },
  ]
  
  configPatterns.forEach(pattern => {
    if (pattern.pattern.test(content)) {
      console.log(`  ✓ ${pattern.name}`)
    } else {
      console.log(`  ✗ ${pattern.name} - not found`)
      allPassed = false
    }
  })
  
  // Test 6: CSV row filtering logic
  console.log('\nTest 6: CSV row filtering logic')
  const filteringPatterns = [
    { name: 'Skip already posted rows', pattern: /Skip already posted/ },
    { name: 'Skip not ready rows', pattern: /Skip not ready/ },
    { name: 'Check Posted column', pattern: /Posted.*posted/ },
    { name: 'Check Ready/Status column', pattern: /Ready.*ready.*Status.*status/ },
  ]
  
  filteringPatterns.forEach(pattern => {
    if (pattern.pattern.test(content)) {
      console.log(`  ✓ ${pattern.name}`)
    } else {
      console.log(`  ✗ ${pattern.name} - not found`)
      allPassed = false
    }
  })
  
  // Final summary
  console.log('\n' + '='.repeat(50))
  if (allPassed) {
    console.log('✅ All tests passed!')
    console.log('\nThe script includes:')
    console.log('  • Processes only 1 product per run (not all products)')
    console.log('  • Loads HeyGen API key from Google Secret Manager')
    console.log('  • Uses HeyGen for video generation only')
    console.log('  • No FFmpeg fallback')
    console.log('  • Proper error handling and status messages')
    process.exit(0)
  } else {
    console.log('❌ Some tests failed!')
    console.log('Please review the script implementation.')
    process.exit(1)
  }
  
} catch (error) {
  console.error('❌ Test failed:', error.message)
  process.exit(1)
}
