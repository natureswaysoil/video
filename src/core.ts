import axios from 'axios'
import { AppError, ErrorCode, fromAxiosError, withRetry } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { getUrlCache } from './url-cache'
import { getConfig } from './config-validator'
import { parseCsv } from './csv-parser'

const logger = getLogger()
const metrics = getMetrics()
const urlCache = getUrlCache()

export type Product = {
  id?: string
  name?: string
  title?: string
  details?: string
  description?: string
  caption?: string
  Caption?: string
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
    let config = getConfig()

    if (!config.__validated) {
      logger.info('Defensive config validation before processing CSV', 'Core')
      try {
        const { validateConfig } = await import('./config-validator')
        config = await validateConfig()
      } catch (err: any) {
        throw new AppError(
          `Config validation failed during CSV processing: ${err.message || err}`,
          ErrorCode.VALIDATION_ERROR,
          500,
          true,
          { csvUrl },
          err instanceof Error ? err : undefined
        )
      }
    }

    if (!csvUrl) {
      throw new AppError('CSV URL is required', ErrorCode.VALIDATION_ERROR, 400, true, { hasCsvUrl: !!csvUrl })
    }

    logger.info('Processing CSV from URL', 'Core', { csvUrl })

    const cacheKey = `csv:${csvUrl}`
    const cached = urlCache.get<string>(cacheKey)

    let data: string
    if (cached) {
      logger.debug('Using cached CSV data', 'Core', { csvUrl })
      data = cached
    } else {
      logger.debug('Fetching CSV from URL', 'Core', { csvUrl })
      const response = await withRetry(
        async () => axios.get<string>(csvUrl, { responseType: 'text', timeout: 30000 }),
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
      urlCache.set(cacheKey, data, 300)
    }

    const parsedRows = parseCsv(data)
    if (parsedRows.length < 2) {
      logger.warn('CSV has no data rows', 'Core', { csvUrl, rowCount: parsedRows.length })
      return { skipped: true, rows: [] }
    }

    const headers = parsedRows[0].map((h) => h.trim())
    if (headers.length === 0 || !headers.some(Boolean)) {
      throw new AppError('CSV has no headers', ErrorCode.CSV_PARSING_ERROR, 400, true, { csvUrl })
    }

    logger.info('CSV headers parsed', 'Core', {
      csvUrl,
      headerCount: headers.length,
      totalDataRows: parsedRows.length - 1,
      headers: headers.slice(0, 15),
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

    const MAX_SAMPLE_ROWS = 3
    const SAMPLE_COLUMN_COUNT = 5
    const SAMPLE_COLUMN_CHARS = 50

    const skipReasons = {
      noJobId: 0,
      alreadyPosted: 0,
      notReady: 0,
    }
    const skippedRowSamples: Array<{
      rowNumber: number
      reason: string
      sample: Record<string, string>
    }> = []

    for (const [i, cols] of parsedRows.slice(1).entries()) {
      if (!cols.some((value) => String(value || '').trim() !== '')) continue

      const rec: Record<string, string> = {}
      headers.forEach((h, index) => {
        rec[h] = (cols[index] ?? '').trim()
      })

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
        if (skippedRowSamples.length < MAX_SAMPLE_ROWS) {
          const sampleData = Object.keys(rec).slice(0, SAMPLE_COLUMN_COUNT).reduce((obj, key) => {
            const val = rec[key]
            obj[key] = (val && typeof val === 'string') ? val.substring(0, SAMPLE_COLUMN_CHARS) : String(val ?? '')
            return obj
          }, {} as Record<string, string>)
          skippedRowSamples.push({ rowNumber: i + 2, reason: 'No jobId/ASIN/SKU found', sample: sampleData })
        }
        logger.debug('Skipping row without jobId - no product identifier found', 'Core', {
          rowNumber: i + 2,
          csvUrl,
          availableColumns: Object.keys(rec).slice(0, 10),
        })
        continue
      }

      const title =
        pickFirst(rec, envKeys('CSV_COL_TITLE')) ||
        pickFirst(rec, ['title', 'name', 'product', 'Product', 'Title'])

      const details =
        pickFirst(rec, envKeys('CSV_COL_DETAILS')) ||
        pickFirst(rec, ['details', 'description', 'caption', 'Description', 'Details', 'Caption'])

      const product: Product = {
        id: pickFirst(rec, envKeys('CSV_COL_ID')) || pickFirst(rec, ['id', 'ID']),
        name:
          pickFirst(rec, envKeys('CSV_COL_NAME')) ||
          pickFirst(rec, ['name', 'product', 'Product', 'Title']) ||
          title,
        title: title || pickFirst(rec, ['name']),
        details,
        ...rec,
      }

      const alwaysNew = String(config.ALWAYS_GENERATE_NEW_VIDEO || 'false').toLowerCase() === 'true'
      const posted = pickFirst(rec, envKeys('CSV_COL_POSTED')) || pickFirst(rec, ['Posted', 'posted'])

      if (!alwaysNew && posted && isTruthy(posted, process.env.CSV_STATUS_TRUE_VALUES)) {
        skipReasons.alreadyPosted++
        skippedCount++
        if (skippedRowSamples.length < MAX_SAMPLE_ROWS) {
          skippedRowSamples.push({
            rowNumber: i + 2,
            reason: `Already posted (Posted='${posted}')`,
            sample: { jobId: String(jobId), posted: String(posted) },
          })
        }
        logger.debug('Skipping already posted row', 'Core', {
          rowNumber: i + 2,
          jobId,
          posted,
          csvUrl,
          hint: 'Set ALWAYS_GENERATE_NEW_VIDEO=true to reprocess posted items',
        })
        continue
      }

      const ready =
        pickFirst(rec, envKeys('CSV_COL_READY')) ||
        pickFirst(rec, ['Ready', 'ready', 'Status', 'status', 'Enabled', 'enabled', 'Post', 'post'])

      if (ready && isFalsy(ready)) {
        skipReasons.notReady++
        skippedCount++
        if (skippedRowSamples.length < MAX_SAMPLE_ROWS) {
          skippedRowSamples.push({
            rowNumber: i + 2,
            reason: `Not ready (Ready/Status='${ready}')`,
            sample: { jobId: String(jobId), ready: String(ready) },
          })
        }
        logger.debug('Skipping row that is explicitly not ready', 'Core', { rowNumber: i + 2, jobId, ready, csvUrl })
        continue
      }

      rows.push({ product, jobId, rowNumber: i + 2, headers, record: rec })
      processedCount++
    }

    const duration = Date.now() - startTime
    metrics.incrementCounter('core.process_csv.success')
    metrics.recordHistogram('core.process_csv.duration', duration)

    if (rows.length === 0) {
      logger.warn('No valid products found in CSV after filtering', 'Core', {
        csvUrl,
        totalRows: parsedRows.length,
        totalDataRows: parsedRows.length - 1,
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
      })
    } else {
      logger.info('CSV processed successfully', 'Core', {
        csvUrl,
        totalRows: parsedRows.length,
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

    if (error instanceof AppError) throw error
    if (axios.isAxiosError(error)) throw fromAxiosError(error, ErrorCode.CSV_PARSING_ERROR, { csvUrl })

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
  const list = custom ? custom.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : defaults
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
