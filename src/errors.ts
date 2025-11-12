
/**
 * Standardized error types and error handling utilities
 * Phase 1.1: Consistent error handling across all files
 */

export enum ErrorCode {
  // API Integration Errors
  OPENAI_API_ERROR = 'OPENAI_API_ERROR',
  HEYGEN_API_ERROR = 'HEYGEN_API_ERROR',
  SHEETS_API_ERROR = 'SHEETS_API_ERROR',
  TWITTER_API_ERROR = 'TWITTER_API_ERROR',
  YOUTUBE_API_ERROR = 'YOUTUBE_API_ERROR',
  PINTEREST_API_ERROR = 'PINTEREST_API_ERROR',
  INSTAGRAM_API_ERROR = 'INSTAGRAM_API_ERROR',
  
  // Configuration Errors
  MISSING_CONFIG = 'MISSING_CONFIG',
  INVALID_CONFIG = 'INVALID_CONFIG',
  
  // Processing Errors
  CSV_PARSING_ERROR = 'CSV_PARSING_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  
  // Network Errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // Resource Errors
  MEMORY_ERROR = 'MEMORY_ERROR',
  FILE_OPERATION_ERROR = 'FILE_OPERATION_ERROR',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Authentication
  AUTH_ERROR = 'AUTH_ERROR',
  WEBHOOK_AUTH_ERROR = 'WEBHOOK_AUTH_ERROR',
  
  // Duplicate Processing
  DUPLICATE_PROCESSING = 'DUPLICATE_PROCESSING',
  
  // Unknown
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly context?: Record<string, any>
  public readonly originalError?: Error

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>,
    originalError?: Error
  ) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.context = context
    this.originalError = originalError

    if ((Error as any).captureStackTrace) { (Error as any).captureStackTrace(this, this.constructor) }
  }
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = AppError> = 
  | { success: true; data: T }
  | { success: false; error: E }

/**
 * Create a success result
 */
export function ok<T>(data: T): Result<T> {
  return { success: true, data }
}

/**
 * Create an error result
 */
export function err<E = AppError>(error: E): Result<never, E> {
  return { success: false, error }
}

/**
 * Wrap an async function to return Result instead of throwing
 */
export function wrapAsync<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<Result<T>> {
  return async (...args: Args): Promise<Result<T>> => {
    try {
      const data = await fn(...args)
      return ok(data)
    } catch (error) {
      if (error instanceof AppError) {
        return err(error)
      }
      return err(new AppError(
        error instanceof Error ? error.message : String(error),
        ErrorCode.UNKNOWN_ERROR,
        500,
        true,
        undefined,
        error instanceof Error ? error : undefined
      ))
    }
  }
}

/**
 * Extract error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      return error.message
    }
    return JSON.stringify(error)
  }
  return String(error)
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const msg = getErrorMessage(error).toLowerCase()
  return (
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    'code' in error && (error as any).code === 'ECONNREFUSED'
  )
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const msg = getErrorMessage(error).toLowerCase()
  return (
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    'code' in error && (error as any).code === 'ETIMEDOUT'
  )
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const msg = getErrorMessage(error).toLowerCase()
  return (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('429') ||
    'response' in error && (error as any).response?.status === 429
  )
}

/**
 * Create an error from an axios error
 */
export function fromAxiosError(error: any, code: ErrorCode, context?: Record<string, any>): AppError {
  const message = error?.response?.data?.message 
    || error?.response?.data?.error
    || error?.message 
    || 'Unknown API error'
  
  const statusCode = error?.response?.status || 500
  
  return new AppError(
    message,
    code,
    statusCode,
    true,
    {
      ...context,
      statusCode,
      url: error?.config?.url,
      method: error?.config?.method,
    },
    error
  )
}

/**
 * Retry an async operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelayMs?: number
    maxDelayMs?: number
    backoffMultiplier?: number
    retryIf?: (error: unknown) => boolean
    onRetry?: (error: unknown, attempt: number) => void
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    retryIf = (error) => isNetworkError(error) || isTimeoutError(error) || isRateLimitError(error),
    onRetry,
  } = options

  let lastError: unknown
  let delay = initialDelayMs

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      
      if (attempt === maxRetries || !retryIf(error)) {
        throw error
      }

      if (onRetry) {
        onRetry(error, attempt + 1)
      }

      await new Promise(resolve => setTimeout(resolve, delay))
      delay = Math.min(delay * backoffMultiplier, maxDelayMs)
    }
  }

  throw lastError
}
