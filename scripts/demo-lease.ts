import 'dotenv/config'
import { loadSecretsToEnv } from '../src/secret-manager'

const requiredEnv = ['OPENAI_API_KEY', 'HEYGEN_API_KEY']
const optionalEnv = ['CSV_URL', 'GOOGLE_SHEET_CSV_URL', 'PEXELS_API_KEY']
const demoSecretNames = [...requiredEnv, ...optionalEnv, 'OPENAI_MODEL', 'HEYGEN_API_ENDPOINT']

function hasValue(name: string): boolean {
  const value = process.env[name]
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized !== '' && !normalized.includes('your-') && !normalized.includes('paste_') && !normalized.includes('replace_') && normalized !== 'changeme'
}

function printHeader(): void {
  console.log('\n============================================================')
  console.log(' Product Video Automation Engine - Lease Demo')
  console.log('============================================================')
  console.log('This demo generates one finished product video using:')
  console.log('- Product CSV / Google Sheet row')
  console.log('- OpenAI script generation')
  console.log('- Optional Pexels b-roll')
  console.log('- HeyGen video rendering')
  console.log('\nThe finished HeyGen video URL will print when complete.\n')
}

async function loadConfiguredSecrets(): Promise<void> {
  const wantsSecretManager = String(process.env.USE_SECRET_MANAGER || '').toLowerCase() === 'true'
  const hasDirectKeys = requiredEnv.every(hasValue)

  if (!hasDirectKeys || wantsSecretManager) {
    console.log('Loading demo secrets from environment / Google Secret Manager when available...')
    await loadSecretsToEnv(demoSecretNames)
  }
}

function validateEnvironment(): void {
  const missing = requiredEnv.filter((name) => !hasValue(name))

  console.log('Environment check:')
  for (const name of requiredEnv) {
    console.log(`- ${name}: ${hasValue(name) ? 'configured' : 'missing'}`)
  }
  for (const name of optionalEnv) {
    console.log(`- ${name}: ${hasValue(name) ? 'configured' : 'not set'}`)
  }

  if (missing.length > 0) {
    console.error('\nCannot run live lease demo yet. Missing required environment variables:')
    for (const name of missing) console.error(`- ${name}`)
    console.error('\nFix options:')
    console.error('1. Add the missing keys to .env, or')
    console.error('2. Set USE_SECRET_MANAGER=true and configure Google Application Default Credentials, then run:')
    console.error('   npm run demo:lease')
    process.exit(1)
  }

  if (!hasValue('CSV_URL') && !hasValue('GOOGLE_SHEET_CSV_URL')) {
    console.warn('\nNo CSV_URL or GOOGLE_SHEET_CSV_URL found. The demo will use the default demo sheet configured in one-good-video.ts.')
  }
}

async function main(): Promise<void> {
  printHeader()

  process.env.DRY_RUN = process.env.DRY_RUN || 'false'
  process.env.DEMO_MODE = 'lease'

  await loadConfiguredSecrets()
  validateEnvironment()

  console.log('\nStarting live video generation demo...\n')
  await import('./one-good-video')
}

main().catch((error) => {
  console.error('\nLease demo failed:', error)
  process.exit(1)
})
