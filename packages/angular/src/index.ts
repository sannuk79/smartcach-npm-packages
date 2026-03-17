/**
 * SmartCache Angular Adapter
 * Lightweight caching for Angular applications
 *
 * Features:
 * - Service-based caching
 * - HTTP Interceptor for auto-caching
 * - Route resolver caching
 * - Component decorator caching
 * - Pipe for template caching
 */

import {
  Injectable,
  Inject,
  Optional,
  InjectionToken,
  PLATFORM_ID,
  Pipe,
  PipeTransform,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import {
  Resolve,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';

// Export utils
export * from './utils';

// Re-export SmartCache types
export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface SetOptions {
  ttl?: number;
  priority?: Priority;
  tags?: string[];
}

export interface CacheStats {
  totalItems: number;
  totalSizeBytes: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

export interface SmartCacheConfig {
  maxItems?: number;
  maxSize?: string | number;
  defaultTTL?: number;
  cleanupInterval?: number;
  enabled?: boolean;
  storage?: 'memory' | 'session' | 'local';
}

/**
 * Simple in-memory cache implementation (lightweight)
 * No external dependencies
 */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private cache = new Map<string, CacheEntry>();
  private stats: CacheStats = {
    totalItems: 0,
    totalSizeBytes: 0,
    hits: 0,
    misses: 0,
    evictions: 0,
    hitRate: 0,
  };
  private config: Required<SmartCacheConfig>;
  private cleanupTimer?: any;

  constructor(
    @Optional()
    @Inject('SMARTCACHE_CONFIG')
    config?: SmartCacheConfig
  ) {
    this.config = {
      maxItems: config?.maxItems ?? 1000,
      maxSize: config?.maxSize ?? '50MB',
      defaultTTL: config?.defaultTTL ?? 300,
      cleanupInterval: config?.cleanupInterval ?? 60,
      enabled: config?.enabled ?? true,
      storage: config?.storage ?? 'memory',
    };

    this.startCleanup();
  }

  /**
   * Set cache value
   */
  set<T>(key: string, value: T, options?: SetOptions): void {
    if (!this.config.enabled) return;

    const ttl = options?.ttl ?? this.config.defaultTTL;
    const priority = options?.priority ?? 'medium';
    const tags = options?.tags ?? [];

    // Evict if needed
    this.maybeEvict();

    const entry: CacheEntry = {
      value,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      ttlSeconds: ttl,
      priority,
      accessCount: 0,
      tags,
    };

    this.cache.set(key, entry);
    this.updateStats();
  }

  /**
   * Get cache value
   */
  get<T>(key: string, defaultValue?: T): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return defaultValue;
    }

    // Check expiry
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateStats();
      return defaultValue;
    }

    // Touch
    entry.lastAccessed = Date.now();
    entry.accessCount++;

    this.stats.hits++;
    this.updateHitRate();
    this.updateStats();

    return entry.value as T;
  }

  /**
   * Get or set (atomic operation)
   */
  getOrSet<T>(key: string, factory: () => T, options?: SetOptions): T {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const value = factory();
    this.set(key, value, options);
    return value;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Remove key
   */
  remove(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all
   */
  clear(): void {
    this.cache.clear();
    this.stats.totalItems = 0;
    this.stats.totalSizeBytes = 0;
  }

  /**
   * Get stats
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get by tag
   */
  getByTag<T>(tag: string): Array<{ key: string; value: T }> {
    const results: Array<{ key: string; value: T }> = [];
    this.cache.forEach((entry, key) => {
      if (entry.tags.includes(tag) && !this.isExpired(entry)) {
        results.push({ key, value: entry.value as T });
      }
    });
    return results;
  }

  /**
   * Evict by tag
   */
  evictByTag(tag: string): number {
    let count = 0;
    this.cache.forEach((_, key) => {
      const entry = this.cache.get(key);
      if (entry?.tags.includes(tag)) {
        this.cache.delete(key);
        count++;
      }
    });
    this.updateStats();
    return count;
  }

  /**
   * Manual cleanup
   */
  cleanup(): { expiredCount: number; freedCount: number } {
    let expiredCount = 0;
    this.cache.forEach((entry, key) => {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        expiredCount++;
      }
    });
    this.updateStats();
    return { expiredCount, freedCount: expiredCount };
  }

  /**
   * Destroy service
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }

  private isExpired(entry: CacheEntry): boolean {
    if (entry.ttlSeconds === 0) return false;
    const age = (Date.now() - entry.createdAt) / 1000;
    return age >= entry.ttlSeconds;
  }

  private maybeEvict(): void {
    if (this.cache.size >= this.config.maxItems) {
      this.evictLRU();
    }
  }

  private evictLRU(): void {
    const priorityOrder: Record<Priority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const entries = Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.priority !== 'critical')
      .sort(
        (a, b) =>
          priorityOrder[a[1].priority] - priorityOrder[b[1].priority] ||
          a[1].lastAccessed - b[1].lastAccessed
      );

    if (entries.length > 0) {
      const [key] = entries[0];
      this.cache.delete(key);
      this.stats.evictions++;
    }
  }

  private updateStats(): void {
    this.stats.totalItems = this.cache.size;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    if (total > 0) {
      this.stats.hitRate = (this.stats.hits / total) * 100;
    }
  }

  private startCleanup(): void {
    if (!isPlatformBrowser(this.config as any)) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval * 1000);
  }
}

interface CacheEntry {
  value: any;
  createdAt: number;
  lastAccessed: number;
  ttlSeconds: number;
  priority: Priority;
  accessCount: number;
  tags: string[];
}

/**
 * HTTP Interceptor for automatic response caching
 */
@Injectable()
export class CacheInterceptor implements HttpInterceptor {
  constructor(private cache: CacheService) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // Skip non-GET requests
    if (req.method !== 'GET') {
      return next.handle(req);
    }

    // Check cache
    const cacheKey = this.getCacheKey(req);
    const cached = this.cache.get<any>(cacheKey);

    if (cached) {
      // Return cached response
      return of(cached);
    }

    // Make request and cache response
    return next.handle(req).pipe(
      tap((event) => {
        // Cache successful responses
        if (this.isResponse(event)) {
          const ttl = this.getTTL(req);
          if (ttl > 0) {
            this.cache.set(cacheKey, event, {
              ttl,
              tags: ['http', req.url],
            });
          }
        }
      }),
      catchError((error: HttpErrorResponse) => {
        // Don't cache errors
        return throwError(() => error);
      })
    );
  }

  private getCacheKey(req: HttpRequest<any>): string {
    return `http:${req.url}:${JSON.stringify(req.params)}`;
  }

  private getTTL(req: HttpRequest<any>): number {
    const header = req.headers.get('X-Cache-TTL');
    if (header) {
      return parseInt(header, 10);
    }

    // Default TTLs based on URL pattern
    if (req.url.includes('/api/')) {
      return 300; // 5 minutes
    }

    return 0; // Don't cache
  }

  private isResponse(event: HttpEvent<any>): boolean {
    return event.type === 0; // HttpEventType.Response
  }
}

