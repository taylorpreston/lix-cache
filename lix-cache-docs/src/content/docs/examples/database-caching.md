---
title: Database Caching
description: Cache database queries with Lix Cache for better performance
---

Reduce database load and improve response times by caching query results with Lix Cache.

## Basic Query Caching

### Simple Cache-Aside Pattern

```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();

interface User {
  id: string;
  name: string;
  email: string;
}

async function getUser(userId: string): Promise<User | null> {
  // Try cache first
  const cached = await cache.get<User>(`user:${userId}`);
  if (cached) {
    console.log('Cache hit!');
    return cached;
  }

  // Cache miss - query database
  console.log('Cache miss - querying database');
  const user = await db.users.findById(userId);

  if (user) {
    // Store in cache for 5 minutes
    await cache.set(`user:${userId}`, user, { ttl: 300 });
  }

  return user;
}
```

### Using Remember Pattern

Much cleaner with `remember()`:

```typescript
async function getUser(userId: string): Promise<User> {
  return cache.remember(
    `user:${userId}`,
    async () => {
      // Only runs on cache miss
      return await db.users.findById(userId);
    },
    { ttl: 300 } // 5 minutes
  );
}

// That's it! Handles cache-aside automatically.
```

## Complex Queries

### Caching Query Results

```typescript
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

async function searchProducts(query: string, filters: any): Promise<Product[]> {
  // Create cache key from query params
  const cacheKey = `search:${query}:${JSON.stringify(filters)}`;

  return cache.remember(
    cacheKey,
    async () => {
      // Expensive database query
      return await db.products
        .where('name', 'like', `%${query}%`)
        .where('category', filters.category)
        .where('price', '>=', filters.minPrice)
        .where('price', '<=', filters.maxPrice)
        .orderBy('name')
        .limit(100)
        .toArray();
    },
    { ttl: 600 } // 10 minutes
  );
}

// Usage
const products = await searchProducts('laptop', {
  category: 'electronics',
  minPrice: 500,
  maxPrice: 2000
});
```

### Aggregation Queries

Cache expensive aggregations:

```typescript
interface DailySales {
  date: string;
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
}

async function getDailySales(date: string): Promise<DailySales> {
  return cache.remember(
    `sales:daily:${date}`,
    async () => {
      const orders = await db.orders
        .where('date', date)
        .select(
          db.raw('SUM(total) as totalRevenue'),
          db.raw('COUNT(*) as orderCount'),
          db.raw('AVG(total) as averageOrderValue')
        )
        .first();

      return {
        date,
        ...orders
      };
    },
    { ttl: 86400 } // 24 hours (historical data doesn't change)
  );
}
```

## Prisma Integration

### Caching Prisma Queries

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getUserWithPosts(userId: string) {
  return cache.remember(
    `user:${userId}:with-posts`,
    async () => {
      return await prisma.user.findUnique({
        where: { id: userId },
        include: {
          posts: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });
    },
    { ttl: 300 }
  );
}

// Invalidate on update
async function updateUser(userId: string, data: any) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data
  });

  // Clear cache
  await cache.delete(`user:${userId}`);
  await cache.delete(`user:${userId}:with-posts`);

  return updated;
}
```

### Prisma Middleware (Automatic Caching)

```typescript
prisma.$use(async (params, next) => {
  // Only cache read operations
  if (params.action !== 'findUnique' && params.action !== 'findMany') {
    return next(params);
  }

  // Create cache key from query
  const cacheKey = `prisma:${params.model}:${params.action}:${JSON.stringify(params.args)}`;

  // Try cache
  const cached = await cache.get(cacheKey);
  if (cached) {
    console.log('Prisma cache hit:', cacheKey);
    return cached;
  }

  // Execute query
  const result = await next(params);

  // Cache result
  await cache.set(cacheKey, result, { ttl: 300 });

  return result;
});

