import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import axios from 'axios'
import { searchPexelsVideo } from './pexels'
import { getLogger } from './logger'

const logger = getLogger()
const execFileP: (file: string, args: string[], options?: any) => Promise<{ stdout: string; stderr: string }> =
  promisify(execFile) as any

export type Scene = { query: string; seconds?: number }

export type MultiSceneResult = {
  outputPath: string
  workDir: string
  sceneCount: number
  totalSeconds: number
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await axios.get(url, { responseType: 'stream', timeout: 180_000 })
  await new Promise<void>((resolve, reject) => {
    const w = fs.createWriteStream(dest)
    res.data.pipe(w)
    w.on('finish', () => resolve())
    w.on('error', reject)
    res.data.on('error', reject)
  })
  const size = fs.statSync(dest).size
  if (size < 1024) throw new Error(`Downloaded file too small (${size} bytes): ${url}`)
}

async function ffprobeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFileP('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1',
      file,
    ])
    return Number(String(stdout).trim()) || 0
  } catch (e: any) {
    logger.warn('ffprobe failed', 'MultiSceneBroll', { file, error: e?.message })
    return 0
  }
}

/**
 * Build a vertical multi-scene b-roll video: HeyGen avatar overlaid as a
 * picture-in-picture on top of crossfade-free Pexels scenes that match
 * scene-specific queries. Audio is taken from the HeyGen render.
 *
 * Requires ffmpeg + ffprobe on PATH.
 */
export async function buildMultiSceneVideo(opts: {
  heygenVideoUrl: string
  scenes: Scene[]
  outputId?: string
  pipPosition?: 'tr' | 'br' | 'bl' | 'tl'
  width?: number
  height?: number
  fps?: number
  pipScale?: number // 0.0–1.0 of width
  pipMargin?: number
}): Promise<MultiSceneResult> {
  if (!Array.isArray(opts.scenes) || opts.scenes.length === 0) {
    throw new Error('buildMultiSceneVideo requires at least one scene')
  }

  const W = opts.width || 1080
  const H = opts.height || 1920
  const FPS = opts.fps || 30
  const PIP_SCALE = Math.max(0.2, Math.min(0.6, opts.pipScale || 0.36))
  const MARGIN = opts.pipMargin ?? 48

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nws-mscene-'))
  fs.mkdirSync(workDir, { recursive: true })

  const heygenPath = path.join(workDir, 'heygen.mp4')
  logger.info('Downloading HeyGen render', 'MultiSceneBroll', { heygenVideoUrl: opts.heygenVideoUrl })
  await downloadFile(opts.heygenVideoUrl, heygenPath)
  const totalDuration = Math.max(8, await ffprobeDuration(heygenPath))

  // Allocate seconds per scene. Honor explicit `seconds`, distribute the rest.
  const scenesIn = opts.scenes.map((s) => ({ query: s.query, seconds: s.seconds }))
  const fixedTotal = scenesIn.reduce((sum, s) => sum + (s.seconds || 0), 0)
  const flexCount = scenesIn.filter((s) => !s.seconds).length
  const flexShare =
    flexCount > 0
      ? Math.max(2, (totalDuration - fixedTotal) / flexCount)
      : 0
  const scenes = scenesIn.map((s) => ({
    query: s.query,
    seconds: s.seconds || flexShare || totalDuration / scenesIn.length,
  }))

  // Normalize so total scene seconds matches HeyGen duration (avoid trim/short loops)
  const sumNow = scenes.reduce((sum, s) => sum + s.seconds, 0)
  const scaleFactor = totalDuration / sumNow
  for (const sc of scenes) sc.seconds = +(sc.seconds * scaleFactor).toFixed(3)

  // Fetch + download Pexels clips for each scene
  const sceneFiles: string[] = []
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i]
    const minDur = Math.max(3, Math.ceil(sc.seconds))
    let picked = await searchPexelsVideo(sc.query, {
      orientation: 'portrait',
      minDurationSeconds: minDur,
    })
    if (!picked) {
      picked = await searchPexelsVideo(sc.query, {
        orientation: 'portrait',
        minDurationSeconds: 3,
      })
    }
    if (!picked) {
      // reuse previous scene file if present rather than failing the whole render
      if (sceneFiles.length > 0) {
        logger.warn('No Pexels clip for query, reusing previous scene', 'MultiSceneBroll', { query: sc.query })
        sceneFiles.push(sceneFiles[sceneFiles.length - 1])
        continue
      }
      throw new Error(`No Pexels clip found for query "${sc.query}"`)
    }
    const dest = path.join(workDir, `scene_${i}.mp4`)
    logger.info('Downloading Pexels clip', 'MultiSceneBroll', {
      sceneIndex: i,
      query: sc.query,
      pexelsId: picked.id,
      seconds: sc.seconds,
    })
    await downloadFile(picked.url, dest)
    sceneFiles.push(dest)
  }

  // Build ffmpeg invocation
  const inputs: string[] = []
  for (const f of sceneFiles) {
    inputs.push('-i', f)
  }
  inputs.push('-i', heygenPath)
  const heyIdx = sceneFiles.length

  let filter = ''
  for (let i = 0; i < sceneFiles.length; i++) {
    const dur = scenes[i].seconds.toFixed(3)
    filter +=
      `[${i}:v]trim=duration=${dur},setpts=PTS-STARTPTS,` +
      `scale=${W}:${H}:force_original_aspect_ratio=increase,` +
      `crop=${W}:${H},setsar=1,fps=${FPS}[v${i}];`
  }
  for (let i = 0; i < sceneFiles.length; i++) filter += `[v${i}]`
  filter += `concat=n=${sceneFiles.length}:v=1:a=0[bg];`

  const pipW = Math.round(W * PIP_SCALE)
  const pipH = Math.round(H * PIP_SCALE)
  filter +=
    `[${heyIdx}:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=increase,` +
    `crop=${pipW}:${pipH},setsar=1[pip];`

  let xy = `W-w-${MARGIN}:${MARGIN}` // tr default
  if (opts.pipPosition === 'br') xy = `W-w-${MARGIN}:H-h-${MARGIN}`
  if (opts.pipPosition === 'bl') xy = `${MARGIN}:H-h-${MARGIN}`
  if (opts.pipPosition === 'tl') xy = `${MARGIN}:${MARGIN}`
  filter += `[bg][pip]overlay=${xy}:shortest=1[outv]`

  const outPath = path.join(workDir, `${opts.outputId || 'final'}.mp4`)
  const args = [
    ...inputs,
    '-filter_complex', filter,
    '-map', '[outv]',
    '-map', `${heyIdx}:a?`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-shortest',
    '-y', outPath,
  ]

  logger.info('Running ffmpeg compositor', 'MultiSceneBroll', {
    sceneCount: scenes.length,
    totalDuration,
    outPath,
  })

  await execFileP('ffmpeg', args, { maxBuffer: 1024 * 1024 * 64 })

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 10_000) {
    throw new Error('ffmpeg produced no output (or output is empty)')
  }

  return {
    outputPath: outPath,
    workDir,
    sceneCount: scenes.length,
    totalSeconds: totalDuration,
  }
}
