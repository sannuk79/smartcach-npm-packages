# SmartCache Angular Examples

## Installation

```bash
npm install smartcache-angular
```

## Setup

### app.module.ts

```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';

import { 
  CacheService, 
  CacheInterceptor,
  SMARTCACHE_CONFIG 
} from 'smartcache-angular';

import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
  ],
  providers: [
    {
      provide: SMARTCACHE_CONFIG,
      useValue: {
        maxItems: 1000,
        maxSize: '50MB',
        defaultTTL: 300, // 5 minutes
        enabled: true,
      },
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: CacheInterceptor,
      multi: true,
    },
    CacheService,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

---

## 1. Basic Service Usage

```typescript
import { Component, OnInit } from '@angular/core';
import { CacheService } from 'smartcache-angular';

@Component({
  selector: 'app-products',
  template: `
    <div *ngIf="products; else loading">
      <div *ngFor="let product of products">
        {{ product.name }}
      </div>
    </div>
    <ng-template #loading>Loading...</ng-template>
  `,
})
export class ProductsComponent implements OnInit {
  products: any[] | undefined;

  constructor(private cache: CacheService) {}

  ngOnInit() {
    // Try cache first
    this.products = this.cache.get('products');

    if (!this.products) {
      // Fetch and cache
      this.loadProducts();
    }
  }

  loadProducts() {
    this.productService.getProducts().subscribe((data) => {
      this.products = data;
      
      // Cache with options
      this.cache.set('products', data, {
        ttl: 600, // 10 minutes
        priority: 'high',
        tags: ['api', 'products'],
      });
    });
  }
}
```

---

## 2. HTTP Auto-Caching

```typescript
// With CacheInterceptor, GET requests are automatically cached!

// Add header to control TTL
this.http.get('/api/products', {
  headers: {
    'X-Cache-TTL': '600' // 10 minutes
  }
}).subscribe();

// First request - fetches from server
// Second request - returns from cache (within TTL)
```

---

## 3. Method Decorator

```typescript
import { Component } from '@angular/core';
import { CacheMethod, TTL, PRIORITY } from 'smartcache-angular';

@Component({
  selector: 'app-user',
  template: `...`,
})
export class UserComponent {
  // Method result is automatically cached
  @CacheMethod({
    ttl: TTL.MINUTE * 10,
    priority: PRIORITY.HIGH,
    tags: ['user'],
  })
  getUser(id: number) {
    return this.userService.getById(id);
  }

  // Works with async methods too
  @CacheMethod({
    ttl: TTL.MINUTE * 5,
    tags: ['api'],
  })
  async fetchUserData(userId: string) {
    const response = await this.http.get(`/api/users/${userId}`).toPromise();
    return response;
  }
}
```

---

## 4. Route Resolver

```typescript
// Create cached resolver
import { createCacheResolver } from 'smartcache-angular';

export const ProductsResolver = createCacheResolver(
  ProductsService,
  'getAll' // method name
);

// In routing module
const routes: Routes = [
  {
    path: 'products',
    component: ProductsComponent,
    resolve: {
      products: ProductsResolver,
    },
  },
];
```

---

## 5. Manual Cache Control

```typescript
import { Component } from '@angular/core';
import { CacheService } from 'smartcache-angular';

@Component({
  selector: 'app-admin',
  template: `
    <button (click)="clearCache()">Clear Cache</button>
    <button (click)="clearUsers()">Clear Users Only</button>
    <pre>{{ stats | json }}</pre>
  `,
})
export class AdminComponent {
  stats: any;

  constructor(private cache: CacheService) {
    this.stats = this.cache.getStats();
  }

  // Clear specific tag
  clearUsers() {
    this.cache.evictByTag('user');
  }

  // Clear all
  clearCache() {
    this.cache.clear();
  }

  // Get cached data by tag
  getAllUsers() {
    const users = this.cache.getByTag('user');
    console.log(users);
  }

  // Manual cleanup
  cleanup() {
    const result = this.cache.cleanup();
    console.log(`Removed ${result.expiredCount} expired entries`);
  }
}
```

---

## 6. Using Utilities

```typescript
import { 
  KeyGenerator, 
  TTL, 
  PRIORITY, 
  cacheOptions,
  formatStats,
  memoize,
  cacheAsync 
} from 'smartcache-angular';

// Generate cache keys
const key1 = KeyGenerator.create('user', 123);
// "user:123"

const key2 = KeyGenerator.fromObject({ id: 123, type: 'admin' });
// '{"id":123,"type":"admin"}'

const key3 = KeyGenerator.fromUrl('/api/users', { page: 1 });
// "/api/users:{"page":1}"

// Use presets
this.cache.set('data', value, cacheOptions({
  ttl: TTL.HOUR,
  priority: PRIORITY.HIGH,
  tags: ['api'],
}));

// Memoize function
const expensiveCalc = memoize((n: number) => {
  // expensive operation
  return n * n;
}, TTL.MINUTE * 5);

