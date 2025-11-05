/**
 * Comprehensive Audit Tool for Video Posting System
 * 
 * This script validates all prerequisites and traces the complete posting flow
 * to identify exactly why videos might not be posted to social media.
 */

import 'dotenv/config'
import axios from 'axios'

interface ValidationResult {
  passed: boolean
  message: string
  details?: any
}

interface CategoryResults {
  category: string
  passed: boolean
  checks: ValidationResult[]
}

async function main() {
  console.log('🔍 COMPREHENSIVE POSTING SYSTEM AUDIT')
  console.log('=====================================\n')
  
  const results: CategoryResults[] = []
  
  // 1. Environment Configuration
  console.log('📋 1. ENVIRONMENT CONFIGURATION')
  console.log('─'.repeat(50))
  results.push(await validateEnvironment())
  
  // 2. CSV/Data Source
  console.log('\n📊 2. DATA SOURCE (CSV)')
  console.log('─'.repeat(50))
  results.push(await validateDataSource())
  
  // 3. Posting Credentials
  console.log('\n🔑 3. PLATFORM CREDENTIALS')
  console.log('─'.repeat(50))
  results.push(await validatePlatformCredentials())
  
  // 4. Video Generation (HeyGen)
  console.log('\n🎬 4. VIDEO GENERATION (HEYGEN)')
  console.log('─'.repeat(50))
  results.push(await validateHeyGen())
  
  // 5. Google Sheets Writeback
  console.log('\n📝 5. GOOGLE SHEETS WRITEBACK')
  console.log('─'.repeat(50))
  results.push(await validateSheetsWriteback())
  
  // 6. Posting Windows & Filters
  console.log('\n🕐 6. POSTING WINDOWS & FILTERS')
  console.log('─'.repeat(50))
  results.push(validatePostingLogic())
  
  // Print Summary
  printAuditSummary(results)
  
  // Provide specific recommendations
  provideRecommendations(results)
}

async function validateEnvironment(): Promise<CategoryResults> {
  const checks: ValidationResult[] = []
  
  // CSV_URL
  const hasCsvUrl = Boolean(process.env.CSV_URL)
  checks.push({
    passed: hasCsvUrl,
    message: 'CSV_URL configured',
    details: hasCsvUrl ? 'Set' : 'MISSING - Required for data source'
  })
  
  if (!hasCsvUrl) {
    console.log('  ❌ CSV_URL: Not configured')
    console.log('     Required for fetching product data from Google Sheets')
  } else {
    console.log('  ✅ CSV_URL: Configured')
  }
  
  // RUN_ONCE
  const runOnce = String(process.env.RUN_ONCE || '').toLowerCase() === 'true'
  checks.push({
    passed: true,
    message: `RUN_ONCE: ${runOnce}`,
    details: runOnce ? 'Single execution mode' : 'Continuous polling mode'
  })
  console.log(`  ℹ️  RUN_ONCE: ${runOnce} ${runOnce ? '(single run)' : '(continuous)'}`)
  
  // DRY_RUN_LOG_ONLY
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  checks.push({
    passed: !dryRun,
    message: `DRY_RUN_LOG_ONLY: ${dryRun}`,
    details: dryRun ? '⚠️  POSTS WILL NOT BE SENT (dry run mode)' : 'Posting enabled'
  })
  if (dryRun) {
    console.log('  ❌ DRY_RUN_LOG_ONLY: true - NO POSTS WILL BE SENT!')
  } else {
    console.log('  ✅ DRY_RUN_LOG_ONLY: false (posts enabled)')
  }
  
  // ENFORCE_POSTING_WINDOWS
  const enforceWindows = String(process.env.ENFORCE_POSTING_WINDOWS || '').toLowerCase() === 'true'
  checks.push({
    passed: true,
    message: `ENFORCE_POSTING_WINDOWS: ${enforceWindows}`,
    details: enforceWindows ? '⚠️  Only posts during 9AM/5PM ET windows' : 'Posts anytime'
  })
  if (enforceWindows) {
    console.log('  ⚠️  ENFORCE_POSTING_WINDOWS: true - Only posts at 9AM/5PM ET')
  } else {
    console.log('  ✅ ENFORCE_POSTING_WINDOWS: false (posts anytime)')
  }
  
  // ENABLE_PLATFORMS
  const enabledPlatforms = process.env.ENABLE_PLATFORMS || 'all (based on credentials)'
  checks.push({
    passed: true,
    message: 'ENABLE_PLATFORMS',
    details: enabledPlatforms
  })
  console.log(`  ℹ️  ENABLE_PLATFORMS: ${enabledPlatforms}`)
  
  // ALWAYS_GENERATE_NEW_VIDEO
  const alwaysNew = String(process.env.ALWAYS_GENERATE_NEW_VIDEO || '').toLowerCase() === 'true'
  checks.push({
    passed: true,
    message: `ALWAYS_GENERATE_NEW_VIDEO: ${alwaysNew}`,
    details: alwaysNew ? 'Will regenerate videos' : 'Skips already-posted rows'
  })
  console.log(`  ℹ️  ALWAYS_GENERATE_NEW_VIDEO: ${alwaysNew}`)
  
  return {
    category: 'Environment',
    passed: checks.every(c => c.passed),
    checks
  }
}

