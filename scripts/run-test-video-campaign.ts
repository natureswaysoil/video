// @ts-nocheck
import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import { loadSecretsToEnv } from '../src/secret-manager'
import { getConfig } from '../src/config-validator'
import { getTestVideoCampaignSeeds } from '../src/content-seed-bank'
import { uploadVideoToCloudinary } from '../src/cloudinary-upload'
import { postToInstagram } from '../src/instagram'
import { postToTwitter } from '../src/twitter'
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
  return new Set(enabledPlatformsEnv.split(',').map((value) => value.trim()).filter(Boolean))
}

function isPlatformEnabled(platform: string, enabledPlatforms: Set<string>): boolean {
  return enabledPlatforms.size === 0 || enabledPlatforms.has(platform)
}

function getInstagramAccountId(): string {
  return process.env.INSTAGRAM_IG_ID || process.env.INSTAGRAM_USER_ID || process.env.INSTAGRAM_ACCOUNT_ID || ''
}

function getYouTubeCredentials(): { clientId: string; clientSecret: string; refreshToken: string } {
  return {
    clientId: process.env.YT_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YT_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET || '',
    refreshToken: process.env.YT_REFRESH_TOKEN || process.env.YOUTUBE_REFRESH_TOKEN || '',
  }
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

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error(
      'No TEST_VIDEO_PUBLIC_BASE_URL provided and Cloudinary credentials are missing. Set TEST_VIDEO_PUBLIC_BASE_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.'
    )
  }

  const uploadedUrl = await uploadVideoToCloudinary(localVideoPath)
  state.uploadedVideoUrls[seedFileName] = uploadedUrl
  return uploadedUrl
}

async function main(): Promise<void> {
  const useSecretManager = String(process.env.USE_SECRET_MANAGER || 'false').toLowerCase() === 'true'
  if (useSecretManager) {
    try {
      await loadSecretsToEnv()
    } catch (error: any) {
      console.warn('Secret Manager load skipped:', error?.message || error)
    }
  }

  const config = getConfig()

  const seeds = getTestVideoCampaignSeeds()
  if (seeds.length === 0) throw new Error('No test video campaign seeds configured')

  const state = readState()
  const index = Math.abs(state.nextIndex) % seeds.length
  const seed = seeds[index]
  state.nextIndex = (index + 1) % seeds.length
  state.lastUpdatedAt = new Date().toISOString()

  const testVideosDir = process.env.TEST_VIDEOS_DIR || '/home/ubuntu/test_videos'
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

  const videoUrl = dryRun
    ? `file://${localVideoPath}`
    : await resolveVideoUrl(seed.videoFileName, testVideosDir, state)

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
    console.log({ videoUrl, caption, enabledPlatforms: [...enabledPlatforms] })
    writeState(state)
    return
  }

  let anySucceeded = false

  if (isPlatformEnabled('instagram', enabledPlatforms) && config.INSTAGRAM_ACCESS_TOKEN && getInstagramAccountId()) {
    await postToInstagram(videoUrl, caption, config.INSTAGRAM_ACCESS_TOKEN, getInstagramAccountId())
    anySucceeded = true
    console.log('✅ Posted to Instagram')
  }

  const hasTwitterUploadCreds = Boolean(
    process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET
  )
  if (isPlatformEnabled('twitter', enabledPlatforms) && (config.TWITTER_BEARER_TOKEN || hasTwitterUploadCreds)) {
    await postToTwitter(videoUrl, caption, config.TWITTER_BEARER_TOKEN)
    anySucceeded = true
    console.log('✅ Posted to Twitter/X')
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

  if (!anySucceeded) {
    throw new Error('No enabled platform had valid credentials. Configure ENABLE_PLATFORMS and platform secrets.')
  }

  writeState(state)
  console.log('✅ Test video campaign slot completed')
}

main().catch((error) => {
  console.error('❌ Test video campaign failed:', error)
  process.exit(1)
})
