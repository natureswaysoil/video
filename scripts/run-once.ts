import 'dotenv/config'
import { spawn } from 'child_process'

async function main() {
  const env = {
    ...process.env,
    RUN_ONCE: 'true',
    ROWS_PER_RUN: process.env.ROWS_PER_RUN || '1',
    ALWAYS_GENERATE_NEW_VIDEO: process.env.ALWAYS_GENERATE_NEW_VIDEO || 'true',
    ENABLE_PLATFORMS: process.env.ENABLE_PLATFORMS || 'youtube,instagram,facebook',
  }

  console.log('🚀 Starting one-video end-to-end pipeline test')
  console.log('Settings:', {
    RUN_ONCE: env.RUN_ONCE,
    ROWS_PER_RUN: env.ROWS_PER_RUN,
    ALWAYS_GENERATE_NEW_VIDEO: env.ALWAYS_GENERATE_NEW_VIDEO,
    ENABLE_PLATFORMS: env.ENABLE_PLATFORMS,
  })

  await new Promise<void>((resolve, reject) => {
    const child = spawn('ts-node', ['src/cli.ts'], {
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`One-video pipeline exited with code ${code}`))
    })
  })

  console.log('✅ One-video pipeline finished')
}

main().catch((error) => {
  console.error('❌ One-video pipeline failed:', error)
  process.exit(1)
})
