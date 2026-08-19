import { validateMarketingVideo } from './lib/video-quality-gate'

const file = process.argv[2]
if (!file) throw new Error('Usage: ts-node scripts/test-video-quality-gate.ts <video-file>')

try {
  const result = validateMarketingVideo(file)
  console.log(JSON.stringify({ passed: true, result }, null, 2))
} catch (error: any) {
  console.error(JSON.stringify({ passed: false, reason: error?.message || String(error) }, null, 2))
  process.exit(2)
}
