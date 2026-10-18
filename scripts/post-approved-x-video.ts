import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { Storage } from '@google-cloud/storage'
import { loadSecretsToEnv } from '../src/secret-manager'
import { postToTwitter, twitterAuthMode } from './lib/social-platforms'
import { validateMarketingVideo } from './lib/video-quality-gate'

async function main() {
  const request = JSON.parse(fs.readFileSync('config/x-video-request.json', 'utf8'))
  if (request.id !== 'x-liquid-bone-meal-20261017' || request.sourceObject !== 'social-videos/1792283991013-liquid-bone-meal-fertilizer-scheduled-mp4-mp4.mp4') throw new Error('Unexpected authorized video')
  if (request.caption !== "Nature's Way Soil Liquid Bone Meal Fertilizer. Learn more and shop: https://natureswaysoil.com/product/NWS_012") throw new Error('Unexpected authorized copy')
  if (process.env.X_REQUEST_VALIDATE_ONLY === 'true') { console.log('Authorized X request validated; no network or publishing'); return }
  if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('Only the first main-branch attempt may publish')
  await loadSecretsToEnv(['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET', 'TWITTER_REFRESH_TOKEN', 'TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET', 'TWITTER_ACCESS_SECRET'])
  if (twitterAuthMode() === 'none') throw new Error('X user authentication unavailable')
  const bucket = new Storage().bucket('natureswaysoil-social-videos')
  // Reserve before any paid X request. Never release or automatically retry an uncertain post.
  const claim = bucket.file(`state/x-posts/${request.id}.json`)
  const receipt: any = { requestId: request.id, sourceObject: request.sourceObject, runId: process.env.GITHUB_RUN_ID, status: 'unconfirmed', claimedAt: new Date().toISOString() }
  await claim.save(JSON.stringify(receipt), { resumable: false, contentType: 'application/json', preconditionOpts: { ifGenerationMatch: 0 } })
  const [metadata] = await claim.getMetadata()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-x-'))
  try {
    const source = path.join(dir, 'source.mp4')
    const output = path.join(dir, 'captioned.mp4')
    await bucket.file(request.sourceObject).download({ destination: source })
    const filter = "drawtext=text='NATURESWAYSOIL.COM':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontcolor=white:fontsize=44:borderw=2:bordercolor=black:x=(w-text_w)/2:y=310:box=1:boxcolor=black@0.65:boxborderw=16"
    const render = spawnSync('ffmpeg', ['-y', '-nostdin', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', '-i', source, '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', output], { encoding: 'utf8', timeout: 180000 })
    if (render.status !== 0) throw new Error('Website caption render failed')
    validateMarketingVideo(output)
    const result = await postToTwitter(output, request.caption)
    if (!('tweetId' in result) || !result.tweetId) throw new Error('X did not confirm a post ID')
    Object.assign(receipt, { status: 'published', postId: result.tweetId, url: `https://x.com/i/status/${result.tweetId}`, publishedAt: new Date().toISOString() })
    console.log('Confirmed X video post', JSON.stringify(receipt))
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Published X video: ${receipt.url}\n`)
    fs.writeFileSync('x-post-result.json', JSON.stringify(receipt, null, 2))
    await claim.save(JSON.stringify(receipt), { resumable: false, contentType: 'application/json', preconditionOpts: { ifGenerationMatch: Number(metadata.generation) } })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    if (!fs.existsSync('x-post-result.json')) fs.writeFileSync('x-post-result.json', JSON.stringify(receipt, null, 2))
  }
}
main().catch(error => { console.error('X publishing stopped', { code: Number(error?.code) || Number(error?.response?.status) || 'local_error', status: 'unconfirmed; reconcile before retrying' }); process.exitCode = 1 })
