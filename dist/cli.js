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
    const csvUrl = process.env.CSV_URL;
    if (!csvUrl)
        throw new Error('CSV_URL not set in .env');
    const seen = new Set();
    const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? '60000');
    const runOnce = String(process.env.RUN_ONCE || '').toLowerCase() === 'true';
    const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true';
    const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase();
    const enabledPlatforms = new Set(enabledPlatformsEnv.split(',').map(s => s.trim()).filter(Boolean));
    const enforcePostingWindows = String(process.env.ENFORCE_POSTING_WINDOWS || 'false').toLowerCase() === 'true';
    const targetColumnLetter = (process.env.SHEET_VIDEO_TARGET_COLUMN_LETTER || 'AB').toUpperCase();
    // Start health server for monitoring/webhooks (will be stopped in run-once mode)
    (0, health_server_1.startHealthServer)();
    // Log initial configuration
    audit_logger_1.auditLogger.log({
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
        audit_logger_1.auditLogger.log({
            level: 'WARN',
            category: 'SYSTEM',
            message: 'DRY RUN MODE ENABLED - No actual posts will be sent',
        });
    }
    if (enforcePostingWindows) {
        audit_logger_1.auditLogger.log({
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
                for (const { product, jobId, rowNumber, headers, record } of result.rows) {
                    if (!jobId || seen.has(jobId))
                        continue;
                    console.log(`\n========== Processing Row ${rowNumber} ==========`);
                    console.log('Product:', product);
                    // Step 1: Try to get existing video URL
                    let videoUrl = await resolveVideoUrlAsync({ jobId, record });
                    // Prefer ASIN from the sheet for identification
                    const asin = getValueFromRecord(record, process.env.CSV_COL_ASIN || 'ASIN,Parent_ASIN,SKU,Product_ID') || jobId;
                    // Step 2: If no video exists, create one with HeyGen
                    if (!videoUrl || !(await urlLooksReachable(videoUrl))) {
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
                                if (process.env.GS_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
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
                        if (videoUrl && (process.env.GS_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
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
                    const isReachable = await urlLooksReachable(videoUrl);
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
                    const caption = (product?.details ?? product?.title ?? product?.name ?? '').toString();
                    // Respect posting windows: 9:00 AM and 5:00 PM Eastern
                    const canPostNow = !enforcePostingWindows || isWithinPostingWindow();
                    if (!canPostNow) {
                        console.log('🕘 Outside posting window (9AM/5PM ET). Will not post, but video URL is ready:', videoUrl);
                        audit_logger_1.auditLogger.log({
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
                        audit_logger_1.auditLogger.log({
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
                        audit_logger_1.auditLogger.log({
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
                        audit_logger_1.auditLogger.log({
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
                            audit_logger_1.auditLogger.log({
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
                            audit_logger_1.auditLogger.log({
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
                        audit_logger_1.auditLogger.log({
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
                            audit_logger_1.auditLogger.log({
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
                            audit_logger_1.auditLogger.log({
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
                        audit_logger_1.auditLogger.log({
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
                            audit_logger_1.auditLogger.log({
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
                            audit_logger_1.auditLogger.log({
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
                        audit_logger_1.auditLogger.log({
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
                            audit_logger_1.auditLogger.log({
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
                            audit_logger_1.auditLogger.log({
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
                console.log('No valid products found in sheet.');
                audit_logger_1.auditLogger.log({
                    level: 'WARN',
                    category: 'CSV',
                    message: 'No valid products found in sheet',
                });
                (0, health_server_1.updateStatus)({ status: 'idle-no-products' });
            }
        }
        catch (e) {
            console.error('Polling error:', e);
            (0, health_server_1.addError)(`Cycle error: ${e?.message || String(e)}`);
            audit_logger_1.auditLogger.log({
                level: 'ERROR',
                category: 'SYSTEM',
                message: 'Cycle error',
                details: { error: e?.message || String(e) }
            });
            (0, health_server_1.updateStatus)({ status: 'error' });
        }
        // Print audit summary at the end of each cycle
        audit_logger_1.auditLogger.printSummary();
        // Clear audit log for next cycle (unless runOnce mode)
        if (!runOnce) {
            audit_logger_1.auditLogger.clear();
        }
    };
    if (runOnce) {
        try {
            await cycle();
        }
        finally {
            await (0, health_server_1.stopHealthServer)();
        }
        return;
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
    const instagramEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('instagram')) && hasInstagramCreds;
    const twitterEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('twitter')) && hasTwitterCreds;
    const pinterestEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('pinterest')) && hasPinterestCreds;
    const youtubeEnabled = (enabledPlatforms.size === 0 || enabledPlatforms.has('youtube')) && hasYouTubeCreds;
    return {
        credentials: {
            hasInstagramCreds,
            hasTwitterCreds,
            hasPinterestCreds,
            hasYouTubeCreds
        },
        enabled: {
            instagram: instagramEnabled,
            twitter: twitterEnabled,
            pinterest: pinterestEnabled,
            youtube: youtubeEnabled
        },
        anyEnabled: instagramEnabled || twitterEnabled || pinterestEnabled || youtubeEnabled
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
    const directCol = (process.env.CSV_COL_VIDEO_URL || 'video_url,Video URL,VideoURL').split(',').map(s => s.trim());
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
