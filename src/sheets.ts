import { GoogleAuth } from 'google-auth-library'
import { google } from 'googleapis'
import { AppError, ErrorCode, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getConfig } from './config-validator'

const logger = getLogger()
const metrics = getMetrics()

export async function markRowPosted(params: {
  spreadsheetId: string
  sheetGid?: string | number
  rowNumber: number
  headers: string[]
  postedColumn?: string
  timestampColumn?: string
}) {
  const startTime = Date.now()

  try {
    const {
      spreadsheetId,
      sheetGid,
      rowNumber,
      headers,
      postedColumn = process.env.CSV_COL_POSTED || 'Posted',
      timestampColumn = process.env.CSV_COL_POSTED_AT || 'Posted_At',
    } = params

    if (!spreadsheetId || !headers || headers.length === 0) {
      throw new AppError(
        'Missing required parameters for markRowPosted',
        ErrorCode.VALIDATION_ERROR,
        400,
        true,
        { hasSpreadsheetId: !!spreadsheetId, headersCount: headers?.length || 0 }
      )
    }

    logger.debug('Marking row as posted', 'Sheets', {
      spreadsheetId,
      rowNumber,
      postedColumn,
    })

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

    const data: any[] = [{ range: postedA1, values: [['TRUE']] }]
    if (tsA1) data.push({ range: tsA1, values: [[new Date().toISOString()]] })

    await withRetry(
      async () => {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data,
          },
        })
      },
      {
        maxRetries: 3,
        onRetry: (error, attempt) => {
          logger.warn('Retrying markRowPosted', 'Sheets', {
            attempt,
            spreadsheetId,
            rowNumber,
            error: error instanceof Error ? error.message : String(error),
          })
        },
      }
    )

    const duration = Date.now() - startTime
    metrics.incrementCounter('sheets.mark_posted.success')
    metrics.recordHistogram('sheets.mark_posted.duration', duration)

    logger.debug('Successfully marked row as posted', 'Sheets', {
      spreadsheetId,
      rowNumber,
      duration,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('sheets.mark_posted.error')
    metrics.recordHistogram('sheets.mark_posted.error_duration', duration)

    logger.error('Failed to mark row as posted', 'Sheets', {
      spreadsheetId: params.spreadsheetId,
      rowNumber: params.rowNumber,
      duration,
    }, error)

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(
      `Failed to mark row as posted: ${error.message || String(error)}`,
      ErrorCode.SHEETS_API_ERROR,
      500,
      true,
      { spreadsheetId: params.spreadsheetId, rowNumber: params.rowNumber },
      error instanceof Error ? error : undefined
    )
  }
}

export async function writeColumnValues(params: {
  spreadsheetId: string
  sheetGid?: string | number
  headers: string[]
  columnName: string
  rows: Array<{ rowNumber: number; value: string | undefined }>
}) {
  const startTime = Date.now()

  try {
    const { spreadsheetId, sheetGid, headers, columnName, rows } = params

    if (!spreadsheetId || !headers || !columnName || !rows) {
      throw new AppError(
        'Missing required parameters for writeColumnValues',
        ErrorCode.VALIDATION_ERROR,
        400,
        true,
        {
          hasSpreadsheetId: !!spreadsheetId,
          headersCount: headers?.length || 0,
          hasColumnName: !!columnName,
          rowsCount: rows?.length || 0,
        }
      )
    }

    logger.debug('Writing column values', 'Sheets', {
      spreadsheetId,
      columnName,
      rowCount: rows.length,
    })

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
    
    if (data.length === 0) {
      logger.debug('No data to write', 'Sheets', { spreadsheetId, columnName })
      return
    }

    await withRetry(
      async () => {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data,
          },
        })
      },
      {
        maxRetries: 3,
        onRetry: (error, attempt) => {
          logger.warn('Retrying writeColumnValues', 'Sheets', {
            attempt,
            spreadsheetId,
            columnName,
            error: error instanceof Error ? error.message : String(error),
          })
        },
      }
    )

    const duration = Date.now() - startTime
    metrics.incrementCounter('sheets.write_column.success')
    metrics.recordHistogram('sheets.write_column.duration', duration)

    logger.debug('Successfully wrote column values', 'Sheets', {
      spreadsheetId,
      columnName,
      cellsWritten: data.length,
      duration,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('sheets.write_column.error')
    metrics.recordHistogram('sheets.write_column.error_duration', duration)

    logger.error('Failed to write column values', 'Sheets', {
      spreadsheetId: params.spreadsheetId,
      columnName: params.columnName,
      duration,
    }, error)

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(
      `Failed to write column values: ${error.message || String(error)}`,
      ErrorCode.SHEETS_API_ERROR,
      500,
      true,
      { spreadsheetId: params.spreadsheetId, columnName: params.columnName },
      error instanceof Error ? error : undefined
    )
  }
}

export async function writeColumnLetterValues(params: {
  spreadsheetId: string
  sheetGid?: string | number
  columnLetter: string
  rows: Array<{ rowNumber: number; value: string | undefined }>
}) {
  const startTime = Date.now()

  try {
    const { spreadsheetId, sheetGid, columnLetter, rows } = params

    if (!spreadsheetId || !columnLetter || !rows) {
      throw new AppError(
        'Missing required parameters for writeColumnLetterValues',
        ErrorCode.VALIDATION_ERROR,
        400,
        true,
        {
          hasSpreadsheetId: !!spreadsheetId,
          hasColumnLetter: !!columnLetter,
          rowsCount: rows?.length || 0,
        }
      )
    }

    logger.debug('Writing column letter values', 'Sheets', {
      spreadsheetId,
      columnLetter,
      rowCount: rows.length,
    })

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
    
    if (data.length === 0) {
      logger.debug('No data to write', 'Sheets', { spreadsheetId, columnLetter })
      return
    }

    await withRetry(
      async () => {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data,
          },
        })
      },
      {
        maxRetries: 3,
        onRetry: (error, attempt) => {
          logger.warn('Retrying writeColumnLetterValues', 'Sheets', {
            attempt,
            spreadsheetId,
            columnLetter,
            error: error instanceof Error ? error.message : String(error),
          })
        },
      }
    )

    const duration = Date.now() - startTime
    metrics.incrementCounter('sheets.write_column_letter.success')
    metrics.recordHistogram('sheets.write_column_letter.duration', duration)

    logger.debug('Successfully wrote column letter values', 'Sheets', {
      spreadsheetId,
      columnLetter,
      cellsWritten: data.length,
      duration,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('sheets.write_column_letter.error')
    metrics.recordHistogram('sheets.write_column_letter.error_duration', duration)

    logger.error('Failed to write column letter values', 'Sheets', {
      spreadsheetId: params.spreadsheetId,
      columnLetter: params.columnLetter,
      duration,
    }, error)

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(
      `Failed to write column letter values: ${error.message || String(error)}`,
      ErrorCode.SHEETS_API_ERROR,
      500,
      true,
      { spreadsheetId: params.spreadsheetId, columnLetter: params.columnLetter },
      error instanceof Error ? error : undefined
    )
  }
}

async function resolveSheetName(
  sheets: any,
  spreadsheetId: string,
  gid?: string | number
): Promise<string> {
  try {
    if (!gid) return 'Sheet1'
    
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const targetId = Number(gid)
    const found = meta.data.sheets?.find((s: any) => s.properties?.sheetId === targetId)
    return found?.properties?.title || 'Sheet1'
  } catch (error) {
    logger.warn('Failed to resolve sheet name, using default', 'Sheets', {
      spreadsheetId,
      gid,
    }, error)
    return 'Sheet1'
  }
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
