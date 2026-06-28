// @ts-nocheck
import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { loadSecretsToEnv } from '../src/secret-manager'
import { getConfig } from '../src/config-validator'
import { getTestVideoCampaignSeeds } from '../src/content-seed-bank'
import { postToTwitter } from '../src/twitter'
import { postToInstagram } from '../src/instagram'
import { postToPinterest } from '../src/pinterest'
import { postToYouTube } from '../src/youtube'

type RotationState = {
  nextIndex: number
  lastUpdatedAt: string
  uploadedVideoUrls: Record<string, string>
}

const DEFAULT_STATE: RotationState = {
  nextIndex: 0,
  lastUpdatedAt: new Date(0).toISOString(),
  uploadedVideoUrls: {},
}

const STATE_PATH = path.resolve(process.cwd(), '.runtime/test-video-campaign-state.json')

/**
 * Secret names expected in Google Secret Manager for this campaign.
 *
 * Notes:
 * - Twitter/X is intentionally excluded (posting is disabled).
 * - Facebook secrets are loaded for Meta ecosystem completeness even though
 *   this script currently posts only to Instagram, Pinterest, and YouTube.
 */
const TEST_CAMPAIGN_SECRET_NAMES = [
  // Instagram / Meta
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_IG_ID',
  'INSTAGRAM_USER_ID',
  'INSTAGRAM_ACCOUNT_ID',
  'FACEBOOK_ACCESS_TOKEN',
  'FACEBOOK_PAGE_ID',

  // Pinterest
  'PINTEREST_ACCESS_TOKEN',
  'PINTEREST_BOARD_ID',

  // YouTube (multiple naming conventions)
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
  'YOUTUBE_OAUTH_REFRESH_TOKEN',
  'YT_CLIENT_ID',
  'YT_CLIENT_SECRET',
  'YT_REFRESH_TOKEN',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'REFRESH_TOKEN',

  // Supabase Storage (for hosting local videos when TEST_VIDEO_PUBLIC_BASE_URL is not set)
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_VIDEO_BUCKET',
]

async function loadCampaignSecretsFromGoogleSecretManager(): Promise<void> {
  console.log('🔐 Loading campaign credentials from Google Secret Manager...')
  await loadSecretsToEnv(TEST_CAMPAIGN_SECRET_NAMES)
  console.log('✅ Google Secret Manager secret loading completed')
}

