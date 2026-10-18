import fs from 'fs'
import os from 'os'
import path from 'path'
import { Storage } from '@google-cloud/storage'
import { loadSecretsToEnv } from '../src/secret-manager'
import { fundedXClient, publishFundedXVideo, verifyFundedXClient, XPublishError } from '../src/x-funded-publisher'
import { validateMarketingVideo } from './lib/video-quality-gate'

async function main() {
  const request = JSON.parse(fs.readFileSync('config/x-paid-activation.json', 'utf8'))
  if (request.enabled !== true || request.id !== 'x-paid-bone-meal-20261018-v1' || request.sourceObject !== 'social-videos/1792357833107-liquid-bone-meal-fertilizer-scheduled-mp4-mp4.mp4') throw new Error('Unexpected authorized X activation')
  if (request.caption !== "Liquid Bone Meal Fertilizer from Nature's Way Soil. Calcium and phosphorus for vegetables, trees and shrubs. Explore the product: https://natureswaysoil.com/product/NWS_012 #NaturesWaySoil") throw new Error('Unexpected approved copy')
  if (process.env.X_SETUP_VALIDATE_ONLY === 'true') { console.log('X activation validated without network or publishing'); return }
  if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1' || process.env.X_PAID_POSTING_ENABLED !== 'true') throw new Error('Only the authorized first main-branch attempt may publish')
  const receipt: any = { requestId: request.id, sourceObject: request.sourceObject, runId: process.env.GITHUB_RUN_ID, status: 'blocked', postAttempted: false }
  let dir: string | undefined
  let claim: any
  let generation: number | undefined
  try {
    await loadSecretsToEnv(['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET', 'TWITTER_ACCESS_SECRET'])
    claim = new Storage().bucket('natureswaysoil-social-videos').file(`state/x-posts/${request.id}.json`)
    // Reserve before any X call. Do not release or replay a lost response.
    await claim.save(JSON.stringify({ ...receipt, claimedAt: new Date().toISOString() }), { resumable: false, contentType: 'application/json', preconditionOpts: { ifGenerationMatch: 0 } })
    const [metadata] = await claim.getMetadata()
    generation = Number(metadata.generation)
    const session = await verifyFundedXClient(fundedXClient())
    receipt.username = session.account.username
    receipt.balanceBeforeUsd = session.balanceUsd
    const timeline = await session.client.v2.userTimeline(session.account.id, { max_results: 25, exclude: ['replies', 'retweets'], 'tweet.fields': ['entities'] })
    // Expand t.co URLs before comparing approved copy. A prior matching post
    // is reconciled, never recreated, even if an earlier receipt was lost.
    const existing = timeline.tweets.find((tweet: any) => {
      let text = tweet.text
      for (const url of tweet.entities?.urls || []) text = text.replace(url.url, url.expanded_url || url.url)
      return text === request.caption
    })
    if (existing) {
      Object.assign(receipt, { status: 'published', postId: existing.id, reconciled: true, url: `https://x.com/JamesJones90703/status/${existing.id}` })
    } else {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'funded-x-validation-'))
      const local = path.join(dir, 'approved.mp4')
      await new Storage().bucket('natureswaysoil-social-videos').file(request.sourceObject).download({ destination: local })
      validateMarketingVideo(local)
      // Actual post attempts are classified by XPublishError if the response
      // is uncertain; a media-upload failure cannot be called a publication.
      const result = await publishFundedXVideo(local, request.caption)
      Object.assign(receipt, { status: 'published', postAttempted: true, postId: result.tweetId, mediaId: result.mediaId, url: `https://x.com/JamesJones90703/status/${result.tweetId}`, publishedAt: new Date().toISOString() })
    }
    console.log('Confirmed X video post', JSON.stringify(receipt))
  } catch (error) {
    if (error instanceof XPublishError) Object.assign(receipt, { status: error.postAttempted ? 'unconfirmed' : 'blocked', postAttempted: error.postAttempted, stage: error.stage, http: error.http, problem: error.problem })
    else Object.assign(receipt, { status: 'blocked', reason: 'Local, storage or reconciliation check failed; raw errors omitted' })
    process.exitCode = 1
  } finally {
    fs.writeFileSync('x-funded-post-result.json', JSON.stringify(receipt, null, 2))
    console.log('Funded X validation receipt', JSON.stringify(receipt))
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'X validation: ' + receipt.status + (receipt.url ? ' ' + receipt.url : '') + '\n')
    if (claim && generation) {
      try { await claim.save(JSON.stringify(receipt), { resumable: false, contentType: 'application/json', preconditionOpts: { ifGenerationMatch: generation } }) }
      catch { console.error('Could not persist X receipt; artifact and any confirmed post ID must be reconciled before retrying'); process.exitCode = 1 }
    }
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
}
main().catch(() => { console.error('X activation could not start; no raw credential errors retained'); process.exitCode = 1 })
