---
title: Quick Start
description: Get up and running with Lix Cache in 60 seconds
---

## 3 Steps to Caching

### 1. Install

```bash
pnpm add lix-cache-sdk
```

### 2. Start Server

```bash
npx lix-cache-server
```

Keep this terminal open. The server runs on `http://localhost:4000`.

### 3. Start Caching!

```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();

// Set a value
await cache.set('user:1', { name: 'Alice', age: 30 });

// Get it back - fully typed!
const user = await cache.get<User>('user:1');
console.log(user); // { name: 'Alice', age: 30 }
```

That's it! You're caching with full type safety. 🎉

## What Just Happened?

1. **TypeScript remembered your types** - No manual type annotations needed
2. **Data was JSON serialized** - Automatically handled for you
3. **Cache is in-memory** - Lightning fast access

## Next Steps

Try these features:

### Type-Safe Collections

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email()
});

const users = cache.collection('user:', UserSchema);

await users.set('1', {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
});

const user = await users.get('1'); // Validated & typed!
```

### Cache-Aside Pattern

```typescript
const user = await cache.remember(
  'user:123',
  async () => {
    // This only runs on cache miss
    return await fetchUserFromDatabase(123);
  },
  { ttl: 300 } // Cache for 5 minutes
);
```

### Automatic Batching

```typescript
// All in same tick → automatically batched into 1 request!
await Promise.all([
  cache.set('user:1', alice),
  cache.set('user:2', bob),
  cache.get('user:1'),
  cache.get('user:2'),
]);
```

## Learn More

- [Collections Guide](/guides/collections/) - Type-safe domain collections
- [Remember Pattern](/guides/remember/) - Cache-aside made easy
- [Configuration](/getting-started/configuration/) - Customize your setup
- [API Reference](/api/) - Full API documentation
