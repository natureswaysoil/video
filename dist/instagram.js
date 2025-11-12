"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToInstagram = postToInstagram;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const rate_limiter_1 = require("./rate-limiter");
const config_validator_1 = require("./config-validator");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const rateLimiters = (0, rate_limiter_1.getRateLimiters)();
async function postToInstagram(videoUrl, caption, accessToken, igId, opts = {}) {
    const startTime = Date.now();
    try {
        const config = (0, config_validator_1.getConfig)();
        if (!videoUrl || !caption || !accessToken || !igId) {
            throw new errors_1.AppError('Missing required parameters for Instagram posting', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasVideoUrl: !!videoUrl, hasCaption: !!caption, hasAccessToken: !!accessToken, hasIgId: !!igId });
        }
        const apiVersion = opts.apiVersion || config.INSTAGRAM_API_VERSION;
        const apiHost = opts.apiHost || config.INSTAGRAM_API_HOST;
        const mediaType = (opts.mediaType || config.IG_MEDIA_TYPE);
        const uploadType = (opts.uploadType || config.IG_UPLOAD_TYPE);
        logger.info('Posting to Instagram', 'Instagram', {
            mediaType,
            uploadType,
            captionLength: caption.length,
        });
        const result = await rateLimiters.execute('instagram', async () => {
            return (0, errors_1.withRetry)(async () => {
                // Step 1: Create media container
                const baseUrl = `https://${apiHost}/${apiVersion}`;
                let containerId;
                try {
                    if (uploadType === 'resumable') {
                        // Create a resumable upload container (no video_url here)
                        const containerRes = await axios_1.default.post(`${baseUrl}/${igId}/media`, {
                            media_type: mediaType || 'VIDEO',
                            caption,
                            upload_type: 'resumable',
                        }, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                            timeout: config.TIMEOUT_SOCIAL_POST,
                        });
                        const cid = containerRes.data.id;
                        containerId = cid;
                        // Upload the video using rupload with file_url header
                        await uploadViaRupload(cid, videoUrl, accessToken, apiVersion, config.TIMEOUT_SOCIAL_POST);
                    }
                    else {
                        // Simple path: point Instagram to a public video URL
                        const containerRes = await axios_1.default.post(`${baseUrl}/${igId}/media`, {
                            video_url: videoUrl,
                            media_type: mediaType || 'VIDEO',
                            caption,
                        }, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                            timeout: config.TIMEOUT_SOCIAL_POST,
                        });
                        containerId = containerRes.data.id;
                    }
                }
                catch (err) {
                    // If resumable is not allowed (e.g., app setup), fallback to simple method once
                    const msg = err?.response?.data || err?.message || String(err);
                    if (uploadType === 'resumable') {
                        logger.warn('Resumable upload failed, falling back to simple', 'Instagram', {}, err);
                        // Fallback to simple flow
                        const containerRes = await axios_1.default.post(`${baseUrl}/${igId}/media`, {
                            video_url: videoUrl,
                            media_type: mediaType || 'VIDEO',
                            caption,
                        }, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                            timeout: config.TIMEOUT_SOCIAL_POST,
                        });
                        containerId = containerRes.data.id;
                    }
                    else {
                        throw new errors_1.AppError(`Instagram container creation failed: ${JSON.stringify(msg)}`, errors_1.ErrorCode.INSTAGRAM_API_ERROR, 500, true, { errorDetails: msg });
                    }
                }
                if (!containerId) {
                    throw new errors_1.AppError('Instagram: missing containerId', errors_1.ErrorCode.INSTAGRAM_API_ERROR, 500);
                }
                logger.debug('Instagram container created', 'Instagram', { containerId });
                // Optional: poll container status before publishing (recommended)
                const status = await pollContainerStatus({
                    containerId,
                    accessToken,
                    apiHost,
                    apiVersion,
                    maxAttempts: 6,
                    delayMs: 10000,
                    timeout: config.TIMEOUT_SOCIAL_POST,
                });
                if (status === 'ERROR') {
                    throw new errors_1.AppError('Instagram: container status ERROR before publish', errors_1.ErrorCode.INSTAGRAM_API_ERROR, 500, true, { containerId, status });
                }
                logger.debug('Instagram container ready', 'Instagram', { containerId, status });
                // Step 2: Publish media container
                const publishRes = await axios_1.default.post(`${baseUrl}/${igId}/media_publish`, { creation_id: containerId }, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: config.TIMEOUT_SOCIAL_POST,
                });
                const mediaId = publishRes.data.id;
                if (!mediaId) {
                    throw new errors_1.AppError('Instagram publish did not return a media ID', errors_1.ErrorCode.INSTAGRAM_API_ERROR, 500);
                }
                logger.debug('Instagram media published', 'Instagram', { mediaId });
                return mediaId;
            }, {
                maxRetries: 3,
                onRetry: (error, attempt) => {
                    logger.warn('Retrying Instagram post', 'Instagram', {
                        attempt,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });
        });
        const duration = Date.now() - startTime;
        metrics.incrementCounter('instagram.success');
        metrics.recordHistogram('instagram.duration', duration);
        logger.info('Successfully posted to Instagram', 'Instagram', {
            duration,
            mediaId: result,
        });
        return result;
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('instagram.error');
        metrics.recordHistogram('instagram.error_duration', duration);
        logger.error('Failed to post to Instagram', 'Instagram', { duration }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        if (axios_1.default.isAxiosError(error)) {
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.INSTAGRAM_API_ERROR, {
                videoUrl,
                igId,
            });
        }
        throw new errors_1.AppError(`Instagram posting failed: ${error.message || String(error)}`, errors_1.ErrorCode.INSTAGRAM_API_ERROR, 500, true, { igId }, error instanceof Error ? error : undefined);
    }
}
async function pollContainerStatus(params) {
    const { containerId, accessToken, apiVersion, apiHost } = params;
    const maxAttempts = params.maxAttempts ?? 6;
    const delayMs = params.delayMs ?? 10000;
    const timeout = params.timeout ?? 30000;
    const baseUrl = `https://${apiHost}/${apiVersion}`;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await axios_1.default.get(`${baseUrl}/${containerId}?fields=status_code`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout,
            });
            const status = res.data?.status_code;
            if (!status) {
                logger.debug('No status code returned', 'Instagram', { containerId, attempt: i + 1 });
                await new Promise((r) => setTimeout(r, delayMs));
                continue;
            }
            logger.debug('Container status check', 'Instagram', {
                containerId,
                status,
                attempt: i + 1,
            });
            if (status === 'FINISHED' || status === 'PUBLISHED')
                return status;
            if (status === 'ERROR' || status === 'EXPIRED')
                return status;
        }
        catch (e) {
            logger.warn('Status check failed, will retry', 'Instagram', {
                containerId,
                attempt: i + 1,
            }, e);
            // Ignore transient errors and retry
        }
        await new Promise((r) => setTimeout(r, delayMs));
    }
    logger.warn('Container status polling timed out', 'Instagram', {
        containerId,
        maxAttempts,
    });
    return undefined;
}
async function uploadViaRupload(containerId, videoUrl, accessToken, apiVersion, timeout) {
    const ruploadUrl = `https://rupload.facebook.com/ig-api-upload/${apiVersion}/${containerId}`;
    logger.debug('Uploading via rupload', 'Instagram', { containerId });
    // Use file_url header to instruct Meta to fetch the video from our URL
    await axios_1.default.post(ruploadUrl, undefined, {
        headers: {
            Authorization: `OAuth ${accessToken}`,
            'file_url': videoUrl,
        },
        timeout,
        // Avoid axios adding content-type when no body
        validateStatus: (s) => s >= 200 && s < 300,
    });
    logger.debug('Rupload completed', 'Instagram', { containerId });
}
