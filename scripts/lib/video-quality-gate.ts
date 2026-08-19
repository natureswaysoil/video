// @ts-nocheck
import fs from 'fs'
import { spawnSync } from 'child_process'

export function validateMarketingVideo(file: string) {
  if (!file || !fs.existsSync(file)) throw new Error('QUALITY_GATE: rendered video is missing')
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_type,width,height,bit_rate', '-of', 'json', file], { encoding: 'utf8' })
  if (probe.status !== 0) throw new Error(`QUALITY_GATE: ffprobe failed: ${probe.stderr || 'unknown error'}`)
  const data = JSON.parse(probe.stdout || '{}')
  const video = (data.streams || []).find((s: any) => s.codec_type === 'video') || {}
  const audio = (data.streams || []).find((s: any) => s.codec_type === 'audio') || {}
  const duration = Number(data.format?.duration || 0)
  const width = Number(video.width || 0), height = Number(video.height || 0)
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
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], luma = (r + g + b) / 3
    minLuma = Math.min(minLuma, luma); maxLuma = Math.max(maxLuma, luma); samples++
    if (g > r * 1.28 && g > b * 1.28 && g - Math.max(r, b) > 25) greenSamples++
  }
  const greenRatio = samples ? greenSamples / samples : 1
  if (samples < 10) throw new Error(`QUALITY_GATE: only ${samples} visual samples were readable`)
  if (greenRatio >= 0.7) throw new Error(`QUALITY_GATE: solid-green placeholder detected in ${Math.round(greenRatio * 100)}% of sampled frames`)
  if (maxLuma - minLuma < 2) throw new Error('QUALITY_GATE: video is effectively static')
  return { width, height, duration, meanDb, maxDb, greenRatio, samples, videoBitrate: Number(video.bit_rate || data.format?.bit_rate || 0) }
}
