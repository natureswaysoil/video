import 'dotenv/config'
import { isRotationEnabled, nextSeedSelection, buildRotationRow, clearInflight, loadSeedProducts } from '../src/rotation'

async function main() {
  process.env.USE_SEED_ROTATION = 'true'
  console.log('Rotation enabled:', isRotationEnabled())
  const products = loadSeedProducts()
  console.log(`Loaded ${products.length} seed products:`, products.map((p) => p.id).join(', '))

  for (let i = 0; i < 7; i++) {
    const sel = await nextSeedSelection()
    const row = buildRotationRow(sel) as any
    console.log(
      `#${i + 1} product=${sel.product.id} v=${sel.variationIndex + 1}/${sel.variationCount} resumed=${sel.resumed} jobId=${row.jobId} scenes=${row.product.scenes?.length ?? 0}`
    )
    await clearInflight({ success: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
