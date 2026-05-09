"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logVideoPost = logVideoPost;
// src/analytics-tracker.ts
const googleapis_1 = require("googleapis");
const google_auth_1 = require("./google-auth");
const logger_1 = require("./logger");
const logger = (0, logger_1.getLogger)();
/**
 * Logs video post details + platform URLs back to your exact Google Sheet
 */
async function logVideoPost(sheetId, gid, rows) {
    try {
        const auth = await (0, google_auth_1.createGoogleAuthClient)(['https://www.googleapis.com/auth/spreadsheets']);
        const sheets = googleapis_1.google.sheets({ version: 'v4', auth: auth });
        const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const sheet = meta.data.sheets?.find((s) => String(s.properties?.sheetId) === String(gid));
        if (!sheet)
            throw new Error(`Sheet gid ${gid} not found`);
        const sheetTitle = sheet.properties.title;
        // Write the data into the exact columns you just added
        const values = rows.map(r => [
            r.postedAt, // Instagram_Post_URL
            r.instagramUrl || '',
            r.xUrl || '',
            r.pinterestUrl || '',
            r.youtubeUrl || '',
            new Date().toISOString() // Last_Metrics_Checked_At
        ]);
        // Find the starting column (your new columns start at BZ)
        const startCol = 'BZ'; // ← matches the 5 columns you just added
        const range = `${sheetTitle}!${startCol}2:${startCol}999`;
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range,
            valueInputOption: 'RAW',
            requestBody: { values },
        });
        logger.info(`✅ Logged ${rows.length} video posts to your sheet`, 'Analytics');
        return true;
    }
    catch (error) {
        logger.error('Failed to log video posts', 'Analytics', {}, error);
        return false;
    }
}
exports.default = { logVideoPost };
