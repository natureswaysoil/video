#!/usr/bin/env node

/**
 * System Validation Runner
 * 
 * Runs a series of validation checks to verify the video automation system is properly configured.
 * This script checks configuration, credentials, and connectivity without consuming API credits.
 */

import 'dotenv/config'
import axios from 'axios'

interface ValidationResult {
  component: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  message: string
  details?: string
}

const results: ValidationResult[] = []

function addResult(component: string, status: ValidationResult['status'], message: string, details?: string) {
  results.push({ component, status, message, details })
}

async function validateEnvironment() {
  console.log('🔍 Validating Environment Configuration...\n')
  
  // Check Node version
  const nodeVersion = process.version
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0])
  if (majorVersion >= 16) {
    addResult('Node.js', 'pass', `Version ${nodeVersion} is supported`)
  } else {
    addResult('Node.js', 'fail', `Version ${nodeVersion} is too old (need 16+)`)
  }
  
  // Check required base configuration
  if (process.env.CSV_URL) {
    addResult('CSV_URL', 'pass', 'Configured')
  } else {
    addResult('CSV_URL', 'fail', 'Not set - required for fetching products')
  }
  
  // Check optional polling configuration
  const pollInterval = Number(process.env.POLL_INTERVAL_MS || 60000)
  if (pollInterval >= 10000 && pollInterval <= 3600000) {
    addResult('POLL_INTERVAL_MS', 'pass', `${pollInterval}ms (${pollInterval/1000}s)`)
  } else {
    addResult('POLL_INTERVAL_MS', 'warn', `${pollInterval}ms may be too short or long`)
  }
  
  const runOnce = String(process.env.RUN_ONCE || 'false').toLowerCase()
  addResult('RUN_ONCE', runOnce === 'true' ? 'pass' : 'warn', 
    runOnce === 'true' ? 'Single run mode' : 'Continuous mode (recommended for testing: RUN_ONCE=true)')
}

async function validateOpenAI() {
  console.log('🤖 Validating OpenAI Configuration...\n')
  
  if (!process.env.OPENAI_API_KEY) {
    addResult('OpenAI', 'warn', 'API key not set - will use product description as script')
    return
  }
  
  try {
    // Quick validation - just check key format
    const key = process.env.OPENAI_API_KEY
    if (key.startsWith('sk-')) {
      addResult('OpenAI', 'pass', 'API key format looks valid')
    } else {
      addResult('OpenAI', 'warn', 'API key format looks unusual')
    }
  } catch (error: any) {
    addResult('OpenAI', 'fail', 'Configuration error', error.message)
  }
}

async function validateHeyGen() {
  console.log('🎬 Validating HeyGen Configuration...\n')
  
  const hasDirectKey = Boolean(process.env.HEYGEN_API_KEY)
  const hasGcpSecret = Boolean(process.env.GCP_SECRET_HEYGEN_API_KEY)
  
  if (!hasDirectKey && !hasGcpSecret) {
    addResult('HeyGen', 'fail', 'No credentials configured (HEYGEN_API_KEY or GCP_SECRET_HEYGEN_API_KEY required)')
    return
  }
  
  if (hasDirectKey) {
    addResult('HeyGen', 'pass', 'Direct API key configured')
  } else if (hasGcpSecret) {
    addResult('HeyGen', 'pass', 'GCP Secret Manager configured')
  }
  
  // Check optional configuration
  const endpoint = process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com'
  addResult('HeyGen Endpoint', 'pass', endpoint)
  
  const duration = Number(process.env.HEYGEN_VIDEO_DURATION_SECONDS || 30)
  if (duration >= 15 && duration <= 120) {
    addResult('HeyGen Duration', 'pass', `${duration} seconds`)
  } else {
    addResult('HeyGen Duration', 'warn', `${duration} seconds (unusual duration)`)
  }
}