function ensureRuntimeDir(): void {
  const dir = path.dirname(STATE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readState(): RotationState {
  try {
    if (!fs.existsSync(STATE_PATH)) return { ...DEFAULT_STATE }
    const raw = fs.readFileSync(STATE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      nextIndex: Number(parsed.nextIndex || 0),
      lastUpdatedAt: String(parsed.lastUpdatedAt || DEFAULT_STATE.lastUpdatedAt),
      uploadedVideoUrls: typeof parsed.uploadedVideoUrls === 'object' && parsed.uploadedVideoUrls ? parsed.uploadedVideoUrls : {},
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function writeState(state: RotationState): void {
  ensureRuntimeDir()
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8')
}

function buildCaption(params: {
  title: string
  productDescription: string
  websiteUrl: string
  hashtags?: string[]
}): string {
  const tags = (params.hashtags || ['#SoilHealth', '#OrganicGrowing', '#NaturesWaySoil']).join(' ')
  return `${params.title}\n\n${params.productDescription}\n\nLearn more: ${params.websiteUrl}\n\n${tags}`
}

function getEnabledPlatforms(): Set<string> {
  const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase()
  const platforms = new Set(enabledPlatformsEnv.split(',').map((value) => value.trim()).filter(Boolean))

  // Twitter/X enabled by default; set DISABLE_TWITTER=true to opt out.
  if (String(process.env.DISABLE_TWITTER || '').toLowerCase() === 'true') {
    console.log('ℹ️ Twitter/X posting disabled via DISABLE_TWITTER.')
    platforms.delete('twitter')
    platforms.delete('x')
  }

  return platforms
}

function isPlatformEnabled(platform: string, enabledPlatforms: Set<string>): boolean {
  return enabledPlatforms.size === 0 || enabledPlatforms.has(platform)
}

function getInstagramAccountId(): string {
  return process.env.INSTAGRAM_IG_ID || process.env.INSTAGRAM_USER_ID || process.env.INSTAGRAM_ACCOUNT_ID || ''
}

function pickFirstEnv(keys: string[]): { value: string; key: string } {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return { value, key }
  }
  return { value: '', key: '' }
}

function getYouTubeCredentials(): { clientId: string; clientSecret: string; refreshToken: string } {
  const clientId = pickFirstEnv(['YT_CLIENT_ID', 'YOUTUBE_CLIENT_ID', 'CLIENT_ID'])
  const clientSecret = pickFirstEnv(['YT_CLIENT_SECRET', 'YOUTUBE_CLIENT_SECRET', 'CLIENT_SECRET'])
  const refreshToken = pickFirstEnv([
    'YT_REFRESH_TOKEN',
    'YOUTUBE_REFRESH_TOKEN',
    'YOUTUBE_OAUTH_REFRESH_TOKEN',
    'GOOGLE_YOUTUBE_REFRESH_TOKEN',
    'GOOGLE_REFRESH_TOKEN',
    'REFRESH_TOKEN',
  ])

  if (clientId.key || clientSecret.key || refreshToken.key) {
    console.log('🔍 YouTube credential sources:', {
      clientId: clientId.key || 'missing',
      clientSecret: clientSecret.key || 'missing',
      refreshToken: refreshToken.key || 'missing',
    })
  }

  if (!refreshToken.value && clientId.value && clientSecret.value) {
    console.warn(
      '⚠️ Found YouTube client ID/secret but no refresh token. Looked for YT_REFRESH_TOKEN, YOUTUBE_REFRESH_TOKEN, YOUTUBE_OAUTH_REFRESH_TOKEN, GOOGLE_YOUTUBE_REFRESH_TOKEN, GOOGLE_REFRESH_TOKEN, REFRESH_TOKEN.'
    )
  }

  return {
    clientId: clientId.value,
    clientSecret: clientSecret.value,
    refreshToken: refreshToken.value,
  }
}

function getSupabaseConfig(): { supabaseUrl: string; serviceRoleKey: string; bucketName: string } {
  const supabaseUrl = pickFirstEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'])
  const serviceRoleKey = pickFirstEnv(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'])
  const bucketName = pickFirstEnv(['SUPABASE_VIDEO_BUCKET'])

  return {
    supabaseUrl: supabaseUrl.value,
    serviceRoleKey: serviceRoleKey.value,
    bucketName: bucketName.value || 'test-videos',
  }
}

function assertCampaignSecretsAreAvailable(): void {
  const hasInstagram = Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && getInstagramAccountId())
  const hasPinterest = Boolean(process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID)
  const youtubeCreds = getYouTubeCredentials()
  const hasYouTube = Boolean(youtubeCreds.clientId && youtubeCreds.clientSecret && youtubeCreds.refreshToken)
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig()
  const hasSupabase = Boolean(supabaseUrl && serviceRoleKey)
  const hasPublicBaseUrl = Boolean(process.env.TEST_VIDEO_PUBLIC_BASE_URL?.trim())

  if (!hasInstagram && !hasPinterest && !hasYouTube && !hasSupabase && !hasPublicBaseUrl) {
    throw new Error(
      'No campaign secrets appear to be loaded. Verify Google Secret Manager access (ADC/IAM/project) and ensure required secret names exist.'
    )
  }

  if (!hasPublicBaseUrl && !hasSupabase) {
    throw new Error(
      'Local test videos need hosting before social posting. Set TEST_VIDEO_PUBLIC_BASE_URL or provide NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Google Secret Manager.'
    )
  }
}

async function uploadVideoToSupabase(localVideoPath: string, seedFileName: string): Promise<string> {
  const { supabaseUrl, serviceRoleKey, bucketName } = getSupabaseConfig()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Supabase credentials missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_URL and SUPABASE_SERVICE_KEY).'
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const safeFileName = path.basename(seedFileName).replace(/[^a-zA-Z0-9._-]/g, '-')
  const objectPath = `test-campaign/${safeFileName}`
  const fileBuffer = fs.readFileSync(localVideoPath)

  console.log('☁️ Uploading video to Supabase Storage:', {
    bucketName,
    objectPath,
    localVideoPath,
  })

  const { error } = await supabase.storage.from(bucketName).upload(objectPath, fileBuffer, {
    contentType: 'video/mp4',
    upsert: true,
  })

  if (error) {
    throw new Error(`Supabase upload failed for ${objectPath}: ${error.message}`)
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(objectPath)
  const publicUrl = data?.publicUrl || ''

  if (!publicUrl) {
    throw new Error(`Supabase did not return a public URL for ${bucketName}/${objectPath}`)
  }

  console.log('✅ Supabase upload complete:', publicUrl)
  return publicUrl
}

async function resolveVideoUrl(seedFileName: string, testVideosDir: string, state: RotationState): Promise<string> {
  const localVideoPath = path.resolve(testVideosDir, seedFileName)
  if (!fs.existsSync(localVideoPath)) {
    throw new Error(`Missing test video: ${localVideoPath}`)
  }

  const publicBaseUrl = process.env.TEST_VIDEO_PUBLIC_BASE_URL?.trim()
  if (publicBaseUrl) {
    const base = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl
    return `${base}/${encodeURIComponent(seedFileName)}`
  }

  const existing = state.uploadedVideoUrls[seedFileName]
  if (existing) return existing

  const uploadedUrl = await uploadVideoToSupabase(localVideoPath, seedFileName)
  state.uploadedVideoUrls[seedFileName] = uploadedUrl
  return uploadedUrl
}

async function main(): Promise<void> {
  await loadCampaignSecretsFromGoogleSecretManager()
  assertCampaignSecretsAreAvailable()

  const config = getConfig()

  const seeds = getTestVideoCampaignSeeds()
  if (seeds.length === 0) throw new Error('No test video campaign seeds configured')

  const state = readState()
  const index = Math.abs(state.nextIndex) % seeds.length
  const seed = seeds[index]
  state.nextIndex = (index + 1) % seeds.length
  state.lastUpdatedAt = new Date().toISOString()

  const testVideosDir = process.env.TEST_VIDEOS_DIR || path.resolve(process.cwd(), 'test-campaign-videos')
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  const enabledPlatforms = getEnabledPlatforms()

  const caption = buildCaption({
    title: seed.title,
    productDescription: seed.productDescription,
    websiteUrl: seed.websiteUrl,
    hashtags: seed.hashtags,
  })

  if (!seed.videoFileName) {
    throw new Error(`Seed is missing videoFileName: ${seed.title}`)
  }

  const localVideoPath = path.resolve(testVideosDir, seed.videoFileName)
  if (!fs.existsSync(localVideoPath)) {
    throw new Error(`Missing test video: ${localVideoPath}`)
  }

  const videoUrl = dryRun ? `file://${localVideoPath}` : await resolveVideoUrl(seed.videoFileName, testVideosDir, state)

  console.log('🎯 Test video campaign slot selected')
  console.log({
    rotationIndex: index,
    title: seed.title,
    videoFileName: seed.videoFileName,
    websiteUrl: seed.websiteUrl,
    dryRun,
  })

  if (dryRun) {
    console.log('DRY_RUN_LOG_ONLY=true; skipping social posting')
    console.log({
      videoUrl,
      caption,
      enabledPlatforms: [...enabledPlatforms],
      expectedGoogleSecretNames: TEST_CAMPAIGN_SECRET_NAMES,
      twitterDisabled: true,
    })
    writeState(state)
    return
  }

  let anySucceeded = false

  if (isPlatformEnabled('instagram', enabledPlatforms) && config.INSTAGRAM_ACCESS_TOKEN && getInstagramAccountId()) {
    await postToInstagram(videoUrl, caption, config.INSTAGRAM_ACCESS_TOKEN, getInstagramAccountId())
    anySucceeded = true
    console.log('✅ Posted to Instagram')
  }

  if (isPlatformEnabled('pinterest', enabledPlatforms) && config.PINTEREST_ACCESS_TOKEN && config.PINTEREST_BOARD_ID) {
    await postToPinterest(videoUrl, caption, config.PINTEREST_ACCESS_TOKEN, config.PINTEREST_BOARD_ID)
    anySucceeded = true
    console.log('✅ Posted to Pinterest')
  }

  const youtubeCreds = getYouTubeCredentials()
  if (isPlatformEnabled('youtube', enabledPlatforms) && youtubeCreds.clientId && youtubeCreds.clientSecret && youtubeCreds.refreshToken) {
    await postToYouTube(
      videoUrl,
      caption,
      youtubeCreds.clientId,
      youtubeCreds.clientSecret,
      youtubeCreds.refreshToken,
      (process.env.YT_PRIVACY_STATUS as 'public' | 'unlisted' | 'private') || 'unlisted'
    )
    anySucceeded = true
    console.log('✅ Posted to YouTube')
  }

  if (isPlatformEnabled('twitter', enabledPlatforms) || isPlatformEnabled('x', enabledPlatforms)) {
    const tw = await postToTwitter(videoUrl, caption)
    anySucceeded = true
    console.log('✅ Posted to Twitter', tw)
  }

  if (!anySucceeded) {
    throw new Error(
      'No enabled platform had valid credentials. Configure ENABLE_PLATFORMS for instagram/pinterest/youtube and ensure required secrets exist in Google Secret Manager. Twitter/X is disabled.'
    )
  }

  writeState(state)
  console.log('✅ Test video campaign slot completed')
}

main().catch((error) => {
  console.error('❌ Test video campaign failed:', error)
  process.exit(1)
})
