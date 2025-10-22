---
title: Rate Limiting
description: Implement API rate limiting with Lix Cache
---

Use Lix Cache to implement flexible rate limiting for your API endpoints. The atomic increment operations make it perfect for tracking request counts.

## Basic Rate Limiting

### Per-User Rate Limit

Limit each user to 100 requests per hour:

```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();

async function checkRateLimit(userId: string): Promise<boolean> {
  const hour = Math.floor(Date.now() / 3600000); // Current hour
  const key = `rate:${userId}:${hour}`;

  // Increment request count
  const count = await cache.incr(key);

  // Set TTL on first request (expires after 1 hour)
  if (count === 1) {
    await cache.set(key, count, { ttl: 3600 });
  }

  // Check if limit exceeded
  if (count > 100) {
    return false; // Rate limited!
  }

  return true; // OK
}

// Express middleware
app.use(async (req, res, next) => {
  const userId = req.user?.id || req.ip;

  const allowed = await checkRateLimit(userId);

  if (!allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Try again in an hour'
    });
  }

  next();
});
```

### Per-IP Rate Limit

Limit by IP address instead of user ID:

```typescript
async function checkIPRateLimit(ip: string): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000); // Current minute
  const key = `rate:ip:${ip}:${minute}`;

  const count = await cache.incr(key);

  if (count === 1) {
    await cache.set(key, count, { ttl: 60 }); // 1 minute TTL
  }

  return count <= 60; // Max 60 requests per minute
}

// Express middleware
app.use(async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;

  if (!await checkIPRateLimit(ip)) {
    return res.status(429).send('Too many requests');
  }

  next();
});
```

## Advanced Rate Limiting

### Sliding Window Rate Limit

More accurate than fixed windows:

```typescript
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

async function slidingWindowRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Store timestamps as array
  const timestamps: number[] = await cache.get(`rate:${key}`) || [];

  // Remove old timestamps outside window
  const validTimestamps = timestamps.filter(ts => ts > windowStart);

  // Check if limit exceeded
  if (validTimestamps.length >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0
    };
  }

  // Add current timestamp
  validTimestamps.push(now);

  // Store with TTL
  await cache.set(`rate:${key}`, validTimestamps, {
    ttl: Math.ceil(config.windowMs / 1000)
  });

  return {
    allowed: true,
    remaining: config.maxRequests - validTimestamps.length
  };
}

// Usage
app.use(async (req, res, next) => {
  const userId = req.user?.id;

  const result = await slidingWindowRateLimit(userId, {
    maxRequests: 100,
    windowMs: 3600000 // 1 hour
  });

  res.setHeader('X-RateLimit-Remaining', result.remaining);

  if (!result.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  next();
});
```

### Token Bucket Rate Limit

Allow bursts of traffic:

```typescript
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

async function tokenBucketRateLimit(
  key: string,
  maxTokens: number,
  refillRate: number // tokens per second
): Promise<boolean> {
  const now = Date.now();
  const bucketKey = `bucket:${key}`;

  // Get current bucket state
  let bucket: TokenBucket = await cache.get(bucketKey) || {
    tokens: maxTokens,
    lastRefill: now
  };

  // Refill tokens based on time passed
  const timePassed = (now - bucket.lastRefill) / 1000; // seconds
  const tokensToAdd = timePassed * refillRate;
  bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  // Check if token available
  if (bucket.tokens < 1) {
    // Save state and reject
    await cache.set(bucketKey, bucket, { ttl: 3600 });
    return false;
  }

  // Consume token
  bucket.tokens -= 1;
  await cache.set(bucketKey, bucket, { ttl: 3600 });

  return true;
}

// Usage
app.use(async (req, res, next) => {
  const userId = req.user?.id;

  const allowed = await tokenBucketRateLimit(
    userId,
    100,  // Max 100 tokens
    10    // Refill 10 tokens/sec
  );

  if (!allowed) {
    return res.status(429).send('Rate limit exceeded');
  }

  next();
});
```

## Multi-Tier Rate Limiting

### Different Limits for Different Endpoints

