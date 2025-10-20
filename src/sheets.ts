import { GoogleAuth } from 'google-auth-library'
import { google } from 'googleapis'

export async function markRowPosted(params: {
  spreadsheetId: string
  sheetGid?: string | number
  rowNumber: number
  headers: string[]
  postedColumn?: string
  timestampColumn?: string
}) {
  const {
    spreadsheetId,
    sheetGid,
    rowNumber,
    headers,
    postedColumn = process.env.CSV_COL_POSTED || 'Posted',
    timestampColumn = process.env.CSV_COL_POSTED_AT || 'Posted_At',
  } = params

  const clientEmail = process.env.GS_SERVICE_ACCOUNT_EMAIL as string | undefined
  const privateKey = (process.env.GS_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n') || undefined
  const scopes = ['https://www.googleapis.com/auth/spreadsheets']
  let authClient: any
  if (clientEmail && privateKey) {
    // Use explicit service account key if provided
    authClient = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes })
  } else {
    // Fallback to Application Default Credentials (e.g., Cloud Run Job's service account)
    const ga = new GoogleAuth({ scopes })
    authClient = await ga.getClient()
  }
  const sheets = google.sheets({ version: 'v4', auth: authClient })

  // Resolve A1 notation for the target sheet and columns
  const sheetName = await resolveSheetName(sheets, spreadsheetId, sheetGid)
  const postedColIndex = Math.max(0, headers.indexOf(postedColumn))
  const tsColIndex = timestampColumn ? Math.max(0, headers.indexOf(timestampColumn)) : -1
  const postedA1 = a1(sheetName, rowNumber, postedColIndex + 1)
  const tsA1 = tsColIndex >= 0 ? a1(sheetName, rowNumber, tsColIndex + 1) : undefined

  const data: any[] = [
    { range: postedA1, values: [[ 'TRUE' ]] },
  ]
  if (tsA1) data.push({ range: tsA1, values: [[ new Date().toISOString() ]] })

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  })
}

export async function writeColumnValues(params: {
  spreadsheetId: string
  sheetGid?: string | number
  headers: string[]
  columnName: string
  rows: Array<{ rowNumber: number; value: string | undefined }>
}) {
  const { spreadsheetId, sheetGid, headers, columnName, rows } = params
  const clientEmail = process.env.GS_SERVICE_ACCOUNT_EMAIL as string | undefined
  const privateKey = (process.env.GS_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n') || undefined
  const scopes = ['https://www.googleapis.com/auth/spreadsheets']
  let authClient: any
  if (clientEmail && privateKey) {
    authClient = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes })
  } else {
    const ga = new GoogleAuth({ scopes })
    authClient = await ga.getClient()
  }
  const sheets = google.sheets({ version: 'v4', auth: authClient })

  const sheetName = await resolveSheetName(sheets, spreadsheetId, sheetGid)
  let colIndex = headers.indexOf(columnName)
  const data: any[] = []
  if (colIndex === -1) {
    // Create header in the next empty column
    colIndex = headers.length
    const headerCell = a1(sheetName, 1, colIndex + 1)
    data.push({ range: headerCell, values: [[columnName]] })
  }
  for (const r of rows) {
    if (typeof r.value !== 'string' || r.value.length === 0) continue
    const cell = a1(sheetName, r.rowNumber, colIndex + 1)
    data.push({ range: cell, values: [[r.value]] })
  }
  if (data.length === 0) return
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  })
}

export async function writeColumnLetterValues(params: {
  spreadsheetId: string
  sheetGid?: string | number
  columnLetter: string
  rows: Array<{ rowNumber: number; value: string | undefined }>
}) {
  const { spreadsheetId, sheetGid, columnLetter, rows } = params
  const clientEmail = process.env.GS_SERVICE_ACCOUNT_EMAIL as string | undefined
  const privateKey = (process.env.GS_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n') || undefined
  const scopes = ['https://www.googleapis.com/auth/spreadsheets']
  let authClient: any
  if (clientEmail && privateKey) {
    authClient = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes })
  } else {
    const ga = new GoogleAuth({ scopes })
    authClient = await ga.getClient()
  }
  const sheets = google.sheets({ version: 'v4', auth: authClient })

  const sheetName = await resolveSheetName(sheets, spreadsheetId, sheetGid)
  const data: any[] = []
  for (const r of rows) {
    if (typeof r.value !== 'string' || r.value.length === 0) continue
    const cell = `${sheetName}!${columnLetter}${r.rowNumber}`
    data.push({ range: cell, values: [[r.value]] })
  }
  if (data.length === 0) return
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  })
}

async function resolveSheetName(sheets: any, spreadsheetId: string, gid?: string | number): Promise<string> {
  if (!gid) return 'Sheet1'
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const targetId = Number(gid)
  const found = meta.data.sheets?.find((s: any) => s.properties?.sheetId === targetId)
  return found?.properties?.title || 'Sheet1'
}

function a1(sheet: string, row: number, col: number): string {
  return `${sheet}!${columnToLetter(col)}${row}`
}

function columnToLetter(col: number): string {
  let temp = ''
  while (col > 0) {
    const rem = (col - 1) % 26
    temp = String.fromCharCode(65 + rem) + temp
    col = Math.floor((col - 1) / 26)
  }
  return temp
}