async function validateDataSource(): Promise<CategoryResults> {
  const checks: ValidationResult[] = []
  const csvUrl = process.env.CSV_URL
  
  if (!csvUrl) {
    checks.push({
      passed: false,
      message: 'CSV_URL not configured',
      details: 'Cannot fetch products without CSV_URL'
    })
    return { category: 'Data Source', passed: false, checks }
  }
  
  // Try to fetch the CSV
  try {
    const response = await axios.get(csvUrl, {
      responseType: 'text',
      timeout: 10000,
      validateStatus: () => true
    })
    
    if (response.status !== 200) {
      checks.push({
        passed: false,
        message: 'CSV fetch failed',
        details: `HTTP ${response.status}: ${response.statusText}`
      })
      return { category: 'Data Source', passed: false, checks }
    }
    
    checks.push({
      passed: true,
      message: 'CSV accessible',
      details: `HTTP 200, ${response.data.length} bytes`
    })
    
    // Parse CSV
    const lines = response.data.split(/\r?\n/).filter((l: string) => l.trim())
    checks.push({
      passed: lines.length > 1,
      message: `CSV contains ${lines.length} lines`,
      details: lines.length > 1 ? `${lines.length - 1} data rows` : 'No data rows found'
    })
    
    if (lines.length > 0) {
      const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''))
      checks.push({
        passed: true,
        message: 'CSV headers',
        details: headers.slice(0, 10).join(', ') + (headers.length > 10 ? '...' : '')
      })
      
      // Check for key columns
      const hasJobId = headers.some((h: string) => /jobid|job_id|asin|sku/i.test(h))
      checks.push({
        passed: hasJobId,
        message: 'Job ID column',
        details: hasJobId ? 'Found' : '⚠️  No jobId/ASIN/SKU column detected'
      })
      
      const hasPosted = headers.some((h: string) => /posted/i.test(h))
      checks.push({
        passed: true,
        message: 'Posted tracking column',
        details: hasPosted ? 'Found (will skip posted rows)' : 'Not found (will process all)'
      })
      
      const hasVideoUrl = headers.some((h: string) => /video.*url|videourl/i.test(h))
      checks.push({
        passed: true,
        message: 'Video URL column',
        details: hasVideoUrl ? 'Found' : 'Not found (will use template)'
      })
    }
    
  } catch (error: any) {
    checks.push({
      passed: false,
      message: 'CSV fetch error',
      details: error.message || String(error)
    })
  }
  
  return {
    category: 'Data Source',
    passed: checks.every(c => c.passed),
    checks
  }
}

