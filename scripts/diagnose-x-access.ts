import fs from 'fs'
import { createHash } from 'crypto'
import { TwitterApi } from 'twitter-api-v2'
import { loadSecretToEnv } from '../src/secret-manager'

export type CreditClient = { v2: { get: (endpoint: string) => Promise<any> } }
export type Probe = { credential: string, prepare: () => Promise<CreditClient> }

export function safeProblem(error: any, secrets: string[]) {
  const body = error?.data || error?.response?.data || {}
  const problem: Record<string, string> = {}
  for (const key of ['title', 'detail', 'type', 'client_id', 'reason']) {
    if (typeof body[key] !== 'string' && typeof body[key] !== 'number') continue
    let value = String(body[key])
    for (const secret of secrets.filter(s => s.length >= 6)) value = value.split(secret).join('[redacted]')
    problem[key] = value.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500)
  }
  return { http: Number(error?.code) || Number(error?.response?.status) || null, problem }
}

export async function diagnose(probes: Probe[], secrets: string[]) {
  const reports: any[] = []
  for (const probe of probes) {
    let stage = 'credential-preparation'
    try {
      const client = await probe.prepare()
      stage = 'credit-lookup'
      const response = await client.v2.get('usage/credits')
      const balances: Record<string, number> = {}
      for (const key of ['total_balance', 'prepaid_balance', 'free_balance']) {
        if (typeof response?.data?.[key] === 'number' && Number.isFinite(response.data[key])) balances[key] = response.data[key]
      }
      if (!Object.keys(balances).length) throw new Error('No numeric credit balance returned')
      reports.push({ credential: probe.credential, endpoint: 'GET /2/usage/credits', http: 200, balances, failed: false })
    } catch (error: any) {
      reports.push({ credential: probe.credential, endpoint: 'GET /2/usage/credits', stage, ...safeProblem(error, secrets), failed: true })
    }
  }
  return reports
}

async function main() {
  if (process.env.X_DIAGNOSTIC_VALIDATE_ONLY === 'true') { console.log('X diagnosis validated; no API requests'); return }
  if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('Only the first main-branch attempt may diagnose')
  const reports: any[] = []
  let failed = false
  try {
    // No publisher refresh token or client secret is loaded or refreshed.
    // App-only client_credentials authorization cannot rotate the publisher's user token.
    for (const name of ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_BEARER_TOKEN', 'TWITTER_CLIENT_ID']) {
      try { await loadSecretToEnv(name) }
      catch { reports.push({ credential: name, stage: 'secret-loading', failed: true }); failed = true }
    }
    const secrets = Object.entries(process.env).filter(([key]) => /TWITTER.*(TOKEN|SECRET|KEY|CLIENT_ID)/.test(key)).map(([, value]) => value || '')
    const probes: Probe[] = []
    if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET) {
      probes.push({ credential: 'consumer-key-app-only', prepare: async () => {
        const client = await new TwitterApi({ appKey: process.env.TWITTER_API_KEY!, appSecret: process.env.TWITTER_API_SECRET! }).appLogin()
        const tokens: any = client.getActiveTokens()
        if (tokens.bearerToken) secrets.push(tokens.bearerToken)
        return client
      } })
    }
    if (process.env.TWITTER_BEARER_TOKEN) probes.push({ credential: 'configured-app-bearer', prepare: async () => new TwitterApi(process.env.TWITTER_BEARER_TOKEN!) })
    if (process.env.TWITTER_CLIENT_ID) console.log('Publisher OAuth client fingerprint', createHash('sha256').update(process.env.TWITTER_CLIENT_ID).digest('hex').slice(0, 12))
    reports.push(...await diagnose(probes, secrets))
    if (!probes.length) { reports.push({ stage: 'credential-preparation', failed: true, reason: 'No app-only credential available' }); failed = true }
  } catch {
    reports.push({ stage: 'diagnostic', failed: true, reason: 'Unexpected diagnostic failure; raw error omitted' }); failed = true
  } finally {
    const result = { checkedAt: new Date().toISOString(), runId: process.env.GITHUB_RUN_ID, publishingAttempted: false, publisherTokenRefreshed: false, limitation: 'App-only balances do not establish that the separate publisher OAuth2 client belongs to the same app/project.', reports }
    fs.writeFileSync('x-access-diagnostic.json', JSON.stringify(result, null, 2))
    console.log('X access diagnostic', JSON.stringify(result))
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'X billing diagnosis (no publishing or user-token refresh):\n```json\n' + JSON.stringify(result, null, 2) + '\n```\n')
    if (failed || reports.some(report => report.failed)) process.exitCode = 1
  }
}
if (require.main === module) main().catch(() => { console.error('X diagnosis could not start; no raw credential errors retained'); process.exitCode = 1 })