/**
 * Route Resolver for pre-caching
 */
@Injectable()
export class CacheResolver<T = any> implements Resolve<T> {
  constructor(
    private cache: CacheService,
    private service: any,
    private methodName: string = 'resolve'
  ) {}

  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<T> | Promise<T> | T {
    const cacheKey = `route:${state.url}`;

    // Try cache first
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }

    // Call service method
    const result = this.service[this.methodName](route, state);

    // Cache if promise or observable
    if (result instanceof Promise) {
      return result.then((data: T) => {
        this.cache.set(cacheKey, data, {
          ttl: 600,
          tags: ['route', state.url],
        });
        return data;
      });
    }

    if (result instanceof Observable) {
      return result.pipe(
        tap((data: T) => {
          this.cache.set(cacheKey, data, {
            ttl: 600,
            tags: ['route', state.url],
          });
        })
      );
    }

    // Cache direct value
    this.cache.set(cacheKey, result, {
      ttl: 600,
      tags: ['route', state.url],
    });

    return result;
  }
}

/**
 * Component decorator for method caching
 */
export function CacheMethod(options?: SetOptions): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) => {
    const originalMethod = descriptor.value;
    const cache = new CacheService();

    descriptor.value = function (...args: any[]) {
      const cacheKey = `${String(propertyKey)}:${JSON.stringify(args)}`;

      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const result = originalMethod.apply(this, args);

      // Cache if promise
      if (result instanceof Promise) {
        return result.then((data: any) => {
          cache.set(cacheKey, data, options);
          return data;
        });
      }

      // Cache if observable
      if (result instanceof Observable) {
        return result.pipe(
          tap((data: any) => {
            cache.set(cacheKey, data, options);
          })
        );
      }

      // Cache direct value
      cache.set(cacheKey, result, options);
      return result;
    };

    return descriptor;
  };
}

/**
 * Pipe for template caching
 */
@Pipe({
  name: 'cache',
  standalone: true,
})
export class CachePipe implements PipeTransform {
  constructor(private cache: CacheService) {}

  transform<T>(key: string, defaultValue?: T): T | undefined {
    return this.cache.get<T>(key, defaultValue);
  }
}

/**
 * Module configuration
 */
export const SMARTCACHE_CONFIG = new InjectionToken<SmartCacheConfig>(
  'SMARTCACHE_CONFIG'
);

/**
 * Helper function to create resolver factory
 */
export function createCacheResolver<T>(
  service: any,
  methodName: string = 'resolve'
): any {
  return class extends CacheResolver<T> {
    constructor(cache: CacheService) {
      super(cache, service, methodName);
    }
  };
}

/**
 * Helper to clear cache on action
 */
export function clearCacheOn(
  cache: CacheService,
  tags: string[]
): () => void {
  return () => {
    tags.forEach((tag) => cache.evictByTag(tag));
  };
}
