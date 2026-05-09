"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const secret_manager_1 = require("./secret-manager");
const secret_manager_2 = require("@google-cloud/secret-manager");
const core_1 = require("./core");
const instagram_1 = require("./instagram");
const twitter_1 = require("./twitter");
const pinterest_1 = require("./pinterest");
const youtube_1 = require("./youtube");
const config_validator_1 = require("./config-validator");
const heygen_1 = require("./heygen");
const heygen_adapter_1 = require("./heygen-adapter");
const openai_1 = require("./openai");
const sheets_1 = require("./sheets");
const health_server_1 = require("./health-server");
const audit_logger_1 = require("./audit-logger");
const config_validator_2 = require("./config-validator");
// 🔐 NEW: Load ALL secrets at startup (once)
async function bootstrapSecrets() {
    console.log('🔐 Loading secrets from Google Secret Manager...');
    await (0, secret_manager_1.loadSecretsToEnv)();
    console.log('🔐 Secret load complete');
}
const auditLogger = (0, audit_logger_1.getAuditLogger)();
function pickFirstNonEmpty(record, keys) {
    if (!record)
        return '';
    for (const key of keys) {
        const value = record[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }
    return '';
}
function getVideoState(record) {
    return {
        videoId: pickFirstNonEmpty(record, ['Video_ID', 'HEYGEN_VIDEO_ID', 'HeyGen_Video_ID', 'video_id']),
        videoUrl: pickFirstNonEmpty(record, ['Video_URL', 'Video URL', 'video_url', 'VideoURL']),
        videoStatus: pickFirstNonEmpty(record, ['Video_Status', 'HEYGEN_VIDEO_STATUS', 'video_status']),
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
function getValueFromRecord(record, keysCsv) {
    const keys = keysCsv.split(',').map((key) => key.trim()).filter(Boolean);
    return pickFirstNonEmpty(record, keys);
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
async function writeRowFields(csvUrl, headers, rowNumber, updates) {
    const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl);
    const sheetGid = extractGidFromCsv(csvUrl);
    for (const [columnName, value] of Object.entries(updates)) {
        await (0, sheets_1.writeColumnValues)({
            spreadsheetId,
            sheetGid,
            headers,
            columnName,
            rows: [{ rowNumber, value }],
        });
    }
}
async function resolveVideoUrlAsync(params) {
    const directUrl = pickFirstNonEmpty(params.record, [
        'Video_URL',
        'Video URL',
        'video_url',
        'VideoURL',
        'WAVESPEED_VIDEO_URL',
        'WaveSpeed Video URL',
    ]);
    return directUrl;
}
async function postToEnabledPlatforms(params) {
    const { videoUrl, product, enabledPlatforms, dryRun } = params;
    const caption = String(product.caption || product.Caption || product.details || product.description || product.title || product.name || '').trim();
    const title = String(product.title || product.name || 'Nature\'s Way Soil').trim();
    const allPlatforms = ['instagram', 'twitter', 'pinterest', 'youtube'];
    const shouldPost = (platform) => enabledPlatforms.size === 0 || enabledPlatforms.has(platform);
    if (dryRun) {
        console.log('DRY_RUN_LOG_ONLY=true — skipping platform posting', { title, videoUrl });
        return { anySucceeded: false };
    }
    const config = (0, config_validator_1.getConfig)();
    let anySucceeded = false;
    if (shouldPost('instagram')) {
        if (config.INSTAGRAM_ACCESS_TOKEN && config.INSTAGRAM_USER_ID) {
            try {
                await (0, instagram_1.postToInstagram)(videoUrl, caption, config.INSTAGRAM_ACCESS_TOKEN, config.INSTAGRAM_USER_ID);
                anySucceeded = true;
            }
            catch (e) {
                console.error('❌ Instagram post failed:', e?.message || e);
            }
        }
        else {
            console.log('⚠️ Instagram credentials not configured (INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID)');
        }
    }
    if (shouldPost('twitter')) {
        if (config.TWITTER_BEARER_TOKEN) {
            try {
                await (0, twitter_1.postToTwitter)(videoUrl, caption || title, config.TWITTER_BEARER_TOKEN);
                anySucceeded = true;
            }
            catch (e) {
                console.error('❌ Twitter post failed:', e?.message || e);
            }
        }
        else {
            console.log('⚠️ Twitter credentials not configured (TWITTER_BEARER_TOKEN)');
        }
    }
    if (shouldPost('pinterest')) {
        if (config.PINTEREST_ACCESS_TOKEN && config.PINTEREST_BOARD_ID) {
            try {
                await (0, pinterest_1.postToPinterest)(videoUrl, caption, config.PINTEREST_ACCESS_TOKEN, config.PINTEREST_BOARD_ID);
                anySucceeded = true;
            }
            catch (e) {
                console.error('❌ Pinterest post failed:', e?.message || e);
            }
        }
        else {
            console.log('⚠️ Pinterest credentials not configured (PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID)');
        }
    }
    if (shouldPost('youtube')) {
        if (config.YOUTUBE_CLIENT_ID && config.YOUTUBE_CLIENT_SECRET && config.YOUTUBE_REFRESH_TOKEN) {
            try {
                await (0, youtube_1.postToYouTube)(videoUrl, caption, config.YOUTUBE_CLIENT_ID, config.YOUTUBE_CLIENT_SECRET, config.YOUTUBE_REFRESH_TOKEN);
                anySucceeded = true;
            }
            catch (e) {
                console.error('❌ YouTube post failed:', e?.message || e);
            }
        }
        else {
            console.log('⚠️ YouTube credentials not configured (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)');
        }
    }
    const skipped = allPlatforms.filter((platform) => !shouldPost(platform));
    if (skipped.length > 0)
        console.log('Skipped disabled platforms:', skipped.join(', '));
    return { anySucceeded };
}
async function createOrPollVideo(params) {
    const { product, record, headers, rowNumber, csvUrl, alwaysGenerate } = params;
    const videoState = getVideoState(record);
    if (videoState.videoUrl && !alwaysGenerate) {
        console.log('✅ Using existing video:', videoState.videoUrl);
        return videoState.videoUrl;
    }
    const heygenClient = await (0, heygen_1.createClientWithSecrets)();
    if (!alwaysGenerate && videoState.videoId && (videoState.videoStatus || '').toLowerCase() === 'processing') {
        console.log(`⏳ Existing HeyGen job found for row ${rowNumber}: ${videoState.videoId}`);
        console.log('Polling HeyGen job');
        try {
            const videoUrl = await heygenClient.pollJobForVideoUrl(videoState.videoId, {
                timeoutMs: Number(process.env.HEYGEN_POLL_TIMEOUT_MS || 1500000),
                intervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 15000),
                notFoundGracePeriodMs: 0, // existing stale job: fail immediately on 404
            });
            await writeRowFields(csvUrl, headers, rowNumber, {
                Video_URL: videoUrl,
                Video_Status: 'completed',
                Video_Completed_At: new Date().toISOString(),
            });
            return videoUrl;
        }
        catch (pollError) {
            // 404 = HeyGen job expired or never existed. Clear stale IDs and re-request a fresh video.
            if (pollError?.statusCode === 404) {
                console.log(`⚠️ HeyGen job ${videoState.videoId} is expired — clearing stale IDs and re-requesting`);
                await writeRowFields(csvUrl, headers, rowNumber, {
                    Video_ID: '',
                    Video_Status: '',
                    Video_URL: '',
                    Error_Message: `Job ${videoState.videoId} expired — re-requested at ${new Date().toISOString()}`,
                });
                // fall through to create a new job below
            }
            else {
                throw pollError;
            }
        }
    }
    const mapping = (0, heygen_adapter_1.mapProductToHeyGenPayload)(record);
    const generatedScript = await (0, openai_1.generateScript)(product);
    const payload = {
        ...mapping.payload,
        script: generatedScript,
    };
    const videoId = await heygenClient.createVideoJob(payload);
    await writeRowFields(csvUrl, headers, rowNumber, {
        Video_ID: videoId,
        Video_Status: 'processing',
        HEYGEN_AVATAR: mapping.avatar,
        HEYGEN_VOICE: mapping.voice,
        HEYGEN_LENGTH_SECONDS: String(mapping.lengthSeconds),
        HEYGEN_MAPPING_REASON: mapping.reason,
        HEYGEN_MAPPED_AT: new Date().toISOString(),
    });
    const videoUrl = await heygenClient.pollJobForVideoUrl(videoId, {
        timeoutMs: Number(process.env.HEYGEN_POLL_TIMEOUT_MS || 1500000),
        intervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 15000),
        initialDelayMs: 30000, // give HeyGen 30s to index before first poll
        notFoundGracePeriodMs: 600000, // retry 404 for up to 10 minutes (video still processing)
    });
    await writeRowFields(csvUrl, headers, rowNumber, {
        Video_URL: videoUrl,
        Video_Status: 'completed',
        Video_Completed_At: new Date().toISOString(),
    });
    return videoUrl;
}
async function main() {
    // 🔐 ensure secrets are loaded before anything else
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
    // Backward compatibility: still attempt specific loads if missing
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
    // Support both comma and caret as separators (gcloud env var escaping can produce either)
    const enabledPlatforms = new Set(enabledPlatformsEnv.split(/[,^]/).map((s) => s.trim()).filter(Boolean));
    const loopResetPosted = String(process.env.LOOP_RESET_POSTED || 'false').toLowerCase() === 'true';
    const alwaysGenerate = String(process.env.ALWAYS_GENERATE_NEW_VIDEO || 'false').toLowerCase() === 'true';
    if (!process.env.VERCEL)
        (0, health_server_1.startHealthServer)();
    auditLogger.logEvent({
        level: 'INFO',
        category: 'SYSTEM',
        message: 'Video posting system started',
        details: { runOnce, dryRun, enabledPlatforms: enabledPlatformsEnv || 'all', pollIntervalMs: intervalMs },
    });
    const cycle = async () => {
        (0, health_server_1.updateStatus)({ status: 'processing', rowsProcessed: 0 });
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
                const videoUrl = await createOrPollVideo({ product, record, headers, rowNumber, csvUrl, alwaysGenerate });
                const { anySucceeded } = await postToEnabledPlatforms({ videoUrl, product, enabledPlatforms, dryRun });
                if (!anySucceeded && !dryRun) {
                    throw new Error('No enabled platform post succeeded for this row');
                }
                if (anySucceeded || dryRun) {
                    const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl);
                    const sheetGid = extractGidFromCsv(csvUrl);
                    await (0, sheets_1.markRowPosted)({ spreadsheetId, sheetGid, rowNumber, headers });
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
                rowsThisCycle++; // count failed rows so ROWS_PER_RUN=1 truly means one attempt per run
                (0, health_server_1.incrementFailedPost)();
                (0, health_server_1.addError)(error?.message || String(error));
                auditLogger.logEvent({
                    level: 'ERROR',
                    category: 'POSTING',
                    message: 'Failed to process row',
                    rowNumber,
                    product: product?.title || product?.name,
                    details: { error: error?.message || String(error) },
                });
                await writeRowFields(csvUrl, headers, rowNumber, {
                    Video_Status: 'failed',
                    Last_Error: error?.message || String(error),
                    Last_Error_At: new Date().toISOString(),
                });
            }
        }
        if (loopResetPosted && rowsThisCycle === 0) {
            const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl);
            const sheetGid = extractGidFromCsv(csvUrl);
            await (0, sheets_1.resetPostedColumn)({
                spreadsheetId,
                sheetGid,
                totalRows: result.rows.length,
                headers: result.rows[0]?.headers || [],
            });
            seen.clear();
        }
        (0, health_server_1.updateStatus)({ status: 'idle', rowsProcessed: rowsThisCycle });
    };
    do {
        await cycle();
        if (!runOnce)
            await sleep(intervalMs);
    } while (!runOnce);
}
process.on('SIGINT', async () => {
    (0, health_server_1.stopHealthServer)();
    process.exit(0);
});
main().catch((error) => {
    console.error('Fatal error:', error);
    (0, health_server_1.addError)(error?.message || String(error));
    (0, health_server_1.stopHealthServer)();
    process.exit(1);
});
