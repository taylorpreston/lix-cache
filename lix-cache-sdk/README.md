# Lix Cache SDK

A TypeScript-first caching SDK with exceptional developer experience.

## Why Lix Cache?

**The problem:** Redis and Memcached work great, but the TypeScript experience is terrible:
- ❌ No type safety - everything is a string
- ❌ Manual JSON parsing everywhere
- ❌ Cryptic error messages
- ❌ No autocomplete or IDE help

**Lix Cache fixes this:**
- ✅ **Full type inference** - TypeScript knows your data shapes
- ✅ **Zero configuration** - works out of the box
- ✅ **Automatic batching** - operations in same tick → 1 request
- ✅ **Request deduplication** - multiple requests for same key → 1 operation
- ✅ **Cache-aside pattern** - `remember()` method handles get/compute/set automatically
- ✅ **Helpful errors** - messages that teach you how to fix issues
- ✅ **Modern API** - Promise-based, clean, intuitive

## Installation

```bash
pnpm add lix-cache-sdk
```

Or with npm:
```bash
npm install lix-cache-sdk
```

## Quick Start

### 1. Start the server

The easiest way to get started - no installation required:

```bash
npx lix-cache-server
```

This starts the cache server on `http://localhost:4000`. Keep this terminal open.

> **Requirements:** Docker must be installed. [Get Docker](https://docs.docker.com/get-docker/)

### 2. Install the SDK

```bash
pnpm add lix-cache-sdk
# or: npm install lix-cache-sdk
```

### 3. Start caching!

```typescript
import { LixCache } from 'lix-cache-sdk';

const lix = new LixCache();

// Set a value - types are remembered
await lix.set('user:1', { name: 'Alice', age: 30 });

// Get it back - fully typed automatically!
const user = await lix.get<User>('user:1');
// TypeScript knows: { name: string; age: number } | null
```

That's it! You're caching with full type safety. 🎉

## API Reference

### Basic Operations

#### `set<T>(key: string, value: T, options?: SetOptions): Promise<void>`

Store a value in the cache.

```typescript
// Store without expiration
await lix.set('user:1', { name: 'Alice' });

// Store with 60 second TTL
await lix.set('session:abc', { token: '...' }, { ttl: 60 });
```

#### `get<T>(key: string): Promise<T | null>`

Retrieve a value from the cache.

```typescript
const user = await lix.get<User>('user:1');
if (user) {
  console.log(user.name); // TypeScript knows the shape!
}
```

#### `delete(key: string): Promise<void>`

Remove a value from the cache.

```typescript
await lix.delete('user:1');
```

#### `remember<T>(key: string, fallback: () => Promise<T>, options?: RememberOptions): Promise<T>`

Cache-aside pattern in a single method. Check cache first, compute if missing, store and return the result.

**This is the recommended way to use caching!** It handles all the complexity of cache-aside automatically:
- ✅ Checks cache first
- ✅ Computes value if missing
- ✅ Stores result automatically
- ✅ Deduplicates concurrent calls (same key → one computation)
- ✅ Full type inference from fallback

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

// Concurrent calls are deduplicated automatically!
// Multiple remember() calls for same key → fallback only runs once
const [user1, user2, user3] = await Promise.all([
  lix.remember('user:1', fetchUser),
  lix.remember('user:1', fetchUser),  // Waits for first call
  lix.remember('user:1', fetchUser)   // Waits for first call
]);
// fetchUser() only called once, all three get the result!
```

**Why use `remember()` instead of manual cache-aside?**
- Less code - one line instead of 5-10
- Automatic deduplication prevents thundering herd
- Type-safe - TypeScript infers the return type
- Error handling built-in - errors aren't cached
- Cleaner, more readable code

#### `rememberAll<T>(prefix: string, fallback: () => Promise<T[]>, options: RememberAllOptions<T>): Promise<RememberAllResult<T>>`

Fetch a list from an API and cache each item individually. Perfect for caching collections of items.

**Features:**
- ✅ Fetches list and caches each item separately
- ✅ Returns both array (for iteration) and getBy() function (for O(1) lookups)
- ✅ Optional list marker with `listTTL` to avoid redundant API calls
- ✅ Automatic deduplication of concurrent calls
- ✅ Full type inference

```typescript
// Simple mode: Always fetch and cache (no listTTL)
const result = await lix.rememberAll(
  'user:',
  async () => {
    const res = await fetch('/api/users');
    return res.json();
  },
  {
    getKey: (user) => user.id,  // Extract ID from each item
    ttl: 3600  // Cache each user for 1 hour
  }
);

// Iterate through all users
result.items.forEach(user => console.log(user.name));

// Fast O(1) lookup by ID
const alice = result.getBy('123');

// Optimized mode: Use list marker to avoid unnecessary API calls
const result = await lix.rememberAll(
  'user:',
  fetchUsers,
  {
    getKey: (user) => user.id,
    ttl: 3600,     // Cache each user for 1 hour
    listTTL: 60    // Only fetch list every 60 seconds
  }
);
// Second call within 60s uses cached items (no API call!)
```

**When to use simple mode (no listTTL):**
- Lists that change frequently
- Small lists where API calls are cheap
- You want the freshest data every time

**When to use optimized mode (with listTTL):**
- Large lists (100s or 1000s of items)
- Expensive API calls
- Lists that don't change often
- High-traffic scenarios (prevents API spam)

### Atomic Operations

#### `incr(key: string, amount?: number): Promise<number>`

Atomically increment a numeric value. Prevents race conditions when multiple clients modify the same counter.

```typescript
// Increment page views
const views = await lix.incr('page:home:views');

// Increment by custom amount
const score = await lix.incr('user:score', 10);
```

#### `decr(key: string, amount?: number): Promise<number>`

Atomically decrement a numeric value.

```typescript
// Decrement inventory
const remaining = await lix.decr('product:123:inventory');

// Decrement by custom amount
const credits = await lix.decr('user:credits', 5);
```

**Common use cases:**
- Page view counters
- Rate limiting
- Inventory management
- User credits/points
- Active sessions count

### Search & Discovery

#### `scan<T>(prefix?: string, options?: ScanOptions): Promise<ScanResult<T>>`

Search for keys by prefix and retrieve their values.

```typescript
// Get all users with their data (one network call!)
const result = await lix.scan<User>('user:');
result.items?.forEach(item => {
  console.log(item.key, item.value);
});

// Get only the keys
const result = await lix.scan('user:', { keysOnly: true });
console.log(result.keys);
```

### Management

#### `clear(): Promise<ClearResult>`

Clear the entire cache.

```typescript
const result = await lix.clear();
console.log(`Cleared ${result.cleared} items`);
```

#### `stats(): Promise<CacheStats>`

Get cache statistics.

```typescript
const stats = await lix.stats();
console.log(`${stats.size} / ${stats.limit} items`);
```

#### `health(): Promise<HealthResponse>`

Check server health.

```typescript
const health = await lix.health();
console.log(health.status); // 'healthy'
```

### Advanced

#### `batch(operations: BatchOperation[]): Promise<BatchResult[]>`

Execute multiple operations in a single request.

```typescript
const results = await lix.batch([
  { op: 'get', key: 'user:1' },
  { op: 'set', key: 'user:2', value: { name: 'Bob' }, ttl: 300 },
]);
```

## Type-Safe Collections

Collections provide automatic key prefixing and optional runtime validation for domain-specific data.

### TypeScript-Only Collections (Recommended for Most Cases)

Zero dependencies, full type safety at compile-time:

```typescript
// Define your types
interface User {
  name: string;
  age: number;
  email: string;
}

// Create a collection - MUST provide type parameter!
const users = lix.collection<User>('user:');

// Set - auto-prefixes to 'user:1'
await users.set('1', {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
});

// Get - fully typed!
const user = await users.get('1'); // Type: User | null
if (user) {
  console.log(user.name); // TypeScript knows this exists
}

// Scan all users
const result = await users.scan();
result.items.forEach(item => {
  console.log(item.key, item.value.name); // Fully typed
});

// Works with remember() too!
const user = await users.remember('123', async () => {
  return await fetchUserFromDB(123);
});
```

**When to use TypeScript-only:**
- ✅ Simple types you control
- ✅ Internal app data
- ✅ Short-lived caches
- ✅ When you want zero dependencies
- ✅ Maximum performance (no validation overhead)

### Collections with Zod Validation (Opt-In Safety)

Add runtime validation for external data or complex validation rules:

```typescript
import { z } from 'zod';

// Define schema (generates TypeScript types automatically!)
const UserSchema = z.object({
  name: z.string(),
  age: z.number().min(0).max(150),
  email: z.string().email()
});

// Create validated collection
const users = lix.collection('user:', UserSchema);

// ✅ Valid data
await users.set('1', {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
});

// ❌ Invalid data throws error
await users.set('2', {
  name: 'Bob',
  age: 200,  // Exceeds max
  email: 'not-an-email'  // Invalid format
});
// Throws ZodError with helpful message!

// Validation also happens on get (catches corrupt cached data)
const user = await users.get('1');
```

**When to use Zod validation:**
- ✅ External API responses
- ✅ Database query results
- ✅ Long-lived caches (schema might change)
- ✅ Complex validation rules
- ✅ Production data integrity

### Collection Methods

All collection methods work with both TypeScript-only and Zod collections:

```typescript
const users = lix.collection<User>('user:');

// Basic operations
await users.set('1', userData);
await users.get('1');
await users.delete('1');
await users.exists('1');

// Scan (get all items with prefix)
const result = await users.scan();

// Remember (cache-aside pattern)
const user = await users.remember('1', fetchUser);

// Remember all (fetch list and cache each item)
const result = await users.rememberAll(
  async () => {
    const res = await fetch('/api/users');
    return res.json();
  },
  {
    getKey: (user) => user.id,
    ttl: 3600
  }
);
result.items.forEach(user => console.log(user.name));
const alice = result.getBy('123');

// Batch operations
await users.batchSet([
  { id: '1', value: user1 },
  { id: '2', value: user2 },
]);
await users.batchGet(['1', '2', '3']);
await users.batchDelete(['1', '2']);

// Clear all items in collection
await users.clear();
```

### Benefits of Collections

- ✅ **Automatic prefixing** - Never repeat `user:` everywhere
- ✅ **Type safety** - Full TypeScript inference
- ✅ **Optional validation** - Zod when you need it, pure TypeScript when you don't
- ✅ **Cleaner code** - Domain-specific APIs instead of raw strings
- ✅ **Isolation** - Different collections can't interfere with each other

## Type-Safe Values

Values provide reusable typed references to single cache keys with optional validation.

Use **Values** for single items (app config, feature flags, etc.)
Use **Collections** for multiple items with a prefix (users, products, etc.)
Use **raw cache** for quick one-offs and JavaScript users

### TypeScript-Only Values (Recommended for Most Cases)

Zero dependencies, full type safety at compile-time:

```typescript
// Define your types
interface AppConfig {
  theme: string;
  apiUrl: string;
  notifications: boolean;
}

// Create a reusable value reference - MUST provide type parameter!
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

// Works with remember() too!
const config = await appConfig.remember(async () => {
  return await fetchConfigFromDB();
});

// Feature flags
const darkMode = cache.value<boolean>('feature:dark-mode');
await darkMode.set(true);
const enabled = await darkMode.get(); // Type: boolean | null

// Counters with incr/decr
const views = cache.value<number>('page:views');
await views.incr(); // Atomic increment
await views.decr(5); // Atomic decrement
const count = await views.get(); // Type: number | null
```

**When to use TypeScript-only:**
- ✅ App configuration
- ✅ Feature flags
- ✅ User preferences
- ✅ Single database records
- ✅ Counters and metrics

### Values with Zod Validation (Opt-In Safety)

Add runtime validation for external data or complex validation rules:

```typescript
import { z } from 'zod';

// Define schema with validation rules
const AppConfigSchema = z.object({
  theme: z.enum(['light', 'dark']),
  apiUrl: z.string().url(),
  notifications: z.boolean()
});

// Create validated value
const appConfig = cache.value('config:app', AppConfigSchema);

// ✅ Valid data
await appConfig.set({
  theme: 'dark',
  apiUrl: 'https://api.example.com',
  notifications: true
});

// ❌ Invalid data throws error
await appConfig.set({
  theme: 'blue',  // Not 'light' or 'dark'
  apiUrl: 'not-a-url',  // Invalid URL
  notifications: true
});
// Throws ZodError with helpful message!

// Validation also happens on get (catches corrupt cached data)
const config = await appConfig.get();
```

**When to use Zod validation:**
- ✅ External API responses
- ✅ Database query results
- ✅ User-provided configuration
- ✅ Complex validation rules
- ✅ Production data integrity

### Value Methods

All value methods work with both TypeScript-only and Zod values:

```typescript
const config = cache.value<AppConfig>('config:app');

// Basic operations
await config.set(data, { ttl: 60 });
await config.get();
await config.delete();
await config.exists();

// Remember (cache-aside pattern)
const data = await config.remember(fetchConfig, { ttl: 300 });

// For numbers - atomic operations
const views = cache.value<number>('views');
await views.incr(1);    // Increment
await views.decr(1);    // Decrement
```

### When to Use Each Approach

**Raw Cache** - Quick one-offs, JavaScript users
```typescript
await cache.set('temp', data);
await cache.incr('views');
```

**Values** - Reusable typed references
```typescript
const config = cache.value<AppConfig>('config:app');
await config.set(data);
```

**Collections** - Multiple items with prefix
```typescript
const users = cache.collection<User>('user:');
await users.set('1', userData);
```

## Performance Features

### Automatic Batching

**All operations in the same event loop tick are automatically batched into a single HTTP request.** No configuration needed - it just works!

This is perfect for React applications where multiple components might request data during the same render cycle:

```typescript
// These 20 operations happen in the same tick
const operations = await Promise.all([
  // Set 10 items
  lix.set('user:1', { name: 'Alice' }),
  lix.set('user:2', { name: 'Bob' }),
  lix.set('user:3', { name: 'Charlie' }),
  // ... 7 more sets

  // Get those items back
  lix.get('user:1'),
  lix.get('user:2'),
  lix.get('user:3'),
  // ... 7 more gets
]);

// ✨ Only 1 HTTP request was made!
// All operations were automatically batched
```

**How it works:**
- Operations called in the same tick are queued
- A microtask is scheduled to flush the batch
- All queued operations are sent in a single batch request
- Promises resolve with individual results

**Benefits:**
- Reduces network overhead dramatically
- Eliminates waterfall requests
- Perfect for React component trees
- Works transparently with existing code

### Request Deduplication

**Multiple simultaneous requests for the same key are automatically deduplicated.**

```typescript
// Make 10 simultaneous requests for the same key
const promises = await Promise.all([
  lix.get('user:1'),
  lix.get('user:1'),
  lix.get('user:1'),
  lix.get('user:1'),
  lix.get('user:1'),
  lix.get('user:1'),
  lix.get('user:1'),
  lix.get('user:1'),
  lix.get('user:1'),
  lix.get('user:1'),
]);

// ✨ Only 1 get operation in the batch!
// All 10 promises share the same result
```

**How it works:**
- When batching operations, duplicate keys are detected
- Multiple callers share the same promise
- Only one operation is sent to the server
- All callers receive the same result

**Benefits:**
- Prevents redundant network calls
- Reduces server load
- Especially useful in React with multiple components requesting the same data

### Computation Deduplication (Remember)

**The `remember()` method automatically deduplicates concurrent computations for the same key.**

```typescript
let computeCount = 0;

// Make 10 simultaneous remember() calls
await Promise.all([
  lix.remember('report:daily', async () => {
    computeCount++;
    return await generateExpensiveReport();
  }),
  lix.remember('report:daily', async () => {
    computeCount++;
    return await generateExpensiveReport();
  }),
  // ... 8 more identical calls
]);

console.log(computeCount); // 1 - only computed once!
```

**How it works:**
- First `remember()` call starts the computation
- Subsequent calls for the same key wait for the first computation
- When complete, all callers receive the same result
- Automatic cleanup after computation finishes

**Benefits:**
- Prevents expensive duplicate computations
- Solves "thundering herd" problem
- Zero memory overhead (only tracks active computations)
- Works with both `cache.remember()` and `collection.remember()`

**Real-world example:**
```typescript
// API route handler
app.get('/api/trending', async (req, res) => {
  // Even if 100 requests hit this endpoint simultaneously,
  // the expensive query only runs once!
  const trending = await cache.remember(
    'trending:posts',
    async () => {
      // This expensive DB query only runs once
      return await db.posts
        .where('created_at', '>', Date.now() - 86400000)
        .orderBy('views', 'desc')
        .limit(10);
    },
    { ttl: 300 } // Cache for 5 minutes
  );

  res.json(trending);
});
```

## Configuration

All options are optional with sensible defaults:

```typescript
const lix = new LixCache({
  // Server URL (default: http://localhost:4000)
  url: 'http://localhost:4000',

  // API key for authentication (default: undefined)
  apiKey: process.env.LIX_API_KEY,

  // Request timeout in ms (default: 5000)
  timeout: 5000,

  // Max retry attempts (default: 3)
  maxRetries: 3,

  // Initial retry delay in ms (default: 100)
  retryDelay: 100,
});
```

**Note:** Automatic batching is always enabled and cannot be disabled. It's a core feature that provides significant performance benefits with zero configuration.

### Authentication

Lix Cache supports API key authentication for production deployments.

**Localhost (Development):**
```typescript
// No API key needed for localhost
const lix = new LixCache({
  url: 'http://localhost:4000'
});
```

**Production (with Authentication):**
```typescript
// API key required when server has LIX_AUTH_ENABLED=true
const lix = new LixCache({
  url: 'https://cache.example.com',
  apiKey: process.env.LIX_API_KEY  // Store securely in environment variable
});
```

**Security Warning:**

The SDK will warn you in the console if you connect to a remote server without an API key:

```
⚠️  Lix Cache: Connecting to remote server without API key.
If authentication is enabled on the server, requests will fail.
Pass apiKey in config: new LixCache({ apiKey: "..." })
```

This warning helps prevent accidentally deploying to production without authentication. It only appears for remote servers (not localhost).

**Error Handling:**
```typescript
import { LixAuthError } from 'lix-cache-sdk';

try {
  await cache.get('user:1');
} catch (error) {
  if (error instanceof LixAuthError) {
    console.error('Authentication failed - check your API key');
  }
}
```

### Environment Variables

You can also configure via environment variables:

```bash
LIX_CACHE_URL=http://localhost:4000
LIX_API_KEY=your-secret-key
```

## Common Patterns

### Pattern 1: Separate Data and Metrics

Keep your data and counters separate for clean organization:

```typescript
// User profile data
await lix.set('user:alice', {
  name: 'Alice',
  email: 'alice@example.com'
});

// User activity metrics
await lix.incr('user:alice:profile_views');
await lix.incr('user:alice:posts_created');
await lix.incr('user:alice:likes_received');

// Retrieve everything for a user
const userData = await lix.scan('user:alice');
```

### Pattern 2: Rate Limiting

```typescript
async function checkRateLimit(userId: string): Promise<boolean> {
  const hour = new Date().toISOString().slice(0, 13);
  const key = `rate:${userId}:${hour}`;

  const count = await lix.incr(key);

  // Set TTL on first request
  if (count === 1) {
    await lix.set(key, count, { ttl: 3600 });
  }

  return count <= 100; // 100 requests per hour limit
}
```

### Pattern 3: Cache-Aside (with `remember()`)

The `remember()` method is the easiest way to implement cache-aside:

```typescript
async function getUser(userId: string): Promise<User> {
  return lix.remember(
    `user:${userId}`,
    async () => {
      // This only runs on cache miss
      const user = await db.users.findById(userId);
      if (!user) throw new Error('User not found');
      return user;
    },
    { ttl: 300 } // Cache for 5 minutes
  );
}

// Usage is simple and clean
const user = await getUser('123'); // Fully typed!
```

**Compare with manual cache-aside:**

```typescript
// ❌ Old way: Manual cache-aside (verbose, error-prone)
async function getUser(userId: string): Promise<User | null> {
  const cacheKey = `user:${userId}`;

  let user = await lix.get<User>(cacheKey);
  if (user) return user;

  user = await db.users.findById(userId);

  if (user) {
    await lix.set(cacheKey, user, { ttl: 300 });
  }

  return user;
}

// ✅ New way: remember() (concise, automatic deduplication)
async function getUser(userId: string): Promise<User> {
  return lix.remember(
    `user:${userId}`,
    () => db.users.findById(userId),
    { ttl: 300 }
  );
}
```

## Error Handling

Lix Cache provides helpful error messages that guide you to solutions:

```typescript
import { LixTypeError, LixNotFoundError } from 'lix-cache-sdk';

try {
  await lix.incr('user:1'); // user:1 contains an object
} catch (error) {
  if (error instanceof LixTypeError) {
    // Error includes helpful suggestions:
    // "Cannot increment key 'user:1' because it contains a non-numeric value.
    //  To fix: Use a different key for counters (e.g., 'user:1:count')"
  }
}
```

**Available error types:**
- `LixConnectionError` - Server connection issues
- `LixNotFoundError` - Key not found in cache
- `LixTypeError` - Type mismatch (e.g., incrementing non-numeric value)
- `LixServerError` - Server returned an error
- `LixTimeoutError` - Request timed out

## Examples

See the `examples/` directory for more:
- `basic.ts` - Getting started examples
- `advanced.ts` - Complex usage patterns

Run an example:

```bash
# Install dependencies first
pnpm install

# Run example with ts-node
pnpm exec ts-node examples/basic.ts
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Type check
pnpm type-check

# Lint
pnpm lint

# Format
pnpm format
```

## Requirements

- Node.js >= 18.0.0
- Lix Cache server running (see below)

## Running the Server

The SDK requires a Lix Cache server to be running.

### Option 1: NPX (Recommended)

Zero setup - just run:

```bash
npx lix-cache-server
```

Requires Docker. This is the easiest way for development.

### Option 2: Docker Compose

```bash
cd lix-cache/lix_cache_api
docker-compose up
```

### Option 3: Elixir (If you have it installed)

```bash
# Clone the repo
git clone https://github.com/your-org/lix-cache
cd lix-cache/lix_cache_api

# Install dependencies
mix deps.get

# Start server
iex -S mix
```

Server runs on `http://localhost:4000` by default.

See the [Deployment Guide](../docs/DEPLOYMENT.md) for production deployment options.

## License

MIT

## Contributing

Contributions welcome! Please read our contributing guidelines first.
