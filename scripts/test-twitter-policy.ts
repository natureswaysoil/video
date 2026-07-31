import assert from 'node:assert/strict'
import {
  getTwitterErrorStatus,
  isInvalidTwitterOAuth2TokenError,
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

const invalidRefreshToken = {
  code: 400,
  data: {
    error: 'invalid_request',
    error_description: 'Value passed for the token was invalid.',
    errors: [{ code: 131, message: 'invalid_request' }],
  },
}

assert.equal(isInvalidTwitterOAuth2TokenError(invalidRefreshToken), true)
assert.equal(
  isInvalidTwitterOAuth2TokenError({ response: { status: 401, data: { error: 'invalid_token' } } }),
  false
)
assert.equal(isInvalidTwitterOAuth2TokenError({ code: 500, data: { error: 'invalid_request' } }), false)

console.log('Twitter retry policy tests passed')
