"use strict";
/**
 * URL caching with TTL
 * Phase 2.3: Add URL caching
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UrlCache = void 0;
exports.getUrlCache = getUrlCache;
exports.withUrlCache = withUrlCache;
const node_cache_1 = __importDefault(require("node-cache"));
class UrlCache {
    constructor(options = {}) {
        this.cache = new node_cache_1.default({
            stdTTL: options.stdTTL || 3600,
            checkperiod: options.checkperiod || 600,
            maxKeys: options.maxKeys || 1000,
            useClones: false,
        });
    }
    get(key) {
        return this.cache.get(key);
    }
    set(key, value, ttl) {
        return this.cache.set(key, value, ttl || 0);
    }
    delete(key) {
        return this.cache.del(key);
    }
    has(key) {
        return this.cache.has(key);
    }
    clear() {
        this.cache.flushAll();
    }
    getStats() {
        return this.cache.getStats();
    }
    async getOrFetch(key, fetcher, ttl) {
        const cached = this.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const value = await fetcher();
        this.set(key, value, ttl);
        return value;
    }
}
exports.UrlCache = UrlCache;
let globalUrlCache = null;
function getUrlCache() {
    if (!globalUrlCache) {
        globalUrlCache = new UrlCache({
            stdTTL: 3600,
            checkperiod: 600,
            maxKeys: 1000,
        });
    }
    return globalUrlCache;
}
function withUrlCache(fn, options) {
    const cache = getUrlCache();
    return async (...args) => {
        const key = options.keyGenerator(...args);
        return cache.getOrFetch(key, () => fn(...args), options.ttl);
    };
}
