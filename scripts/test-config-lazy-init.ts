/**
 * Test that simulates the production error scenario:
 * - processCsvUrl is called without explicitly calling validateConfig first
 * - This should now work due to lazy initialization in getConfig()
 */

// IMPORTANT: Do NOT import dotenv/config at the top
// We want to simulate a fresh module state

async function main() {
  console.log('🧪 Testing Lazy Config Initialization in processCsvUrl...\n')
  
  // Load environment variables dynamically
  await import('dotenv/config')
  
  // Create a mock CSV URL for testing
  const mockCsvUrl = 'https://example.com/test.csv'
  process.env.CSV_URL = mockCsvUrl
  
  try {
    console.log('Test: Calling processCsvUrl WITHOUT calling validateConfig first')
    console.log('(This would have failed with "Config not validated yet" error before the fix)\n')
    
    // Import core module - this will load config-validator as a dependency
    const { processCsvUrl } = await import('../src/core')
    
    // This call should now work because getConfig() auto-validates
    // Note: This will fail to fetch the URL, but that's expected
    // We're just testing that the config validation doesn't throw an error
    try {
      await processCsvUrl(mockCsvUrl)
    } catch (error: any) {
      // We expect a network error, not a config validation error
      if (error.message?.includes('Config not validated')) {
        throw new Error('❌ FAIL: Config validation error occurred - fix did not work!')
      }
      
      // Network/CSV errors are expected and acceptable
      const isNetworkError = error.code === 'ENOTFOUND' || 
                            error.message?.includes('CSV processing failed') ||
                            error.message?.includes('getaddrinfo')
      
      if (isNetworkError) {
        console.log('✅ Got expected network/CSV error (not a config error)')
        console.log(`   Error type: ${error.constructor.name}`)
        console.log(`   Message: ${error.message?.substring(0, 100)}...`)
        console.log('\n✅ SUCCESS: Config was auto-validated, no "Config not validated" error!')
        return
      }
      
      // Any other error - re-throw to see what it is
      throw error
    }
    
    // If we get here without error, that's also success
    console.log('✅ SUCCESS: processCsvUrl completed without config validation error')
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message || String(error))
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
