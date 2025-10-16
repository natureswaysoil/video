"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCsvUrl = processCsvUrl;
const axios_1 = __importDefault(require("axios"));
async function processCsvUrl(csvUrl) {
    // Fetch CSV and parse all rows; map headers from the provided sheet flexibly.
    const { data } = await axios_1.default.get(csvUrl, { responseType: 'text' });
    const lines = data.split(/\r?\n/);
    if (lines.length < 2)
        return { skipped: true, rows: [] };
    const headers = splitCsvLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (const [i, raw] of lines.slice(1).entries()) {
        if (!raw.trim())
            continue;
        const cols = splitCsvLine(raw);
        if (!cols.some(Boolean))
            continue;
        const rec = {};
        headers.forEach((h, i) => { rec[h] = (cols[i] ?? '').trim(); });
        // Flexible header mapping with env overrides
        const jobId = pickFirst(rec, envKeys('CSV_COL_JOB_ID')) ||
            pickFirst(rec, ['jobId', 'job_id', 'wavespeed_job_id', 'WaveSpeed Job ID', 'WAVESPEED_JOB_ID', 'job']);
        if (!jobId)
            continue; // skip rows missing jobId
        const title = pickFirst(rec, envKeys('CSV_COL_TITLE')) || pickFirst(rec, ['title', 'name', 'product', 'Product', 'Title']);
        const details = pickFirst(rec, envKeys('CSV_COL_DETAILS')) || pickFirst(rec, ['details', 'description', 'caption', 'Description', 'Details', 'Caption']);
        const product = {
            id: pickFirst(rec, envKeys('CSV_COL_ID')) || pickFirst(rec, ['id', 'ID']),
            name: pickFirst(rec, envKeys('CSV_COL_NAME')) || pickFirst(rec, ['name', 'product', 'Product', 'Title']) || title,
            title: title || pickFirst(rec, ['name']),
            details: details,
            ...rec,
        };
        // Optional gating: skip if already posted; require ready/enabled if present
        const posted = pickFirst(rec, envKeys('CSV_COL_POSTED')) || pickFirst(rec, ['Posted', 'posted']);
        if (posted && isTruthy(posted, process.env.CSV_STATUS_TRUE_VALUES)) {
            continue; // don't process already-posted rows
        }
        const ready = pickFirst(rec, envKeys('CSV_COL_READY')) || pickFirst(rec, ['Ready', 'ready', 'Status', 'status', 'Enabled', 'enabled', 'Post', 'post']);
        if (ready && !isTruthy(ready, process.env.CSV_STATUS_TRUE_VALUES)) {
            continue; // skip rows that are explicitly not ready
        }
        rows.push({ product, jobId, rowNumber: i + 2, headers, record: rec });
    }
    return { skipped: rows.length === 0, rows };
}
// Minimal CSV splitter handling quotes and commas
function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { // escaped quote
                current += '"';
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        }
        else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}
function pickFirst(rec, keys) {
    for (const k of keys) {
        const v = rec[k];
        if (v && v.length > 0)
            return v;
    }
    return undefined;
}
function isTruthy(val, custom) {
    const v = val.trim().toLowerCase();
    const defaults = ['1', 'true', 'yes', 'y', 'on', 'post', 'enabled'];
    const list = (custom ? custom.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : defaults);
    return list.includes(v);
}
function envKeys(envName) {
    const raw = process.env[envName];
    if (!raw)
        return [];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}
