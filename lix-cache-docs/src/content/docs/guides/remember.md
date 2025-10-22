---
title: Remember Pattern (Cache-Aside)
description: Learn the cache-aside pattern with the remember() method
---

The `remember()` method implements the cache-aside pattern in a single method. **This is the recommended way to use caching!**

## What is Cache-Aside?

Cache-aside (also called "lazy loading") is a caching pattern where:

1. Check if data is in cache
2. If found → return it (cache hit)
3. If not found → compute/fetch it (cache miss)
4. Store in cache for next time
5. Return the data

## The Old Way (Manual)

```typescript
// ❌ Manual cache-aside: Verbose and error-prone
async function getUser(userId: string): Promise<User | null> {
  const cacheKey = `user:${userId}`;

  // 1. Check cache
  let user = await cache.get<User>(cacheKey);
  if (user) return user;

  // 2. Cache miss - fetch from database
  user = await db.users.findById(userId);

  // 3. Store in cache
  if (user) {
    await cache.set(cacheKey, user, { ttl: 300 });
  }

  return user;
}
```

## The New Way (Remember)

```typescript
// ✅ With remember(): Concise and powerful
async function getUser(userId: string): Promise<User> {
  return cache.remember(
    `user:${userId}`,
    async () => {
      // This only runs on cache miss
      return await db.users.findById(userId);
    },
    { ttl: 300 } // Cache for 5 minutes
  );
}
```

## Why Use Remember?

### 1. Less Code

One line instead of 5-10 lines of boilerplate.

### 2. Automatic Deduplication

Multiple simultaneous calls for the same key → only one computation:

```typescript
let computeCount = 0;

// Make 10 simultaneous calls
await Promise.all([
  cache.remember('expensive', async () => {
    computeCount++;
    return await expensiveComputation();
  }),
  cache.remember('expensive', async () => {
    computeCount++;
    return await expensiveComputation();
  }),
  // ... 8 more identical calls
]);

console.log(computeCount); // 1 - only computed once!
```

### 3. Type-Safe

TypeScript infers the return type from your fallback function:

```typescript
// TypeScript knows user is User (not User | null)
const user = await cache.remember(
  'user:1',
  async () => await fetchUser(1)
);
```

### 4. Error Handling Built-In

Errors aren't cached - failed computations can be retried:

```typescript
try {
  const data = await cache.remember(
    'api:data',
    async () => {
      const res = await fetch('https://api.example.com/data');
      if (!res.ok) throw new Error('API error');
      return res.json();
    }
  );
} catch (error) {
  // Error thrown, not cached
  // Next call will retry the computation
}
```

## Real-World Examples

### Database Queries

```typescript
async function getProduct(id: string) {
  return cache.remember(
    `product:${id}`,
    async () => {
      const product = await db.products.findById(id);
      if (!product) throw new Error('Product not found');
      return product;
    },
    { ttl: 600 } // 10 minutes
  );
}
```

### API Calls

```typescript
async function getWeather(city: string) {
  return cache.remember(
    `weather:${city}`,
    async () => {
      const res = await fetch(`https://api.weather.com/${city}`);
      return res.json();
    },
    { ttl: 1800 } // 30 minutes
  );
}
```

### Expensive Computations

```typescript
async function getDailyReport(date: string) {
  return cache.remember(
    `report:${date}`,
    async () => {
      // Complex aggregation query
      return await db.orders
        .where('date', date)
        .groupBy('category')
        .sum('total');
    },
    { ttl: 3600 } // 1 hour
  );
}
```

### With Collections

```typescript
const users = cache.collection<User>('user:');

const user = await users.remember(
  '123',
  async () => await db.users.findById(123),
  { ttl: 300 }
);
```

### With Values

```typescript
const config = cache.value<AppConfig>('config:app');

const appConfig = await config.remember(
  async () => await db.config.get('app'),
  { ttl: 60 }
);
```

## Solving the Thundering Herd

The "thundering herd" problem occurs when:
1. Cache expires
2. 100 requests arrive simultaneously
3. All 100 hit the database (cache miss)
4. Database overloads

**Remember solves this automatically:**

```typescript
// API route handler
app.get('/api/trending', async (req, res) => {
  // Even if 100 requests hit simultaneously,
  // the query only runs once!
  const trending = await cache.remember(
    'trending:posts',
    async () => {
      // This expensive query only runs once
      return await db.posts
        .where('created_at', '>', Date.now() - 86400000)
        .orderBy('views', 'desc')
        .limit(10);
    },
    { ttl: 300 }
  );

  res.json(trending);
});
```

## Pattern: Stale-While-Revalidate

Cache data but refresh in background:

```typescript
async function getPopularPosts() {
  try {
    return await cache.remember(
      'popular:posts',
      async () => await db.posts.getPopular(),
      { ttl: 300 }
    );
  } catch (error) {
    // On error, try to return stale cached data
    const stale = await cache.get('popular:posts');
    if (stale) return stale;
    throw error; // No cached data, propagate error
  }
}
```

## Pattern: Multi-Level Cache

Cache at multiple levels with different TTLs:

```typescript
async function getUserProfile(userId: string) {
  // Try short TTL cache first (1 minute)
  const quick = await cache.get(`user:quick:${userId}`);
  if (quick) return quick;

  // Fall back to longer TTL (10 minutes)
  return cache.remember(
    `user:${userId}`,
    async () => {
      const user = await db.users.getProfile(userId);
      // Also store in quick cache
      await cache.set(`user:quick:${userId}`, user, { ttl: 60 });
      return user;
    },
    { ttl: 600 }
  );
}
```

## Pattern: Conditional Caching

Cache based on result:

```typescript
async function searchProducts(query: string) {
  return cache.remember(
    `search:${query}`,
    async () => {
      const results = await db.products.search(query);

      // Don't cache empty results or errors
      if (results.length === 0) {
        throw new Error('No results'); // Won't be cached
      }

      return results;
    },
    { ttl: 300 }
  );
}
```

## Advanced: Custom Cache Keys

Generate complex cache keys:

```typescript
function cacheKey(userId: string, filters: object): string {
  return `products:${userId}:${JSON.stringify(filters)}`;
}

async function getFilteredProducts(userId: string, filters: object) {
  return cache.remember(
    cacheKey(userId, filters),
    async () => await db.products.filter(userId, filters),
    { ttl: 600 }
  );
}
```

## Best Practices

### ✅ DO

- Use `remember()` for all cache-aside patterns
- Set appropriate TTLs based on data freshness needs
- Throw errors for invalid data (they won't be cached)
- Use descriptive cache keys
- Leverage automatic deduplication for hot paths

### ❌ DON'T

- Don't use `remember()` for data that changes frequently
- Don't set very short TTLs (use `get()`/`set()` instead)
- Don't cache sensitive data without encryption
- Don't use random cache keys (defeats caching)

## Performance Impact

**Without remember (thundering herd):**
- 100 requests → 100 database queries
- Database overload
- Slow response times

**With remember:**
- 100 requests → 1 database query
- Remaining 99 wait for first
- Fast response times
- Database protected

## Next Steps

- [Batching Guide](/guides/batching/) - Automatic request batching
- [Collections Guide](/guides/collections/) - Use with collections
- [Values Guide](/guides/values/) - Use with values
- [API Reference](/api/) - Full remember() documentation
