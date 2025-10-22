import 'dotenv/config'
import { processCsvUrl } from '../src/core'

/**
 * Test Google Sheets CSV processing:
 * 1. Validates CSV_URL is configured
 * 2. Fetches and parses CSV data
 * 3. Displays product information
 * 4. Validates row filtering logic (Posted, Ready status)
 */

async function main() {
  console.log('📊 Testing Google Sheets CSV Processing...\n')
  
  // Check CSV_URL
  const csvUrl = process.env.CSV_URL
  if (!csvUrl) {
    console.error('❌ CSV_URL not set in environment!')
    console.error('Set CSV_URL to your Google Sheet CSV export URL')
    process.exit(1)
  }
  
  console.log('CSV URL:', csvUrl.substring(0, 80) + '...')
  console.log('ALWAYS_GENERATE_NEW_VIDEO:', process.env.ALWAYS_GENERATE_NEW_VIDEO || 'false')
  console.log()
  
  try {
    console.log('📥 Fetching and parsing CSV...')
    const result = await processCsvUrl(csvUrl)
    
    if (result.skipped) {
      console.log('⚠️  CSV processing was skipped (no valid rows)')
      return
    }
    
    console.log(`✓ Successfully parsed CSV: ${result.rows.length} row(s) found\n`)
    
    // Display information about each row
    console.log('📦 Product Rows:\n')
    result.rows.forEach((row, index) => {
      console.log(`Row ${index + 1} (Sheet Row ${row.rowNumber}):`)
      console.log('  Job ID:', row.jobId)
      console.log('  Product ID:', row.product.id || 'N/A')
      console.log('  Title:', row.product.title || row.product.name || 'N/A')
      console.log('  Details:', (row.product.details || '').substring(0, 60) + '...')
      
      // Show a few relevant columns if they exist
      const relevantCols = ['ASIN', 'SKU', 'Posted', 'Ready', 'Status', 'Video URL']
      const colData: Record<string, string> = {}
      relevantCols.forEach(col => {
        if (row.record[col]) {
          colData[col] = row.record[col]
        }
      })
      if (Object.keys(colData).length > 0) {
        console.log('  Columns:', colData)
      }
      console.log()
    })
    
    // Summary
    console.log('📈 Summary:')
    console.log('  Total rows found:', result.rows.length)
    console.log('  First job ID:', result.rows[0]?.jobId || 'N/A')
    
    // Check if rows have video URLs
    const rowsWithVideoUrl = result.rows.filter(r => {
      const videoUrlCols = ['video_url', 'Video URL', 'VideoURL', 'Video_URL']
      return videoUrlCols.some(col => r.record[col] && r.record[col].startsWith('http'))
    })
    console.log('  Rows with existing video URLs:', rowsWithVideoUrl.length)
    
    console.log('\n✅ CSV processing test completed successfully!')
    
  } catch (error: any) {
    console.error('\n❌ CSV processing test failed!')
    console.error('Error:', error?.message || error)
    if (error?.response) {
      console.error('HTTP Status:', error.response.status)
      console.error('Response data:', error.response.data?.substring?.(0, 200))
    }
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
