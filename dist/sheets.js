"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markRowPosted = markRowPosted;
exports.writeColumnValues = writeColumnValues;
exports.writeColumnLetterValues = writeColumnLetterValues;
const google_auth_library_1 = require("google-auth-library");
const googleapis_1 = require("googleapis");
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
async function markRowPosted(params) {
    const startTime = Date.now();
    try {
        const { spreadsheetId, sheetGid, rowNumber, headers, postedColumn = process.env.CSV_COL_POSTED || 'Posted', timestampColumn = process.env.CSV_COL_POSTED_AT || 'Posted_At', } = params;
        if (!spreadsheetId || !headers || headers.length === 0) {
            throw new errors_1.AppError('Missing required parameters for markRowPosted', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, { hasSpreadsheetId: !!spreadsheetId, headersCount: headers?.length || 0 });
        }
        logger.debug('Marking row as posted', 'Sheets', {
            spreadsheetId,
            rowNumber,
            postedColumn,
        });
        const clientEmail = process.env.GS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = (process.env.GS_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n') || undefined;
        const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
        let authClient;
        if (clientEmail && privateKey) {
            // Use explicit service account key if provided
            authClient = new googleapis_1.google.auth.JWT({ email: clientEmail, key: privateKey, scopes });
        }
        else {
            // Fallback to Application Default Credentials (e.g., Cloud Run Job's service account)
            const ga = new google_auth_library_1.GoogleAuth({ scopes });
            authClient = await ga.getClient();
        }
        const sheets = googleapis_1.google.sheets({ version: 'v4', auth: authClient });
        // Resolve A1 notation for the target sheet and columns
        const sheetName = await resolveSheetName(sheets, spreadsheetId, sheetGid);
        const postedColIndex = Math.max(0, headers.indexOf(postedColumn));
        const tsColIndex = timestampColumn ? Math.max(0, headers.indexOf(timestampColumn)) : -1;
        const postedA1 = a1(sheetName, rowNumber, postedColIndex + 1);
        const tsA1 = tsColIndex >= 0 ? a1(sheetName, rowNumber, tsColIndex + 1) : undefined;
        const data = [{ range: postedA1, values: [['TRUE']] }];
        if (tsA1)
            data.push({ range: tsA1, values: [[new Date().toISOString()]] });
        await (0, errors_1.withRetry)(async () => {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data,
                },
            });
        }, {
            maxRetries: 3,
            onRetry: (error, attempt) => {
                logger.warn('Retrying markRowPosted', 'Sheets', {
                    attempt,
                    spreadsheetId,
                    rowNumber,
                    error: error instanceof Error ? error.message : String(error),
                });
            },
        });
        const duration = Date.now() - startTime;
        metrics.incrementCounter('sheets.mark_posted.success');
        metrics.recordHistogram('sheets.mark_posted.duration', duration);
        logger.debug('Successfully marked row as posted', 'Sheets', {
            spreadsheetId,
            rowNumber,
            duration,
        });
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('sheets.mark_posted.error');
        metrics.recordHistogram('sheets.mark_posted.error_duration', duration);
        logger.error('Failed to mark row as posted', 'Sheets', {
            spreadsheetId: params.spreadsheetId,
            rowNumber: params.rowNumber,
            duration,
        }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw new errors_1.AppError(`Failed to mark row as posted: ${error.message || String(error)}`, errors_1.ErrorCode.SHEETS_API_ERROR, 500, true, { spreadsheetId: params.spreadsheetId, rowNumber: params.rowNumber }, error instanceof Error ? error : undefined);
    }
}
async function writeColumnValues(params) {
    const startTime = Date.now();
    try {
        const { spreadsheetId, sheetGid, headers, columnName, rows } = params;
        if (!spreadsheetId || !headers || !columnName || !rows) {
            throw new errors_1.AppError('Missing required parameters for writeColumnValues', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, {
                hasSpreadsheetId: !!spreadsheetId,
                headersCount: headers?.length || 0,
                hasColumnName: !!columnName,
                rowsCount: rows?.length || 0,
            });
        }
        logger.debug('Writing column values', 'Sheets', {
            spreadsheetId,
            columnName,
            rowCount: rows.length,
        });
        const clientEmail = process.env.GS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = (process.env.GS_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n') || undefined;
        const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
        let authClient;
        if (clientEmail && privateKey) {
            authClient = new googleapis_1.google.auth.JWT({ email: clientEmail, key: privateKey, scopes });
        }
        else {
            const ga = new google_auth_library_1.GoogleAuth({ scopes });
            authClient = await ga.getClient();
        }
        const sheets = googleapis_1.google.sheets({ version: 'v4', auth: authClient });
        const sheetName = await resolveSheetName(sheets, spreadsheetId, sheetGid);
        let colIndex = headers.indexOf(columnName);
        const data = [];
        if (colIndex === -1) {
            // Create header in the next empty column
            colIndex = headers.length;
            const headerCell = a1(sheetName, 1, colIndex + 1);
            data.push({ range: headerCell, values: [[columnName]] });
        }
        for (const r of rows) {
            if (typeof r.value !== 'string' || r.value.length === 0)
                continue;
            const cell = a1(sheetName, r.rowNumber, colIndex + 1);
            data.push({ range: cell, values: [[r.value]] });
        }
        if (data.length === 0) {
            logger.debug('No data to write', 'Sheets', { spreadsheetId, columnName });
            return;
        }
        await (0, errors_1.withRetry)(async () => {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data,
                },
            });
        }, {
            maxRetries: 3,
            onRetry: (error, attempt) => {
                logger.warn('Retrying writeColumnValues', 'Sheets', {
                    attempt,
                    spreadsheetId,
                    columnName,
                    error: error instanceof Error ? error.message : String(error),
                });
            },
        });
        const duration = Date.now() - startTime;
        metrics.incrementCounter('sheets.write_column.success');
        metrics.recordHistogram('sheets.write_column.duration', duration);
        logger.debug('Successfully wrote column values', 'Sheets', {
            spreadsheetId,
            columnName,
            cellsWritten: data.length,
            duration,
        });
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('sheets.write_column.error');
        metrics.recordHistogram('sheets.write_column.error_duration', duration);
        logger.error('Failed to write column values', 'Sheets', {
            spreadsheetId: params.spreadsheetId,
            columnName: params.columnName,
            duration,
        }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw new errors_1.AppError(`Failed to write column values: ${error.message || String(error)}`, errors_1.ErrorCode.SHEETS_API_ERROR, 500, true, { spreadsheetId: params.spreadsheetId, columnName: params.columnName }, error instanceof Error ? error : undefined);
    }
}
async function writeColumnLetterValues(params) {
    const startTime = Date.now();
    try {
        const { spreadsheetId, sheetGid, columnLetter, rows } = params;
        if (!spreadsheetId || !columnLetter || !rows) {
            throw new errors_1.AppError('Missing required parameters for writeColumnLetterValues', errors_1.ErrorCode.VALIDATION_ERROR, 400, true, {
                hasSpreadsheetId: !!spreadsheetId,
                hasColumnLetter: !!columnLetter,
                rowsCount: rows?.length || 0,
            });
        }
        logger.debug('Writing column letter values', 'Sheets', {
            spreadsheetId,
            columnLetter,
            rowCount: rows.length,
        });
        const clientEmail = process.env.GS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = (process.env.GS_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n') || undefined;
        const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
        let authClient;
        if (clientEmail && privateKey) {
            authClient = new googleapis_1.google.auth.JWT({ email: clientEmail, key: privateKey, scopes });
        }
        else {
            const ga = new google_auth_library_1.GoogleAuth({ scopes });
            authClient = await ga.getClient();
        }
        const sheets = googleapis_1.google.sheets({ version: 'v4', auth: authClient });
        const sheetName = await resolveSheetName(sheets, spreadsheetId, sheetGid);
        const data = [];
        for (const r of rows) {
            if (typeof r.value !== 'string' || r.value.length === 0)
                continue;
            const cell = `${sheetName}!${columnLetter}${r.rowNumber}`;
            data.push({ range: cell, values: [[r.value]] });
        }
        if (data.length === 0) {
            logger.debug('No data to write', 'Sheets', { spreadsheetId, columnLetter });
            return;
        }
        await (0, errors_1.withRetry)(async () => {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data,
                },
            });
        }, {
            maxRetries: 3,
            onRetry: (error, attempt) => {
                logger.warn('Retrying writeColumnLetterValues', 'Sheets', {
                    attempt,
                    spreadsheetId,
                    columnLetter,
                    error: error instanceof Error ? error.message : String(error),
                });
            },
        });
        const duration = Date.now() - startTime;
        metrics.incrementCounter('sheets.write_column_letter.success');
        metrics.recordHistogram('sheets.write_column_letter.duration', duration);
        logger.debug('Successfully wrote column letter values', 'Sheets', {
            spreadsheetId,
            columnLetter,
            cellsWritten: data.length,
            duration,
        });
    }
    catch (error) {
        const duration = Date.now() - startTime;
        metrics.incrementCounter('sheets.write_column_letter.error');
        metrics.recordHistogram('sheets.write_column_letter.error_duration', duration);
        logger.error('Failed to write column letter values', 'Sheets', {
            spreadsheetId: params.spreadsheetId,
            columnLetter: params.columnLetter,
            duration,
        }, error);
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw new errors_1.AppError(`Failed to write column letter values: ${error.message || String(error)}`, errors_1.ErrorCode.SHEETS_API_ERROR, 500, true, { spreadsheetId: params.spreadsheetId, columnLetter: params.columnLetter }, error instanceof Error ? error : undefined);
    }
}
async function resolveSheetName(sheets, spreadsheetId, gid) {
    try {
        if (!gid)
            return 'Sheet1';
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const targetId = Number(gid);
        const found = meta.data.sheets?.find((s) => s.properties?.sheetId === targetId);
        return found?.properties?.title || 'Sheet1';
    }
    catch (error) {
        logger.warn('Failed to resolve sheet name, using default', 'Sheets', {
            spreadsheetId,
            gid,
        }, error);
        return 'Sheet1';
    }
}
function a1(sheet, row, col) {
    return `${sheet}!${columnToLetter(col)}${row}`;
}
function columnToLetter(col) {
    let temp = '';
    while (col > 0) {
        const rem = (col - 1) % 26;
        temp = String.fromCharCode(65 + rem) + temp;
        col = Math.floor((col - 1) / 26);
    }
    return temp;
}
