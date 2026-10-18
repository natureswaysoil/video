import assert from 'assert'
import axios from 'axios'
import { TwitterApi } from 'twitter-api-v2'
import { postToTwitter as scheduledPost } from './lib/social-platforms'
import { postToTwitter as legacyPost } from '../src/twitter'
import { XPostingDisabledError } from '../src/x-posting-policy'
import { marketingReceipt } from './lib/marketing-receipt'

async function main() {
  delete process.env.X_PAID_POSTING_ENABLED
  let requests = 0
  const originals = { get: axios.get, post: axios.post, refresh: TwitterApi.prototype.refreshOAuth2Token }
  const forbidden = async (): Promise<never> => { requests++; throw new Error('No external request permitted') }
  axios.get = forbidden as any
  axios.post = forbidden as any
  TwitterApi.prototype.refreshOAuth2Token = forbidden as any
  Object.assign(process.env, { TWITTER_CLIENT_ID: 'fake-client', TWITTER_CLIENT_SECRET: 'fake-secret', TWITTER_REFRESH_TOKEN: 'fake-refresh' })
  try {
    // An otherwise usable OAuth setup must still stop before refreshing or
    // downloading a video; no post ID may be fabricated for either entry point.
    const result = await scheduledPost('https://example.invalid/video.mp4', 'Free posting only')
    assert('skipped' in result)
    assert.strictEqual(result.skipped, true)
    assert(result.reason?.includes('@JamesJones90703'))
    assert(!('tweetId' in result))
    await assert.rejects(legacyPost('https://example.invalid/video.mp4', 'Free posting only'), XPostingDisabledError)
    assert.strictEqual(requests, 0)
    const receipt = marketingReceipt('job', 'campaign', ['twitter', 'youtube'], { youtube: true }, new Set(['twitter']), { youtubeId: 'verified-youtube-id' })
    assert.deepStrictEqual(receipt.channels.twitter, { status: 'skipped' })
    assert.deepStrictEqual(receipt.channels.youtube, { status: 'published', postId: 'verified-youtube-id' })
    console.log('Manual X policy blocks both posting paths before network access and preserves other channel receipts')
  } finally {
    axios.get = originals.get
    axios.post = originals.post
    TwitterApi.prototype.refreshOAuth2Token = originals.refresh
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
