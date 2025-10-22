---
title: Type-Safe Values
description: Learn how to use values for single-item typed references
---

Values provide reusable typed references to single cache keys with optional validation.

**Use Values for:** Single items (app config, feature flags, counters)
**Use Collections for:** Multiple items with a prefix (users, products)
**Use raw cache for:** Quick one-offs and JavaScript users

## TypeScript-Only Values

Zero dependencies, full type safety at compile-time:

```typescript
interface AppConfig {
  theme: string;
  apiUrl: string;
  notifications: boolean;
}

// Create a reusable value reference
const appConfig = cache.value<AppConfig>('config:app');

// Set value with full type checking
await appConfig.set({
  theme: 'dark',
  apiUrl: 'https://api.example.com',
  notifications: true
});

// Get value - fully typed!
const config = await appConfig.get(); // Type: AppConfig | null
if (config) {
  console.log(config.theme); // TypeScript knows this exists
}
```

## Values with Zod Validation

Add runtime validation for external data:

```typescript
import { z } from 'zod';

const AppConfigSchema = z.object({
  theme: z.enum(['light', 'dark']),
  apiUrl: z.string().url(),
  notifications: z.boolean()
});

const appConfig = cache.value('config:app', AppConfigSchema);

// ✅ Valid data
await appConfig.set({
  theme: 'dark',
  apiUrl: 'https://api.example.com',
  notifications: true
});

// ❌ Invalid data throws error
try {
  await appConfig.set({
    theme: 'blue',  // Not 'light' or 'dark'
    apiUrl: 'not-a-url',
    notifications: true
  });
} catch (error) {
  // ZodError with helpful message!
}
```

## Value Methods

```typescript
const config = cache.value<AppConfig>('config:app');

// Set with optional TTL
await config.set(data, { ttl: 60 });

// Get
const data = await config.get();

// Delete
await config.delete();

// Check existence
const exists = await config.exists();

// Remember (cache-aside pattern)
const data = await config.remember(
  async () => fetchConfig(),
  { ttl: 300 }
);
```

## Atomic Operations (Numbers Only)

For numeric values, you get atomic increment/decrement:

```typescript
const views = cache.value<number>('page:views');

// Increment
await views.incr();        // +1
await views.incr(5);       // +5

// Decrement
await views.decr();        // -1
await views.decr(10);      // -10

// Get current value
const count = await views.get(); // Type: number | null
```

## Real-World Examples

### Feature Flags

```typescript
const darkModeEnabled = cache.value<boolean>('feature:dark-mode');

await darkModeEnabled.set(true);

if (await darkModeEnabled.get()) {
  // Enable dark mode UI
}
```

### User Preferences

```typescript
interface UserPreferences {
  language: string;
  timezone: string;
  emailNotifications: boolean;
}

const userPrefs = cache.value<UserPreferences>('prefs:user:123');

await userPrefs.set({
  language: 'en',
  timezone: 'America/New_York',
  emailNotifications: true
}, { ttl: 3600 });
```

### Counters and Metrics

```typescript
const requestCount = cache.value<number>('metrics:requests:today');

// Increment on each request
await requestCount.incr();

// Get current count
const total = await requestCount.get();
console.log(`${total} requests today`);
```

### API Rate Limiting

```typescript
const userRequests = cache.value<number>(`rate:${userId}:${hour}`);

const count = await userRequests.get() ?? 0;

if (count >= 100) {
  throw new Error('Rate limit exceeded');
}

await userRequests.incr();
if (count === 0) {
  await userRequests.set(1, { ttl: 3600 });
}
```

### Cached Computation Results

```typescript
const monthlySales = cache.value<number>('report:sales:2024-01');

const sales = await monthlySales.remember(
  async () => {
    // Expensive database query
    return await db.orders
      .where('created_at', '>=', '2024-01-01')
      .where('created_at', '<', '2024-02-01')
      .sum('total');
  },
  { ttl: 3600 } // Cache for 1 hour
);
```

## When to Use Each Approach

### TypeScript-Only

✅ App configuration
✅ Feature flags
✅ User preferences
✅ Counters and metrics
✅ Single database records

```typescript
const config = cache.value<AppConfig>('config:app');
const flag = cache.value<boolean>('feature:new-ui');
const count = cache.value<number>('counter:views');
```

### With Zod Validation

✅ External API responses
✅ User-provided configuration
✅ Complex validation rules
✅ Production data integrity

```typescript
const apiData = cache.value('api:response', ApiSchema);
const userConfig = cache.value('config:user', UserConfigSchema);
```

## Comparison: Raw Cache vs Values vs Collections

### Raw Cache - Quick one-offs

```typescript
await cache.set('temp', data);
await cache.incr('views');
```

### Values - Reusable typed references

```typescript
const config = cache.value<AppConfig>('config:app');
await config.set(data);
const value = await config.get();
```

### Collections - Multiple items with prefix

```typescript
const users = cache.collection<User>('user:');
await users.set('1', userData);
const user = await users.get('1');
```

## Benefits

✅ **Type safety** - Full TypeScript inference
✅ **Reusability** - Define once, use everywhere
✅ **Optional validation** - Zod when you need it
✅ **Cleaner code** - No string keys scattered around
✅ **Atomic operations** - Safe increment/decrement

## Next Steps

- [Collections Guide](/guides/collections/) - Multiple items with prefix
- [Remember Pattern](/guides/remember/) - Cache-aside made easy
- [API Reference](/api/classes/value/) - Full Value API
