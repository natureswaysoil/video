// @ts-nocheck
import fs from 'fs'
import path from 'path'
import { execSync, spawnSync } from 'child_process'
import { ensureDir, hasUsableFile, safeFileName } from './video-utils'

function run(cmd: string) {
  execSync(cmd, { stdio: 'inherit' })
}

function shellEscapeText(value: string) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

function isImage(file: string) {
  return /\.(png|jpe?g|webp)$/i.test(file)
}

function probeDuration(file: string): number {
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`).toString().trim()
    const n = Number(out)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function sourceLooksLikeGreenPlaceholder(file: string, kind: string) {
  const args = kind === 'video'
    ? ['-hide_banner', '-loglevel', 'error', '-ss', '0.5', '-i', file, '-frames:v', '1', '-vf', 'scale=16:16,format=rgb24', '-f', 'rawvideo', '-']
    : ['-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=16:16,format=rgb24', '-f', 'rawvideo', '-']
  const result = spawnSync('ffmpeg', args, { encoding: null, maxBuffer: 1024 * 1024 })
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length < 16 * 16 * 3) {
    throw new Error(`SCENE_MEDIA_INVALID: FFmpeg could not decode ${path.basename(file)}`)
  }
  let green = 0
  let pixels = 0
  let minLuma = 255
  let maxLuma = 0
  for (let i = 0; i + 2 < result.stdout.length; i += 3) {
    const r = result.stdout[i]
    const g = result.stdout[i + 1]
    const b = result.stdout[i + 2]
    const luma = (r + g + b) / 3
    minLuma = Math.min(minLuma, luma)
    maxLuma = Math.max(maxLuma, luma)
    pixels++
    if (g > r * 1.35 && g > b * 1.35 && g - Math.max(r, b) > 28) green++
  }
  const greenRatio = pixels ? green / pixels : 1
  return greenRatio >= 0.92 && (maxLuma - minLuma) < 65
}

function validateSceneSource(file: string, kind: string) {
  if (!hasUsableFile(file)) throw new Error(`SCENE_MEDIA_INVALID: missing or empty file ${file}`)
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt', '-of', 'json', file], { encoding: 'utf8' })
  if (probe.status !== 0) throw new Error(`SCENE_MEDIA_INVALID: ffprobe failed for ${path.basename(file)}`)
  let stream: any = null
  try { stream = JSON.parse(probe.stdout || '{}').streams?.[0] } catch {}
  if (!stream || Number(stream.width || 0) < 100 || Number(stream.height || 0) < 100) {
    throw new Error(`SCENE_MEDIA_INVALID: unusable dimensions for ${path.basename(file)}`)
  }
  if (sourceLooksLikeGreenPlaceholder(file, kind)) {
    throw new Error(`SCENE_MEDIA_INVALID: green-screen placeholder detected in ${path.basename(file)}`)
  }
}

function makeSceneClip(file: string, index: number, seconds: number, kind: string, outputDir: string) {
  const duration = Math.max(3, Number(seconds || 5))
  const frames = Math.ceil(duration * 30)
  const clip = path.resolve(outputDir, `scene-${Date.now()}-${index}.mp4`)
  const resolvedKind = kind || (isImage(file) ? 'photo' : 'video')
  validateSceneSource(file, resolvedKind)

  if (resolvedKind === 'product') {
    run([
      'ffmpeg -y -loglevel error',
      '-stream_loop -1',
      `-i "${file}"`,
      `-filter_complex "` +
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:2[bg];` +
        `[0:v]scale=-1:1500:force_original_aspect_ratio=decrease[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,` +
        `zoompan=z='min(zoom+0.0012,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,` +
        `format=yuv420p"`,
      '-an -r 30',
      `-frames:v ${frames}`,
      `"${clip}"`
    ].join(' '))
    return clip
  }

  if (resolvedKind === 'photo') {
    const move = index % 3 === 0
      ? "zoompan=z='min(zoom+0.0018,1.16)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
      : index % 3 === 1
        ? `zoompan=z='1.12':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)'`
        : `zoompan=z='1.12':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`
    run([
      'ffmpeg -y -loglevel error',
      '-stream_loop -1',
      `-i "${file}"`,
      `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${move}:d=${frames}:s=1080x1920:fps=30,format=yuv420p"`,
      '-an -r 30',
      `-frames:v ${frames}`,
      `"${clip}"`
    ].join(' '))
    return clip
  }

  run([
    'ffmpeg -y -loglevel error',
    '-fflags +genpts -err_detect ignore_err',
    `-stream_loop -1 -t ${duration}`,
    `-i "${file}"`,
    '-vf "fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p"',
    '-an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -r 30 -movflags +faststart',
    `"${clip}"`
  ].join(' '))
  return clip
}

function resolveMusicFile(): string {
  const direct = process.env.MUSIC_FILE
  if (direct && fs.existsSync(direct)) return direct
  const dir = process.env.MUSIC_DIR || path.resolve(process.cwd(), 'music')
  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter((x) => /\.(mp3|m4a|aac|wav|ogg)$/i.test(x))
        .sort()
      if (files.length) return path.resolve(dir, files[new Date().getDate() % files.length])
    }
  } catch {}
  return ''
}

