#!/usr/bin/env node
/**
 * Run this script in Google Cloud Shell to sync all secrets to Vercel:
 * node scripts/sync-secrets-to-vercel.js
 * 
 * Requires: VERCEL_TOKEN env var set
 */

const https = require('https')
const { execSync } = require('child_process')

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const PROJECT_ID = 'prj_N1Lp45LaYTqtqWZ9SDUnhNHXnQPk'
const TEAM_ID = 'team_IinPoA3ygJ6LwThhXYw3hBfI'

if (!VERCEL_TOKEN) {
  console.error('❌ Set VERCEL_TOKEN env var first:')
  console.error('   export VERCEL_TOKEN=your_vercel_token')
  process.exit(1)
}

// Secrets to sync from GCP Secret Manager to Vercel
const SECRETS = [
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_IG_ID', 
  'TWITTER_BEARER_TOKEN',
  'PINTEREST_ACCESS_TOKEN',
  'PINTEREST_BOARD_ID',
  'YT_CLIENT_ID',
  'YT_CLIENT_SECRET',
  'YT_REFRESH_TOKEN',
  'HEYGEN_API_KEY',
]

function gcpSecret(name) {
  try {
    const val = execSync(`gcloud secrets versions access latest --secret=${name} 2>/dev/null`, { encoding: 'utf8' }).trim()
    return val || null
  } catch {
    // Try lowercase and with underscores replaced by hyphens
    try {
      const altName = name.toLowerCase().replace(/_/g, '-')
      const val = execSync(`gcloud secrets versions access latest --secret=${altName} 2>/dev/null`, { encoding: 'utf8' }).trim()
      return val || null
    } catch {
      return null
    }
  }
}

function vercelApiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'api.vercel.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }
    const req = https.request(options, (res) => {
      let responseData = ''
      res.on('data', chunk => responseData += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(responseData)) } 
        catch { resolve(responseData) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function getExistingEnvVars() {
  const result = await vercelApiRequest('GET', `/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`)
  return result.envs || []
}

async function upsertEnvVar(key, value, existingEnvs) {
  const existing = existingEnvs.find(e => e.key === key)
  if (existing) {
    // Update
    await vercelApiRequest('PATCH', `/v9/projects/${PROJECT_ID}/env/${existing.id}?teamId=${TEAM_ID}`, {
      value,
      target: ['production', 'preview', 'development']
    })
    return 'updated'
  } else {
    // Create
    await vercelApiRequest('POST', `/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
      key,
      value,
      type: 'encrypted',
      target: ['production', 'preview', 'development']
    })
    return 'created'
  }
}

async function main() {
  console.log('🔍 Fetching existing Vercel env vars...')
  const existingEnvs = await getExistingEnvVars()
  console.log(`Found ${existingEnvs.length} existing env vars\n`)

  for (const secretName of SECRETS) {
    process.stdout.write(`📦 ${secretName}: `)
    const value = gcpSecret(secretName)
    if (!value) {
      console.log('⚠️  Not found in GCP Secret Manager - skipping')
      continue
    }
    const action = await upsertEnvVar(secretName, value, existingEnvs)
    console.log(`✅ ${action} (${value.substring(0, 8)}...)`)
  }

  console.log('\n✅ Done! Trigger a redeploy for changes to take effect.')
  console.log('   Or hit: https://video-gilt-eta.vercel.app/api/cron')
}

main().catch(console.error)
