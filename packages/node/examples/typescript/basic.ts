/**
 * SmartCache Hybrid - TypeScript Basic Example
 * 
 * This example demonstrates basic usage with TypeScript types
 */

import { SmartCache, HybridCache, SetOptions, CacheStats } from 'smartcache-hybrid';

// ============================================
// Example 1: Basic SmartCache Usage
// ============================================

console.log('\n📦 Example 1: Basic SmartCache');

const cache = new SmartCache({
  maxSize: '100MB',
  defaultTTL: 300, // 5 minutes
  debug: true, // Enable debug logging
});

// Set with types
interface UserData {
  id: number;
  name: string;
  email: string;
}

const user: UserData = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
};

// Set cache with options
const options: SetOptions = {
  ttl: 600, // 10 minutes
  priority: 'high',
  tags: ['user', 'api'],
};

cache.set<UserData>('user:1', user, options);

// Get cache with type
const cachedUser: UserData | undefined = cache.get<UserData>('user:1');
console.log('Cached user:', cachedUser);

// Get stats with type
const stats: CacheStats = cache.getStats();
console.log('Cache stats:', stats);

// ============================================
// Example 2: Hybrid Cache with Redis
// ============================================

console.log('\n🚀 Example 2: Hybrid Cache');

async function hybridExample() {
  const hybridCache = new HybridCache({
    // L1 (Memory)
    l1MaxItems: 10000,
    l1MaxSize: '100MB',
    
    // L2 (Redis)
    l2Storage: 'redis',
    l2RedisUrl: 'redis://localhost:6379',
    l2MaxSize: '10GB',
    
    // Sync
    syncInterval: 5,
    syncBatchSize: 100,
    
    // Compression
    compression: true,
    compressionThreshold: 1024,
    
    // Partitioning
    partitioning: true,
    partitionCount: 16,
    
    defaultTTL: 300,
    debug: true,
  });

  // Set cache
  await hybridCache.set<Product>('product:123', {
    id: 123,
    name: 'Laptop',
    price: 999.99,
    stock: 50,
  }, {
    ttl: 3600,
    priority: 'medium',
    tags: ['product', 'inventory'],
  });

  // Get cache (auto-promotes to L1 if in L2)
  const product = await hybridCache.get<Product>('product:123');
  console.log('Product from cache:', product);

  // Get hybrid stats
  const hybridStats = await hybridCache.getStats();
  console.log('Hybrid stats:', hybridStats);

  // Cleanup
  await hybridCache.destroy();
}

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
}

// ============================================
// Example 3: API Response Caching
// ============================================

console.log('\n🌐 Example 3: API Response Caching');

interface APIResponse<T> {
  data: T;
  timestamp: number;
  status: number;
}

async function fetchWithCache<T>(
  url: string,
  cache: SmartCache
): Promise<APIResponse<T>> {
  const cacheKey = `api:${url}`;
  
  // Try cache first
  const cached = cache.get<APIResponse<T>>(cacheKey);
  if (cached) {
    console.log(`Cache HIT for ${url}`);
    return cached;
  }

  console.log(`Cache MISS for ${url}, fetching...`);
  
  // Simulate API call
  const response: APIResponse<T> = {
    data: {} as T,
    timestamp: Date.now(),
    status: 200,
  };

  // Cache the response
  cache.set(cacheKey, response, {
    ttl: 300, // 5 minutes
    tags: ['api', 'response'],
  });

  return response;
}

// Usage
const apiCache = new SmartCache({
  maxSize: '50MB',
  defaultTTL: 300,
  debug: true,
});

fetchWithCache<UserData>('/api/users/1', apiCache)
  .then(console.log);

// ============================================
// Example 4: Session Management
// ============================================

console.log('\n🔐 Example 4: Session Management');

interface Session {
  userId: number;
  token: string;
  expiresAt: number;
  data: Record<string, any>;
}

const sessionCache = new SmartCache({
  maxItems: 10000,
  maxSize: '50MB',
  defaultTTL: 1800, // 30 minutes
  debug: true,
});

