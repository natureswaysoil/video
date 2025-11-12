
/**
 * Parallel processing for social media posting
 * Phase 2.1: Implement parallel processing
 */

import { getLogger } from './logger'
import { getMetrics } from './logger'
import { AppError, ErrorCode } from './errors'

const logger = getLogger()
const metrics = getMetrics()

export interface ProcessingResult<T> {
  platform: string
  success: boolean
  result?: T
  error?: Error
  duration: number
}

/**
 * Process tasks in parallel with concurrency control
 */
export async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    concurrency?: number
    continueOnError?: boolean
    timeout?: number
  } = {}
): Promise<ProcessingResult<R>[]> {
  const {
    concurrency = 5,
    continueOnError = true,
    timeout,
  } = options

  const results: ProcessingResult<R>[] = []
  const queue = [...items]
  let activeCount = 0

  return new Promise((resolve, reject) => {
    const processNext = () => {
      if (queue.length === 0 && activeCount === 0) {
        resolve(results)
        return
      }

      while (activeCount < concurrency && queue.length > 0) {
        const item = queue.shift()!
        activeCount++

        const startTime = Date.now()
        const processPromise = timeout
          ? Promise.race([
              processor(item),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeout)
              ),
            ])
          : processor(item)

        processPromise
          .then((result) => {
            const duration = Date.now() - startTime
            results.push({
              platform: (item as any).platform || 'unknown',
              success: true,
              result,
              duration,
            })
            metrics.incrementCounter('parallel_processor.success')
            metrics.recordHistogram('parallel_processor.duration', duration)
          })
          .catch((error) => {
            const duration = Date.now() - startTime
            results.push({
              platform: (item as any).platform || 'unknown',
              success: false,
              error,
              duration,
            })
            metrics.incrementCounter('parallel_processor.error')

            if (!continueOnError) {
              reject(error)
              return
            }
          })
          .finally(() => {
            activeCount--
            processNext()
          })
      }
    }

    processNext()
  })
}

/**
 * Post to multiple social media platforms in parallel
 */
export async function postToSocialMediaInParallel(
  videoUrl: string,
  caption: string,
  platforms: Array<{
    name: string
    poster: () => Promise<any>
  }>,
  options: {
    concurrency?: number
    continueOnError?: boolean
    timeout?: number
  } = {}
): Promise<ProcessingResult<any>[]> {
  logger.info('Posting to social media in parallel', 'ParallelProcessor', {
    platforms: platforms.map(p => p.name),
    concurrency: options.concurrency,
  })

  const results = await processInParallel(
    platforms,
    async (platform) => {
      logger.debug(`Posting to ${platform.name}`, 'ParallelProcessor')
      const result = await platform.poster()
      logger.info(`Successfully posted to ${platform.name}`, 'ParallelProcessor')
      return result
    },
    {
      concurrency: options.concurrency || 5,
      continueOnError: options.continueOnError !== false,
      timeout: options.timeout || 60000, // 60 seconds default
    }
  )

  // Log summary
  const successCount = results.filter(r => r.success).length
  const failureCount = results.filter(r => !r.success).length

  logger.info('Social media posting completed', 'ParallelProcessor', {
    total: results.length,
    success: successCount,
    failures: failureCount,
    avgDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
  })

  return results
}

/**
 * Process products in parallel with rate limiting
 */
export async function processProductsInParallel<T>(
  products: T[],
  processor: (product: T) => Promise<any>,
  options: {
    concurrency?: number
    continueOnError?: boolean
    onProgress?: (completed: number, total: number) => void
  } = {}
): Promise<ProcessingResult<any>[]> {
  const {
    concurrency = 3,
    continueOnError = true,
    onProgress,
  } = options

  logger.info('Processing products in parallel', 'ParallelProcessor', {
    total: products.length,
    concurrency,
  })

  let completed = 0

  const results = await processInParallel(
    products,
    async (product) => {
      const result = await processor(product)
      completed++
      
      if (onProgress) {
        onProgress(completed, products.length)
      }

      logger.info('Product processed', 'ParallelProcessor', {
        completed,
        total: products.length,
        progress: `${Math.round((completed / products.length) * 100)}%`,
      })

      return result
    },
    {
      concurrency,
      continueOnError,
    }
  )

  return results
}
