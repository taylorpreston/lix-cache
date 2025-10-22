---
editUrl: false
next: false
prev: false
title: "LixCache"
---

Defined in: lix-cache-sdk/src/client.ts:37

Lix Cache client for TypeScript

A TypeScript-first caching client with exceptional developer experience.

## Example

```typescript
const lix = new LixCache();

// Set a value
await lix.set('user:1', { name: 'Alice', age: 30 });

// Get it back - fully typed!
const user = await lix.get<User>('user:1');

// Increment a counter
await lix.incr('page:views');
```

## Constructors

### Constructor

> **new LixCache**(`config`): `LixCache`

Defined in: lix-cache-sdk/src/client.ts:52

#### Parameters

##### config

[`LixCacheConfig`](/api/interfaces/lixcacheconfig/) = `{}`

#### Returns

`LixCache`

## Methods

### batch()

> **batch**(`operations`): `Promise`\<[`BatchResult`](/api/type-aliases/batchresult/)[]\>

Defined in: lix-cache-sdk/src/client.ts:409

Execute multiple operations in a single request

#### Parameters

##### operations

[`BatchOperation`](/api/type-aliases/batchoperation/)[]

Array of operations to execute

#### Returns

`Promise`\<[`BatchResult`](/api/type-aliases/batchresult/)[]\>

Results of each operation

#### Example

```typescript
const results = await lix.batch([
  { op: 'get', key: 'user:1' },
  { op: 'set', key: 'user:2', value: { name: 'Bob' } },
]);
```

***

### clear()

> **clear**(): `Promise`\<[`ClearResult`](/api/interfaces/clearresult/)\>

Defined in: lix-cache-sdk/src/client.ts:376

Clear the entire cache

#### Returns

`Promise`\<[`ClearResult`](/api/interfaces/clearresult/)\>

Information about the clear operation

#### Example

```typescript
const result = await lix.clear();
console.log(`Cleared ${result.cleared} items`);
```

***

### collection()

#### Call Signature

> **collection**\<`T`\>(`prefix`): [`Collection`](/api/classes/collection/)\<`T`\>

Defined in: lix-cache-sdk/src/client.ts:476

Create a type-safe collection with automatic prefix and optional validation

##### Type Parameters

###### T

`T` = `never`

##### Parameters

###### prefix

`string`

The key prefix for this collection (e.g., 'user:')

##### Returns

[`Collection`](/api/classes/collection/)\<`T`\>

A typed Collection instance

##### Example

```typescript
// TypeScript-only (no runtime validation) - MUST provide type parameter!
interface User {
  name: string;
  age: number;
}
const users = lix.collection<User>('user:'); // ✅ Type required

await users.set('1', { name: 'Alice', age: 30 });
const user = await users.get('1'); // Typed as User | null

// With Zod validation (runtime safety) - type inferred from schema
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email()
});

const users = lix.collection('user:', UserSchema); // ✅ Type inferred

// Auto-prefixes to 'user:1' and validates at runtime
await users.set('1', { name: 'Alice', age: 30, email: 'alice@example.com' });

// Returns validated typed User | null
const user = await users.get('1');

// Scan returns validated typed array
const allUsers = await users.scan();
```

#### Call Signature

> **collection**\<`T`\>(`prefix`, `schema`): [`Collection`](/api/classes/collection/)\<`T`\>

Defined in: lix-cache-sdk/src/client.ts:477

Create a type-safe collection with automatic prefix and optional validation

##### Type Parameters

###### T

`T`

##### Parameters

###### prefix

`string`

The key prefix for this collection (e.g., 'user:')

###### schema

`ZodType`\<`T`\>

Optional Zod schema for runtime validation and type inference

##### Returns

[`Collection`](/api/classes/collection/)\<`T`\>

A typed Collection instance

##### Example

```typescript
// TypeScript-only (no runtime validation) - MUST provide type parameter!
interface User {
  name: string;
  age: number;
}
const users = lix.collection<User>('user:'); // ✅ Type required

await users.set('1', { name: 'Alice', age: 30 });
const user = await users.get('1'); // Typed as User | null

// With Zod validation (runtime safety) - type inferred from schema
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email()
});

const users = lix.collection('user:', UserSchema); // ✅ Type inferred

// Auto-prefixes to 'user:1' and validates at runtime
await users.set('1', { name: 'Alice', age: 30, email: 'alice@example.com' });

// Returns validated typed User | null
const user = await users.get('1');

// Scan returns validated typed array
const allUsers = await users.scan();
```

***

### decr()

> **decr**(`key`, `amount`): `Promise`\<`number`\>

Defined in: lix-cache-sdk/src/client.ts:325

Atomically decrement a numeric value

#### Parameters

##### key

`string`

The cache key (must contain a number)

##### amount

`number` = `1`

Amount to decrement by (default: 1)

#### Returns

`Promise`\<`number`\>

