"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToYouTube = postToYouTube;
const googleapis_1 = require("googleapis");
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const rate_limiter_1 = require("./rate-limiter");
const config_validator_1 = require("./config-validator");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const rateLimiters = (0, rate_limiter_1.getRateLimiters)();
async function postToYouTube(videoUrl, caption, clientId, clientSecret, refreshToken, privacyStatus = 'unlisted') {
    const startTime = Date.now();
    try {
        const config = (0, config_validator_1.getConfig)();
        if (!videoUrl || !caption || !clientId || !clientSecret || !refreshToken) {
            throw new errors_1.AppError('Missing required parameters for YouTube posting', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, {
                hasVideoUrl: !!videoUrl,
                hasCaption: !!caption,
                hasClientId: !!clientId,
                hasClientSecret: !!clientSecret,
                hasRefreshToken: !!refreshToken,
            });
        }
        logger.info('Posting to YouTube', 'YouTube', {
            privacyStatus,
            captionLength: caption.length,
        });
        const videoId = await rateLimiters.execute('youtube', async () => {
            return (0, errors_1.withRetry)(async () => {
                // Create OAuth2 client and set credentials
                const oauth2Client = new googleapis_1.google.auth.OAuth2({ clientId, clientSecret });
                oauth2Client.setCredentials({ refresh_token: refreshToken });
                const youtube = googleapis_1.google.youtube({ version: 'v3', auth: oauth2Client });
                // Stream the video from the remote URL to YouTube
                logger.debug('Streaming video from URL', 'YouTube', { videoUrl });
                let mediaBody;
                try {
                    const res = await axios_1.default.get(videoUrl, {
                        responseType: 'stream',
                        timeout: config.TIMEOUT_SOCIAL_POST,
                    });
                    mediaBody = res.data;
                    // Add error handling for the stream
                    mediaBody.on('error', (error) => {
                        logger.error('Video stream error', 'YouTube', {}, error);
                    });
                }
                catch (downloadError) {
                    throw new errors_1.AppError('Failed to stream video from URL', errors_1.ErrorCode.NETWORK_ERROR, 500, true, { videoUrl }, downloadError instanceof Error ? downloadError : undefined);
                }
                const title = caption?.slice(0, 95) || 'Video';
                const description = caption || '';
                logger.debug('Uploading video to YouTube', 'YouTube', { title });
                const upload = await youtube.videos.insert({
                    part: ['snippet', 'status'],
                    requestBody: {
                        snippet: {
                            title,
                            description,
                            categoryId: '22', // People & Blogs default
                        },
                        status: { privacyStatus },
                    },
                    media: { body: mediaBody },
                });
                const uploadedVideoId = upload.data.id;
                if (!uploadedVideoId) {
                    throw new errors_1.AppError('YouTube upload did not return a video ID', errors_1.ErrorCode.YOUTUBE_API_ERROR, 500);
                }
                logger.debug('Video uploaded successfully', 'YouTube', { videoId: uploadedVideoId });
                return uploadedVideoId;
            }, {
                maxRetries: 3,
                onRetry: (error, attempt) => {
                    logger.warn('Retrying YouTube upload', 'YouTube', {
                        attempt,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });
        });
        const duration = Date.now() - startTime;
        metrics.incrementCounter('youtube.success');
        metrics.recordHistogram('youtube.duration', duration);
        logger.info('Successfully posted to YouTube', 'YouTube', {
            duration,
            videoId,
        });
        return videoId;
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('youtube.error');
        metrics.recordHistogram('youtube.error_duration', duration);
        logger.error('Failed to post to YouTube', 'YouTube', { duration }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        if (axios_1.default.isAxiosError(error)) {
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.YOUTUBE_API_ERROR, {
                videoUrl,
            });
        }
        // Handle Google API errors
        if (error.code || error.errors) {
            throw new errors_1.AppError(`YouTube API error: ${error.message || String(error)}`, errors_1.ErrorCode.YOUTUBE_API_ERROR, error.code || 500, true, {
                googleError: error.errors,
                code: error.code,
            }, error);
        }
        throw new errors_1.AppError(`YouTube posting failed: ${error.message || String(error)}`, errors_1.ErrorCode.YOUTUBE_API_ERROR, 500, true, {}, error instanceof Error ? error : undefined);
    }
}
