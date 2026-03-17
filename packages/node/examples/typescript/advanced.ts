/**
 * SmartCache Hybrid - TypeScript Advanced Example
 * 
 * Advanced patterns for production use
 */

import { SmartCache, HybridCache, SetOptions } from 'smartcache-hybrid';

// ============================================
// Pattern 1: Rate Limiting with Cache
// ============================================

class RateLimiter {
  private cache: SmartCache;
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    
    this.cache = new SmartCache({
      maxItems: 100000,
      maxSize: '50MB',
      defaultTTL: Math.ceil(windowMs / 1000),
      debug: false,
    });
  }

  async isAllowed(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    const key = `ratelimit:${identifier}`;
    const current = this.cache.get<number>(key) || 0;
    const resetAt = Date.now() + this.windowMs;

    if (current >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    this.cache.set(key, current + 1, {
      ttl: Math.ceil(this.windowMs / 1000),
      priority: 'low',
      tags: ['ratelimit'],
    });

    return {
      allowed: true,
      remaining: this.maxRequests - current - 1,
      resetAt,
    };
  }

  reset(identifier: string): void {
    this.cache.remove(`ratelimit:${identifier}`);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Usage
const rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute

// ============================================
// Pattern 2: Multi-Layer Caching (L1 + L2 + L3)
// ============================================

class MultiLayerCache<T> {
  private l1: SmartCache;      // In-memory (fastest)
  private l2: SmartCache;      // LocalStorage/Disk (fast)
  private l3: HybridCache;     // Redis (slower but large)

  constructor() {
    this.l1 = new SmartCache({
      maxItems: 1000,
      maxSize: '10MB',
      defaultTTL: 60, // 1 minute
    });

    this.l2 = new SmartCache({
      maxItems: 10000,
      maxSize: '100MB',
      defaultTTL: 300, // 5 minutes
    });

    this.l3 = new HybridCache({
      l1MaxItems: 50000,
      l2Storage: 'redis',
      l2MaxSize: '10GB',
      defaultTTL: 3600, // 1 hour
    });
  }

  async get(key: string): Promise<T | undefined> {
    // Try L1 first
    let value = this.l1.get<T>(key);
    if (value) {
      console.log('L1 HIT');
      return value;
    }

    // Try L2
    value = this.l2.get<T>(key);
    if (value) {
      console.log('L2 HIT - promoting to L1');
      this.l1.set(key, value, { ttl: 60 });
      return value;
    }

    // Try L3
    value = await this.l3.get<T>(key);
    if (value) {
      console.log('L3 HIT - promoting to L1 and L2');
      this.l1.set(key, value, { ttl: 60 });
      this.l2.set(key, value, { ttl: 300 });
      return value;
    }

    console.log('MISS - fetch from source');
    return undefined;
  }

  async set(key: string, value: T, options?: SetOptions): Promise<void> {
    // Set all layers
    this.l1.set(key, value, { ...options, ttl: options?.ttl ?? 60 });
    this.l2.set(key, value, { ...options, ttl: options?.ttl ?? 300 });
    await this.l3.set(key, value, options);
  }

  async remove(key: string): Promise<void> {
    this.l1.remove(key);
    this.l2.remove(key);
    await this.l3.remove(key);
  }
}

// ============================================
// Pattern 3: Database Query Cache
// ============================================

class QueryCache {
  private cache: HybridCache;

  constructor() {
    this.cache = new HybridCache({
      l1MaxItems: 5000,
      l2Storage: 'redis',
      l2MaxSize: '5GB',
      compression: true,
      partitioning: true,
      partitionCount: 16,
    });
  }

  async query<T>(
    sql: string,
    params: any[],
    options?: { ttl?: number; tags?: string[] }
  ): Promise<T[]> {
    const cacheKey = `query:${sql}:${JSON.stringify(params)}`;

    // Try cache first
    const cached = await this.cache.get<T[]>(cacheKey);
    if (cached) {
      console.log('Query cache HIT');
      return cached;
    }

    console.log('Query cache MISS - executing query');
    
    // Simulate database query
    const results = await this.executeQuery<T>(sql, params);

    // Cache results
    await this.cache.set(cacheKey, results, {
      ttl: options?.ttl ?? 300,
      tags: options?.tags ?? ['query'],
    });

    return results;
  }

  private async executeQuery<T>(sql: string, params: any[]): Promise<T[]> {
    // Replace with actual database query
    return [] as T[];
  }

  async invalidateByTag(tag: string): Promise<number> {
    return await this.cache.evictByTag(tag);
  }

  async destroy(): Promise<void> {
    await this.cache.destroy();
  }
}

// Usage
const queryCache = new QueryCache();

// ============================================
// Pattern 4: Cache Warming on Startup
// ============================================

class CacheWarmer {
  private cache: HybridCache;

  constructor() {
    this.cache = new HybridCache({
      l1MaxItems: 10000,
      l2Storage: 'redis',
      l2MaxSize: '10GB',
    });
  }

  async warmup(items: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    console.log(`Warming cache with ${items.length} items...`);
    
    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(
        batch.map(item =>
          this.cache.set(item.key, item.value, { ttl: item.ttl })
        )
      );
      console.log(`Warmed ${Math.min(i + batchSize, items.length)}/${items.length}`);
    }
    
    console.log('Cache warming complete!');
  }

  async warmupFromSource<T>(
    keyGenerator: (item: T) => string,
    fetchFunction: () => Promise<T[]>,
    options?: { ttl?: number; tags?: string[] }
  ): Promise<void> {
    const items = await fetchFunction();
    const warmupItems = items.map(item => ({
      key: keyGenerator(item),
      value: item,
      ttl: options?.ttl,
      tags: options?.tags,
    }));
    
    await this.warmup(warmupItems);
  }
}

// Usage
const cacheWarmer = new CacheWarmer();

// Warm cache on application startup
async function startup() {
  await cacheWarmer.warmupFromSource(
    (config: any) => `config:${config.key}`,
    async () => fetchAllConfigs(), // Your function to fetch configs
    { ttl: 3600, tags: ['config'] }
  );
}

// ============================================
// Pattern 5: Circuit Breaker Pattern
// ============================================

class CircuitBreakerCache {
  private cache: SmartCache;
  private failures: Map<string, number> = new Map();
  private circuitOpen: Map<string, number> = new Map();
  
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;

  constructor(
    failureThreshold: number = 5,
    resetTimeout: number = 30000
  ) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    
    this.cache = new SmartCache({
      maxItems: 10000,
      maxSize: '50MB',
    });
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: SetOptions
  ): Promise<T> {
    // Check if circuit is open
    if (this.isCircuitOpen(key)) {
      console.log(`Circuit OPEN for ${key}`);
      throw new Error(`Circuit breaker open for ${key}`);
    }

    try {
      // Try cache first
      const cached = this.cache.get<T>(key);
      if (cached) return cached;

      // Fetch from source
      const value = await factory();
      
      // Cache it
      this.cache.set(key, value, options);
      
      // Reset failures on success
      this.failures.set(key, 0);
      
      return value;
    } catch (error) {
      // Record failure
      const currentFailures = (this.failures.get(key) || 0) + 1;
      this.failures.set(key, currentFailures);
      
      console.log(`Failures for ${key}: ${currentFailures}`);
      
      // Open circuit if threshold reached
      if (currentFailures >= this.failureThreshold) {
        this.circuitOpen.set(key, Date.now());
        console.log(`Circuit OPENED for ${key}`);
      }
      
      throw error;
    }
  }

  private isCircuitOpen(key: string): boolean {
    const openTime = this.circuitOpen.get(key);
    if (!openTime) return false;

    // Check if reset timeout has passed
    if (Date.now() - openTime > this.resetTimeout) {
      this.circuitOpen.delete(key);
      this.failures.set(key, 0);
      return false;
    }

    return true;
  }

  reset(key: string): void {
    this.circuitOpen.delete(key);
    this.failures.set(key, 0);
  }
}

