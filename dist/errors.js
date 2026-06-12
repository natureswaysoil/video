"use strict";
/**
 * Standardized error types and error handling utilities
 * Phase 1.1: Consistent error handling across all files
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = exports.ErrorCode = void 0;
exports.ok = ok;
exports.err = err;
exports.wrapAsync = wrapAsync;
exports.getErrorMessage = getErrorMessage;
exports.isNetworkError = isNetworkError;
exports.isTimeoutError = isTimeoutError;
exports.isRateLimitError = isRateLimitError;
exports.fromAxiosError = fromAxiosError;
exports.withRetry = withRetry;
var ErrorCode;
(function (ErrorCode) {
    // API Integration Errors
    ErrorCode["OPENAI_API_ERROR"] = "OPENAI_API_ERROR";
    ErrorCode["DID_API_ERROR"] = "DID_API_ERROR";
    ErrorCode["HEYGEN_API_ERROR"] = "HEYGEN_API_ERROR";
    ErrorCode["SHEETS_API_ERROR"] = "SHEETS_API_ERROR";
    ErrorCode["TWITTER_API_ERROR"] = "TWITTER_API_ERROR";
    ErrorCode["YOUTUBE_API_ERROR"] = "YOUTUBE_API_ERROR";
    ErrorCode["PINTEREST_API_ERROR"] = "PINTEREST_API_ERROR";
    ErrorCode["INSTAGRAM_API_ERROR"] = "INSTAGRAM_API_ERROR";
    ErrorCode["FACEBOOK_API_ERROR"] = "FACEBOOK_API_ERROR";
    // Configuration Errors
    ErrorCode["MISSING_CONFIG"] = "MISSING_CONFIG";
    ErrorCode["INVALID_CONFIG"] = "INVALID_CONFIG";
    // Processing Errors
    ErrorCode["CSV_PARSING_ERROR"] = "CSV_PARSING_ERROR";
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["PROCESSING_ERROR"] = "PROCESSING_ERROR";
    // Network Errors
    ErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    ErrorCode["TIMEOUT_ERROR"] = "TIMEOUT_ERROR";
    // Resource Errors
    ErrorCode["MEMORY_ERROR"] = "MEMORY_ERROR";
    ErrorCode["FILE_OPERATION_ERROR"] = "FILE_OPERATION_ERROR";
    // Rate Limiting
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    // Authentication
    ErrorCode["AUTH_ERROR"] = "AUTH_ERROR";
    ErrorCode["WEBHOOK_AUTH_ERROR"] = "WEBHOOK_AUTH_ERROR";
    // Duplicate Processing
    ErrorCode["DUPLICATE_PROCESSING"] = "DUPLICATE_PROCESSING";
    // Unknown
    ErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
class AppError extends Error {
    constructor(message, code = ErrorCode.UNKNOWN_ERROR, statusCode = 500, isOperational = true, context, originalError) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.context = context;
        this.originalError = originalError;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.AppError = AppError;
function ok(data) {
    return { success: true, data };
}
function err(error) {
    return { success: false, error };
}
function wrapAsync(fn) {
    return async (...args) => {
        try {
            const data = await fn(...args);
            return ok(data);
        }
        catch (error) {
            if (error instanceof AppError)
                return err(error);
            return err(new AppError(error instanceof Error ? error.message : String(error), ErrorCode.UNKNOWN_ERROR, 500, true, undefined, error instanceof Error ? error : undefined));
        }
    };
}
function getErrorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === 'string')
        return error;
    if (error && typeof error === 'object') {
        if ('message' in error && typeof error.message === 'string')
            return error.message;
        return JSON.stringify(error);
    }
    return String(error);
}
function isNetworkError(error) {
    if (!error || typeof error !== 'object')
        return false;
    const msg = getErrorMessage(error).toLowerCase();
    return (msg.includes('network') ||
        msg.includes('econnrefused') ||
        msg.includes('enotfound') ||
        msg.includes('etimedout') ||
        msg.includes('socket') ||
        'code' in error && error.code === 'ECONNREFUSED');
}
function isTimeoutError(error) {
    if (!error || typeof error !== 'object')
        return false;
    const msg = getErrorMessage(error).toLowerCase();
    return (msg.includes('timeout') ||
        msg.includes('etimedout') ||
        'code' in error && error.code === 'ETIMEDOUT');
}
function isRateLimitError(error) {
    if (!error || typeof error !== 'object')
        return false;
    const msg = getErrorMessage(error).toLowerCase();
    return (msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('429') ||
        'response' in error && error.response?.status === 429);
}
function fromAxiosError(error, code, context) {
    const message = error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || 'Unknown API error';
    const statusCode = error?.response?.status || 500;
    return new AppError(message, code, statusCode, true, {
        ...context,
        statusCode,
        url: error?.config?.url,
        method: error?.config?.method,
    }, error);
}
async function withRetry(operation, options = {}) {
    const { maxRetries = 3, initialDelayMs = 1000, maxDelayMs = 30000, backoffMultiplier = 2, retryIf = (error) => isNetworkError(error) || isTimeoutError(error) || isRateLimitError(error), onRetry, } = options;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxRetries || !retryIf(error))
                throw error;
            onRetry?.(error, attempt + 1);
            const delay = Math.min(initialDelayMs * Math.pow(backoffMultiplier, attempt), maxDelayMs);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}
