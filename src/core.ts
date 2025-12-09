import axios from 'axios'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getUrlCache } from './url-cache'
import { getConfig } from './config-validator'

const logger = getLogger()
const metrics = getMetrics()
const urlCache = getUrlCache()

export type Product = {
  id?: string
  name?: string
  title?: string
  details?: string
  [k: string]: any
}

export async function processCsvUrl(csvUrl: string): Promise<{
  skipped: boolean
  rows: Array<{
    product: Product
    jobId: string
    rowNumber: number
    headers: string[]
    record: Record<string, string>
  }>
}> {
  const startTime = Date.now()

  try {
    // Defensive config validation: ensure config is validated before processing
    // Note: getConfig() always sets __validated: true, so this check typically won't trigger.
    // It serves as a safety net for future changes or unexpected scenarios.
    let config = getConfig()
    
    if (!config.__validated) {
      logger.info('Defensive config validation before processing CSV', 'Core')
      try {
        const { validateConfig } = await import('./config-validator')
        config = await validateConfig()
      } catch (err: any) {
        const error = new AppError(
          `Config validation failed during CSV processing: ${err.message || err}`,
          ErrorCode.VALIDATION_ERROR,
          500,
          true,
          { csvUrl },
          err instanceof Error ? err : undefined
        )
        throw error
      }
    }

    if (!csvUrl) {
      throw new AppError(
        'CSV URL is required',
        ErrorCode.VALIDATION_ERROR,
        400,
        true,
        { hasCsvUrl: !!csvUrl }
      )
    }

    logger.info('Processing CSV from URL', 'Core', { csvUrl })

    // Try to get from cache first
    const cacheKey = `csv:${csvUrl}`
    const cached = urlCache.get<string>(cacheKey)
    
    let data: string
    if (cached) {
      logger.debug('Using cached CSV data', 'Core', { csvUrl })
      data = cached
    } else {
      logger.debug('Fetching CSV from URL', 'Core', { csvUrl })
      
      // Fetch CSV and parse all rows
      const response = await withRetry(
        async () => {
          return axios.get<string>(csvUrl, {
            responseType: 'text',
            timeout: 30000,
          })
        },
        {
          maxRetries: 3,
          onRetry: (error, attempt) => {
            logger.warn('Retrying CSV fetch', 'Core', {
              attempt,
              csvUrl,
              error: error instanceof Error ? error.message : String(error),
            })
          },
        }
      )
      
      data = response.data
      
      // Cache for 5 minutes
      urlCache.set(cacheKey, data, 300)
    }

    const lines: string[] = data.split(/\r?\n/)
    if (lines.length < 2) {
      logger.warn('CSV has no data rows', 'Core', { csvUrl, lineCount: lines.length })
      return { skipped: true, rows: [] }
    }

    const headers: string[] = splitCsvLine(lines[0]).map((h: string) => h.trim())
    
    if (headers.length === 0) {
      throw new AppError(
        'CSV has no headers',
        ErrorCode.CSV_PARSING_ERROR,
        400,
        true,
        { csvUrl }
      )
    }

    logger.info('CSV headers parsed', 'Core', {
      csvUrl,
      headerCount: headers.length,
      totalDataRows: lines.length - 1,
      headers: headers.slice(0, 15), // Log first 15 headers
    })

    const rows: Array<{
      product: Product
      jobId: string
      rowNumber: number
      headers: string[]
      record: Record<string, string>
    }> = []

    let skippedCount = 0
    let processedCount = 0
    
    // Track skip reasons for better diagnostics
    const MAX_SAMPLE_ROWS = 3
    const SAMPLE_COLUMN_COUNT = 5
    const SAMPLE_COLUMN_CHARS = 50
    
    const skipReasons = {
      noJobId: 0,
      alreadyPosted: 0,
      notReady: 0
    }
    const skippedRowSamples: Array<{
      rowNumber: number
      reason: string
      sample: Record<string, string>
    }> = []

    for (const [i, raw] of lines.slice(1).entries()) {
      if (!raw.trim()) continue

      const cols = splitCsvLine(raw)
      if (!cols.some(Boolean)) continue

      const rec: Record<string, string> = {}
      headers.forEach((h: string, i: number) => {
        rec[h] = (cols[i] ?? '').trim()
      })

      // Flexible header mapping with env overrides
      const jobId =
        pickFirst(rec, envKeys('CSV_COL_JOB_ID')) ||
        pickFirst(rec, [
          'jobId',
          'job_id',
          'wavespeed_job_id',
          'WaveSpeed Job ID',
          'WAVESPEED_JOB_ID',
          'job',
          'ASIN',
          'Parent_ASIN',
          'SKU',
          'Product_ID',
          'product_id',
          'id',
          'ID',
        ])

      if (!jobId) {
        skipReasons.noJobId++
        skippedCount++
        
        // Capture sample for first few skipped rows
        if (skippedRowSamples.length < MAX_SAMPLE_ROWS) {
          const sampleData = Object.keys(rec).slice(0, SAMPLE_COLUMN_COUNT).reduce((obj, key) => {
            const val = rec[key]
            obj[key] = (val && typeof val === 'string') ? val.substring(0, SAMPLE_COLUMN_CHARS) : String(val ?? '')
            return obj
          }, {} as Record<string, string>)
          
          skippedRowSamples.push({
            rowNumber: i + 2,
            reason: 'No jobId/ASIN/SKU found',
            sample: sampleData
          })
        }
        
        logger.debug('Skipping row without jobId - no product identifier found', 'Core', {
          rowNumber: i + 2,
          csvUrl,
          availableColumns: Object.keys(rec).slice(0, 10),
        })
        continue // skip rows missing jobId
      }

      const title =
        pickFirst(rec, envKeys('CSV_COL_TITLE')) ||
        pickFirst(rec, ['title', 'name', 'product', 'Product', 'Title'])
      
      const details =
        pickFirst(rec, envKeys('CSV_COL_DETAILS')) ||
        pickFirst(rec, ['details', 'description', 'caption', 'Description', 'Details', 'Caption'])

      const product: Product = {
        id:
          pickFirst(rec, envKeys('CSV_COL_ID')) || pickFirst(rec, ['id', 'ID']),
        name:
          pickFirst(rec, envKeys('CSV_COL_NAME')) ||
          pickFirst(rec, ['name', 'product', 'Product', 'Title']) ||
          title,
        title: title || pickFirst(rec, ['name']),
        details: details,
        ...rec,
      }

      // Optional gating: skip if already posted; require ready/enabled if present
      const alwaysNew = String(config.ALWAYS_GENERATE_NEW_VIDEO || 'false').toLowerCase() === 'true'
      
      const posted =
        pickFirst(rec, envKeys('CSV_COL_POSTED')) ||
        pickFirst(rec, ['Posted', 'posted'])
      
      if (!alwaysNew && posted && isTruthy(posted, process.env.CSV_STATUS_TRUE_VALUES)) {
        skipReasons.alreadyPosted++
        skippedCount++
        
        // Capture sample for first few skipped rows
        if (skippedRowSamples.length < MAX_SAMPLE_ROWS) {
          skippedRowSamples.push({
            rowNumber: i + 2,
            reason: `Already posted (Posted='${posted}')`,
            sample: { jobId: String(jobId), posted: String(posted) }
          })
        }
        
        logger.debug('Skipping already posted row', 'Core', {
          rowNumber: i + 2,
          jobId,
          posted,
          csvUrl,
          hint: 'Set ALWAYS_GENERATE_NEW_VIDEO=true to reprocess posted items'
        })
        continue // don't process already-posted rows unless alwaysNew
      }

      const ready =
        pickFirst(rec, envKeys('CSV_COL_READY')) ||
        pickFirst(rec, ['Ready', 'ready', 'Status', 'status', 'Enabled', 'enabled', 'Post', 'post'])
      
      // Behavior change: Only skip rows explicitly marked as "not ready" (false, no, 0, disabled, etc.)
      // Previous behavior: Skipped all rows where Ready/Status was not explicitly truthy
      // New behavior: Only skip rows with explicit negative values, allowing empty/undefined/non-standard values
      // Rationale: Empty or non-standard Status values (like "Draft", "Pending") should not block processing
      if (ready && isFalsy(ready)) {
        skipReasons.notReady++
        skippedCount++
        
        // Capture sample for first few skipped rows
        if (skippedRowSamples.length < MAX_SAMPLE_ROWS) {
          skippedRowSamples.push({
            rowNumber: i + 2,
            reason: `Not ready (Ready/Status='${ready}')`,
            sample: { jobId: String(jobId), ready: String(ready) }
          })
        }
        
        logger.debug('Skipping row that is explicitly not ready', 'Core', {
          rowNumber: i + 2,
          jobId,
          ready,
          csvUrl,
        })
        continue // skip rows that are explicitly marked as not ready
      }

      rows.push({ product, jobId, rowNumber: i + 2, headers, record: rec })
      processedCount++
    }

    const duration = Date.now() - startTime
    metrics.incrementCounter('core.process_csv.success')
    metrics.recordHistogram('core.process_csv.duration', duration)

    if (rows.length === 0) {
      // Enhanced diagnostics when no products are found
      const diagnostics = {
        csvUrl,
        totalLines: lines.length,
        totalDataRows: lines.length - 1,
        skippedRows: skippedCount,
        processedRows: processedCount,
        duration,
        availableHeaders: headers,
        skipReasons,
        skippedRowSamples,
        envConfig: {
          CSV_COL_JOB_ID: process.env.CSV_COL_JOB_ID || 'not set (using defaults)',
          CSV_COL_POSTED: process.env.CSV_COL_POSTED || 'not set (using defaults)',
          CSV_COL_READY: process.env.CSV_COL_READY || 'not set (using defaults)',
          ALWAYS_GENERATE_NEW_VIDEO: process.env.ALWAYS_GENERATE_NEW_VIDEO || 'false',
        },
        troubleshootingHints: [
          skipReasons.noJobId > 0 ? 'No jobId/ASIN/SKU column found. Check CSV_COL_JOB_ID env var or ensure CSV has a column named: jobId, ASIN, SKU, or Product_ID' : null,
          skipReasons.alreadyPosted > 0 ? `${skipReasons.alreadyPosted} rows already posted. Set ALWAYS_GENERATE_NEW_VIDEO=true to reprocess them` : null,
          skipReasons.notReady > 0 ? `${skipReasons.notReady} rows marked as not ready (disabled/false/no). Update Ready/Status column or set CSV_COL_READY to correct column` : null,
        ].filter(Boolean)
      }
      
      logger.warn('No valid products found in CSV after filtering', 'Core', diagnostics)
    } else {
      logger.info('CSV processed successfully', 'Core', {
        csvUrl,
        totalLines: lines.length,
        processedRows: processedCount,
        skippedRows: skippedCount,
        duration,
      })
    }

    return { skipped: rows.length === 0, rows }
  } catch (error: any) {
    const duration = Date.now() - startTime
    metrics.incrementCounter('core.process_csv.error')
    metrics.recordHistogram('core.process_csv.error_duration', duration)

    logger.error('Failed to process CSV', 'Core', { csvUrl, duration }, error)

    if (error instanceof AppError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      throw fromAxiosError(error, ErrorCode.CSV_PARSING_ERROR, { csvUrl })
    }

    throw new AppError(
      `CSV processing failed: ${error.message || String(error)}`,
      ErrorCode.CSV_PARSING_ERROR,
      500,
      true,
      { csvUrl },
      error instanceof Error ? error : undefined
    )
  }
}

// Minimal CSV splitter handling quotes and commas
function splitCsvLine(line: string): string[] {
  try {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // escaped quote
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
  } catch (error) {
    logger.error('Error splitting CSV line', 'Core', {}, error)
    throw new AppError(
      'CSV line parsing failed',
      ErrorCode.CSV_PARSING_ERROR,
      400,
      true,
      { line: line.substring(0, 100) }
    )
  }
}

function pickFirst(rec: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rec[k]
    if (v && v.length > 0) return v
  }
  return undefined
}

function isTruthy(val: string, custom?: string): boolean {
  const v = val.trim().toLowerCase()
  const defaults = ['1', 'true', 'yes', 'y', 'on', 'post', 'enabled']
  const list = custom
    ? custom.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : defaults
  return list.includes(v)
}

function isFalsy(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return false
  const v = val.trim().toLowerCase()
  const falsyValues = ['0', 'false', 'no', 'n', 'off', 'disabled', 'skip', 'ignore']
  return falsyValues.includes(v)
}

function envKeys(envName: string): string[] {
  const raw = process.env[envName]
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