```typescript
const rateLimits: Record<string, { requests: number; window: number }> = {
  '/api/search': { requests: 10, window: 60 },      // 10/min
  '/api/upload': { requests: 5, window: 3600 },     // 5/hour
  '/api/data': { requests: 1000, window: 3600 },    // 1000/hour
};

async function endpointRateLimit(
  userId: string,
  endpoint: string
): Promise<boolean> {
  const config = rateLimits[endpoint] || { requests: 100, window: 3600 };

  const window = Math.floor(Date.now() / (config.window * 1000));
  const key = `rate:${userId}:${endpoint}:${window}`;

  const count = await cache.incr(key);

  if (count === 1) {
    await cache.set(key, count, { ttl: config.window });
  }

  return count <= config.requests;
}

// Middleware
app.use(async (req, res, next) => {
  const userId = req.user?.id;
  const endpoint = req.path;

  if (!await endpointRateLimit(userId, endpoint)) {
    return res.status(429).json({
      error: 'Rate limit exceeded for this endpoint'
    });
  }

  next();
});
```

### User Tiers (Free vs Premium)

```typescript
interface UserTier {
  name: string;
  requestsPerHour: number;
}

const tiers: Record<string, UserTier> = {
  free: { name: 'Free', requestsPerHour: 100 },
  premium: { name: 'Premium', requestsPerHour: 10000 },
  enterprise: { name: 'Enterprise', requestsPerHour: 100000 }
};

async function tieredRateLimit(
  userId: string,
  userTier: string
): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  const tier = tiers[userTier] || tiers.free;
  const hour = Math.floor(Date.now() / 3600000);
  const key = `rate:${userId}:${hour}`;

  const count = await cache.incr(key);

  if (count === 1) {
    await cache.set(key, count, { ttl: 3600 });
  }

  return {
    allowed: count <= tier.requestsPerHour,
    limit: tier.requestsPerHour,
    remaining: Math.max(0, tier.requestsPerHour - count)
  };
}

// Usage
app.use(async (req, res, next) => {
  const userId = req.user?.id;
  const userTier = req.user?.tier || 'free';

  const result = await tieredRateLimit(userId, userTier);

  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: result.limit,
      message: 'Upgrade to Premium for higher limits'
    });
  }

  next();
});
```

## Rate Limit Headers

### Standard Headers

Follow RFC 6585 standard:

```typescript
async function addRateLimitHeaders(
  res: Response,
  userId: string,
  limit: number,
  windowSec: number
) {
  const window = Math.floor(Date.now() / (windowSec * 1000));
  const key = `rate:${userId}:${window}`;

  const count: number = await cache.get(key) || 0;
  const remaining = Math.max(0, limit - count);

  // Standard headers
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', (window + 1) * windowSec);

  // Retry-After (when rate limited)
  if (remaining === 0) {
    const resetTime = ((window + 1) * windowSec) - Math.floor(Date.now() / 1000);
    res.setHeader('Retry-After', resetTime);
  }
}

// Usage
app.use(async (req, res, next) => {
  const userId = req.user?.id;

  await addRateLimitHeaders(res, userId, 100, 3600);

  const allowed = await checkRateLimit(userId);

  if (!allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: res.getHeader('Retry-After')
    });
  }

  next();
});
```

## Complex Patterns

### Per-Action Rate Limits

Different limits for different actions:

```typescript
const actionLimits = {
  login: { requests: 5, window: 300 },        // 5 login attempts per 5 min
  register: { requests: 3, window: 3600 },    // 3 registrations per hour
  post: { requests: 10, window: 3600 },       // 10 posts per hour
  comment: { requests: 50, window: 3600 }     // 50 comments per hour
};

async function actionRateLimit(
  userId: string,
  action: string
): Promise<boolean> {
  const config = actionLimits[action];
  if (!config) return true; // No limit for this action

  const window = Math.floor(Date.now() / (config.window * 1000));
  const key = `rate:${userId}:${action}:${window}`;

  const count = await cache.incr(key);

  if (count === 1) {
    await cache.set(key, count, { ttl: config.window });
  }

  return count <= config.requests;
}

// Usage
app.post('/api/login', async (req, res) => {
  const ip = req.ip;

  if (!await actionRateLimit(ip, 'login')) {
    return res.status(429).json({
      error: 'Too many login attempts',
      message: 'Try again in 5 minutes'
    });
  }

  // Process login...
});
```

### Distributed Rate Limiting

Share rate limits across multiple servers:

