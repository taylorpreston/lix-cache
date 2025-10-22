# Lix Cache SDK - Design Decisions & Context

This document captures the design decisions, rationale, and context for the Lix Cache SDK. It's meant to help future developers (and AI assistants) understand why certain choices were made.

## Table of Contents

- [Architecture Philosophy](#architecture-philosophy)
- [Performance Features](#performance-features)
- [What We Decided NOT To Build](#what-we-decided-not-to-build)
- [Key Design Patterns](#key-design-patterns)
- [Testing Strategy](#testing-strategy)
- [Future Considerations](#future-considerations)

## Architecture Philosophy

### TypeScript-First

Lix Cache is built with TypeScript as the primary language, not as an afterthought. This means:

- Full type inference throughout the API
- Generic types for flexible yet type-safe operations
- Runtime validation with compile-time types via Zod integration
- Developer experience is the #1 priority

### Zero Configuration

The SDK works out of the box with sensible defaults:

- Automatic batching always enabled (not configurable)
- Request deduplication always enabled
- Reasonable timeouts and retry behavior
- Environment variable support for easy deployment

**Rationale:** Configuration is a source of complexity and bugs. We only expose configuration when there's a clear need for it.

## Performance Features

### Automatic Batching

**Decision:** All `get()` and `set()` operations in the same event loop tick are automatically batched into a single HTTP request.

**Implementation:**
- Uses a queue to collect operations
- Schedules batch flush with `queueMicrotask()` (next tick timing)
- Sends all queued operations in a single `/cache/batch` request
- Promises resolve with individual results

**Why next-tick timing:**
- Fixed time windows (e.g., 30ms) add unnecessary latency for small batches
- Debounced windows complicate reasoning about when operations execute
- Next-tick timing is predictable, fast, and perfect for React render cycles
- Works transparently with existing code

**Benefits:**
- Reduces network overhead dramatically (20 operations → 1 request)
- Eliminates waterfall requests
- Perfect for React component trees requesting data during render
- Zero configuration required

**Example:**
```typescript
// All in same tick → batched automatically
await Promise.all([
  lix.set('user:1', userData1),
  lix.set('user:2', userData2),
  lix.get('user:1'),
  lix.get('user:2'),
]);
// Only 1 HTTP request!
```

### Request Deduplication

**Decision:** Multiple simultaneous requests for the same key are automatically deduplicated within a batch.

**Implementation:**
- When a `get()` operation is queued, check if key already exists in queue
- If exists, share the promise resolution with existing request
- Only one operation per unique key is sent to server

**Benefits:**
- Prevents redundant operations
- Reduces server load
- Especially useful when multiple React components request the same data

**Example:**
```typescript
// 10 simultaneous requests for same key
await Promise.all([
  lix.get('user:1'),
  lix.get('user:1'),
  lix.get('user:1'),
  // ... 7 more
]);
// Only 1 get operation in the batch!
```

## What We Decided NOT To Build

### Client-Side Memory Cache (Decided Against)

**Why we considered it:**
- Stale-while-revalidate pattern is popular
- Could reduce network calls further
- Other caching libraries do this

**Why we didn't build it:**

1. **Memory Management Risk**
   - User had production issues with LRU cache causing Docker pod crashes
   - Memory leaks and OOM errors are worse than slightly slower performance
   - Hard to predict memory usage across different use cases

2. **Architecture Mismatch**
   - The backend IS the cache (Elixir with ETS)
   - Adding another cache layer adds complexity without clear benefit
   - localhost or same-region backend = ~2-10ms latency (already very fast)

3. **YAGNI (You Aren't Gonna Need It)**
   - No evidence users need client-side caching
   - Can always add later if demand exists
   - Premature optimization is a real problem

4. **Cache Invalidation Complexity**
   - "There are only two hard things in Computer Science: cache invalidation and naming things"
   - Client-side cache needs invalidation strategy
   - Automatic batching + request deduplication provide 80% of benefits with 20% of complexity

**Decision:** Focus on request deduplication and automatic batching instead. These provide significant performance benefits without memory management risks.

### Browser Cache-Control Headers (Decided Against)

**Why we considered it:**
- Could leverage browser's built-in caching
- No memory management needed
- Standard HTTP feature

**Why we didn't build it:**

1. **Cache Invalidation Problems**
   - Items cached in browser can't be remotely busted
   - If data changes on server, browser still serves stale data until TTL expires
   - No programmatic way to invalidate specific keys in browser cache

2. **Complexity vs Benefit Unclear**
   - Would need production metrics to prove benefit
   - Adds complexity to HTTP layer
   - Automatic batching already provides excellent performance

3. **Backend Optimization is Better**
   - Backend is already optimized (Elixir + ETS)
   - Same-region latency is already very low
   - Focus on backend performance rather than caching cached data

**Decision:** Skip browser caching for now. Can revisit if production metrics show a clear need.

### Configurable Batching Window (Decided Against)

**Why we considered it:**
- Other batching systems use time windows (e.g., DataLoader)
- More flexible for different use cases

**Why we didn't build it:**

1. **Next-Tick is Superior for Our Use Case**
   - Fixed windows add latency for small batches
   - Debounced windows complicate reasoning
   - Next-tick is predictable and fast

2. **YAGNI**
   - No clear use case for configurable timing
   - Configuration adds complexity
   - Can add later if demand exists

**Decision:** Always use next-tick timing. No configuration.

## New Features (Recently Added)

### rememberAll() Method

**Decision:** Add `rememberAll()` method to both `LixCache` and `Collection` classes for fetching and caching lists.

**Implementation:**
- Fetches a list from an API/database and caches each item individually
- Returns both `items` array (for iteration) and `getBy(key)` function (for O(1) lookups)
- User provides `getKey` function to extract ID from each item
- **Simple mode (default):** Always fetches from API and caches all items
- **Optimized mode (opt-in):** Uses list marker key with `listTTL` to avoid redundant API calls

**Why we built it:**
- Common use case: Fetch `/api/users`, cache each user individually
- Avoids manual loops to cache each item
- Returns both array and lookup function for flexibility
- Follows same patterns as `remember()` (deduplication, cache-aside)

**Design decisions:**
1. **listTTL is optional (defaults to undefined):**
   - Without `listTTL`: Simple, predictable (always fetches)
   - With `listTTL`: Optimization for expensive/large lists
   - Follows YAGNI - start simple, opt-in to optimization

2. **Return both array and getBy() function:**
   - `items` for iteration (common case)
   - `getBy(key)` for fast lookups (O(1) instead of O(n) array.find)
   - Internally uses Map for efficiency

3. **Available on both LixCache and Collection:**
   - `Collection.rememberAll()` - Most common use case, automatic prefixing + validation
   - `LixCache.rememberAll()` - More flexible, requires prefix parameter

4. **List marker strategy:**
   - Uses special key `prefix__list__` to track when list was last fetched
   - Marker has its own TTL (independent of individual item TTLs)
   - Allows items to outlive list freshness marker
   - Example: Fetch list every 60s, but cache items for 1 hour

**Example usage:**
```typescript
// Collection (recommended)
const users = cache.collection('user:', UserSchema);
const result = await users.rememberAll(
  async () => fetch('/api/users').then(r => r.json()),
  {
    getKey: (user) => user.id,
    ttl: 3600,     // Cache each user for 1 hour
    listTTL: 60    // Only re-fetch list every 60 seconds
  }
);

// Use results
result.items.forEach(user => console.log(user.name));  // Array
const alice = result.getBy('123');  // O(1) lookup

// LixCache (flexible)
const result = await cache.rememberAll(
  'product:',
  fetchProducts,
  {
    getKey: (product) => product.sku,
    ttl: 300
  }
);
```

**What we considered but didn't implement:**
1. **Partial cache checking** - Check which items exist, only fetch missing ones
   - Too complex for initial version
   - API needs to support fetching specific IDs (not all APIs do)
   - Would require additional API parameter like `?ids=1,2,3`
   - Can add later if users request it

2. **Automatic key inference** - Assume items have `.id` property
   - Too inflexible - not all objects have `.id`
   - Different APIs use different ID fields (id, _id, uuid, sku, etc.)
   - Explicit `getKey` function is more flexible

## Key Design Patterns

### Collections with Zod Validation

**Decision:** Provide type-safe collections with automatic prefixing and runtime validation.

**Implementation:**
- `cache.collection(prefix, schema)` creates a Collection instance
- Automatic key prefixing (user provides ID, collection adds prefix)
- Runtime validation on both set and get operations
- Full TypeScript type inference from Zod schema

**Benefits:**
- Prevents invalid data from entering cache
- Catches invalid cached data on retrieval
- Type safety without manual type assertions
- Clean API for domain-specific caches

**Example:**
```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email()
});

const users = lix.collection('user:', UserSchema);

await users.set('1', { name: 'Alice', age: 30, email: 'alice@example.com' });
const user = await users.get('1'); // Typed as User | null
```

### Promise-Based Batching

**Decision:** Return promises from `get()` and `set()` that resolve when batch completes.

**Implementation:**
- Each operation creates a new Promise
- Operation and promise callbacks stored in queue
- Batch flush resolves/rejects individual promises
- On error, all queued operations are rejected

**Benefits:**
- Clean async/await API
- Works naturally with Promise.all()
- Errors propagate correctly
- No callback hell

### HTTP Client with Retry Logic

**Decision:** Built-in retry logic with exponential backoff.

**Implementation:**
- Max 3 retries by default (configurable)
- Initial 100ms delay, doubles on each retry
- Only retries on network errors, not server errors
- Timeout configurable per request

**Benefits:**
- Resilient to transient network issues
- Prevents cascade failures
- Configurable for different environments

## Testing Strategy

### Comprehensive Test Coverage

**Test files:**
- `batching.test.ts` - Automatic batching behavior
- `deduplication.test.ts` - Request deduplication
- `collections.test.ts` - Collection operations
- `client.test.ts` - Basic operations
- `http.test.ts` - HTTP client behavior

**Testing approach:**
- Integration tests against real server
- Mock HTTP client for unit tests
- Test both success and error paths
- Test edge cases (empty results, missing keys, etc.)

**Key test patterns:**
- Use `vi.spyOn()` to verify HTTP calls are batched
- Test promise resolution order
- Test error propagation to all queued operations
- Test memory cleanup (no leaks)

### Demo Application

**Purpose:** Visual demonstration of all features

**Location:** `/lix-cache-demo`

**Features demonstrated:**
- Basic operations (get, set, delete)
- Type-safe collections with Zod validation
- Request deduplication (10 simultaneous requests → 1 HTTP call)
- Automatic batching (20 operations → 1 HTTP request)
- Atomic counters
- Scan operations
- Cache management

## Future Considerations

### Delete Operation Batching

**Current state:** `delete()` makes immediate HTTP request, not batched.

**Issue:** If someone does:
```typescript
await Promise.all([
  cache.set('key', value),
  cache.get('key'),
  cache.delete('key')
]);
```

There's a potential race condition - delete could complete before the batch flushes.

**Solution:** Add `delete()` to batch queue to maintain operation order.

**Status:** Documented as a todo, not yet implemented.

### React Hooks

**Potential feature:** React hooks for common patterns

**Example:**
```typescript
const { data, loading, error } = useLixCache('user:1');
```

**Consideration:** Wait for user demand before building. YAGNI principle applies.

### TypeScript Collections

**Potential enhancement:** Collections that work with TypeScript interfaces (not just Zod schemas)

**Challenge:** TypeScript types are compile-time only, so no runtime validation without Zod

**Consideration:** Current Zod approach provides both compile-time and runtime safety

### Stale-While-Revalidate

**Status:** Considered and rejected (see above)

**Future:** Could revisit if:
- Users specifically request it
- We have production metrics showing clear benefit
- Memory management concerns are addressed

### Batch Operations on Collections

**Status:** Implemented!

Collections now support:
- `batchGet(ids: string[]): Promise<Array<T | null>>`
- `batchSet(items: Array<{ id, value, ttl? }>): Promise<void>`
- `batchDelete(ids: string[]): Promise<void>`

**Benefits:**
- Efficient bulk operations with validation
- Type-safe batch operations
- Works with automatic batching system

## Contributing

When adding new features:

1. **Consider YAGNI** - Do we really need this? Can it wait?
2. **Measure impact** - For performance features, prove the benefit
3. **Test thoroughly** - Both unit and integration tests
4. **Document decisions** - Update this file with rationale
5. **Update README** - Keep user documentation current
6. **Update demo** - Show new features visually

## Questions to Ask

Before adding a new feature:

1. **Do users actually need this?** (Evidence, not assumptions)
2. **What are the risks?** (Memory, complexity, edge cases)
3. **Can we build it simpler?** (YAGNI, progressive enhancement)
4. **How do we test it?** (Unit, integration, edge cases)
5. **What's the migration path?** (Breaking changes, deprecation)
6. **What's the maintenance burden?** (Ongoing cost, tech debt)

## Performance Characteristics

**Current benchmarks** (needs measurement):
- Single operation: ~2-10ms (depending on network)
- Batched operations: ~2-10ms (regardless of batch size)
- Memory usage: Low (no client-side cache)
- Request deduplication: Eliminates redundant operations

**Future work:**
- Formal benchmarks
- Load testing
- Memory profiling
- Network optimization

## License

MIT