function createSession(userId: number, token: string): Session {
  const session: Session = {
    userId,
    token,
    expiresAt: Date.now() + 1800000,
    data: {},
  };

  sessionCache.set(`session:${token}`, session, {
    ttl: 1800,
    priority: 'critical', // Don't auto-delete sessions
    tags: ['session'],
  });

  return session;
}

function getSession(token: string): Session | undefined {
  return sessionCache.get<Session>(`session:${token}`);
}

function deleteSession(token: string): boolean {
  return sessionCache.remove(`session:${token}`);
}

// Usage
const session = createSession(123, 'abc123token');
console.log('Created session:', session);

const retrieved = getSession('abc123token');
console.log('Retrieved session:', retrieved);

// ============================================
// Example 5: Cache with Events
// ============================================

console.log('\n📡 Example 5: Event Listeners');

const eventCache = new SmartCache({
  maxSize: '10MB',
  defaultTTL: 60,
  debug: false, // We'll log manually
});

// Hit event
eventCache.on('hit', ({ key, size }) => {
  console.log(`✅ HIT: ${key} (${size} bytes)`);
});

// Miss event
eventCache.on('miss', ({ key, reason }) => {
  console.log(`❌ MISS: ${key}${reason ? ` (${reason})` : ''}`);
});

// Set event
eventCache.on('set', ({ key, size }) => {
  console.log(`📝 SET: ${key} (${size} bytes)`);
});

// Eviction event
eventCache.on('eviction', ({ key, reason }) => {
  console.log(`🗑️  EVICT: ${key} (${reason})`);
});

// Cleanup event
eventCache.on('cleanup', ({ expiredCount, freedBytes }) => {
  console.log(`🧹 CLEANUP: ${expiredCount} entries, ${freedBytes} bytes freed`);
});

// Test events
eventCache.set('test:1', { data: 'value1' });
eventCache.get('test:1'); // HIT
eventCache.get('test:2'); // MISS

// ============================================
// Example 6: Tag-based Operations
// ============================================

console.log('\n🏷️  Example 6: Tag Operations');

const tagCache = new SmartCache({
  maxItems: 1000,
  debug: true,
});

// Set with tags
tagCache.set('api:users:1', { id: 1, name: 'User 1' }, { tags: ['api', 'users'] });
tagCache.set('api:users:2', { id: 2, name: 'User 2' }, { tags: ['api', 'users'] });
tagCache.set('api:products:1', { id: 1, name: 'Product 1' }, { tags: ['api', 'products'] });
tagCache.set('static:config', { theme: 'dark' }, { tags: ['static'] });

// Get by tag
const apiEntries = tagCache.getByTag('api');
console.log(`API entries: ${apiEntries.length}`);

const userEntries = tagCache.getByTag('users');
console.log(`User entries: ${userEntries.length}`);

// Evict by tag
const evicted = tagCache.evictByTag('api');
console.log(`Evicted ${evicted} API entries`);

// ============================================
// Example 7: getOrSet Pattern
// ============================================

console.log('\n🔄 Example 7: getOrSet Pattern');

const atomicCache = new SmartCache({
  maxSize: '50MB',
  debug: true,
});

function getOrSetUser(userId: number): UserData {
  return atomicCache.getOrSet<UserData>(
    `user:${userId}`,
    () => {
      // This only runs if cache miss
      console.log(`Fetching user ${userId} from database...`);
      return {
        id: userId,
        name: `User ${userId}`,
        email: `user${userId}@example.com`,
      };
    },
    {
      ttl: 600,
      priority: 'high',
      tags: ['user'],
    }
  );
}

// First call - cache miss
const user1 = getOrSetUser(1);
console.log('User 1:', user1);

// Second call - cache hit
const user1Again = getOrSetUser(1);
console.log('User 1 (cached):', user1Again);

// ============================================
// Export for use in other files
// ============================================

export {
  cache,
  hybridCache,
  sessionCache,
  tagCache,
  atomicCache,
  createSession,
  getSession,
  deleteSession,
  fetchWithCache,
  getOrSetUser,
};