async function validatePlatformCredentials(): Promise<CategoryResults> {
  const checks: ValidationResult[] = []
  const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase()
  const enabledPlatforms = new Set(enabledPlatformsEnv.split(',').map(s => s.trim()).filter(Boolean))
  const allEnabled = enabledPlatforms.size === 0
  
  // Instagram
  const hasInstagram = Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID)
  const instagramEnabled = allEnabled || enabledPlatforms.has('instagram')
  checks.push({
    passed: !instagramEnabled || hasInstagram,
    message: 'Instagram',
    details: instagramEnabled
      ? (hasInstagram ? '✅ Credentials configured' : '❌ Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_IG_ID')
      : 'Disabled in ENABLE_PLATFORMS'
  })
  if (instagramEnabled) {
    if (hasInstagram) {
      console.log('  ✅ Instagram: Credentials configured')
    } else {
      console.log('  ❌ Instagram: Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_IG_ID')
    }
  } else {
    console.log('  ⏭️  Instagram: Disabled in ENABLE_PLATFORMS')
  }
  
  // Twitter
  const hasTwitterUpload = Boolean(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET
  )
  const hasTwitterBearer = Boolean(process.env.TWITTER_BEARER_TOKEN)
  const hasTwitter = hasTwitterUpload || hasTwitterBearer
  const twitterEnabled = allEnabled || enabledPlatforms.has('twitter')
  checks.push({
    passed: !twitterEnabled || hasTwitter,
    message: 'Twitter/X',
    details: twitterEnabled
      ? (hasTwitterUpload
          ? '✅ Full credentials (media upload)'
          : hasTwitterBearer
          ? '⚠️  Bearer token only (link posts)'
          : '❌ No credentials')
      : 'Disabled in ENABLE_PLATFORMS'
  })
  if (twitterEnabled) {
    if (hasTwitterUpload) {
      console.log('  ✅ Twitter: Full credentials (media upload)')
    } else if (hasTwitterBearer) {
      console.log('  ⚠️  Twitter: Bearer token only (link posts)')
    } else {
      console.log('  ❌ Twitter: No credentials')
    }
  } else {
    console.log('  ⏭️  Twitter: Disabled in ENABLE_PLATFORMS')
  }
  
  // Pinterest
  const hasPinterest = Boolean(process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID)
  const pinterestEnabled = allEnabled || enabledPlatforms.has('pinterest')
  checks.push({
    passed: !pinterestEnabled || hasPinterest,
    message: 'Pinterest',
    details: pinterestEnabled
      ? (hasPinterest ? '✅ Credentials configured' : '❌ Missing PINTEREST_ACCESS_TOKEN or PINTEREST_BOARD_ID')
      : 'Disabled in ENABLE_PLATFORMS'
  })
  if (pinterestEnabled) {
    if (hasPinterest) {
      console.log('  ✅ Pinterest: Credentials configured')
    } else {
      console.log('  ❌ Pinterest: Missing PINTEREST_ACCESS_TOKEN or PINTEREST_BOARD_ID')
    }
  } else {
    console.log('  ⏭️  Pinterest: Disabled in ENABLE_PLATFORMS')
  }
  
  // YouTube
  const hasYouTube = Boolean(
    process.env.YT_CLIENT_ID &&
    process.env.YT_CLIENT_SECRET &&
    process.env.YT_REFRESH_TOKEN
  )
  const youtubeEnabled = allEnabled || enabledPlatforms.has('youtube')
  checks.push({
    passed: !youtubeEnabled || hasYouTube,
    message: 'YouTube',
    details: youtubeEnabled
      ? (hasYouTube ? '✅ Credentials configured' : '⚠️  Missing credentials (optional)')
      : 'Disabled in ENABLE_PLATFORMS'
  })
  if (youtubeEnabled) {
    if (hasYouTube) {
      console.log('  ✅ YouTube: Credentials configured')
    } else {
      console.log('  ⚠️  YouTube: Missing credentials (optional)')
    }
  } else {
    console.log('  ⏭️  YouTube: Disabled in ENABLE_PLATFORMS')
  }
  
  // Count enabled platforms with credentials
  const enabledCount = [
    instagramEnabled && hasInstagram,
    twitterEnabled && hasTwitter,
    pinterestEnabled && hasPinterest,
    youtubeEnabled && hasYouTube
  ].filter(Boolean).length
  
  checks.push({
    passed: enabledCount > 0,
    message: `Platforms ready to post: ${enabledCount}`,
    details: enabledCount === 0 ? '❌ NO PLATFORMS CONFIGURED - Videos will not be posted!' : 'At least one platform ready'
  })
  
  return {
    category: 'Platform Credentials',
    passed: checks.every(c => c.passed),
    checks
  }
}

