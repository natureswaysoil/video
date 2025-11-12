import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { AppError, ErrorCode } from './errors'
import { getLogger } from './logger'
import { sanitizeObject } from './error-sanitizer'

const logger = getLogger()
const appendFile = promisify(fs.appendFile)
const readFile = promisify(fs.readFile)
const mkdir = promisify(fs.mkdir)

export interface AuditEvent {
  timestamp: string
  type: string
  data: Record<string, any>
  success?: boolean
  error?: string
}

export class AuditLogger {
  private logFile: string
  private eventsBuffer: AuditEvent[]
  private bufferSize: number
  private flushInterval: number
  private flushTimer: any

  constructor(options: {
    logFile?: string
    bufferSize?: number
    flushInterval?: number
  } = {}) {
    this.logFile = options.logFile || process.env.AUDIT_LOG_FILE || '/tmp/audit.log'
    this.bufferSize = options.bufferSize || 100
    this.flushInterval = options.flushInterval || 30000 // 30 seconds
    this.eventsBuffer = []
    this.flushTimer = null

    // Start auto-flush timer
    this.startAutoFlush()
  }

  private startAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    this.flushTimer = setInterval(async () => {
      try {
        await this.flush()
      } catch (error) {
        logger.error('Failed to auto-flush audit log', 'AuditLogger', {}, error)
      }
    }, this.flushInterval)
  }

  async log(type: string, data: Record<string, any>, options?: { success?: boolean; error?: string }): Promise<void> {
    try {
      const event: AuditEvent = {
        timestamp: new Date().toISOString(),
        type,
        data: sanitizeObject(data),
        success: options?.success,
        error: options?.error,
      }

      this.eventsBuffer.push(event)

      if (this.eventsBuffer.length >= this.bufferSize) {
        await this.flush()
      }
    } catch (error) {
      logger.error('Failed to log audit event', 'AuditLogger', { type }, error)
    }
  }

  async flush(): Promise<void> {
    if (this.eventsBuffer.length === 0) {
      return
    }

    try {
      const events = [...this.eventsBuffer]
      this.eventsBuffer = []

      const dir = path.dirname(this.logFile)
      await mkdir(dir, { recursive: true })

      const lines = events.map(event => JSON.stringify(event)).join('\n') + '\n'
      await appendFile(this.logFile, lines, 'utf8')

      logger.debug('Flushed audit events', 'AuditLogger', {
        eventCount: events.length,
        logFile: this.logFile,
      })
    } catch (error: any) {
      logger.error('Failed to flush audit log', 'AuditLogger', {
        logFile: this.logFile,
        bufferSize: this.eventsBuffer.length,
      }, error)

      throw new AppError(
        `Failed to flush audit log: ${error.message || String(error)}`,
        ErrorCode.FILE_OPERATION_ERROR,
        500,
        true,
        { logFile: this.logFile },
        error instanceof Error ? error : undefined
      )
    }
  }

  async close(): Promise<void> {
    try {
      if (this.flushTimer) {
        clearInterval(this.flushTimer)
        this.flushTimer = null
      }

      await this.flush()

      logger.debug('Audit logger closed', 'AuditLogger', {
        logFile: this.logFile,
      })
    } catch (error) {
      logger.error('Failed to close audit logger', 'AuditLogger', {}, error)
    }
  }

  async getEvents(options?: {
    startTime?: string
    endTime?: string
    type?: string
    limit?: number
  }): Promise<AuditEvent[]> {
    try {
      const content = await readFile(this.logFile, 'utf8')
      const lines = content.split('\n').filter(Boolean)

      let events: AuditEvent[] = lines.map((line: string) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      }).filter(Boolean) as AuditEvent[]

      if (options?.startTime) {
        events = events.filter(e => e.timestamp >= options.startTime!)
      }

      if (options?.endTime) {
        events = events.filter(e => e.timestamp <= options.endTime!)
      }

      if (options?.type) {
        events = events.filter(e => e.type === options.type)
      }

      if (options?.limit && options.limit > 0) {
        events = events.slice(-options.limit)
      }

      return events
    } catch (error: any) {
      logger.error('Failed to get audit events', 'AuditLogger', {
        logFile: this.logFile,
      }, error)

      if (error.code === 'ENOENT') {
        return []
      }

      throw new AppError(
        `Failed to read audit log: ${error.message || String(error)}`,
        ErrorCode.FILE_OPERATION_ERROR,
        500,
        true,
        { logFile: this.logFile },
        error instanceof Error ? error : undefined
      )
    }
  }
}

let globalAuditLogger: AuditLogger | null = null

export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger()
  }
  return globalAuditLogger
}
