import assert from 'node:assert/strict'
import { buildRowFieldBatchData } from '../src/sheets'
import { settlePlatformResults } from '../src/cli'
import { DidClient } from '../src/did'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function testBatchWriteData() {
  const data = buildRowFieldBatchData({
    sheetName: 'Sheet1',
    headers: ['Job_ID', 'Video_URL'],
    rowNumber: 7,
    updates: {
      Video_URL: 'https://example.com/video.mp4',
      DID_MODE: 'clips',
      Empty_Field: '',
    },
  })

  assert.deepEqual(data, [
    { range: 'Sheet1!B7', values: [['https://example.com/video.mp4']] },
    { range: 'Sheet1!C1', values: [['DID_MODE']] },
    { range: 'Sheet1!C7', values: [['clips']] },
  ])
}

async function testConcurrentPlatformSettlement() {
  const start = Date.now()

  const anySucceeded = await settlePlatformResults([
    async () => {
      await sleep(80)
      return true
    },
    async () => {
      await sleep(15)
      throw new Error('simulated platform failure')
    },
  ])

  const elapsed = Date.now() - start
  assert.equal(anySucceeded, true)
  assert.ok(elapsed < 150, `Expected concurrent execution; elapsed=${elapsed}ms`)

  const noneSucceeded = await settlePlatformResults([
    async () => false,
    async () => {
      throw new Error('failed')
    },
  ])
  assert.equal(noneSucceeded, false)
}

async function testDidModeHintAndFallback() {
  process.env.DID_API_KEY = process.env.DID_API_KEY || 'test-key'

  const hinted = new DidClient()
  const hintedCalls: string[] = []
  ;(hinted as any).axios = {
    get: async (path: string) => {
      hintedCalls.push(path)
      return { data: { status: 'done', result_url: 'https://example.com/hinted.mp4' } }
    },
  }

  const hintedResult = await hinted.getJobStatus('job-hinted', 'clips')
  assert.equal(hintedResult.mode, 'clips')
  assert.equal(hintedCalls.length, 1)
  assert.equal(hintedCalls[0], '/clips/job-hinted')

  const legacy = new DidClient()
  const legacyCalls: string[] = []
  ;(legacy as any).axios = {
    get: async (path: string) => {
      legacyCalls.push(path)
      if (path === '/talks/job-legacy') {
        throw new Error('legacy talk endpoint miss')
      }
      return { data: { status: 'done', result_url: 'https://example.com/legacy.mp4' } }
    },
  }

  const legacyResult = await legacy.getJobStatus('job-legacy')
  assert.equal(legacyResult.mode, 'clips')
  assert.deepEqual(legacyCalls, ['/talks/job-legacy', '/clips/job-legacy'])
}

async function main() {
  await testBatchWriteData()
  await testConcurrentPlatformSettlement()
  await testDidModeHintAndFallback()
  console.log('✅ Performance optimization tests passed')
  process.exit(0)
}

main().catch((error) => {
  console.error('❌ Performance optimization tests failed:', error)
  process.exit(1)
})
