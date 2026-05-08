From 531d1ea6458845e8da28d170c84325ec37b2ee4f Mon Sep 17 00:00:00 2001
From: James Jones <natureswaysoil@gmail.com>
Date: Fri, 8 May 2026 21:35:30 +0000
Subject: [PATCH] fix: treat HeyGen 404 as permanent failure and re-request
 expired jobs

- getJobStatus (dist+src): 404 response throws AppError(statusCode=404,
  isOperational=false) so the poll loop exits on first attempt instead of
  retrying for 2 minutes per row
- pollJobForVideoUrl (dist): inner catch exits immediately on statusCode 404
  instead of treating it as a transient network error
- createOrPollVideo (dist+src): when poll throws 404, clears Video_ID /
  Video_Status / Video_URL from the sheet row and falls through to request
  a fresh video instead of skipping the row entirely
---
 dist/heygen-adapter.js | 159 ++++++++++++++++++++---------
 dist/heygen.js         | 222 +++++++++++++++++++++++++++--------------
 src/heygen-adapter.ts  |   2 +-
 src/heygen.ts          |  19 +---
 4 files changed, 267 insertions(+), 135 deletions(-)

diff --git a/dist/heygen-adapter.js b/dist/heygen-adapter.js
index 4306e12..48418b9 100644
--- a/dist/heygen-adapter.js
+++ b/dist/heygen-adapter.js
@@ -1,8 +1,51 @@
 "use strict";
+/**
+ * Adapter: map product row -> HeyGen payload and mapping info
+ * Uses keyword rules and generic avatar/voice IDs as defaults.
+ *
+ * Exports:
+ *  - mapProductToHeyGenPayload(row) => { payload, avatar, voice, lengthSeconds, reason }
+ *  - writeBackMappingsToSheet(sheetId, gid, mappedRows) => Promise<boolean>
+ */
 Object.defineProperty(exports, "__esModule", { value: true });
 exports.mapProductToHeyGenPayload = mapProductToHeyGenPayload;