```typescript
async function distributedRateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  const window = Math.floor(Date.now() / (windowSec * 1000));
  const cacheKey = `rate:distributed:${key}:${window}`;

  // Use atomic increment
  const count = await cache.incr(cacheKey);

  // Set TTL on first request
  if (count === 1) {
    await cache.set(cacheKey, count, { ttl: windowSec });
  }

  return count <= limit;
}

// Works across multiple API servers!
app.use(async (req, res, next) => {
  const userId = req.user?.id;

  if (!await distributedRateLimit(userId, 1000, 3600)) {
    return res.status(429).send('Rate limit exceeded');
  }

  next();
});
```

### Progressive Rate Limiting

Gradually increase restrictions for suspicious behavior:

```typescript
async function progressiveRateLimit(
  userId: string
): Promise<{ allowed: boolean; level: number }> {
  const hour = Math.floor(Date.now() / 3600000);
  const countKey = `rate:${userId}:${hour}`;
  const violationKey = `violations:${userId}`;

  const count = await cache.incr(countKey);
  if (count === 1) {
    await cache.set(countKey, count, { ttl: 3600 });
  }

  const violations: number = await cache.get(violationKey) || 0;

  // Tiered limits based on violations
  let limit = 1000; // Normal limit
  if (violations > 10) limit = 10;      // Severe restriction
  else if (violations > 5) limit = 100; // Moderate restriction
  else if (violations > 2) limit = 500; // Light restriction

  const allowed = count <= limit;

  // Record violation
  if (!allowed) {
    await cache.incr(violationKey);
    await cache.set(violationKey, violations + 1, { ttl: 86400 }); // 24h
  }

  return {
    allowed,
    level: violations
  };
}
```

## Testing Rate Limits

```typescript
import { describe, it, expect } from 'vitest';

describe('Rate limiting', () => {
  it('allows requests under limit', async () => {
    const userId = 'test-user-1';

    for (let i = 0; i < 100; i++) {
      const allowed = await checkRateLimit(userId);
      expect(allowed).toBe(true);
    }
  });

  it('blocks requests over limit', async () => {
    const userId = 'test-user-2';

    // Make 100 requests (at limit)
    for (let i = 0; i < 100; i++) {
      await checkRateLimit(userId);
    }

    // 101st request should be blocked
    const allowed = await checkRateLimit(userId);
    expect(allowed).toBe(false);
  });

  it('resets after window expires', async () => {
    const userId = 'test-user-3';

    // Exhaust limit
    for (let i = 0; i < 100; i++) {
      await checkRateLimit(userId);
    }

    // Should be blocked
    expect(await checkRateLimit(userId)).toBe(false);

    // Wait for TTL to expire (simulate)
    await cache.delete(`rate:${userId}:${Math.floor(Date.now() / 3600000)}`);

    // Should be allowed again
    expect(await checkRateLimit(userId)).toBe(true);
  });
});
```

## Best Practices

### 1. Choose Appropriate Windows

```typescript
// ✅ Good: Reasonable windows
const limits = {
  login: { requests: 5, window: 300 },      // 5 min
  api: { requests: 1000, window: 3600 },    // 1 hour
  search: { requests: 100, window: 60 }     // 1 min
};

// ❌ Bad: Too short or too long
const limits = {
  login: { requests: 5, window: 1 },        // 1 second - too strict!
  api: { requests: 1000, window: 86400 }    // 24 hours - too loose!
};
```

### 2. Use Atomic Operations

```typescript
// ✅ Good: Atomic increment
const count = await cache.incr(key);

// ❌ Bad: Race condition!
let count = await cache.get(key) || 0;
count++;
await cache.set(key, count);
```

### 3. Set TTLs

```typescript
// ✅ Good: Always set TTL
if (count === 1) {
  await cache.set(key, count, { ttl: 3600 });
}

// ❌ Bad: No TTL - leaks memory!
await cache.set(key, count);
```

### 4. Return Helpful Errors

```typescript
// ✅ Good: Informative error
return res.status(429).json({
  error: 'Rate limit exceeded',
  limit: 100,
  remaining: 0,
  resetAt: new Date(resetTime * 1000).toISOString(),
  message: 'Try again in 1 hour'
});

// ❌ Bad: Cryptic error
return res.status(429).send('Too many requests');
```

## Next Steps

- [Session Management](/examples/session-management/) - Handle user sessions
- [Database Caching](/examples/database-caching/) - Cache database queries
- [Remember Pattern](/guides/remember/) - Cache-aside with deduplication
