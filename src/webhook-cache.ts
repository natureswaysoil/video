import { getLogger } from './logger'
import { AppError, ErrorCode } from './errors'

const logger = getLogger()

// Simple in-memory cache for webhook deduplication
// For production, consider using Redis or a database
const cache = new Map<string, number>()
const CACHE_TTL_MS = 600000 // 10 minutes

/**
 * Check if a webhook has been processed recently
 * @param webhookId Unique identifier for the webhook (e.g., event ID)
 * @returns true if webhook was already processed, false otherwise
 */
export function isWebhookProcessed(webhookId: string): boolean {
  try {
    if (!webhookId) {
      throw new AppError(
        'Webhook ID is required',
        ErrorCode.VALIDATION_ERROR,
        400,
        true,
        { hasWebhookId: !!webhookId }
      )
    }

    const timestamp = cache.get(webhookId)
    
    if (!timestamp) {
      return false
    }

    // Check if cache entry has expired
    const now = Date.now()
    if (now - timestamp > CACHE_TTL_MS) {
      cache.delete(webhookId)
      logger.debug('Webhook cache entry expired', 'WebhookCache', {
        webhookId,
        age: now - timestamp,
      })
      return false
    }

    logger.debug('Webhook already processed', 'WebhookCache', {
      webhookId,
      age: now - timestamp,
    })
    return true
  } catch (error) {
    logger.error('Error checking webhook cache', 'WebhookCache', { webhookId }, error)
    // Return false on error to allow processing
    return false
  }
}

/**
 * Mark a webhook as processed
 * @param webhookId Unique identifier for the webhook
 */
export function markWebhookProcessed(webhookId: string): void {
  try {
    if (!webhookId) {
      throw new AppError(
        'Webhook ID is required',
        ErrorCode.VALIDATION_ERROR,
        400,
        true,
        { hasWebhookId: !!webhookId }
      )
    }

    cache.set(webhookId, Date.now())
    
    logger.debug('Webhook marked as processed', 'WebhookCache', {
      webhookId,
      cacheSize: cache.size,
    })

    // Clean up expired entries periodically
    if (cache.size % 100 === 0) {
      cleanupExpiredEntries()
    }
  } catch (error) {
    logger.error('Error marking webhook as processed', 'WebhookCache', { webhookId }, error)
    // Don't throw - this shouldn't break the application
  }
}

/**
 * Clean up expired cache entries
 */
function cleanupExpiredEntries(): void {
  try {
    const now = Date.now()
    let cleanedCount = 0

    for (const [webhookId, timestamp] of cache.entries()) {
      if (now - timestamp > CACHE_TTL_MS) {
        cache.delete(webhookId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired webhook cache entries', 'WebhookCache', {
        cleanedCount,
        remainingEntries: cache.size,
      })
    }
  } catch (error) {
    logger.error('Error cleaning up webhook cache', 'WebhookCache', {}, error)
  }
}

/**
 * Clear all cache entries
 */
export function clearWebhookCache(): void {
  try {
    const size = cache.size
    cache.clear()
    logger.info('Webhook cache cleared', 'WebhookCache', {
      clearedEntries: size,
    })
  } catch (error) {
    logger.error('Error clearing webhook cache', 'WebhookCache', {}, error)
  }
}

/**
 * Get cache statistics
 */
export function getWebhookCacheStats(): {
  size: number
  entries: Array<{ webhookId: string; age: number }>
} {
  try {
    const now = Date.now()
    const entries = Array.from(cache.entries()).map(([webhookId, timestamp]) => ({
      webhookId,
      age: now - timestamp,
    }))

    return {
      size: cache.size,
      entries: entries.sort((a, b) => b.age - a.age), // Sort by age descending
    }
  } catch (error) {
    logger.error('Error getting webhook cache stats', 'WebhookCache', {}, error)
    return { size: 0, entries: [] }
  }
}

// Periodic cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000)
