# SmartCache Examples

## 1. Basic Usage

```javascript
import { SmartCache } from 'smartcache';

const cache = new SmartCache({
  maxSize: '500MB',
  defaultTTL: 300, // 5 minutes
});

// Set value
cache.set('user:123', { name: 'John', email: 'john@example.com' });

// Get value
const user = cache.get('user:123');
console.log(user); // { name: 'John', email: 'john@example.com' }

// With options
cache.set('api:products', products, {
  ttl: 600, // 10 minutes
  priority: 'high',
  tags: ['api', 'products'],
});

// Check stats
console.log(cache.getStats());
// {
//   totalItems: 2,
//   totalSizeBytes: 1024,
//   hits: 1,
//   misses: 0,
//   evictions: 0,
//   hitRate: 100
// }
```

## 2. Express API Caching

```javascript
import express from 'express';
import { cacheMiddleware } from 'smartcache/express';

const app = express();

// Simple caching
app.get('/api/products', 
  cacheMiddleware({ ttl: 300 }),
  async (req, res) => {
    const products = await db.getProducts();
    res.json(products);
  }
);

// Custom cache key
app.get('/api/user/:id',
  cacheMiddleware({
    ttl: 600,
    keyGenerator: (req) => `user:${req.params.id}`,
  }),
  async (req, res) => {
    const user = await db.getUser(req.params.id);
    res.json(user);
  }
);

// Skip caching for certain requests
app.get('/api/admin/*',
  cacheMiddleware({
    skip: (req) => req.headers['cache-control'] === 'no-cache',
  }),
  async (req, res) => {
    // ...
  }
);
```

## 3. Advanced Caching Strategy

```javascript
import { SmartCache } from 'smartcache';

const cache = new SmartCache({
  maxItems: 1000,
  maxSize: '1GB',
  defaultTTL: 300,
  cleanupInterval: 60,
});

// Event listeners
cache.on('hit', ({ key, size }) => {
  console.log(`✓ Cache HIT: ${key} (${size} bytes)`);
});

cache.on('miss', ({ key }) => {
  console.log(`✗ Cache MISS: ${key}`);
});

cache.on('eviction', ({ key, reason }) => {
  console.log(`🗑️  Evicted: ${key} (${reason})`);
});

cache.on('cleanup', ({ expiredCount, freedBytes }) => {
  console.log(`🧹 Cleanup: ${expiredCount} entries, ${freedBytes} bytes freed`);
});

// Different priority levels
cache.set('session:user123', sessionData, {
  priority: 'critical', // Never auto-deleted
});

cache.set('api:response', responseData, {
  priority: 'high',
  ttl: 600,
});

cache.set('temp:calculation', tempData, {
  priority: 'low', // First to be deleted
});

// Get by tag
const apiResponses = cache.getByTag('api');

// Evict by tag
cache.evictByTag('temp');

// Manual cleanup
const result = cache.cleanup();
console.log(`Removed ${result.expiredCount} expired entries`);
```

## 4. Rate Limiting with Cache

```javascript
import { SmartCache } from 'smartcache';

const rateLimitCache = new SmartCache({
  defaultTTL: 60, // 1 minute window
});

function rateLimiter(maxRequests: number) {
  return (req, res, next) => {
    const ip = req.ip;
    const key = `ratelimit:${ip}`;
    
    let count = cache.get(key) || 0;
    
    if (count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    cache.set(key, count + 1, {
      ttl: 60,
      priority: 'low',
    });
    
    next();
  };
}

// Usage
app.use('/api/', rateLimiter(100)); // 100 requests per minute
```

## 5. Database Query Caching

```javascript
import { SmartCache } from 'smartcache';

const queryCache = new SmartCache({
  maxSize: '200MB',
  defaultTTL: 300,
});

async function cachedQuery(query, params) {
  const cacheKey = `query:${query}:${JSON.stringify(params)}`;
  
  // Try cache first
  const cached = queryCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Execute query
  const result = await db.query(query, params);
  
  // Cache result
  queryCache.set(cacheKey, result, {
    ttl: 300,
    tags: ['query', getTableName(query)],
  });
  
  return result;
}

// Usage
const users = await cachedQuery(
  'SELECT * FROM users WHERE status = ?',
  ['active']
);

// Clear query cache when table changes
app.post('/api/users', async (req, res) => {
  await db.createUser(req.body);
  queryCache.evictByTag('query:users'); // Clear related cache
  res.json({ success: true });
});
```

## 6. CLI Monitoring

```bash
# View stats
npx smartcache stats

# Live monitoring
npx smartcache watch

# Evict specific tags
npx smartcache evict --tag="temp"

# Generate report
npx smartcache report --format=json

# Clear all
npx smartcache clear --yes
```

## 7. Python Usage

```python
from smartcache import Cache

cache = Cache(max_size="500MB", default_ttl=300)

# Set
cache.set("key", {"name": "John"})

# Get
data = cache.get("key")

# With options
cache.set("api:data", data, ttl=600, priority="high")

# Stats
print(cache.stats())
```

## 8. LLM Response Caching

```javascript
import { SmartCache } from 'smartcache';

const llmCache = new SmartCache({
  maxSize: '1GB',
  defaultTTL: 3600, // 1 hour for LLM responses
});

async function cachedLLM(prompt) {
  const cacheKey = `llm:${hash(prompt)}`;
  
  const cached = llmCache.get(cacheKey);
  if (cached) {
    console.log('LLM cache HIT');
    return cached;
  }
  
  const response = await generateLLM(prompt);
  
  llmCache.set(cacheKey, response, {
    ttl: 3600,
    priority: 'medium',
    tags: ['llm', 'response'],
  });
  
  return response;
}
```

## 9. Session Management

```javascript
import { SmartCache } from 'smartcache';

const sessionCache = new SmartCache({
  maxItems: 10000,
  defaultTTL: 1800, // 30 minutes
});

function createSession(userId, data) {
  sessionCache.set(`session:${userId}`, data, {
    ttl: 1800,
    priority: 'critical', // Don't auto-delete sessions
  });
}

function getSession(userId) {
  return sessionCache.get(`session:${userId}`);
}

function deleteSession(userId) {
  sessionCache.remove(`session:${userId}`);
}

// Extend session on activity
function touchSession(userId) {
  const session = getSession(userId);
  if (session) {
    sessionCache.set(`session:${userId}`, session, {
      ttl: 1800, // Reset TTL
      priority: 'critical',
    });
  }
}
```

## 10. Multi-Layer Caching

```javascript
import { SmartCache } from 'smartcache';

// L1 - Fast, small
const l1Cache = new SmartCache({
  maxSize: '50MB',
  defaultTTL: 60,
});

// L2 - Slower, larger
const l2Cache = new SmartCache({
  maxSize: '500MB',
  defaultTTL: 300,
});

async function get(key) {
  // Try L1 first
  let data = l1Cache.get(key);
  if (data) {
    return data;
  }
  
  // Try L2
  data = l2Cache.get(key);
  if (data) {
    // Promote to L1
    l1Cache.set(key, data);
    return data;
  }
  
  return null;
}

async function set(key, value) {
  // Set both layers
  l1Cache.set(key, value);
  l2Cache.set(key, value);
}
```
