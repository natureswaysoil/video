import 'dotenv/config'
import { fetchVideoUrlFromWaveSpeed } from '../src/wavespeed'

async function main() {
  const jobId = process.argv[2]
  if (!jobId) {
    console.error('Usage: ts-node scripts/test-wavespeed-lookup.ts <jobId>')
    process.exit(1)
  }
  try {
    const url = await fetchVideoUrlFromWaveSpeed(jobId)
    console.log('Resolved video URL:', url)
  } catch (e: any) {
    console.error('Lookup error:', e?.message || e)
    process.exit(2)
  }
}

main()
