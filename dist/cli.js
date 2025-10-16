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
const wavespeed_1 = require("./wavespeed");
const openai_1 = require("./openai");
const sheets_1 = require("./sheets");
const health_server_1 = require("./health-server");
// Start health check server
require("./health-server");
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
                    // Step 2: If no video exists, create one with OpenAI + WaveSpeed
                    if (!videoUrl || !(await urlLooksReachable(videoUrl))) {
                        console.log('No existing video found. Creating new video...');
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
                            console.log('⚠️  OPENAI_API_KEY not set, skipping script generation');
                        }
                        // 2b: Create WaveSpeed video
                        let predictionId;
                        if (script && (process.env.WAVE_SPEED_API_KEY || process.env.WAVESPEED_API_KEY || process.env.GS_API_KEY)) {
                            try {
                                const { id } = await (0, wavespeed_1.createWaveSpeedPrediction)({ script, jobId });
                                predictionId = id;
                                console.log('✅ Created WaveSpeed prediction:', id);
                            }
                            catch (e) {
                                console.error('❌ WaveSpeed create failed:', e?.message || e);
                            }
                        }
                        else {
                            console.log('⚠️  Cannot create video: missing script or WaveSpeed API key');
                        }
                        // 2c: Poll for video completion
                        if (predictionId) {
                            try {
                                videoUrl = await (0, wavespeed_1.pollWaveSpeedUntilReady)(predictionId, {
                                    timeoutMs: 25 * 60_000, // 25 minutes (Cloud Scheduler max is 30, keep margin)
                                    intervalMs: 15_000 // Check every 15 seconds
                                });
                                console.log('✅ Video ready:', videoUrl);
                                // 2d: Write video URL back to sheet
                                if (videoUrl && (process.env.GS_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                                    try {
                                        const spreadsheetId = extractSpreadsheetIdFromCsv(csvUrl);
                                        const sheetGid = extractGidFromCsv(csvUrl);
                                        await (0, sheets_1.writeColumnValues)({
                                            spreadsheetId,
                                            sheetGid,
                                            headers,
                                            columnName: process.env.CSV_COL_VIDEO_URL || 'Video URL',
                                            rows: [{ rowNumber, value: videoUrl }],
                                        });
                                        console.log('✅ Wrote video URL to sheet');
                                    }
                                    catch (e) {
                                        console.error('⚠️  Failed to write video URL to sheet:', e?.message || e);
                                    }
                                }
                            }
                            catch (e) {
                                console.error('❌ WaveSpeed polling failed:', e?.message || e);
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
                    let postedAtLeastOne = false;
                    const platformResults = {};
                    // Instagram
                    if (dryRun) {
                        console.log('[DRY RUN] Would post to Instagram:', { videoUrl, caption });
                        platformResults.instagram = { success: true, result: 'DRY_RUN' };
                    }
                    else if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
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
                        }
                        else {
                            console.error('❌ Instagram post failed after all retries');
                            platformResults.instagram = { success: false, error: 'Failed after 3 retries' };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`Instagram: ${product?.title || jobId} - Failed after 3 retries`);
                        }
                    }
                    // Twitter
                    if (dryRun) {
                        console.log('[DRY RUN] Would post to Twitter:', { videoUrl, caption });
                        platformResults.twitter = { success: true, result: 'DRY_RUN' };
                    }
                    else if (process.env.TWITTER_BEARER_TOKEN || hasTwitterUploadCreds()) {
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
                        }
                        else {
                            console.error('❌ Twitter post failed after all retries');
                            platformResults.twitter = { success: false, error: 'Failed after 3 retries' };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`Twitter: ${product?.title || jobId} - Failed after 3 retries`);
                        }
                    }
                    // Pinterest
                    if (dryRun) {
                        console.log('[DRY RUN] Would post to Pinterest:', { videoUrl, caption });
                        platformResults.pinterest = { success: true, result: 'DRY_RUN' };
                    }
                    else if (process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
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
                        }
                        else {
                            console.error('❌ Pinterest post failed after all retries');
                            platformResults.pinterest = { success: false, error: 'Failed after 3 retries' };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`Pinterest: ${product?.title || jobId} - Failed after 3 retries`);
                        }
                    }
                    // YouTube
                    if (dryRun) {
                        console.log('[DRY RUN] Would upload to YouTube:', { videoUrl, caption });
                        platformResults.youtube = { success: true, result: 'DRY_RUN' };
                    }
                    else if (process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
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
                        }
                        else {
                            console.error('❌ YouTube upload failed after all retries');
                            platformResults.youtube = { success: false, error: 'Failed after 2 retries' };
                            (0, health_server_1.incrementFailedPost)();
                            (0, health_server_1.addError)(`YouTube: ${product?.title || jobId} - Failed after 2 retries`);
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
                (0, health_server_1.updateStatus)({ status: 'idle-no-products' });
            }
        }
        catch (e) {
            console.error('Polling error:', e);
            (0, health_server_1.addError)(`Cycle error: ${e?.message || String(e)}`);
            (0, health_server_1.updateStatus)({ status: 'error' });
        }
    };
    if (runOnce) {
        await cycle();
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
// Build the video URL from WaveSpeed API (optional), CSV, or template
async function resolveVideoUrlAsync(params) {
    const { jobId, record } = params;
    // 0) Try WaveSpeed API lookup if configured
    try {
        const viaApi = await (0, wavespeed_1.fetchVideoUrlFromWaveSpeed)(jobId);
        if (viaApi)
            return viaApi;
    }
    catch { }
    // 1) If CSV provides a direct video URL column (configurable), prefer that
    const directCol = (process.env.CSV_COL_VIDEO_URL || 'video_url,Video URL,VideoURL').split(',').map(s => s.trim());
    if (record) {
        for (const key of directCol) {
            const v = record[key];
            if (v && /^https?:\/\//i.test(v))
                return v;
        }
    }
    // 2) Template-based resolution
    const template = process.env.WAVE_VIDEO_URL_TEMPLATE || 'https://wavespeed.ai/jobs/{jobId}/video.mp4';
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
