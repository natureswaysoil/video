import 'dotenv/config'
import { processCsvUrl } from '../src/core'

/**
 * Test enhanced diagnostic logging when no valid products are found
 * This simulates various scenarios that lead to "No valid products found"
 */

async function testDiagnostics() {
  console.log('🧪 Testing Enhanced CSV Diagnostics\n')
  
  // Test with various CSV URLs to verify diagnostic output
  const testCases = [
    {
      name: 'Missing CSV_URL',
      setup: () => {
        delete process.env.CSV_URL
      },
      expectError: true
    },
    {
      name: 'Configured CSV_URL',
      setup: () => {
        // Keep existing CSV_URL
      },
      expectError: false
    }
  ]
  
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`)
    console.log('─'.repeat(50))
    
    testCase.setup()
    
    const csvUrl = process.env.CSV_URL
    
    if (!csvUrl) {
      console.log('❌ CSV_URL not configured - skipping this test')
      console.log('   Set CSV_URL in .env to test actual CSV processing')
      continue
    }
    
    try {
      console.log('Fetching CSV from:', csvUrl.substring(0, 80) + '...')
      console.log('Environment:')
      console.log('  ALWAYS_GENERATE_NEW_VIDEO:', process.env.ALWAYS_GENERATE_NEW_VIDEO || 'false')
      console.log('  CSV_COL_JOB_ID:', process.env.CSV_COL_JOB_ID || '(using defaults)')
      console.log('  CSV_COL_POSTED:', process.env.CSV_COL_POSTED || '(using defaults)')
      console.log('  CSV_COL_READY:', process.env.CSV_COL_READY || '(using defaults)')
      console.log('  LOG_LEVEL:', process.env.LOG_LEVEL || 'info')
      console.log()
      
      const result = await processCsvUrl(csvUrl)
      
      console.log('\n📊 Results:')
      console.log('  Rows found:', result.rows.length)
      console.log('  Skipped:', result.skipped)
      
      if (result.rows.length === 0) {
        console.log('\n✅ No products found - check logs above for enhanced diagnostics')
        console.log('   Expected to see:')
        console.log('   - Available CSV headers')
        console.log('   - Skip reason breakdown (noJobId, alreadyPosted, notReady)')
        console.log('   - Sample skipped rows with reasons')
        console.log('   - Environment configuration')
        console.log('   - Troubleshooting hints')
      } else {
        console.log('\n✅ Products found:')
        result.rows.slice(0, 3).forEach((row, idx) => {
          console.log(`   ${idx + 1}. JobId: ${row.jobId}, Title: ${row.product.title || row.product.name || 'N/A'}`)
        })
        if (result.rows.length > 3) {
          console.log(`   ... and ${result.rows.length - 3} more`)
        }
      }
      
    } catch (error: any) {
      if (testCase.expectError) {
        console.log('✅ Expected error:', error.message)
      } else {
        console.error('❌ Unexpected error:', error.message)
        console.error('   Details:', error)
        process.exit(1)
      }
    }
  }
  
  console.log('\n' + '='.repeat(50))
  console.log('✅ Diagnostic test completed')
  console.log('\nTo see enhanced diagnostics in action:')
  console.log('  1. Ensure CSV_URL points to a sheet with various row states')
  console.log('  2. Set LOG_LEVEL=debug for row-by-row details')
  console.log('  3. Check that diagnostic info includes:')
  console.log('     - Available headers from CSV')
  console.log('     - Breakdown of skip reasons')
  console.log('     - Sample skipped rows')
  console.log('     - Configuration troubleshooting hints')
}

testDiagnostics().catch(error => {
  console.error('\n❌ Test failed with error:', error)
  process.exit(1)
})
