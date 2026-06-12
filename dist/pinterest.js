"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToPinterest = postToPinterest;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const rate_limiter_1 = require("./rate-limiter");
const config_validator_1 = require("./config-validator");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const rateLimiters = (0, rate_limiter_1.getRateLimiters)();
/**
 * Register a new video media item with Pinterest and upload the bytes to the
 * returned S3 endpoint. Polls until the media is ready and returns the media_id.
 *
 * Pinterest v5 API requires this 2-step flow for video pins —
 * `source_type: 'video_url'` is NOT supported by /v5/pins.
 */
async function uploadVideoToPinterest(videoUrl, accessToken, timeoutMs) {
    // 1. Register the upload
    const registerRes = await axios_1.default.post('https://api.pinterest.com/v5/media', { media_type: 'video' }, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: timeoutMs,
    });
    const mediaId = registerRes.data?.media_id;
    const uploadUrl = registerRes.data?.upload_url;
    const uploadParameters = registerRes.data?.upload_parameters || {};
    if (!mediaId || !uploadUrl) {
        throw new errors_1.AppError('Pinterest /v5/media did not return media_id/upload_url', errors_1.ErrorCode.PINTEREST_API_ERROR, 500, true, { response: registerRes.data });
    }
    // 2. Download the source video into memory
    const videoResp = await axios_1.default.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        maxContentLength: 500 * 1024 * 1024,
    });
    // 3. Upload to S3 — order matters: all upload_parameters before `file`
    const form = new form_data_1.default();
    for (const [k, v] of Object.entries(uploadParameters)) {
        form.append(k, v);
    }
    form.append('file', Buffer.from(videoResp.data), {
        filename: 'video.mp4',
        contentType: 'video/mp4',
    });
    await axios_1.default.post(uploadUrl, form, {
        headers: form.getHeaders(),
        timeout: timeoutMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });
    // 4. Poll for ready state (Pinterest processes video asynchronously)
    const pollTimeoutMs = 5 * 60_000;
    const pollIntervalMs = 5_000;
    const start = Date.now();
    while (Date.now() - start < pollTimeoutMs) {
        const statusRes = await axios_1.default.get(`https://api.pinterest.com/v5/media/${mediaId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: timeoutMs,
        });
        const status = statusRes.data?.status;
        if (status === 'succeeded')
            return mediaId;
        if (status === 'failed') {
            throw new errors_1.AppError('Pinterest media processing failed', errors_1.ErrorCode.PINTEREST_API_ERROR, 500, true, { mediaId, response: statusRes.data });
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new errors_1.AppError('Pinterest media processing timed out', errors_1.ErrorCode.PINTEREST_API_ERROR, 504, true, { mediaId });
}
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
        const pinId = await rateLimiters.execute('pinterest', async () => {
            return (0, errors_1.withRetry)(async () => {
                // Step 1+2+3+4: register, upload, and wait for processing
                const mediaId = await uploadVideoToPinterest(videoUrl, accessToken, config.TIMEOUT_SOCIAL_POST);
                // Step 5: create the pin referencing the uploaded media_id
                const mediaSource = {
                    source_type: 'video_id',
                    media_id: mediaId,
                };
                if (process.env.PINTEREST_COVER_IMAGE_URL) {
                    mediaSource.cover_image_url = process.env.PINTEREST_COVER_IMAGE_URL;
                }
                const res = await axios_1.default.post(`https://api.pinterest.com/v5/pins`, {
                    board_id: boardId,
                    media_source: mediaSource,
                    title: caption.substring(0, 100), // Pinterest title max length
                    description: caption,
                }, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: config.TIMEOUT_SOCIAL_POST,
                });
                return String(res.data?.id ?? '');
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
        return pinId;
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
