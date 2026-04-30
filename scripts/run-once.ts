import 'dotenv/config'
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

async function main() {
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
  })

  const hasSheet = Boolean(env.CSV_URL || env.GOOGLE_SHEET_CSV_URL)

  if (hasSheet) {
    console.log('Step 1: Sheet URL found. Generating one fresh content row into Google Sheet.')
    await runCommand('ts-node', ['scripts/generate-rows.ts'], env)

    console.log('Step 2: Processing one sheet row into one video.')
    await runCommand('ts-node', ['src/cli.ts'], env)
  } else {
    console.log('No CSV_URL found. Running direct seed test without Google Sheet.')
    await runCommand('ts-node', ['scripts/test-e2e-integration.ts'], {
      ...env,
      DRY_RUN: env.DRY_RUN || 'true',
      DRY_RUN_LOG_ONLY: env.DRY_RUN_LOG_ONLY || 'true',
    })
  }

  console.log('One-video pipeline finished')
}

main().catch((error) => {
  console.error('One-video pipeline failed:', error)
  process.exit(1)
})
