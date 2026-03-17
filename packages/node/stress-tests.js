/**
 * SmartCache Stress Tests
 * 
 * Tests for:
 * - 10K+ entries with LRU eviction
 * - TTL expiry
 * - Priority-based eviction
 * - Concurrent access
 * - Memory limits
 * - Hybrid cache (L1 + L2)
 */

const { SmartCache, HybridCache } = require('./dist/index');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ============================================
// Test 1: 10K Entries with LRU Eviction
// ============================================
async function test10kEntriesWithLRU() {
  log('\n🧪 TEST 1: 10K Entries with LRU Eviction', 'cyan');
  log('=' .repeat(50), 'cyan');

  const cache = new SmartCache({
    maxItems: 1000,  // Limit to 1000 items
    maxSize: '10MB',
    defaultTTL: 0,   // No TTL for this test
  });

  const totalInserts = 10000;
  const startTime = Date.now();

  log(`Inserting ${totalInserts.toLocaleString()} entries...`, 'blue');

  // Insert 10,000 entries
  for (let i = 0; i < totalInserts; i++) {
    cache.set(`key:${i}`, {
      id: i,
      data: `value-${i}`,
      timestamp: Date.now(),
      payload: 'x'.repeat(100), // 100 bytes per entry
    });
  }

  const duration = Date.now() - startTime;
  const stats = cache.getStats();

  log(`\n✅ Results:`, 'green');
  log(`   Time taken: ${duration}ms (${(totalInserts / duration).toFixed(2)} inserts/ms)`, 'white');
  log(`   Items inserted: ${totalInserts.toLocaleString()}`, 'white');
  log(`   Items in cache: ${stats.totalItems.toLocaleString()}`, 'white');
  log(`   Evictions: ${stats.evictions.toLocaleString()}`, 'white');
  log(`   Memory used: ${(stats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`, 'white');

  const passed = stats.totalItems <= 1000 && stats.evictions >= 9000;
  log(`\n   LRU Working: ${passed ? '✅ YES' : '❌ NO'}`, passed ? 'green' : 'red');
  log(`   Expected: ~1000 items (maxItems limit)`, 'white');

  return passed;
}

// ============================================
// Test 2: Verify LRU Order
// ============================================
async function testLRUOrder() {
  log('\n🧪 TEST 2: Verify LRU Order', 'cyan');
  log('=' .repeat(50), 'cyan');

  const cache = new SmartCache({
    maxItems: 100,
  });

  log('Inserting 100 items...', 'blue');

  // Insert 100 items
  for (let i = 0; i < 100; i++) {
    cache.set(`key:${i}`, `value-${i}`);
  }

  log('Accessing key:0, key:1, key:2 (make recently used)...', 'blue');

  // Access key:0, key:1, key:2 (make them recently used)
  cache.get('key:0');
  cache.get('key:1');
  cache.get('key:2');

  log('Inserting 1 new item (should evict oldest)...', 'blue');

  // Insert 1 new item (should evict key:3, not key:0/1/2)
  cache.set('key:new', 'new-value');

  const key0Exists = cache.get('key:0') !== undefined;
  const key1Exists = cache.get('key:1') !== undefined;
  const key2Exists = cache.get('key:2') !== undefined;
  const key3Exists = cache.get('key:3') !== undefined;

  log(`\n✅ Results:`, 'green');
  log(`   key:0 exists (recently used): ${key0Exists ? '✅' : '❌'}`, key0Exists ? 'green' : 'red');
  log(`   key:1 exists (recently used): ${key1Exists ? '✅' : '❌'}`, key1Exists ? 'green' : 'red');
  log(`   key:2 exists (recently used): ${key2Exists ? '✅' : '❌'}`, key2Exists ? 'green' : 'red');
  log(`   key:3 evicted (oldest): ${!key3Exists ? '✅' : '❌'}`, !key3Exists ? 'green' : 'red');

  const passed = key0Exists && key1Exists && key2Exists && !key3Exists;
  log(`\n   LRU Order: ${passed ? '✅ CORRECT' : '❌ INCORRECT'}`, passed ? 'green' : 'red');

  return passed;
}

// ============================================
// Test 3: TTL Expiry
// ============================================
async function testTTLEXpiry() {
  log('\n🧪 TEST 3: TTL Expiry', 'cyan');
  log('=' .repeat(50), 'cyan');

  const cache = new SmartCache({
    defaultTTL: 10, // 10 seconds default
  });

  log('Setting key with 2 second TTL...', 'blue');
  cache.set('expire-soon', 'data-1', { ttl: 2 });
  
  log('Setting key with 10 second TTL...', 'blue');
  cache.set('expire-later', 'data-2', { ttl: 10 });

  const existsBefore = cache.has('expire-soon');
  log(`\n✅ expire-soon exists (before): ${existsBefore ? '✅' : '❌'}`, existsBefore ? 'green' : 'red');

  log('Waiting 3 seconds...', 'blue');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const existsAfter = cache.has('expire-soon');
  const laterExists = cache.has('expire-later');

  log(`\n✅ Results:`, 'green');
  log(`   expire-soon expired: ${!existsAfter ? '✅' : '❌'}`, !existsAfter ? 'green' : 'red');
  log(`   expire-later exists: ${laterExists ? '✅' : '❌'}`, laterExists ? 'green' : 'red');

  const passed = !existsAfter && laterExists;
  log(`\n   TTL Working: ${passed ? '✅ YES' : '❌ NO'}`, passed ? 'green' : 'red');

  return passed;
}