The new value after decrementing

#### Example

```typescript
// Decrement inventory
const remaining = await lix.decr('product:123:inventory');

// Decrement by 5
const credits = await lix.decr('user:credits', 5);
```

***

### delete()

> **delete**(`key`): `Promise`\<`void`\>

Defined in: lix-cache-sdk/src/client.ts:268

Delete a value from the cache

Automatically batched with other operations in the same tick.

#### Parameters

##### key

`string`

The cache key to delete

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await lix.delete('user:1');

// Multiple deletes in same tick → 1 batch request
await Promise.all([
  lix.delete('user:1'),
  lix.delete('user:2'),
  lix.delete('user:3')
]);
```

***

### exists()

> **exists**(`key`): `Promise`\<`boolean`\>

Defined in: lix-cache-sdk/src/client.ts:431

Check if a key exists in the cache

#### Parameters

##### key

`string`

The cache key to check

#### Returns

`Promise`\<`boolean`\>

true if the key exists, false otherwise

#### Example

```typescript
const exists = await lix.exists('user:1');
if (exists) {
  console.log('User is cached');
}
```

***

### get()

> **get**\<`T`\>(`key`): `Promise`\<`T` \| `null`\>

Defined in: lix-cache-sdk/src/client.ts:206

Get a value from the cache

Automatically batched with other operations in the same tick.
Multiple get() calls in the same event loop tick are combined
into a single HTTP request.

Also deduplicates requests for the same key within the batch.

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

The cache key

#### Returns

`Promise`\<`T` \| `null`\>

The cached value, or null if not found

#### Example

```typescript
const user = await lix.get<User>('user:1');
if (user) {
  console.log(user.name); // TypeScript knows the shape!
}

// Multiple gets in same tick → 1 batch request
const [user1, user2, user3] = await Promise.all([
  lix.get('user:1'),
  lix.get('user:2'),
  lix.get('user:3')
]); // Only 1 HTTP request with 3 gets!

// Duplicate keys are deduplicated
const [a, b, c] = await Promise.all([
  lix.get('user:1'),
  lix.get('user:1'),  // Uses same promise as first
  lix.get('user:1')   // Uses same promise as first
]); // Only 1 get for user:1 in the batch
```

***

### health()

> **health**(): `Promise`\<[`HealthResponse`](/api/interfaces/healthresponse/)\>

Defined in: lix-cache-sdk/src/client.ts:542

Check server health

#### Returns

`Promise`\<[`HealthResponse`](/api/interfaces/healthresponse/)\>

Health status

#### Example

```typescript
const health = await lix.health();
console.log(health.status); // 'healthy'
```

***

### incr()

> **incr**(`key`, `amount`): `Promise`\<`number`\>

Defined in: lix-cache-sdk/src/client.ts:301

Atomically increment a numeric value

#### Parameters

##### key

`string`

The cache key (must contain a number)

##### amount

`number` = `1`

Amount to increment by (default: 1)

#### Returns

`Promise`\<`number`\>

The new value after incrementing

#### Example

```typescript
// Increment page views
const views = await lix.incr('page:home:views');

// Increment by 5
const score = await lix.incr('user:score', 5);
```

***

### remember()

> **remember**\<`T`\>(`key`, `fallback`, `options?`): `Promise`\<`T`\>

Defined in: lix-cache-sdk/src/client.ts:592

Get a value from cache, or compute and store it if missing (cache-aside pattern)

This implements the "remember" pattern popularized by Laravel:
- Check cache first
- If found, return cached value
- If missing, execute fallback function
- Store the result in cache
- Return the computed value

Automatically deduplicates concurrent calls for the same key.
Multiple simultaneous remember() calls for the same key will only
execute the fallback once, with all callers receiving the same result.

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

The cache key

##### fallback

() => `Promise`\<`T`\>

Function to compute the value if not cached

##### options?

`RememberOptions`

Optional settings like TTL

#### Returns

`Promise`\<`T`\>

The cached or computed value (never null)

#### Example

```typescript
// Fetch user from API, cache for 5 minutes
const user = await lix.remember(
  'user:123',
  async () => {
    const res = await fetch('/api/users/123');
    return res.json();
  },
  { ttl: 300 }
);

// Expensive computation cached for 1 hour
const report = await lix.remember(
  'report:monthly',
  async () => generateMonthlyReport(),
  { ttl: 3600 }
);

