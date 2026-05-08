import * as fs from 'fs'
import * as path from 'path'

// Lazy-loaded to avoid requiring @google-cloud/storage when GCS state isn't used
type StorageClient = any
let _storage: StorageClient | null = null
async function getStorage(): Promise<StorageClient | null> {
  if (_storage) return _storage
  try {
    const mod = require('@google-cloud/storage')
    _storage = new mod.Storage()
    return _storage
  } catch {
    return null
  }
}

export type SeedScene = { query: string; seconds?: number }

export type SeedProduct = {
  id: string
  name: string
  description?: string
  category?: string
  keywords?: string[]
  funnelUrl: string
  checkoutUrl: string
  priority?: number
  scenes?: SeedScene[]
}

type RotationState = {
  cursor: number
  variationByProduct: Record<string, number>
  inflight?: {
    productId: string
    variationIndex: number
    heygenJobId?: string
    startedAt: string
  }
}

const CONFIG_PATH = process.env.TOP_PRODUCTS_FILE
  ? path.resolve(process.env.TOP_PRODUCTS_FILE)
  : path.resolve(process.cwd(), 'config', 'top-products.json')

const STATE_PATH = process.env.ROTATION_STATE_FILE
  ? path.resolve(process.env.ROTATION_STATE_FILE)
  : path.resolve(process.cwd(), 'data', 'rotation-state.json')

const GCS_URI = (process.env.ROTATION_STATE_GCS_URI || '').trim()
function parseGcsUri(uri: string): { bucket: string; object: string } | null {
  const m = /^gs:\/\/([^/]+)\/(.+)$/.exec(uri)
  if (!m) return null
  return { bucket: m[1], object: m[2] }
}
async function gcsFile(): Promise<any | null> {
  const parsed = parseGcsUri(GCS_URI)
  if (!parsed) return null
  const storage = await getStorage()
  if (!storage) return null
  return storage.bucket(parsed.bucket).file(parsed.object)
}

async function readStateFromGcs(): Promise<RotationState | null> {
  const file = await gcsFile()
  if (!file) return null
  try {
    const [exists] = await file.exists()
    if (!exists) return { cursor: -1, variationByProduct: {} }
    const [buf] = await file.download()
    const parsed = JSON.parse(buf.toString('utf8'))
    return {
      cursor: typeof parsed.cursor === 'number' ? parsed.cursor : -1,
      variationByProduct: parsed.variationByProduct || {},
      inflight: parsed.inflight,
    }
  } catch (e: any) {
    console.warn('⚠️ Failed to read rotation state from GCS, resetting:', e?.message || e)
    return { cursor: -1, variationByProduct: {} }
  }
}

async function writeStateToGcs(state: RotationState): Promise<boolean> {
  const file = await gcsFile()
  if (!file) return false
  try {
    await file.save(JSON.stringify(state, null, 2), {
      contentType: 'application/json',
      resumable: false,
    } as any)
    return true
  } catch (e: any) {
    console.warn('⚠️ Failed to write rotation state to GCS:', e?.message || e)
    return false
  }
}

const DEFAULT_VARIATIONS = Math.max(1, Number(process.env.VARIATIONS_PER_PRODUCT || 5))
const SEED_LIMIT = Math.max(1, Number(process.env.SEED_PRODUCT_LIMIT || 5))
const BASE_SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://www.natureswaysoil.com').replace(/\/+$/, '')

export function isRotationEnabled(): boolean {
  return String(process.env.USE_SEED_ROTATION || '').toLowerCase() === 'true'
}

