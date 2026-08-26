// @ts-nocheck
import fs from 'fs'
import { spawnSync } from 'child_process'

function frameStats(frame: Buffer) {
  let green = 0
  let pixels = 0
  let minLuma = 255
  let maxLuma = 0
  let lumaSum = 0
  for (let i = 0; i + 2 < frame.length; i += 3) {
    const r = frame[i]
    const g = frame[i + 1]
    const b = frame[i + 2]
    const luma = (r + g + b) / 3
    minLuma = Math.min(minLuma, luma)
    maxLuma = Math.max(maxLuma, luma)
    lumaSum += luma
    pixels++
    if (g > r * 1.35 && g > b * 1.35 && g - Math.max(r, b) > 28) green++
  }
  const greenRatio = pixels ? green / pixels : 1
  return {
    pixels,
    greenRatio,
    lumaRange: maxLuma - minLuma,
    meanLuma: pixels ? lumaSum / pixels : 0,
    // Real lawns can be mostly green, but a green placeholder is usually both
    // overwhelmingly green and visually flat across the frame.
    greenPlaceholder: greenRatio >= 0.90 && (maxLuma - minLuma) < 65
  }
}

export function validateMarketingVideo(file: string) {
  if (!file || !fs.existsSync(file)) throw new Error('QUALITY_GATE: rendered video is missing')
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_type,width,height,bit_rate,codec_name,pix_fmt,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' })
  if (probe.status !== 0) throw new Error(`QUALITY_GATE: ffprobe failed: ${probe.stderr || 'unknown error'}`)
  const data = JSON.parse(probe.stdout || '{}')
  const video = (data.streams || []).find((s: any) => s.codec_type === 'video') || {}
  const audio = (data.streams || []).find((s: any) => s.codec_type === 'audio') || {}
  const duration = Number(data.format?.duration || 0)
  const width = Number(video.width || 0), height = Number(video.height || 0)
  if (width < 1080 || height < 1080) throw new Error(`QUALITY_GATE: output is only ${width}x${height}; minimum is 1080p`)
  if (duration < 15 || duration > 60) throw new Error(`QUALITY_GATE: invalid marketing-video duration ${duration.toFixed(1)}s`)
  if (!audio.codec_type) throw new Error('QUALITY_GATE: narration/audio track is missing')
  if (!/h264/i.test(String(video.codec_name || ''))) throw new Error(`QUALITY_GATE: expected H.264 video, found ${video.codec_name || 'unknown codec'}`)
  if (String(video.pix_fmt || '') !== 'yuv420p') throw new Error(`QUALITY_GATE: expected yuv420p pixel format, found ${video.pix_fmt || 'unknown'}`)

  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
  const volume = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', nullDevice], { encoding: 'utf8' })
  const volumeText = `${volume.stdout || ''}\n${volume.stderr || ''}`
  const meanDb = Number(volumeText.match(/mean_volume:\s*(-?[\d.]+) dB/i)?.[1] || -100)
  const maxDb = Number(volumeText.match(/max_volume:\s*(-?[\d.]+) dB/i)?.[1] || -100)
  if (meanDb < -32 || maxDb < -12) throw new Error(`QUALITY_GATE: audio is too quiet (mean ${meanDb} dB, max ${maxDb} dB)`)

  // Sample a 16x16 grid once per second. This preserves enough spatial detail
  // to distinguish a real green lawn from a flat green decoder/placeholder frame.
  const grid = 16
  const frameBytes = grid * grid * 3
  const colors = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `fps=1,scale=${grid}:${grid},format=rgb24`, '-f', 'rawvideo', '-'], { encoding: null, maxBuffer: 8 * 1024 * 1024 })
  if (colors.status !== 0 || !Buffer.isBuffer(colors.stdout)) throw new Error('QUALITY_GATE: could not sample rendered frames')
  const pixels = colors.stdout as Buffer
  const frameCount = Math.floor(pixels.length / frameBytes)
  if (frameCount < 10) throw new Error(`QUALITY_GATE: only ${frameCount} visual samples were readable`)

  let greenFrames = 0
  let minMean = 255
  let maxMean = 0
  const greenFrameDetails: any[] = []
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const start = frameIndex * frameBytes
    const stats = frameStats(pixels.subarray(start, start + frameBytes))
    minMean = Math.min(minMean, stats.meanLuma)
    maxMean = Math.max(maxMean, stats.meanLuma)
    if (stats.greenPlaceholder) {
      greenFrames++
      if (greenFrameDetails.length < 5) {
        greenFrameDetails.push({ second: frameIndex, greenRatio: Number(stats.greenRatio.toFixed(3)), lumaRange: Number(stats.lumaRange.toFixed(1)) })
      }
    }
  }

  const greenRatio = greenFrames / frameCount
  // Reject even a minority run of green placeholder frames. Four seconds of
  // bad footage is enough to ruin a short ad, while the spatial-flatness check
  // above prevents ordinary lawn footage from being mislabeled.
  if (greenFrames >= 4 || greenRatio >= 0.20) {
    throw new Error(`QUALITY_GATE: green-screen/placeholder frames detected (${greenFrames}/${frameCount}, ${Math.round(greenRatio * 100)}%). Samples: ${JSON.stringify(greenFrameDetails)}`)
  }
  if (maxMean - minMean < 2) throw new Error('QUALITY_GATE: video is effectively static')

  return {
    width,
    height,
    duration,
    meanDb,
    maxDb,
    greenRatio,
    greenFrames,
    samples: frameCount,
    codec: video.codec_name,
    pixelFormat: video.pix_fmt,
    videoBitrate: Number(video.bit_rate || data.format?.bit_rate || 0)
  }
}