async function validateHeyGen(): Promise<CategoryResults> {
  const checks: ValidationResult[] = []
  
  const hasHeyGenKey = Boolean(process.env.HEYGEN_API_KEY)
  const hasGcpSecret = Boolean(process.env.GCP_SECRET_HEYGEN_API_KEY)
  const hasHeyGen = hasHeyGenKey || hasGcpSecret
  
  checks.push({
    passed: hasHeyGen,
    message: 'HeyGen credentials',
    details: hasHeyGenKey
      ? '✅ HEYGEN_API_KEY set'
      : hasGcpSecret
      ? '✅ GCP_SECRET_HEYGEN_API_KEY set'
      : '⚠️  Not configured (required for video generation)'
  })
  
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY)
  checks.push({
    passed: true, // OpenAI is optional
    message: 'OpenAI (script generation)',
    details: hasOpenAI ? '✅ Configured' : '⚠️  Not configured (will use product description)'
  })
  
  const endpoint = process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com'
  checks.push({
    passed: true,
    message: 'HeyGen endpoint',
    details: endpoint
  })
  
  return {
    category: 'Video Generation',
    passed: checks.every(c => c.passed),
    checks
  }
}

async function validateSheetsWriteback(): Promise<CategoryResults> {
  const checks: ValidationResult[] = []
  
  const hasServiceAccount = Boolean(
    process.env.GS_SERVICE_ACCOUNT_EMAIL &&
    process.env.GS_SERVICE_ACCOUNT_KEY
  )
  
  checks.push({
    passed: true, // Writeback is optional
    message: 'Google Sheets writeback',
    details: hasServiceAccount
      ? '✅ Service account configured'
      : '⚠️  Not configured (Posted status won\'t be tracked)'
  })
  
  if (hasServiceAccount) {
    const targetColumn = process.env.SHEET_VIDEO_TARGET_COLUMN_LETTER || 'AB'
    checks.push({
      passed: true,
      message: 'Video URL column',
      details: `Column ${targetColumn}`
    })
  }
  
  return {
    category: 'Sheets Writeback',
    passed: checks.every(c => c.passed),
    checks
  }
}

function validatePostingLogic(): CategoryResults {
  const checks: ValidationResult[] = []
  
  // Posting windows
  const enforceWindows = String(process.env.ENFORCE_POSTING_WINDOWS || '').toLowerCase() === 'true'
  checks.push({
    passed: true,
    message: 'Posting windows',
    details: enforceWindows
      ? '⚠️  ENFORCED - Only posts at 9AM/5PM ET'
      : '✅ Not enforced - posts anytime'
  })
  
  if (enforceWindows) {
    const now = new Date()
    const offset = Number(process.env.EASTERN_UTC_OFFSET_HOURS || '-4')
    const etHour = (now.getUTCHours() + offset + 24) % 24
    const etMinute = now.getUTCMinutes()
    
    const isIn9AMWindow = etHour === 9 && Math.abs(etMinute - 0) <= 5
    const isIn5PMWindow = etHour === 17 && Math.abs(etMinute - 0) <= 5
    const inWindow = isIn9AMWindow || isIn5PMWindow
    
    checks.push({
      passed: inWindow,
      message: 'Current time check',
      details: inWindow
        ? '✅ Currently in posting window'
        : `❌ Outside posting window (current ET: ${etHour}:${etMinute.toString().padStart(2, '0')})`
    })
  }
  
  // Dry run
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  checks.push({
    passed: !dryRun,
    message: 'Dry run mode',
    details: dryRun
      ? '❌ ENABLED - No actual posts will be made!'
      : '✅ Disabled - posts will be sent'
  })
  
  return {
    category: 'Posting Logic',
    passed: checks.every(c => c.passed),
    checks
  }
}

