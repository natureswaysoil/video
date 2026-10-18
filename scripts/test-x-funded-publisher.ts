import assert from 'assert'
import { automaticXPostingAllowed } from '../src/x-posting-policy'
import { fundedXClient, publishWithVerifiedX, XPublishError, xPublishError } from '../src/x-funded-publisher'

function fixture(options: { username?: string, balance?: unknown, uploadError?: any, tweetError?: any } = {}) {
  const calls: string[] = []
  const client: any = {
    appLogin: async () => { calls.push('appLogin'); return { v2: { get: async () => { calls.push('credits'); return { data: { total_balance: options.balance === undefined ? 49.09 : options.balance } } } } } },
    v1: { uploadMedia: async () => { calls.push('upload-v1'); return 'media-v1' } },
    v2: {
      me: async () => { calls.push('me'); return { data: { id: 'user-1', username: options.username || 'JamesJones90703' } } },
      uploadMedia: async () => { calls.push('upload-v2'); if (options.uploadError) throw options.uploadError; return 'media-v2' },
      tweet: async () => { calls.push('tweet'); if (options.tweetError) throw options.tweetError; return { data: { id: 'post-1' } } }
    }
  }
  return { client, calls }
}

async function main() {
  assert(!automaticXPostingAllowed({}))
  assert(!automaticXPostingAllowed({ X_PAID_POSTING_ENABLED: 'false' }))
  assert(automaticXPostingAllowed({ X_PAID_POSTING_ENABLED: 'true' }))
  assert.throws(() => fundedXClient({ TWITTER_CLIENT_ID: 'old-client', TWITTER_CLIENT_SECRET: 'old-secret', TWITTER_REFRESH_TOKEN: 'old-refresh' }), (error: any) => error.stage === 'credential-preparation' && error.problem.reason.includes('OAuth1 user credentials are required'))
  const wrong = fixture({ username: 'DifferentAccount' })
  await assert.rejects(publishWithVerifiedX(wrong.client, Buffer.from('video'), 'caption'), XPublishError)
  assert.deepStrictEqual(wrong.calls, ['me'])
  for (const balance of [0, 0.99, '49.09', NaN]) {
    const low = fixture({ balance })
    await assert.rejects(publishWithVerifiedX(low.client, Buffer.from('video'), 'caption'), /credit-preflight/)
    assert(!low.calls.some(c => c.startsWith('upload') || c === 'tweet'))
  }
  const ok = fixture()
  assert.strictEqual((await publishWithVerifiedX(ok.client, Buffer.from('video'), 'caption')).tweetId, 'post-1')
  assert.deepStrictEqual(ok.calls, ['me', 'appLogin', 'credits', 'upload-v2', 'tweet'])
  const legacy = fixture({ uploadError: { code: 403 } })
  await publishWithVerifiedX(legacy.client, Buffer.from('video'), 'caption')
  assert.deepStrictEqual(legacy.calls.slice(-3), ['upload-v2', 'upload-v1', 'tweet'])
  for (const code of [402, 429, 500, undefined]) {
    const blocked = fixture({ uploadError: { code } })
    await assert.rejects(publishWithVerifiedX(blocked.client, Buffer.from('video'), 'caption'))
    assert(!blocked.calls.includes('upload-v1') && !blocked.calls.includes('tweet'))
  }
  const uncertain = fixture({ tweetError: { code: 500 } })
  await assert.rejects(publishWithVerifiedX(uncertain.client, Buffer.from('video'), 'caption'), (e: any) => e.postAttempted === true)
  assert.strictEqual(uncertain.calls.filter(c => c === 'tweet').length, 1)
  const safe = xPublishError({ code: 402, data: { title: 'CreditsDepleted', detail: 'private-token-value', authorization: 'private-token-value' } }, 'media-upload-v2', false, { TWITTER_ACCESS_TOKEN: 'private-token-value' })
  assert(!JSON.stringify(safe).includes('private-token-value'))
  console.log('Funded X identity, credit, opt-in, endpoint fallback, no-retry and redaction checks passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