export async function composeVerticalAd(input: any) {
  const outputDir = path.resolve(process.cwd(), 'output')
  ensureDir(outputDir)

  let scenes = Array.isArray(input.scenes) ? input.scenes.filter((s: any) => s && s.file) : []
  if (!scenes.length) {
    const files = input.sceneFiles || []
    if (!files.length) throw new Error('No scene files provided to compositor')
    const durations = input.sceneDurations || []
    const productImage = input.productImage || ''
    scenes = files.map((file: string, i: number) => ({
      file,
      seconds: durations[i] || input.sceneSeconds || 5,
      kind: (productImage && file === productImage) ? 'product' : (isImage(file) ? 'photo' : 'video')
    }))
  }
  scenes = scenes.filter((scene: any) => hasUsableFile(scene.file))
  if (!scenes.length) throw new Error('No usable scene files provided to compositor')

  const FONT_CANDIDATES = [
    process.env.DRAWTEXT_FONT || '',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
  ]
  const fontPath = FONT_CANDIDATES.find((f) => f && fs.existsSync(f)) || ''
  const FONT = fontPath ? `fontfile='${fontPath}':` : ''

  const hasProductScene = scenes.some((s: any) => s.kind === 'product')
  const voiceoverFile = input.voiceoverFile && fs.existsSync(input.voiceoverFile) ? input.voiceoverFile : ''
  const voiceDur = voiceoverFile ? probeDuration(voiceoverFile) : 0
  scenes = scenes.map((s: any) => ({ ...s, seconds: Math.max(3, Number(s.seconds || 5)) }))
  let scenesTotal = scenes.reduce((sum: number, s: any) => sum + s.seconds, 0)
  if (voiceDur > scenesTotal + 0.3) {
    const extra = voiceDur - scenesTotal + 0.4
    scenes[scenes.length - 1].seconds += extra
    scenesTotal += extra
  }

  const sceneClips = scenes.map((s: any, i: number) => makeSceneClip(s.file, i, s.seconds, s.kind, outputDir))
  const concatList = path.resolve(outputDir, `concat-${Date.now()}.txt`)
  fs.writeFileSync(concatList, sceneClips.map((f: string) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')

  const inputs: string[] = [`-f concat -safe 0 -i "${concatList}"`]
  const chains: string[] = []
  let vlabel = '0:v'
  let nextInput = 1

  if (input.productImage && !hasProductScene && fs.existsSync(input.productImage)) {
    inputs.push(`-stream_loop -1 -i "${input.productImage}"`)
    chains.push(`[${nextInput}:v]scale=430:-1[prod]`)
    chains.push(`[${vlabel}][prod]overlay=40:H-h-80:enable='between(t,1,999)'[vwm]`)
    vlabel = 'vwm'
    nextInput++
  }
  if (input.overlayText) {
    const tf = path.resolve(outputDir, `ovl-${Date.now()}.txt`)
    fs.writeFileSync(tf, String(input.overlayText), 'utf8')
    chains.push(`[${vlabel}]drawtext=textfile='${tf}':${FONT}fontcolor=white:fontsize=42:borderw=4:bordercolor=black:x=40:y=90:box=1:boxcolor=black@0.35:boxborderw=18[vov]`)
    vlabel = 'vov'
  }
  if (input.captionText) {
    const tf = path.resolve(outputDir, `cap-${Date.now()}.txt`)
    fs.writeFileSync(tf, String(input.captionText), 'utf8')
    chains.push(`[${vlabel}]drawtext=textfile='${tf}':${FONT}fontcolor=white:fontsize=52:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h-260:box=1:boxcolor=black@0.25:boxborderw=18[vcap]`)
    vlabel = 'vcap'
  }

  const composed = path.resolve(outputDir, `composed-${Date.now()}.mp4`)
  const QUALITY = '-c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -r 30 -movflags +faststart'
  if (chains.length) {
    run(['ffmpeg -y -loglevel error', ...inputs, `-filter_complex "${chains.join(';')}"`, `-map "[${vlabel}]"`, QUALITY, `"${composed}"`].join(' '))
  } else {
    run(['ffmpeg -y -loglevel error', `-f concat -safe 0 -i "${concatList}"`, QUALITY, `"${composed}"`].join(' '))
  }

  const vDur = probeDuration(composed) || scenesTotal
  const musicFile = resolveMusicFile()
  let working = composed

  if (voiceoverFile || musicFile) {
    const out = path.resolve(outputDir, `final-${Date.now()}.mp4`)
    const t = vDur.toFixed(2)
    if (voiceoverFile && musicFile) {
      run(['ffmpeg -y -loglevel error', `-i "${working}"`, `-i "${voiceoverFile}"`, `-stream_loop -1 -i "${musicFile}"`, `-filter_complex "[1:a]apad,atrim=0:${t},asetpts=N/SR/TB[vo];[2:a]volume=0.16,atrim=0:${t},asetpts=N/SR/TB[mu];[vo][mu]amix=inputs=2:duration=first:dropout_transition=0[a]"`, '-map 0:v -map "[a]"', '-c:v copy -c:a aac -b:a 192k', `"${out}"`].join(' '))
    } else if (voiceoverFile) {
      run(['ffmpeg -y -loglevel error', `-i "${working}"`, `-i "${voiceoverFile}"`, `-filter_complex "[1:a]apad,atrim=0:${t},asetpts=N/SR/TB[a]"`, '-map 0:v -map "[a]"', '-c:v copy -c:a aac -b:a 192k', `"${out}"`].join(' '))
    } else {
      run(['ffmpeg -y -loglevel error', `-i "${working}"`, `-stream_loop -1 -i "${musicFile}"`, `-filter_complex "[1:a]volume=0.22,atrim=0:${t},asetpts=N/SR/TB[a]"`, '-map 0:v -map "[a]"', '-c:v copy -c:a aac -b:a 192k', `"${out}"`].join(' '))
    }
    working = out
  }

  const finalOutput = path.resolve(outputDir, `${safeFileName(input.outputName || 'vertical-ad', 'mp4')}`)
  fs.copyFileSync(working, finalOutput)
  return finalOutput
}