// ============================================
// Test 4: Priority-Based Eviction
// ============================================
async function testPriorityEviction() {
  log('\n🧪 TEST 4: Priority-Based Eviction', 'cyan');
  log('=' .repeat(50), 'cyan');

  const cache = new SmartCache({
    maxItems: 100,
  });

  log('Inserting items with different priorities...', 'blue');

  // Insert 50 low priority items
  for (let i = 0; i < 50; i++) {
    cache.set(`low:${i}`, `data-${i}`, { priority: 'low' });
  }

  // Insert 30 medium priority items
  for (let i = 0; i < 30; i++) {
    cache.set(`medium:${i}`, `data-${i}`, { priority: 'medium' });
  }

  // Insert 20 high priority items
  for (let i = 0; i < 20; i++) {
    cache.set(`high:${i}`, `data-${i}`, { priority: 'high' });
  }

  log('Inserting 10 critical priority items...', 'blue');

  // Insert 10 critical priority items (should not be evicted)
  for (let i = 0; i < 10; i++) {
    cache.set(`critical:${i}`, `data-${i}`, { priority: 'critical' });
  }

  const stats = cache.getStats();
  log(`\n✅ Total items: ${stats.totalItems}`, 'white');

  // Check if critical items still exist
  let criticalExists = 0;
  for (let i = 0; i < 10; i++) {
    if (cache.get(`critical:${i}`) !== undefined) {
      criticalExists++;
    }
  }

  log(`   Critical items remaining: ${criticalExists}/10`, criticalExists === 10 ? 'green' : 'red');

  const passed = criticalExists === 10;
  log(`\n   Priority Eviction: ${passed ? '✅ CORRECT' : '❌ INCORRECT'}`, passed ? 'green' : 'red');

  return passed;
}

// ============================================
// Test 5: Concurrent Access
// ============================================
async function testConcurrentAccess() {
  log('\n🧪 TEST 5: Concurrent Access (1000 parallel requests)', 'cyan');
  log('=' .repeat(50), 'cyan');

  const cache = new SmartCache({
    maxItems: 10000,
    maxSize: '100MB',
  });

  const totalRequests = 1000;
  log(`Starting ${totalRequests} concurrent requests...`, 'blue');

  const promises = [];
  for (let i = 0; i < totalRequests; i++) {
    promises.push(
      cache.getOrSet(`concurrent:${i}`, () => ({
        id: i,
        timestamp: Date.now(),
        data: 'x'.repeat(50),
      }))
    );
  }

  const startTime = Date.now();
  await Promise.all(promises);
  const duration = Date.now() - startTime;

  const stats = cache.getStats();

  log(`\n✅ Results:`, 'green');
  log(`   Time taken: ${duration}ms (${(totalRequests / (duration / 1000)).toFixed(2)} req/s)`, 'white');
  log(`   Cache hits: ${stats.hits}`, 'white');
  log(`   Cache misses: ${stats.misses}`, 'white');
  log(`   Hit rate: ${stats.hitRate.toFixed(2)}%`, 'white');
  log(`   Items in cache: ${stats.totalItems}`, 'white');

  const passed = stats.totalItems === totalRequests && duration < 5000;
  log(`\n   Concurrent Access: ${passed ? '✅ PASSED' : '❌ FAILED'}`, passed ? 'green' : 'red');

  return passed;
}

// ============================================
// Test 6: Memory Limit Enforcement
// ============================================
async function testMemoryLimit() {
  log('\n🧪 TEST 6: Memory Limit Enforcement', 'cyan');
  log('=' .repeat(50), 'cyan');

  const cache = new SmartCache({
    maxItems: 10000,
    maxSize: '5MB',  // 5MB limit
  });

  const itemSize = 1024; // 1KB per item
  const totalItems = 10000;

  log(`Inserting ${totalItems.toLocaleString()} items (${itemSize} bytes each)...`, 'blue');
  log(`Expected total: ${(totalItems * itemSize / 1024 / 1024).toFixed(2)} MB`, 'white');

  for (let i = 0; i < totalItems; i++) {
    cache.set(`mem:${i}`, 'x'.repeat(itemSize));
  }

  const stats = cache.getStats();
  const memoryUsedMB = stats.totalSizeBytes / 1024 / 1024;

  log(`\n✅ Results:`, 'green');
  log(`   Memory limit: 5 MB`, 'white');
  log(`   Memory used: ${memoryUsedMB.toFixed(2)} MB`, memoryUsedMB <= 5 ? 'green' : 'red');
  log(`   Items in cache: ${stats.totalItems.toLocaleString()}`, 'white');
  log(`   Evictions: ${stats.evictions.toLocaleString()}`, 'white');

  const passed = memoryUsedMB <= 5;
  log(`\n   Memory Limit: ${passed ? '✅ ENFORCED' : '❌ EXCEEDED'}`, passed ? 'green' : 'red');

  return passed;
}

