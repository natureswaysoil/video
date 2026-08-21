import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { pipeline } from 'stream/promises'

export function validateMarketingVideo(file: string) {
  if (!file || !fs.existsSync(file)) throw new Error('QUALITY_GATE: rendered video is missing')
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_type,width,height,bit_rate', '-of', 'json', file], { encoding: 'utf8' })
  if (probe.status !== 0) throw new Error(`QUALITY_GATE: ffprobe failed: ${probe.stderr || 'unknown error'}`)
  const data = JSON.parse(probe.stdout || '{}')
  const video = (data.streams || []).find((stream: any) => stream.codec_type === 'video') || {}
  const audio = (data.streams || []).find((stream: any) => stream.codec_type === 'audio') || {}
  const duration = Number(data.format?.duration || 0)
  const width = Number(video.width || 0)
  const height = Number(video.height || 0)
  if (width < 1080 || height < 1080) throw new Error(`QUALITY_GATE: output is only ${width}x${height}; minimum is 1080p`)
  if (duration < 15 || duration > 60) throw new Error(`QUALITY_GATE: invalid marketing-video duration ${duration.toFixed(1)}s`)
  if (!audio.codec_type) throw new Error('QUALITY_GATE: narration/audio track is missing')

  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
  const volume = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', nullDevice], { encoding: 'utf8' })
  const volumeText = `${volume.stdout || ''}\n${volume.stderr || ''}`
  const meanDb = Number(volumeText.match(/mean_volume:\s*(-?[\d.]+) dB/i)?.[1] || -100)
  const maxDb = Number(volumeText.match(/max_volume:\s*(-?[\d.]+) dB/i)?.[1] || -100)
  if (meanDb < -32 || maxDb < -12) throw new Error(`QUALITY_GATE: audio is too quiet (mean ${meanDb} dB, max ${maxDb} dB)`)

  const colors = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', 'fps=1,scale=1:1,format=rgb24', '-f', 'rawvideo', '-'], { encoding: null, maxBuffer: 1024 * 1024 })
  if (colors.status !== 0 || !Buffer.isBuffer(colors.stdout)) throw new Error('QUALITY_GATE: could not sample rendered frames')
  const pixels = colors.stdout as Buffer
  let samples = 0, greenSamples = 0, minLuma = 255, maxLuma = 0
  for (let index = 0; index + 2 < pixels.length; index += 3) {
    const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2]
    const luma = (red + green + blue) / 3
    minLuma = Math.min(minLuma, luma); maxLuma = Math.max(maxLuma, luma); samples += 1
    if (green > red * 1.28 && green > blue * 1.28 && green - Math.max(red, blue) > 25) greenSamples += 1
  }
  const greenRatio = samples ? greenSamples / samples : 1
  if (samples < 10) throw new Error(`QUALITY_GATE: only ${samples} visual samples were readable`)
  if (greenRatio >= 0.7) throw new Error(`QUALITY_GATE: solid-green placeholder detected in ${Math.round(greenRatio * 100)}% of sampled frames`)
  if (maxLuma - minLuma < 2) throw new Error('QUALITY_GATE: video is effectively static')
  return { width, height, duration, meanDb, maxDb, greenRatio, samples }
}

export async function validateRemoteMarketingVideo(videoUrl: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-video-'))
  const file = path.join(directory, 'render.mp4')
  try {
    const response = await axios.get(videoUrl, { responseType: 'stream', timeout: 120_000 })
    await pipeline(response.data, fs.createWriteStream(file))
    return validateMarketingVideo(file)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}