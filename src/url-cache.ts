/**
 * URL caching with TTL
 * Phase 2.3: Add URL caching
 */

import NodeCache from 'node-cache'

export class UrlCache {
  private cache: NodeCache

  constructor(options: {
    stdTTL?: number
    checkperiod?: number
    maxKeys?: number
  } = {}) {
    this.cache = new NodeCache({
      stdTTL: options.stdTTL || 3600,
      checkperiod: options.checkperiod || 600,
      maxKeys: options.maxKeys || 1000,
      useClones: false,
    })
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key)
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    return this.cache.set(key, value, ttl || 0)
  }

  delete(key: string): number {
    return this.cache.del(key)
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  clear(): void {
    this.cache.flushAll()
  }

  getStats(): any {
    return this.cache.getStats()
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== undefined) {
      return cached
    }

    const value = await fetcher()
    this.set(key, value, ttl)
    return value
  }
}

let globalUrlCache: UrlCache | null = null

export function getUrlCache(): UrlCache {
  if (!globalUrlCache) {
    globalUrlCache = new UrlCache({
      stdTTL: 3600,
      checkperiod: 600,
      maxKeys: 1000,
    })
  }
  return globalUrlCache
}

export function withUrlCache<Args extends any[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options: {
    keyGenerator: (...args: Args) => string
    ttl?: number
  }
): (...args: Args) => Promise<Result> {
  const cache = getUrlCache()
  
  return async (...args: Args): Promise<Result> => {
    const key = options.keyGenerator(...args)
    
    return cache.getOrFetch(
      key,
      () => fn(...args),
      options.ttl
    )
  }
}
