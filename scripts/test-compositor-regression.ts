// Render actual FFmpeg inputs without network calls or social publishing.
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { composeVerticalAd } from './lib/ffmpeg-compositor'
import { validateMarketingVideo } from './lib/video-quality-gate'

function ffmpeg(args: string[]) {
  const result = spawnSync('ffmpeg', ['-y', '-nostdin', '-loglevel', 'error', '-threads', '2', ...args], { encoding: 'utf8', timeout: 30000 })
  assert.strictEqual(result.status, 0, result.stderr || String(result.error))
}

async function main() {
  const originalCwd = process.cwd()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compositor-regression-'))
  try {
    process.chdir(dir)
    const footage = path.join(dir, 'footage.mp4')
    // JPEG uses a different image demuxer from PNG: stream_loop can stall at EOF.
    const product = path.join(dir, 'product.jpg')
    const audio = path.join(dir, 'voice.wav')
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-t', '2', '-c:v', 'libx264', '-threads', '2', footage])
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=300x500', '-frames:v', '1', '-threads', '1', product])
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '15', '-af', 'volume=3', audio])
    const started = Date.now()
    const file = await composeVerticalAd({
      scenes: [
        { file: footage, seconds: 3, kind: 'video' },
        { file: product, seconds: 3, kind: 'photo' },
        { file: footage, seconds: 3, kind: 'video' },
        { file: footage, seconds: 3, kind: 'video' },
        { file: product, seconds: 3, kind: 'product' }
      ],
      productImage: product,
      voiceoverFile: audio,
      captionText: 'SOIL SUPPORT',
      overlayText: 'NATURES WAY SOIL',
      outputName: 'regression.mp4'
    })
    const quality = validateMarketingVideo(file)
    assert(quality.duration >= 15 && quality.duration < 15.2, `Unexpected duration ${quality.duration}`)
    assert.strictEqual(quality.width, 1080)
    assert.strictEqual(quality.height, 1920)
    assert(Date.now() - started < 180000, '15-second video took more than three minutes')
    console.log('Compositor regression passed', { elapsedMs: Date.now() - started, quality })
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exit(1) })
