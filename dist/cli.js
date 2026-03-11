"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("./core");
const instagram_1 = require("./instagram");
const twitter_1 = require("./twitter");
const pinterest_1 = require("./pinterest");
const youtube_1 = require("./youtube");
const heygen_1 = require("./heygen");
const heygen_adapter_1 = require("./heygen-adapter");
const openai_1 = require("./openai");
const sheets_1 = require("./sheets");
const health_server_1 = require("./health-server");
const audit_logger_1 = require("./audit-logger");
const google_auth_1 = require("./google-auth");
const config_validator_1 = require("./config-validator");
const auditLogger = (0, audit_logger_1.getAuditLogger)();
// Retry helper with exponential backoff
async function retryWithBackoff(fn, options = {}) {
    const { maxRetries = 3, initialDelayMs = 1000, maxDelayMs = 16000, operation = 'Operation' } = options;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            const isLastAttempt = attempt === maxRetries;
            const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
            console.error(`❌ ${operation} attempt ${attempt}/${maxRetries} failed:`, {
                error: error?.message || String(error),
                willRetry: !isLastAttempt,
                nextRetryIn: isLastAttempt ? null : `${delay}ms`
            });
            if (isLastAttempt) {
                return null;
            }
            await sleep(delay);
        }
    }
    return null;
}
async function main() {
    // 1. RUN VALIDATION FIRST - validate configuration before any processing
    try {
        console.log('Validating configuration before starting polling...');
        const config = await (0, config_validator_1.validateConfig)();
        console.log('Configuration validated');
    }
    catch (error) {
        console.error('❌ Configuration validation failed:', error);
        process.exit(1);
    }
    const csvUrl = process.env.CSV_URL;
    if (!csvUrl)
        throw new Error('CSV_URL not set in .env');
    const seen = new Set();
    const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? '60000');
    const runOnce = String(process.env.RUN_ONCE || '').toLowerCase() === 'true';
    // ROWS_PER_RUN: how many unposted rows to process per cycle (default 1 to prevent duplicates on cold starts)
    const rowsPerRun = Number(process.env.ROWS_PER_RUN ?? '1');
    const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true';
    const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase();
    const enabledPlatforms = new Set(enabledPlatformsEnv.split(',').map(s => s.trim()).filter(Boolean));
    const enforcePostingWindows = String(process.env.ENFORCE_POSTING_WINDOWS || 'false').toLowerCase() === 'true';
    const targetColumnLetter = (process.env.SHEET_VIDEO_TARGET_COLUMN_LETTER || 'AB').toUpperCase();
    // Skip health server in Vercel serverless environment (no persistent ports)
    if (!process.env.VERCEL) {
        (0, health_server_1.startHealthServer)();
    }
    // Log initial configuration
    (0, audit_logger_1.getAuditLogger)().logEvent({
        level: 'INFO',
        category: 'SYSTEM',
        message: 'Video posting system started',
        details: {
            runOnce,
            dryRun,
            enforcePostingWindows,
            enabledPlatforms: enabledPlatformsEnv || 'all',
            pollIntervalMs: intervalMs
        }
    });
    if (dryRun) {
        (0, audit_logger_1.getAuditLogger)().logEvent({
            level: 'WARN',
            category: 'SYSTEM',
            message: 'DRY RUN MODE ENABLED - No actual posts will be sent',
        });
    }
    if (enforcePostingWindows) {
        (0, audit_logger_1.getAuditLogger)().logEvent({
            level: 'WARN',
            category: 'SYSTEM',
            message: 'Posting windows enforced - will only post at 9AM/5PM ET',
        });
    }
    const cycle = async () => {
        try {
            (0, health_server_1.updateStatus)({ status: 'processing', rowsProcessed: 0 });
            const result = await (0, core_1.processCsvUrl)(csvUrl);
            if (!result.skipped && result.rows.length > 0) {
                (0, health_server_1.updateStatus)({ status: 'processing-rows', rowsProcessed: 0 });
                let rowsThisCycle = 0;
                for (const { product, jobId, rowNumber, headers, record } of result.rows) {
                    if (!jobId || seen.has(jobId))
                        continue;
                    if (rowsThisCycle >= rowsPerRun) {
                        console.log(`⏸️  ROWS_PER_RUN limit (${rowsPerRun}) reached — remaining rows deferred to next cycle`);
                        break;
                    }
                    console.log(`\n========== Processing Row ${rowNumber} ==========`);
                    console.log('Product:', product);
                    // Step 1: Try to get existing video URL
                    let videoUrl = await resolveVideoUrlAsync({ jobId, record });
                    // Prefer ASIN from the sheet for identification
                    const asin = getValueFromRecord(record, process.env.CSV_COL_ASIN || 'ASIN,Parent_ASIN,SKU,Product_ID') || jobId;
                    // Step 2: If no video exists or ALWAYS_GENERATE_NEW_VIDEO is set, create one with HeyGen
                    const alwaysGenerate = String(process.env.ALWAYS_GENERATE_NEW_VIDEO || 'false').toLowerCase() === 'true';
                    if (!videoUrl || alwaysGenerate || !(await urlLooksReachable(videoUrl))) {
                        console.log('No existing video found. Creating new video with HeyGen...');
                        // 2a: Generate marketing script with OpenAI
                        let script;
                        if (process.env.OPENAI_API_KEY) {
                            try {
                                script = await (0, openai_1.generateScript)(product);
                                console.log('✅ Generated script with OpenAI:', script.substring(0, 100) + '...');
                            }
                            catch (e) {
                                console.error('❌ OpenAI script generation failed:', e?.message || e);
                            }
                        }
                        else {
                            console.log('⚠️  OPENAI_API_KEY not set, using product description as script');
                            script = (product?.details ?? product?.title ?? product?.name ?? '').toString();
                        }
                        // 2b: Create video with HeyGen
                        if (script) {
                            const hasHeyGenCreds = process.env.HEYGEN_API_KEY || process.env.GCP_SECRET_HEYGEN_API_KEY;
                            if (!hasHeyGenCreds) {
                                console.error('❌ HeyGen credentials not configured. Set HEYGEN_API_KEY or GCP_SECRET_HEYGEN_API_KEY');
                                console.warn('⏭️  Skipping row - cannot generate video without HeyGen credentials');
                                continue;
                            }
                            try {
                                console.log('🎬 Creating video with HeyGen...');
                                const heygenClient = await (0, heygen_1.createClientWithSecrets)();
                                // Map product to HeyGen payload with avatar/voice selection
                                const mapping = (0, heygen_adapter_1.mapProductToHeyGenPayload)(record);
                                const payload = {
                                    ...mapping.payload,
                                    script,
                                    title: `${product?.title || product?.name || 'Product Video'} (${asin})`,
                                    meta: { asin, jobId }
                                };
                                console.log('📝 HeyGen mapping:', {
                                    avatar: mapping.avatar,
                                    voice: mapping.voice,
                                    lengthSeconds: mapping.lengthSeconds,
                                    reason: mapping.reason
                                });
                                // Create video job
                                const heygenJobId = await heygenClient.createVideoJob(payload);
                                console.log('✅ Created HeyGen video job:', heygenJobId);
                                // Write HeyGen mapping info back to sheet (optional)
                                if ((0, google_auth_1.hasConfiguredGoogleCredentials)()) {
                                    try {
                                        const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl);
                                        const sheetGid = extractGidFromCsv(csvUrl);
                                        const { writeBackMappingsToSheet } = await Promise.resolve().then(() => __importStar(require('./heygen-adapter')));
                                        await writeBackMappingsToSheet(spreadsheetId, String(sheetGid || 0), [{
                                                HEYGEN_AVATAR: mapping.avatar,
                                                HEYGEN_VOICE: mapping.voice,
                                                HEYGEN_LENGTH_SECONDS: String(mapping.lengthSeconds),
                                                HEYGEN_MAPPING_REASON: mapping.reason,
                                                HEYGEN_MAPPED_AT: new Date().toISOString()
                                            }]);
                                        console.log('✅ Wrote HeyGen mapping to sheet');
                                    }
                                    catch (e) {
                                        console.error('⚠️  Failed to write HeyGen mapping to sheet:', e?.message || e);
                                    }
                                }
                                // Poll for video completion
                                console.log('⏳ Waiting for HeyGen video completion...');
                                videoUrl = await heygenClient.pollJobForVideoUrl(heygenJobId, {
                                    timeoutMs: 25 * 60_000, // 25 minutes
                                    intervalMs: 15_000 // Check every 15 seconds
                                });
                                console.log('✅ HeyGen video ready:', videoUrl);
                            }
                            catch (e) {
                                console.error('❌ HeyGen video generation failed:', e?.message || e);
                                console.warn('⏭️  Skipping row - video generation failed');
                                (0, health_server_1.addError)(`HeyGen: ${product?.title || jobId} - ${e?.message || String(e)}`);
                                continue;
                            }
                        }
                        else {
                            console.error('❌ No script available for video generation');
                            console.warn('⏭️  Skipping row - cannot generate video without script');
                            continue;
                        }
                        // 2c: Write video URL back to sheet (prefer fixed column letter if configured)
                        if (videoUrl && (0, google_auth_1.hasConfiguredGoogleCredentials)()) {
                            try {
                                const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl);
                                const sheetGid = extractGidFromCsv(csvUrl);
                                if (targetColumnLetter) {
                                    const { writeColumnLetterValues } = await Promise.resolve().then(() => __importStar(require('./sheets')));
                                    await writeColumnLetterValues({
                                        spreadsheetId,
                                        sheetGid,
                                        columnLetter: targetColumnLetter,
                                        rows: [{ rowNumber, value: videoUrl }]
                                    });
                                }
                                else {
                                    await (0, sheets_1.writeColumnValues)({
                                        spreadsheetId,
                                        sheetGid,
                                        headers,
                                        columnName: process.env.CSV_COL_VIDEO_URL || 'Video URL',
                                        rows: [{ rowNumber, value: videoUrl }],
                                    });
                                }
                                console.log('✅ Wrote video URL to sheet');
                            }
                            catch (e) {
                                console.error('⚠️  Failed to write video URL to sheet:', e?.message || e);
                            }
                        }
                    }
                    else {
                        console.log('✅ Using existing video:', videoUrl);
                    }
                    // Step 3: If we still don't have a video, skip this row
                    if (!videoUrl) {
                        console.warn(`❌ No video URL available for row ${rowNumber}; skipping`);
                        continue;
                    }
                    // Step 3.5: Validate video URL is actually reachable before posting
                    console.log('🔍 Validating video URL accessibility...');
                    const isReachable = alwaysGenerate || await urlLooksReachable(videoUrl);
                    if (!isReachable) {
                        console.error(`❌ Video URL not reachable for row ${rowNumber}:`, {
                            url: videoUrl,
                            product: product?.title || product?.name,
                            jobId
                        });
                        console.warn('⏭️  Skipping posting to platforms - video not accessible');
                        continue;
                    }
                    console.log('✅ Video URL validated successfully');
                    // Step 3.6: Re-host video via Cloudinary so Instagram/Pinterest can fetch it reliably
                    if (process.env.CLOUDINARY_API_KEY) {
                        try {
                            const { uploadVideoToCloudinary } = await Promise.resolve().then(() => __importStar(require('./cloudinary-upload')));
                            const cloudUrl = await uploadVideoToCloudinary(videoUrl);
                            videoUrl = cloudUrl;
                        }
                        catch (err) {
                            console.warn('⚠️  Cloudinary upload failed, falling back to original URL:', err.message);
                        }
                    }
                    const caption = (product?.details ?? product?.title ?? product?.name ?? '').toString();
                    // Respect posting windows: 9:00 AM and 5:00 PM Eastern
                    const canPostNow = !enforcePostingWindows || isWithinPostingWindow();
                    if (!canPostNow) {
                        console.log('🕘 Outside posting window (9AM/5PM ET). Will not post, but video URL is ready:', videoUrl);
                        (0, audit_logger_1.getAuditLogger)().logEvent({
                            level: 'SKIP',
                            category: 'POSTING',
                            message: 'Outside posting window',
                            rowNumber,
                            product: product?.title || product?.name,
                            details: { enforcePostingWindows, videoUrl }
                        });
                    }
                    let postedAtLeastOne = false;
                    const platformResults = {};
                    // Check if any platforms are enabled
                    const platformStatus = checkPlatformAvailability(enabledPlatforms);
                    if (!platformStatus.anyEnabled && !dryRun) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({
                            level: 'ERROR',
                            category: 'PLATFORM',
                            message: 'No platforms enabled with valid credentials',
                            rowNumber,
                            product: product?.title || product?.name,
                            details: {
                                ...platformStatus.credentials,
                                enabledPlatforms: Array.from(enabledPlatforms)
                            }
                        });
                    }
                    else if (!dryRun && canPostNow) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({
                            level: 'INFO',
                            category: 'PLATFORM',
                            message: 'Platforms ready for posting',
                            rowNumber,
                            details: platformStatus.enabled
                        });
                    }
                    // Instagram
                    if (dryRun || !canPostNow) {
                        console.log('[DRY RUN] Would post to Instagram:', { videoUrl, caption });
                        platformResults.instagram = { success: true, result: 'DRY_RUN' };
                    }
                    else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('instagram')) && process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({
                            level: 'INFO',
                            category: 'POSTING',
                            message: 'Attempting Instagram post',
                            rowNumber,
                            product: product?.title || product?.name
                        });
                        const result = await retryWithBackoff(() => (0, instagram_1.postToInstagram)(videoUrl, caption, process.env.INSTAGRAM_ACCESS_TOKEN, process.env.INSTAGRAM_IG_ID), {
                            maxRetries: 3,
                            operation: 'Instagram post',
                            initialDelayMs: 2000
                        });
                        if (result) {
                            console.log('✅ Posted to Instagram:', result);
                            platformResults.instagram = { success: true, result };
                            postedAtLeastOne = true;
                            (0, health_server_1.incrementSuccessfulPost)();
                            (0, audit_logger_1.getAuditLogger)().logEvent({
                                level: 'SUCCESS',
                                category: 'POSTING',
                                message: 'Instagram post successful',
                                rowNumber,
                                product: product?.title || product?.name,
                                details: { mediaId: result }
                            });
                        }
                        else {
                            console.error('❌ Instagram post failed after all retries');
                            platformResults.instagram = { success: false, error: 'Failed after 3 retries' };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`Instagram: ${product?.title || jobId} - Failed after 3 retries`);
                            (0, audit_logger_1.getAuditLogger)().logEvent({
                                level: 'ERROR',
                                category: 'POSTING',
                                message: 'Instagram post failed',
                                rowNumber,
                                product: product?.title || product?.name,
                                details: { error: 'Failed after 3 retries' }
                            });
                        }
                    }
                    // Twitter
                    if (dryRun || !canPostNow) {
                        console.log('[DRY RUN] Would post to Twitter:', { videoUrl, caption });
                        platformResults.twitter = { success: true, result: 'DRY_RUN' };
                    }
                    else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('twitter')) && (process.env.TWITTER_BEARER_TOKEN || hasTwitterUploadCreds())) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({
                            level: 'INFO',
                            category: 'POSTING',
                            message: 'Attempting Twitter post',
                            rowNumber,
                            product: product?.title || product?.name
                        });
                        const result = await retryWithBackoff(async () => {
                            if (hasTwitterUploadCreds()) {
                                return await (0, twitter_1.postToTwitter)(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN ?? '');
                            }
                            else if (process.env.TWITTER_BEARER_TOKEN) {
                                return await (0, twitter_1.postToTwitter)(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN);
                            }
                            return null;
                        }, {
                            maxRetries: 3,
                            operation: 'Twitter post',
                            initialDelayMs: 2000
                        });
                        if (result) {
                            console.log('✅ Posted to Twitter:', result);
                            platformResults.twitter = { success: true, result };
                            postedAtLeastOne = true;
                            (0, health_server_1.incrementSuccessfulPost)();
                            (0, audit_logger_1.getAuditLogger)().logEvent({
                                level: 'SUCCESS',
                                category: 'POSTING',
                                message: 'Twitter post successful',
                                rowNumber,
                                product: product?.title || product?.name
                            });
                        }
                        else {
                            console.error('❌ Twitter post failed after all retries');
                            platformResults.twitter = { success: false, error: 'Failed after 3 retries' };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`Twitter: ${product?.title || jobId} - Failed after 3 retries`);
                            (0, audit_logger_1.getAuditLogger)().logEvent({
                                level: 'ERROR',
                                category: 'POSTING',
                                message: 'Twitter post failed',
                                rowNumber,
                                product: product?.title || product?.name,
                                details: { error: 'Failed after 3 retries' }
                            });
                        }
                    }
                    // Pinterest
                    if (dryRun || !canPostNow) {
                        console.log('[DRY RUN] Would post to Pinterest:', { videoUrl, caption });
                        platformResults.pinterest = { success: true, result: 'DRY_RUN' };
                    }
                    else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('pinterest')) && process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({
                            level: 'INFO',
                            category: 'POSTING',
                            message: 'Attempting Pinterest post',
                            rowNumber,
                            product: product?.title || product?.name
                        });
                        const result = await retryWithBackoff(() => (0, pinterest_1.postToPinterest)(videoUrl, caption, process.env.PINTEREST_ACCESS_TOKEN, process.env.PINTEREST_BOARD_ID), {
                            maxRetries: 3,
                            operation: 'Pinterest post',
                            initialDelayMs: 2000
                        });
                        if (result) {
                            console.log('✅ Posted to Pinterest:', result);
                            platformResults.pinterest = { success: true, result };
                            postedAtLeastOne = true;
                            (0, health_server_1.incrementSuccessfulPost)();
                            (0, audit_logger_1.getAuditLogger)().logEvent({
                                level: 'SUCCESS',
                                category: 'POSTING',
                                message: 'Pinterest post successful',
                                rowNumber,
                                product: product?.title || product?.name
                            });
                        }
                        else {
                            console.error('❌ Pinterest post failed after all retries');
                            platformResults.pinterest = { success: false, error: 'Failed after 3 retries' };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`Pinterest: ${product?.title || jobId} - Failed after 3 retries`);
                            (0, audit_logger_1.getAuditLogger)().logEvent({
                                level: 'ERROR',
                                category: 'POSTING',
                                message: 'Pinterest post failed',
                                rowNumber,
                                product: product?.title || product?.name,
                                details: { error: 'Failed after 3 retries' }
                            });
                        }
                    }
                    // YouTube
                    if (dryRun || !canPostNow) {
                        console.log('[DRY RUN] Would upload to YouTube:', { videoUrl, caption });
                        platformResults.youtube = { success: true, result: 'DRY_RUN' };
                    }
                    else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('youtube')) && process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({
                            level: 'INFO',
                            category: 'POSTING',
                            message: 'Attempting YouTube upload',
                            rowNumber,
                            product: product?.title || product?.name
                        });
                        const result = await retryWithBackoff(() => (0, youtube_1.postToYouTube)(videoUrl, caption, process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET, process.env.YT_REFRESH_TOKEN, process.env.YT_PRIVACY_STATUS || 'unlisted'), {
                            maxRetries: 2, // YouTube uploads are longer, fewer retries
                            operation: 'YouTube upload',
                            initialDelayMs: 5000
                        });
                        if (result) {
                            console.log('✅ Posted to YouTube:', result);
                            platformResults.youtube = { success: true, result };
                            postedAtLeastOne = true;
                            (0, health_server_1.incrementSuccessfulPost)();
                            (0, audit_logger_1.getAuditLogger)().logEvent({
                                level: 'SUCCESS',
                                category: 'POSTING',
                                message: 'YouTube upload successful',
                                rowNumber,
                                product: product?.title || product?.name
                            });
                        }
                        else {
                            console.error('❌ YouTube upload failed after all retries');
                            platformResults.youtube = { success: false, error: 'Failed after 2 retries' };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`YouTube: ${product?.title || jobId} - Failed after 2 retries`);
                            (0, audit_logger_1.getAuditLogger)().logEvent({
                                level: 'ERROR',
                                category: 'POSTING',
                                message: 'YouTube upload failed',
                                rowNumber,
                                product: product?.title || product?.name,
                                details: { error: 'Failed after 2 retries' }
                            });
                        }
                    }
                    // Blog Posting
                    if (dryRun) {
                        console.log('[DRY RUN] Would create blog article:', {
                            productTitle: product?.title || product?.name,
                            videoUrl
                        });
                        platformResults.blog = { success: true, result: 'DRY_RUN' };
                    }
                    else if (process.env.ENABLE_BLOG_POSTING === 'true' && process.env.GITHUB_TOKEN) {
                        const { postBlogArticle } = await Promise.resolve().then(() => __importStar(require('./blog')));
                        const result = await retryWithBackoff(() => postBlogArticle({
                            productTitle: product?.title || product?.name || 'Product',
                            productDescription: product?.details,
                            videoUrl: videoUrl,
                            productUrl: product?.url
                        }, process.env.GITHUB_TOKEN, process.env.GITHUB_REPO, process.env.GITHUB_BRANCH), {
                            maxRetries: 2,
                            operation: 'Blog article posting',
                            initialDelayMs: 3000
                        });
                        if (result) {
                            console.log('✅ Blog article published:', {
                                articleId: result.articleId,
                                commitSha: result.commitSha?.substring(0, 7)
                            });
                            platformResults.blog = { success: true, result: result.articleId };
                            postedAtLeastOne = true;
                            (0, health_server_1.incrementSuccessfulPost)();
                        }
                        else {
                            console.error('❌ Blog article posting failed after all retries');
                            platformResults.blog = { success: false, error: 'Failed after 2 retries' };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`Blog: ${product?.title || jobId} - Failed after 2 retries`);
                        }
                    }
                    else if (process.env.ENABLE_BLOG_POSTING === 'true') {
                        console.log('⚠️ Blog posting enabled but GITHUB_TOKEN not set');
                    }
                    // Facebook - temporarily disabled until token is resolved
                    if (false && process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
                        console.log('[FACEBOOK DISABLED] Skipping until token is fixed');
                    }
                    else if (false) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'INFO', category: 'POSTING', message: 'Attempting Facebook post', rowNumber, product: product?.title || product?.name });
                        try {
                            const fbResult = await retryWithBackoff(async () => {
                                const axios = await Promise.resolve().then(() => __importStar(require('axios')));
                                // Post video to Facebook Page
                                const res = await axios.default.post(`https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/videos`, {
                                    file_url: videoUrl,
                                    description: caption,
                                    title: (product?.title || product?.name || 'Nature\'s Way Soil').substring(0, 100),
                                    published: true,
                                    access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
                                });
                                console.log('📘 Facebook video URL:', videoUrl);
                                return res.data;
                            }, { maxRetries: 2, operation: 'Facebook post', initialDelayMs: 3000 });
                            if (fbResult?.id) {
                                console.log('✅ Posted to Facebook:', fbResult.id);
                                platformResults.facebook = { success: true, result: fbResult.id };
                                postedAtLeastOne = true;
                                (0, health_server_1.incrementSuccessfulPost)();
                                (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'SUCCESS', category: 'POSTING', message: 'Facebook post successful', rowNumber, product: product?.title || product?.name });
                            }
                        }
                        catch (err) {
                            const fbError = err?.response?.data || err?.message || err;
                            console.error('❌ Facebook post failed (skipping, continuing):', JSON.stringify(fbError));
                            platformResults.facebook = { success: false, error: err?.message || String(err) };
                            // Don't increment failed post or add error - just skip Facebook and continue
                        }
                    }
                    // LinkedIn
                    if (dryRun || !canPostNow) {
                        console.log('[DRY RUN] Would post to LinkedIn:', { videoUrl, caption });
                        platformResults.linkedin = { success: true, result: 'DRY_RUN' };
                    }
                    else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('linkedin')) && process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'INFO', category: 'POSTING', message: 'Attempting LinkedIn post', rowNumber, product: product?.title || product?.name });
                        try {
                            const liResult = await retryWithBackoff(async () => {
                                const axios = await Promise.resolve().then(() => __importStar(require('axios')));
                                // Share video post on LinkedIn
                                const res = await axios.default.post('https://api.linkedin.com/v2/ugcPosts', {
                                    author: `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`,
                                    lifecycleState: 'PUBLISHED',
                                    specificContent: {
                                        'com.linkedin.ugc.ShareContent': {
                                            shareCommentary: { text: caption },
                                            shareMediaCategory: 'VIDEO',
                                            media: [{
                                                    status: 'READY',
                                                    description: { text: caption.substring(0, 200) },
                                                    media: videoUrl,
                                                    title: { text: product?.title || product?.name || 'Nature\'s Way Soil' },
                                                }],
                                        },
                                    },
                                    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
                                }, { headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' } });
                                return res.data;
                            }, { maxRetries: 2, operation: 'LinkedIn post', initialDelayMs: 3000 });
                            if (liResult?.id) {
                                console.log('✅ Posted to LinkedIn:', liResult.id);
                                platformResults.linkedin = { success: true, result: liResult.id };
                                postedAtLeastOne = true;
                                (0, health_server_1.incrementSuccessfulPost)();
                                (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'SUCCESS', category: 'POSTING', message: 'LinkedIn post successful', rowNumber, product: product?.title || product?.name });
                            }
                        }
                        catch (err) {
                            console.error('❌ LinkedIn post failed:', err?.response?.data || err?.message || err);
                            platformResults.linkedin = { success: false, error: err?.message || String(err) };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`LinkedIn: ${product?.title || jobId} - ${err?.message || err}`);
                            (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'ERROR', category: 'POSTING', message: 'LinkedIn post failed', rowNumber, product: product?.title || product?.name, details: { error: err?.message } });
                        }
                    }
                    // Google Business Profile
                    if (dryRun || !canPostNow) {
                        console.log('[DRY RUN] Would post to Google Business Profile:', { videoUrl, caption });
                        platformResults.googleBusiness = { success: true, result: 'DRY_RUN' };
                    }
                    else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('googlebusiness')) && process.env.GOOGLE_BUSINESS_ACCESS_TOKEN && process.env.GOOGLE_BUSINESS_ACCOUNT_ID && process.env.GOOGLE_BUSINESS_LOCATION_ID) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'INFO', category: 'POSTING', message: 'Attempting Google Business post', rowNumber, product: product?.title || product?.name });
                        try {
                            const { postToGoogleBusiness } = await Promise.resolve().then(() => __importStar(require('./google-business')));
                            const gbResult = await retryWithBackoff(() => postToGoogleBusiness(caption, videoUrl, 'https://natureswaysoil.com'), { maxRetries: 2, operation: 'Google Business post', initialDelayMs: 3000 });
                            console.log('✅ Posted to Google Business Profile:', gbResult?.name);
                            platformResults.googleBusiness = { success: true, result: gbResult?.name };
                            (0, health_server_1.incrementSuccessfulPost)();
                            (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'SUCCESS', category: 'POSTING', message: 'Google Business post successful', rowNumber, product: product?.title || product?.name });
                        }
                        catch (err) {
                            console.error('❌ Google Business post failed:', err?.response?.data || err?.message || err);
                            platformResults.googleBusiness = { success: false, error: err?.message || String(err) };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`Google Business: ${product?.title || jobId} - ${err?.message || err}`);
                            (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'ERROR', category: 'POSTING', message: 'Google Business post failed', rowNumber, product: product?.title || product?.name, details: { error: err?.message } });
                        }
                    }
                    // TikTok
                    if (dryRun || !canPostNow) {
                        console.log('[DRY RUN] Would post to TikTok:', { videoUrl, caption });
                        platformResults.tiktok = { success: true, result: 'DRY_RUN' };
                    }
                    else if ((enabledPlatforms.size === 0 || enabledPlatforms.has('tiktok')) && process.env.TIKTOK_ACCESS_TOKEN) {
                        (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'INFO', category: 'POSTING', message: 'Attempting TikTok post', rowNumber, product: product?.title || product?.name });
                        try {
                            const ttResult = await retryWithBackoff(async () => {
                                const axios = await Promise.resolve().then(() => __importStar(require('axios')));
                                // Step 1: Init upload
                                const initRes = await axios.default.post('https://open.tiktokapis.com/v2/post/publish/video/init/', {
                                    post_info: {
                                        title: caption.substring(0, 150),
                                        privacy_level: process.env.TIKTOK_PRIVACY_LEVEL || 'PUBLIC_TO_EVERYONE',
                                        disable_duet: false,
                                        disable_comment: false,
                                        disable_stitch: false,
                                    },
                                    source_info: {
                                        source: 'PULL_FROM_URL',
                                        video_url: videoUrl,
                                    },
                                }, { headers: { Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`, 'Content-Type': 'application/json; charset=UTF-8' } });
                                return initRes.data;
                            }, { maxRetries: 2, operation: 'TikTok post', initialDelayMs: 3000 });
                            if (ttResult?.data?.publish_id) {
                                console.log('✅ Posted to TikTok, publish_id:', ttResult.data.publish_id);
                                platformResults.tiktok = { success: true, result: ttResult.data.publish_id };
                                postedAtLeastOne = true;
                                (0, health_server_1.incrementSuccessfulPost)();
                                (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'SUCCESS', category: 'POSTING', message: 'TikTok post successful', rowNumber, product: product?.title || product?.name });
                            }
                        }
                        catch (err) {
                            console.error('❌ TikTok post failed:', err?.response?.data || err?.message || err);
                            platformResults.tiktok = { success: false, error: err?.message || String(err) };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`TikTok: ${product?.title || jobId} - ${err?.message || err}`);
                            (0, audit_logger_1.getAuditLogger)().logEvent({ level: 'ERROR', category: 'POSTING', message: 'TikTok post failed', rowNumber, product: product?.title || product?.name, details: { error: err?.message } });
                        }
                    }
                    // Summary of platform results
                    console.log('\n📊 Platform Posting Summary:', {
                        product: product?.title || product?.name,
                        videoUrl,
                        captionLength: caption.length,
                        results: platformResults,
                        successCount: Object.values(platformResults).filter(r => r.success).length,
                        totalAttempted: Object.keys(platformResults).length
                    });
                    // Mark row as posted if at least one platform succeeded
                    if (!dryRun && postedAtLeastOne) {
                        try {
                            if (process.env.GS_SERVICE_ACCOUNT_EMAIL && process.env.GS_SERVICE_ACCOUNT_KEY) {
                                const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl);
                                const sheetGid = extractGidFromCsv(csvUrl);
                                await (0, sheets_1.markRowPosted)({
                                    spreadsheetId,
                                    sheetGid,
                                    rowNumber: rowNumber,
                                    headers,
                                    postedColumn: process.env.CSV_COL_POSTED || 'Posted',
                                    timestampColumn: process.env.CSV_COL_POSTED_AT || 'Posted_At',
                                });
                            }
                        }
                        catch (err) {
                            console.error('Failed to mark row posted:', err);
                        }
                        seen.add(jobId);
                        rowsThisCycle++;
                    }
                    // Update status after each row
                    (0, health_server_1.updateStatus)({
                        status: 'processing',
                        rowsProcessed: seen.size
                    });
                }
                (0, health_server_1.updateStatus)({
                    status: 'idle',
                    rowsProcessed: seen.size
                });
            }
            else {
                // Check if all rows are already posted — reset Posted column and loop from row 1
                const spreadsheetIdMatch = csvUrl.match(/spreadsheets\/d\/([^/]+)/);
                const gidMatch = csvUrl.match(/[?&]gid=(\d+)/);
                const spreadsheetId = spreadsheetIdMatch?.[1];
                const sheetGid = gidMatch?.[1];
                if (spreadsheetId && result.skipped === false) {
                    console.log('🔁 All rows already posted — resetting Posted column to loop from row 1');
                    try {
                        // Fetch raw CSV to get headers and row count
                        const axios = require('axios');
                        const csvResp = await axios.get(csvUrl, { responseType: 'text', timeout: 15000 });
                        const lines = csvResp.data.trim().split('\n');
                        const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
                        const totalDataRows = lines.length - 1;
                        await (0, sheets_1.resetPostedColumn)({ spreadsheetId, sheetGid, totalRows: totalDataRows, headers });
                        seen.clear();
                        console.log(`✅ Reset ${totalDataRows} rows — will post from row 1 on next cycle`);
                    }
                    catch (resetErr) {
                        console.error('❌ Failed to reset Posted column:', resetErr?.message);
                    }
                }
                else {
                    console.log('⚠️  No valid products found in sheet. Check CSV_URL and column mappings.');
                }
                (0, health_server_1.updateStatus)({ status: 'idle-no-products' });
            }
        }
        catch (e) {
            console.error('Polling error:', e);
            (0, health_server_1.addError)(`Cycle error: ${e?.message || String(e)}`);
            (0, audit_logger_1.getAuditLogger)().logEvent({
                level: 'ERROR',
                category: 'SYSTEM',
                message: 'Cycle error',
                details: { error: e?.message || String(e) }
            });
            (0, health_server_1.updateStatus)({ status: 'error' });
        }
        // Print audit summary at the end of each cycle
        (0, audit_logger_1.getAuditLogger)().printSummary();
        // Clear audit log for next cycle (unless runOnce mode)
        if (!runOnce) {
            (0, audit_logger_1.getAuditLogger)().clear();
        }
    };
    if (runOnce) {
        let exitCode = 0;
        try {
            await cycle();
        }
        catch (error) {
            console.error('Error during cycle:', error);
            exitCode = 1;
        }
        finally {
            await (0, health_server_1.stopHealthServer)();
            process.exit(exitCode);
        }
    }
    while (true) {
        await cycle();
        await sleep(intervalMs);
    }
}
main().catch(e => console.error(e));
function hasTwitterUploadCreds() {
    return Boolean(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET);
}
function checkPlatformAvailability(enabledPlatforms) {
    const hasInstagramCreds = Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID);
    const hasTwitterCreds = Boolean(process.env.TWITTER_BEARER_TOKEN || hasTwitterUploadCreds());
    const hasPinterestCreds = Boolean(process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID);
    const hasYouTubeCreds = Boolean(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN);
    const hasFacebookCreds = Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID);
    const hasLinkedInCreds = Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID);
    const hasTikTokCreds = Boolean(process.env.TIKTOK_ACCESS_TOKEN);
    const instagramEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('instagram')) && hasInstagramCreds;
    const twitterEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('twitter')) && hasTwitterCreds;
    const pinterestEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('pinterest')) && hasPinterestCreds;
    const youtubeEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('youtube')) && hasYouTubeCreds;
    const facebookEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('facebook')) && hasFacebookCreds;
    const linkedinEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('linkedin')) && hasLinkedInCreds;
    const tiktokEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('tiktok')) && hasTikTokCreds;
    return {
        credentials: {
            hasInstagramCreds,
            hasTwitterCreds,
            hasPinterestCreds,
            hasYouTubeCreds,
            hasFacebookCreds,
            hasLinkedInCreds,
            hasTikTokCreds,
        },
        enabled: {
            instagram: instagramEnabled,
            twitter: twitterEnabled,
            pinterest: pinterestEnabled,
            youtube: youtubeEnabled,
            facebook: facebookEnabled,
            linkedin: linkedinEnabled,
            tiktok: tiktokEnabled,
        },
        anyEnabled: instagramEnabled || twitterEnabled || pinterestEnabled || youtubeEnabled || facebookEnabled || linkedinEnabled || tiktokEnabled
    };
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function extractSpreadsheetIdFromCsv(csvUrl) {
    // Expects /spreadsheets/d/<id>/export
    const m = csvUrl.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!m)
        throw new Error('Unable to parse spreadsheetId from CSV_URL');
    return m[1];
}
function extractGidFromCsv(csvUrl) {
    const m = csvUrl.match(/[?&]gid=(\d+)/);
    return m ? Number(m[1]) : undefined;
}
// Build the video URL from CSV or template
async function resolveVideoUrlAsync(params) {
    const { jobId, record } = params;
    // 1) If CSV provides a direct video URL column (configurable), prefer that
    const directCol = (process.env.CSV_COL_VIDEO_URL || 'video_url,Video URL,VideoURL').split(',').map((s) => s.trim());
    if (record) {
        for (const key of directCol) {
            const v = record[key];
            if (v && /^https?:\/\//i.test(v))
                return v;
        }
    }
    // 2) Template-based resolution (for backward compatibility with existing sheets)
    const template = process.env.VIDEO_URL_TEMPLATE || process.env.WAVE_VIDEO_URL_TEMPLATE || 'https://heygen.ai/jobs/{jobId}/video.mp4';
    return template
        .replaceAll('{jobId}', jobId)
        .replaceAll('{asin}', jobId);
}
// Quickly check if a URL is likely reachable. HEAD if supported; fallback to GET range probe.
async function urlLooksReachable(url) {
    const axios = await Promise.resolve().then(() => __importStar(require('axios')));
    try {
        const res = await axios.default.head(url, { validateStatus: () => true });
        if (res.status >= 200 && res.status < 400)
            return true;
        if (res.status === 405 || res.status === 403)
            return true; // HEAD not allowed but likely exists
    }
    catch { }
    try {
        const res = await axios.default.get(url, {
            headers: { Range: 'bytes=0-0' },
            validateStatus: () => true,
            responseType: 'stream',
        });
        return res.status >= 200 && res.status < 400;
    }
    catch {
        return false;
    }
}
// Posting windows: allow posting within 5 minutes of 9:00 AM or 5:00 PM Eastern
function isWithinPostingWindow() {
    try {
        const nowUtc = new Date();
        // Offsets to Eastern Time (naive: use -4 in DST, -5 otherwise); allow override via env
        const offset = Number(process.env.EASTERN_UTC_OFFSET_HOURS || '-4');
        const nowEt = new Date(nowUtc.getTime() + offset * 3600 * 1000);
        const hour = nowEt.getUTCHours();
        const minute = nowEt.getUTCMinutes();
        // 9:00 and 17:00 ET with 5-minute window
        const windows = [
            { h: (9 - offset + 24) % 24, m: 0 },
            { h: (17 - offset + 24) % 24, m: 0 },
        ];
        for (const w of windows) {
            if (hour === w.h && Math.abs(minute - w.m) <= 5)
                return true;
        }
        return false;
    }
    catch {
        return true; // fail-open to avoid blocking
    }
}
// Helper: pull first non-empty value for comma-separated header candidates
function getValueFromRecord(record, columnsCsv) {
    if (!record)
        return undefined;
    for (const key of columnsCsv.split(',').map(s => s.trim())) {
        const v = record[key];
        if (v && String(v).trim().length > 0)
            return v;
    }
    return undefined;
}
