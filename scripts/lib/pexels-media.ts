// @ts-nocheck
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { ensureDir, hasUsableFile, safeFileName } from './video-utils'

const PEXELS_VIDEO_API = 'https://api.pexels.com/videos/search'
const PEXELS_PHOTO_API = 'https://api.pexels.com/v1/search'

function trimQuery(query: string, words = 4) {
  return String(query || '').split(/\s+/).filter(Boolean).slice(0, words).join(' ')
}

function uniqQueries(items: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const value = String(item || '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

export function buildSceneQueryPriority(scene: any, product: any, index = 0) {
  const scenePrimary = String(scene?.brollQuery || '').trim()
  const sceneList = Array.isArray(scene?.brollQueries) ? scene.brollQueries : []
  const productFallback = Array.isArray(product?.brollQueries) ? product.brollQueries[index] : ''
  const categoryFallback = String(product?.category || '').trim()
  return uniqQueries([scenePrimary, ...sceneList, productFallback, categoryFallback])
}

function videoAttempts(query: string) {
  const q = String(query || '').trim()
  const short = trimQuery(q, 3)
  return [
    { query: q, orientation: 'portrait' },
    { query: q, orientation: 'landscape' },
    short !== q ? { query: short, orientation: 'portrait' } : null,
    short !== q ? { query: short, orientation: 'landscape' } : null
  ].filter(Boolean)
}

function inspectPixels(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) {
    return { ok: false, greenRatio: 1, lumaRange: 0, greenColorRange: 0, greenDominanceRange: 0 }
  }

  let green = 0
  let pixels = 0
  let minLuma = 255
  let maxLuma = 0
  let greenMinR = 255, greenMaxR = 0
  let greenMinG = 255, greenMaxG = 0
  let greenMinB = 255, greenMaxB = 0
  let greenMinDominance = 255, greenMaxDominance = 0

  for (let i = 0; i + 2 < buffer.length; i += 3) {
    const r = buffer[i]
    const g = buffer[i + 1]
    const b = buffer[i + 2]
    const luma = (r + g + b) / 3
    minLuma = Math.min(minLuma, luma)
    maxLuma = Math.max(maxLuma, luma)
    pixels++

    const dominance = g - Math.max(r, b)
    if (g > r * 1.35 && g > b * 1.35 && dominance > 28) {
      green++
      greenMinR = Math.min(greenMinR, r)
      greenMaxR = Math.max(greenMaxR, r)
      greenMinG = Math.min(greenMinG, g)
      greenMaxG = Math.max(greenMaxG, g)
      greenMinB = Math.min(greenMinB, b)
      greenMaxB = Math.max(greenMaxB, b)
      greenMinDominance = Math.min(greenMinDominance, dominance)
      greenMaxDominance = Math.max(greenMaxDominance, dominance)
    }
  }

  const greenRatio = pixels ? green / pixels : 1
  const lumaRange = maxLuma - minLuma
  const greenColorRange = green
    ? Math.max(greenMaxR - greenMinR, greenMaxG - greenMinG, greenMaxB - greenMinB)
    : 255
  const greenDominanceRange = green ? greenMaxDominance - greenMinDominance : 255

  // Reject either a nearly full-frame flat green placeholder OR a large,
  // unusually uniform green backdrop. The second case catches chroma/decoder
  // green even when a foreground object makes the total frame look detailed.
  const flatWholeFrameGreen = greenRatio >= 0.90 && lumaRange < 65
  const uniformGreenBackdrop = greenRatio >= 0.70 && greenColorRange < 38 && greenDominanceRange < 28

  return {
    ok: !(flatWholeFrameGreen || uniformGreenBackdrop),
    greenRatio,
    lumaRange,
    greenColorRange,
    greenDominanceRange
  }
}

function sampleFrame(file: string, seekSeconds?: number) {
  const args = ['-hide_banner', '-loglevel', 'error']
  if (Number.isFinite(seekSeconds)) args.push('-ss', String(seekSeconds))
  args.push('-i', file, '-frames:v', '1', '-vf', 'scale=24:24,format=rgb24', '-f', 'rawvideo', '-')
  const frame = spawnSync('ffmpeg', args, { encoding: null, maxBuffer: 2 * 1024 * 1024 })
  if (frame.status !== 0 || !Buffer.isBuffer(frame.stdout) || frame.stdout.length < 24 * 24 * 3) return null
  return inspectPixels(frame.stdout)
}

function probeDuration(file: string) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  if (probe.status !== 0) return 0
  const duration = Number(String(probe.stdout || '').trim())
  return Number.isFinite(duration) && duration > 0 ? duration : 0
}

