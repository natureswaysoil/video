"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWebhookProcessed = isWebhookProcessed;
exports.markWebhookProcessed = markWebhookProcessed;
exports.clearWebhookCache = clearWebhookCache;
exports.getWebhookCacheStats = getWebhookCacheStats;
exports.addContext = addContext;
exports.setRenderJobId = setRenderJobId;
exports.resolveByJobId = resolveByJobId;
exports.markProcessed = markProcessed;
exports.isProcessed = isProcessed;
const logger_1 = require("./logger");
const errors_1 = require("./errors");
const logger = (0, logger_1.getLogger)();
// Simple in-memory cache for webhook deduplication
// For production, consider using Redis or a database
const cache = new Map();
const CACHE_TTL_MS = 600000; // 10 minutes
/**
 * Check if a webhook has been processed recently
 * @param webhookId Unique identifier for the webhook (e.g., event ID)
 * @returns true if webhook was already processed, false otherwise
 */
function isWebhookProcessed(webhookId) {
    try {
        if (!webhookId) {
            throw new errors_1.AppError('Webhook ID is required', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasWebhookId: !!webhookId });
        }
        const timestamp = cache.get(webhookId);
        if (!timestamp) {
            return false;
        }
        // Check if cache entry has expired
        const now = Date.now();
        if (now - timestamp > CACHE_TTL_MS) {
            cache.delete(webhookId);
            logger.debug('Webhook cache entry expired', 'WebhookCache', {
                webhookId,
                age: now - timestamp,
            });
            return false;
        }
        logger.debug('Webhook already processed', 'WebhookCache', {
            webhookId,
            age: now - timestamp,
        });
        return true;
    }
    catch (error) {
        logger.error('Error checking webhook cache', 'WebhookCache', { webhookId }, error);
        // Return false on error to allow processing
        return false;
    }
}
/**
 * Mark a webhook as processed
 * @param webhookId Unique identifier for the webhook
 */
function markWebhookProcessed(webhookId) {
    try {
        if (!webhookId) {
            throw new errors_1.AppError('Webhook ID is required', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasWebhookId: !!webhookId });
        }
        cache.set(webhookId, Date.now());
        logger.debug('Webhook marked as processed', 'WebhookCache', {
            webhookId,
            cacheSize: cache.size,
        });
        // Clean up expired entries periodically
        if (cache.size % 100 === 0) {
            cleanupExpiredEntries();
        }
    }
    catch (error) {
        logger.error('Error marking webhook as processed', 'WebhookCache', { webhookId }, error);
        // Don't throw - this shouldn't break the application
    }
}
/**
 * Clean up expired cache entries
 */
function cleanupExpiredEntries() {
    try {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [webhookId, timestamp] of cache.entries()) {
            if (now - timestamp > CACHE_TTL_MS) {
                cache.delete(webhookId);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            logger.debug('Cleaned up expired webhook cache entries', 'WebhookCache', {
                cleanedCount,
                remainingEntries: cache.size,
            });
        }
    }
    catch (error) {
        logger.error('Error cleaning up webhook cache', 'WebhookCache', {}, error);
    }
}
/**
 * Clear all cache entries
 */
function clearWebhookCache() {
    try {
        const size = cache.size;
        cache.clear();
        logger.info('Webhook cache cleared', 'WebhookCache', {
            clearedEntries: size,
        });
    }
    catch (error) {
        logger.error('Error clearing webhook cache', 'WebhookCache', {}, error);
    }
}
/**
 * Get cache statistics
 */
function getWebhookCacheStats() {
    try {
        const now = Date.now();
        const entries = Array.from(cache.entries()).map(([webhookId, timestamp]) => ({
            webhookId,
            age: now - timestamp,
        }));
        return {
            size: cache.size,
            entries: entries.sort((a, b) => b.age - a.age), // Sort by age descending
        };
    }
    catch (error) {
        logger.error('Error getting webhook cache stats', 'WebhookCache', {}, error);
        return { size: 0, entries: [] };
    }
}
// Periodic cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
const jobContextById = new Map();
/**
 * Add a job context for tracking
 */
function addContext(storyboardJobId, ctx) {
    try {
        jobContextById.set(storyboardJobId, { ...ctx, storyboardJobId });
        logger.debug('Job context added', 'WebhookCache', {
            storyboardJobId,
            contextSize: jobContextById.size,
        });
    }
    catch (error) {
        logger.error('Error adding job context', 'WebhookCache', { storyboardJobId }, error);
    }
}
/**
 * Set the render job ID for a storyboard job
 */
function setRenderJobId(storyboardJobId, renderJobId) {
    try {
        const ctx = jobContextById.get(storyboardJobId);
        if (ctx) {
            ctx.renderJobId = renderJobId;
            jobContextById.set(storyboardJobId, ctx);
            jobContextById.set(renderJobId, ctx);
            logger.debug('Render job ID set', 'WebhookCache', {
                storyboardJobId,
                renderJobId,
            });
        }
    }
    catch (error) {
        logger.error('Error setting render job ID', 'WebhookCache', { storyboardJobId, renderJobId }, error);
    }
}
/**
 * Resolve a job context by job ID
 */
function resolveByJobId(jobId) {
    try {
        return jobContextById.get(jobId);
    }
    catch (error) {
        logger.error('Error resolving job context', 'WebhookCache', { jobId }, error);
        return undefined;
    }
}
/**
 * Mark a job as processed
 */
function markProcessed(jobId) {
    try {
        const ctx = jobContextById.get(jobId);
        if (ctx) {
            ctx.processed = true;
            logger.debug('Job marked as processed', 'WebhookCache', { jobId });
        }
    }
    catch (error) {
        logger.error('Error marking job as processed', 'WebhookCache', { jobId }, error);
    }
}
/**
 * Check if a job has been processed
 */
function isProcessed(jobId) {
    try {
        const ctx = jobContextById.get(jobId);
        return Boolean(ctx?.processed);
    }
    catch (error) {
        logger.error('Error checking if job is processed', 'WebhookCache', { jobId }, error);
        return false;
    }
}
