// @ts-nocheck
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { ensureDir, hasUsableFile, safeFileName } from './video-utils'

const ROOT = process.cwd()
const PRODUCT_ASSET_DIR = path.resolve(ROOT, 'assets/products')
const DEFAULT_SITE_BASE_URL = 'https://www.natureswaysoil.com'

function probeImage(file: string) {
  if (!hasUsableFile(file)) return { ok: false, width: 0, height: 0, reason: 'missing or empty file' }
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', file],
    { encoding: 'utf8' }
  )
  if (probe.status !== 0) {
    return { ok: false, width: 0, height: 0, reason: String(probe.stderr || 'ffprobe failed').trim() }
  }
  let stream: any = null
  try { stream = JSON.parse(probe.stdout || '{}').streams?.[0] } catch {}
  const width = Number(stream?.width || 0)
  const height = Number(stream?.height || 0)
  return {
    ok: Boolean(stream?.codec_name) && width >= 100 && height >= 100,
    width,
    height,
    reason: width < 100 || height < 100 ? `unusable dimensions ${width}x${height}` : ''
  }
}

function usableProductImage(file: string, label: string) {
  if (!file) return ''
  const result = probeImage(file)
  if (result.ok) return file
  console.log('Product image rejected before scene rendering; b-roll fallback will be used', {
    source: label,
    file: path.basename(file),
    width: result.width,
    height: result.height,
    reason: result.reason
  })
  return ''
}

export function localProductImage(product: any) {
  const candidates = [
    path.resolve(PRODUCT_ASSET_DIR, `${product.id}.png`),
    path.resolve(PRODUCT_ASSET_DIR, `${product.id}.jpg`),
    path.resolve(PRODUCT_ASSET_DIR, `${safeFileName(product.name, 'png')}`),
    path.resolve(PRODUCT_ASSET_DIR, `${safeFileName(product.name, 'jpg')}`)
  ]
  for (const file of candidates) {
    if (!hasUsableFile(file)) continue
    const valid = usableProductImage(file, 'local')
    if (valid) return valid
  }
  return ''
}

function encodeUrlPath(url: string) {
  try {
    const parsed = new URL(url)
    parsed.pathname = parsed.pathname
      .split('/')
      .map((part) => encodeURIComponent(decodeURIComponent(part)))
      .join('/')
    return parsed.toString()
  } catch {
    return url
  }
}

function productImageSource(product: any) {
  const source = product.productImageUrl || product.imageUrl || product.amazonImageUrl || product.productImagePath || product.imagePath || ''
  if (!source) return ''
  if (/^https?:\/\//i.test(source)) return encodeUrlPath(source)
  if (String(source).startsWith('/')) {
    const base = (process.env.PRODUCT_IMAGE_BASE_URL || DEFAULT_SITE_BASE_URL).replace(/\/$/, '')
    return encodeUrlPath(`${base}${source}`)
  }
  return source
}

function imageExtension(url: string) {
  const clean = String(url || '').split('?')[0].toLowerCase()
  if (clean.endsWith('.png')) return 'png'
  if (clean.endsWith('.webp')) return 'webp'
  return 'jpg'
}

export async function downloadProductImage(product: any, outputDir: string) {
  const local = localProductImage(product)
  if (local) return local

  const url = productImageSource(product)
  if (!url) return ''

  ensureDir(outputDir)
  const ext = imageExtension(url)
  const output = path.resolve(outputDir, `product-${product.id}.${ext}`)

  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300
    })
    const contentType = String(response.headers?.['content-type'] || '').toLowerCase()
    if (contentType && !contentType.startsWith('image/')) {
      response.data?.destroy?.()
      throw new Error(`product image URL returned ${contentType} instead of an image`)
    }
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(output)
      response.data.pipe(writer)
      writer.on('finish', resolve)
      writer.on('error', reject)
      response.data.on('error', reject)
    })
    if (!hasUsableFile(output)) throw new Error('downloaded product image is empty or missing')

    const valid = usableProductImage(output, url)
    if (!valid) {
      try { if (fs.existsSync(output)) fs.unlinkSync(output) } catch {}
      return ''
    }
    return valid
  } catch (error: any) {
    console.log('Product image skipped; continuing with b-roll only', {
      productId: product.id,
      source: url,
      error: error?.response?.status || error?.message || error
    })
    try { if (fs.existsSync(output)) fs.unlinkSync(output) } catch {}
    return ''
  }
}

export function productOverlayText(product: any) {
  if (/2\.5|pasture|hay|acre/i.test(`${product.name} ${product.description}`)) return 'COVERS UP TO 2–5 ACRES'
  if (/dog|urine|odor|pet/i.test(`${product.name} ${product.description}`)) return 'PET-SAFE OUTDOOR SUPPORT'
  if (/worm|biochar|compost|living soil/i.test(`${product.name} ${product.description}`)) return 'WORM CASTINGS + BIOCHAR'
  if (/humic|fulvic|kelp/i.test(`${product.name} ${product.description}`)) return 'HUMIC + FULVIC + KELP'
  return 'SOIL-FIRST SUPPORT'
}
