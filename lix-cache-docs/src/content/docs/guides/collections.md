---
title: Type-Safe Collections
description: Learn how to use collections for domain-specific caching
---

Collections provide automatic key prefixing and optional runtime validation for domain-specific data.

## TypeScript-Only Collections

Zero dependencies, full type safety at compile-time:

```typescript
interface User {
  name: string;
  age: number;
  email: string;
}

// Create a collection - MUST provide type parameter!
const users = cache.collection<User>('user:');

// Set - auto-prefixes to 'user:1'
await users.set('1', {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
});

// Get - fully typed!
const user = await users.get('1'); // Type: User | null
```

## Collections with Zod Validation

Add runtime validation for external data or complex rules:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number().min(0).max(150),
  email: z.string().email()
});

const users = cache.collection('user:', UserSchema);

// ✅ Valid data
await users.set('1', {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
});

// ❌ Invalid data throws error
try {
  await users.set('2', {
    name: 'Bob',
    age: 200,  // Exceeds max
    email: 'invalid'  // Not an email
  });
} catch (error) {
  // ZodError with helpful message!
}
```

## Collection Methods

### Basic Operations

```typescript
const users = cache.collection<User>('user:');

// Set with optional TTL
await users.set('1', userData, { ttl: 300 });

// Get
const user = await users.get('1');

// Delete
await users.delete('1');

// Check existence
const exists = await users.exists('1');
```

### Batch Operations

```typescript
// Batch set
await users.batchSet([
  { id: '1', value: user1, ttl: 300 },
  { id: '2', value: user2 },
  { id: '3', value: user3, ttl: 600 },
]);

// Batch get
const results = await users.batchGet(['1', '2', '3']);
// Returns: Array<User | null>

// Batch delete
await users.batchDelete(['1', '2', '3']);
```

### Scan All Items

```typescript
// Get all users
const result = await users.scan();

result.items.forEach(item => {
  console.log(item.key);    // 'user:1', 'user:2', etc.
  console.log(item.value);  // Fully typed User object
});

console.log(result.count);  // Total items found
```

### Remember Pattern

```typescript
const user = await users.remember(
  '123',
  async () => {
    // Fetch from database
    return await db.users.findById(123);
  },
  { ttl: 300 }
);
```

### Clear Collection

```typescript
// Delete all items with 'user:' prefix
await users.clear();
```

## When to Use Each Approach

### TypeScript-Only (Recommended for Most Cases)

✅ Simple types you control
✅ Internal app data
✅ Short-lived caches
✅ Zero dependencies
✅ Maximum performance

```typescript
const sessions = cache.collection<Session>('session:');
const preferences = cache.collection<Preferences>('pref:');
```

### With Zod Validation

✅ External API responses
✅ Database query results
✅ Long-lived caches
✅ Complex validation rules
✅ Production data integrity

```typescript
const apiResponses = cache.collection('api:', ApiResponseSchema);
const dbRecords = cache.collection('db:', RecordSchema);
```

## Real-World Examples

### User Sessions

```typescript
interface Session {
  userId: string;
  token: string;
  expiresAt: Date;
}

const sessions = cache.collection<Session>('session:');

// Store session
await sessions.set(sessionId, {
  userId: user.id,
  token: generateToken(),
  expiresAt: new Date(Date.now() + 3600000)
}, { ttl: 3600 });

// Get session
const session = await sessions.get(sessionId);
```

### Product Catalog

```typescript
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().positive(),
  inStock: z.boolean()
});

const products = cache.collection('product:', ProductSchema);

// Cache product data from database
const product = await products.remember(
  productId,
  () => db.products.findById(productId),
  { ttl: 600 }
);
```

### Rate Limiting

```typescript
interface RateLimit {
  count: number;
  resetAt: number;
}

const rateLimits = cache.collection<RateLimit>('rate:');

// Track requests per user per hour
const hour = new Date().toISOString().slice(0, 13);
const key = `${userId}:${hour}`;

const limit = await rateLimits.get(key) ?? { count: 0, resetAt: Date.now() + 3600000 };
limit.count++;

await rateLimits.set(key, limit, { ttl: 3600 });

if (limit.count > 100) {
  throw new Error('Rate limit exceeded');
}
```

## Benefits

✅ **Automatic prefixing** - No need to repeat `user:` everywhere
✅ **Type safety** - Full TypeScript inference
✅ **Optional validation** - Zod when you need it
✅ **Cleaner code** - Domain-specific APIs
✅ **Isolation** - Collections don't interfere with each other

## Next Steps

- [Values Guide](/guides/values/) - Single-item typed references
- [Remember Pattern](/guides/remember/) - Cache-aside made easy
- [API Reference](/api/classes/collection/) - Full Collection API
