"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fitTweetText = fitTweetText;
exports.fitTweetTextWithUrl = fitTweetTextWithUrl;
exports.getTwitterErrorStatus = getTwitterErrorStatus;
exports.isRetryableTwitterError = isRetryableTwitterError;
exports.postToTwitter = postToTwitter;
const axios_1 = __importDefault(require("axios"));
const twitter_api_v2_1 = require("twitter-api-v2");
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const rate_limiter_1 = require("./rate-limiter");
const config_validator_1 = require("./config-validator");
const memory_manager_1 = require("./memory-manager");
const secret_manager_1 = require("./secret-manager");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const rateLimiters = (0, rate_limiter_1.getRateLimiters)();
// Maximum video size for Twitter (500MB)
const MAX_VIDEO_SIZE_MB = 500;
const MAX_TWEET_LENGTH = 280;
function fitTweetText(value) {
    const text = value.trim();
    if (text.length <= MAX_TWEET_LENGTH)
        return text;
    return `${text.slice(0, MAX_TWEET_LENGTH - 3).trimEnd()}...`;
}
function fitTweetTextWithUrl(caption, url) {
    const suffix = `\n${url.trim()}`;
    const available = MAX_TWEET_LENGTH - suffix.length;
    if (available <= 3)
        return fitTweetText(url);
    const text = caption.trim();
    const fitted = text.length <= available
        ? text
        : `${text.slice(0, available - 3).trimEnd()}...`;
    return `${fitted}${suffix}`;
}
function hasOAuth1UserCredentials() {
    return Boolean(process.env.TWITTER_API_KEY?.trim() &&
        process.env.TWITTER_API_SECRET?.trim() &&
        process.env.TWITTER_ACCESS_TOKEN?.trim() &&
        process.env.TWITTER_ACCESS_SECRET?.trim());
}
function createTwitterOAuth1Client() {
    return new twitter_api_v2_1.TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
}
async function createTwitterUserClient() {
    const clientId = process.env.TWITTER_CLIENT_ID?.trim();
    const clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim();
    const refreshToken = process.env.TWITTER_REFRESH_TOKEN?.trim();
    if (clientId && clientSecret && refreshToken) {
        try {
            const oauthClient = new twitter_api_v2_1.TwitterApi({ clientId, clientSecret });
            const refreshed = await oauthClient.refreshOAuth2Token(refreshToken);
            logger.info('Refreshed Twitter OAuth 2.0 user authorization', 'Twitter', { scopes: refreshed.scope });
            if (refreshed.refreshToken && refreshed.refreshToken !== refreshToken) {
                process.env.TWITTER_REFRESH_TOKEN = refreshed.refreshToken;
                try {
                    await (0, secret_manager_1.addSecretVersion)('TWITTER_REFRESH_TOKEN', refreshed.refreshToken);
                    logger.info('Stored rotated Twitter refresh token', 'Twitter');
                }
                catch (err) {
                    logger.warn('Could not persist rotated Twitter refresh token to Secret Manager (continuing)', 'Twitter', { error: err?.message ?? String(err) });
                }
            }
            return refreshed.client;
        }
        catch (error) {
            if (!hasOAuth1UserCredentials())
                throw error;
            logger.warn('Twitter OAuth 2.0 refresh failed; falling back to OAuth 1.0a user credentials', 'Twitter', { status: getTwitterErrorStatus(error), error: error?.message ?? String(error) });
            return createTwitterOAuth1Client();
        }
    }
    return createTwitterOAuth1Client();
}
function getTwitterErrorStatus(error) {
    const candidate = error?.response?.status ??
        error?.data?.status ??
        error?.code;
    const status = Number(candidate);
    return Number.isFinite(status) ? status : undefined;
}
function isRetryableTwitterError(error) {
    if (error instanceof errors_1.AppError && error.code === errors_1.ErrorCode.VALIDATION_ERROR) {
        return false;
    }
    const status = getTwitterErrorStatus(error);
    if (status === undefined)
        return true;
    if (status === 429)
        return true;
    return status >= 500;
}
/**
 * Posts to Twitter/X.
 * If OAuth 1.0a credentials are present (env), uploads the video and posts a tweet with the media.
 * Otherwise, falls back to a simple text tweet (caption + URL) using Bearer token.
 */
