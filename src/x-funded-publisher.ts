import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { TwitterApi } from 'twitter-api-v2'
import { automaticXPostingAllowed, XPostingDisabledError } from './x-posting-policy'

export const EXPECTED_X_USERNAME = 'JamesJones90703'
export const MINIMUM_X_CREDIT_USD = 1

export class XPublishError extends Error {
  constructor(public readonly stage: string, public readonly http: number | undefined, public readonly problem: Record<string, string>, public readonly postAttempted: boolean) {
    super(`X ${stage} stopped${http ? ` (HTTP ${http})` : ''}`)
    this.name = 'XPublishError'
  }
}

export function xPublishError(error: any, stage: string, postAttempted: boolean, env: NodeJS.ProcessEnv = process.env) {
  if (error instanceof XPublishError) return error
  const raw = Number(error?.code || error?.response?.status)
  const http = Number.isFinite(raw) && raw >= 100 && raw <= 599 ? raw : undefined
  const body = error?.data || error?.response?.data || {}
  const problem: Record<string, string> = {}
  for (const key of ['title', 'detail', 'type', 'client_id', 'reason']) {
    if (!['string', 'number'].includes(typeof body[key])) continue
    let value = String(body[key])
    for (const [name, secret] of Object.entries(env)) {
      if (/TWITTER.*(TOKEN|SECRET|KEY|CLIENT_ID)/.test(name) && secret && secret.length >= 6) value = value.split(secret).join('[redacted]')
    }
    problem[key] = value.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500)
  }
  return new XPublishError(stage, http, problem, postAttempted)
}

export async function verifyFundedXClient(client: any) {
  let stage = 'account-verification'
  let sensitiveEnv = process.env
  try {
    const { data: account } = await client.v2.me()
    if (!account?.id || account.username?.toLowerCase() !== EXPECTED_X_USERNAME.toLowerCase()) {
      throw new XPublishError(stage, undefined, { reason: `Authenticated account must be @${EXPECTED_X_USERNAME}` }, false)
    }
    stage = 'credit-preflight'
    const appClient = await client.appLogin()
    const appTokens = appClient.getActiveTokens?.()
    sensitiveEnv = { ...process.env, TWITTER_RUNTIME_BEARER_TOKEN: appTokens?.bearerToken }
    const credits = await appClient.v2.get('usage/credits')
    const balance = credits?.data?.total_balance
    if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < MINIMUM_X_CREDIT_USD) {
      throw new XPublishError(stage, undefined, { reason: `Verified API credit balance must be at least $${MINIMUM_X_CREDIT_USD}` }, false)
    }
    console.log('Verified funded X connection', { username: account.username, userId: account.id, balanceUsd: balance, authMode: 'oauth1-user' })
    return { client, account, balanceUsd: balance }
  } catch (error) { throw xPublishError(error, stage, false, sensitiveEnv) }
}

export function fundedXClient(env: NodeJS.ProcessEnv = process.env) {
  const accessSecret = env.TWITTER_ACCESS_TOKEN_SECRET?.trim() || env.TWITTER_ACCESS_SECRET?.trim()
  if (!env.TWITTER_API_KEY?.trim() || !env.TWITTER_API_SECRET?.trim() || !env.TWITTER_ACCESS_TOKEN?.trim() || !accessSecret) {
    throw new XPublishError('credential-preparation', undefined, { reason: 'Funded-app OAuth1 user credentials are required; no OAuth2 or bearer fallback is permitted' }, false)
  }
  return new TwitterApi({ appKey: env.TWITTER_API_KEY.trim(), appSecret: env.TWITTER_API_SECRET.trim(), accessToken: env.TWITTER_ACCESS_TOKEN.trim(), accessSecret })
}

export async function publishWithVerifiedX(client: any, video: Buffer, caption: string) {
  let stage = 'media-upload-v2'
  let postAttempted = false
  try {
    // Both entry points verify identity and payer using this same signed client.
    await verifyFundedXClient(client)
    let mediaId: string
    try {
      mediaId = await client.v2.uploadMedia(video, { media_type: 'video/mp4', media_category: 'tweet_video' })
    } catch (error: any) {
      const http = Number(error?.code || error?.response?.status)
      // A rejected authentication/endpoint can use the OAuth1 media endpoint.
      // Payment, throttling, server errors and uncertain responses never replay.
      if (![401, 403, 404, 405].includes(http)) throw error
      stage = 'media-upload-v1'
      mediaId = await client.v1.uploadMedia(video, { mimeType: 'video/mp4', target: 'tweet' })
    }
    if (!mediaId) throw new XPublishError(stage, undefined, { reason: 'X returned no media ID' }, false)
    stage = 'create-post'
    postAttempted = true
    // One request only: never retry an uncertain post creation response.
    const { data } = await client.v2.tweet({ text: caption.slice(0, 280), media: { media_ids: [mediaId] } })
    if (!data?.id) throw new XPublishError(stage, undefined, { reason: 'X returned no post ID; reconcile before retrying' }, true)
    return { platform: 'twitter', tweetId: String(data.id), mediaId, authMode: 'oauth1-user' }
  } catch (error) { throw xPublishError(error, stage, postAttempted) }
}

export async function publishFundedXVideo(videoFileOrUrl: string, caption: string) {
  if (!automaticXPostingAllowed()) throw new XPostingDisabledError()
  const client = fundedXClient()
  let local = videoFileOrUrl
  let dir: string | undefined
  try {
    if (/^https?:\/\//i.test(videoFileOrUrl)) {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'funded-x-'))
      local = path.join(dir, 'video.mp4')
      const response = await axios.get(videoFileOrUrl, { responseType: 'arraybuffer', timeout: 180000, maxContentLength: 500 * 1024 * 1024 })
      fs.writeFileSync(local, Buffer.from(response.data))
    }
    if (fs.statSync(local).size > 500 * 1024 * 1024) throw new Error('Video exceeds X size limit')
    return await publishWithVerifiedX(client, fs.readFileSync(local), caption)
  } finally { if (dir) fs.rmSync(dir, { recursive: true, force: true }) }
}
