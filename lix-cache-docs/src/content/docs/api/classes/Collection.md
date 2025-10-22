---
editUrl: false
next: false
prev: false
title: "Collection"
---

Defined in: lix-cache-sdk/src/collection.ts:38

A type-safe collection that automatically prefixes keys and optionally validates data.

## Example

```typescript
// TypeScript-only (no runtime validation)
interface User {
  name: string;
  age: number;
}
const users = cache.collection<User>('user:');

await users.set('1', { name: 'Alice', age: 30 });
const user = await users.get('1'); // Typed as User | null

// With Zod validation (runtime safety)
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email()
});

const users = cache.collection('user:', UserSchema);

// Auto-prefixes to 'user:1' and validates
await users.set('1', { name: 'Alice', age: 30, email: 'alice@example.com' });

// Returns validated typed User | null
const user = await users.get('1');
```

## Type Parameters

### T

`T`

## Constructors

### Constructor

> **new Collection**\<`T`\>(`client`, `prefix`, `schema?`): `Collection`\<`T`\>

Defined in: lix-cache-sdk/src/collection.ts:39

#### Parameters

##### client

[`LixCache`](/api/classes/lixcache/)

##### prefix

`string`

##### schema?

`ZodType`\<`T`, `ZodTypeDef`, `T`\>

#### Returns

`Collection`\<`T`\>

## Methods

### batchDelete()

> **batchDelete**(`ids`): `Promise`\<`void`\>

Defined in: lix-cache-sdk/src/collection.ts:226

Delete multiple values from the collection

#### Parameters

##### ids

`string`[]

Array of IDs to delete

#### Returns

`Promise`\<`void`\>

Promise that resolves when all items are deleted

#### Example

```typescript
await users.batchDelete(['1', '2', '3']);
```

***

### batchGet()

> **batchGet**(`ids`): `Promise`\<(`T` \| `null`)[]\>

Defined in: lix-cache-sdk/src/collection.ts:192

Get multiple values from the collection with validation
Returns an array of values in the same order as the IDs
Missing items return null

#### Parameters

##### ids

`string`[]

Array of IDs to retrieve

#### Returns

`Promise`\<(`T` \| `null`)[]\>

Array of values (or null for missing items)

#### Example

```typescript
const users = await users.batchGet(['1', '2', '3']);
// Returns: [User | null, User | null, User | null]
```

***

### batchSet()

> **batchSet**(`items`): `Promise`\<`void`\>

Defined in: lix-cache-sdk/src/collection.ts:158

Set multiple values in the collection with validation
All values are validated before any are set

#### Parameters

##### items

`object`[]

Array of items to set

#### Returns

`Promise`\<`void`\>

Promise that resolves when all items are set

#### Example

```typescript
await users.batchSet([
  { id: '1', value: { name: 'Alice', age: 30, email: 'alice@example.com' } },
  { id: '2', value: { name: 'Bob', age: 25, email: 'bob@example.com' }, ttl: 60 },
  { id: '3', value: { name: 'Charlie', age: 35, email: 'charlie@example.com' } }
]);
```

***

### clear()

> **clear**(): `Promise`\<`number`\>

Defined in: lix-cache-sdk/src/collection.ts:130

Clear all items in this collection
Warning: This scans for all items with the prefix and deletes them

#### Returns

`Promise`\<`number`\>

***

### delete()

> **delete**(`id`): `Promise`\<`void`\>

Defined in: lix-cache-sdk/src/collection.ts:91

Delete a value from the collection

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

***

### exists()

> **exists**(`id`): `Promise`\<`boolean`\>

Defined in: lix-cache-sdk/src/collection.ts:98

Check if a key exists in the collection

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### get()

> **get**(`id`): `Promise`\<`T` \| `null`\>

Defined in: lix-cache-sdk/src/collection.ts:79

Get a value from the collection with optional validation
If a schema was provided, validates on retrieval to catch invalid cached data.
Otherwise, trusts TypeScript types.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`T` \| `null`\>

***

### remember()

> **remember**(`id`, `fallback`, `options?`): `Promise`\<`T`\>

Defined in: lix-cache-sdk/src/collection.ts:283

Get a value from cache, or compute and store it if missing (cache-aside pattern)

This implements the "remember" pattern for type-safe collections:
- Check cache first
- If found, return validated cached value
- If missing, execute fallback function
- Validate and store the result
- Return the computed value

Automatically prefixes the key and validates data with the collection's schema.
Deduplication is handled by the underlying LixCache.remember() method.

#### Parameters

##### id

`string`

The item ID (will be prefixed automatically)

##### fallback

() => `Promise`\<`T`\>

Function to compute the value if not cached

##### options?

[`SetOptions`](/api/interfaces/setoptions/)

Optional settings like TTL

#### Returns

`Promise`\<`T`\>

The cached or computed value (validated and typed)

#### Example

```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email()
});

const users = cache.collection('user:', UserSchema);

// Fetch user from database, validate and cache for 5 minutes
const user = await users.remember(
  '123',
  async () => {
    const dbUser = await db.users.findById(123);
    return { name: dbUser.name, age: dbUser.age, email: dbUser.email };
  },
  { ttl: 300 }
);

// Validation happens automatically
const user = await users.remember('456', async () => ({
  name: 'Alice',
  age: 30,
  email: 'invalid-email'  // ❌ Throws Zod validation error!
}));

// Concurrent calls are deduplicated
const [user1, user2] = await Promise.all([
  users.remember('123', fetchUser),
  users.remember('123', fetchUser)  // Waits for first call
]); // fetchUser only called once, result validated once
```

***

### scan()

> **scan**(): `Promise`\<\{ `count`: `number`; `items`: `object`[]; \}\>

Defined in: lix-cache-sdk/src/collection.ts:106

Scan all items in the collection
Returns all items with this prefix, validated and typed

#### Returns

`Promise`\<\{ `count`: `number`; `items`: `object`[]; \}\>

***

### set()

> **set**(`id`, `value`, `options?`): `Promise`\<`void`\>

Defined in: lix-cache-sdk/src/collection.ts:68

Set a value in the collection with optional validation
If a schema was provided, validates before setting.
Otherwise, trusts TypeScript types.

#### Parameters

##### id

`string`

##### value

`T`

##### options?

[`SetOptions`](/api/interfaces/setoptions/)

#### Returns

`Promise`\<`void`\>
