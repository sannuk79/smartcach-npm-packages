# SmartCache API Reference

## Table of Contents

- [SmartCache Class](#smartcache-class)
- [Configuration](#configuration)
- [Methods](#methods)
- [Events](#events)
- [Types](#types)
- [Examples](#examples)

---

## SmartCache Class

The main cache manager class.

### Constructor

```typescript
new SmartCache(config?: SmartCacheConfig)
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `config` | `SmartCacheConfig` | `{}` | Cache configuration |

#### Example

```javascript
import { SmartCache } from 'smartcache';

const cache = new SmartCache({
  maxSize: '500MB',
  maxItems: 1000,
  defaultTTL: 300,
  cleanupInterval: 60,
});
```

---

## Configuration

### SmartCacheConfig

```typescript
interface SmartCacheConfig {
  maxItems?: number;          // Maximum number of items
  maxSize?: string | number;  // Maximum size (e.g., "500MB" or 524288000)
  defaultTTL?: number;        // Default TTL in seconds
  cleanupInterval?: number;   // Cleanup interval in seconds
}
```

#### Defaults

| Option | Default | Description |
|--------|---------|-------------|
| `maxItems` | `1000` | Maximum cache entries |
| `maxSize` | `"500MB"` | Maximum memory usage |
| `defaultTTL` | `300` (5 min) | Default time-to-live |
| `cleanupInterval` | `60` (1 min) | Auto-cleanup frequency |

---

## Methods

### set()

Set a cache entry.

```typescript
set(key: string, value: any, options?: SetOptions): void
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Cache key |
| `value` | `any` | Data to cache |
| `options` | `SetOptions` | Optional settings |

#### SetOptions

```typescript
interface SetOptions {
  ttl?: number;           // TTL in seconds (overrides default)
  priority?: Priority;    // Entry priority
  tags?: string[];        // Tags for grouping
}
```

#### Priority Levels

```typescript
type Priority = 'critical' | 'high' | 'medium' | 'low'
```

| Priority | Behavior | Use Case |
|----------|----------|----------|
| `critical` | Never auto-deleted | Sessions, auth tokens |
| `high` | Deleted last | Important API responses |
| `medium` | Normal eviction | General cache |
| `low` | Deleted first | Temporary data |

#### Example

```javascript
cache.set('user:123', userData, {
  ttl: 600,
  priority: 'high',
  tags: ['users', 'api'],
});
```

---

### get()

Get a cache entry.

```typescript
get<T = any>(key: string): T | undefined
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Cache key |

#### Returns

The cached value, or `undefined` if not found/expired.

#### Example

```javascript
const user = cache.get('user:123');
if (user) {
  console.log('Found:', user);
}
```

---

### has()

Check if a key exists (and is not expired).

```typescript
has(key: string): boolean
```

#### Example

```javascript
if (cache.has('user:123')) {
  // Key exists
}
```

---

### remove()

Remove a cache entry.

```typescript
remove(key: string): boolean
```

#### Returns

`true` if the key was removed, `false` if it didn't exist.

#### Example

```javascript
cache.remove('user:123');
```

---

### clear()

Clear all cache entries.

```typescript
clear(): void
```

#### Example

```javascript
cache.clear();
```

---

### getStats()

Get cache statistics.

```typescript
getStats(): CacheStats
```

#### Returns

```typescript
interface CacheStats {
  totalItems: number;      // Current number of items
  totalSizeBytes: number;  // Total memory usage
  hits: number;            // Cache hits
  misses: number;          // Cache misses
  evictions: number;       // Total evictions
  hitRate: number;         // Hit rate percentage (0-100)
}
```

#### Example

```javascript
const stats = cache.getStats();
console.log(`Hit Rate: ${stats.hitRate}%`);
console.log(`Memory: ${stats.totalSizeBytes} bytes`);
```

---

### getRecentEvictions()

Get recent eviction records.

```typescript
getRecentEvictions(limit?: number): EvictionRecord[]
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `number` | `10` | Max records to return |

#### Returns

```typescript
interface EvictionRecord {
  key: string;
  reason: 'TTL_EXPIRED' | 'LRU' | 'LOW_PRIORITY' | 'MANUAL';
  timestamp: string;
}
```

#### Example

```javascript
const evictions = cache.getRecentEvictions();
evictions.forEach(e => {
  console.log(`${e.key} - ${e.reason}`);
});
```

---

### getByTag()

Get all entries with a specific tag.

```typescript
getByTag(tag: string): Array<{ key: string; value: any }>
```

#### Example

```javascript
const apiResponses = cache.getByTag('api');
```

---

### evictByTag()

Remove all entries with a specific tag.

```typescript
evictByTag(tag: string): number
```

#### Returns

Number of entries evicted.

#### Example

```javascript
const count = cache.evictByTag('temp');
console.log(`Evicted ${count} entries`);
```

---

### cleanup()

Manually trigger cleanup of expired entries.

```typescript
cleanup(): { expiredCount: number; freedBytes: number }
```

#### Example

```javascript
const result = cache.cleanup();
console.log(`Freed ${result.freedBytes} bytes`);
```

---

### destroy()

Destroy the cache instance and stop cleanup timer.

```typescript
destroy(): void
```

---

## Events

SmartCache extends `EventEmitter` and emits the following events:

### 'hit'

Emitted when a cache hit occurs.

```typescript
cache.on('hit', ({ key, size }) => {
  console.log(`Cache HIT: ${key} (${size} bytes)`);
});
```

### 'miss'

Emitted when a cache miss occurs.

```typescript
cache.on('miss', ({ key, reason }) => {
  console.log(`Cache MISS: ${key}${reason ? ` (${reason})` : ''}`);
});
```

### 'set'

Emitted when a value is set.

```typescript
cache.on('set', ({ key, size }) => {
  console.log(`Cache SET: ${key}`);
});
```

### 'eviction'

Emitted when an entry is evicted.

```typescript
cache.on('eviction', ({ key, reason }) => {
  console.log(`Evicted: ${key} (${reason})`);
});
```

### 'cleanup'

Emitted after automatic cleanup.

```typescript
cache.on('cleanup', ({ expiredCount, freedBytes }) => {
  console.log(`Cleanup: ${expiredCount} entries, ${freedBytes} bytes freed`);
});
```

### 'remove'

Emitted when a value is manually removed.

```typescript
cache.on('remove', ({ key }) => {
  console.log(`Removed: ${key}`);
});
```

### 'clear'

Emitted when cache is cleared.

```typescript
cache.on('clear', () => {
  console.log('Cache cleared');
});
```

---

## Types

### Priority

```typescript
type Priority = 'critical' | 'high' | 'medium' | 'low'
```

### SetOptions

```typescript
interface SetOptions {
  ttl?: number;
  priority?: Priority;
  tags?: string[];
}
```

### CacheStats

```typescript
interface CacheStats {
  totalItems: number;
  totalSizeBytes: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}
```

### EvictionRecord

```typescript
interface EvictionRecord {
  key: string;
  reason: 'TTL_EXPIRED' | 'LRU' | 'LOW_PRIORITY' | 'MANUAL';
  timestamp: string;
}
```

---

## Utility Functions

### formatBytes()

Format bytes to human-readable string.

```typescript
formatBytes(bytes: number): string
```

#### Example

```javascript
import { formatBytes } from 'smartcache';

console.log(formatBytes(1048576)); // "1.00 MB"
```

### formatDuration()

Format milliseconds to human-readable string.

```typescript
formatDuration(ms: number): string
```

#### Example

```javascript
import { formatDuration } from 'smartcache';

console.log(formatDuration(3661000)); // "1h 1m"
```

---

## Complete Example

```javascript
import { SmartCache, formatBytes } from 'smartcache';

// Create cache
const cache = new SmartCache({
  maxSize: '500MB',
  maxItems: 1000,
  defaultTTL: 300,
  cleanupInterval: 60,
});

// Event listeners
cache.on('hit', ({ key, size }) => {
  console.log(`✓ HIT: ${key}`);
});

cache.on('miss', ({ key }) => {
  console.log(`✗ MISS: ${key}`);
});

cache.on('eviction', ({ key, reason }) => {
  console.log(`🗑️  Evicted: ${key} (${reason})`);
});

// Set values
cache.set('user:123', { name: 'John' }, {
  ttl: 600,
  priority: 'high',
  tags: ['users'],
});

cache.set('temp:data', someData, {
  priority: 'low',
  tags: ['temp'],
});

// Get values
const user = cache.get('user:123');

// Get stats
const stats = cache.getStats();
console.log(`Hit Rate: ${stats.hitRate}%`);
console.log(`Memory: ${formatBytes(stats.totalSizeBytes)}`);

// Cleanup
cache.evictByTag('temp');

// Graceful shutdown
process.on('SIGINT', () => {
  cache.destroy();
  process.exit(0);
});
```

---

## Best Practices

### 1. Choose Right TTL

```javascript
// Short-lived data
cache.set('api:response', data, { ttl: 60 });

// Long-lived data
cache.set('config:app', config, { ttl: 3600 });

// Critical data (manual invalidation)
cache.set('session:user', session, { ttl: 0, priority: 'critical' });
```

### 2. Use Tags for Grouping

```javascript
cache.set('api:users', users, { tags: ['api', 'users'] });
cache.set('api:products', products, { tags: ['api', 'products'] });

// Clear all API cache
cache.evictByTag('api');
```

### 3. Monitor Hit Rate

```javascript
setInterval(() => {
  const stats = cache.getStats();
  if (stats.hitRate < 50) {
    console.warn('Low cache hit rate!');
  }
}, 60000);
```

### 4. Handle Memory Limits

```javascript
const cache = new SmartCache({
  maxSize: '100MB', // Prevent memory overflow
  maxItems: 500,    // Limit item count
});
```

### 5. Graceful Shutdown

```javascript
process.on('SIGINT', () => {
  cache.destroy();
  console.log('Cache destroyed');
  process.exit(0);
});
```
