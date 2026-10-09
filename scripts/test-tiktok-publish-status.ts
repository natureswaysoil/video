import assert from 'node:assert/strict'
import { waitForTikTokPublish } from './lib/tiktok-publish-status'

async function main() {
  let calls = 0
  const result = await waitForTikTokPublish('publish-1', async () => {
    calls++
    return calls === 1 ? { status: 'PROCESSING_DOWNLOAD' } : { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['post-123'] }
  }, { attempts: 2, sleep: async () => {} })
  assert.equal(calls, 2)
  assert.deepEqual(result.postIds, ['post-123'])
  await assert.rejects(waitForTikTokPublish('publish-failed', async () => ({ status: 'FAILED', fail_reason: 'video_pull_failed' })), /video_pull_failed/)
  await assert.rejects(waitForTikTokPublish('publish-pending', async () => ({ status: 'PROCESSING_DOWNLOAD' }), { attempts: 1 }), /still pending/)
  console.log('TikTok confirmed, failed, and pending status tests passed')
}
main().catch(error => { console.error(error); process.exit(1) })