// Cache async function
const cachedFetch = cacheAsync(async (url: string) => {
  const res = await fetch(url);
  return res.json();
}, { ttl: TTL.MINUTE * 10 });
```

---

## 7. Component with Cache

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CacheService, KeyGenerator } from 'smartcache-angular';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-product-detail',
  template: `
    <div *ngIf="product">
      <h2>{{ product.name }}</h2>
      <p>{{ product.price | currency }}</p>
    </div>
  `,
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  product: any;
  private subscription?: Subscription;

  constructor(private cache: CacheService) {}

  ngOnInit() {
    const productId = 123;
    const cacheKey = KeyGenerator.create('product', productId);

    // Try cache
    this.product = this.cache.get(cacheKey);

    if (!this.product) {
      // Load from API
      this.subscription = this.productService
        .getById(productId)
        .subscribe((product) => {
          this.product = product;
          
          // Cache it
          this.cache.set(cacheKey, product, {
            ttl: 600,
            priority: 'medium',
            tags: ['product', 'api'],
          });
        });
    }
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }
}
```

---

## 8. Cache Invalidation on Update

```typescript
import { Component } from '@angular/core';
import { CacheService, clearCacheOn } from 'smartcache-angular';

@Component({
  selector: 'app-user-form',
  template: `...`,
})
export class UserFormComponent {
  constructor(private cache: CacheService) {}

  updateUser(id: number, data: any) {
    this.userService.update(id, data).subscribe(() => {
      // Clear user-related cache
      this.cache.evictByTag('user');
      this.cache.evictByTag('api');
      
      // Or clear specific key
      this.cache.remove(`user:${id}`);
    });
  }

  // Using helper
  clearOnUpdate = clearCacheOn(this.cache, ['user', 'api']);
}
```

---

## 9. SSR Safe Caching

```typescript
import { isPlatformBrowser } from '@angular/common';
import { Inject, PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `...`,
})
export class AppComponent {
  private isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: Object,
    private cache: CacheService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  loadData() {
    // Only cache in browser
    if (this.isBrowser) {
      const cached = this.cache.get('data');
      if (cached) return cached;
    }

    // Fetch from server
    return this.http.get('/api/data').subscribe((data) => {
      if (this.isBrowser) {
        this.cache.set('data', data);
      }
    });
  }
}
```

---

## 10. Monitor Cache Stats

```typescript
import { Component, OnInit } from '@angular/core';
import { CacheService, formatStats } from 'smartcache-angular';

@Component({
  selector: 'app-cache-monitor',
  template: `
    <div class="monitor">
      <h3>Cache Statistics</h3>
      <pre>{{ formattedStats }}</pre>
      <button (click)="refresh()">Refresh</button>
    </div>
  `,
  styles: [`
    .monitor {
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: #1e1e1e;
      color: #fff;
      padding: 10px;
      border-radius: 5px;
      font-family: monospace;
    }
  `],
})
export class CacheMonitorComponent implements OnInit {
  formattedStats: string = '';

  constructor(private cache: CacheService) {}

  ngOnInit() {
    this.refresh();
    
    // Auto-refresh every 5 seconds
    setInterval(() => this.refresh(), 5000);
  }

  refresh() {
    const stats = this.cache.getStats();
    this.formattedStats = formatStats(stats);
  }
}
```

---

## Best Practices

### 1. Use Tags for Grouping
```typescript
this.cache.set('user:123', data, { tags: ['user', 'api'] });
this.cache.set('product:456', data, { tags: ['product', 'api'] });

// Clear all API cache
this.cache.evictByTag('api');
```

### 2. Set Appropriate TTLs
```typescript
// Static data - long TTL
this.cache.set('config', config, { ttl: TTL.DAY });

// User data - medium TTL
this.cache.set('user:123', user, { ttl: TTL.MINUTE * 10 });

// Temporary data - short TTL
this.cache.set('temp:calc', result, { ttl: TTL.MINUTE });
```

### 3. Use Priority for Important Data
```typescript
// Critical - never auto-deleted
this.cache.set('session', session, { priority: 'critical' });

// High - deleted last
this.cache.set('user:profile', profile, { priority: 'high' });

// Low - deleted first
this.cache.set('temp:data', data, { priority: 'low' });
```

### 4. Invalidate on Mutations
```typescript
createUser(data: any) {
  return this.http.post('/api/users', data).subscribe(() => {
    // Clear user list cache
    this.cache.evictByTag('users');
  });
}
```

### 5. Monitor in Development
```typescript
if (!environment.production) {
  setInterval(() => {
    console.log(formatStats(this.cache.getStats()));
  }, 10000);
}
```

---

## API Reference

### CacheService

| Method | Description |
|--------|-------------|
| `set(key, value, options)` | Set cache value |
| `get(key, default?)` | Get cache value |
| `getOrSet(key, factory, options)` | Get or set atomically |
| `has(key)` | Check if exists |
| `remove(key)` | Remove key |
| `clear()` | Clear all |
| `getStats()` | Get statistics |
| `getByTag(tag)` | Get by tag |
| `evictByTag(tag)` | Evict by tag |
| `cleanup()` | Manual cleanup |

### Options

```typescript
interface SetOptions {
  ttl?: number;           // Seconds (default: 300)
  priority?: Priority;    // 'critical' | 'high' | 'medium' | 'low'
  tags?: string[];        // For grouping
}
```

### Config

```typescript
interface SmartCacheConfig {
  maxItems?: number;         // Default: 1000
  maxSize?: string | number; // Default: '50MB'
  defaultTTL?: number;       // Default: 300 (5 min)
  cleanupInterval?: number;  // Default: 60 (1 min)
  enabled?: boolean;         // Default: true
  storage?: 'memory' | 'session' | 'local';
}
```