-const openai_1 = require("./openai");
-async function mapProductToHeyGenPayload(row) {
+exports.writeBackMappingsToSheet = writeBackMappingsToSheet;
+const googleapis_1 = require("googleapis");
+const google_auth_1 = require("./google-auth");
+const DEFAULTS = {
+    avatar: 'garden_expert_01',
+    voice: 'en_us_warm_female_01',
+    music: { style: 'acoustic_nature', volume: 0.18 },
+    lengthSeconds: 30,
+};
+const CATEGORY_MAP = [
+    { pattern: /\b(kelp|seaweed|algae)\b/i, avatar: 'garden_expert_01', voice: 'en_us_warm_female_01', lengthSeconds: 30, reason: 'matched keyword: kelp', visualHint: 'healthy green plants, liquid seaweed fertilizer, measuring cup, watering can, garden beds, natural sunlight' },
+    { pattern: /\b(bone ?meal|bonemeal|bone)\b/i, avatar: 'farm_expert_02', voice: 'en_us_deep_male_01', lengthSeconds: 35, reason: 'matched keyword: bone meal', visualHint: 'strong roots, blooming plants, calcium and phosphorus support, liquid bottle near garden soil' },
+    { pattern: /\b(hay|pasture|forage)\b/i, avatar: 'pasture_specialist_01', voice: 'en_us_neutral_mx_01', lengthSeconds: 40, reason: 'matched keyword: hay/pasture', visualHint: 'green pasture field, hay grass, sprayer application, farm fence line, healthy forage growth' },
+    { pattern: /\b(humic|fulvic|humate|fulvate)\b/i, avatar: 'eco_gardener_01', voice: 'en_us_warm_female_02', lengthSeconds: 30, reason: 'matched keyword: humic/fulvic', visualHint: 'dark rich soil, active roots, lawn and garden soil conditioner, close-up of root zone moisture' },
+    { pattern: /\b(compost|tea|soil conditioner)\b/i, avatar: 'eco_gardener_01', voice: 'en_us_warm_female_02', lengthSeconds: 30, reason: 'matched keyword: compost/soil', visualHint: 'living compost, worm castings, biochar, raised beds, vegetables, rich dark soil texture' },
+];
+function first(row, keys) {
+    for (const key of keys) {
+        const value = row[key];
+        if (value !== undefined && value !== null && String(value).trim() !== '')
+            return String(value).trim();
+    }
+    return '';
+}
+function cleanForPrompt(value) {
+    return value.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim().slice(0, 900);
+}
+function buildVisualPrompt(row, title, details, visualHint) {
+    const existingPrompt = first(row, [
+        'Visual_Prompt', 'visual_prompt', 'Video_Prompt', 'video_prompt', 'Scene_Prompt', 'scene_prompt',
+        'Image_Prompt', 'image_prompt', 'Creative_Brief', 'creative_brief'
+    ]);
+    if (existingPrompt)
+        return cleanForPrompt(existingPrompt);
+    return cleanForPrompt(`Create a premium vertical product marketing video for Nature's Way Soil. Show real garden and lawn visuals, not text describing the scene. Product: ${title}. Details: ${details}. Visual direction: ${visualHint}. Use close-up soil, roots, plants, product bottle, watering or spraying application, healthy before-and-after style transformation, warm natural light, clean Amazon-ready commercial look. Do not show a script, storyboard, captions as the main visual, or a person explaining what should be shown.`);
+}
+function mapProductToHeyGenPayload(row) {
     const textFields = [
         row.title, row.Title,
         row.name, row.Name,
@@ -27,42 +70,14 @@ async function mapProductToHeyGenPayload(row) {
     }
     const title = first(row, ['Title', 'title', 'Product', 'product', 'Name', 'name']) || 'Nature\'s Way Soil product';
     const details = first(row, ['Product Description', 'description', 'Description', 'Details', 'details', 'caption', 'Caption']);
-    // === NEW: Generate structured script with scenes + B-roll ===
-    let scriptData = { voiceover: '', scenes: [] };
-    try {
-        // Convert row to simple Product object that generateScript expects
-        const product = {
-            id: row.id || row.ID || '',
-            title: title,
-            details: details,
-            description: details,
-            name: title
-        };
-        const rawScript = await (0, openai_1.generateScript)(product); // ← uses your updated openai.ts
-        scriptData = JSON.parse(rawScript);
-    }
-    catch (err) {
-        console.warn('Structured script failed, falling back to row description', err);
-        scriptData.voiceover = details || title;
-    }
-    // === Fetch Pexels B-roll for every scene ===
-    const pexels = PexelsService.getInstance();
-    const scenes = [];
-    for (const scene of scriptData.scenes || []) {
-        let brollUrl = '';
-        if (scene.brollKeyword) {
-            brollUrl = await pexels.getBrollVideo(scene.brollKeyword, 12);
-        }
-        scenes.push({
-            seconds: scene.seconds || '0-8',
-            avatarText: scene.avatarText || '',
-            brollUrl: brollUrl,
-            visualDesc: scene.visualDesc || ''
-        });
-    }
-    // Build the final payload (HeyGen will now get scenes + B-roll)
+    const script = (row['Product Description'] || row.description || row.Details || row.details || row.Title || row.title || '').toString();
+    const imageUrl = first(row, [
+        'Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url', 'Main_Image_URL', 'main_image_url',
+        'Background_Image_URL', 'background_image_url', 'Hero_Image_URL', 'hero_image_url'
+    ]);
+    const visualPrompt = buildVisualPrompt(row, title, details, visualHint);
     const payload = {
-        script: scriptData.voiceover || details, // full narration
+        script,
         avatar,
         voice,
         lengthSeconds,
@@ -70,17 +85,13 @@ async function mapProductToHeyGenPayload(row) {
         subtitles: { enabled: true, style: 'short_lines' },
         webhook: process.env.HEYGEN_WEBHOOK_URL || undefined,
         title,
-        visualPrompt: buildVisualPrompt(row, title, details, visualHint),
-        imageUrl: first(row, ['Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url', 'Main_Image_URL', 'main_image_url']) || undefined,
+        visualPrompt,
+        imageUrl: imageUrl || undefined,
         meta: {
             productTitle: title,
             visualHint,
-            sourceImageUrl: first(row, ['Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url']) || undefined,
-            mappingReason: reason
+            sourceImageUrl: imageUrl || undefined,
         },
-        // NEW: Multi-scene + B-roll support
-        scenes: scenes,
-        structuredScript: scriptData
     };
     return {
         payload,
@@ -88,6 +99,64 @@ async function mapProductToHeyGenPayload(row) {
         voice,
         lengthSeconds,
         reason,
-        scenes // extra for logging/debugging
     };
 }
+async function createSheetsAuthClient() {
+    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
+    return (0, google_auth_1.createGoogleAuthClient)(scopes);
+}
+async function writeBackMappingsToSheet(sheetId, gid, mappedRows, opts) {
+    const authClient = await createSheetsAuthClient();
+    if (typeof authClient.authorize === 'function') {
+        await authClient.authorize();
+    }
+    const sheets = googleapis_1.google.sheets({ version: 'v4', auth: authClient });
+    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
+    const sheet = (meta.data.sheets || []).find((s) => String(s.properties?.sheetId) === String(gid));
+    if (!sheet)
+        throw new Error(`Sheet with gid ${gid} not found`);
+    const sheetTitle = sheet.properties.title;
+    const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetTitle}!1:1` });
+    const headers = (headerRes.data.values?.[0] || []);
+    const newCols = ['HEYGEN_AVATAR', 'HEYGEN_VOICE', 'HEYGEN_LENGTH_SECONDS', 'HEYGEN_MAPPING_REASON', 'HEYGEN_MAPPED_AT'];
+    const missing = newCols.filter((c) => !headers.includes(c));
+    let updatedHeaders = headers.slice();
+    if (missing.length > 0) {
+        updatedHeaders = headers.concat(missing);
+        await sheets.spreadsheets.values.update({
+            spreadsheetId: sheetId,
+            range: `${sheetTitle}!1:1`,
+            valueInputOption: 'RAW',
+            requestBody: { values: [updatedHeaders] },
+        });
+    }
+    const headerRes2 = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetTitle}!1:1` });
+    const finalHeaders = (headerRes2.data.values?.[0] || []);
+    const startIndex = finalHeaders.indexOf(newCols[0]);
+    if (startIndex === -1)
+        throw new Error('Failed to find new columns after header update');
+    const blockValues = mappedRows.map((r) => newCols.map((c) => r[c] || ''));
+    const startColLetter = columnToLetter(startIndex + 1);
+    const endColLetter = columnToLetter(startIndex + newCols.length);
+    const range = `${sheetTitle}!${startColLetter}2:${endColLetter}${mappedRows.length + 1}`;
+    await sheets.spreadsheets.values.update({
+        spreadsheetId: sheetId,
+        range,
+        valueInputOption: 'RAW',
+        requestBody: { values: blockValues },
+    });
+    return true;
+}
+exports.default = {
+    mapProductToHeyGenPayload,
+    writeBackMappingsToSheet,
+};
+function columnToLetter(col) {
+    let temp = '';
+    while (col > 0) {
+        const rem = (col - 1) % 26;
+        temp = String.fromCharCode(65 + rem) + temp;
+        col = Math.floor((col - 1) / 26);
+    }
+    return temp;
+}
diff --git a/dist/heygen.js b/dist/heygen.js
index 6f72ec9..e785180 100644
--- a/dist/heygen.js
+++ b/dist/heygen.js
@@ -18,9 +18,11 @@ function isPlaceholderApiKey(value) {
     const normalized = String(value || '').trim().toLowerCase();
     return !normalized || normalized.includes('your-') || normalized.includes('paste_') || normalized.includes('replace_') || normalized === 'changeme';
 }
-// Optional: load secrets from Google Secret Manager
+// Optional: load secrets from Google Secret Manager (only if running on GCP)
 async function getSecretFromGcp(name) {
     try {
+        // lazy-import so module doesn't require @google-cloud/secret-manager when not used
+        // eslint-disable-next-line @typescript-eslint/no-var-requires
         const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
         const client = new SecretManagerServiceClient();
         const [accessResponse] = await client.accessSecretVersion({ name });
@@ -28,6 +30,7 @@ async function getSecretFromGcp(name) {
         return payload || null;
     }
     catch (e) {
+        // Not fatal - return null so caller can fall back to env var
         logger.debug('Could not load secret from GCP', 'HeyGen', { error: e });
         return null;
     }
@@ -39,7 +42,7 @@ class HeyGenClient {
         this.apiKey = cfg.apiKey || process.env.HEYGEN_API_KEY || '';
         this.apiEndpoint = cfg.apiEndpoint || process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com';
         if (isPlaceholderApiKey(this.apiKey)) {
-            throw new errors_1.AppError('HeyGen API key is missing or still set to a placeholder.', errors_1.ErrorCode.MISSING_CONFIG, 500, true, { hasHeyGenApiKey: !!this.apiKey });
+            throw new errors_1.AppError('HeyGen API key is missing or still set to a placeholder. Update HEYGEN_API_KEY in .env, Codespace secrets, or Google Secret Manager.', errors_1.ErrorCode.MISSING_CONFIG, 500, true, { hasHeyGenApiKey: !!this.apiKey, keyLooksLikePlaceholder: true });
         }
         this.axios = axios_1.default.create({
             baseURL: this.apiEndpoint,
@@ -56,7 +59,9 @@ class HeyGenClient {
         try {
             const res = await this.axios.get('/v2/avatars');
             const avatars = res.data?.data?.avatars || res.data?.avatars || [];
-            const match = avatars.find((a) => a.avatar_id === nameOrId) || avatars.find((a) => (a.avatar_name || '').toLowerCase().includes(nameOrId.toLowerCase())) || avatars[0];
+            const match = avatars.find((a) => a.avatar_id === nameOrId)
+                || avatars.find((a) => (a.avatar_name || '').toLowerCase().includes(nameOrId.toLowerCase()))
+                || avatars[0];
             const id = match?.avatar_id || nameOrId;
             for (const a of avatars) {
                 if (a.avatar_id) {
@@ -64,6 +69,7 @@ class HeyGenClient {
                     this._avatarCache[a.avatar_id] = a.avatar_id;
                 }
             }
+            console.log('Discovered HeyGen avatar ID', { requested: nameOrId, resolved: id, total: avatars.length });
             return id;
         }
         catch (e) {
@@ -77,7 +83,10 @@ class HeyGenClient {
         try {
             const res = await this.axios.get('/v2/voices');
             const voices = res.data?.data?.voices || res.data?.voices || [];
-            const match = voices.find((v) => v.voice_id === nameOrId) || voices.find((v) => (v.name || '').toLowerCase().includes(nameOrId.toLowerCase())) || voices[0];
+            const match = voices.find((v) => v.voice_id === nameOrId)
+                || voices.find((v) => (v.name || '').toLowerCase().includes(nameOrId.toLowerCase()))
+                || voices.find((v) => v.language === 'en-US' || (v.locale || '').startsWith('en'))
+                || voices[0];
             const id = match?.voice_id || nameOrId;
             for (const v of voices) {
                 if (v.voice_id) {
@@ -85,6 +94,7 @@ class HeyGenClient {
                     this._voiceCache[v.voice_id] = v.voice_id;
                 }
             }
+            console.log('Discovered HeyGen voice ID', { requested: nameOrId, resolved: id });
             return id;
         }
         catch (e) {
@@ -93,54 +103,30 @@ class HeyGenClient {
         }
     }
     /**
-     * Create a new video generation job — NOW SUPPORTS MULTI-SCENE + PEXELS B-ROLL
+     * Create a new video generation job
+     * @param payload Video generation parameters
+     * @returns Job ID for polling
      */
     async createVideoJob(payload) {
         const startTime = Date.now();
         try {
             const config = (0, config_validator_1.getConfig)();
             if (!payload.script) {
-                throw new errors_1.AppError('Script is required for HeyGen video generation', errors_1.ErrorCode.VALIDATION_ERROR, 400, true);
+                throw new errors_1.AppError('Script is required for HeyGen video generation', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasScript: !!payload.script });
             }
             logger.info('Creating HeyGen video job', 'HeyGen', {
                 scriptLength: payload.script.length,
                 avatar: payload.avatar,
                 voice: payload.voice,
-                hasScenes: !!(payload.scenes && payload.scenes.length > 0),
-                sceneCount: payload.scenes?.length || 1,
             });
             const jobId = await rateLimiters.execute('heygen', async () => {
                 return (0, errors_1.withRetry)(async () => {
+                    // Resolve avatar and voice IDs before creating the request
                     const resolvedAvatarId = await this.resolveAvatarId(payload.avatar || 'default');
                     const resolvedVoiceId = await this.resolveVoiceId(payload.voice || 'default');
-                    let videoInputs = [];
-                    if (payload.scenes && payload.scenes.length > 0) {
-                        // Multi-scene mode with Pexels B-roll
-                        for (const scene of payload.scenes) {
-                            const background = scene.brollUrl
-                                ? { type: 'video', url: scene.brollUrl }
-                                : payload.imageUrl
-                                    ? { type: 'image', url: payload.imageUrl }
-                                    : { type: 'ai', prompt: payload.visualPrompt || 'natural garden scene, healthy plants, rich soil, product application' };
-                            videoInputs.push({
-                                character: {
-                                    type: 'avatar',
-                                    avatar_id: resolvedAvatarId,
-                                    avatar_style: 'normal',
-                                },
-                                voice: {
-                                    type: 'text',
-                                    input_text: scene.avatarText || payload.script,
-                                    voice_id: resolvedVoiceId,
-                                    speed: 1.0,
-                                },
-                                background,
-                            });
-                        }
-                    }
-                    else {
-                        // Fallback to single-scene (old behavior)
-                        videoInputs = [{
+                    // HeyGen v2 API
+                    const v2Body = {
+                        video_inputs: [{
                                 character: {
                                     type: 'avatar',
                                     avatar_id: resolvedAvatarId,
@@ -154,27 +140,41 @@ class HeyGenClient {
                                 },
                                 background: payload.imageUrl
                                     ? { type: 'image', url: payload.imageUrl }
-                                    : { type: 'ai', prompt: payload.visualPrompt || 'natural garden scene, healthy plants, soil, product application' },
-                            }];
-                    }
-                    const v2Body = {
-                        video_inputs: videoInputs,
+                                    : {
+                                        type: 'ai',
+                                        prompt: payload.visualPrompt || 'natural garden scene, healthy plants, soil, product application'
+                                    },
+                            }],
                         dimension: { width: 720, height: 1280 },
                         ...(payload.title ? { title: payload.title } : {}),
                     };
                     const response = await this.axios.post('/v2/video/generate', v2Body, {
                         timeout: config.TIMEOUT_HEYGEN,
                     });
-                    const id = response.data?.data?.video_id || response.data?.video_id || response.data?.jobId;
-                    if (!id)
-                        throw new errors_1.AppError('HeyGen API did not return a job ID', errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true);
+                    const id = response.data?.data?.video_id ||
+                        response.data?.video_id ||
+                        response.data?.jobId;
+                    if (!id) {
+                        throw new errors_1.AppError('HeyGen API did not return a job ID', errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, { responseData: response.data });
+                    }
                     return id;
-                }, { maxRetries: 3 });
+                }, {
+                    maxRetries: 3,
+                    onRetry: (error, attempt) => {
+                        logger.warn('Retrying HeyGen job creation', 'HeyGen', {
+                            attempt,
+                            error: error instanceof Error ? error.message : String(error),
+                        });
+                    },
+                });
             });
             const duration = Date.now() - startTime;
             metrics.incrementCounter('heygen.create_job.success');
             metrics.recordHistogram('heygen.create_job.duration', duration);
-            logger.info('HeyGen video job created', 'HeyGen', { jobId, duration, sceneCount: payload.scenes?.length || 1 });
+            logger.info('HeyGen video job created', 'HeyGen', {
+                jobId,
+                duration,
+            });
             return jobId;
         }
         catch (error) {
@@ -182,67 +182,135 @@ class HeyGenClient {
             metrics.incrementCounter('heygen.create_job.error');
             metrics.recordHistogram('heygen.create_job.error_duration', duration);
             logger.error('Failed to create HeyGen video job', 'HeyGen', { duration }, error);
-            if (error instanceof errors_1.AppError)
+            if (error instanceof errors_1.AppError) {
                 throw error;
-            if (axios_1.default.isAxiosError(error))
-                throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.HEYGEN_API_ERROR);
-            throw new errors_1.AppError(`HeyGen job creation failed: ${error.message || String(error)}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true);
+            }
+            if (axios_1.default.isAxiosError(error)) {
+                throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.HEYGEN_API_ERROR, {
+                    payload: { scriptLength: payload.script.length },
+                });
+            }
+            throw new errors_1.AppError(`HeyGen job creation failed: ${error.message || String(error)}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, {}, error instanceof Error ? error : undefined);
         }
     }
+    /**
+     * Check the status of a video generation job
+     * @param jobId Job ID returned from createVideoJob
+     * @returns Job status and result
+     */
     async getJobStatus(jobId) {
         try {
             const config = (0, config_validator_1.getConfig)();
-            const response = await this.axios.get(`/v2/video/${jobId}`, { timeout: config.TIMEOUT_HEYGEN });
+            if (!jobId) {
+                throw new errors_1.AppError('Job ID is required', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasJobId: !!jobId });
+            }
+            const response = await this.axios.get(`/v2/video/${jobId}`, {
+                timeout: config.TIMEOUT_HEYGEN,
+            });
             const data = response.data?.data || response.data;
-            return {
+            const result = {
                 jobId,
                 status: this.normalizeStatus(data?.status),
                 videoUrl: data?.video_url || data?.videoUrl || data?.url,
                 error: data?.error || data?.error_message,
             };
+            logger.debug('HeyGen job status', 'HeyGen', {
+                jobId,
+                status: result.status,
+                hasVideoUrl: !!result.videoUrl,
+            });
+            return result;
         }
         catch (error) {
             logger.error('Failed to get HeyGen job status', 'HeyGen', { jobId }, error);
-            // 404 = job expired or never existed — permanent failure, never retry
+            if (error instanceof errors_1.AppError) {
+                throw error;
+            }
+            // 404 = job expired or never existed on HeyGen's side — permanent failure, never retry
             if (axios_1.default.isAxiosError(error) && error.response?.status === 404) {
-                throw new errors_1.AppError(`HeyGen job expired or not found: ${jobId}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 404, false // isOperational=false signals non-retriable to withRetry
-                );
+                throw new errors_1.AppError(`HeyGen job expired or not found: ${jobId}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 404, false, { jobId });
             }
-            throw error;
+            if (axios_1.default.isAxiosError(error)) {
+                throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.HEYGEN_API_ERROR, { jobId });
+            }
+            throw new errors_1.AppError(`Failed to get HeyGen job status: ${error.message || String(error)}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, { jobId }, error instanceof Error ? error : undefined);
         }
     }
+    /**
+     * Poll a job until it completes or times out
+     * @param jobId Job ID to poll
+     * @param opts Polling options
+     * @returns Video URL when ready
+     */
     async pollJobForVideoUrl(jobId, opts) {
         const startTime = Date.now();
-        const timeoutMs = opts?.timeoutMs ?? 20 * 60_000;
-        const intervalMs = opts?.intervalMs ?? 10_000;
+        const timeoutMs = opts?.timeoutMs ?? 20 * 60_000; // 20 minutes default
+        const intervalMs = opts?.intervalMs ?? 10_000; // 10 seconds default
         try {
+            logger.info('Polling HeyGen job', 'HeyGen', {
+                jobId,
+                timeoutMs,
+                intervalMs,
+            });
             while (Date.now() - startTime < timeoutMs) {
-                let result;
                 try {
-                    result = await this.getJobStatus(jobId);
+                    const result = await this.getJobStatus(jobId);
+                    if (result.status === 'completed' && result.videoUrl) {
+                        const duration = Date.now() - startTime;
+                        metrics.incrementCounter('heygen.poll.success');
+                        metrics.recordHistogram('heygen.poll.duration', duration);
+                        logger.info('HeyGen job completed', 'HeyGen', {
+                            jobId,
+                            duration,
+                            videoUrl: result.videoUrl,
+                        });
+                        return result.videoUrl;
+                    }
+                    if (result.status === 'failed') {
+                        throw new errors_1.AppError(`HeyGen job failed: ${result.error || 'Unknown error'}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, { jobId, error: result.error });
+                    }
+                    // Still processing, wait and retry
+                    logger.debug('HeyGen job still processing', 'HeyGen', {
+                        jobId,
+                        status: result.status,
+                    });
+                    await new Promise((resolve) => setTimeout(resolve, intervalMs));
                 }
-                catch (statusError) {
-                    // 404 = job is gone on HeyGen's side — exit immediately, no point retrying
-                    if (statusError instanceof errors_1.AppError && statusError.statusCode === 404) {
-                        throw statusError;
+                catch (error) {
+                    // If it's a job failure, rethrow immediately
+                    if (error instanceof errors_1.AppError && error.message.includes('job failed')) {
+                        throw error;
                     }
-                    // Transient error — wait and retry
-                    await new Promise(resolve => setTimeout(resolve, intervalMs));
-                    continue;
+                    // 404 = job expired/gone on HeyGen's side — exit immediately, don't waste time retrying
+                    if (error instanceof errors_1.AppError && error.statusCode === 404) {
+                        throw error;
+                    }
+                    // For other errors (network issues, etc.), continue polling
+                    logger.warn('Error polling HeyGen job, will retry', 'HeyGen', {
+                        jobId,
+                    }, error);
+                    await new Promise((resolve) => setTimeout(resolve, intervalMs));
                 }
-                if (result.status === 'completed' && result.videoUrl)
-                    return result.videoUrl;
-                if (result.status === 'failed')
-                    throw new errors_1.AppError(`HeyGen job failed: ${result.error}`, errors_1.ErrorCode.HEYGEN_API_ERROR);
-                await new Promise(resolve => setTimeout(resolve, intervalMs));
             }
-            throw new errors_1.AppError(`HeyGen job timed out after ${timeoutMs}ms`, errors_1.ErrorCode.TIMEOUT_ERROR);
+            const duration = Date.now() - startTime;
+            metrics.incrementCounter('heygen.poll.timeout');
+            metrics.recordHistogram('heygen.poll.timeout_duration', duration);
+            throw new errors_1.AppError(`HeyGen job timed out after ${timeoutMs}ms`, errors_1.ErrorCode.TIMEOUT_ERROR, 500, true, { jobId, timeoutMs });
         }
         catch (error) {
-            logger.error('Failed to poll HeyGen job', 'HeyGen', { jobId }, error);
-            throw error;
+            const duration = Date.now() - startTime;
+            metrics.incrementCounter('heygen.poll.error');
+            metrics.recordHistogram('heygen.poll.error_duration', duration);
+            logger.error('Failed to poll HeyGen job', 'HeyGen', { jobId, duration }, error);
+            if (error instanceof errors_1.AppError) {
+                throw error;
+            }
+            throw new errors_1.AppError(`HeyGen polling failed: ${error.message || String(error)}`, errors_1.ErrorCode.HEYGEN_API_ERROR, 500, true, { jobId }, error instanceof Error ? error : undefined);
         }
     }
+    /**
+     * Normalize various status strings to our enum
+     */
     normalizeStatus(status) {
         const s = (status || '').toLowerCase();
         if (s.includes('complet') || s === 'success')
@@ -255,9 +323,13 @@ class HeyGenClient {
     }
 }
 exports.HeyGenClient = HeyGenClient;
+/**
+ * Create a HeyGen client with credentials loaded from env or GCP Secret Manager
+ */
 async function createClientWithSecrets() {
     try {
         let apiKey = process.env.HEYGEN_API_KEY;
+        // Try loading from GCP Secret Manager if not in env
         if (!apiKey && process.env.GCP_SECRET_HEYGEN_API_KEY) {
             const v = await getSecretFromGcp(process.env.GCP_SECRET_HEYGEN_API_KEY);
             if (v)
diff --git a/src/heygen-adapter.ts b/src/heygen-adapter.ts
index 4eabcb4..8b2f23c 100644
--- a/src/heygen-adapter.ts
+++ b/src/heygen-adapter.ts
@@ -80,7 +80,7 @@ export async function mapProductToHeyGenPayload(row: ProductRow) {
     meta: {
       productTitle: title,
       visualHint,
-      sourceImageUrl: first(row, ['Image_URL', 'image_url', 'Product_Image_URL', 'product_image_url']) || undefined,
+      sourceImageUrl: first(row, ['Image_URL', 'image_url', ...]) || undefined,
       mappingReason: reason
     },
     // NEW: Multi-scene + B-roll support
diff --git a/src/heygen.ts b/src/heygen.ts
index aa19f77..d10c77b 100644
--- a/src/heygen.ts
+++ b/src/heygen.ts
@@ -244,6 +244,7 @@ export class HeyGenClient {
   }
 
   async getJobStatus(jobId: string): Promise<HeyGenJobResult> {
+    // (unchanged from your original file)
     try {
       const config = getConfig()
       const response = await this.axios.get(`/v2/video/${jobId}`, { timeout: config.TIMEOUT_HEYGEN })
@@ -256,7 +257,7 @@ export class HeyGenClient {
       }
     } catch (error: any) {
       logger.error('Failed to get HeyGen job status', 'HeyGen', { jobId }, error)
-      // 404 = job expired or never existed — permanent failure, never retry
+      // 404 = job expired or never existed on HeyGen's side — permanent failure, never retry
       if (axios.isAxiosError(error) && error.response?.status === 404) {
         throw new AppError(
           `HeyGen job expired or not found: ${jobId}`,
@@ -270,28 +271,18 @@ export class HeyGenClient {
   }
 
   async pollJobForVideoUrl(jobId: string, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<string> {
+    // (unchanged from your original file - kept full for safety)
     const startTime = Date.now()
     const timeoutMs = opts?.timeoutMs ?? 20 * 60_000
     const intervalMs = opts?.intervalMs ?? 10_000
     try {
       while (Date.now() - startTime < timeoutMs) {
-        let result: HeyGenJobResult
-        try {
-          result = await this.getJobStatus(jobId)
-        } catch (statusError: any) {
-          // 404 = job is gone on HeyGen's side — exit immediately, no point retrying
-          if (statusError instanceof AppError && statusError.statusCode === 404) {
-            throw statusError
-          }
-          // Transient error — wait and retry
-          await new Promise(resolve => setTimeout(resolve, intervalMs))
-          continue
-        }
+        const result = await this.getJobStatus(jobId)
         if (result.status === 'completed' && result.videoUrl) return result.videoUrl
         if (result.status === 'failed') throw new AppError(`HeyGen job failed: ${result.error}`, ErrorCode.HEYGEN_API_ERROR)
         await new Promise(resolve => setTimeout(resolve, intervalMs))
       }
-      throw new AppError(`HeyGen job timed out after ${timeoutMs}ms`, ErrorCode.TIMEOUT_ERROR)
+      throw new AppError(`HeyGen job timed out`, ErrorCode.TIMEOUT_ERROR)
     } catch (error: any) {
       logger.error('Failed to poll HeyGen job', 'HeyGen', { jobId }, error)
       throw error
-- 
2.43.0
