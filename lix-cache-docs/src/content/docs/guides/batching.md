---
title: Automatic Batching
description: How Lix Cache automatically batches operations for optimal performance
---

**Lix Cache automatically batches all operations in the same event loop tick into a single HTTP request.**

No configuration needed - it just works!

## How It Works

When you call cache methods, they're queued instead of executed immediately:

```typescript
// These operations happen in the same tick
cache.set('user:1', alice);
cache.set('user:2', bob);
cache.get('user:1');
cache.get('user:2');

// A microtask is scheduled to flush the batch
// All 4 operations → 1 HTTP request with batch endpoint
```

### The Magic: Next-Tick Timing

Operations are flushed using `queueMicrotask()`, which means:
- All operations in the same synchronous code block are batched
- Promises resolve with individual results
- No arbitrary time windows or delays
- Predictable behavior

## Visual Example

```typescript
// ❌ Without batching: 20 HTTP requests
for (let i = 0; i < 10; i++) {
  await cache.set(`key:${i}`, data[i]);  // 1 request
  await cache.get(`key:${i}`);           // 1 request
}
// Total: 20 requests, ~60-200ms

// ✅ With automatic batching: 1 HTTP request
await Promise.all([
  ...Array.from({ length: 10 }, (_, i) => cache.set(`key:${i}`, data[i])),
  ...Array.from({ length: 10 }, (_, i) => cache.get(`key:${i})),
]);
// Total: 1 request, ~3-10ms
```

## Real-World Impact

### React Component Tree

```typescript
function UserDashboard() {
  return (
    <div>
      <UserProfile />      {/* Calls cache.get('user:1') */}
      <UserPosts />        {/* Calls cache.get('posts:user:1') */}
      <UserFollowers />    {/* Calls cache.get('followers:user:1') */}
      <UserNotifications />{/* Calls cache.get('notifications:user:1') */}
    </div>
  );
}

// All 4 components render in same tick
// Result: 4 get operations → 1 HTTP request!
```

### Multiple Parallel Operations

```typescript
async function loadDashboard(userId: string) {
  // All fetched in parallel, automatically batched
  const [user, posts, followers, settings] = await Promise.all([
    cache.get(`user:${userId}`),
    cache.get(`posts:${userId}`),
    cache.get(`followers:${userId}`),
    cache.get(`settings:${userId}`)
  ]);

  return { user, posts, followers, settings };
}
// Only 1 HTTP request made!
```

## Request Deduplication

Automatic batching includes intelligent deduplication:

```typescript
// 10 requests for the same key
await Promise.all([
  cache.get('user:1'),
  cache.get('user:1'),
  cache.get('user:1'),
  cache.get('user:1'),
  cache.get('user:1'),
  cache.get('user:1'),
  cache.get('user:1'),
  cache.get('user:1'),
  cache.get('user:1'),
  cache.get('user:1'),
]);

// Only 1 get operation in the batch!
// All 10 promises resolve with the same result
```

## How Deduplication Works

1. **Same key, same operation** → Shared promise
2. **Same key, different operation** → Separate operations
3. **Different keys** → Separate operations

```typescript
await Promise.all([
  cache.get('user:1'),      // Operation 1
  cache.get('user:1'),      // Shares with operation 1
  cache.set('user:1', data),// Operation 2 (different op type)
  cache.get('user:2'),      // Operation 3 (different key)
]);
// Batch contains 3 operations, not 4
```

## Performance Numbers

**Sequential (no batching):**
- 1,000 operations × 0.3ms = 300ms total

**Batched (automatic):**
- 1 batch request = 3-5ms total

**Speedup: 60-100x faster!**

## When Batching Happens

### ✅ These Get Batched

```typescript
// Same tick operations
await Promise.all([
  cache.set('a', 1),
  cache.set('b', 2),
]);

// Async functions called together
const results = await Promise.all([
  getUser(1),
  getUser(2),
]);

// React render cycle
function MyComponent() {
  const user = useCache('user:1');
  const posts = useCache('posts:1');
  // Both batched!
}
```

### ❌ These Don't Get Batched

```typescript
// Sequential awaits (different ticks)
await cache.set('a', 1);
await cache.set('b', 2);
// 2 requests

