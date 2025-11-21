
/**
 * Configuration validation using Zod
 * Phase 1.4: Add configuration validation
 */

import { z } from 'zod'

const envSchema = z.object({
  // OpenAI Configuration (optional - system can use product description as fallback)
  // Note: If OPENAI_API_KEY is not set, cli.ts will use product description as script
  // The generateScript function would throw if called without the key, but cli.ts checks
  // for the key's presence before calling generateScript
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_SYSTEM_PROMPT: z.string().optional(),
  OPENAI_USER_TEMPLATE: z.string().optional(),
  
  // HeyGen Configuration
  HEYGEN_API_KEY: z.string().optional(),
  HEYGEN_API_ENDPOINT: z.string().url().default('https://api.heygen.com'),
  GCP_SECRET_HEYGEN_API_KEY: z.string().optional(),
  
  // Google Sheets Configuration
  GS_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GS_SERVICE_ACCOUNT_KEY: z.string().optional(),
  GCP_SA_JSON: z.string().optional(),
  GCP_SECRET_SA_JSON: z.string().optional(),

  // Twitter/X Configuration
  TWITTER_API_KEY: z.string().optional(),
  TWITTER_API_SECRET: z.string().optional(),
  TWITTER_ACCESS_TOKEN: z.string().optional(),
  TWITTER_ACCESS_SECRET: z.string().optional(),
  TWITTER_BEARER_TOKEN: z.string().optional(),
  
  // YouTube Configuration
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),
  
  // Instagram Configuration
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_USER_ID: z.string().optional(),
  INSTAGRAM_API_VERSION: z.string().default('v19.0'),
  INSTAGRAM_API_HOST: z.string().default('graph.facebook.com'),
  IG_MEDIA_TYPE: z.enum(['VIDEO', 'REELS', 'STORIES']).default('REELS'),
  IG_UPLOAD_TYPE: z.enum(['simple', 'resumable']).default('simple'),
  
  // Pinterest Configuration
  PINTEREST_ACCESS_TOKEN: z.string().optional(),
  PINTEREST_BOARD_ID: z.string().optional(),
  
  // CSV Column Mappings
  CSV_COL_JOB_ID: z.string().optional(),
  CSV_COL_TITLE: z.string().optional(),
  CSV_COL_DETAILS: z.string().optional(),
  CSV_COL_ID: z.string().optional(),
  CSV_COL_NAME: z.string().optional(),
  CSV_COL_POSTED: z.string().optional(),
  CSV_COL_READY: z.string().optional(),
  CSV_COL_POSTED_AT: z.string().optional(),
  CSV_STATUS_TRUE_VALUES: z.string().optional(),
  
  // Processing Options
  ALWAYS_GENERATE_NEW_VIDEO: z.string().default('false'),
  DRY_RUN: z.string().default('false'),
  
  // Webhook Configuration
  WEBHOOK_SECRET: z.string().optional(),
  
  // Rate Limiting
  RATE_LIMIT_OPENAI: z.string().transform(Number).default('10'),
  RATE_LIMIT_HEYGEN: z.string().transform(Number).default('5'),
  RATE_LIMIT_TWITTER: z.string().transform(Number).default('50'),
  RATE_LIMIT_YOUTUBE: z.string().transform(Number).default('10'),
  RATE_LIMIT_INSTAGRAM: z.string().transform(Number).default('25'),
  RATE_LIMIT_PINTEREST: z.string().transform(Number).default('5'),
  
  // Timeouts (in milliseconds)
  TIMEOUT_OPENAI: z.string().transform(Number).default('30000'),
  TIMEOUT_HEYGEN: z.string().transform(Number).default('1200000'), // 20 minutes
  TIMEOUT_SOCIAL_POST: z.string().transform(Number).default('60000'),
  
  // Memory Management
  MAX_VIDEO_SIZE_MB: z.string().transform(Number).default('500'),
  ENABLE_STREAMING_UPLOADS: z.string().default('true'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_METRICS: z.string().default('true'),
  
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

type InferredConfig = ReturnType<typeof envSchema.parse>
export type AppConfig = InferredConfig

let cachedConfig: InferredConfig | null = null

/**
 * Validate and parse environment variables
 */
export function validateConfig(): InferredConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  try {
    cachedConfig = envSchema.parse(process.env) as InferredConfig
    return cachedConfig
  } catch (error) {
    if (error && typeof error === 'object' && 'errors' in error) {
      const zodError = error as any
      const errors = zodError.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('\n')
      throw new Error(`Configuration validation failed:\n${errors}`)
    }
    throw error
  }
}

/**
 * Get the current config (throws if not validated yet)
 */
export function getConfig(): InferredConfig {
  if (!cachedConfig) {
    return validateConfig()
  }
  return cachedConfig
}

/**
 * Check if required credentials for a platform are available
 */
export function hasCredentialsFor(platform: 'twitter' | 'youtube' | 'instagram' | 'pinterest'): boolean {
  const config = getConfig()
  
  switch (platform) {
    case 'twitter':
      return !!(
        (config.TWITTER_API_KEY && config.TWITTER_API_SECRET && 
         config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET) ||
        config.TWITTER_BEARER_TOKEN
      )
    
    case 'youtube':
      return !!(config.YOUTUBE_CLIENT_ID && config.YOUTUBE_CLIENT_SECRET && config.YOUTUBE_REFRESH_TOKEN)
    
    case 'instagram':
      return !!(config.INSTAGRAM_ACCESS_TOKEN && config.INSTAGRAM_USER_ID)
    
    case 'pinterest':
      return !!(config.PINTEREST_ACCESS_TOKEN && config.PINTEREST_BOARD_ID)
    
    default:
      return false
  }
}
