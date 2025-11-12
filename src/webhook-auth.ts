
/**
 * Webhook authentication and signature verification
 * Phase 1.5: Add webhook authentication
 */

import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { AppError, ErrorCode } from './errors'

/**
 * Verify webhook signature using HMAC
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean {
  try {
    const hmac = crypto.createHmac(algorithm, secret)
    const digest = hmac.update(payload).digest('hex')
    
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    )
  } catch (error) {
    console.error('[WebhookAuth] Signature verification error:', error)
    return false
  }
}

/**
 * Verify webhook signature with SHA256 prefix (e.g., "sha256=...")
 */
export function verifyWebhookSignatureWithPrefix(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  const match = signature.match(/^(sha256|sha1|md5)=(.+)$/)
  if (!match) {
    return verifyWebhookSignature(payload, signature, secret)
  }
  
  const [, algorithm, hash] = match
  return verifyWebhookSignature(payload, hash, secret, algorithm)
}

/**
 * Express middleware to verify webhook signatures
 */
export function webhookAuthMiddleware(options: {
  secretEnvVar?: string
  signatureHeader?: string
  algorithm?: string
  required?: boolean
} = {}) {
  const {
    secretEnvVar = 'WEBHOOK_SECRET',
    signatureHeader = 'x-signature',
    algorithm = 'sha256',
    required = true,
  } = options

  return (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env[secretEnvVar]
    
    // If webhook auth is not configured and not required, allow the request
    if (!secret) {
      if (required) {
        return res.status(500).json({
          error: 'Webhook authentication not configured',
        })
      }
      return next()
    }

    const signature = req.headers[signatureHeader.toLowerCase()] as string
    
    if (!signature) {
      return res.status(401).json({
        error: 'Missing webhook signature',
      })
    }

    // Get raw body for signature verification
    let payload: string | Buffer
    if (Buffer.isBuffer(req.body)) {
      payload = req.body
    } else if (typeof req.body === 'string') {
      payload = req.body
    } else {
      payload = JSON.stringify(req.body)
    }

    const valid = verifyWebhookSignatureWithPrefix(payload, signature, secret)
    
    if (!valid) {
      return res.status(401).json({
        error: 'Invalid webhook signature',
      })
    }

    next()
  }
}

/**
 * Generate a webhook signature for testing
 */
export function generateWebhookSignature(
  payload: string | Buffer,
  secret: string,
  algorithm: string = 'sha256'
): string {
  const hmac = crypto.createHmac(algorithm, secret)
  const digest = hmac.update(payload).digest('hex')
  return `${algorithm}=${digest}`
}

/**
 * Verify timestamp to prevent replay attacks
 */
export function verifyWebhookTimestamp(
  timestamp: string | number,
  maxAgeSeconds: number = 300 // 5 minutes default
): boolean {
  try {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
    const now = Math.floor(Date.now() / 1000)
    const age = now - ts
    
    return age >= 0 && age <= maxAgeSeconds
  } catch (error) {
    return false
  }
}

/**
 * Full webhook authentication middleware with timestamp verification
 */
export function webhookAuthWithTimestampMiddleware(options: {
  secretEnvVar?: string
  signatureHeader?: string
  timestampHeader?: string
  algorithm?: string
  maxAgeSeconds?: number
  required?: boolean
} = {}) {
  const {
    secretEnvVar = 'WEBHOOK_SECRET',
    signatureHeader = 'x-signature',
    timestampHeader = 'x-timestamp',
    algorithm = 'sha256',
    maxAgeSeconds = 300,
    required = true,
  } = options

  return (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env[secretEnvVar]
    
    // If webhook auth is not configured and not required, allow the request
    if (!secret) {
      if (required) {
        return res.status(500).json({
          error: 'Webhook authentication not configured',
        })
      }
      return next()
    }

    // Verify signature
    const signature = req.headers[signatureHeader.toLowerCase()] as string
    if (!signature) {
      return res.status(401).json({
        error: 'Missing webhook signature',
      })
    }

    let payload: string | Buffer
    if (Buffer.isBuffer(req.body)) {
      payload = req.body
    } else if (typeof req.body === 'string') {
      payload = req.body
    } else {
      payload = JSON.stringify(req.body)
    }

    const validSignature = verifyWebhookSignatureWithPrefix(payload, signature, secret)
    if (!validSignature) {
      return res.status(401).json({
        error: 'Invalid webhook signature',
      })
    }

    // Verify timestamp (if provided)
    const timestamp = req.headers[timestampHeader.toLowerCase()] as string
    if (timestamp) {
      const validTimestamp = verifyWebhookTimestamp(timestamp, maxAgeSeconds)
      if (!validTimestamp) {
        return res.status(401).json({
          error: 'Webhook timestamp too old or invalid',
        })
      }
    }

    next()
  }
}
