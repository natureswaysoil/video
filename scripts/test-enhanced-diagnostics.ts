import 'dotenv/config'
import { processCsvUrl } from '../src/core'
import express from 'express'

/**
 * Test enhanced diagnostics with mock CSV data
 * Simulates various scenarios: missing jobId, already posted, not ready
 */

// Mock CSV data with various problematic scenarios
const mockCsvData = {
  // Scenario 1: All rows missing jobId
  noJobId: `Title,Description,Posted,Ready
Product A,Description A,false,true
Product B,Description B,false,true
Product C,Description C,false,true`,
  
  // Scenario 2: All rows already posted
  alreadyPosted: `ASIN,Title,Description,Posted,Ready
ABC123,Product A,Description A,true,true
DEF456,Product B,Description B,1,true
GHI789,Product C,Description C,yes,true`,
  
  // Scenario 3: All rows not ready
  notReady: `ASIN,Title,Description,Posted,Ready
ABC123,Product A,Description A,false,false
DEF456,Product B,Description B,false,no
GHI789,Product C,Description C,false,disabled`,
  
  // Scenario 4: Mixed scenarios
  mixed: `ASIN,Title,Description,Posted,Status
,Product A (no ASIN),Description A,false,true
DEF456,Product B,Description B,true,true
GHI789,Product C,Description C,false,disabled
JKL012,Product D,Description D,false,Draft`,
  
  // Scenario 5: Valid rows
  valid: `ASIN,Title,Description,Posted,Status
ABC123,Product A,Description A,false,true
DEF456,Product B,Description B,false,
GHI789,Product C,Description C,,enabled`
}

async function createMockServer(csvContent: string, port: number): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const app = express()
    
    app.get('/test.csv', (req, res) => {
      res.type('text/csv')
      res.send(csvContent)
    })
    
    const server = app.listen(port, () => {
      resolve({
        url: `http://localhost:${port}/test.csv`,
        close: () => server.close()
      })
    })
  })
}

async function testScenario(name: string, csvData: string, expectedBehavior: string, port: number) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📋 Scenario: ${name}`)
  console.log('='.repeat(60))
  console.log(`Expected: ${expectedBehavior}\n`)
  
  const { url, close } = await createMockServer(csvData, port)
  
  try {
    const result = await processCsvUrl(url)
    
    console.log('Results:')
    console.log(`  - Rows found: ${result.rows.length}`)
    console.log(`  - Skipped: ${result.skipped}`)
    
    if (result.rows.length > 0) {
      console.log('\n  Valid rows:')
      result.rows.forEach((row, idx) => {
        console.log(`    ${idx + 1}. JobId: ${row.jobId}, Title: ${row.product.title}`)
      })
    } else {
      console.log('\n  ✅ No valid rows (check logs above for enhanced diagnostics)')
      console.log('     Expected diagnostic information:')
      console.log('     - Available CSV headers')
      console.log('     - Skip reason counts (noJobId, alreadyPosted, notReady)')
      console.log('     - Sample skipped rows with reasons')
      console.log('     - Environment config hints')
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
  } finally {
    close()
  }
}

async function main() {
  console.log('🧪 Enhanced Diagnostics Test Suite')
  console.log('Testing various CSV scenarios to verify diagnostic output\n')
  
  // Temporarily set LOG_LEVEL to info to see warnings
  const originalLogLevel = process.env.LOG_LEVEL
  process.env.LOG_LEVEL = 'info'
  
  // Ensure ALWAYS_GENERATE_NEW_VIDEO is false for posted rows test
  const originalAlwaysNew = process.env.ALWAYS_GENERATE_NEW_VIDEO
  process.env.ALWAYS_GENERATE_NEW_VIDEO = 'false'
  
  try {
    await testScenario(
      'No JobId Column',
      mockCsvData.noJobId,
      'All rows skipped due to missing jobId/ASIN/SKU',
      9901
    )
    
    await testScenario(
      'All Already Posted',
      mockCsvData.alreadyPosted,
      'All rows skipped as already posted',
      9902
    )
    
    await testScenario(
      'All Not Ready',
      mockCsvData.notReady,
      'All rows skipped with explicit not-ready status',
      9903
    )
    
    await testScenario(
      'Mixed Skip Reasons',
      mockCsvData.mixed,
      'Rows skipped for different reasons - should see breakdown',
      9904
    )
    
    await testScenario(
      'Valid Rows',
      mockCsvData.valid,
      'Should process successfully',
      9905
    )
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ All test scenarios completed!')
    console.log('='.repeat(60))
    console.log('\nVerify that the diagnostic output includes:')
    console.log('  ✓ Available headers from CSV')
    console.log('  ✓ Skip reason breakdown with counts')
    console.log('  ✓ Sample skipped rows (up to 3)')
    console.log('  ✓ Environment configuration')
    console.log('  ✓ Actionable troubleshooting hints')
    
  } finally {
    // Restore original env vars
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel
    }
    if (originalAlwaysNew !== undefined) {
      process.env.ALWAYS_GENERATE_NEW_VIDEO = originalAlwaysNew
    }
  }
}

main().catch(error => {
  console.error('\n❌ Test suite failed:', error)
  process.exit(1)
})
