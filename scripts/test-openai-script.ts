import 'dotenv/config'
import { extractSpokenVoiceover, generateScript, looksLikeMetaNarration } from '../src/openai'
import type { Product } from '../src/core'

/**
 * Test OpenAI script generation:
 * 1. Validates OpenAI API key
 * 2. Generates marketing script from sample product
 * 3. Validates script length and content
 */

async function main() {
  const clean = extractSpokenVoiceover('{"voiceover":"Feed the soil and grow stronger roots."}')
  if (clean !== 'Feed the soil and grow stronger roots.') {
    throw new Error('Voiceover JSON extraction failed')
  }
  if (!looksLikeMetaNarration('Scene 1: Camera pans across the lawn.')) {
    throw new Error('Production-note detection failed')
  }

  console.log('ðŸ¤– Testing OpenAI Script Generation...\n')
  
  // Check API key
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY)
  console.log('OPENAI_API_KEY:', hasApiKey ? 'âœ“ SET' : 'âœ— NOT SET')
  
  if (!hasApiKey) {
    console.error('\nâŒ OPENAI_API_KEY not set in environment!')
    console.error('Set OPENAI_API_KEY to test script generation')
    process.exit(1)
  }
  
  console.log()
  
  // Create sample products with different characteristics
  const sampleProducts: Array<{ name: string; product: Product }> = [
    {
      name: 'Kelp-based product',
      product: {
        id: 'KELP-001',
        name: 'Nature\'s Way Kelp Meal',
        title: 'Organic Norwegian Kelp Meal Fertilizer',
        details: 'Premium kelp meal from Norwegian seas. Rich in natural minerals, trace elements, and growth hormones. Perfect for all garden plants, vegetables, and flowers. OMRI listed for organic production.'
      }
    },
    {
      name: 'Bone meal product',
      product: {
        id: 'BONE-001',
        name: 'Nature\'s Way Bone Meal',
        title: 'Organic Bone Meal - 4-12-0',
        details: 'Slow-release phosphorus source for strong root development. Made from steamed bone meal. Ideal for bulbs, roses, and flowering plants. Safe for organic gardening.'
      }
    },
    {
      name: 'Compost product',
      product: {
        id: 'COMPOST-001',
        name: 'Nature\'s Way Compost Tea',
        title: 'Liquid Compost Tea Concentrate',
        details: 'Brewed from premium compost. Loaded with beneficial microorganisms. Improves soil health and plant vitality. Easy to apply - just dilute and water.'
      }
    }
  ]
  
  console.log('ðŸ“¦ Testing script generation for', sampleProducts.length, 'sample products...\n')
  
  let successCount = 0
  const results: Array<{ name: string; success: boolean; script?: string; error?: string }> = []
  
  for (const { name, product } of sampleProducts) {
    console.log(`\n--- Testing: ${name} ---`)
    console.log('Product:', product.title)
    console.log('Details:', (product.details || '').substring(0, 80) + '...')
    console.log()
    
    try {
      console.log('Generating script...')
      const script = await generateScript(product)
      
      console.log('âœ“ Script generated successfully!')
      console.log('  Length:', script.length, 'characters')
      console.log('  Word count:', script.split(/\s+/).length, 'words')
      console.log()
      console.log('Generated script:')
      console.log('---')
      console.log(script)
      console.log('---')
      
      // Validate script
      const isValid = script.length > 0 && script.length < 1000 // Reasonable bounds
      if (!isValid) {
        console.warn('âš ï¸  Script length seems unusual:', script.length, 'characters')
      }
      
      results.push({ name, success: true, script })
      successCount++
      
    } catch (error: any) {
      console.error('âŒ Script generation failed!')
      console.error('Error:', error?.message || error)
      if (error?.response?.data) {
        console.error('API Response:', JSON.stringify(error.response.data, null, 2))
      }
      results.push({ name, success: false, error: error?.message || String(error) })
    }
  }
  
  // Summary
  console.log('\n\nðŸ“Š Test Summary:')
  console.log('  Total products tested:', sampleProducts.length)
  console.log('  Successful generations:', successCount)
  console.log('  Failed generations:', sampleProducts.length - successCount)
  console.log()
  
  results.forEach(r => {
    const status = r.success ? 'âœ“' : 'âœ—'
    console.log(`  ${status} ${r.name}`)
    if (!r.success && r.error) {
      console.log(`    Error: ${r.error}`)
    }
  })
  
  if (successCount === sampleProducts.length) {
    console.log('\nâœ… All script generation tests passed!')
  } else {
    console.log('\nâš ï¸  Some tests failed. See details above.')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
