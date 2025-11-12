
/**
 * Structured logging and metrics collection
 * Phase 2.5: Add structured logging and metrics
 */

import { sanitizeObject, sanitizeError } from './error-sanitizer'

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: string
  metadata?: Record<string, any>
  error?: any
}

class Logger {
  private minLevel: LogLevel

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel]
  }

  private formatLog(entry: LogEntry): string {
    const base = {
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      ...(entry.context && { context: entry.context }),
      ...(entry.metadata && { metadata: sanitizeObject(entry.metadata) }),
      ...(entry.error && { error: sanitizeError(entry.error) }),
    }

    return JSON.stringify(base)
  }

  private log(level: LogLevel, message: string, context?: string, metadata?: Record<string, any>, error?: any): void {
    if (!this.shouldLog(level)) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      metadata,
      error,
    }

    const formatted = this.formatLog(entry)

    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formatted)
        break
      case LogLevel.WARN:
        console.warn(formatted)
        break
      case LogLevel.ERROR:
        console.error(formatted)
        break
    }
  }

  debug(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context, metadata)
  }

  info(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context, metadata)
  }

  warn(message: string, context?: string, metadata?: Record<string, any>, error?: any): void {
    this.log(LogLevel.WARN, message, context, metadata, error)
  }

  error(message: string, context?: string, metadata?: Record<string, any>, error?: any): void {
    this.log(LogLevel.ERROR, message, context, metadata, error)
  }
}

// Global logger instance
let globalLogger: Logger | null = null

/**
 * Get or create the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    const logLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || LogLevel.INFO
    globalLogger = new Logger(logLevel)
  }
  return globalLogger
}

/**
 * Metrics collector for monitoring
 */
class MetricsCollector {
  private metrics: Map<string, number>
  private counters: Map<string, number>
  private histograms: Map<string, number[]>

  constructor() {
    this.metrics = new Map()
    this.counters = new Map()
    this.histograms = new Map()
  }

  /**
   * Set a gauge metric
   */
  setGauge(name: string, value: number): void {
    this.metrics.set(name, value)
  }

  /**
   * Get a gauge metric
   */
  getGauge(name: string): number | undefined {
    return this.metrics.get(name)
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0
    this.counters.set(name, current + value)
  }

  /**
   * Get a counter value
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0
  }

  /**
   * Record a histogram value
   */
  recordHistogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, [])
    }
    this.histograms.get(name)!.push(value)
  }

  /**
   * Get histogram statistics
   */
  getHistogramStats(name: string): {
    count: number
    min: number
    max: number
    avg: number
    p50: number
    p95: number
    p99: number
  } | undefined {
    const values = this.histograms.get(name)
    if (!values || values.length === 0) {
      return undefined
    }

    const sorted = [...values].sort((a, b) => a - b)
    const count = sorted.length
    const sum = sorted.reduce((a, b) => a + b, 0)

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sum / count,
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    }
  }

  /**
   * Time an async operation and record the duration
   */
  async time<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now()
    try {
      const result = await operation()
      const duration = Date.now() - start
      this.recordHistogram(name, duration)
      return result
    } catch (error) {
      const duration = Date.now() - start
      this.recordHistogram(`${name}.error`, duration)
      throw error
    }
  }

  /**
   * Get all metrics as a summary
   */
  getSummary(): {
    gauges: Record<string, number>
    counters: Record<string, number>
    histograms: Record<string, ReturnType<MetricsCollector['getHistogramStats']>>
  } {
    const gauges: Record<string, number> = {}
    for (const [key, value] of this.metrics.entries()) {
      gauges[key] = value
    }

    const counters: Record<string, number> = {}
    for (const [key, value] of this.counters.entries()) {
      counters[key] = value
    }

    const histograms: Record<string, any> = {}
    for (const key of this.histograms.keys()) {
      histograms[key] = this.getHistogramStats(key)
    }

    return { gauges, counters, histograms }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear()
    this.counters.clear()
    this.histograms.clear()
  }
}

// Global metrics collector instance
let globalMetrics: MetricsCollector | null = null

/**
 * Get or create the global metrics collector instance
 */
export function getMetrics(): MetricsCollector {
  if (!globalMetrics) {
    globalMetrics = new MetricsCollector()
  }
  return globalMetrics
}
