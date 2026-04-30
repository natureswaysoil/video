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

  console.log('🚀 Starting one-video end-to-end pipeline test')
  console.log('Settings:', {
    RUN_ONCE: env.RUN_ONCE,
    ROWS_PER_RUN: env.ROWS_PER_RUN,
    DAILY_ROW_COUNT: env.DAILY_ROW_COUNT,
    ALWAYS_GENERATE_NEW_VIDEO: env.ALWAYS_GENERATE_NEW_VIDEO,
    ENABLE_PLATFORMS: env.ENABLE_PLATFORMS,
  })

  console.log('🧠 Step 1: Generating one fresh content row')
  await runCommand('ts-node', ['scripts/generate-rows.ts'], env)

  console.log('🎬 Step 2: Processing one row into one video')
  await runCommand('ts-node', ['src/cli.ts'], env)

  console.log('✅ One-video pipeline finished')
}

main().catch((error) => {
  console.error('❌ One-video pipeline failed:', error)
  process.exit(1)
})