// Delayed operations
cache.set('a', 1);
await delay(100);
cache.set('b', 2);
// 2 requests
```

## Understanding Next-Tick Timing

```typescript
console.log('1. Start');

cache.set('key', 'value');
console.log('2. Set called (queued)');

cache.get('key');
console.log('3. Get called (queued)');

console.log('4. End of synchronous code');

// Microtask runs here
// Batch is flushed

// Then promises resolve
// Output order: 1, 2, 3, 4, (batch flush), (promises resolve)
```

## Best Practices

### ✅ DO: Use Promise.all

```typescript
// Optimal - all batched
const results = await Promise.all([
  cache.get('user:1'),
  cache.get('user:2'),
  cache.get('user:3'),
]);
```

### ❌ DON'T: Use Sequential Awaits

```typescript
// Suboptimal - 3 separate requests
const user1 = await cache.get('user:1');
const user2 = await cache.get('user:2');
const user3 = await cache.get('user:3');
```

### ✅ DO: Let React Render Naturally

```typescript
// Components request data during render
// All automatically batched!
function Dashboard() {
  return (
    <>
      <Profile />
      <Posts />
      <Settings />
    </>
  );
}
```

### ✅ DO: Use in Loops with Promise.all

```typescript
// Good - batched
await Promise.all(
  userIds.map(id => cache.get(`user:${id}`))
);
```

### ❌ DON'T: Use in Sequential Loops

```typescript
// Bad - not batched
for (const id of userIds) {
  await cache.get(`user:${id}`);
}
```

## Combining with Collections

Collections automatically batch too:

```typescript
const users = cache.collection<User>('user:');

// All batched!
const results = await users.batchGet(['1', '2', '3', '4', '5']);

// Also batched!
await Promise.all([
  users.get('1'),
  users.get('2'),
  users.get('3'),
]);
```

## Combining with Remember

Remember operations benefit from batching:

```typescript
// Multiple remember() calls in same tick
await Promise.all([
  cache.remember('expensive:1', compute1),
  cache.remember('expensive:2', compute2),
  cache.remember('expensive:3', compute3),
]);

// If all cache hits → 1 HTTP request
// If all cache misses → 3 computations run, then 1 batch set
```

## Why Next-Tick Instead of Time Window?

**Time window approach (like DataLoader):**
- Wait 10-50ms to collect operations
- Adds latency even for single operations
- Unpredictable: did we wait long enough?

**Next-tick approach (Lix Cache):**
- Zero added latency
- Predictable: synchronous code = one batch
- Natural fit for React render cycles

## Implementation Details

If you're curious, here's what happens under the hood:

1. **Operation called** → Added to queue
2. **Microtask scheduled** (if not already scheduled)
3. **Synchronous code completes**
4. **Microtask runs** → Flush queue
5. **HTTP request sent** with batch payload
6. **Response received** → Promises resolve

## Configuration

**There is no configuration.** Batching is always enabled.

This is intentional - batching provides significant performance benefits with zero downsides. Making it optional would complicate the API for no gain.

## Troubleshooting

### "My operations aren't batched!"

Check if you're using sequential awaits:

```typescript
// ❌ Wrong - not batched
await cache.get('a');
await cache.get('b');

// ✅ Right - batched
await Promise.all([
  cache.get('a'),
  cache.get('b'),
]);
```

### "How can I see batching in action?"

Use browser DevTools Network tab:
1. Open Network tab
2. Filter by XHR/Fetch
3. Perform operations
4. See single `/cache/batch` request

## Performance Comparison

| Scenario | Without Batching | With Batching | Speedup |
|----------|-----------------|---------------|---------|
| 10 operations | 30ms | 3ms | 10x |
| 100 operations | 300ms | 5ms | 60x |
| 1000 operations | 3000ms | 30ms | 100x |

## Next Steps

- [Remember Pattern](/guides/remember/) - Cache-aside with deduplication
- [Collections Guide](/guides/collections/) - Batch operations on collections
- [React Integration](/guides/react/) - Use with React components
