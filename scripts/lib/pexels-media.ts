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
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) return { ok: false, greenRatio: 1, range: 0 }
  let green = 0
  let pixels = 0
  let min = 255
  let max = 0
  for (let i = 0; i + 2 < buffer.length; i += 3) {
    const r = buffer[i]
    const g = buffer[i + 1]
    const b = buffer[i + 2]
    min = Math.min(min, r, g, b)
    max = Math.max(max, r, g, b)
    pixels++
    if (g > r * 1.35 && g > b * 1.35 && g - Math.max(r, b) > 28) green++
  }
  const greenRatio = pixels ? green / pixels : 1
  const range = max - min
  // A genuine lawn can be very green, so only reject frames that are both
  // overwhelmingly green AND visually flat/uniform like a placeholder frame.
  return { ok: !(greenRatio >= 0.92 && range < 70), greenRatio, range }
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

  const args = kind === 'video'
    ? ['-hide_banner', '-loglevel', 'error', '-ss', '0.6', '-i', file, '-frames:v', '1', '-vf', 'scale=16:16,format=rgb24', '-f', 'rawvideo', '-']
    : ['-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=16:16,format=rgb24', '-f', 'rawvideo', '-']
  const frame = spawnSync('ffmpeg', args, { encoding: null, maxBuffer: 1024 * 1024 })
  if (frame.status !== 0 || !Buffer.isBuffer(frame.stdout) || frame.stdout.length < 16 * 16 * 3) return false
  const inspection = inspectPixels(frame.stdout)
  if (!inspection.ok) {
    console.log('Rejected green/flat media source', { file: path.basename(file), greenRatio: Number(inspection.greenRatio.toFixed(3)), range: inspection.range })
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
      if (all.length >= 6) break
    } catch (error: any) {
      console.log('Pexels video search failed', { query: attempt.query, status: error?.response?.status, message: error?.message })
    }
  }
  return all.slice(0, 6)
}

export async function findPexelsVideoUrl(query: string) {
  const candidates = await findPexelsVideoCandidates(query)
  const first = candidates[0]
  if (first) console.log('Selected Pexels video candidate', { query: first.query, id: first.id, res: `${first.width}x${first.height}`, portrait: first.isPortrait })
  return first?.url || ''
}

export async function findPexelsPhotoUrl(query: string) {
  const key = process.env.PEXELS_API_KEY
  if (!key) {
    console.log('Pexels skipped: missing PEXELS_API_KEY')
    return ''
  }

  const attempts = [
    { query: String(query || '').trim(), orientation: 'portrait' },
    { query: trimQuery(query, 3), orientation: 'portrait' },
    { query: String(query || '').trim(), orientation: 'landscape' }
  ]

  for (const attempt of attempts) {
    try {
      const response = await axios.get(PEXELS_PHOTO_API, {
        headers: { Authorization: key },
        params: { query: attempt.query, orientation: attempt.orientation, per_page: 15 },
        timeout: 30000
      })
      const photos = Array.isArray(response.data?.photos) ? response.data.photos : []
      console.log('Pexels photo search', { query: attempt.query, orientation: attempt.orientation, count: photos.length })
      const first = photos[0]
      const url = first?.src?.large2x || first?.src?.original || first?.src?.large || ''
      if (url) {
        console.log('Selected Pexels photo', { query: attempt.query, id: first?.id })
        return url
      }
    } catch (error: any) {
      console.log('Pexels photo search failed', { query: attempt.query, status: error?.response?.status, message: error?.message })
    }
  }
  return ''
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
  for (let candidateIndex = 0; candidateIndex < Math.min(candidates.length, 4); candidateIndex++) {
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
      console.log('Accepted Pexels video', { query, id: candidate.id, res: `${candidate.width}x${candidate.height}`, file: path.basename(normalized) })
      return normalized
    } catch (error: any) {
      console.log('Pexels candidate rejected', { query, id: candidate.id, message: error?.message || error })
      try { if (fs.existsSync(file)) fs.unlinkSync(file) } catch {}
    }
  }
  return ''
}

export async function downloadPexelsPhoto(query: string, outputDir: string, index = 0) {
  const url = await findPexelsPhotoUrl(query)
  if (!url) return ''
  const ext = (url.split('?')[0].toLowerCase().endsWith('.png')) ? 'png' : 'jpg'
  const file = path.resolve(outputDir, `${String(index + 1).padStart(2, '0')}-img-${safeFileName(query, ext)}`)
  await downloadUrl(url, file)
  if (!validateDecodedMedia(file, 'photo')) {
    try { fs.unlinkSync(file) } catch {}
    return ''
  }
  return file
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
