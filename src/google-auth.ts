import { google } from 'googleapis'
import { GoogleAuth } from 'google-auth-library'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

type ServiceAccount = {
  client_email: string
  private_key: string
}

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n')
}

export async function loadServiceAccountFromEnv(): Promise<ServiceAccount | null> {
  if (process.env.GCP_SA_JSON) {
    try {
      const parsed = JSON.parse(process.env.GCP_SA_JSON)
      if (!parsed?.client_email || !parsed?.private_key) {
        throw new Error('Service account JSON is missing client_email or private_key')
      }
      return {
        client_email: parsed.client_email,
        private_key: normalizePrivateKey(parsed.private_key),
      }
    } catch (error) {
      throw new Error(`GCP_SA_JSON error: ${error instanceof Error ? error.message : 'contains invalid JSON'}`)
    }
  }

  const secretResource = process.env.GCP_SECRET_SA_JSON
  if (secretResource) {
    const secretClient = new SecretManagerServiceClient()
    const [accessResponse] = await secretClient.accessSecretVersion({ name: secretResource })
    const payload = accessResponse.payload?.data?.toString('utf8')
    if (!payload) {
      throw new Error('Secret payload empty')
    }

    let parsed: any
    try {
      parsed = JSON.parse(payload)
    } catch (error) {
      throw new Error('Secret payload is not valid JSON')
    }
    if (!parsed?.client_email || !parsed?.private_key) {
      throw new Error('Service account JSON is missing client_email or private_key')
    }

    return {
      client_email: parsed.client_email,
      private_key: normalizePrivateKey(parsed.private_key),
    }
  }

  const clientEmail = process.env.GS_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GS_SERVICE_ACCOUNT_KEY
  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: normalizePrivateKey(privateKey),
    }
  }

  return null
}

export function hasConfiguredGoogleCredentials(): boolean {
  if (process.env.GCP_SA_JSON || process.env.GCP_SECRET_SA_JSON) {
    return true
  }

  if (process.env.GS_SERVICE_ACCOUNT_EMAIL && process.env.GS_SERVICE_ACCOUNT_KEY) {
    return true
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    return true
  }

  return false
}

export async function createGoogleAuthClient(scopes: string[]) {
  const serviceAccount = await loadServiceAccountFromEnv()
  if (serviceAccount) {
    return new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes,
    })
  }

  const googleAuth = new GoogleAuth({ scopes })
  return googleAuth.getClient()
}