// Now all Prisma queries are automatically cached!
const user = await prisma.user.findUnique({ where: { id: '1' } });
```

## TypeORM Integration

### Repository Caching

```typescript
import { Repository } from 'typeorm';
import { User } from './entities/User';

class CachedUserRepository {
  constructor(private repo: Repository<User>) {}

  async findById(id: string): Promise<User | null> {
    return cache.remember(
      `user:${id}`,
      async () => await this.repo.findOne({ where: { id } }),
      { ttl: 300 }
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    return cache.remember(
      `user:email:${email}`,
      async () => await this.repo.findOne({ where: { email } }),
      { ttl: 300 }
    );
  }

  async save(user: User): Promise<User> {
    const saved = await this.repo.save(user);

    // Invalidate related caches
    await cache.delete(`user:${user.id}`);
    await cache.delete(`user:email:${user.email}`);

    return saved;
  }

  async delete(id: string): Promise<void> {
    const user = await this.repo.findOne({ where: { id } });

    await this.repo.delete(id);

    // Invalidate caches
    if (user) {
      await cache.delete(`user:${id}`);
      await cache.delete(`user:email:${user.email}`);
    }
  }
}
```

## Cache Invalidation Strategies

### Manual Invalidation

```typescript
// Update user
async function updateUser(userId: string, data: Partial<User>) {
  const updated = await db.users.update(userId, data);

  // Clear cache
  await cache.delete(`user:${userId}`);

  return updated;
}

// Delete user
async function deleteUser(userId: string) {
  await db.users.delete(userId);

  // Clear cache
  await cache.delete(`user:${userId}`);
}
```

### Tag-Based Invalidation

Invalidate multiple related keys:

```typescript
interface CacheTag {
  tag: string;
  keys: Set<string>;
}

class TaggedCache {
  async set(key: string, value: any, tags: string[], ttl: number) {
    // Store value
    await cache.set(key, value, { ttl });

    // Register key with each tag
    for (const tag of tags) {
      const tagData: CacheTag = await cache.get(`tag:${tag}`) || {
        tag,
        keys: new Set()
      };

      tagData.keys.add(key);

      await cache.set(`tag:${tag}`, tagData, { ttl: ttl + 3600 });
    }
  }

