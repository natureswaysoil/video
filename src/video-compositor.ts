import axios from 'axios'
import { uploadVideoToCloudinary } from './cloudinary-upload'
import { selectPexelsBackground } from './pexels'

const fsAny: any = require('fs')
const pathAny: any = require('path')
const spawnAny: any = require('child_process').spawn

type RowRecord = Record<string, any>

type EnhanceInput = {
  baseVideoUrl: string
  record: RowRecord
  rowNumber: number
  jobId: string
}

export type EnhancementSelection = {
  enabled: boolean
  brollUrl: string
  productImageUrl: string
  brollQuery: string
}

function firstNonEmpty(record: RowRecord | undefined, keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return ''
}

function parseCsvList(raw: string | undefined, fallback: string[]): string[] {
  const value = String(raw || '').trim()
  if (!value) return fallback
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

function isEnabled(raw: string | undefined, fallback: boolean): boolean {
  const value = String(raw || '').trim().toLowerCase()
  if (!value) return fallback
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function numberFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number(String(raw || '').trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

type ProfileDefaults = {
  preset: string
  crf: number
  maxVideoBitrate: string
  bufferSize: string
  audioBitrate: string
  didWidth: number
  productWidth: number
  didTop: number
  productRight: number
  productBottom: number
}

function getProfileDefaults(profileName: string): ProfileDefaults {
  const name = profileName.trim().toLowerCase()

  if (name === 'fast') {
    return {
      preset: 'veryfast',
      crf: 22,
      maxVideoBitrate: '5000k',
      bufferSize: '9000k',
      audioBitrate: '128k',
      didWidth: 780,
      productWidth: 380,
      didTop: 80,
      productRight: 52,
      productBottom: 110,
    }
  }

  if (name === 'balanced') {
    return {
      preset: 'medium',
      crf: 20,
      maxVideoBitrate: '6500k',
      bufferSize: '12000k',
      audioBitrate: '160k',
      didWidth: 820,
      productWidth: 420,
      didTop: 70,
      productRight: 44,
      productBottom: 98,
    }
  }

  // Default to cinematic for highest quality output.
  return {
    preset: 'slow',
    crf: 16,
    maxVideoBitrate: '9000k',
    bufferSize: '18000k',
    audioBitrate: '224k',
    didWidth: 860,
    productWidth: 460,
    didTop: 56,
    productRight: 36,
    productBottom: 86,
  }
}

function ffmpegProfile() {
  const profileName = String(process.env.VIDEO_QUALITY_PROFILE || 'cinematic')
  const defaults = getProfileDefaults(profileName)

  return {
    width: Math.round(numberFromEnv(process.env.VIDEO_OUTPUT_WIDTH, 1080)),
    height: Math.round(numberFromEnv(process.env.VIDEO_OUTPUT_HEIGHT, 1920)),
    fps: Math.round(numberFromEnv(process.env.VIDEO_OUTPUT_FPS, 30)),
    didWidth: Math.round(numberFromEnv(process.env.VIDEO_DID_LAYER_WIDTH, defaults.didWidth)),
    productWidth: Math.round(numberFromEnv(process.env.VIDEO_PRODUCT_LAYER_WIDTH, defaults.productWidth)),
    didTop: Math.round(numberFromEnv(process.env.VIDEO_DID_LAYER_TOP, defaults.didTop)),
    productRight: Math.round(numberFromEnv(process.env.VIDEO_PRODUCT_RIGHT, defaults.productRight)),
    productBottom: Math.round(numberFromEnv(process.env.VIDEO_PRODUCT_BOTTOM, defaults.productBottom)),
    preset: String(process.env.VIDEO_OUTPUT_PRESET || defaults.preset).trim(),
    crf: Math.round(numberFromEnv(process.env.VIDEO_OUTPUT_CRF, defaults.crf)),
    audioBitrate: String(process.env.VIDEO_AUDIO_BITRATE || defaults.audioBitrate).trim(),
    maxVideoBitrate: String(process.env.VIDEO_MAX_BITRATE || defaults.maxVideoBitrate).trim(),
    bufferSize: String(process.env.VIDEO_BUFFER_SIZE || defaults.bufferSize).trim(),
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    fsAny.mkdir(dirPath, { recursive: true }, (error: any) => {
      if (error) return reject(error)
      resolve()
    })
  })
}

async function removeDir(dirPath: string): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      fsAny.rm(dirPath, { recursive: true, force: true }, () => resolve())
    })
  } catch {
    // Best-effort temp cleanup.
  }
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawnAny(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''

    child.stderr.on('data', (chunk: any) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code: any) => {
      if (code === 0) return resolve()
      reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-1200)}`))
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

async function downloadToFile(url: string, targetPath: string): Promise<void> {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 90_000,
    maxRedirects: 5,
  })

  await new Promise<void>((resolve, reject) => {
    const writer = fsAny.createWriteStream(targetPath)
    response.data.pipe(writer)
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

export function getEnhancementSelection(record: RowRecord): EnhancementSelection {
  const enabled = isEnabled(process.env.ENABLE_VIDEO_ENHANCEMENT, true)
  const brollColumns = parseCsvList(process.env.VIDEO_BROLL_COLUMNS, [
    'DID_BROLL_URL',
    'BROLL_URL',
    'B_ROLL_URL',
    'GARDEN_BROLL_URL',
  ])
  const queryColumns = parseCsvList(process.env.VIDEO_BROLL_QUERY_COLUMNS, [
    'Broll_Query',
    'BROLL_QUERY',
    'B-Roll_Query',
    'Pexels_Query',
    'PEXELS_QUERY',
    'Visual_Keyword',
    'VISUAL_KEYWORD',
  ])
  const imageColumns = parseCsvList(process.env.VIDEO_PRODUCT_IMAGE_COLUMNS, [
    'Product_Image_URL',
    'PRODUCT_IMAGE_URL',
    'Image_URL',
    'image_url',
    'Main_Image_URL',
    'Hero_Image_URL',
  ])

  const brollUrl = firstNonEmpty(record, brollColumns) || String(process.env.VIDEO_DEFAULT_BROLL_URL || '').trim()
  const productImageUrl = firstNonEmpty(record, imageColumns)
  const brollQuery = firstNonEmpty(record, queryColumns)

  return { enabled, brollUrl, productImageUrl, brollQuery }
}

function parseOrientation(raw: string | undefined): 'portrait' | 'landscape' | 'square' {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'landscape' || value === 'square') return value
  return 'portrait'
}

function productFromRecord(record: RowRecord): { title: string; name: string; details: string } {
  const title = firstNonEmpty(record, ['Title', 'title', 'Product', 'product', 'Product_Name', 'name'])
  const details = firstNonEmpty(record, ['Description', 'description', 'Details', 'details', 'Caption', 'caption'])
  return {
    title,
    name: title,
    details,
  }
}

async function resolveBrollUrl(selection: EnhancementSelection, record: RowRecord): Promise<string> {
  if (selection.brollUrl) return selection.brollUrl

  const autoPexels = isEnabled(process.env.VIDEO_AUTO_PEXELS_BROLL, true)
  const hasPexelsApiKey = String(process.env.PEXELS_API_KEY || '').trim().length > 0
  if (!autoPexels || !hasPexelsApiKey) return ''

  const minDurationSeconds = Math.round(numberFromEnv(process.env.VIDEO_BROLL_MIN_DURATION_SECONDS, 8))
  const orientation = parseOrientation(process.env.VIDEO_PEXELS_ORIENTATION)

  try {
    const picked = await selectPexelsBackground({
      product: productFromRecord(record),
      record,
      orientation,
      minDurationSeconds,
    })

    if (!picked?.url) return ''

    console.log(`✅ Auto-selected Pexels B-roll (${picked.query}, id ${picked.id})`)
    return picked.url
  } catch (error) {
    console.warn(`⚠️ Pexels B-roll auto-selection failed (${String(error)}). Continuing without B-roll.`)
    return ''
  }
}

async function composeVideo(params: {
  baseVideoPath: string
  brollPath?: string
  productImagePath?: string
  outputPath: string
}): Promise<void> {
  const { baseVideoPath, brollPath, productImagePath, outputPath } = params
  const profile = ffmpegProfile()
  const args: string[] = ['-y', '-i', baseVideoPath]

  if (brollPath) args.push('-i', brollPath)
  if (productImagePath) args.push('-i', productImagePath)

  let filter = ''
  let mapVideo = ''

  if (brollPath && productImagePath) {
    filter = [
      `[1:v]scale=${profile.width}:${profile.height}:flags=lanczos:force_original_aspect_ratio=increase,crop=${profile.width}:${profile.height},setsar=1,fps=${profile.fps},eq=saturation=1.06:contrast=1.03:brightness=0.01[bg]`,
      `[0:v]scale=${profile.didWidth}:-1:flags=lanczos,unsharp=5:5:0.8:3:3:0.2[did]`,
      `[2:v]scale=${profile.productWidth}:-1:flags=lanczos,unsharp=5:5:0.6:3:3:0.0[prod]`,
      `[bg][did]overlay=(W-w)/2:${profile.didTop}[tmp1]`,
      `[tmp1][prod]overlay=W-w-${profile.productRight}:H-h-${profile.productBottom},format=yuv420p[v]`,
    ].join(';')
    mapVideo = '[v]'
  } else if (brollPath) {
    filter = [
      `[1:v]scale=${profile.width}:${profile.height}:flags=lanczos:force_original_aspect_ratio=increase,crop=${profile.width}:${profile.height},setsar=1,fps=${profile.fps},eq=saturation=1.06:contrast=1.03:brightness=0.01[bg]`,
      `[0:v]scale=${profile.didWidth}:-1:flags=lanczos,unsharp=5:5:0.8:3:3:0.2[did]`,
      `[bg][did]overlay=(W-w)/2:${profile.didTop},format=yuv420p[v]`,
    ].join(';')
    mapVideo = '[v]'
  } else if (productImagePath) {
    filter = [
      `[0:v]scale=${profile.width}:${profile.height}:flags=lanczos:force_original_aspect_ratio=increase,crop=${profile.width}:${profile.height},setsar=1,fps=${profile.fps},unsharp=5:5:0.6:3:3:0.1[base]`,
      `[1:v]scale=${profile.productWidth}:-1:flags=lanczos,unsharp=5:5:0.6:3:3:0.0[prod]`,
      `[base][prod]overlay=W-w-${profile.productRight}:H-h-${profile.productBottom},format=yuv420p[v]`,
    ].join(';')
    mapVideo = '[v]'
  } else {
    filter = `[0:v]scale=${profile.width}:${profile.height}:flags=lanczos:force_original_aspect_ratio=increase,crop=${profile.width}:${profile.height},setsar=1,fps=${profile.fps},unsharp=5:5:0.6:3:3:0.1,format=yuv420p[v]`
    mapVideo = '[v]'
  }

  args.push(
    '-filter_complex',
    filter,
    '-map',
    mapVideo,
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    '-level:v',
    '4.1',
    '-r',
    String(profile.fps),
    '-preset',
    profile.preset,
    '-crf',
    String(profile.crf),
    '-maxrate',
    profile.maxVideoBitrate,
    '-bufsize',
    profile.bufferSize,
    '-c:a',
    'aac',
    '-b:a',
    profile.audioBitrate,
    '-movflags',
    '+faststart',
    '-shortest',
    outputPath,
  )

  await runCommand('ffmpeg', args)
}

export async function maybeEnhanceVideoForPosting(input: EnhanceInput): Promise<string> {
  const selection = getEnhancementSelection(input.record)
  if (!selection.enabled) return input.baseVideoUrl

  const brollUrl = await resolveBrollUrl(selection, input.record)
  const productImageUrl = selection.productImageUrl
  if (!brollUrl && !productImageUrl) return input.baseVideoUrl

  const ffmpegAvailable = await hasCommand('ffmpeg')
  if (!ffmpegAvailable) {
    console.warn('⚠️ ENABLE_VIDEO_ENHANCEMENT is on but ffmpeg is not installed. Using original D-ID URL.')
    return input.baseVideoUrl
  }

  const tempRoot = process.env.TMPDIR || '/tmp'
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const tempDir = pathAny.join(tempRoot, `nws-video-enhance-${suffix}`)
  await ensureDir(tempDir)

  const basePath = pathAny.join(tempDir, 'base.mp4')
  const brollPath = brollUrl ? pathAny.join(tempDir, 'broll.mp4') : ''
  const imagePath = productImageUrl ? pathAny.join(tempDir, 'product-image') : ''
  const outputPath = pathAny.join(tempDir, 'enhanced.mp4')

  try {
    await downloadToFile(input.baseVideoUrl, basePath)

    let downloadedBrollPath = ''
    if (brollUrl) {
      try {
        await downloadToFile(brollUrl, brollPath)
        downloadedBrollPath = brollPath
      } catch (error) {
        console.warn(`⚠️ Row ${input.rowNumber}: failed to download B-roll (${String(error)}). Continuing without B-roll.`)
      }
    }

    let downloadedImagePath = ''
    if (productImageUrl) {
      try {
        await downloadToFile(productImageUrl, imagePath)
        downloadedImagePath = imagePath
      } catch (error) {
        console.warn(`⚠️ Row ${input.rowNumber}: failed to download product image (${String(error)}). Continuing without image overlay.`)
      }
    }

    await composeVideo({
      baseVideoPath: basePath,
      brollPath: downloadedBrollPath || undefined,
      productImagePath: downloadedImagePath || undefined,
      outputPath,
    })

    const uploadedUrl = await uploadVideoToCloudinary(outputPath)
    console.log(
      `✅ Row ${input.rowNumber}: enhanced video created (job ${input.jobId}) with${downloadedBrollPath ? ' B-roll' : ''}${downloadedImagePath ? ' + product image' : ''}`
    )
    return uploadedUrl
  } catch (error) {
    console.warn(`⚠️ Row ${input.rowNumber}: enhancement failed (${String(error)}). Using original D-ID video URL.`)
    return input.baseVideoUrl
  } finally {
    await removeDir(tempDir)
  }
}
