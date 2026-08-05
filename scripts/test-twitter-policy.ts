import assert from 'node:assert/strict'
import {
  getTwitterErrorStatus,
  isRetryableTwitterError,
  fitTweetText,
  fitTweetTextWithUrl,
} from '../src/twitter'

const paymentRequired = {
  code: 402,
  data: {
    status: 402,
    detail: 'credits depleted',
  },
}

assert.equal(getTwitterErrorStatus(paymentRequired), 402)
assert.equal(isRetryableTwitterError(paymentRequired), false)
assert.equal(isRetryableTwitterError({ response: { status: 400 } }), false)
assert.equal(isRetryableTwitterError({ response: { status: 401 } }), false)
assert.equal(isRetryableTwitterError({ response: { status: 403 } }), false)
assert.equal(isRetryableTwitterError({ response: { status: 429 } }), true)
assert.equal(isRetryableTwitterError({ response: { status: 500 } }), true)
assert.equal(isRetryableTwitterError(new Error('socket disconnected')), true)

const longCaption = 'x'.repeat(538)
assert.equal(fitTweetText(longCaption).length, 280)
assert.ok(fitTweetText(longCaption).endsWith('...'))
const videoUrl = 'https://example.com/videos/dog-urine-neutralizer-test.mp4'
const linkedTweet = fitTweetTextWithUrl(longCaption, videoUrl)
assert.ok(linkedTweet.length <= 280)
assert.ok(linkedTweet.endsWith(videoUrl))

console.log('Twitter retry policy tests passed')
