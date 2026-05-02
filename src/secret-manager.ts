import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

let client: SecretManagerServiceClient | null = null
const loaded = new Set<string>()

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
  'INSTAGRAM_ACCOUNT_ID',
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

export async function loadSecretToEnv(secretName: string): Promise<boolean> {
  if (process.env[secretName]) return true
  if (loaded.has(secretName)) return !!process.env[secretName]

  const projectId = getProjectId()

  try {
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`
    const [version] = await getSecretManagerClient().accessSecretVersion({ name })
    const value = version.payload?.data?.toString()

    if (value) {
      process.env[secretName] = value
      console.log(`Loaded secret from Google Secret Manager: ${secretName}`)
      loaded.add(secretName)
      return true
    }
  } catch (error: any) {
    console.warn(`Could not load secret ${secretName}:`, error?.message || error)
  }

  loaded.add(secretName)
  return false
}

export async function loadSecretsToEnv(secretNames = DEFAULT_SECRET_NAMES): Promise<void> {
  for (const secretName of secretNames) {
    await loadSecretToEnv(secretName)
  }
}
