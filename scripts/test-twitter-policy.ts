import assert from 'node:assert/strict'
import {
  getTwitterErrorStatus,
  isRetryableTwitterError,
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

console.log('Twitter retry policy tests passed')
