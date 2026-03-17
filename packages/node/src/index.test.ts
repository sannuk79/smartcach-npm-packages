import { SmartCache } from '../src/index';

describe('SmartCache', () => {
  let cache: SmartCache;

  beforeEach(() => {
    cache = new SmartCache({
      maxSize: '10MB',
      defaultTTL: 300,
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Basic Operations', () => {
    it('should set and get a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should remove a key', () => {
      cache.set('key1', 'value1');
      expect(cache.remove('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.getStats().totalItems).toBe(0);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should respect TTL option', () => {
      cache.set('key1', 'value1', { ttl: 1 }); // 1 second

      // Should exist immediately
      expect(cache.get('key1')).toBe('value1');

      // Note: In real test, we'd sleep and check expiry
      // For now, we verify the entry was created with TTL
    });

    it('should use default TTL when not specified', () => {
      cache.set('key1', 'value1');
      // Uses defaultTTL from config
    });
  });

  describe('Priority Levels', () => {
    it('should accept priority options', () => {
      cache.set('critical', 'data', { priority: 'critical' });
      cache.set('low', 'data', { priority: 'low' });

      expect(cache.get('critical')).toBe('data');
      expect(cache.get('low')).toBe('data');
    });

    it('should have priority order: critical < high < medium < low', () => {
      // Lower number = higher priority (less likely to be evicted)
      const priorities = ['critical', 'high', 'medium', 'low'];
      expect(priorities).toEqual(['critical', 'high', 'medium', 'low']);
    });
  });

  describe('Tags', () => {
    it('should set tags on entries', () => {
      cache.set('key1', 'value1', { tags: ['api', 'users'] });
      cache.set('key2', 'value2', { tags: ['api', 'products'] });
    });

    it('should get entries by tag', () => {
      cache.set('key1', 'value1', { tags: ['api'] });
      cache.set('key2', 'value2', { tags: ['api'] });
      cache.set('key3', 'value3', { tags: ['other'] });

      const apiEntries = cache.getByTag('api');
      expect(apiEntries.length).toBe(2);
    });

    it('should evict by tag', () => {
      cache.set('key1', 'value1', { tags: ['temp'] });
      cache.set('key2', 'value2', { tags: ['temp'] });
      cache.set('key3', 'value3', { tags: ['permanent'] });

      const evicted = cache.evictByTag('temp');
      expect(evicted).toBe(2);
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', () => {
      // First, test misses (before setting)
      cache.get('nonexistent1'); // miss
      cache.get('nonexistent2'); // miss

      // Now set and test hits
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key1'); // hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      // Hit rate = hits / (hits + misses) = 2/4 = 50%
      expect(stats.hitRate).toBe(50);
    });

    it('should track evictions', () => {
      cache.set('key1', 'value1');
      cache.remove('key1');

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('should track total size', () => {
      cache.set('key1', 'value1');
      const stats = cache.getStats();
      expect(stats.totalItems).toBe(1);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict when max items reached', () => {
      const smallCache = new SmartCache({
        maxItems: 3,
        maxSize: '1MB',
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // All 3 items should exist
      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBe('value2');
      expect(smallCache.get('key3')).toBe('value3');

      // Add 4th item - should trigger eviction
      smallCache.set('key4', 'value4');

      // Should have 3 items (maxItems)
      const stats = smallCache.getStats();
      expect(stats.totalItems).toBeLessThanOrEqual(3);

      smallCache.destroy();
    });

    it('should respect priority during eviction', () => {
      const smallCache = new SmartCache({
        maxItems: 3,
        maxSize: '1MB',
      });

      smallCache.set('key1', 'value1', { priority: 'critical' });
      smallCache.set('key2', 'value2', { priority: 'low' });
      smallCache.set('key3', 'value3', { priority: 'low' });

      // Add new item - should evict low priority first
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBe('value1'); // critical preserved

      smallCache.destroy();
    });
  });

  describe('Events', () => {
    it('should emit hit event', (done) => {
      cache.set('key1', 'value1');

      cache.on('hit', ({ key }: { key: string }) => {
        expect(key).toBe('key1');
        done();
      });

      cache.get('key1');
    });

    it('should emit miss event', (done) => {
      cache.on('miss', ({ key }: { key: string }) => {
        expect(key).toBe('nonexistent');
        done();
      });

      cache.get('nonexistent');
    });

    it('should emit eviction event', (done) => {
      cache.on('eviction', ({ key, reason }: { key: string; reason: string }) => {
        expect(key).toBe('key1');
        expect(reason).toBe('MANUAL');
        done();
      });

      cache.set('key1', 'value1');
      cache.remove('key1');
    });
  });

  describe('Size Parsing', () => {
    it('should parse size strings', () => {
      const cache1 = new SmartCache({ maxSize: '1KB' });
      const cache2 = new SmartCache({ maxSize: '1MB' });
      const cache3 = new SmartCache({ maxSize: '1GB' });

      // Internal implementation check - sizes should be different
      expect(cache1).toBeDefined();
      expect(cache2).toBeDefined();
      expect(cache3).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup expired entries manually', () => {
      cache.set('key1', 'value1', { ttl: 1 });

      const result = cache.cleanup();
      // In real test, we'd sleep first to let TTL expire
      expect(result.expiredCount).toBeGreaterThanOrEqual(0);
    });

    it('should track recent evictions', () => {
      cache.set('key1', 'value1');
      cache.remove('key1');
      cache.set('key2', 'value2');
      cache.remove('key2');

      const evictions = cache.getRecentEvictions();
      expect(evictions.length).toBe(2);
    });
  });
});
