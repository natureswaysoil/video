
/**
 * Error sanitization utilities to prevent credential exposure
 * Phase 1.2: Fix credential exposure
 */

const SENSITIVE_PATTERNS = [
  // API Keys and Tokens
  /bearer\s+[a-z0-9_\-\.]+/gi,
  /api[_-]?key["\s:=]+[a-z0-9_\-]+/gi,
  /access[_-]?token["\s:=]+[a-z0-9_\-\.]+/gi,
  /refresh[_-]?token["\s:=]+[a-z0-9_\-\.]+/gi,
  /secret["\s:=]+[a-z0-9_\-]+/gi,
  /password["\s:=]+[^\s"']+/gi,
  
  // OAuth tokens
  /oauth[_-]?token["\s:=]+[a-z0-9_\-\.]+/gi,
  
  // API key formats
  /sk-[a-z0-9]{32,}/gi, // OpenAI keys
  /xox[baprs]-[a-z0-9\-]+/gi, // Slack tokens
  /AIza[0-9A-Za-z\-_]{35}/gi, // Google API keys
  /ya29\.[0-9A-Za-z\-_]+/gi, // Google OAuth tokens
  
  // Private keys
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]+?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
  
  // URLs with credentials
  /https?:\/\/[^:@\s]+:[^:@\s]+@[^\s]+/gi,
  
  // Authorization headers
  /authorization["\s:]+[^\s"']+/gi,
]

const SENSITIVE_KEYS = [
  'apikey',
  'api_key',
  'apiKey',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'secret',
  'password',
  'passwd',
  'pwd',
  'authorization',
  'auth',
  'bearer',
  'privateKey',
  'private_key',
  'clientSecret',
  'client_secret',
  'oauth',
  'credentials',
]

/**
 * Sanitize a string by replacing sensitive patterns with [REDACTED]
 */
export function sanitizeString(str: string): string {
  let sanitized = str
  
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Keep the prefix (like "Bearer ") but redact the value
      const parts = match.split(/[:=\s]+/)
      if (parts.length > 1) {
        return `${parts[0]} [REDACTED]`
      }
      return '[REDACTED]'
    })
  }
  
  return sanitized
}

/**
 * Sanitize an object by removing or redacting sensitive fields
 */
export function sanitizeObject(obj: any, depth: number = 0): any {
  if (depth > 10) {
    return '[MAX_DEPTH_EXCEEDED]'
  }

  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj)
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1))
  }

  if (typeof obj === 'object') {
    const sanitized: any = {}
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()
      
      // Check if the key is sensitive
      if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk.toLowerCase()))) {
        sanitized[key] = '[REDACTED]'
        continue
      }
      
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value, depth + 1)
    }
    
    return sanitized
  }

  return obj
}

/**
 * Sanitize error objects before logging
 */
export function sanitizeError(error: unknown): any {
  if (error instanceof Error) {
    const sanitized: any = {
      name: error.name,
      message: sanitizeString(error.message),
      stack: error.stack ? sanitizeString(error.stack) : undefined,
    }
    
    // Sanitize additional properties
    for (const [key, value] of Object.entries(error)) {
      if (key !== 'name' && key !== 'message' && key !== 'stack') {
        sanitized[key] = sanitizeObject(value)
      }
    }
    
    return sanitized
  }
  
  return sanitizeObject(error)
}

/**
 * Create a safe error message for logging
 */
export function createSafeErrorLog(
  context: string,
  error: unknown,
  additionalContext?: Record<string, any>
): {
  context: string
  error: any
  timestamp: string
  additionalContext?: any
} {
  return {
    context,
    error: sanitizeError(error),
    timestamp: new Date().toISOString(),
    additionalContext: additionalContext ? sanitizeObject(additionalContext) : undefined,
  }
}