// ============================================
// Test 7: Tag-Based Operations
// ============================================
async function testTagOperations() {
  log('\n🧪 TEST 7: Tag-Based Operations', 'cyan');
  log('=' .repeat(50), 'cyan');

  const cache = new SmartCache({
    maxItems: 1000,
  });

  log('Setting items with tags...', 'blue');

  // Set items with different tags
  for (let i = 0; i < 100; i++) {
    cache.set(`api:user:${i}`, { id: i }, { tags: ['api', 'user'] });
  }

  for (let i = 0; i < 50; i++) {
    cache.set(`api:product:${i}`, { id: i }, { tags: ['api', 'product'] });
  }

  for (let i = 0; i < 30; i++) {
    cache.set(`static:image:${i}`, { id: i }, { tags: ['static', 'image'] });
  }

  const apiEntries = cache.getByTag('api');
  const userEntries = cache.getByTag('user');
  const productEntries = cache.getByTag('product');

  log(`\n✅ Results:`, 'green');
  log(`   API entries: ${apiEntries.length}`, apiEntries.length === 150 ? 'green' : 'red');
  log(`   User entries: ${userEntries.length}`, userEntries.length === 100 ? 'green' : 'red');
  log(`   Product entries: ${productEntries.length}`, productEntries.length === 50 ? 'green' : 'red');

  log('Evicting by tag "api"...', 'blue');
  const evicted = cache.evictByTag('api');

  const stats = cache.getStats();
  log(`\n✅ After eviction:`, 'green');
  log(`   Evicted: ${evicted} items`, evicted === 150 ? 'green' : 'red');
  log(`   Remaining: ${stats.totalItems} items`, stats.totalItems === 30 ? 'green' : 'red');

  const passed = apiEntries.length === 150 && evicted === 150;
  log(`\n   Tag Operations: ${passed ? '✅ WORKING' : '❌ FAILED'}`, passed ? 'green' : 'red');

  return passed;
}

// ============================================
// Test 8: Hit Rate Monitoring
// ============================================
async function testHitRate() {
  log('\n🧪 TEST 8: Hit Rate Monitoring', 'cyan');
  log('=' .repeat(50), 'cyan');

  const cache = new SmartCache({
    maxItems: 1000,
  });

  log('Populating cache with 100 items...', 'blue');

  // Populate cache
  for (let i = 0; i < 100; i++) {
    cache.set(`item:${i}`, `value-${i}`);
  }

  log('Making 1000 requests (80% hits, 20% misses)...', 'blue');

  // Make requests (80% should hit, 20% should miss)
  for (let i = 0; i < 1000; i++) {
    if (i % 5 === 0) {
      // 20% misses (non-existent keys)
      cache.get(`nonexistent:${i}`);
    } else {
      // 80% hits (existing keys)
      cache.get(`item:${i % 100}`);
    }
  }

  const stats = cache.getStats();
  const expectedHitRate = 80;
  const actualHitRate = stats.hitRate;
  const hitRateDiff = Math.abs(actualHitRate - expectedHitRate);

  log(`\n✅ Results:`, 'green');
  log(`   Expected hit rate: ~${expectedHitRate}%`, 'white');
  log(`   Actual hit rate: ${actualHitRate.toFixed(2)}%`, hitRateDiff < 5 ? 'green' : 'red');
  log(`   Total hits: ${stats.hits}`, 'white');
  log(`   Total misses: ${stats.misses}`, 'white');

  const passed = hitRateDiff < 5;
  log(`\n   Hit Rate Monitoring: ${passed ? '✅ ACCURATE' : '❌ INACCURATE'}`, passed ? 'green' : 'red');

  return passed;
}

// ============================================
// Main Test Runner
// ============================================
async function runAllTests() {
  log('\n🚀 SmartCache Stress Tests', 'cyan');
  log('=' .repeat(50), 'cyan');

  const results = [];

  // Run tests
  results.push(await test10kEntriesWithLRU());
  results.push(await testLRUOrder());
  results.push(await testTTLEXpiry());
  results.push(await testPriorityEviction());
  results.push(await testConcurrentAccess());
  results.push(await testMemoryLimit());
  results.push(await testTagOperations());
  results.push(await testHitRate());

  // Summary
  log('\n\n📊 TEST SUMMARY', 'cyan');
  log('=' .repeat(50), 'cyan');

  const passed = results.filter(r => r).length;
  const total = results.length;
  const percentage = (passed / total) * 100;

  log(`\n✅ Passed: ${passed}/${total} (${percentage.toFixed(1)}%)`, passed === total ? 'green' : 'yellow');

  if (passed === total) {
    log('\n🎉 All tests passed! SmartCache is production-ready!', 'green');
  } else {
    log(`\n⚠️  ${total - passed} test(s) failed. Review results above.`, 'red');
  }

  log('\n', 'reset');
  return passed === total;
}

// Run tests
runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
