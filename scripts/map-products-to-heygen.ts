#!/usr/bin/env ts-node
/**
 * Fetch public Google Sheet CSV, run mapping rules, write preview output, optional apply.
 *
 * Usage:
 *  # Preview only (no writes)
 *  npx ts-node --prefer-ts-exts scripts/map-products-to-heygen.ts --sheetId=1LU2ahpzMqLB5FLYqiyDbXOfjTxbdp8U8 --gid=1712974299
 *
 *  # To apply writes (only after review):
 *  USE_HEYGEN_WRITEBACK=true GCP_SECRET_SA_JSON="projects/993533990327/secrets/HEYGEN/versions/latest" \
 *    npx ts-node --prefer-ts-exts scripts/map-products-to-heygen.ts --sheetId=... --gid=... --apply
 *
 * Outputs:
 *  - ./out/heygen-mapping.json
 *  - ./out/heygen-mapping.csv
 */
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { mapProductToHeyGenPayload, writeBackMappingsToSheet } from '../src/heygen-adapter'

function ensureOutDir() {
  const out = path.join(process.cwd(), 'out')
  if (!fs.existsSync(out)) fs.mkdirSync(out)
  return out
}

async function fetchCsv(sheetId: string, gid: string) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch sheet CSV: ${res.status} ${res.statusText}`)
  return res.text()
}

// Simple CSV parser (note: naive; ok for well-formed CSV without embedded newlines/commas in fields)
function csvToRows(csv: string) {
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const headers = lines.shift()!.split(',').map(h => h.trim())
  return lines.map((ln) => {
    // split on comma — for safe production use a CSV parser (csv-parse)
    const cols = ln.split(',')
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => (obj[h] = (cols[i] || '').trim()))
    return obj
  })
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('sheetId', { type: 'string', demandOption: true })
    .option('gid', { type: 'string', demandOption: true })
    .option('apply', { type: 'boolean', default: false })
    .argv as any

  const csv = await fetchCsv(argv.sheetId, argv.gid)
  const rows = csvToRows(csv)

  const mapped = rows.map((row) => {
    const m = mapProductToHeyGenPayload(row)
    return {
      ...row,
      HEYGEN_AVATAR: m.avatar,
      HEYGEN_VOICE: m.voice,
      HEYGEN_LENGTH_SECONDS: m.lengthSeconds,
      HEYGEN_MAPPING_REASON: m.reason,
      HEYGEN_MAPPED_AT: new Date().toISOString(),
    }
  })

  const out = ensureOutDir()
  fs.writeFileSync(path.join(out, 'heygen-mapping.json'), JSON.stringify(mapped, null, 2))
  // CSV export
  const csvHeaders = Object.keys(mapped[0] || {})
  const csvLines = [csvHeaders.join(',')]
  for (const r of mapped) csvLines.push(csvHeaders.map((h) => `"${(r as any)[h] || ''}"`).join(','))
  fs.writeFileSync(path.join(out, 'heygen-mapping.csv'), csvLines.join('\n'))
  console.log(`Wrote preview to ${out}/heygen-mapping.{json,csv} (${mapped.length} rows)`)

  if (argv.apply) {
    if (!process.env.USE_HEYGEN_WRITEBACK) {
      console.error('USE_HEYGEN_WRITEBACK not set — refusing to write. Set USE_HEYGEN_WRITEBACK=true to enable.')
      process.exit(1)
    }
    if (!process.env.GCP_SA_JSON && !process.env.GCP_SECRET_SA_JSON) {
      console.error('No service account credentials found. Set GCP_SA_JSON (raw JSON) or GCP_SECRET_SA_JSON (secret resource name).')
      process.exit(1)
    }
    // write back to sheet
    // mappedRows order must match sheet rows (excluding header)
    await writeBackMappingsToSheet(argv.sheetId, argv.gid, mapped)
    console.log('Applied mappings to sheet.')
  } else {
    console.log('Preview-only mode. To apply writes add --apply and set USE_HEYGEN_WRITEBACK=true and credentials.')
  }
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