function validateDecodedMedia(file: string, kind: 'video' | 'photo') {
  if (!hasUsableFile(file)) return false
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt', '-of', 'json', file
  ], { encoding: 'utf8' })
  if (probe.status !== 0) return false
  try {
    const data = JSON.parse(probe.stdout || '{}')
    const stream = data.streams?.[0]
    if (!stream || Number(stream.width || 0) < 100 || Number(stream.height || 0) < 100) return false
  } catch { return false }

  const checks: any[] = []
  if (kind === 'video') {
    const duration = probeDuration(file)
    const sampleTimes = duration > 1
      ? [Math.min(0.4, duration * 0.10), duration * 0.35, duration * 0.65, Math.max(0, duration * 0.90 - 0.1)]
      : [0]
    for (const t of sampleTimes) {
      const inspection = sampleFrame(file, t)
      if (!inspection) return false
      checks.push({ second: Number(t.toFixed(2)), ...inspection })
    }
  } else {
    const inspection = sampleFrame(file)
    if (!inspection) return false
    checks.push(inspection)
  }

  const bad = checks.find((inspection) => !inspection.ok)
  if (bad) {
    console.log('Rejected green/placeholder media source; trying another candidate', {
      file: path.basename(file),
      greenRatio: Number(bad.greenRatio.toFixed(3)),
      lumaRange: Number(bad.lumaRange.toFixed(1)),
      greenColorRange: Number(bad.greenColorRange.toFixed(1)),
      greenDominanceRange: Number(bad.greenDominanceRange.toFixed(1)),
      second: bad.second
    })
    return false
  }
  return true
}

function normalizeDownloadedVideo(file: string) {
  const normalized = file.replace(/\.mp4$/i, '-normalized.mp4')
  const result = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-fflags', '+genpts', '-err_detect', 'ignore_err', '-i', file,
    '-map', '0:v:0', '-an', '-vf', 'fps=30,setsar=1,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', normalized
  ], { encoding: 'utf8' })
  if (result.status !== 0 || !validateDecodedMedia(normalized, 'video')) {
    try { if (fs.existsSync(normalized)) fs.unlinkSync(normalized) } catch {}
    return ''
  }
  try { fs.unlinkSync(file) } catch {}
  try { fs.renameSync(normalized, file) } catch { return normalized }
  return file
}

async function findPexelsVideoCandidates(query: string) {
  const key = process.env.PEXELS_API_KEY
  if (!key) {
    console.log('Pexels skipped: missing PEXELS_API_KEY')
    return []
  }

  const all: any[] = []
  const seen = new Set<string>()
  for (const attempt of videoAttempts(query)) {
    try {
      const response = await axios.get(PEXELS_VIDEO_API, {
        headers: { Authorization: key },
        params: { query: attempt.query, orientation: attempt.orientation, per_page: 15 },
        timeout: 30000
      })
      const videos = Array.isArray(response.data?.videos) ? response.data.videos : []
      console.log('Pexels video search', { query: attempt.query, orientation: attempt.orientation, count: videos.length })
      const ranked = videos
        .map((video: any) => {
          const files = [...(video.video_files || [])]
          const portrait = files
            .filter((f: any) => Number(f.height || 0) >= Number(f.width || 0))
            .sort((a: any, b: any) => Math.abs(1080 - Number(a.width || 0)) - Math.abs(1080 - Number(b.width || 0)))[0]
          const any = [...files].sort((a: any, b: any) => Math.abs(1080 - Number(a.width || 0)) - Math.abs(1080 - Number(b.width || 0)))[0]
          const best = portrait || any
          return { id: video.id, url: best?.link || '', width: best?.width || 0, height: best?.height || 0, isPortrait: !!portrait, query: attempt.query }
        })
        .filter((item: any) => item.url)
        .sort((a: any, b: any) => (Number(b.isPortrait) - Number(a.isPortrait)) || (Math.abs(1080 - a.width) - Math.abs(1080 - b.width)))
      for (const item of ranked) {
        if (seen.has(item.url)) continue
        seen.add(item.url)
        all.push(item)
      }
      if (all.length >= 10) break
    } catch (error: any) {
      console.log('Pexels video search failed', { query: attempt.query, status: error?.response?.status, message: error?.message })
    }
  }
  return all.slice(0, 10)
}

async function findPexelsPhotoCandidates(query: string) {
  const key = process.env.PEXELS_API_KEY
  if (!key) {
    console.log('Pexels skipped: missing PEXELS_API_KEY')
    return []
  }

  const attempts = [
    { query: String(query || '').trim(), orientation: 'portrait' },
    { query: trimQuery(query, 3), orientation: 'portrait' },
    { query: String(query || '').trim(), orientation: 'landscape' }
  ]
  const all: any[] = []
  const seen = new Set<string>()

  for (const attempt of attempts) {
    try {
      const response = await axios.get(PEXELS_PHOTO_API, {
        headers: { Authorization: key },
        params: { query: attempt.query, orientation: attempt.orientation, per_page: 15 },
        timeout: 30000
      })
      const photos = Array.isArray(response.data?.photos) ? response.data.photos : []
      console.log('Pexels photo search', { query: attempt.query, orientation: attempt.orientation, count: photos.length })
      for (const photo of photos) {
        const url = photo?.src?.large2x || photo?.src?.original || photo?.src?.large || ''
        if (!url || seen.has(url)) continue
        seen.add(url)
        all.push({ id: photo.id, url, query: attempt.query })
      }
      if (all.length >= 8) break
    } catch (error: any) {
      console.log('Pexels photo search failed', { query: attempt.query, status: error?.response?.status, message: error?.message })
    }
  }
  return all.slice(0, 8)
}

