"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeyGenClient = void 0;
exports.createClientWithSecrets = createClientWithSecrets;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const rate_limiter_1 = require("./rate-limiter");
const config_validator_1 = require("./config-validator");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const rateLimiters = (0, rate_limiter_1.getRateLimiters)();
// Optional: load secrets from Google Secret Manager (only if running on GCP)
async function getSecretFromGcp(name) {
    try {
        // lazy-import so module doesn't require @google-cloud/secret-manager when not used
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
        const client = new SecretManagerServiceClient();
        const [accessResponse] = await client.accessSecretVersion({ name });
        const payload = accessResponse.payload?.data?.toString('utf8');
        return payload || null;
    }
    catch (e) {
        // Not fatal - return null so caller can fall back to env var
        logger.debug('Could not load secret from GCP', 'HeyGen', { error: e });
        return null;
    }
}
class HeyGenClient {
    constructor(cfg = {}) {
        this.apiKey = cfg.apiKey || process.env.HEYGEN_API_KEY || '';
        this.apiEndpoint = cfg.apiEndpoint || process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com';
        if (!this.apiKey) {
            throw new errors_1.AppError('HeyGen API key is required', errors_1.ErrorCode.MISSING_CONFIG, 500);
        }
        this.axios = axios_1.default.create({
            baseURL: this.apiEndpoint,
            timeout: 30_000,
            headers: {
                'X-Api-Key': this.apiKey,
                'Content-Type': 'application/json',
            },
        });
    }
    /**
     * Create a new video generation job
     * @param payload Video generation parameters
     * @returns Job ID for polling
     */
    async createVideoJob(payload) {
        const startTime = Date.now();
        try {
            const config = (0, config_validator_1.getConfig)();
            if (!payload.script) {
                throw new errors_1.AppError('Script is required for HeyGen video generation', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasScript: !!payload.script });
            }
            logger.info('Creating HeyGen video job', 'HeyGen', {
                scriptLength: payload.script.length,
                avatar: payload.avatar,
                voice: payload.voice,
            });
            const jobId = await rateLimiters.execute('heygen', async () => {
                return (0, errors_1.withRetry)(async () => {
                    const response = await this.axios.post('/v1/video.generate', payload, {
                        timeout: config.TIMEOUT_HEYGEN,
                    });
                    const id = response.data?.data?.video_id ||
                        response.data?.video_id ||
                        response.data?.jobId;
                    if (!id) {
                        throw new errors_1.AppError('HeyGen API did not return a job ID', errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, { responseData: response.data });
                    }
                    return id;
                }, {
                    maxRetries: 3,
                    onRetry: (error, attempt) => {
                        logger.warn('Retrying HeyGen job creation', 'HeyGen', {
                            attempt,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    },
                });
            });
            const duration = Date.now() - startTime;
            metrics.incrementCounter('heygen.create_job.success');
            metrics.recordHistogram('heygen.create_job.duration', duration);
            logger.info('HeyGen video job created', 'HeyGen', {
                jobId,
                duration,
            });
            return jobId;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics.incrementCounter('heygen.create_job.error');
            metrics.recordHistogram('heygen.create_job.error_duration', duration);
            logger.error('Failed to create HeyGen video job', 'HeyGen', { duration }, error);
            if (error instanceof errors_1.AppError) {
                throw error;
            }
            if (axios_1.default.isAxiosError(error)) {
                throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.HEYGEN_API_ERROR, {
                    payload: { scriptLength: payload.script.length },
                });
            }
            throw new errors_1.AppError(`HeyGen job creation failed: ${error.message || String(error)}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, {}, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Check the status of a video generation job
     * @param jobId Job ID returned from createVideoJob
     * @returns Job status and result
     */
    async getJobStatus(jobId) {
        try {
            const config = (0, config_validator_1.getConfig)();
            if (!jobId) {
                throw new errors_1.AppError('Job ID is required', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasJobId: !!jobId });
            }
            const response = await this.axios.get(`/v1/video_status.get?video_id=${jobId}`, {
                timeout: config.TIMEOUT_HEYGEN,
            });
            const data = response.data?.data || response.data;
            const result = {
                jobId,
                status: this.normalizeStatus(data?.status),
                videoUrl: data?.video_url || data?.videoUrl || data?.url,
                error: data?.error || data?.error_message,
            };
            logger.debug('HeyGen job status', 'HeyGen', {
                jobId,
                status: result.status,
                hasVideoUrl: !!result.videoUrl,
            });
            return result;
        }
        catch (error) {
            logger.error('Failed to get HeyGen job status', 'HeyGen', { jobId }, error);
            if (error instanceof errors_1.AppError) {
                throw error;
            }
            if (axios_1.default.isAxiosError(error)) {
                throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.HEYGEN_API_ERROR, { jobId });
            }
            throw new errors_1.AppError(`Failed to get HeyGen job status: ${error.message || String(error)}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, { jobId }, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Poll a job until it completes or times out
     * @param jobId Job ID to poll
     * @param opts Polling options
     * @returns Video URL when ready
     */
    async pollJobForVideoUrl(jobId, opts) {
        const startTime = Date.now();
        const timeoutMs = opts?.timeoutMs ?? 20 * 60_000; // 20 minutes default
        const intervalMs = opts?.intervalMs ?? 10_000; // 10 seconds default
        try {
            logger.info('Polling HeyGen job', 'HeyGen', {
                jobId,
                timeoutMs,
                intervalMs,
            });
            while (Date.now() - startTime < timeoutMs) {
                try {
                    const result = await this.getJobStatus(jobId);
                    if (result.status === 'completed' && result.videoUrl) {
                        const duration = Date.now() - startTime;
                        metrics.incrementCounter('heygen.poll.success');
                        metrics.recordHistogram('heygen.poll.duration', duration);
                        logger.info('HeyGen job completed', 'HeyGen', {
                            jobId,
                            duration,
                            videoUrl: result.videoUrl,
                        });
                        return result.videoUrl;
                    }
                    if (result.status === 'failed') {
                        throw new errors_1.AppError(`HeyGen job failed: ${result.error || 'Unknown error'}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, { jobId, error: result.error });
                    }
                    // Still processing, wait and retry
                    logger.debug('HeyGen job still processing', 'HeyGen', {
                        jobId,
                        status: result.status,
                    });
                    await new Promise((resolve) => setTimeout(resolve, intervalMs));
                }
                catch (error) {
                    // If it's a job failure, rethrow immediately
                    if (error instanceof errors_1.AppError && error.message.includes('job failed')) {
                        throw error;
                    }
                    // For other errors (network issues, etc.), continue polling
                    logger.warn('Error polling HeyGen job, will retry', 'HeyGen', {
                        jobId,
                    }, error);
                    await new Promise((resolve) => setTimeout(resolve, intervalMs));
                }
            }
            const duration = Date.now() - startTime;
            metrics.incrementCounter('heygen.poll.timeout');
            metrics.recordHistogram('heygen.poll.timeout_duration', duration);
            throw new errors_1.AppError(`HeyGen job timed out after ${timeoutMs}ms`, errors_1.ErrorCode.TIMEOUT_ERROR, 500, true, { jobId, timeoutMs });
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics.incrementCounter('heygen.poll.error');
            metrics.recordHistogram('heygen.poll.error_duration', duration);
            logger.error('Failed to poll HeyGen job', 'HeyGen', { jobId, duration }, error);
            if (error instanceof errors_1.AppError) {
                throw error;
            }
            throw new errors_1.AppError(`HeyGen polling failed: ${error.message || String(error)}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, { jobId }, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Normalize various status strings to our enum
     */
    normalizeStatus(status) {
        const s = (status || '').toLowerCase();
        if (s.includes('complet') || s === 'success')
            return 'completed';
        if (s.includes('fail') || s === 'error')
            return 'failed';
        if (s.includes('process') || s === 'running')
            return 'processing';
        return 'pending';
    }
}
exports.HeyGenClient = HeyGenClient;
/**
 * Create a HeyGen client with credentials loaded from env or GCP Secret Manager
 */
async function createClientWithSecrets() {
    try {
        let apiKey = process.env.HEYGEN_API_KEY;
        // Try loading from GCP Secret Manager if not in env
        if (!apiKey && process.env.GCP_SECRET_HEYGEN_API_KEY) {
            const v = await getSecretFromGcp(process.env.GCP_SECRET_HEYGEN_API_KEY);
            if (v)
                apiKey = v;
        }
        return new HeyGenClient({ apiKey: apiKey || undefined });
    }
    catch (error) {
        logger.error('Failed to create HeyGen client', 'HeyGen', {}, error);
        throw error;
    }
}
exports.default = HeyGenClient;