// Usage
const circuitBreaker = new CircuitBreakerCache(5, 30000);

// ============================================
// Pattern 6: Bulk Operations
// ============================================

class BulkCache {
  private cache: HybridCache;

  constructor() {
    this.cache = new HybridCache({
      l1MaxItems: 10000,
      l2Storage: 'redis',
      l2MaxSize: '10GB',
    });
  }

  async setMany<T>(
    items: Array<{ key: string; value: T; options?: SetOptions }>
  ): Promise<void> {
    await Promise.all(items.map(item => this.cache.set(item.key, item.value, item.options)));
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    
    await Promise.all(
      keys.map(async key => {
        const value = await this.cache.get<T>(key);
        if (value !== undefined) {
          results.set(key, value);
        }
      })
    );
    
    return results;
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map(key => this.cache.remove(key)));
  }

  async getByTags<T>(tags: string[]): Promise<Array<{ key: string; value: T }>> {
    const allResults: Array<{ key: string; value: T }> = [];
    
    for (const tag of tags) {
      const results = await this.cache.getByTag<T>(tag);
      allResults.push(...results);
    }
    
    return allResults;
  }
}

// Usage
const bulkCache = new BulkCache();

// Bulk set
await bulkCache.setMany([
  { key: 'user:1', value: { id: 1, name: 'User 1' } },
  { key: 'user:2', value: { id: 2, name: 'User 2' } },
  { key: 'user:3', value: { id: 3, name: 'User 3' } },
]);

// Bulk get
const users = await bulkCache.getMany(['user:1', 'user:2', 'user:3']);

// ============================================
// Exports
// ============================================

export {
  RateLimiter,
  MultiLayerCache,
  QueryCache,
  CacheWarmer,
  CircuitBreakerCache,
  BulkCache,
};