function printAuditSummary(results: CategoryResults[]): void {
  console.log('\n')
  console.log('='.repeat(80))
  console.log('📊 AUDIT SUMMARY')
  console.log('='.repeat(80))
  
  const allPassed = results.every(r => r.passed)
  const criticalIssues = results.filter(r => !r.passed)
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌'
    console.log(`${icon} ${result.category}: ${result.passed ? 'PASSED' : 'ISSUES FOUND'}`)
  })
  
  console.log('─'.repeat(80))
  
  if (allPassed) {
    console.log('✅ ALL CHECKS PASSED')
    console.log('System appears to be configured correctly for posting.')
  } else {
    console.log(`❌ ${criticalIssues.length} CATEGORIES WITH ISSUES`)
    console.log('Review the details above to resolve configuration problems.')
  }
  
  console.log('='.repeat(80))
}

function provideRecommendations(results: CategoryResults[]): void {
  console.log('\n💡 RECOMMENDATIONS\n')
  
  const issues: string[] = []
  
  // Check for critical blockers
  const envResult = results.find(r => r.category === 'Environment')
  if (envResult) {
    const dryRunCheck = envResult.checks.find(c => c.message.includes('DRY_RUN'))
    if (dryRunCheck && !dryRunCheck.passed) {
      issues.push('🔴 CRITICAL: DRY_RUN_LOG_ONLY is enabled - set to false or remove from .env')
    }
    
    const windowCheck = envResult.checks.find(c => c.message.includes('ENFORCE_POSTING_WINDOWS'))
    if (windowCheck && windowCheck.message.includes('true')) {
      const logicResult = results.find(r => r.category === 'Posting Logic')
      const timeCheck = logicResult?.checks.find(c => c.message.includes('Current time'))
      if (timeCheck && !timeCheck.passed) {
        issues.push('⚠️  TIMING: Posting windows enforced but not in window - run at 9AM or 5PM ET, or disable ENFORCE_POSTING_WINDOWS')
      }
    }
  }
  
  const platformResult = results.find(r => r.category === 'Platform Credentials')
  if (platformResult) {
    const readyCheck = platformResult.checks.find(c => c.message.includes('Platforms ready'))
    if (readyCheck && !readyCheck.passed) {
      issues.push('🔴 CRITICAL: No platform credentials configured - add at least one of: Instagram, Twitter, Pinterest, or YouTube')
    }
  }
  
  const dataResult = results.find(r => r.category === 'Data Source')
  if (dataResult && !dataResult.passed) {
    issues.push('🔴 CRITICAL: CSV data source not accessible - check CSV_URL and Google Sheets permissions')
  }
  
  const heygenResult = results.find(r => r.category === 'Video Generation')
  if (heygenResult) {
    const keyCheck = heygenResult.checks.find(c => c.message.includes('HeyGen credentials'))
    if (keyCheck && !keyCheck.passed) {
      issues.push('⚠️  Video generation not configured - videos must already exist in sheet or set HEYGEN_API_KEY')
    }
  }
  
  if (issues.length === 0) {
    console.log('✅ No critical issues found.')
    console.log('If videos still aren\'t posting:')
    console.log('  1. Check that products have Ready=1 or TRUE in the CSV')
    console.log('  2. Check that products don\'t have Posted=1 (unless ALWAYS_GENERATE_NEW_VIDEO=true)')
    console.log('  3. Run with RUN_ONCE=true for testing')
    console.log('  4. Check logs when running: npm run dev')
  } else {
    console.log('Issues found:')
    issues.forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue}`)
    })
  }
  
  console.log('\n📚 For more help, see:')
  console.log('  - TROUBLESHOOTING_NO_POSTS.md')
  console.log('  - OPERATIONS_RUNBOOK.md')
  console.log('  - .env.example')
  console.log('')
}

main().catch(err => {
  console.error('Audit script error:', err)
  process.exit(1)
})
