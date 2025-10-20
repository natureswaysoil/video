import axios from 'axios'

export type Product = {
  id?: string
  name?: string
  title?: string
  details?: string
  [k: string]: any
}
export async function processCsvUrl(csvUrl: string): Promise<{ skipped: boolean; rows: Array<{ product: Product; jobId: string; rowNumber: number; headers: string[]; record: Record<string,string> }> }>{
  // Fetch CSV and parse all rows; map headers from the provided sheet flexibly.
  const { data } = await axios.get<string>(csvUrl, { responseType: 'text' })
  const lines: string[] = data.split(/\r?\n/)
  if (lines.length < 2) return { skipped: true, rows: [] }
  const headers: string[] = splitCsvLine(lines[0]).map((h: string) => h.trim())
  const rows: Array<{ product: Product; jobId: string; rowNumber: number; headers: string[]; record: Record<string,string> }> = []
  for (const [i, raw] of lines.slice(1).entries()) {
    if (!raw.trim()) continue
    const cols = splitCsvLine(raw)
    if (!cols.some(Boolean)) continue
    const rec: Record<string, string> = {}
    headers.forEach((h: string, i: number) => { rec[h] = (cols[i] ?? '').trim() })
    // Flexible header mapping with env overrides
    const jobId =
      pickFirst(rec, envKeys('CSV_COL_JOB_ID')) ||
      pickFirst(rec, ['jobId','job_id','wavespeed_job_id','WaveSpeed Job ID','WAVESPEED_JOB_ID','job'])
    if (!jobId) continue // skip rows missing jobId
    const title = pickFirst(rec, envKeys('CSV_COL_TITLE')) || pickFirst(rec, ['title','name','product','Product','Title'])
    const details = pickFirst(rec, envKeys('CSV_COL_DETAILS')) || pickFirst(rec, ['details','description','caption','Description','Details','Caption'])
    const product: Product = {
      id: pickFirst(rec, envKeys('CSV_COL_ID')) || pickFirst(rec, ['id','ID']),
      name: pickFirst(rec, envKeys('CSV_COL_NAME')) || pickFirst(rec, ['name','product','Product','Title']) || title,
      title: title || pickFirst(rec, ['name']),
      details: details,
      ...rec,
    }
    // Optional gating: skip if already posted; require ready/enabled if present
    const alwaysNew = String(process.env.ALWAYS_GENERATE_NEW_VIDEO || '').toLowerCase() === 'true'
    const posted = pickFirst(rec, envKeys('CSV_COL_POSTED')) || pickFirst(rec, ['Posted','posted'])
    if (!alwaysNew && posted && isTruthy(posted, process.env.CSV_STATUS_TRUE_VALUES)) {
      continue // don't process already-posted rows unless alwaysNew
    }
    const ready = pickFirst(rec, envKeys('CSV_COL_READY')) || pickFirst(rec, ['Ready','ready','Status','status','Enabled','enabled','Post','post'])
    if (ready && !isTruthy(ready, process.env.CSV_STATUS_TRUE_VALUES)) {
      continue // skip rows that are explicitly not ready
    }
    rows.push({ product, jobId, rowNumber: i + 2, headers, record: rec })
  }
  return { skipped: rows.length === 0, rows }
}

// Minimal CSV splitter handling quotes and commas
function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { // escaped quote
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function pickFirst(rec: Record<string,string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rec[k]
    if (v && v.length > 0) return v
  }
  return undefined
}

function isTruthy(val: string, custom?: string): boolean {
  const v = val.trim().toLowerCase()
  const defaults = ['1','true','yes','y','on','post','enabled']
  const list = (custom ? custom.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : defaults)
  return list.includes(v)
}

function envKeys(envName: string): string[] {
  const raw = process.env[envName]
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}
