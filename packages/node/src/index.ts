import { EventEmitter } from 'events';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface SetOptions {
  ttl?: number; // seconds
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

export interface EvictionRecord {
  key: string;
  reason: 'TTL_EXPIRED' | 'LRU' | 'LOW_PRIORITY' | 'MANUAL';
  timestamp: string;
}

export interface SmartCacheConfig {
  maxItems?: number;
  maxSize?: string | number; // e.g., "500MB" or 524288000
  defaultTTL?: number; // seconds
  cleanupInterval?: number; // seconds
  debug?: boolean; // Enable debug logging
  logger?: typeof console; // Custom logger
}

interface ResolvedConfig {
  maxItems: number;
  maxSize: number;
  defaultTTL: number;
  cleanupInterval: number;
  debug: boolean;
  logger: typeof console;
}

interface CacheEntry {
  value: any;
  createdAt: number;
  lastAccessed: number;
  ttlSeconds: number;
  priority: Priority;
  accessCount: number;
  tags: string[];
  sizeBytes: number;
}

/**
 * SmartCache - Universal Cache Management
 * 
 * Features:
 * - LRU Eviction (Least Recently Used)
 * - TTL Support (Time To Live)
 * - Priority Levels (critical, high, medium, low)
 * - Size Limits with auto-cleanup
 * - Real-time statistics
 */
export class SmartCache extends EventEmitter {
  private entries: Map<string, CacheEntry>;
  private config: ResolvedConfig;
  private stats: CacheStats;
  private evictions: EvictionRecord[];
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: SmartCacheConfig = {}) {
    super();
    this.entries = new Map();
    this.evictions = [];

    // Parse config
    this.config = {
      maxItems: config.maxItems ?? 1000,
      maxSize: this.parseSize(config.maxSize ?? '500MB'),
      defaultTTL: config.defaultTTL ?? 300,
      cleanupInterval: config.cleanupInterval ?? 60,
      debug: config.debug ?? false,
      logger: config.logger ?? console,
    };

    // Initialize stats
    this.stats = {
      totalItems: 0,
      totalSizeBytes: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
    };

    // Start cleanup interval
    this.startCleanupTimer();
  }

  /**
   * Set a cache entry
   */
  set(key: string, value: any, options: SetOptions = {}): void {
    const ttl = options.ttl ?? this.config.defaultTTL;
    const priority = options.priority ?? 'medium';
    const tags = options.tags ?? [];

    // Calculate size
    const sizeBytes = Buffer.byteLength(JSON.stringify(value));

    // Check if we need to evict before inserting
    this.maybeEvict(sizeBytes);

    // Create entry
    const now = Date.now();
    const entry: CacheEntry = {
      value,
      createdAt: now,
      lastAccessed: now,
      ttlSeconds: ttl,
      priority,
      accessCount: 0,
      tags,
      sizeBytes,
    };

    this.entries.set(key, entry);
    this.updateStats();

    this.emit('set', { key, size: sizeBytes });

    // Debug logging
    if (this.config.debug) {
      this.config.logger.log(`[SmartCache] SET: ${key} (${sizeBytes} bytes, ttl=${ttl}s, priority=${priority})`);
    }
  }

  /**
   * Get a cache entry
   */
  get<T = any>(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      this.stats.misses++;
      this.emit('miss', { key });

      // Debug logging
      if (this.config.debug) {
        this.config.logger.log(`[SmartCache] MISS: ${key}`);
      }

      return undefined;
    }

    // Check expiry
    if (this.isExpired(entry)) {
      this.remove(key);
      this.stats.misses++;
      this.emit('miss', { key, reason: 'expired' });

      // Debug logging
      if (this.config.debug) {
        this.config.logger.log(`[SmartCache] EXPIRED: ${key}`);
      }

      return undefined;
    }

    // Touch the entry
    entry.lastAccessed = Date.now();
    entry.accessCount++;

    // Update stats
    this.stats.hits++;
    this.updateHitRate();
    this.updateStats();

    this.emit('hit', { key, size: entry.sizeBytes });

    // Debug logging
    if (this.config.debug) {
      this.config.logger.log(`[SmartCache] HIT: ${key} (${entry.sizeBytes} bytes)`);
    }

    return entry.value as T;
  }

  /**
   * Get or set (atomic operation)
   */
  getOrSet<T>(key: string, factory: () => T, options?: SetOptions): T {
    const existing = this.get<T>(key);
    if (existing !== undefined) {
      return existing;
    }

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
   * Remove a cache entry
   */
  remove(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.recordEviction(key, 'MANUAL');
      this.updateStats();
      this.emit('remove', { key });
      return true;
    }
    return false;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
    this.stats.totalItems = 0;
    this.stats.totalSizeBytes = 0;
    this.emit('clear');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get recent evictions
   */
  getRecentEvictions(limit: number = 10): EvictionRecord[] {
    return this.evictions.slice(-limit);
  }

  /**
   * Get entries by tag
   */
  getByTag(tag: string): Array<{ key: string; value: any }> {
    const results: Array<{ key: string; value: any }> = [];
    
    for (const [key, entry] of this.entries.entries()) {
      if (entry.tags.includes(tag)) {
        results.push({ key, value: entry.value });
      }
    }

    return results;
  }

  /**
   * Evict entries by tag
   */
  evictByTag(tag: string): number {
    let count = 0;
    
    for (const [key, entry] of this.entries.entries()) {
      if (entry.tags.includes(tag)) {
        this.remove(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Manual cleanup
   */
  cleanup(): { expiredCount: number; freedBytes: number } {
    let expiredCount = 0;
    let freedBytes = 0;

    for (const [key, entry] of this.entries.entries()) {
      if (this.isExpired(entry)) {
        freedBytes += entry.sizeBytes;
        this.entries.delete(key);
        this.recordEviction(key, 'TTL_EXPIRED');
        expiredCount++;
      }
    }

    this.updateStats();
    return { expiredCount, freedBytes };
  }

  /**
   * Destroy the cache instance
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }

  private isExpired(entry: CacheEntry): boolean {
    if (entry.ttlSeconds === 0) {
      return false; // No expiry
    }
    const age = (Date.now() - entry.createdAt) / 1000;
    return age >= entry.ttlSeconds;
  }

  private parseSize(size: string | number): number {
    if (typeof size === 'number') {
      return size;
    }

    const match = size.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/i);
    if (!match) {
      return 500 * 1024 * 1024; // Default 500MB
    }

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

  private maybeEvict(newSize: number): void {
    // Check item limit
    if (this.entries.size >= this.config.maxItems) {
      this.evictLRU(1);
    }

    // Check size limit
    if (this.stats.totalSizeBytes + newSize > this.config.maxSize) {
      const bytesNeeded = this.stats.totalSizeBytes + newSize - this.config.maxSize;
      this.evictBySize(bytesNeeded);
    }
  }

  private evictLRU(count: number): void {
    const priorityOrder: Record<Priority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    // Convert to array and sort
    const entries = Array.from(this.entries.entries())
      .filter(([_, entry]) => entry.priority !== 'critical')
      .sort((a, b) => {
        // First by priority
        const priorityDiff = priorityOrder[a[1].priority] - priorityOrder[b[1].priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Then by last accessed (oldest first)
        return a[1].lastAccessed - b[1].lastAccessed;
      });

    // Evict
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const [key, entry] = entries[i];
      this.entries.delete(key);
      this.recordEviction(key, 'LRU');
    }

    this.updateStats();
  }

  private evictBySize(bytesNeeded: number): void {
    let freed = 0;
    const priorityOrder: Record<Priority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const entries = Array.from(this.entries.entries())
      .filter(([_, entry]) => entry.priority !== 'critical')
      .sort((a, b) => {
        const priorityDiff = priorityOrder[a[1].priority] - priorityOrder[b[1].priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a[1].lastAccessed - b[1].lastAccessed;
      });

    for (const [key, entry] of entries) {
      if (freed >= bytesNeeded) break;
      
      freed += entry.sizeBytes;
      this.entries.delete(key);
      this.recordEviction(key, 'LRU');
    }

    this.updateStats();
  }

  private recordEviction(key: string, reason: EvictionRecord['reason']): void {
    this.evictions.push({
      key,
      reason,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 100 evictions
    if (this.evictions.length > 100) {
      this.evictions.shift();
    }

    this.stats.evictions++;
    this.emit('eviction', { key, reason });

    // Debug logging
    if (this.config.debug) {
      this.config.logger.log(`[SmartCache] EVICT: ${key} (${reason})`);
    }
  }

  private updateStats(): void {
    let totalSize = 0;
    for (const entry of this.entries.values()) {
      totalSize += entry.sizeBytes;
    }

    this.stats.totalItems = this.entries.size;
    this.stats.totalSizeBytes = totalSize;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    if (total > 0) {
      this.stats.hitRate = (this.stats.hits / total) * 100;
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const result = this.cleanup();
      if (result.expiredCount > 0) {
        this.emit('cleanup', result);
      }
    }, this.config.cleanupInterval * 1000);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * Format milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// Export Hybrid Cache
export { HybridCache } from './hybrid';
export type { HybridCacheConfig, HybridCacheStats } from './hybrid';
