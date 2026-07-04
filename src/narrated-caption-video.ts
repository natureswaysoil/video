import axios from 'axios'

const fs: any = require('fs')
const path: any = require('path')
const os: any = require('os')
const spawn: any = require('child_process').spawn

export type NarratedCaptionVideoInput = {
  sourceVideoUrl: string
  title: string
  excerpt: string
  ctaUrl?: string
}

function cleanText(value: string): string {
  return String(value || '')
    .replace(/100\s*%\s*organic/gi, 'natural')
    .replace(/100\s*percent\s*organic/gi, 'natural')
    .replace(/one\s+hundred\s+percent\s+organic/gi, 'natural')
    .replace(/#[A-Za-z0-9_]+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function voiceoverText(input: NarratedCaptionVideoInput): string {
  const title = cleanText(input.title)
  const excerpt = cleanText(input.excerpt)
  const cta = input.ctaUrl ? ` Learn more at natureswaysoil.com.` : ' Learn more at natureswaysoil.com.'
  return `${title}. ${excerpt}.${cta}`.replace(/\.\./g, '.').slice(0, 700)
}

function captionChunks(text: string): string[] {
  const words = cleanText(text).split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let current: string[] = []

  for (const word of words) {
    current.push(word)
    if (current.join(' ').length >= 48 || current.length >= 8) {
      chunks.push(current.join(' '))
      current = []
    }
  }

  if (current.length) chunks.push(current.join(' '))
  return chunks.slice(0, 6)
}

function srtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function buildSrt(text: string): string {
  const chunks = captionChunks(text)
  const totalSeconds = Math.max(9, chunks.length * 2.5)
  const each = totalSeconds / Math.max(1, chunks.length)

  return chunks.map((chunk, index) => {
    const start = index * each
    const end = index === chunks.length - 1 ? totalSeconds : (index + 1) * each
    return `${index + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${chunk}\n`
  }).join('\n')
}

async function ensureDir(dirPath: string): Promise<void> {
  fs.mkdirSync(dirPath, { recursive: true })
}

async function downloadToFile(url: string, filePath: string): Promise<void> {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 120_000,
    maxRedirects: 5,
  })

  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(filePath)
    response.data.pipe(writer)
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: any) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code: any) => {
      if (code === 0) return resolve()
      reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-1600)}`))
    })
  })
}

async function hasCommand(command: string): Promise<boolean> {
  try {
    await runCommand(command, ['-version'])
    return true
  } catch {
    return false
  }
}

async function createSpeechMp3(text: string, outputPath: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY not set for narration')

  const response = await axios.post(
    'https://api.openai.com/v1/audio/speech',
    {
      model: process.env.OPENAI_TTS_MODEL || 'tts-1',
      voice: process.env.OPENAI_TTS_VOICE || 'onyx',
      input: text,
      format: 'mp3',
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      responseType: 'arraybuffer',
      timeout: 120_000,
    }
  )

  fs.writeFileSync(outputPath, Buffer.from(response.data))
}

function subtitleFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:')
}

export async function createNarratedCaptionVideo(input: NarratedCaptionVideoInput): Promise<string> {
  const enabled = String(process.env.ENABLE_NARRATED_FALLBACK_VIDEO || 'true').toLowerCase() !== 'false'
  if (!enabled) return input.sourceVideoUrl

  const ffmpegAvailable = await hasCommand('ffmpeg')
  if (!ffmpegAvailable) {
    console.warn('ffmpeg not available; using source video without narration/captions')
    return input.sourceVideoUrl
  }

  const tempDir = path.join(os.tmpdir(), `nws-narrated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  await ensureDir(tempDir)

  const sourcePath = path.join(tempDir, 'source.mp4')
  const audioPath = path.join(tempDir, 'voice.mp3')
  const srtPath = path.join(tempDir, 'captions.srt')
  const outputPath = path.join(tempDir, 'narrated-captioned.mp4')
  const text = voiceoverText(input)

  try {
    console.log('🎙️  Generating narration audio')
    await createSpeechMp3(text, audioPath)

    console.log('⬇️  Downloading source video for captions/narration')
    await downloadToFile(input.sourceVideoUrl, sourcePath)

    fs.writeFileSync(srtPath, buildSrt(text))

    console.log('🎞️  Rendering narrated captioned video')
    await runCommand('ffmpeg', [
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      sourcePath,
      '-i',
      audioPath,
      '-vf',
      `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=${subtitleFilterPath(srtPath)}:force_style='FontSize=54,Alignment=2,MarginV=170,Outline=3,Shadow=1'`,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      process.env.NARRATED_VIDEO_PRESET || 'veryfast',
      '-crf',
      process.env.NARRATED_VIDEO_CRF || '22',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-shortest',
      '-movflags',
      '+faststart',
      outputPath,
    ])

    return outputPath
  } catch (error) {
    console.warn(`Narrated caption video failed (${String(error)}). Using source video instead.`)
    return input.sourceVideoUrl
  }
}
