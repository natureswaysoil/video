import 'dotenv/config'
import { loadSecretsToEnv } from '../src/secret-manager'
import { getDailySeeds } from '../src/content-seed-bank'
import { generateScript } from '../src/openai'
import { mapProductToHeyGenPayload } from '../src/heygen-adapter'
import { createClientWithSecrets as createHeyGenClient } from '../src/heygen'
import { postToInstagram } from '../src/instagram'
import { postToYouTube } from '../src/youtube'
import { spawn } from 'child_process'

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

async function runDirectSeedVideo(env: NodeJS.ProcessEnv): Promise<void> {
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

  const mapping = mapProductToHeyGenPayload(product)
  const heygen = await createHeyGenClient()
  const videoId = await heygen.createVideoJob({
    ...mapping.payload,
    script,
  } as any)

  console.log('HeyGen video job created:', videoId)

  const videoUrl = await heygen.pollJobForVideoUrl(videoId, {
    timeoutMs: Number(env.HEYGEN_POLL_TIMEOUT_MS || 120000),
    intervalMs: Number(env.HEYGEN_POLL_INTERVAL_MS || 15000),
  })

  console.log('Video completed:', videoUrl)

  const caption = `${seed.productDescription}\n\nOrder direct from Nature's Way Soil:\n${seed.websiteUrl}`
  const enabled = (env.ENABLE_PLATFORMS || 'youtube,instagram').toLowerCase()

  if (String(env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true') {
    console.log('DRY_RUN_LOG_ONLY=true; skipping social posting.', { videoUrl, caption })
    return
  }

  if (enabled.includes('youtube')) {
    console.log('Posting to YouTube...')
    await postToYouTube({ videoUrl, title: seed.title, description: caption })
  }

  if (enabled.includes('instagram')) {
    console.log('Posting to Instagram...')
    await postToInstagram({ videoUrl, caption })
  }

  console.log('Direct seed video finished:', {
    videoUrl,
    landingPage: seed.websiteUrl,
  })
}

async function main() {
  await loadSecretsToEnv()

  const env = {
    ...process.env,
    RUN_ONCE: 'true',
    ROWS_PER_RUN: process.env.ROWS_PER_RUN || '1',
    DAILY_ROW_COUNT: process.env.DAILY_ROW_COUNT || '1',
    ALWAYS_GENERATE_NEW_VIDEO: process.env.ALWAYS_GENERATE_NEW_VIDEO || 'true',
    ENABLE_PLATFORMS: process.env.ENABLE_PLATFORMS || 'youtube,instagram,facebook',
  }

  console.log('Starting one-video end-to-end pipeline test')
  console.log('Settings:', {
    RUN_ONCE: env.RUN_ONCE,
    ROWS_PER_RUN: env.ROWS_PER_RUN,
    DAILY_ROW_COUNT: env.DAILY_ROW_COUNT,
    ALWAYS_GENERATE_NEW_VIDEO: env.ALWAYS_GENERATE_NEW_VIDEO,
    ENABLE_PLATFORMS: env.ENABLE_PLATFORMS,
    HAS_CSV_URL: Boolean(env.CSV_URL || env.GOOGLE_SHEET_CSV_URL),
  })

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