// Concurrent calls are deduplicated
const [user1, user2, user3] = await Promise.all([
  lix.remember('user:1', fetchUser),
  lix.remember('user:1', fetchUser),  // Waits for first call
  lix.remember('user:1', fetchUser)   // Waits for first call
]); // fetchUser only called once!
```

***

### scan()

> **scan**\<`T`\>(`prefix`, `options?`): `Promise`\<[`ScanResult`](/api/interfaces/scanresult/)\<`T`\>\>

Defined in: lix-cache-sdk/src/client.ts:353

Scan for keys matching a prefix

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### prefix

`string` = `''`

Key prefix to search for (empty string returns all)

##### options?

[`ScanOptions`](/api/interfaces/scanoptions/)

Scan options

#### Returns

`Promise`\<[`ScanResult`](/api/interfaces/scanresult/)\<`T`\>\>

Scan results with items or keys

#### Example

```typescript
// Get all users with their data
const result = await lix.scan<User>('user:');
result.items?.forEach(item => {
  console.log(item.key, item.value);
});

// Get only the keys
const result = await lix.scan('user:', { keysOnly: true });
console.log(result.keys);
```

***

### set()

> **set**\<`T`\>(`key`, `value`, `options?`): `Promise`\<`void`\>

Defined in: lix-cache-sdk/src/client.ts:153

Set a value in the cache

Automatically batched with other operations in the same tick.
Multiple set() calls in the same event loop tick are combined
into a single HTTP request.

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

The cache key

##### value

`T`

The value to store (will be JSON serialized)

##### options?

[`SetOptions`](/api/interfaces/setoptions/)

Optional settings like TTL

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// Store without expiration
await lix.set('user:1', { name: 'Alice' });

// Store with 60 second TTL
await lix.set('session:abc', { token: '...' }, { ttl: 60 });

// Multiple sets in same tick → 1 batch request
cache.set('user:1', data1);
cache.set('user:2', data2);
cache.set('user:3', data3);
```

***

### stats()

> **stats**(): `Promise`\<[`CacheStats`](/api/interfaces/cachestats/)\>

Defined in: lix-cache-sdk/src/client.ts:391

Get cache statistics

#### Returns

`Promise`\<[`CacheStats`](/api/interfaces/cachestats/)\>

Cache stats including size and limit

#### Example

```typescript
const stats = await lix.stats();
console.log(`${stats.size} / ${stats.limit} items`);
```

***

### value()

#### Call Signature

> **value**\<`T`\>(`key`): `Value`\<`T`\>

Defined in: lix-cache-sdk/src/client.ts:525

Create a type-safe value wrapper for a single cache key with optional validation

Use Value for reusable references to single cached items (config, flags, etc.)
Use Collection for multiple items with a common prefix (users, products, etc.)

##### Type Parameters

###### T

`T` = `never`

##### Parameters

###### key

`string`

The cache key

##### Returns

`Value`\<`T`\>

A typed Value instance

##### Example

```typescript
// TypeScript-only (no runtime validation) - MUST provide type parameter!
interface AppConfig {
  theme: string;
  apiUrl: string;
}
const config = lix.value<AppConfig>('config:app'); // ✅ Type required

await config.set({ theme: 'dark', apiUrl: 'https://...' });
const data = await config.get(); // Typed as AppConfig | null

// With Zod validation (runtime safety) - type inferred from schema
import { z } from 'zod';

const ConfigSchema = z.object({
  theme: z.string(),
  apiUrl: z.string().url()
});

const config = lix.value('config:app', ConfigSchema); // ✅ Type inferred

// Validates at runtime
await config.set({ theme: 'dark', apiUrl: 'https://...' });

// Returns validated typed AppConfig | null
const data = await config.get();

// For numbers, you can use incr/decr
const views = lix.value<number>('page:views');
await views.incr(); // Atomic increment
```

#### Call Signature

> **value**\<`T`\>(`key`, `schema`): `Value`\<`T`\>

Defined in: lix-cache-sdk/src/client.ts:526

Create a type-safe value wrapper for a single cache key with optional validation

Use Value for reusable references to single cached items (config, flags, etc.)
Use Collection for multiple items with a common prefix (users, products, etc.)

##### Type Parameters

###### T

`T`

##### Parameters

###### key

`string`

The cache key

###### schema

`ZodType`\<`T`\>

Optional Zod schema for runtime validation and type inference

##### Returns

`Value`\<`T`\>

A typed Value instance

##### Example

```typescript
// TypeScript-only (no runtime validation) - MUST provide type parameter!
interface AppConfig {
  theme: string;
  apiUrl: string;
}
const config = lix.value<AppConfig>('config:app'); // ✅ Type required

await config.set({ theme: 'dark', apiUrl: 'https://...' });
const data = await config.get(); // Typed as AppConfig | null

// With Zod validation (runtime safety) - type inferred from schema
import { z } from 'zod';

const ConfigSchema = z.object({
  theme: z.string(),
  apiUrl: z.string().url()
});

const config = lix.value('config:app', ConfigSchema); // ✅ Type inferred

// Validates at runtime
await config.set({ theme: 'dark', apiUrl: 'https://...' });

// Returns validated typed AppConfig | null
const data = await config.get();

// For numbers, you can use incr/decr
const views = lix.value<number>('page:views');
await views.incr(); // Atomic increment
```