async function validateGoogleSheets() {
  console.log('📊 Validating Google Sheets Access...\n')
  
  const csvUrl = process.env.CSV_URL
  if (!csvUrl) {
    addResult('Sheets Access', 'fail', 'CSV_URL not set')
    return
  }
  
  // Check CSV URL format - validate it's actually a Google Sheets URL
  try {
    const url = new URL(csvUrl)
    const isGoogleSheets = url.hostname === 'docs.google.com' && url.pathname.includes('/spreadsheets/')
    const hasExport = url.pathname.includes('/export')
    
    if (isGoogleSheets && hasExport) {
      addResult('CSV Format', 'pass', 'URL format looks correct')
    } else if (isGoogleSheets) {
      addResult('CSV Format', 'warn', 'Google Sheets URL but missing /export path')
    } else {
      addResult('CSV Format', 'warn', 'Not a standard Google Sheets CSV export URL')
    }
  } catch (error) {
    addResult('CSV Format', 'fail', 'Invalid URL format')
  }
  
  // Try to fetch CSV
  try {
    const response = await axios.head(csvUrl, { timeout: 5000 })
    if (response.status === 200) {
      addResult('Sheets Connectivity', 'pass', 'Can reach Google Sheets')
    } else {
      addResult('Sheets Connectivity', 'warn', `HTTP ${response.status}`)
    }
  } catch (error: any) {
    addResult('Sheets Connectivity', 'fail', 'Cannot reach Google Sheets', error.message)
  }
  
  // Check writeback configuration
  const hasServiceAccount = Boolean(
    process.env.GS_SERVICE_ACCOUNT_EMAIL && process.env.GS_SERVICE_ACCOUNT_KEY
  )
  if (hasServiceAccount) {
    addResult('Sheets Writeback', 'pass', 'Service account configured')
  } else {
    addResult('Sheets Writeback', 'warn', 'Not configured - cannot update Posted status')
  }
}

async function validateSocialPlatforms() {
  console.log('📱 Validating Social Media Platforms...\n')
  
  // Instagram
  const hasInstagram = Boolean(
    process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID
  )
  if (hasInstagram) {
    addResult('Instagram', 'pass', 'Credentials configured')
  } else {
    addResult('Instagram', 'skip', 'Not configured')
  }
  
  // Twitter
  const hasTwitterBearer = Boolean(process.env.TWITTER_BEARER_TOKEN)
  const hasTwitterOAuth = Boolean(
    process.env.TWITTER_API_KEY && 
    process.env.TWITTER_API_SECRET && 
    process.env.TWITTER_ACCESS_TOKEN && 
    process.env.TWITTER_ACCESS_SECRET
  )
  
  if (hasTwitterOAuth) {
    addResult('Twitter', 'pass', 'OAuth 1.0a configured (native video upload)')
  } else if (hasTwitterBearer) {
    addResult('Twitter', 'pass', 'Bearer token configured (text with link)')
  } else {
    addResult('Twitter', 'skip', 'Not configured')
  }
  
  // Pinterest
  const hasPinterest = Boolean(
    process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID
  )
  if (hasPinterest) {
    addResult('Pinterest', 'pass', 'Credentials configured')
  } else {
    addResult('Pinterest', 'skip', 'Not configured')
  }
  
  // YouTube
  const hasYouTube = Boolean(
    process.env.YT_CLIENT_ID && 
    process.env.YT_CLIENT_SECRET && 
    process.env.YT_REFRESH_TOKEN
  )
  if (hasYouTube) {
    const privacy = process.env.YT_PRIVACY_STATUS || 'unlisted'
    addResult('YouTube', 'pass', `Credentials configured (${privacy})`)
  } else {
    addResult('YouTube', 'skip', 'Not configured')
  }
  
  // Check if at least one platform is configured
  const enabledCount = [hasInstagram, hasTwitterBearer || hasTwitterOAuth, hasPinterest, hasYouTube]
    .filter(Boolean).length
  
  if (enabledCount === 0) {
    addResult('Platforms Summary', 'warn', 'No social platforms configured - videos will be generated but not posted')
  } else {
    addResult('Platforms Summary', 'pass', `${enabledCount} platform(s) enabled`)
  }
}

