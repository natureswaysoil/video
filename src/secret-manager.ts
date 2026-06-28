import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

let client: SecretManagerServiceClient | null = null
const loaded = new Set<string>()
let warnedNoAdc = false

function getSecretManagerClient(): SecretManagerServiceClient {
  if (!client) {
    client = new SecretManagerServiceClient()
  }
  return client
}

export const DEFAULT_SECRET_NAMES = [
  'CSV_URL',
  'GOOGLE_SHEET_CSV_URL',
  'GS_SHEET_NAME',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'HEYGEN_API_KEY',
  'HEYGEN_DEFAULT_AVATAR',
  'HEYGEN_DEFAULT_VOICE',
  'HEYGEN_WEBHOOK_URL',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_USER_ID',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
  'FACEBOOK_ACCESS_TOKEN',
  'FACEBOOK_PAGE_ID',
  'TWITTER_API_KEY',
  'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_TOKEN_SECRET',
  'PINTEREST_ACCESS_TOKEN',
  'PINTEREST_BOARD_ID',
  'PEXELS_API_KEY',
]

function getProjectId(): string {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    'natureswaysoil-video'
  )
}

function hasLikelyAdc(): boolean {
  if (String(process.env.SKIP_SECRET_MANAGER || '').toLowerCase() === 'true') return false

  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_CREDENTIALS ||
    process.env.K_SERVICE ||
    process.env.CLOUD_RUN_JOB ||
    process.env.FUNCTION_TARGET ||
    process.env.GAE_SERVICE
  ) return true

  // Also detect gcloud user ADC file written by `gcloud auth application-default login`
  const os = require('os')
  const path = require('path')
  const fs = require('fs')
  const adcFile = path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json')
  return fs.existsSync(adcFile)
}

function normalizeSeparators(value: string): string {
  return value.trim().replace(/[\s]+/g, '_').replace(/[-_]+/g, '_')
}

/**
 * Generate likely Secret Manager naming variants for a requested env key.
 * Priority order starts with UPPERCASE_UNDERSCORE, then lowercase-hyphen.
 */
export function buildSecretNameCandidates(secretName: string): string[] {
  const normalized = normalizeSeparators(secretName)
  const upperUnderscore = normalized.toUpperCase()
  const lowerHyphen = normalized.toLowerCase().replace(/_/g, '-')
  const lowerUnderscore = normalized.toLowerCase()
  const asProvided = secretName.trim()

  const candidates = [
    upperUnderscore,
    lowerHyphen,
    asProvided,
    asProvided.replace(/-/g, '_'),
    asProvided.replace(/_/g, '-'),
    lowerUnderscore,
    normalized,
  ]

  return [...new Set(candidates.filter(Boolean))]
}

function isNotFoundError(error: any): boolean {
  const code = Number(error?.code)
  const message = String(error?.message || '').toLowerCase()
  return code === 5 || message.includes('not found')
}

function isPermissionDeniedError(error: any): boolean {
  const code = Number(error?.code)
  const message = String(error?.message || '').toLowerCase()
  return code === 7 || message.includes('permission_denied') || message.includes('permission denied')
}

export async function loadSecretToEnv(secretName: string): Promise<boolean> {
  if (process.env[secretName]) return true
  if (loaded.has(secretName)) return !!process.env[secretName]

  const candidates = buildSecretNameCandidates(secretName)

  // Always try existing env vars first (supports mixed naming in local/dev runs).
  for (const candidate of candidates) {
    if (process.env[candidate]) {
      process.env[secretName] = process.env[candidate]
      loaded.add(secretName)
      console.log(`Loaded secret from existing env var: ${candidate} -> ${secretName}`)
      return true
    }
  }

  if (!hasLikelyAdc()) {
    if (!warnedNoAdc) {
      console.warn(
        'Skipping Google Secret Manager lookups because ADC is not configured (set GOOGLE_APPLICATION_CREDENTIALS or run in GCP runtime).'
      )
      warnedNoAdc = true
    }
    loaded.add(secretName)
    return false
  }

  const projectId = getProjectId()

  for (const candidate of candidates) {
    try {
      const name = `projects/${projectId}/secrets/${candidate}/versions/latest`
      const [version] = await getSecretManagerClient().accessSecretVersion({ name })
      const value = version.payload?.data?.toString().trim()

      if (!value) continue

      process.env[secretName] = value
      process.env[candidate] = value
      loaded.add(secretName)
      loaded.add(candidate)

      if (candidate === secretName) {
        console.log(`Loaded secret from Google Secret Manager: ${secretName}`)
      } else {
        console.log(`Loaded secret from Google Secret Manager: ${candidate} -> ${secretName}`)
      }
      return true
    } catch (error: any) {
      if (isNotFoundError(error)) {
        continue
      }

      if (isPermissionDeniedError(error)) {
        console.warn(`Permission denied while loading secret ${candidate}:`, error?.message || error)
        loaded.add(secretName)
        return false
      }

      console.warn(`Could not load secret ${candidate}:`, error?.message || error)
    }
  }

  console.warn(`Could not load secret ${secretName}. Tried variants: ${candidates.join(', ')}`)
  loaded.add(secretName)
  return false
}

export async function loadSecretsToEnv(secretNames = DEFAULT_SECRET_NAMES): Promise<void> {
  for (const secretName of secretNames) {
    await loadSecretToEnv(secretName)
  }
}
