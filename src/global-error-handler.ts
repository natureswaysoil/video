/**
 * Global error handler for the application
 * Catches unhandled errors and logs them properly
 */

import { AppError, ErrorCode } from './errors'
import { getLogger } from './logger'
import { getMetrics } from './logger'
import { sanitizeError } from './error-sanitizer'

const logger = getLogger()
const metrics = getMetrics()

/**
 * Handle an error with proper logging and metrics
 */
export function handleError(error: unknown, context?: string): AppError {
  // Convert to AppError if needed
  let appError: AppError
  
  if (error instanceof AppError) {
    appError = error
  } else if (error instanceof Error) {
    appError = new AppError(
      error.message,
      ErrorCode.UNKNOWN_ERROR,
      500,
      true,
      undefined,
      error
    )
  } else {
    appError = new AppError(
      String(error),
      ErrorCode.UNKNOWN_ERROR,
      500,
      true
    )
  }

  // Log the error
  logger.error(
    appError.message,
    context || 'GlobalErrorHandler',
    {
      code: appError.code,
      statusCode: appError.statusCode,
      isOperational: appError.isOperational,
      context: appError.context,
    },
    appError.originalError || appError
  )

  // Record metrics
  metrics.incrementCounter(`errors.${appError.code.toLowerCase()}`)
  
  if (!appError.isOperational) {
    metrics.incrementCounter('errors.non_operational')
  }

  return appError
}

/**
 * Setup global error handlers for uncaught exceptions and rejections
 */
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', 'GlobalErrorHandler', {}, error)
    metrics.incrementCounter('errors.uncaught_exception')
    
    // For non-operational errors, exit the process
    const appError = handleError(error, 'UncaughtException')
    if (!appError.isOperational) {
      logger.error('Non-operational error detected, exiting process', 'GlobalErrorHandler')
      process.exit(1)
    }
  })

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled rejection', 'GlobalErrorHandler', {}, reason)
    metrics.incrementCounter('errors.unhandled_rejection')
    
    const appError = handleError(reason, 'UnhandledRejection')
    if (!appError.isOperational) {
      logger.error('Non-operational error detected, exiting process', 'GlobalErrorHandler')
      process.exit(1)
    }
  })

  // Handle process warnings
  process.on('warning', (warning: Error) => {
    logger.warn('Process warning', 'GlobalErrorHandler', {
      name: warning.name,
      message: warning.message,
    })
  })

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, gracefully shutting down', 'GlobalErrorHandler')
    // Allow time for cleanup
    setTimeout(() => {
      process.exit(0)
    }, 1000)
  })

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('SIGINT received, gracefully shutting down', 'GlobalErrorHandler')
    // Allow time for cleanup
    setTimeout(() => {
      process.exit(0)
    }, 1000)
  })

  logger.info('Global error handlers setup complete', 'GlobalErrorHandler')
}

/**
 * Express error handler middleware
 */
export function expressErrorHandler() {
  return (error: any, req: any, res: any, next: any) => {
    const appError = handleError(error, 'ExpressErrorHandler')

    // Send error response
    res.status(appError.statusCode).json({
      error: {
        code: appError.code,
        message: appError.message,
        ...(process.env.NODE_ENV === 'development' && {
          context: sanitizeError(appError.context),
          stack: appError.stack,
        }),
      },
    })
  }
}
