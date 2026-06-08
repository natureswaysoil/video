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
function isPlaceholderApiKey(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || normalized.includes('your-') || normalized.includes('paste_') || normalized.includes('replace_') || normalized === 'changeme';
}
// Optional: load secrets from Google Secret Manager
async function getSecretFromGcp(name) {
    try {
        const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
        const client = new SecretManagerServiceClient();
        const [accessResponse] = await client.accessSecretVersion({ name });
        const payload = accessResponse.payload?.data?.toString('utf8');
        return payload || null;
    }
    catch (e) {
        logger.debug('Could not load secret from GCP', 'HeyGen', { error: e });
        return null;
    }
}
class HeyGenClient {
    constructor(cfg = {}) {
        this._avatarCache = {};
        this._voiceCache = {};
        this.apiKey = cfg.apiKey || process.env.HEYGEN_API_KEY || '';
        this.apiEndpoint = cfg.apiEndpoint || process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com';
        if (isPlaceholderApiKey(this.apiKey)) {
            throw new errors_1.AppError('HeyGen API key is missing or still set to a placeholder.', errors_1.ErrorCode.MISSING_CONFIG, 500, true, { hasHeyGenApiKey: !!this.apiKey });
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
    async resolveAvatarId(nameOrId) {
        if (this._avatarCache[nameOrId])
            return this._avatarCache[nameOrId];
        try {
            const res = await this.axios.get('/v2/avatars');
            const avatars = res.data?.data?.avatars || res.data?.avatars || [];
            const match = avatars.find((a) => a.avatar_id === nameOrId) || avatars.find((a) => (a.avatar_name || '').toLowerCase().includes(nameOrId.toLowerCase())) || avatars[0];
            const id = match?.avatar_id || nameOrId;
            for (const a of avatars) {
                if (a.avatar_id) {
                    this._avatarCache[a.avatar_name || a.avatar_id] = a.avatar_id;
                    this._avatarCache[a.avatar_id] = a.avatar_id;
                }
            }
            return id;
        }
        catch (e) {
            console.warn('Could not list HeyGen avatars:', e?.message);
            return nameOrId;
        }
    }
    async resolveVoiceId(nameOrId) {
        if (this._voiceCache[nameOrId])
            return this._voiceCache[nameOrId];
        try {
            const res = await this.axios.get('/v2/voices');
            const voices = res.data?.data?.voices || res.data?.voices || [];
            const match = voices.find((v) => v.voice_id === nameOrId) || voices.find((v) => (v.name || '').toLowerCase().includes(nameOrId.toLowerCase())) || voices[0];
            const id = match?.voice_id || nameOrId;
            for (const v of voices) {
                if (v.voice_id) {
                    this._voiceCache[v.name || v.voice_id] = v.voice_id;
                    this._voiceCache[v.voice_id] = v.voice_id;
                }
            }
            return id;
        }
        catch (e) {
            console.warn('Could not list HeyGen voices:', e?.message);
            return nameOrId;
        }
    }
    /**
     * Create a new video generation job — NOW SUPPORTS MULTI-SCENE + PEXELS B-ROLL
     */
    async createVideoJob(payload) {
        const startTime = Date.now();
        try {
            const config = (0, config_validator_1.getConfig)();
            if (!payload.script) {
                throw new errors_1.AppError('Script is required for HeyGen video generation', errors_1.ErrorCode.VALIDATION_ERROR, 400, true);
            }
            logger.info('Creating HeyGen video job', 'HeyGen', {
                scriptLength: payload.script.length,
                avatar: payload.avatar,
                voice: payload.voice,
                hasScenes: !!(payload.scenes && payload.scenes.length > 0),
                sceneCount: payload.scenes?.length || 1,
            });
            const jobId = await rateLimiters.execute('heygen', async () => {
                return (0, errors_1.withRetry)(async () => {
                    const resolvedAvatarId = await this.resolveAvatarId(payload.avatar || 'default');
                    const resolvedVoiceId = await this.resolveVoiceId(payload.voice || 'default');
                    let videoInputs = [];
                    if (payload.scenes && payload.scenes.length > 0) {
                        // Multi-scene mode with Pexels B-roll
                        for (const scene of payload.scenes) {
                            const background = scene.brollUrl
                                ? { type: 'video', url: scene.brollUrl }
                                : payload.imageUrl
                                    ? { type: 'image', url: payload.imageUrl }
                                    : { type: 'color', value: '#1a3a1a' };
                            videoInputs.push({
                                character: {
                                    type: 'avatar',
                                    avatar_id: resolvedAvatarId,
                                    avatar_style: 'normal',
                                },
                                voice: {
                                    type: 'text',
                                    input_text: scene.avatarText || payload.script,
                                    voice_id: resolvedVoiceId,
                                    speed: 1.0,
                                },
                                background,
                            });
                        }
                    }
                    else {
                        // Fallback to single-scene (old behavior)
                        videoInputs = [{
                                character: {
                                    type: 'avatar',
                                    avatar_id: resolvedAvatarId,
                                    avatar_style: 'normal',
                                },
                                voice: {
                                    type: 'text',
                                    input_text: payload.script,
                                    voice_id: resolvedVoiceId,
                                    speed: 1.0,
                                },
                                background: payload.imageUrl
                                    ? { type: 'image', url: payload.imageUrl }
                                    : { type: 'color', value: '#1a3a1a' },
                            }];
                    }
                    const v2Body = {
                        video_inputs: videoInputs,
                        dimension: { width: 720, height: 1280 },
                        ...(payload.title ? { title: payload.title } : {}),
                    };
                    const response = await this.axios.post('/v2/video/generate', v2Body, {
                        timeout: config.TIMEOUT_HEYGEN,
                    });
                    const id = response.data?.data?.video_id || response.data?.video_id || response.data?.jobId;
                    if (!id)
                        throw new errors_1.AppError('HeyGen API did not return a job ID', errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true);
                    return id;
                }, { maxRetries: 3 });
            });
            const duration = Date.now() - startTime;
            metrics.incrementCounter('heygen.create_job.success');
            metrics.recordHistogram('heygen.create_job.duration', duration);
            logger.info('HeyGen video job created', 'HeyGen', { jobId, duration, sceneCount: payload.scenes?.length || 1 });
            return jobId;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics.incrementCounter('heygen.create_job.error');
            metrics.recordHistogram('heygen.create_job.error_duration', duration);
            logger.error('Failed to create HeyGen video job', 'HeyGen', { duration, heygenError: error?.response?.data }, error);
            if (error instanceof errors_1.AppError)
                throw error;
            if (axios_1.default.isAxiosError(error))
                throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.HEYGEN_API_ERROR);
            throw new errors_1.AppError(`HeyGen job creation failed: ${error.message || String(error)}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true);
        }
    }
    async getJobStatus(jobId) {
        try {
            const config = (0, config_validator_1.getConfig)();
            // v1/video_status.get is the correct endpoint for checking async generation status.
            // GET /v2/video/{id} is for accessing completed library videos and 404s on in-progress jobs.
            const response = await this.axios.get(`/v1/video_status.get?video_id=${jobId}`, { timeout: config.TIMEOUT_HEYGEN });
            const data = response.data?.data || response.data;
            // v1 can return 200 with an error code meaning "not found"
            if (response.data?.code && response.data.code !== 100) {
                throw new errors_1.AppError(`HeyGen job expired or not found: ${jobId}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 404, false);
            }
            return {
                jobId,
                status: this.normalizeStatus(data?.status),
                videoUrl: data?.video_url || data?.videoUrl || data?.url,
                error: data?.error || data?.error_message,
            };
        }
        catch (error) {
            if (error instanceof errors_1.AppError)
                throw error;
            logger.error('Failed to get HeyGen job status', 'HeyGen', { jobId, heygenError: error?.response?.data }, error);
            // 404 = job expired or never existed — permanent failure, never retry
            if (axios_1.default.isAxiosError(error) && error.response?.status === 404) {
                throw new errors_1.AppError(`HeyGen job expired or not found: ${jobId}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 404, false);
            }
            throw error;
        }
    }
    async pollJobForVideoUrl(jobId, opts) {
        const startTime = Date.now();
        const timeoutMs = opts?.timeoutMs ?? 20 * 60_000;
        const intervalMs = opts?.intervalMs ?? 15_000;
        const initialDelayMs = opts?.initialDelayMs ?? 0;
        // How long to keep retrying 404s before treating as permanent (0 = fail immediately on first 404)
        const notFoundGracePeriodMs = opts?.notFoundGracePeriodMs ?? 0;
        if (initialDelayMs > 0) {
            logger.info(`Waiting ${initialDelayMs}ms before first poll`, 'HeyGen', { jobId });
            await new Promise(resolve => setTimeout(resolve, initialDelayMs));
        }
        try {
            while (Date.now() - startTime < timeoutMs) {
                let result;
                try {
                    result = await this.getJobStatus(jobId);
                }
                catch (statusError) {
                    if (statusError instanceof errors_1.AppError && statusError.statusCode === 404) {
                        const elapsed = Date.now() - startTime;
                        if (elapsed < notFoundGracePeriodMs) {
                            // Still in grace period — job is likely still indexing on HeyGen's side
                            logger.info(`Job ${jobId} not found yet (${Math.round(elapsed / 1000)}s elapsed), retrying...`, 'HeyGen', { jobId, elapsed });
                            await new Promise(resolve => setTimeout(resolve, intervalMs));
                            continue;
                        }
                        // Grace period expired — treat as permanent failure
                        throw statusError;
                    }
                    // Transient error — wait and retry
                    await new Promise(resolve => setTimeout(resolve, intervalMs));
                    continue;
                }
                if (result.status === 'completed' && result.videoUrl)
                    return result.videoUrl;
                if (result.status === 'failed')
                    throw new errors_1.AppError(`HeyGen job failed: ${result.error}`, errors_1.ErrorCode.HEYGEN_API_ERROR);
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
            throw new errors_1.AppError(`HeyGen job timed out`, errors_1.ErrorCode.TIMEOUT_ERROR);
        }
        catch (error) {
            logger.error('Failed to poll HeyGen job', 'HeyGen', { jobId }, error);
            throw error;
        }
    }
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
async function createClientWithSecrets() {
    try {
        let apiKey = process.env.HEYGEN_API_KEY;
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
