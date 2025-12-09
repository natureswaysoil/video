"use strict";
/**
 * Global error handler for the application
 * Catches unhandled errors and logs them properly
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleError = handleError;
exports.setupGlobalErrorHandlers = setupGlobalErrorHandlers;
exports.expressErrorHandler = expressErrorHandler;
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const logger_2 = require("./logger");
const error_sanitizer_1 = require("./error-sanitizer");
const logger = (0, logger_1.getLogger)();
const metrics = (0, logger_2.getMetrics)();
/**
 * Handle an error with proper logging and metrics
 */
function handleError(error, context) {
    // Convert to AppError if needed
    let appError;
    if (error instanceof errors_1.AppError) {
        appError = error;
    }
    else if (error instanceof Error) {
        appError = new errors_1.AppError(error.message, errors_1.ErrorCode.UNKNOWN_ERROR, 500, true, undefined, error);
    }
    else {
        appError = new errors_1.AppError(String(error), errors_1.ErrorCode.UNKNOWN_ERROR, 500, true);
    }
    // Log the error
    logger.error(appError.message, context || 'GlobalErrorHandler', {
        code: appError.code,
        statusCode: appError.statusCode,
        isOperational: appError.isOperational,
        context: appError.context,
    }, appError.originalError || appError);
    // Record metrics
    metrics.incrementCounter(`errors.${appError.code.toLowerCase()}`);
    if (!appError.isOperational) {
        metrics.incrementCounter('errors.non_operational');
    }
    return appError;
}
/**
 * Setup global error handlers for uncaught exceptions and rejections
 */
function setupGlobalErrorHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception', 'GlobalErrorHandler', {}, error);
        metrics.incrementCounter('errors.uncaught_exception');
        // For non-operational errors, exit the process
        const appError = handleError(error, 'UncaughtException');
        if (!appError.isOperational) {
            logger.error('Non-operational error detected, exiting process', 'GlobalErrorHandler');
            process.exit(1);
        }
    });
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled rejection', 'GlobalErrorHandler', {}, reason);
        metrics.incrementCounter('errors.unhandled_rejection');
        const appError = handleError(reason, 'UnhandledRejection');
        if (!appError.isOperational) {
            logger.error('Non-operational error detected, exiting process', 'GlobalErrorHandler');
            process.exit(1);
        }
    });
    // Handle process warnings
    process.on('warning', (warning) => {
        logger.warn('Process warning', 'GlobalErrorHandler', {
            name: warning.name,
            message: warning.message,
        });
    });
    // Handle SIGTERM
    process.on('SIGTERM', () => {
        logger.info('SIGTERM received, gracefully shutting down', 'GlobalErrorHandler');
        // Allow time for cleanup
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    });
    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
        logger.info('SIGINT received, gracefully shutting down', 'GlobalErrorHandler');
        // Allow time for cleanup
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    });
    logger.info('Global error handlers setup complete', 'GlobalErrorHandler');
}
/**
 * Express error handler middleware
 */
function expressErrorHandler() {
    return (error, req, res, next) => {
        const appError = handleError(error, 'ExpressErrorHandler');
        // Send error response
        res.status(appError.statusCode).json({
            error: {
                code: appError.code,
                message: appError.message,
                ...(process.env.NODE_ENV === 'development' && {
                    context: (0, error_sanitizer_1.sanitizeError)(appError.context),
                    stack: appError.stack,
                }),
            },
        });
    };
}
