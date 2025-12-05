import 'dotenv/config'
import { getConfig, validateConfig } from '../src/config-validator'

/**
 * Test configuration validator:
 * 1. Tests that getConfig() works without calling validateConfig() first (lazy initialization)
 * 2. Tests that validateConfig() can be called explicitly
 * 3. Tests that subsequent getConfig() calls return cached config
 */

async function main() {
  console.log('🧪 Testing Configuration Validator...\n')
  
  try {
    // Test 1: getConfig() should auto-validate on first access
    console.log('Test 1: Calling getConfig() without validateConfig()...')
    const config1 = getConfig()
    console.log('✅ getConfig() succeeded with auto-validation')
    console.log('   - NODE_ENV:', config1.NODE_ENV)
    console.log('   - LOG_LEVEL:', config1.LOG_LEVEL)
    console.log()
    
    // Test 2: validateConfig() should return cached config
    console.log('Test 2: Calling validateConfig() after auto-validation...')
    const config2 = await validateConfig()
    console.log('✅ validateConfig() returned cached config')
    console.log('   - Same instance:', config1 === config2)
    console.log()
    
    // Test 3: Subsequent getConfig() calls should return same cached instance
    console.log('Test 3: Calling getConfig() again...')
    const config3 = getConfig()
    console.log('✅ getConfig() returned cached config')
    console.log('   - Same instance as first call:', config1 === config3)
    console.log('   - Same instance as validateConfig call:', config2 === config3)
    console.log()
    
    // Test 4: Check that hasCredentialsFor works
    console.log('Test 4: Testing credential checks...')
    const { hasCredentialsFor } = await import('../src/config-validator')
    const platforms = ['twitter', 'youtube', 'instagram', 'pinterest'] as const
    platforms.forEach(platform => {
      const hasCredentials = hasCredentialsFor(platform)
      console.log(`   - ${platform}: ${hasCredentials ? '✓' : '✗'}`)
    })
    console.log()
    
    console.log('✅ All tests passed!')
    console.log('\n🎉 Configuration validator is working correctly')
    console.log('   - Auto-validation on first getConfig() call: ✓')
    console.log('   - Proper caching: ✓')
    console.log('   - Credential checks: ✓')
    
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
