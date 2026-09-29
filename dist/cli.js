"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settlePlatformResults = settlePlatformResults;
require("dotenv/config");
const secret_manager_1 = require("./secret-manager");
const secret_manager_2 = require("@google-cloud/secret-manager");
const core_1 = require("./core");
const instagram_1 = require("./instagram");
const twitter_1 = require("./twitter");
const pinterest_1 = require("./pinterest");
const youtube_1 = require("./youtube");
const facebook_1 = require("./facebook");
const config_validator_1 = require("./config-validator");
const did_1 = require("./did");
const did_adapter_1 = require("./did-adapter");
const openai_1 = require("./openai");
const sheets_1 = require("./sheets");
const health_server_1 = require("./health-server");
const audit_logger_1 = require("./audit-logger");
const config_validator_2 = require("./config-validator");
async function bootstrapSecrets() {
    console.log('🔐 Loading secrets from Google Secret Manager...');
    await (0, secret_manager_1.loadSecretsToEnv)();
    console.log('🔐 Secret load complete');
}
const auditLogger = (0, audit_logger_1.getAuditLogger)();
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function pickFirstNonEmpty(record, keys) {
    if (!record)
        return '';
    for (const key of keys) {
        const value = record[key];
        if (value !== undefined && value !== null && String(value).trim() !== '')
            return String(value).trim();
    }
    return '';
}
function getVideoState(record) {
    const rawMode = pickFirstNonEmpty(record, ['DID_MODE', 'Did_Mode', 'D_ID_MODE', 'video_mode']);
    const videoMode = rawMode === 'talks' || rawMode === 'clips' ? rawMode : undefined;
    return {
        videoId: pickFirstNonEmpty(record, ['Video_ID', 'DID_VIDEO_ID', 'D_ID_VIDEO_ID', 'video_id']),
        videoUrl: pickFirstNonEmpty(record, ['Video_URL', 'Video URL', 'video_url', 'VideoURL']),
        videoStatus: pickFirstNonEmpty(record, ['Video_Status', 'DID_VIDEO_STATUS', 'D_ID_VIDEO_STATUS', 'video_status']),
        videoMode,
    };
}
function extractSpreadsheetIdFromCsv(csvUrl) {
    const match = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match?.[1])
        return match[1];
    const idParam = csvUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (idParam?.[1])
        return idParam[1];
    throw new Error('Could not extract spreadsheet ID from CSV URL');
}
function extractGidFromCsv(csvUrl) {
    const match = csvUrl.match(/[?&]gid=([^&]+)/);
    return match?.[1];
}
function isRowDeferred(record) {
    const raw = pickFirstNonEmpty(record, ['Post_Next_Attempt_At']);
    if (!raw)
        return false;
    const when = Date.parse(raw);
    return Number.isFinite(when) && when > Date.now();
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isVideoUrlExpired(url) {
    const match = url.match(/[?&]Expires=(\d+)/);
    if (!match)
        return false;
    const expiresEpochSec = parseInt(match[1], 10);
    return Number.isFinite(expiresEpochSec) && Date.now() >= expiresEpochSec * 1000;
}
async function loadSecretToEnv(secretName) {
    if (process.env[secretName])
        return;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
        console.warn(`No GCP project ID found; skipping Secret Manager lookup for ${secretName}`);
        return;
    }
    try {
        const client = new secret_manager_2.SecretManagerServiceClient();
        const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
        const [version] = await client.accessSecretVersion({ name });
        const value = version.payload?.data?.toString();
        if (value) {
            process.env[secretName] = value;
            console.log(`Loaded secret: ${secretName}`);
        }
    }
    catch (error) {
        console.warn(`Could not load secret ${secretName}:`, error?.message || error);
    }
}
async function writeRowFields(sheetContext, headers, rowNumber, updates, dryRun = false) {
    if (dryRun) {
        console.log('DRY_RUN_LOG_ONLY=true — skipping Google Sheets writeback', { rowNumber, updates });
        return;
    }
    const { spreadsheetId, sheetGid } = sheetContext;
    await (0, sheets_1.writeRowFieldsBatch)({ spreadsheetId, sheetGid, headers, rowNumber, updates });
}
async function settlePlatformResults(tasks) {
    const results = await Promise.allSettled(tasks.map((task) => task()));
    return results.some((result) => result.status === 'fulfilled' && result.value === true);
}
async function postToEnabledPlatforms(params) {
    const { videoUrl, product, enabledPlatforms, dryRun } = params;
    const caption = String(product.caption || product.Caption || product.details || product.description || product.title || product.name || '').trim();
    const title = String(product.title || product.name || 'Nature\'s Way Soil').trim();
    const allPlatforms = ['instagram', 'twitter', 'pinterest', 'youtube', 'facebook'];
    const shouldPost = (platform) => enabledPlatforms.size === 0 || enabledPlatforms.has(platform);
    if (dryRun) {
        console.log('DRY_RUN_LOG_ONLY=true — skipping platform posting', { title, videoUrl, platforms: Array.from(enabledPlatforms) });
        return { anySucceeded: false };
    }
    const config = (0, config_validator_1.getConfig)();
    const tasks = [];
    if (shouldPost('instagram')) {
        if (config.INSTAGRAM_ACCESS_TOKEN && config.INSTAGRAM_USER_ID) {
            const accessToken = config.INSTAGRAM_ACCESS_TOKEN;
            const instagramUserId = config.INSTAGRAM_USER_ID;
            tasks.push(async () => {
                try {
                    await (0, instagram_1.postToInstagram)(videoUrl, caption, accessToken, instagramUserId);
                    return true;
                }
                catch (e) {
                    console.error('❌ Instagram post failed:', e?.message || e);
                    return false;
                }
            });
        }
        else
            console.log('⚠️ Instagram credentials not configured (INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID)');
    }
    if (shouldPost('twitter')) {
        if (config.TWITTER_BEARER_TOKEN || (config.TWITTER_API_KEY && config.TWITTER_API_SECRET && config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET)) {
            tasks.push(async () => {
                try {
                    await (0, twitter_1.postToTwitter)(videoUrl, caption || title, config.TWITTER_BEARER_TOKEN);
                    return true;
                }
                catch (e) {
                    console.error('❌ Twitter post failed:', e?.message || e);
                    return false;
                }
            });
        }
        else
            console.log('⚠️ Twitter credentials not configured');
    }
    if (shouldPost('pinterest')) {
        if (config.PINTEREST_ACCESS_TOKEN && config.PINTEREST_BOARD_ID) {
            const pinterestToken = config.PINTEREST_ACCESS_TOKEN;
            const pinterestBoardId = config.PINTEREST_BOARD_ID;
            tasks.push(async () => {
                try {
                    await (0, pinterest_1.postToPinterest)(videoUrl, caption, pinterestToken, pinterestBoardId);
                    return true;
                }
                catch (e) {
                    console.error('❌ Pinterest post failed:', e?.message || e);
                    return false;
                }
            });
        }
        else
            console.log('⚠️ Pinterest credentials not configured (PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID)');
    }
    if (shouldPost('youtube')) {
        if (config.YOUTUBE_CLIENT_ID && config.YOUTUBE_CLIENT_SECRET && config.YOUTUBE_REFRESH_TOKEN) {
            const youtubeClientId = config.YOUTUBE_CLIENT_ID;
            const youtubeClientSecret = config.YOUTUBE_CLIENT_SECRET;
            const youtubeRefreshToken = config.YOUTUBE_REFRESH_TOKEN;
            tasks.push(async () => {
                try {
                    await (0, youtube_1.postToYouTube)(videoUrl, caption, youtubeClientId, youtubeClientSecret, youtubeRefreshToken);
                    return true;
                }
                catch (e) {
                    console.error('❌ YouTube post failed:', e?.message || e);
                    return false;
                }
            });
        }
        else
            console.log('⚠️ YouTube credentials not configured (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)');
    }
    if (shouldPost('facebook')) {
        if (config.FACEBOOK_PAGE_ACCESS_TOKEN && config.FACEBOOK_PAGE_ID) {
            const facebookPageAccessToken = config.FACEBOOK_PAGE_ACCESS_TOKEN;
            const facebookPageId = config.FACEBOOK_PAGE_ID;
            tasks.push(async () => {
                try {
                    await (0, facebook_1.postToFacebook)(videoUrl, caption || title, facebookPageAccessToken, facebookPageId);
                    return true;
                }
                catch (e) {
                    console.error('❌ Facebook post failed:', e?.message || e);
                    return false;
                }
            });
        }
        else
            console.log('⚠️ Facebook credentials not configured (FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_PAGE_ID)');
    }
    const anySucceeded = await settlePlatformResults(tasks);
    const skipped = allPlatforms.filter((platform) => !shouldPost(platform));
    if (skipped.length > 0)
        console.log('Skipped disabled platforms:', skipped.join(', '));
    return { anySucceeded };
}
async function createOrPollVideo(params) {
    const { product, record, headers, rowNumber, sheetContext, alwaysGenerate, dryRun } = params;
    const videoState = getVideoState(record);
    if (dryRun) {
        const title = String(product.title || product.name || product.Title || 'dry-run-product');
        const generatedScript = await (0, openai_1.generateScript)(product);
        const dryVideoUrl = videoState.videoUrl && !isVideoUrlExpired(videoState.videoUrl) ? videoState.videoUrl : `https://example.com/dry-run/${encodeURIComponent(title)}.mp4`;
        console.log('DRY_RUN_LOG_ONLY=true — skipping D-ID refresh/generation', { rowNumber, product: title, existingVideoUrl: videoState.videoUrl || null, dryVideoUrl, scriptPreview: generatedScript.slice(0, 220) });
        return dryVideoUrl;
    }
    if (videoState.videoUrl && !alwaysGenerate) {
        if (!isVideoUrlExpired(videoState.videoUrl)) {
            console.log('✅ Using existing video:', videoState.videoUrl);
            return videoState.videoUrl;
        }
        console.log(`⚠️ Stored video URL has expired for row ${rowNumber} — attempting to refresh`);
        if (videoState.videoId) {
            try {
                const refreshClient = await (0, did_1.createClientWithSecrets)();
                const result = await refreshClient.getJobStatus(videoState.videoId, videoState.videoMode);
                if ((result.status.includes('done') || result.status.includes('complete')) && result.videoUrl && !isVideoUrlExpired(result.videoUrl)) {
                    console.log('✅ Refreshed video URL from D-ID API');
                    await writeRowFields(sheetContext, headers, rowNumber, { Video_URL: result.videoUrl, Video_Completed_At: new Date().toISOString(), DID_MODE: result.mode || videoState.videoMode || '' });
                    return result.videoUrl;
                }
            }
            catch (refreshError) {
                console.log(`⚠️ Could not refresh URL from D-ID: ${getErrorMessage(refreshError)}`);
            }
        }
        console.log(`📹 Regenerating video for row ${rowNumber} (URL expired, refresh unavailable)`);
        await writeRowFields(sheetContext, headers, rowNumber, { Video_URL: '', Video_ID: '', Video_Status: '' });
    }
    const didClient = await (0, did_1.createClientWithSecrets)();
    if (!alwaysGenerate && videoState.videoId && (videoState.videoStatus || '').toLowerCase() === 'processing') {
        console.log(`⏳ Existing D-ID job found for row ${rowNumber}: ${videoState.videoId}`);
        const videoUrl = await didClient.pollJobForVideoUrl(videoState.videoId, { timeoutMs: Number(process.env.DID_POLL_TIMEOUT_MS || 1500000), intervalMs: Number(process.env.DID_POLL_INTERVAL_MS || 15000), modeHint: videoState.videoMode });
        await writeRowFields(sheetContext, headers, rowNumber, { Video_URL: videoUrl, Video_Status: 'completed', Video_Completed_At: new Date().toISOString() });
        return videoUrl;
    }
    const mapping = (0, did_adapter_1.mapProductToDidPayload)(record);
    const generatedScript = await (0, openai_1.generateScript)(product);
    const createdJob = await didClient.createVideoJobWithMode({ ...mapping.payload, script: generatedScript });
    await writeRowFields(sheetContext, headers, rowNumber, { Video_ID: createdJob.jobId, Video_Status: 'processing', DID_MODE: createdJob.mode, DID_AVATAR: mapping.avatar, DID_VOICE: mapping.voice, DID_LENGTH_SECONDS: String(mapping.lengthSeconds), DID_MAPPING_REASON: mapping.reason, DID_MAPPED_AT: new Date().toISOString() });
    const videoUrl = await didClient.pollJobForVideoUrl(createdJob.jobId, { timeoutMs: Number(process.env.DID_POLL_TIMEOUT_MS || 1500000), intervalMs: Number(process.env.DID_POLL_INTERVAL_MS || 15000), modeHint: createdJob.mode });
    await writeRowFields(sheetContext, headers, rowNumber, { Video_URL: videoUrl, Video_Status: 'completed', Video_Completed_At: new Date().toISOString() });
    return videoUrl;
}
async function main() {
    await bootstrapSecrets();
    try {
        console.log('Validating configuration before starting polling...');
        await (0, config_validator_2.validateConfig)();
        console.log('Configuration validated');
    }
    catch (error) {
        console.error('❌ Configuration validation failed:', error);
        process.exit(1);
    }
    await loadSecretToEnv('GOOGLE_SHEET_CSV_URL');
    await loadSecretToEnv('CSV_URL');
    const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL;
    console.log('GOOGLE_SHEET_CSV_URL loaded:', !!process.env.GOOGLE_SHEET_CSV_URL);
    if (!csvUrl)
        throw new Error('CSV_URL / GOOGLE_SHEET_CSV_URL not set');
    const seen = new Set();
    const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? '60000');
    const runOnce = String(process.env.RUN_ONCE || '').toLowerCase() === 'true';
    const rowsPerRun = Number(process.env.ROWS_PER_RUN ?? '1');
    const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true';
    const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase();
    const enabledPlatforms = new Set(enabledPlatformsEnv.split(/[,^]/).map((s) => s.trim()).filter(Boolean));
    const loopResetPosted = String(process.env.LOOP_RESET_POSTED || 'false').toLowerCase() === 'true';
    const alwaysGenerate = String(process.env.ALWAYS_GENERATE_NEW_VIDEO || 'false').toLowerCase() === 'true';
    if (!process.env.VERCEL)
        (0, health_server_1.startHealthServer)();
    auditLogger.logEvent({ level: 'INFO', category: 'SYSTEM', message: 'Video posting system started', details: { runOnce, dryRun, enabledPlatforms: enabledPlatformsEnv || 'all', pollIntervalMs: intervalMs } });
    const cycle = async () => {
        (0, health_server_1.updateStatus)({ status: 'processing', rowsProcessed: 0 });
        const sheetContext = {
            spreadsheetId: extractSpreadsheetIdFromCsv(csvUrl),
            sheetGid: extractGidFromCsv(csvUrl),
        };
        const result = await (0, core_1.processCsvUrl)(csvUrl);
        if (result.skipped || result.rows.length === 0) {
            (0, health_server_1.updateStatus)({ status: 'idle', rowsProcessed: 0 });
            return;
        }
        let rowsThisCycle = 0;
        for (const { product, jobId, rowNumber, headers, record } of result.rows) {
            if (!jobId || seen.has(jobId))
                continue;
            if (isRowDeferred(record))
                continue;
            if (rowsThisCycle >= rowsPerRun)
                break;
            console.log(`\n========== Processing Row ${rowNumber} ==========`);
            console.log('Product:', product?.title || product?.name || jobId);
            try {
                const videoUrl = await createOrPollVideo({ product, record, headers, rowNumber, sheetContext, alwaysGenerate, dryRun });
                const { anySucceeded } = await postToEnabledPlatforms({ videoUrl, product, enabledPlatforms, dryRun });
                if (!anySucceeded && !dryRun)
                    throw new Error('No enabled platform post succeeded for this row');
                if (anySucceeded) {
                    await (0, sheets_1.markRowPosted)({ spreadsheetId: sheetContext.spreadsheetId, sheetGid: sheetContext.sheetGid, rowNumber, headers });
                }
                else if (dryRun) {
                    console.log('DRY_RUN_LOG_ONLY=true — skipping Posted writeback', { rowNumber });
                }
                else {
                    console.warn(`⚠️ Row ${rowNumber}: no platforms succeeded, skipping writeback`);
                }
                seen.add(jobId);
                rowsThisCycle++;
                (0, health_server_1.incrementSuccessfulPost)();
                (0, health_server_1.updateStatus)({ status: 'processed-row', rowsProcessed: rowsThisCycle });
            }
            catch (error) {
                seen.add(jobId);
                rowsThisCycle++;
                (0, health_server_1.incrementFailedPost)();
                (0, health_server_1.addError)(error?.message || String(error));
                auditLogger.logEvent({ level: 'ERROR', category: 'POSTING', message: 'Failed to process row', rowNumber, product: product?.title || product?.name, details: { error: error?.message || String(error) } });
                await writeRowFields(sheetContext, headers, rowNumber, { Video_Status: 'failed', Last_Error: error?.message || String(error), Last_Error_At: new Date().toISOString() }, dryRun);
            }
        }
        if (loopResetPosted && rowsThisCycle === 0 && !dryRun) {
            await (0, sheets_1.resetPostedColumn)({ spreadsheetId: sheetContext.spreadsheetId, sheetGid: sheetContext.sheetGid, totalRows: result.rows.length, headers: result.rows[0]?.headers || [] });
            seen.clear();
        }
        else if (loopResetPosted && dryRun)
            console.log('DRY_RUN_LOG_ONLY=true — skipping loop reset writeback');
        (0, health_server_1.updateStatus)({ status: 'idle', rowsProcessed: rowsThisCycle });
    };
    do {
        await cycle();
        if (!runOnce)
            await sleep(intervalMs);
    } while (!runOnce);
}
if (require.main === module) {
    process.on('SIGINT', async () => { (0, health_server_1.stopHealthServer)(); process.exit(0); });
    main().catch((error) => { console.error('Fatal error:', error); (0, health_server_1.addError)(error?.message || String(error)); (0, health_server_1.stopHealthServer)(); process.exit(1); });
}
