import fs from 'fs'
import { createHash } from 'crypto'
import { TwitterApi } from 'twitter-api-v2'
import { loadSecretsToEnv, addSecretVersion } from '../src/secret-manager'

function safeText(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  let text = String(value)
  for (const [name, secret] of Object.entries(process.env)) {
    if (/TWITTER.*(TOKEN|SECRET|KEY|CLIENT_ID)/.test(name) && secret && secret.length >= 6) text = text.split(secret).join('[redacted]')
  }
  return text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500)
}

async function main() {
  if (process.env.X_DIAGNOSTIC_VALIDATE_ONLY === 'true') { console.log('X diagnosis validated; no API requests'); return }
  if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('Only the first main-branch attempt may diagnose')
  await loadSecretsToEnv(['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET', 'TWITTER_REFRESH_TOKEN', 'TWITTER_BEARER_TOKEN'])
  const reports: any[] = []
  async function credits(label: string, client: TwitterApi) {
    try {
      const response: any = await client.v2.get('usage/credits')
      const balances: any = {}
      for (const key of ['total_balance', 'prepaid_balance', 'free_balance']) {
        if (typeof response?.data?.[key] === 'number') balances[key] = response.data[key]
      }
      reports.push({ credential: label, endpoint: 'GET /2/usage/credits', http: 200, balances })
    } catch (error: any) {
      const body = error?.data || error?.response?.data || {}
      const problem: any = {}
      for (const key of ['title', 'detail', 'type', 'client_id', 'reason']) {
        const value = safeText(body[key]); if (value !== undefined) problem[key] = value
      }
      reports.push({ credential: label, endpoint: 'GET /2/usage/credits', http: Number(error?.code) || Number(error?.response?.status) || null, problem })
    }
  }
  if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET && process.env.TWITTER_REFRESH_TOKEN) {
    const auth = new TwitterApi({ clientId: process.env.TWITTER_CLIENT_ID, clientSecret: process.env.TWITTER_CLIENT_SECRET })
    const refreshed = await auth.refreshOAuth2Token(process.env.TWITTER_REFRESH_TOKEN)
    process.env.TWITTER_DIAGNOSTIC_ACCESS_TOKEN = refreshed.accessToken
    if (refreshed.refreshToken) {
      process.env.TWITTER_REFRESH_TOKEN = refreshed.refreshToken
      await addSecretVersion('TWITTER_REFRESH_TOKEN', refreshed.refreshToken)
    }
    console.log('Publisher OAuth client fingerprint', createHash('sha256').update(process.env.TWITTER_CLIENT_ID).digest('hex').slice(0, 12))
    console.log('Publisher authorized scopes', refreshed.scope)
    await credits('publisher-oauth2-user', refreshed.client)
  }
  if (process.env.TWITTER_BEARER_TOKEN) await credits('configured-app-bearer', new TwitterApi(process.env.TWITTER_BEARER_TOKEN))
  if (!reports.length) throw new Error('No supported credential available')
  const result = { checkedAt: new Date().toISOString(), runId: process.env.GITHUB_RUN_ID, publishingAttempted: false, reports }
  fs.writeFileSync('x-access-diagnostic.json', JSON.stringify(result, null, 2))
  console.log('X access diagnostic', JSON.stringify(result))
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'X billing diagnosis (no publishing):\n```json\n' + JSON.stringify(result, null, 2) + '\n```\n')
}
main().catch(() => { console.error('X diagnosis could not complete; no credentials or raw provider errors retained'); process.exitCode = 1 })