export function loadSeedProducts(): SeedProduct[] {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Top products config not found at ${CONFIG_PATH}`)
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  const list: SeedProduct[] = Array.isArray(raw?.topProducts) ? raw.topProducts : []
  return list
    .filter((p) => p && p.id && p.name && p.funnelUrl && p.checkoutUrl)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
    .slice(0, SEED_LIMIT)
}

async function readState(): Promise<RotationState> {
  if (GCS_URI) {
    const fromGcs = await readStateFromGcs()
    if (fromGcs) return fromGcs
  }
  try {
    if (fs.existsSync(STATE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        return {
          cursor: typeof parsed.cursor === 'number' ? parsed.cursor : -1,
          variationByProduct: parsed.variationByProduct || {},
          inflight: parsed.inflight,
        }
      }
    }
  } catch (e: any) {
    console.warn('⚠️ Failed to read rotation state, resetting:', e?.message || e)
  }
  return { cursor: -1, variationByProduct: {} }
}

async function writeState(state: RotationState) {
  if (GCS_URI) {
    const ok = await writeStateToGcs(state)
    if (ok) return
  }
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

export type RotationSelection = {
  product: SeedProduct
  variationIndex: number
  variationCount: number
  pendingHeygenJobId?: string
  cycleId: string
  resumed: boolean
}

/**
 * Pick the next product+variation in round-robin order.
 * If a prior cycle left a HeyGen job in flight, we resume that slot so
 * the next cycle polls the same job rather than spending HeyGen credits twice.
 */
export async function nextSeedSelection(): Promise<RotationSelection> {
  const products = loadSeedProducts()
  if (products.length === 0) {
    throw new Error('No seed products configured (config/top-products.json is empty).')
  }

  const state = await readState()

  if (state.inflight) {
    const product = products.find((p) => p.id === state.inflight!.productId)
    if (product) {
      return {
        product,
        variationIndex: state.inflight.variationIndex,
        variationCount: DEFAULT_VARIATIONS,
        pendingHeygenJobId: state.inflight.heygenJobId,
        cycleId: state.inflight.startedAt,
        resumed: true,
      }
    }
    state.inflight = undefined
  }

  const nextCursor = (state.cursor + 1) % products.length
  const product = products[nextCursor]
  const lastVariation = state.variationByProduct[product.id]
  const variationIndex =
    typeof lastVariation === 'number'
      ? (lastVariation + 1) % DEFAULT_VARIATIONS
      : 0
  const cycleId = new Date().toISOString()

  state.cursor = nextCursor
  state.inflight = { productId: product.id, variationIndex, startedAt: cycleId }
  await writeState(state)

  return {
    product,
    variationIndex,
    variationCount: DEFAULT_VARIATIONS,
    cycleId,
    resumed: false,
  }
}

export async function noteHeygenJob(heygenJobId: string) {
  const state = await readState()
  if (!state.inflight) return
  state.inflight.heygenJobId = heygenJobId
  await writeState(state)
}

export async function clearInflight(opts: { success: boolean } = { success: false }) {
  const state = await readState()
  if (!state.inflight) return
  if (opts.success) {
    state.variationByProduct[state.inflight.productId] = state.inflight.variationIndex
  }
  state.inflight = undefined
  await writeState(state)
}

/**
 * Build a synthetic CSV-row-shaped object so the existing cli.ts loop can
 * generate+post for the selected seed product without a real sheet row.
 */
export function buildRotationRow(selection: RotationSelection) {
  const { product, variationIndex, variationCount, pendingHeygenJobId, cycleId } = selection
  const funnelUrl = `${BASE_SITE_URL}${product.funnelUrl}`
  const checkoutUrl = `${BASE_SITE_URL}${product.checkoutUrl}`
  const variationLabel = `${variationIndex + 1} of ${variationCount}`
  const angleHint = `Variation ${variationLabel}: lead with a fresh hook and opening different from prior variations.`
  const detailsParts = [
    product.description || product.name,
    angleHint,
    `Shop direct and save 15%: ${funnelUrl}`,
    Array.isArray(product.keywords) && product.keywords.length
      ? `Keywords: ${product.keywords.join(', ')}`
      : '',
  ].filter(Boolean)

  const details = detailsParts.join('\n\n')
  // unique per cycle so the cli.ts `seen` set doesn't dedupe across cycles
  const jobId = `${product.id}-v${variationIndex + 1}-${cycleId}`

  const record: Record<string, any> = {
    Product_ID: product.id,
    ASIN: product.id,
    Product_Title: product.name,
    Product_Description: details,
    Product_URL: funnelUrl,
    // Pass rotation-defined Pexels scene queries through to heygen-adapter
    scenes: Array.isArray(product.scenes) ? product.scenes : [],
  }

  if (pendingHeygenJobId) {
    record.Video_ID = pendingHeygenJobId
    record.Video_Status = 'Processing'
  }

  return {
    product: {
      id: product.id,
      name: product.name,
      title: product.name,
      details,
      url: funnelUrl,
      funnelUrl,
      checkoutUrl,
      variationIndex,
      variationCount,
      scenes: Array.isArray(product.scenes) ? product.scenes : [],
    },
    jobId,
    rowNumber: 0,
    headers: [] as string[],
    record,
  }
}
