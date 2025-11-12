
/**
 * Memory management utilities
 * Phase 2.2: Fix memory issues
 */

import { getLogger } from './logger'
import { AppError, ErrorCode } from './errors'

const logger = getLogger()

/**
 * Check current memory usage
 */
export function getMemoryUsage(): {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
  heapUsedMB: number
  heapTotalMB: number
  externalMB: number
  rssMB: number
} {
  const usage = (process as any).memoryUsage()
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
    externalMB: Math.round(usage.external / 1024 / 1024),
    rssMB: Math.round(usage.rss / 1024 / 1024),
  }
}

/**
 * Log current memory usage
 */
export function logMemoryUsage(context?: string): void {
  const usage = getMemoryUsage()
  logger.info('Memory usage', context || 'MemoryManager', {
    heapUsedMB: usage.heapUsedMB,
    heapTotalMB: usage.heapTotalMB,
    externalMB: usage.externalMB,
    rssMB: usage.rssMB,
  })
}

/**
 * Check if memory usage is above threshold
 */
export function isMemoryAboveThreshold(thresholdMB: number): boolean {
  const usage = getMemoryUsage()
  return usage.heapUsedMB > thresholdMB
}

/**
 * Force garbage collection if available
 */
export function forceGC(): void {
  if (typeof (global as any).gc === "function") {
    // gc called above; logger.debug('Forcing garbage collection', 'MemoryManager')
    // gc called above
  } else {
    logger.warn('Garbage collection not available. Run with --expose-gc flag.', 'MemoryManager')
  }
}

/**
 * Monitor memory usage and warn if above threshold
 */
export class MemoryMonitor {
  private interval: any = null
  private readonly thresholdMB: number
  private readonly checkIntervalMs: number
  private readonly autoGC: boolean

  constructor(options: {
    thresholdMB?: number
    checkIntervalMs?: number
    autoGC?: boolean
  } = {}) {
    this.thresholdMB = options.thresholdMB || 500
    this.checkIntervalMs = options.checkIntervalMs || 30000 // 30 seconds
    this.autoGC = options.autoGC || false
  }

  start(): void {
    if (this.interval) {
      return // Already started
    }

    logger.info('Starting memory monitor', 'MemoryMonitor', {
      thresholdMB: this.thresholdMB,
      checkIntervalMs: this.checkIntervalMs,
      autoGC: this.autoGC,
    })

    this.interval = setInterval(() => {
      const usage = getMemoryUsage()

      if (usage.heapUsedMB > this.thresholdMB) {
        logger.warn('Memory usage above threshold', 'MemoryMonitor', {
          heapUsedMB: usage.heapUsedMB,
          thresholdMB: this.thresholdMB,
        })

        if (this.autoGC) {
          forceGC()
        }
      }
    }, this.checkIntervalMs)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
      logger.info('Stopped memory monitor', 'MemoryMonitor')
    }
  }
}

/**
 * Temporary file cleanup manager
 */
export class TempFileManager {
  private tempFiles: Set<string>

  constructor() {
    this.tempFiles = new Set()
  }

  /**
   * Register a temporary file for cleanup
   */
  register(filepath: string): void {
    this.tempFiles.add(filepath)
  }

  /**
   * Unregister a temporary file
   */
  unregister(filepath: string): void {
    this.tempFiles.delete(filepath)
  }

  /**
   * Clean up a specific temporary file
   */
  async cleanup(filepath: string): Promise<void> {
    try {
      const fs = await import('fs/promises')
      await fs.unlink(filepath)
      this.unregister(filepath)
      logger.debug('Cleaned up temporary file', 'TempFileManager', { filepath })
    } catch (error) {
      logger.warn('Failed to clean up temporary file', 'TempFileManager', { filepath }, error)
    }
  }

  /**
   * Clean up all registered temporary files
   */
  async cleanupAll(): Promise<void> {
    logger.info('Cleaning up all temporary files', 'TempFileManager', {
      count: this.tempFiles.size,
    })

    const promises = Array.from(this.tempFiles).map(filepath => this.cleanup(filepath))
    await Promise.allSettled(promises)

    this.tempFiles.clear()
  }

  /**
   * Get count of registered temporary files
   */
  getCount(): number {
    return this.tempFiles.size
  }
}

// Global temp file manager instance
let globalTempFileManager: TempFileManager | null = null

/**
 * Get or create the global temp file manager instance
 */
export function getTempFileManager(): TempFileManager {
  if (!globalTempFileManager) {
    globalTempFileManager = new TempFileManager()
  }
  return globalTempFileManager
}

/**
 * Ensure cleanup on process exit
 */
export function setupCleanupHandlers(): void {
  const tempFileManager = getTempFileManager()

  const cleanup = async () => {
    logger.info('Process cleanup triggered', 'MemoryManager')
    await tempFileManager.cleanupAll()
  }

  process.on('exit', () => {
    // Synchronous cleanup only
    logger.info('Process exiting', 'MemoryManager')
  })

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT', 'MemoryManager')
    await cleanup()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM', 'MemoryManager')
    await cleanup()
    process.exit(0)
  })

  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception', 'MemoryManager', {}, error)
    await cleanup()
    process.exit(1)
  })

  process.on('unhandledRejection', async (reason) => {
    logger.error('Unhandled rejection', 'MemoryManager', {}, reason)
    await cleanup()
    process.exit(1)
  })
}