async function postToTwitter(videoUrl, caption, bearerToken) {
    const startTime = Date.now();
    try {
        const config = (0, config_validator_1.getConfig)();
        if (!videoUrl || !caption) {
            throw new errors_1.AppError('Missing required parameters for Twitter posting', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasVideoUrl: !!videoUrl, hasCaption: !!caption });
        }
        const hasOAuth2User = Boolean(process.env.TWITTER_CLIENT_ID &&
            process.env.TWITTER_CLIENT_SECRET &&
            process.env.TWITTER_REFRESH_TOKEN);
        const hasOAuth1User = Boolean(process.env.TWITTER_API_KEY &&
            process.env.TWITTER_API_SECRET &&
            process.env.TWITTER_ACCESS_TOKEN &&
            process.env.TWITTER_ACCESS_SECRET);
        const canUpload = hasOAuth2User || hasOAuth1User;
        logger.info('Posting to Twitter', 'Twitter', {
            canUpload,
            authMode: hasOAuth2User ? 'oauth2-user' : hasOAuth1User ? 'oauth1-user' : 'bearer',
            captionLength: caption.length,
        });
        let postId = '';
        if (canUpload) {
            postId = await rateLimiters.execute('twitter', async () => {
                return (0, errors_1.withRetry)(async () => {
                    const client = await createTwitterUserClient();
                    const rwClient = client.readWrite;
                    // Check memory before downloading video
                    const memoryBefore = (0, memory_manager_1.getMemoryUsage)();
                    logger.debug('Memory before video download', 'Twitter', {
                        heapUsedMB: memoryBefore.heapUsedMB,
                    });
                    // Check video size before downloading
                    try {
                        const headResponse = await axios_1.default.head(videoUrl);
                        const contentLength = parseInt(String(headResponse.headers['content-length'] || '0'), 10);
                        const sizeMB = contentLength / (1024 * 1024);
                        if (sizeMB > MAX_VIDEO_SIZE_MB) {
                            throw new errors_1.AppError(`Video too large for Twitter: ${sizeMB.toFixed(2)}MB (max ${MAX_VIDEO_SIZE_MB}MB)`, errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { videoSizeMB: sizeMB, maxSizeMB: MAX_VIDEO_SIZE_MB });
                        }
                        logger.debug('Video size check', 'Twitter', { sizeMB: sizeMB.toFixed(2) });
                    }
                    catch (error) {
                        // If HEAD request fails, continue anyway (some servers don't support HEAD)
                        logger.warn('Could not check video size', 'Twitter', {}, error);
                    }
                    // Download the video file into memory for upload
                    logger.debug('Downloading video for Twitter upload', 'Twitter');
                    const resp = await axios_1.default.get(videoUrl, {
                        responseType: 'arraybuffer',
                        timeout: config.TIMEOUT_SOCIAL_POST,
                        maxContentLength: MAX_VIDEO_SIZE_MB * 1024 * 1024,
                    });
                    const memoryAfter = (0, memory_manager_1.getMemoryUsage)();
                    const memoryUsedMB = memoryAfter.heapUsedMB - memoryBefore.heapUsedMB;
                    logger.debug('Video downloaded', 'Twitter', {
                        heapUsedMB: memoryAfter.heapUsedMB,
                        memoryUsedForVideoMB: memoryUsedMB,
                    });
                    // X's pay-per-use platform exposes media upload through API v2.
                    // The former v1.1 upload endpoint can return 403 even when the app
                    // has valid read/write credentials and a funded credit balance.
                    logger.debug('Uploading video to Twitter with API v2', 'Twitter');
                    const mediaId = await rwClient.v2.uploadMedia(Buffer.from(resp.data), {
                        media_type: 'video/mp4',
                        media_category: 'tweet_video',
                    });
                    // Post tweet with media
                    logger.debug('Posting tweet', 'Twitter');
                    const tweetText = fitTweetText(caption);
                    const tweetResult = await rwClient.v2.tweet({
                        text: tweetText,
                        media: { media_ids: [mediaId] },
                    });
                    logger.debug('Tweet posted successfully', 'Twitter');
                    return tweetResult.data.id;
                }, {
                    maxRetries: 3,
                    retryIf: isRetryableTwitterError,
                    onRetry: (error, attempt) => {
                        logger.warn('Retrying Twitter post', 'Twitter', {
                            attempt,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    },
                });
            });
        }
        else {
            // Fallback to bearer token (text only)
            if (!bearerToken) {
                throw new errors_1.AppError('Twitter bearer token missing and upload credentials not provided', errors_1.ErrorCode.MISSING_CONFIG, 500);
            }
            postId = await rateLimiters.execute('twitter', async () => {
                return (0, errors_1.withRetry)(async () => {
                    const res = await axios_1.default.post('https://api.twitter.com/2/tweets', { text: fitTweetTextWithUrl(caption, videoUrl) }, {
                        headers: { Authorization: `Bearer ${bearerToken}` },
                        timeout: config.TIMEOUT_SOCIAL_POST,
                    });
                    return String(res.data?.data?.id ?? '');
                }, {
                    maxRetries: 3,
                    retryIf: isRetryableTwitterError,
                    onRetry: (error, attempt) => {
                        logger.warn('Retrying Twitter text post', 'Twitter', {
                            attempt,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    },
                });
            });
        }
        const duration = Date.now() - startTime;
        metrics.incrementCounter('twitter.success');
        metrics.recordHistogram('twitter.duration', duration);
        logger.info('Successfully posted to Twitter', 'Twitter', { duration });
        return postId;
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('twitter.error');
        metrics.recordHistogram('twitter.error_duration', duration);
        logger.error('Failed to post to Twitter', 'Twitter', { duration }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        if (axios_1.default.isAxiosError(error)) {
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.TWITTER_API_ERROR, {
                videoUrl,
            });
        }
        throw new errors_1.AppError(`Twitter posting failed: ${error.message || String(error)}`, errors_1.ErrorCode.TWITTER_API_ERROR, 500, true, {}, error instanceof Error ? error : undefined);
    }
}
