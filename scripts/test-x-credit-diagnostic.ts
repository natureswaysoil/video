import assert from 'assert'
import { diagnose, safeProblem } from './diagnose-x-access'

async function main() {
  let bearerCalls = 0
  const secret = 'private-token-value'
  const reports = await diagnose([
    { credential: 'app-login-fails', prepare: async () => { throw { code: 401, data: { title: 'Invalid credential', detail: secret } } } },
    { credential: 'bearer-works', prepare: async () => ({ v2: { get: async endpoint => { bearerCalls++; assert.strictEqual(endpoint, 'usage/credits'); return { data: { total_balance: 49.09, prepaid_balance: 49.09, free_balance: 0, private_field: secret } } } } }) }
  ], [secret])
  assert.strictEqual(bearerCalls, 1, 'Independent bearer lookup must survive app authorization failure')
  assert.strictEqual(reports[0].failed, true)
  assert.strictEqual(reports[0].stage, 'credential-preparation')
  assert.strictEqual(reports[1].balances.total_balance, 49.09)
  assert(!JSON.stringify(reports).includes(secret))
  assert(!JSON.stringify(reports).includes('private_field'))
  const lookupFailure = await diagnose([
    { credential: 'blocked', prepare: async () => ({ v2: { get: async () => { throw { code: 402, data: { title: 'CreditsDepleted', client_id: '123456', detail: 'Bearer unexpected-token' } } } } }) },
    { credential: 'invalid-response', prepare: async () => ({ v2: { get: async () => ({ data: { total_balance: '49.09' } }) } }) }
  ], [])
  assert.strictEqual(lookupFailure[0].stage, 'credit-lookup')
  assert.strictEqual(lookupFailure[0].http, 402)
  assert.strictEqual(lookupFailure[0].problem.detail, 'Bearer [redacted]')
  assert.strictEqual(lookupFailure[1].failed, true, 'Malformed balances must not be reported as a successful lookup')
  assert.deepStrictEqual(safeProblem({ data: { headers: { authorization: secret }, title: 'Safe' } }, [secret]), { http: null, problem: { title: 'Safe' } })
  console.log('X diagnostic isolation, redaction, error stages and balance validation passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
