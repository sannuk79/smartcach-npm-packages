import { SmartCache } from 'smartcache';
import type { Request, Response, NextFunction } from 'express';

export interface CacheMiddlewareOptions {
  ttl?: number;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

/**
 * Express middleware for automatic response caching
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  const cache = new SmartCache({
    defaultTTL: options.ttl ?? 300,
  });

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if condition met
    if (options.skip?.(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = options.keyGenerator?.(req) ?? generateCacheKey(req);

    // Try to get from cache
    const cached = cache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', cacheKey);
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = (data: any) => {
      // Cache the response
      cache.set(cacheKey, data, {
        ttl: options.ttl,
        priority: options.priority,
        tags: ['response', req.method, req.path],
      });

      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Key', cacheKey);

      return originalJson(data);
    };

    next();
  };
}

/**
 * Create a shared cache instance for routes
 */
export function createCacheRouter(options: CacheMiddlewareOptions = {}) {
  const cache = new SmartCache({
    defaultTTL: options.ttl ?? 300,
  });

  const router = {
    cache,
    
    /**
     * Cache a specific route
     */
    route(key: string, ttl?: number) {
      return (req: Request, res: Response, next: NextFunction) => {
        const cached = cache.get(key);
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          return res.json(cached);
        }

        const originalJson = res.json.bind(res);
        res.json = (data: any) => {
          cache.set(key, data, {
            ttl: ttl ?? options.ttl,
            priority: options.priority,
          });
          res.setHeader('X-Cache', 'MISS');
          return originalJson(data);
        };

        next();
      };
    },

    /**
     * Get cache stats
     */
    stats() {
      return cache.getStats();
    },

    /**
     * Clear cache by tag
     */
    clearByTag(tag: string) {
      return cache.evictByTag(tag);
    },
  };

  return router;
}

/**
 * Generate cache key from request
 */
function generateCacheKey(req: Request): string {
  const method = req.method;
  const path = req.path;
  const query = JSON.stringify(req.query || {});
  
  // Simple hash
  const hash = Buffer.from(`${method}:${path}:${query}`).toString('base64');
  return `${method}:${path}:${hash}`;
}

/**
 * Cache control headers helper
 */
export function cacheControl(maxAge: number = 300) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    next();
  };
}