  async invalidateTag(tag: string) {
    const tagData: CacheTag = await cache.get(`tag:${tag}`);

    if (!tagData) return;

    // Delete all keys with this tag
    await Promise.all(
      Array.from(tagData.keys).map(key => cache.delete(key))
    );

    // Delete tag itself
    await cache.delete(`tag:${tag}`);
  }
}

const taggedCache = new TaggedCache();

// Usage
await taggedCache.set('user:1', userData, ['user', 'user:1'], 300);
await taggedCache.set('user:1:posts', postsData, ['user', 'user:1', 'posts'], 300);
await taggedCache.set('user:1:settings', settingsData, ['user', 'user:1'], 300);

// Invalidate all user:1 caches at once
await taggedCache.invalidateTag('user:1');
```

### Time-Based Invalidation

Different TTLs based on data volatility:

```typescript
const CACHE_TTLS = {
  user: 300,           // 5 minutes
  product: 600,        // 10 minutes
  category: 3600,      // 1 hour
  settings: 86400,     // 24 hours
  analytics: 1800      // 30 minutes
};

async function getCachedData<T>(
  type: keyof typeof CACHE_TTLS,
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  return cache.remember(
    `${type}:${key}`,
    fetcher,
    { ttl: CACHE_TTLS[type] }
  );
}

// Usage
const user = await getCachedData('user', '123', () => db.users.findById('123'));
const product = await getCachedData('product', '456', () => db.products.findById('456'));
```

## Collections for Domain Objects

### Type-Safe User Repository

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string(),
  updatedAt: z.string()
});

type User = z.infer<typeof UserSchema>;

// Create collection
const users = cache.collection<User>('user:', UserSchema);

class UserRepository {
  async findById(id: string): Promise<User | null> {
    return users.remember(
      id,
      async () => await db.users.findById(id),
      { ttl: 300 }
    );
  }

  async save(user: User): Promise<User> {
    const saved = await db.users.save(user);

    // Update cache
    await users.set(user.id, saved, { ttl: 300 });

    return saved;
  }

  async delete(id: string): Promise<void> {
    await db.users.delete(id);
    await users.delete(id);
  }

  async findAll(): Promise<User[]> {
    const result = await users.scan();
    return result.items.map(item => item.value);
  }
}
```

## Query Result Patterns

### Pagination Caching

```typescript
interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

async function getPaginatedUsers(
  page: number,
  pageSize: number
): Promise<PaginatedResult<User>> {
  return cache.remember(
    `users:page:${page}:size:${pageSize}`,
    async () => {
      const [items, total] = await Promise.all([
        db.users
          .offset((page - 1) * pageSize)
          .limit(pageSize)
          .toArray(),
        db.users.count()
      ]);

      return { items, total, page, pageSize };
    },
    { ttl: 300 }
  );
}
```

### List Caching with Individual Items

Cache both list and individual items:

```typescript
async function getAllProducts(): Promise<Product[]> {
  // Cache the list
  const products = await cache.remember(
    'products:all',
    async () => await db.products.findAll(),
    { ttl: 600 }
  );

  // Also cache individual items
  await Promise.all(
    products.map(product =>
      cache.set(`product:${product.id}`, product, { ttl: 600 })
    )
  );

  return products;
}

async function getProduct(id: string): Promise<Product | null> {
  // Check individual cache first
  return cache.remember(
    `product:${id}`,
    async () => await db.products.findById(id),
    { ttl: 600 }
  );
}
```

## Performance Optimization

### Batch Loading

Load multiple items efficiently:

```typescript
async function batchGetUsers(userIds: string[]): Promise<Map<string, User>> {
  const results = new Map<string, User>();

  // Try to get from cache
  const cachePromises = userIds.map(async id => {
    const cached = await cache.get<User>(`user:${id}`);
    if (cached) {
      results.set(id, cached);
      return id;
    }
    return null;
  });

  const cachedIds = (await Promise.all(cachePromises)).filter(Boolean) as string[];

  // Find IDs not in cache
  const missingIds = userIds.filter(id => !cachedIds.includes(id));

  if (missingIds.length > 0) {
    // Batch query database
    const users = await db.users.findMany({
      where: { id: { in: missingIds } }
    });

    // Store in cache and results
    await Promise.all(
      users.map(async user => {
        results.set(user.id, user);
        await cache.set(`user:${user.id}`, user, { ttl: 300 });
      })
    );
  }

  return results;
}

// Usage
const userMap = await batchGetUsers(['1', '2', '3', '4', '5']);
```

### Prefetching Related Data

```typescript
async function getUserWithRelations(userId: string) {
  const user = await cache.remember(
    `user:${userId}`,
    async () => await db.users.findById(userId),
    { ttl: 300 }
  );

  // Prefetch related data in parallel
  const [posts, comments, followers] = await Promise.all([
    cache.remember(
      `user:${userId}:posts`,
      async () => await db.posts.findByUserId(userId),
      { ttl: 300 }
    ),
    cache.remember(
      `user:${userId}:comments`,
      async () => await db.comments.findByUserId(userId),
      { ttl: 300 }
    ),
    cache.remember(
      `user:${userId}:followers`,
      async () => await db.followers.findByUserId(userId),
      { ttl: 300 }
    )
  ]);

  return { user, posts, comments, followers };
}
```

### Warming Cache

Pre-populate cache with frequently accessed data:

```typescript
async function warmCache() {
  console.log('Warming cache...');

  // Load top products
  const products = await db.products
    .orderBy('views', 'desc')
    .limit(100)
    .toArray();

  await Promise.all(
    products.map(product =>
      cache.set(`product:${product.id}`, product, { ttl: 3600 })
    )
  );

  // Load active users
  const users = await db.users
    .where('lastActive', '>', Date.now() - 86400000)
    .toArray();

  await Promise.all(
    users.map(user =>
      cache.set(`user:${user.id}`, user, { ttl: 300 })
    )
  );

  console.log('Cache warmed!');
}

// Run on startup
warmCache().catch(console.error);
```

## Monitoring Cache Performance

### Track Hit Rate

```typescript
let cacheHits = 0;
let cacheMisses = 0;

async function getWithMetrics<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  const cached = await cache.get<T>(key);

  if (cached) {
    cacheHits++;
    console.log(`Cache hit rate: ${(cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2)}%`);
    return cached;
  }

  cacheMisses++;
  const value = await fetcher();
  await cache.set(key, value, { ttl });

  return value;
}
```

### Performance Metrics

```typescript
interface CacheMetrics {
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  avgQueryTime: number;
}

class MetricsCollector {
  private metrics: CacheMetrics = {
    totalQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRate: 0,
    avgQueryTime: 0
  };

  private queryTimes: number[] = [];

  async queryWithMetrics<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const start = Date.now();
    this.metrics.totalQueries++;

    const cached = await cache.get<T>(key);

    if (cached) {
      this.metrics.cacheHits++;
      const duration = Date.now() - start;
      this.queryTimes.push(duration);
      this.updateMetrics();
      return cached;
    }

    this.metrics.cacheMisses++;
    const value = await fetcher();
    await cache.set(key, value, { ttl });

    const duration = Date.now() - start;
    this.queryTimes.push(duration);
    this.updateMetrics();

    return value;
  }

  private updateMetrics() {
    this.metrics.hitRate = this.metrics.cacheHits / this.metrics.totalQueries;
    this.metrics.avgQueryTime =
      this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }
}

// Usage
const metrics = new MetricsCollector();

app.get('/api/admin/cache/metrics', (req, res) => {
  res.json(metrics.getMetrics());
});
```

## Best Practices

### 1. Choose Appropriate TTLs

```typescript
// ✅ Good: Match TTL to data volatility
const user = await cache.remember('user:1', fetchUser, { ttl: 300 });      // 5 min
const settings = await cache.remember('settings', fetchSettings, { ttl: 3600 }); // 1 hour
const analytics = await cache.remember('daily-stats', fetchStats, { ttl: 86400 }); // 24 hours

// ❌ Bad: Same TTL for everything
const ttl = 60; // Too short for stable data, too long for volatile data
```

### 2. Use Remember Pattern

```typescript
// ✅ Good: Clean and automatic
const user = await cache.remember('user:1', () => db.users.findById('1'), { ttl: 300 });

// ❌ Bad: Manual cache-aside is verbose
let user = await cache.get('user:1');
if (!user) {
  user = await db.users.findById('1');
  await cache.set('user:1', user, { ttl: 300 });
}
```

### 3. Invalidate on Write

```typescript
// ✅ Good: Clear cache after update
async function updateUser(id: string, data: any) {
  const updated = await db.users.update(id, data);
  await cache.delete(`user:${id}`);
  return updated;
}

// ❌ Bad: Stale cache
async function updateUser(id: string, data: any) {
  return await db.users.update(id, data);
  // Cache still has old data!
}
```

### 4. Use Consistent Key Naming

```typescript
// ✅ Good: Consistent pattern
`user:${userId}`
`user:${userId}:posts`
`user:${userId}:settings`
`product:${productId}`
`category:${categoryId}`

// ❌ Bad: Inconsistent naming
`user_${userId}`
`posts-for-user-${userId}`
`${userId}Settings`
```

## Next Steps

- [Remember Pattern](/guides/remember/) - Deep dive into remember()
- [Collections](/guides/collections/) - Type-safe domain caching
- [Rate Limiting](/examples/rate-limiting/) - Protect your database
