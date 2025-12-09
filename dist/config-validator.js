"use strict";
/**
 * Configuration validation using Zod
 * Phase 1.4: Add configuration validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.getConfig = getConfig;
exports.hasCredentialsFor = hasCredentialsFor;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    // OpenAI Configuration (optional - system can use product description as fallback)
    // Note: If OPENAI_API_KEY is not set, cli.ts will use product description as script
    // The generateScript function would throw if called without the key, but cli.ts checks
    // for the key's presence before calling generateScript
    OPENAI_API_KEY: zod_1.z.string().optional(),
    OPENAI_MODEL: zod_1.z.string().default('gpt-4o-mini'),
    OPENAI_SYSTEM_PROMPT: zod_1.z.string().optional(),
    OPENAI_USER_TEMPLATE: zod_1.z.string().optional(),
    // HeyGen Configuration
    HEYGEN_API_KEY: zod_1.z.string().optional(),
    HEYGEN_API_ENDPOINT: zod_1.z.string().url().default('https://api.heygen.com'),
    GCP_SECRET_HEYGEN_API_KEY: zod_1.z.string().optional(),
    // Google Sheets Configuration
    GS_SERVICE_ACCOUNT_EMAIL: zod_1.z.string().email().optional(),
    GS_SERVICE_ACCOUNT_KEY: zod_1.z.string().optional(),
    GCP_SA_JSON: zod_1.z.string().optional(),
    GCP_SECRET_SA_JSON: zod_1.z.string().optional(),
    // Twitter/X Configuration
    TWITTER_API_KEY: zod_1.z.string().optional(),
    TWITTER_API_SECRET: zod_1.z.string().optional(),
    TWITTER_ACCESS_TOKEN: zod_1.z.string().optional(),
    TWITTER_ACCESS_SECRET: zod_1.z.string().optional(),
    TWITTER_BEARER_TOKEN: zod_1.z.string().optional(),
    // YouTube Configuration
    YOUTUBE_CLIENT_ID: zod_1.z.string().optional(),
    YOUTUBE_CLIENT_SECRET: zod_1.z.string().optional(),
    YOUTUBE_REFRESH_TOKEN: zod_1.z.string().optional(),
    // Instagram Configuration
    INSTAGRAM_ACCESS_TOKEN: zod_1.z.string().optional(),
    INSTAGRAM_USER_ID: zod_1.z.string().optional(),
    INSTAGRAM_API_VERSION: zod_1.z.string().default('v19.0'),
    INSTAGRAM_API_HOST: zod_1.z.string().default('graph.facebook.com'),
    IG_MEDIA_TYPE: zod_1.z.enum(['VIDEO', 'REELS', 'STORIES']).default('REELS'),
    IG_UPLOAD_TYPE: zod_1.z.enum(['simple', 'resumable']).default('simple'),
    // Pinterest Configuration
    PINTEREST_ACCESS_TOKEN: zod_1.z.string().optional(),
    PINTEREST_BOARD_ID: zod_1.z.string().optional(),
    // CSV Column Mappings
    CSV_COL_JOB_ID: zod_1.z.string().optional(),
    CSV_COL_TITLE: zod_1.z.string().optional(),
    CSV_COL_DETAILS: zod_1.z.string().optional(),
    CSV_COL_ID: zod_1.z.string().optional(),
    CSV_COL_NAME: zod_1.z.string().optional(),
    CSV_COL_POSTED: zod_1.z.string().optional(),
    CSV_COL_READY: zod_1.z.string().optional(),
    CSV_COL_POSTED_AT: zod_1.z.string().optional(),
    CSV_STATUS_TRUE_VALUES: zod_1.z.string().optional(),
    // Processing Options
    ALWAYS_GENERATE_NEW_VIDEO: zod_1.z.string().default('false'),
    DRY_RUN: zod_1.z.string().default('false'),
    // Webhook Configuration
    WEBHOOK_SECRET: zod_1.z.string().optional(),
    // Rate Limiting
    RATE_LIMIT_OPENAI: zod_1.z.string().transform(Number).default('10'),
    RATE_LIMIT_HEYGEN: zod_1.z.string().transform(Number).default('5'),
    RATE_LIMIT_TWITTER: zod_1.z.string().transform(Number).default('50'),
    RATE_LIMIT_YOUTUBE: zod_1.z.string().transform(Number).default('10'),
    RATE_LIMIT_INSTAGRAM: zod_1.z.string().transform(Number).default('25'),
    RATE_LIMIT_PINTEREST: zod_1.z.string().transform(Number).default('5'),
    // Timeouts (in milliseconds)
    TIMEOUT_OPENAI: zod_1.z.string().transform(Number).default('30000'),
    TIMEOUT_HEYGEN: zod_1.z.string().transform(Number).default('1200000'), // 20 minutes
    TIMEOUT_SOCIAL_POST: zod_1.z.string().transform(Number).default('60000'),
    // Memory Management
    MAX_VIDEO_SIZE_MB: zod_1.z.string().transform(Number).default('500'),
    ENABLE_STREAMING_UPLOADS: zod_1.z.string().default('true'),
    // Logging
    LOG_LEVEL: zod_1.z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    ENABLE_METRICS: zod_1.z.string().default('true'),
    // Node Environment
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
});
let cachedConfig = null;
/**
 * Helper function to parse and validate environment variables
 * Throws a formatted error if validation fails
 */
function parseAndValidateEnv() {
    try {
        return envSchema.parse(process.env);
    }
    catch (error) {
        if (error && typeof error === 'object' && 'errors' in error) {
            const zodError = error;
            const errors = zodError.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
            throw new Error(`Configuration validation failed:\n${errors}`);
        }
        throw error;
    }
}
/**
 * Validate and parse environment variables
 */
async function validateConfig() {
    if (cachedConfig && cachedConfig.__validated) {
        return cachedConfig;
    }
    const parsed = parseAndValidateEnv();
    const validated = { ...parsed, __validated: true };
    cachedConfig = validated;
    return cachedConfig;
}
/**
 * Get the current config (automatically validates if not already done)
 */
function getConfig() {
    if (!cachedConfig) {
        // Auto-validate on first access - synchronous wrapper for backwards compatibility
        // This handles cases where getConfig() is called before validateConfig()
        const parsed = parseAndValidateEnv();
        cachedConfig = { ...parsed, __validated: true };
    }
    return cachedConfig;
}
/**
 * Check if required credentials for a platform are available
 */
function hasCredentialsFor(platform) {
    const config = getConfig();
    switch (platform) {
        case 'twitter':
            return !!((config.TWITTER_API_KEY && config.TWITTER_API_SECRET &&
                config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET) ||
                config.TWITTER_BEARER_TOKEN);
        case 'youtube':
            return !!(config.YOUTUBE_CLIENT_ID && config.YOUTUBE_CLIENT_SECRET && config.YOUTUBE_REFRESH_TOKEN);
        case 'instagram':
            return !!(config.INSTAGRAM_ACCESS_TOKEN && config.INSTAGRAM_USER_ID);
        case 'pinterest':
            return !!(config.PINTEREST_ACCESS_TOKEN && config.PINTEREST_BOARD_ID);
        default:
            return false;
    }
}
