"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToFacebook = postToFacebook;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const rate_limiter_1 = require("./rate-limiter");
const config_validator_1 = require("./config-validator");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const rateLimiters = (0, rate_limiter_1.getRateLimiters)();
async function postToFacebook(videoUrl, caption, pageAccessToken, pageId) {
    const startTime = Date.now();
    try {
        const config = (0, config_validator_1.getConfig)();
        if (!videoUrl || !pageAccessToken || !pageId) {
            throw new errors_1.AppError('Missing required parameters for Facebook posting', errors_1.ErrorCode.FACEBOOK_API_ERROR, 400, true, { hasVideoUrl: !!videoUrl, hasPageAccessToken: !!pageAccessToken, hasPageId: !!pageId });
        }
        logger.info('Posting to Facebook', 'Facebook', {
            pageId,
            captionLength: caption.length,
        });
        const postId = await rateLimiters.execute('instagram', async () => {
            return (0, errors_1.withRetry)(async () => {
                const res = await axios_1.default.post(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
                    file_url: videoUrl,
                    description: caption,
                    access_token: pageAccessToken,
                }, {
                    timeout: config.TIMEOUT_SOCIAL_POST,
                });
                return String(res.data?.id || '');
            }, {
                maxRetries: 3,
                onRetry: (error, attempt) => {
                    logger.warn('Retrying Facebook post', 'Facebook', {
                        attempt,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });
        });
        const duration = Date.now() - startTime;
        metrics.incrementCounter('facebook.success');
        metrics.recordHistogram('facebook.duration', duration);
        logger.info('Successfully posted to Facebook', 'Facebook', {
            duration,
            postId,
        });
        return postId;
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('facebook.error');
        metrics.recordHistogram('facebook.error_duration', duration);
        logger.error('Failed to post to Facebook', 'Facebook', { duration }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        if (axios_1.default.isAxiosError(error)) {
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.FACEBOOK_API_ERROR, {
                pageId,
                videoUrl,
            });
        }
        throw new errors_1.AppError(`Facebook posting failed: ${error.message || String(error)}`, errors_1.ErrorCode.FACEBOOK_API_ERROR, 500, true, { pageId }, error instanceof Error ? error : undefined);
    }
}
