import axios from 'axios'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { getLogger } from './logger'
import { AppError, ErrorCode } from './errors'

const logger = getLogger()
let secretManagerClient: SecretManagerServiceClient | null = null

interface TokenRefreshResult {
  accessToken: string
  expiresIn?: number
  tokenType?: string
}

function sanitizeAccessToken(raw: string | undefined | null): string {
  if (!raw) return ''
  let t = String(raw).trim()
  // Remove common wrappers/prefixes
  if (t.startsWith('Bearer ')) t = t.slice(7)
  // Strip surrounding quotes
  t = t.replace(/^"+|"+$/g, '')
  t = t.replace(/^'+|'+$/g, '')
  // If JSON, try to extract access_token
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const obj = JSON.parse(t)
      if (obj && typeof obj.access_token === 'string') {
        return String(obj.access_token).trim()
      }
    } catch {}
  }
  return t
}

/**
 * Refresh Instagram long-lived access token
 * Instagram tokens expire after 60 days and need to be refreshed
 * https://developers.facebook.com/docs/instagram-basic-display-api/guides/long-lived-access-tokens
 */
export async function refreshInstagramToken(
  currentToken: string,
  appId?: string,
  appSecret?: string
): Promise<TokenRefreshResult> {
  try {
    logger.info('Refreshing Instagram access token', 'TokenManager')

    // For Instagram Graph API (Business accounts), we can exchange tokens
    // If app credentials are provided, use them for refresh
    if (appId && appSecret) {
      const response = await axios.get('https://graph.instagram.com/refresh_access_token', {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: currentToken,
        },
        timeout: 30000,
      })

      logger.info('Instagram token refreshed successfully', 'TokenManager', {
        expiresIn: response.data.expires_in,
      })

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type,
      }
    }

    // For Graph API tokens (no app secret needed)
    const response = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId || process.env.INSTAGRAM_APP_ID,
        client_secret: appSecret || process.env.INSTAGRAM_APP_SECRET,
        fb_exchange_token: currentToken,
      },
      timeout: 30000,
    })

    logger.info('Instagram token refreshed via Facebook', 'TokenManager', {
      expiresIn: response.data.expires_in,
    })

    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type || 'bearer',
    }
  } catch (error: any) {
    logger.error('Failed to refresh Instagram token', 'TokenManager', {
      errorMessage: error?.response?.data || error.message,
    })

    throw new AppError(
      `Instagram token refresh failed: ${error?.response?.data?.error?.message || error.message}`,
      ErrorCode.AUTH_ERROR,
      401,
      true,
      { hasAppCredentials: !!(appId && appSecret) },
      error
    )
  }
}

/**
 * Check if Instagram token is expiring soon (within 7 days)
 * Instagram provides token expiry information in the debug endpoint
 */
export async function checkInstagramTokenExpiry(
  accessToken: string,
  appId?: string,
  appSecret?: string
): Promise<{ isValid: boolean; expiresAt?: Date; daysRemaining?: number }> {
  try {
    const appAccessToken = appId && appSecret ? `${appId}|${appSecret}` : accessToken
    const response = await axios.get('https://graph.facebook.com/debug_token', {
      params: {
        input_token: accessToken,
        access_token: appAccessToken,
      },
      timeout: 30000,
    })

    const data = response.data.data
    if (!data.is_valid) {
      return { isValid: false }
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at * 1000) : undefined
    const daysRemaining = expiresAt
      ? Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : undefined

    logger.debug('Instagram token expiry check', 'TokenManager', {
      isValid: data.is_valid,
      expiresAt: expiresAt?.toISOString(),
      daysRemaining,
    })

    return {
      isValid: data.is_valid,
      expiresAt,
      daysRemaining,
    }
  } catch (error: any) {
    logger.warn('Could not check Instagram token expiry', 'TokenManager', {}, error)
    return { isValid: true } // Assume valid if we can't check
  }
}

/**
 * Attempt to refresh token if expired or expiring soon
 * Returns the current token if still valid, or a new token if refreshed
 */
export async function ensureValidInstagramToken(
  currentToken: string,
  appId?: string,
  appSecret?: string
): Promise<string> {
  try {
    const sanitized = sanitizeAccessToken(currentToken)
    const expiry = await checkInstagramTokenExpiry(sanitized, appId, appSecret)

    // Token invalid or expiring in less than 7 days
    if (!expiry.isValid || (expiry.daysRemaining !== undefined && expiry.daysRemaining < 7)) {
      logger.info('Instagram token needs refresh', 'TokenManager', {
        isValid: expiry.isValid,
        daysRemaining: expiry.daysRemaining,
      })

      const result = await refreshInstagramToken(sanitized, appId, appSecret)
      const refreshed = sanitizeAccessToken(result.accessToken)
      await persistInstagramToken(refreshed)
      process.env.INSTAGRAM_ACCESS_TOKEN = refreshed
      return refreshed
    }

    logger.debug('Instagram token is still valid', 'TokenManager', {
      daysRemaining: expiry.daysRemaining,
    })

    return sanitized
  } catch (error) {
    logger.warn('Token refresh failed, using current token', 'TokenManager', {}, error)
    return sanitizeAccessToken(currentToken) // Fallback to sanitized current token
  }
}

/**
 * Twitter OAuth 1.0a doesn't have token expiry - tokens are permanent until revoked
 * Twitter OAuth 2.0 with PKCE can have refresh tokens, but our current implementation
 * uses OAuth 1.0a which doesn't need refresh
 */
export function getTwitterTokenInfo(): { requiresRefresh: boolean; note: string } {
  return {
    requiresRefresh: false,
    note: 'Twitter OAuth 1.0a tokens do not expire and do not require refresh',
  }
}

/**
 * YouTube OAuth tokens are automatically refreshed by the googleapis library
 * when you call setCredentials with a refresh_token
 */
export function getYouTubeTokenInfo(): { requiresRefresh: boolean; note: string } {
  return {
    requiresRefresh: false,
    note: 'YouTube tokens are automatically refreshed by googleapis library',
  }
}

function resolveSecretParentPath(): string | null {
  const secretLocator =
    process.env.INSTAGRAM_ACCESS_TOKEN_SECRET_NAME || process.env.GCP_SECRET_INSTAGRAM_ACCESS_TOKEN
  if (!secretLocator) {
    return null
  }

  const trimmed = secretLocator.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.includes('/versions/')) {
    return trimmed.split('/versions/')[0]
  }

  return trimmed
}

async function persistInstagramToken(newToken: string): Promise<void> {
  const parent = resolveSecretParentPath()
  if (!parent) {
    logger.debug('No Instagram secret path configured; skipping token persistence', 'TokenManager')
    return
  }

  try {
    if (!secretManagerClient) {
      secretManagerClient = new SecretManagerServiceClient()
    }

    await (secretManagerClient as any).addSecretVersion({
      parent,
      payload: { data: Buffer.from(newToken, 'utf8') },
    })

    logger.info('Stored refreshed Instagram token in Secret Manager', 'TokenManager', { parent })
  } catch (error: any) {
    logger.error('Failed to store refreshed Instagram token', 'TokenManager', { parent }, error)
  }
}
