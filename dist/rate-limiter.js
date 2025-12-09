"use strict";
/**
 * Rate limiting with token bucket algorithm
 * Phase 2.4: Implement rate limiting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = exports.TokenBucket = void 0;
exports.getRateLimiters = getRateLimiters;
class TokenBucket {
    constructor(capacity, refillRate) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.tokens = capacity;
        this.lastRefill = Date.now();
    }
    /**
     * Try to consume tokens
     * Returns true if tokens were consumed, false if insufficient tokens
     */
    tryConsume(tokens = 1) {
        this.refill();
        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }
        return false;
    }
    /**
     * Wait until tokens are available and consume them
     */
    async consume(tokens = 1) {
        while (!this.tryConsume(tokens)) {
            const waitTime = this.getWaitTime(tokens);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    /**
     * Get the time to wait (in ms) until tokens are available
     */
    getWaitTime(tokens) {
        this.refill();
        if (this.tokens >= tokens) {
            return 0;
        }
        const tokensNeeded = tokens - this.tokens;
        return Math.ceil((tokensNeeded / this.refillRate) * 1000);
    }
    /**
     * Refill tokens based on elapsed time
     */
    refill() {
        const now = Date.now();
        const elapsedMs = now - this.lastRefill;
        const tokensToAdd = (elapsedMs / 1000) * this.refillRate;
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }
    /**
     * Get current token count
     */
    getTokens() {
        this.refill();
        return this.tokens;
    }
    /**
     * Reset the bucket to full capacity
     */
    reset() {
        this.tokens = this.capacity;
        this.lastRefill = Date.now();
    }
}
exports.TokenBucket = TokenBucket;
class RateLimiter {
    constructor(defaultCapacity, defaultRefillRate) {
        this.buckets = new Map();
        this.defaultCapacity = defaultCapacity;
        this.defaultRefillRate = defaultRefillRate;
    }
    /**
     * Get or create a bucket for a key
     */
    getBucket(key) {
        if (!this.buckets.has(key)) {
            this.buckets.set(key, new TokenBucket(this.defaultCapacity, this.defaultRefillRate));
        }
        return this.buckets.get(key);
    }
    /**
     * Try to consume tokens for a key
     */
    tryConsume(key, tokens = 1) {
        return this.getBucket(key).tryConsume(tokens);
    }
    /**
     * Wait until tokens are available and consume them
     */
    async consume(key, tokens = 1) {
        await this.getBucket(key).consume(tokens);
    }
    /**
     * Execute a function with rate limiting
     */
    async execute(key, fn, tokens = 1) {
        await this.consume(key, tokens);
        return fn();
    }
    /**
     * Reset a specific bucket
     */
    reset(key) {
        const bucket = this.buckets.get(key);
        if (bucket) {
            bucket.reset();
        }
    }
    /**
     * Clear all buckets
     */
    clear() {
        this.buckets.clear();
    }
}
exports.RateLimiter = RateLimiter;
// Platform-specific rate limiters
class PlatformRateLimiters {
    constructor() {
        this.limiters = new Map();
        this.initializeDefaultLimiters();
    }
    initializeDefaultLimiters() {
        // OpenAI: 10 requests per minute
        this.limiters.set('openai', new RateLimiter(10, 10 / 60));
        // HeyGen: 5 requests per minute
        this.limiters.set('heygen', new RateLimiter(5, 5 / 60));
        // Twitter: 50 posts per day = ~0.58 per minute
        this.limiters.set('twitter', new RateLimiter(50, 50 / (24 * 60)));
        // YouTube: 10 uploads per day = ~0.42 per hour
        this.limiters.set('youtube', new RateLimiter(10, 10 / (24 * 60)));
        // Instagram: 25 posts per day = ~1 per hour
        this.limiters.set('instagram', new RateLimiter(25, 25 / (24 * 60)));
        // Pinterest: 5 pins per second
        this.limiters.set('pinterest', new RateLimiter(5, 5));
    }
    /**
     * Get limiter for a platform
     */
    getLimiter(platform) {
        if (!this.limiters.has(platform)) {
            // Default: 10 requests per minute
            this.limiters.set(platform, new RateLimiter(10, 10 / 60));
        }
        return this.limiters.get(platform);
    }
    /**
     * Execute a function with platform rate limiting
     */
    async execute(platform, fn, tokens = 1) {
        const limiter = this.getLimiter(platform);
        return limiter.execute(platform, fn, tokens);
    }
}
// Global rate limiters instance
let globalRateLimiters = null;
/**
 * Get or create the global rate limiters instance
 */
function getRateLimiters() {
    if (!globalRateLimiters) {
        globalRateLimiters = new PlatformRateLimiters();
    }
    return globalRateLimiters;
}
