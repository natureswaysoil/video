"use strict";
/**
 * Parallel processing for social media posting
 * Phase 2.1: Implement parallel processing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.processInParallel = processInParallel;
exports.postToSocialMediaInParallel = postToSocialMediaInParallel;
exports.processProductsInParallel = processProductsInParallel;
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
/**
 * Process tasks in parallel with concurrency control
 */
async function processInParallel(items, processor, options = {}) {
    const { concurrency = 5, continueOnError = true, timeout, } = options;
    const results = [];
    const queue = [...items];
    let activeCount = 0;
    return new Promise((resolve, reject) => {
        const processNext = () => {
            if (queue.length === 0 && activeCount === 0) {
                resolve(results);
                return;
            }
            while (activeCount < concurrency && queue.length > 0) {
                const item = queue.shift();
                activeCount++;
                const startTime = Date.now();
                const processPromise = timeout
                    ? Promise.race([
                        processor(item),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
                    ])
                    : processor(item);
                processPromise
                    .then((result) => {
                    const duration = Date.now() - startTime;
                    results.push({
                        platform: item.platform || 'unknown',
                        success: true,
                        result,
                        duration,
                    });
                    metrics.incrementCounter('parallel_processor.success');
                    metrics.recordHistogram('parallel_processor.duration', duration);
                })
                    .catch((error) => {
                    const duration = Date.now() - startTime;
                    results.push({
                        platform: item.platform || 'unknown',
                        success: false,
                        error,
                        duration,
                    });
                    metrics.incrementCounter('parallel_processor.error');
                    if (!continueOnError) {
                        reject(error);
                        return;
                    }
                })
                    .finally(() => {
                    activeCount--;
                    processNext();
                });
            }
        };
        processNext();
    });
}
/**
 * Post to multiple social media platforms in parallel
 */
async function postToSocialMediaInParallel(videoUrl, caption, platforms, options = {}) {
    logger.info('Posting to social media in parallel', 'ParallelProcessor', {
        platforms: platforms.map(p => p.name),
        concurrency: options.concurrency,
    });
    const results = await processInParallel(platforms, async (platform) => {
        logger.debug(`Posting to ${platform.name}`, 'ParallelProcessor');
        const result = await platform.poster();
        logger.info(`Successfully posted to ${platform.name}`, 'ParallelProcessor');
        return result;
    }, {
        concurrency: options.concurrency || 5,
        continueOnError: options.continueOnError !== false,
        timeout: options.timeout || 60000, // 60 seconds default
    });
    // Log summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    logger.info('Social media posting completed', 'ParallelProcessor', {
        total: results.length,
        success: successCount,
        failures: failureCount,
        avgDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
    });
    return results;
}
/**
 * Process products in parallel with rate limiting
 */
async function processProductsInParallel(products, processor, options = {}) {
    const { concurrency = 3, continueOnError = true, onProgress, } = options;
    logger.info('Processing products in parallel', 'ParallelProcessor', {
        total: products.length,
        concurrency,
    });
    let completed = 0;
    const results = await processInParallel(products, async (product) => {
        const result = await processor(product);
        completed++;
        if (onProgress) {
            onProgress(completed, products.length);
        }
        logger.info('Product processed', 'ParallelProcessor', {
            completed,
            total: products.length,
            progress: `${Math.round((completed / products.length) * 100)}%`,
        });
        return result;
    }, {
        concurrency,
        continueOnError,
    });
    return results;
}
