
/**
 * Rate limiting with token bucket algorithm
 * Phase 2.4: Implement rate limiting
 */

export class TokenBucket {
  private tokens: number
  private lastRefill: number
  private readonly capacity: number
  private readonly refillRate: number // tokens per second

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity
    this.refillRate = refillRate
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  /**
   * Try to consume tokens
   * Returns true if tokens were consumed, false if insufficient tokens
   */
  tryConsume(tokens: number = 1): boolean {
    this.refill()

    if (this.tokens >= tokens) {
      this.tokens -= tokens
      return true
    }

    return false
  }

  /**
   * Wait until tokens are available and consume them
   */
  async consume(tokens: number = 1): Promise<void> {
    while (!this.tryConsume(tokens)) {
      const waitTime = this.getWaitTime(tokens)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  /**
   * Get the time to wait (in ms) until tokens are available
   */
  private getWaitTime(tokens: number): number {
    this.refill()
    
    if (this.tokens >= tokens) {
      return 0
    }

    const tokensNeeded = tokens - this.tokens
    return Math.ceil((tokensNeeded / this.refillRate) * 1000)
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now()
    const elapsedMs = now - this.lastRefill
    const tokensToAdd = (elapsedMs / 1000) * this.refillRate

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill()
    return this.tokens
  }

  /**
   * Reset the bucket to full capacity
   */
  reset(): void {
    this.tokens = this.capacity
    this.lastRefill = Date.now()
  }
}

export class RateLimiter {
  private buckets: Map<string, TokenBucket>
  private readonly defaultCapacity: number
  private readonly defaultRefillRate: number

  constructor(defaultCapacity: number, defaultRefillRate: number) {
    this.buckets = new Map()
    this.defaultCapacity = defaultCapacity
    this.defaultRefillRate = defaultRefillRate
  }

  /**
   * Get or create a bucket for a key
   */
  private getBucket(key: string): TokenBucket {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, new TokenBucket(this.defaultCapacity, this.defaultRefillRate))
    }
    return this.buckets.get(key)!
  }

  /**
   * Try to consume tokens for a key
   */
  tryConsume(key: string, tokens: number = 1): boolean {
    return this.getBucket(key).tryConsume(tokens)
  }

  /**
   * Wait until tokens are available and consume them
   */
  async consume(key: string, tokens: number = 1): Promise<void> {
    await this.getBucket(key).consume(tokens)
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(key: string, fn: () => Promise<T>, tokens: number = 1): Promise<T> {
    await this.consume(key, tokens)
    return fn()
  }

  /**
   * Reset a specific bucket
   */
  reset(key: string): void {
    const bucket = this.buckets.get(key)
    if (bucket) {
      bucket.reset()
    }
  }

  /**
   * Clear all buckets
   */
  clear(): void {
    this.buckets.clear()
  }
}

// Platform-specific rate limiters
class PlatformRateLimiters {
  private limiters: Map<string, RateLimiter>

  constructor() {
    this.limiters = new Map()
    this.initializeDefaultLimiters()
  }

  private initializeDefaultLimiters(): void {
    // OpenAI: 10 requests per minute
    this.limiters.set('openai', new RateLimiter(10, 10 / 60))
    
    // HeyGen: 5 requests per minute
    this.limiters.set('heygen', new RateLimiter(5, 5 / 60))
    
    // Twitter: 50 posts per day = ~0.58 per minute
    this.limiters.set('twitter', new RateLimiter(50, 50 / (24 * 60)))
    
    // YouTube: 10 uploads per day = ~0.42 per hour
    this.limiters.set('youtube', new RateLimiter(10, 10 / (24 * 60)))
    
    // Instagram: 25 posts per day = ~1 per hour
    this.limiters.set('instagram', new RateLimiter(25, 25 / (24 * 60)))
    
    // Pinterest: 5 pins per second
    this.limiters.set('pinterest', new RateLimiter(5, 5))
  }

  /**
   * Get limiter for a platform
   */
  getLimiter(platform: string): RateLimiter {
    if (!this.limiters.has(platform)) {
      // Default: 10 requests per minute
      this.limiters.set(platform, new RateLimiter(10, 10 / 60))
    }
    return this.limiters.get(platform)!
  }

  /**
   * Execute a function with platform rate limiting
   */
  async execute<T>(
    platform: string,
    fn: () => Promise<T>,
    tokens: number = 1
  ): Promise<T> {
    const limiter = this.getLimiter(platform)
    return limiter.execute(platform, fn, tokens)
  }
}

// Global rate limiters instance
let globalRateLimiters: PlatformRateLimiters | null = null

/**
 * Get or create the global rate limiters instance
 */
export function getRateLimiters(): PlatformRateLimiters {
  if (!globalRateLimiters) {
    globalRateLimiters = new PlatformRateLimiters()
  }
  return globalRateLimiters
}