export async function findPexelsVideoUrl(query: string) {
  const candidates = await findPexelsVideoCandidates(query)
  const first = candidates[0]
  if (first) console.log('Selected Pexels video candidate', { query: first.query, id: first.id, res: `${first.width}x${first.height}`, portrait: first.isPortrait })
  return first?.url || ''
}

export async function findPexelsPhotoUrl(query: string) {
  const candidates = await findPexelsPhotoCandidates(query)
  const first = candidates[0]
  if (first) console.log('Selected Pexels photo candidate', { query: first.query, id: first.id })
  return first?.url || ''
}

export async function downloadUrl(url: string, outputFile: string) {
  ensureDir(path.dirname(outputFile))
  try {
    const response = await axios.get(url, { responseType: 'stream', timeout: 120000 })
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputFile)
      response.data.pipe(writer)
      writer.on('close', resolve)
      writer.on('error', reject)
      response.data.on('error', reject)
    })
    if (!hasUsableFile(outputFile)) throw new Error('downloaded media is empty or missing')
    return outputFile
  } catch (error) {
    try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile) } catch {}
    throw error
  }
}

export async function downloadPexelsVideo(query: string, outputDir: string, index = 0) {
  const candidates = await findPexelsVideoCandidates(query)
  for (let candidateIndex = 0; candidateIndex < Math.min(candidates.length, 8); candidateIndex++) {
    const candidate = candidates[candidateIndex]
    const suffix = candidateIndex ? `-${candidateIndex + 1}` : ''
    const file = path.resolve(outputDir, `${String(index + 1).padStart(2, '0')}-vid-${safeFileName(`${query}${suffix}`, 'mp4')}`)
    try {
      await downloadUrl(candidate.url, file)
      if (!validateDecodedMedia(file, 'video')) {
        try { fs.unlinkSync(file) } catch {}
        continue
      }
      const normalized = normalizeDownloadedVideo(file)
      if (!normalized) continue
      console.log('Accepted Pexels video', { query, id: candidate.id, candidate: candidateIndex + 1, res: `${candidate.width}x${candidate.height}`, file: path.basename(normalized) })
      return normalized
    } catch (error: any) {
      console.log('Pexels candidate rejected', { query, id: candidate.id, candidate: candidateIndex + 1, message: error?.message || error })
      try { if (fs.existsSync(file)) fs.unlinkSync(file) } catch {}
    }
  }
  return ''
}

export async function downloadPexelsPhoto(query: string, outputDir: string, index = 0) {
  const candidates = await findPexelsPhotoCandidates(query)
  for (let candidateIndex = 0; candidateIndex < Math.min(candidates.length, 6); candidateIndex++) {
    const candidate = candidates[candidateIndex]
    const ext = (candidate.url.split('?')[0].toLowerCase().endsWith('.png')) ? 'png' : 'jpg'
    const suffix = candidateIndex ? `-${candidateIndex + 1}` : ''
    const file = path.resolve(outputDir, `${String(index + 1).padStart(2, '0')}-img-${safeFileName(`${query}${suffix}`, ext)}`)
    try {
      await downloadUrl(candidate.url, file)
      if (!validateDecodedMedia(file, 'photo')) {
        try { fs.unlinkSync(file) } catch {}
        continue
      }
      console.log('Accepted Pexels photo', { query, id: candidate.id, candidate: candidateIndex + 1, file: path.basename(file) })
      return file
    } catch (error: any) {
      console.log('Pexels photo candidate rejected', { query, id: candidate.id, candidate: candidateIndex + 1, message: error?.message || error })
      try { if (fs.existsSync(file)) fs.unlinkSync(file) } catch {}
    }
  }
  return ''
}

export async function fetchBrollForScene(scene: any, product: any, outputDir: string, index = 0) {
  const attempts = buildSceneQueryPriority(scene, product, index)
  for (const query of attempts) {
    try {
      const videoFile = await downloadPexelsVideo(query, outputDir, index)
      if (videoFile) return { file: videoFile, kind: 'video', query }
    } catch (error: any) {
      console.log('Pexels video attempt failed', { query, message: error?.message || error })
    }
    try {
      const photoFile = await downloadPexelsPhoto(query, outputDir, index)
      if (photoFile) return { file: photoFile, kind: 'photo', query }
    } catch (error: any) {
      console.log('Pexels photo attempt failed', { query, message: error?.message || error })
    }
  }
  return null
}
