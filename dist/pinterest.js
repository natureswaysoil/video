"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToPinterest = postToPinterest;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const rate_limiter_1 = require("./rate-limiter");
const config_validator_1 = require("./config-validator");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const rateLimiters = (0, rate_limiter_1.getRateLimiters)();
async function postToPinterest(videoUrl, caption, accessToken, boardId) {
    const startTime = Date.now();
    try {
        const config = (0, config_validator_1.getConfig)();
        if (!videoUrl || !caption || !accessToken || !boardId) {
            throw new errors_1.AppError('Missing required parameters for Pinterest posting', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasVideoUrl: !!videoUrl, hasCaption: !!caption, hasAccessToken: !!accessToken, hasBoardId: !!boardId });
        }
        logger.info('Posting to Pinterest', 'Pinterest', {
            boardId,
            captionLength: caption.length,
        });
        // Apply rate limiting and retry logic
        await rateLimiters.execute('pinterest', async () => {
            return (0, errors_1.withRetry)(async () => {
                await axios_1.default.post(`https://api.pinterest.com/v5/pins`, {
                    board_id: boardId,
                    media_source: { source_type: 'video_url', url: videoUrl },
                    title: caption.substring(0, 100), // Pinterest title max length
                    description: caption,
                }, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: config.TIMEOUT_SOCIAL_POST,
                });
            }, {
                maxRetries: 3,
                onRetry: (error, attempt) => {
                    logger.warn('Retrying Pinterest post', 'Pinterest', {
                        attempt,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });
        });
        const duration = Date.now() - startTime;
        metrics.incrementCounter('pinterest.success');
        metrics.recordHistogram('pinterest.duration', duration);
        logger.info('Successfully posted to Pinterest', 'Pinterest', { duration });
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('pinterest.error');
        metrics.recordHistogram('pinterest.error_duration', duration);
        logger.error('Failed to post to Pinterest', 'Pinterest', { duration }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        if (axios_1.default.isAxiosError(error)) {
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.PINTEREST_API_ERROR, {
                boardId,
                videoUrl,
            });
        }
        throw new errors_1.AppError(`Pinterest posting failed: ${error.message || String(error)}`, errors_1.ErrorCode.PINTEREST_API_ERROR, 500, true, { boardId }, error instanceof Error ? error : undefined);
    }
}
