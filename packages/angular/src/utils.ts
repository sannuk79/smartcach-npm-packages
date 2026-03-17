/**
 * SmartCache TypeScript Utilities
 * Lightweight helper functions and types
 */

import { Priority, SetOptions, CacheStats } from './index';

/**
 * Cache key generator
 */
export class KeyGenerator {
  /**
   * Generate key from parts
   */
  static create(...parts: (string | number | undefined | null)[]): string {
    return parts.filter((p) => p !== undefined && p !== null).join(':');
  }

  /**
   * Generate key from object
   */
  static fromObject(obj: Record<string, any>): string {
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  /**
   * Generate key from URL and params
   */
  static fromUrl(url: string, params?: Record<string, any>): string {
    if (!params) return url;
    return `${url}:${this.fromObject(params)}`;
  }

  /**
   * Generate key from function arguments
   */
  static fromArgs(args: IArguments | any[]): string {
    return JSON.stringify(args);
  }
}

/**
 * TTL presets
 */
export const TTL = {
  NONE: 0,
  SECOND: 1,
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400,
  WEEK: 604800,
} as const;

/**
 * Priority presets
 */
export const PRIORITY = {
  CRITICAL: 'critical' as Priority,
  HIGH: 'high' as Priority,
  MEDIUM: 'medium' as Priority,
  LOW: 'low' as Priority,
} as const;

/**
 * Tag presets
 */
export const TAGS = {
  HTTP: 'http',
  ROUTE: 'route',
  API: 'api',
  USER: 'user',
  TEMP: 'temp',
  STATIC: 'static',
} as const;

/**
 * Create cache options easily
 */
export function cacheOptions(options?: {
  ttl?: number;
  priority?: Priority;
  tags?: string[];
}): SetOptions {
  return {
    ttl: options?.ttl ?? TTL.MINUTE * 5,
    priority: options?.priority ?? PRIORITY.MEDIUM,
    tags: options?.tags ?? [],
  };
}

/**
 * Format cache stats for display
 */
export function formatStats(stats: CacheStats): string {
  const lines = [
    '┌─────────────────────────────────┐',
    '│     SmartCache Statistics       │',
    '├─────────────────────────────────┤',
    `│  Items:     ${String(stats.totalItems).padEnd(22)}│`,
    `│  Size:      ${formatBytes(stats.totalSizeBytes).padEnd(22)}│`,
    `│  Hits:      ${String(stats.hits).padEnd(22)}│`,
    `│  Misses:    ${String(stats.misses).padEnd(22)}│`,
    `│  Evictions: ${String(stats.evictions).padEnd(22)}│`,
    `│  Hit Rate:  ${stats.hitRate.toFixed(1)}%${' '.repeat(16)}│`,
    '└─────────────────────────────────┘',
  ];
  return lines.join('\n');
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format milliseconds to human readable
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Check if running in browser
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Check if running on server (SSR)
 */
export function isServer(): boolean {
  return !isBrowser();
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: any;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Memoize function with cache
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  ttl?: number
): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached) return cached;

    const result = fn(...args);
    cache.set(key, result);

    if (ttl) {
      setTimeout(() => cache.delete(key), ttl * 1000);
    }

    return result;
  }) as T;
}

/**
 * Create cache wrapper for async functions
 */
export function cacheAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: SetOptions
): T {
  const cache = new Map<string, Awaited<ReturnType<T>>>();

  return (async (...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached) return cached;

    const result = await fn(...args);
    cache.set(key, result);

    if (options?.ttl) {
      setTimeout(() => cache.delete(key), options.ttl * 1000);
    }

    return result;
  }) as T;
}

/**
 * Group cache keys by tag
 */
export function groupByTag(
  keys: string[]
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  keys.forEach((key) => {
    const parts = key.split(':');
    const tag = parts[0] || 'unknown';
    if (!groups[tag]) groups[tag] = [];
    groups[tag].push(key);
  });

  return groups;
}

/**
 * Parse size string to bytes
 */
export function parseSize(size: string | number): number {
  if (typeof size === 'number') return size;

  const match = size.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/i);
  if (!match) return 50 * 1024 * 1024;

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'MB').toUpperCase();

  switch (unit) {
    case 'KB':
      return value * 1024;
    case 'MB':
      return value * 1024 * 1024;
    case 'GB':
      return value * 1024 * 1024 * 1024;
    default:
      return value;
  }
}

/**
 * Create cache middleware config
 */
export function createCacheConfig(
  overrides?: Partial<SmartCacheConfig>
): SmartCacheConfig {
  return {
    maxItems: 1000,
    maxSize: '50MB',
    defaultTTL: 300,
    cleanupInterval: 60,
    enabled: true,
    ...overrides,
  };
}

export interface SmartCacheConfig {
  maxItems?: number;
  maxSize?: string | number;
  defaultTTL?: number;
  cleanupInterval?: number;
  enabled?: boolean;
}

/**
 * Logger for cache operations
 */
export class CacheLogger {
  private enabled: boolean;
  private prefix: string;

  constructor(prefix: string = 'SmartCache', enabled: boolean = true) {
    this.prefix = prefix;
    this.enabled = enabled;
  }

  hit(key: string, size?: number): void {
    if (!this.enabled) return;
    console.log(
      `[${this.prefix}] ✓ HIT: ${key}${size ? ` (${formatBytes(size)})` : ''}`
    );
  }

  miss(key: string): void {
    if (!this.enabled) return;
    console.log(`[${this.prefix}] ✗ MISS: ${key}`);
  }

  set(key: string, size?: number): void {
    if (!this.enabled) return;
    console.log(
      `[${this.prefix}] → SET: ${key}${size ? ` (${formatBytes(size)})` : ''}`
    );
  }

  evict(key: string, reason: string): void {
    if (!this.enabled) return;
    console.log(`[${this.prefix}] ✗ EVICT: ${key} (${reason})`);
  }

  cleanup(count: number, freed: number): void {
    if (!this.enabled) return;
    console.log(
      `[${this.prefix}] 🧹 CLEANUP: ${count} entries, ${formatBytes(freed)} freed`
    );
  }
}
