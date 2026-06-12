export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++
      row.push(field)
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      field = ''
      continue
    }

    field += ch
  }

  row.push(field)
  if (row.some((value) => value.trim() !== '')) rows.push(row)

  if (inQuotes) {
    throw new Error('CSV parsing failed: unclosed quoted field')
  }

  return rows
}
