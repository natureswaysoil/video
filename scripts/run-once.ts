// @ts-nocheck
import 'dotenv/config'
import { loadSecretsToEnv } from '../src/secret-manager'
import { getDailySeeds } from '../src/content-seed-bank'
import { generateScript } from '../src/openai'
import { mapProductToHeyGenPayload } from '../src/heygen-adapter'
import { createClientWithSecrets as createHeyGenClient } from '../src/heygen'
import { postToInstagram } from '../src/instagram'
import { postToYouTube } from '../src/youtube'
import { getConfig } from '../src/config-validator'
import { spawn } from 'child_process'

function runCommand(command: string, args: string[], env: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('exit', (code: number | null) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

function pickFirstEnv(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

async function runDirectSeedVideo(env: any): Promise<void> {
  console.log('No CSV_URL found. Running direct seed video with no Google Sheet dependency.')

  const seed = getDailySeeds(1)[0]
  const product = {
    Title: seed.title,
    title: seed.title,
    Description: seed.productDescription,
    description: seed.productDescription,
    Visual_Prompt: seed.visualPrompt,
    Website_URL: seed.websiteUrl,
    Platform: seed.platform,
  }

  console.log('Using generated seed:', {
    title: seed.title,
    angle: seed.angle,
    websiteUrl: seed.websiteUrl,
  })

  const script = await generateScript(product)
  console.log('Script generated:', script)

  const mapping = await mapProductToHeyGenPayload(product)
  const heygen = await createHeyGenClient()
  const videoId = await heygen.createVideoJob({
    ...mapping.payload,
    script,
  } as any)

  console.log('HeyGen video job created:', videoId)

  const videoUrl = await heygen.pollJobForVideoUrl(videoId, {
    timeoutMs: Number(env.HEYGEN_POLL_TIMEOUT_MS || 1500000),
    intervalMs: Number(env.HEYGEN_POLL_INTERVAL_MS || 15000),
  })

  console.log('Video completed:', videoUrl)

  const caption = `${seed.productDescription}\n\nOrder direct from Nature's Way Soil:\n${seed.websiteUrl}`
  const enabled = (env.ENABLE_PLATFORMS || 'youtube,instagram').toLowerCase()

  if (String(env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true') {
    console.log('DRY_RUN_LOG_ONLY=true; skipping social posting.', { videoUrl, caption })
    return
  }

  const config = getConfig()

  if (enabled.includes('youtube')) {
    const clientId = pickFirstEnv(['YT_CLIENT_ID', 'YOUTUBE_CLIENT_ID', 'CLIENT_ID']) || config.YT_CLIENT_ID
    const clientSecret = pickFirstEnv(['YT_CLIENT_SECRET', 'YOUTUBE_CLIENT_SECRET', 'CLIENT_SECRET']) || config.YT_CLIENT_SECRET
    const refreshToken = pickFirstEnv(['YT_REFRESH_TOKEN', 'YOUTUBE_REFRESH_TOKEN', 'YOUTUBE_OAUTH_REFRESH_TOKEN', 'REFRESH_TOKEN']) || config.YT_REFRESH_TOKEN
    if (clientId && clientSecret && refreshToken) {
      console.log('Posting to YouTube...')
      await postToYouTube(videoUrl, caption, clientId, clientSecret, refreshToken, (process.env.YT_PRIVACY_STATUS as any) || 'public')
    } else {
      console.warn('Skipping YouTube: missing OAuth credentials')
    }
  }

  if (enabled.includes('instagram')) {
    const igToken = config.INSTAGRAM_ACCESS_TOKEN
    const igId = config.INSTAGRAM_IG_ID || process.env.INSTAGRAM_USER_ID || process.env.INSTAGRAM_ACCOUNT_ID || ''
    if (igToken && igId) {
      console.log('Posting to Instagram...')
      await postToInstagram(videoUrl, caption, igToken, igId)
    } else {
      console.warn('Skipping Instagram: missing access token or IG ID')
    }
  }

  console.log('Direct seed video finished:', {
    videoUrl,
    landingPage: seed.websiteUrl,
  })
}

async function main() {
  await loadSecretsToEnv()

  const rotationMode = String(process.env.USE_SEED_ROTATION || '').toLowerCase() === 'true'
  const env: any = {
    ...process.env,
    RUN_ONCE: 'true',
    ROWS_PER_RUN: process.env.ROWS_PER_RUN || '1',
    DAILY_ROW_COUNT: process.env.DAILY_ROW_COUNT || '1',
    ALWAYS_GENERATE_NEW_VIDEO: process.env.ALWAYS_GENERATE_NEW_VIDEO || 'true',
    ENABLE_PLATFORMS: process.env.ENABLE_PLATFORMS || 'youtube,instagram',
  }

  console.log('Starting one-video end-to-end pipeline')
  console.log('Settings:', {
    RUN_ONCE: env.RUN_ONCE,
    ROWS_PER_RUN: env.ROWS_PER_RUN,
    DAILY_ROW_COUNT: env.DAILY_ROW_COUNT,
    ALWAYS_GENERATE_NEW_VIDEO: env.ALWAYS_GENERATE_NEW_VIDEO,
    ENABLE_PLATFORMS: env.ENABLE_PLATFORMS,
    USE_SEED_ROTATION: rotationMode,
    HAS_CSV_URL: Boolean(env.CSV_URL || env.GOOGLE_SHEET_CSV_URL),
  })

  if (rotationMode) {
    console.log('USE_SEED_ROTATION=true. Running top-products rotation through src/cli.ts.')
    await runCommand('ts-node', ['src/cli.ts'], env)
    console.log('One-video rotation pipeline finished')
    return
  }

  const hasSheet = Boolean(env.CSV_URL || env.GOOGLE_SHEET_CSV_URL)

  if (hasSheet) {
    console.log('Sheet URL found. Generating one fresh content row into Google Sheet.')
    await runCommand('ts-node', ['scripts/generate-rows.ts'], env)

    console.log('Processing one sheet row into one video.')
    await runCommand('ts-node', ['src/cli.ts'], env)
  } else {
    await runDirectSeedVideo(env)
  }

  console.log('One-video pipeline finished')
}

main().catch((error) => {
  console.error('One-video pipeline failed:', error)
  process.exit(1)
})
