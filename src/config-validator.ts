/**
 * Configuration validation using Zod
 */

import { z } from 'zod'

const envSchema = z.object({
  // OpenAI Configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_SYSTEM_PROMPT: z.string().optional(),
  OPENAI_USER_TEMPLATE: z.string().optional(),

  // D-ID Configuration - D-ID is the only supported video generator
  DID_API_KEY: z.string().optional(),
  DID_API_ENDPOINT: z.string().url().default('https://api.d-id.com'),
  DID_SOURCE_URL: z.string().optional(),
  DID_PRESENTER_ID: z.string().optional(),
  DID_VOICE_ID: z.string().optional(),
  DID_WEBHOOK_URL: z.string().optional(),
  DID_POLL_TIMEOUT_MS: z.string().transform(Number).default('1500000'),
  DID_POLL_INTERVAL_MS: z.string().transform(Number).default('15000'),

  // Legacy D-ID secret alias retained for compatibility
  DiD: z.string().optional(),

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

  // Facebook Page Posting Configuration
  FACEBOOK_PAGE_ACCESS_TOKEN: z.string().optional(),
  FACEBOOK_PAGE_ID: z.string().optional(),

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
  DRY_RUN_LOG_ONLY: z.string().default('false'),
  ENABLE_PLATFORMS: z.string().optional(),

  // Webhook Configuration
  WEBHOOK_SECRET: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_OPENAI: z.string().transform(Number).default('10'),
  RATE_LIMIT_DID: z.string().transform(Number).default('5'),
  RATE_LIMIT_TWITTER: z.string().transform(Number).default('50'),
  RATE_LIMIT_YOUTUBE: z.string().transform(Number).default('10'),
  RATE_LIMIT_INSTAGRAM: z.string().transform(Number).default('25'),
  RATE_LIMIT_FACEBOOK: z.string().transform(Number).default('25'),
  RATE_LIMIT_PINTEREST: z.string().transform(Number).default('5'),

  // Timeouts (in milliseconds)
  TIMEOUT_OPENAI: z.string().transform(Number).default('30000'),
  TIMEOUT_DID: z.string().transform(Number).default('1200000'),
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
type ValidatedConfig = InferredConfig & { __validated?: boolean }
export type AppConfig = ValidatedConfig

let cachedConfig: ValidatedConfig | null = null

export function resetConfigCache(): void {
  cachedConfig = null
}

function parseAndValidateEnv(): InferredConfig {
  try {
    return envSchema.parse(process.env) as InferredConfig
  } catch (error) {
    if (error && typeof error === 'object' && 'errors' in error) {
      const zodError = error as any
      const errors = zodError.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('\n')
      throw new Error(`Configuration validation failed:\n${errors}`)
    }
    throw error
  }
}

export async function validateConfig(options?: { force?: boolean }): Promise<ValidatedConfig> {
  if (!options?.force && cachedConfig && cachedConfig.__validated) return cachedConfig
  const parsed = parseAndValidateEnv()
  cachedConfig = { ...parsed, __validated: true }
  return cachedConfig
}

export function getConfig(): ValidatedConfig {
  if (!cachedConfig) {
    const parsed = parseAndValidateEnv()
    cachedConfig = { ...parsed, __validated: true }
  }
  return cachedConfig
}

export function hasCredentialsFor(platform: 'twitter' | 'youtube' | 'instagram' | 'pinterest' | 'facebook'): boolean {
  const config = getConfig()

  switch (platform) {
    case 'twitter':
      return !!(
        (config.TWITTER_API_KEY && config.TWITTER_API_SECRET && config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET) ||
        config.TWITTER_BEARER_TOKEN
      )
    case 'youtube':
      return !!(config.YOUTUBE_CLIENT_ID && config.YOUTUBE_CLIENT_SECRET && config.YOUTUBE_REFRESH_TOKEN)
    case 'instagram':
      return !!(config.INSTAGRAM_ACCESS_TOKEN && config.INSTAGRAM_USER_ID)
    case 'facebook':
      return !!(config.FACEBOOK_PAGE_ACCESS_TOKEN && config.FACEBOOK_PAGE_ID)
    case 'pinterest':
      return !!(config.PINTEREST_ACCESS_TOKEN && config.PINTEREST_BOARD_ID)
    default:
      return false
  }
}
