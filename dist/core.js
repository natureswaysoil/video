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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCsvUrl = processCsvUrl;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const url_cache_1 = require("./url-cache");
const config_validator_1 = require("./config-validator");
const csv_parser_1 = require("./csv-parser");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
const urlCache = (0, url_cache_1.getUrlCache)();
async function processCsvUrl(csvUrl) {
    const startTime = Date.now();
    try {
        let config = (0, config_validator_1.getConfig)();
        if (!config.__validated) {
            logger.info('Defensive config validation before processing CSV', 'Core');
            try {
                const { validateConfig } = await Promise.resolve().then(() => __importStar(require('./config-validator')));
                config = await validateConfig();
            }
            catch (err) {
                throw new errors_1.AppError(`Config validation failed during CSV processing: ${err.message || err}`, errors_1.ErrorCode.VALIDATION_ERROR, 500, true, { csvUrl }, err instanceof Error ? err : undefined);
            }
        }
        if (!csvUrl) {
            throw new errors_1.AppError('CSV URL is required', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasCsvUrl: !!csvUrl });
        }
        logger.info('Processing CSV from URL', 'Core', { csvUrl });
        const cacheKey = `csv:${csvUrl}`;
        const cached = urlCache.get(cacheKey);
        let data;
        if (cached) {
            logger.debug('Using cached CSV data', 'Core', { csvUrl });
            data = cached;
        }
        else {
            logger.debug('Fetching CSV from URL', 'Core', { csvUrl });
            const response = await (0, errors_1.withRetry)(async () => axios_1.default.get(csvUrl, { responseType: 'text', timeout: 30000 }), {
                maxRetries: 3,
                onRetry: (error, attempt) => {
                    logger.warn('Retrying CSV fetch', 'Core', {
                        attempt,
                        csvUrl,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });
            data = response.data;
            urlCache.set(cacheKey, data, 300);
        }
        const parsedRows = (0, csv_parser_1.parseCsv)(data);
        if (parsedRows.length < 2) {
            logger.warn('CSV has no data rows', 'Core', { csvUrl, rowCount: parsedRows.length });
            return { skipped: true, rows: [] };
        }
        const headers = parsedRows[0].map((h) => h.trim());
        if (headers.length === 0 || !headers.some(Boolean)) {
            throw new errors_1.AppError('CSV has no headers', errors_1.ErrorCode.CSV_PARSING_ERROR, 400, true, { csvUrl });
        }
        logger.info('CSV headers parsed', 'Core', {
            csvUrl,
            headerCount: headers.length,
            totalDataRows: parsedRows.length - 1,
            headers: headers.slice(0, 15),
        });
        const rows = [];
        let skippedCount = 0;
        let processedCount = 0;
        const MAX_SAMPLE_ROWS = 3;
        const SAMPLE_COLUMN_COUNT = 5;
        const SAMPLE_COLUMN_CHARS = 50;
        const skipReasons = {
            noJobId: 0,
            alreadyPosted: 0,
            notReady: 0,
        };
        const skippedRowSamples = [];
        for (const [i, cols] of parsedRows.slice(1).entries()) {
            if (!cols.some((value) => String(value || '').trim() !== ''))
                continue;
            const rec = {};
            headers.forEach((h, index) => {
                rec[h] = (cols[index] ?? '').trim();
            });
            const jobId = pickFirst(rec, envKeys('CSV_COL_JOB_ID')) ||
                pickFirst(rec, [
                    'jobId',
                    'job_id',
                    'wavespeed_job_id',
                    'WaveSpeed Job ID',
                    'WAVESPEED_JOB_ID',
                    'job',
                    'ASIN',
                    'Parent_ASIN',
                    'SKU',
                    'Product_ID',
                    'product_id',
                    'id',
                    'ID',
                ]);
            if (!jobId) {
                skipReasons.noJobId++;
                skippedCount++;
                if (skippedRowSamples.length < MAX_SAMPLE_ROWS) {
                    const sampleData = Object.keys(rec).slice(0, SAMPLE_COLUMN_COUNT).reduce((obj, key) => {
                        const val = rec[key];
                        obj[key] = (val && typeof val === 'string') ? val.substring(0, SAMPLE_COLUMN_CHARS) : String(val ?? '');
                        return obj;
                    }, {});
                    skippedRowSamples.push({ rowNumber: i + 2, reason: 'No jobId/ASIN/SKU found', sample: sampleData });
                }
                logger.debug('Skipping row without jobId - no product identifier found', 'Core', {
                    rowNumber: i + 2,
                    csvUrl,
                    availableColumns: Object.keys(rec).slice(0, 10),
                });
                continue;
            }
            const title = pickFirst(rec, envKeys('CSV_COL_TITLE')) ||
                pickFirst(rec, ['title', 'name', 'product', 'Product', 'Title']);
            const details = pickFirst(rec, envKeys('CSV_COL_DETAILS')) ||
                pickFirst(rec, ['details', 'description', 'caption', 'Description', 'Details', 'Caption']);
            const product = {
                id: pickFirst(rec, envKeys('CSV_COL_ID')) || pickFirst(rec, ['id', 'ID']),
                name: pickFirst(rec, envKeys('CSV_COL_NAME')) ||
                    pickFirst(rec, ['name', 'product', 'Product', 'Title']) ||
                    title,
                title: title || pickFirst(rec, ['name']),
                details,
                ...rec,
            };
            const alwaysNew = String(config.ALWAYS_GENERATE_NEW_VIDEO || 'false').toLowerCase() === 'true';
            const posted = pickFirst(rec, envKeys('CSV_COL_POSTED')) || pickFirst(rec, ['Posted', 'posted']);
            if (!alwaysNew && posted && isTruthy(posted, process.env.CSV_STATUS_TRUE_VALUES)) {
                skipReasons.alreadyPosted++;
                skippedCount++;
                if (skippedRowSamples.length < MAX_SAMPLE_ROWS) {
                    skippedRowSamples.push({
                        rowNumber: i + 2,
                        reason: `Already posted (Posted='${posted}')`,
                        sample: { jobId: String(jobId), posted: String(posted) },
                    });
                }
                logger.debug('Skipping already posted row', 'Core', {
                    rowNumber: i + 2,
                    jobId,
                    posted,
                    csvUrl,
                    hint: 'Set ALWAYS_GENERATE_NEW_VIDEO=true to reprocess posted items',
                });
                continue;
            }
            const ready = pickFirst(rec, envKeys('CSV_COL_READY')) ||
                pickFirst(rec, ['Ready', 'ready', 'Status', 'status', 'Enabled', 'enabled', 'Post', 'post']);
            if (ready && isFalsy(ready)) {
                skipReasons.notReady++;
                skippedCount++;
                if (skippedRowSamples.length < MAX_SAMPLE_ROWS) {
                    skippedRowSamples.push({
                        rowNumber: i + 2,
                        reason: `Not ready (Ready/Status='${ready}')`,
                        sample: { jobId: String(jobId), ready: String(ready) },
                    });
                }
                logger.debug('Skipping row that is explicitly not ready', 'Core', { rowNumber: i + 2, jobId, ready, csvUrl });
                continue;
            }
            rows.push({ product, jobId, rowNumber: i + 2, headers, record: rec });
            processedCount++;
        }
        const duration = Date.now() - startTime;
        metrics.incrementCounter('core.process_csv.success');
        metrics.recordHistogram('core.process_csv.duration', duration);
        if (rows.length === 0) {
            logger.warn('No valid products found in CSV after filtering', 'Core', {
                csvUrl,
                totalRows: parsedRows.length,
                totalDataRows: parsedRows.length - 1,
                skippedRows: skippedCount,
                processedRows: processedCount,
                duration,
                availableHeaders: headers,
                skipReasons,
                skippedRowSamples,
                envConfig: {
                    CSV_COL_JOB_ID: process.env.CSV_COL_JOB_ID || 'not set (using defaults)',
                    CSV_COL_POSTED: process.env.CSV_COL_POSTED || 'not set (using defaults)',
                    CSV_COL_READY: process.env.CSV_COL_READY || 'not set (using defaults)',
                    ALWAYS_GENERATE_NEW_VIDEO: process.env.ALWAYS_GENERATE_NEW_VIDEO || 'false',
                },
            });
        }
        else {
            logger.info('CSV processed successfully', 'Core', {
                csvUrl,
                totalRows: parsedRows.length,
                processedRows: processedCount,
                skippedRows: skippedCount,
                duration,
            });
        }
        return { skipped: rows.length === 0, rows };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('core.process_csv.error');
        metrics.recordHistogram('core.process_csv.error_duration', duration);
        logger.error('Failed to process CSV', 'Core', { csvUrl, duration }, error);
        if (error instanceof errors_1.AppError)
            throw error;
        if (axios_1.default.isAxiosError(error))
            throw (0, errors_1.fromAxiosError)(error, errors_1.ErrorCode.CSV_PARSING_ERROR, { csvUrl });
        throw new errors_1.AppError(`CSV processing failed: ${error.message || String(error)}`, errors_1.ErrorCode.CSV_PARSING_ERROR, 500, true, { csvUrl }, error instanceof Error ? error : undefined);
    }
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
    const list = custom ? custom.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : defaults;
    return list.includes(v);
}
function isFalsy(val) {
    if (!val || typeof val !== 'string')
        return false;
    const v = val.trim().toLowerCase();
    const falsyValues = ['0', 'false', 'no', 'n', 'off', 'disabled', 'skip', 'ignore'];
    return falsyValues.includes(v);
}
function envKeys(envName) {
    const raw = process.env[envName];
    if (!raw)
        return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