async function validateOptionalFeatures() {
  console.log('⚙️  Validating Optional Features...\n')
  
  // Blog posting
  if (process.env.ENABLE_BLOG_POSTING === 'true') {
    if (process.env.GITHUB_TOKEN) {
      addResult('Blog Posting', 'pass', 'Enabled and configured')
    } else {
      addResult('Blog Posting', 'warn', 'Enabled but GITHUB_TOKEN not set')
    }
  } else {
    addResult('Blog Posting', 'skip', 'Not enabled')
  }
  
  // Posting windows
  const enforceWindows = process.env.ENFORCE_POSTING_WINDOWS === 'true'
  if (enforceWindows) {
    addResult('Posting Windows', 'pass', 'Enforced (9AM/5PM ET only)')
  } else {
    addResult('Posting Windows', 'skip', 'Not enforced (posts anytime)')
  }
  
  // Platform filtering
  const enabledPlatforms = process.env.ENABLE_PLATFORMS
  if (enabledPlatforms) {
    addResult('Platform Filter', 'pass', `Restricted to: ${enabledPlatforms}`)
  } else {
    addResult('Platform Filter', 'skip', 'All configured platforms enabled')
  }
}

function printResults() {
  console.log('\n' + '='.repeat(80))
  console.log('VALIDATION RESULTS')
  console.log('='.repeat(80) + '\n')
  
  const grouped = new Map<string, ValidationResult[]>()
  
  // Group by component category
  results.forEach(r => {
    const category = r.component.split(' ')[0]
    if (!grouped.has(category)) {
      grouped.set(category, [])
    }
    grouped.get(category)!.push(r)
  })
  
  // Print results by category
  grouped.forEach((items, category) => {
    items.forEach(item => {
      const icon = {
        pass: '✅',
        fail: '❌',
        warn: '⚠️ ',
        skip: '⏭️ '
      }[item.status]
      
      console.log(`${icon} ${item.component}: ${item.message}`)
      if (item.details) {
        console.log(`   ${item.details}`)
      }
    })
  })
  
  // Summary
  const counts = {
    pass: results.filter(r => r.status === 'pass').length,
    fail: results.filter(r => r.status === 'fail').length,
    warn: results.filter(r => r.status === 'warn').length,
    skip: results.filter(r => r.status === 'skip').length
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total checks: ${results.length}`)
  console.log(`✅ Passed: ${counts.pass}`)
  console.log(`❌ Failed: ${counts.fail}`)
  console.log(`⚠️  Warnings: ${counts.warn}`)
  console.log(`⏭️  Skipped: ${counts.skip}`)
  console.log()
  
  // Recommendations
  if (counts.fail > 0) {
    console.log('🔧 ACTIONS REQUIRED:')
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`   - Fix ${r.component}: ${r.message}`)
    })
    console.log()
  }
  
  if (counts.warn > 0) {
    console.log('💡 RECOMMENDATIONS:')
    results.filter(r => r.status === 'warn').forEach(r => {
      console.log(`   - Review ${r.component}: ${r.message}`)
    })
    console.log()
  }
  
  // Overall status
  if (counts.fail === 0 && counts.warn === 0) {
    console.log('🎉 System validation passed! Ready for testing.')
  } else if (counts.fail === 0) {
    console.log('✅ System is functional but has some warnings.')
    console.log('   You can proceed with testing, but review the warnings above.')
  } else {
    console.log('❌ System validation failed. Fix the issues above before testing.')
  }
  
  console.log()
  console.log('Next steps:')
  console.log('   1. Review and fix any failures or warnings')
  console.log('   2. Run individual tests: npm run test:csv')
  console.log('   3. See TESTING_GUIDE.md for complete testing instructions')
  console.log()
  
  return counts.fail === 0
}

async function main() {
  console.log('🔍 Video Automation System - Validation Check')
  console.log('='.repeat(80) + '\n')
  
  await validateEnvironment()
  await validateOpenAI()
  await validateHeyGen()
  await validateGoogleSheets()
  await validateSocialPlatforms()
  await validateOptionalFeatures()
  
  const success = printResults()
  
  process.exit(success ? 0 : 1)
}

main().catch(error => {
  console.error('Validation script error:', error)
  process.exit(1)
})
