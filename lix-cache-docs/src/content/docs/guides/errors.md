---
title: Error Handling
description: How to handle errors gracefully in Lix Cache
---

Lix Cache provides helpful error messages and custom error classes for common failure scenarios.

## Error Classes

All errors extend the base `LixCacheError` class:

```typescript
import {
  LixCacheError,
  LixNotFoundError,
  LixConnectionError,
  LixValidationError,
  LixTimeoutError
} from 'lix-cache-sdk';

try {
  const user = await cache.get('user:123');
} catch (error) {
  if (error instanceof LixNotFoundError) {
    console.log('Key not found');
  } else if (error instanceof LixConnectionError) {
    console.log('Cannot reach cache server');
  } else if (error instanceof LixTimeoutError) {
    console.log('Request took too long');
  }
}
```

## Error Types

### LixNotFoundError

Thrown when a key doesn't exist in the cache:

```typescript
try {
  const user = await cache.get('user:999');
  if (user === null) {
    // Key doesn't exist - this is normal, not an error
  }
} catch (error) {
  // Network error or server error
}
```

**Important:** `get()` returns `null` for missing keys - it doesn't throw `LixNotFoundError`. The error is only thrown for server-side issues.

### LixConnectionError

Thrown when the SDK cannot connect to the cache server:

```typescript
const cache = new LixCache({ url: 'http://localhost:9999' }); // Wrong port

try {
  await cache.set('key', 'value');
} catch (error) {
  if (error instanceof LixConnectionError) {
    console.error('Cannot connect to cache server');
    console.error('Is the server running on port 9999?');
  }
}
```

**Common causes:**
- Server is not running
- Wrong URL or port
- Firewall blocking connection
- Network issues

### LixValidationError

Thrown when data fails Zod schema validation in Collections:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(0).max(150)
});

const users = cache.collection('user:', UserSchema);

try {
  await users.set('1', {
    name: 'Alice',
    email: 'not-an-email',  // Invalid email!
    age: 200                // Too old!
  });
} catch (error) {
  if (error instanceof LixValidationError) {
    console.error('Validation failed:', error.message);
    console.error('Issues:', error.issues); // Zod validation errors
  }
}
```

**Validation error message includes:**
- Which fields failed validation
- What the validation rules were
- What values were provided

### LixTimeoutError

Thrown when a request takes longer than the configured timeout:

```typescript
const cache = new LixCache({ timeout: 1000 }); // 1 second timeout

try {
  await cache.get('slow:key');
} catch (error) {
  if (error instanceof LixTimeoutError) {
    console.error('Request timed out after 1 second');
  }
}
```

**Common causes:**
- Server is overloaded
- Network latency is high
- Operation is too expensive (large batch)

## Handling Errors

### Basic Try-Catch

```typescript
try {
  const user = await cache.get<User>('user:123');
  if (user) {
    console.log('Found user:', user.name);
  } else {
    console.log('User not found');
  }
} catch (error) {
  console.error('Cache error:', error);
  // Fallback to database
  const user = await db.users.findById(123);
}
```

### Graceful Degradation

```typescript
async function getUser(id: string): Promise<User | null> {
  try {
    // Try cache first
    return await cache.get<User>(`user:${id}`);
  } catch (error) {
    // Cache failed, fall back to database
    console.error('Cache error, using database:', error);
    return await db.users.findById(id);
  }
}
```

### Retry Logic

```typescript
async function getCachedData<T>(key: string, retries = 3): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      return await cache.get<T>(key);
    } catch (error) {
      if (i === retries - 1) throw error; // Last retry, give up

      console.log(`Retry ${i + 1}/${retries} after error:`, error);
      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1))); // Exponential backoff
    }
  }
  return null;
}
```

### Circuit Breaker Pattern

```typescript
class CacheCircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private readonly threshold = 5;
  private readonly timeout = 60000; // 1 minute

  async get<T>(key: string): Promise<T | null> {
    // Circuit is open (too many failures)
    if (this.failures >= this.threshold) {
      if (Date.now() - this.lastFailTime < this.timeout) {
        console.warn('Circuit breaker open, skipping cache');
        return null; // Fall back immediately
      }
      // Timeout passed, try again (half-open state)
      this.failures = 0;
    }

    try {
      const result = await cache.get<T>(key);
      this.failures = 0; // Success, reset counter
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailTime = Date.now();
      throw error;
    }
  }
}
```

## Best Practices

### 1. Always Handle Connection Errors

```typescript
// ✅ Good: Handle errors gracefully
async function fetchData() {
  try {
    return await cache.get('data');
  } catch (error) {
    if (error instanceof LixConnectionError) {
      // Fallback to database or default value
      return getDataFromDatabase();
    }
    throw error; // Re-throw unexpected errors
  }
}

// ❌ Bad: Let errors crash the app
async function fetchData() {
  return await cache.get('data'); // No error handling!
}
```

### 2. Use Validation for External Data

```typescript
// ✅ Good: Validate API responses
const apiData = cache.collection('api:', ApiResponseSchema);

try {
  await apiData.set('users', await fetchFromAPI());
} catch (error) {
  if (error instanceof LixValidationError) {
    console.error('API returned invalid data:', error.issues);
    // Don't cache invalid data
  }
}
```

### 3. Set Appropriate Timeouts

```typescript
// ✅ Good: Reasonable timeout
const cache = new LixCache({ timeout: 5000 }); // 5 seconds

// ❌ Bad: Too short (false timeouts)
const cache = new LixCache({ timeout: 100 }); // 100ms - too aggressive!

// ❌ Bad: Too long (slow failures)
const cache = new LixCache({ timeout: 60000 }); // 1 minute - too patient!
```

### 4. Log Errors with Context

```typescript
// ✅ Good: Helpful error logs
try {
  await cache.set('user:123', userData);
} catch (error) {
  console.error('Failed to cache user 123:', {
    error: error.message,
    userId: 123,
    operation: 'set',
    timestamp: new Date().toISOString()
  });
}

// ❌ Bad: Useless error logs
try {
  await cache.set('user:123', userData);
} catch (error) {
  console.error('Error'); // What error? Where? When?
}
```

## Error Recovery Strategies

### Stale-While-Revalidate

Serve cached data even if it's expired, while fetching fresh data in the background:

```typescript
async function getDataWithStale<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    return await cache.remember(key, fetcher, { ttl: 300 });
  } catch (error) {
    // Cache failed, try to get stale data
    const stale = await cache.get<T>(key);
    if (stale) {
      console.warn('Serving stale cache data due to error');

      // Revalidate in background (don't await)
      cache.set(key, await fetcher(), { ttl: 300 }).catch(console.error);

      return stale;
    }

    // No stale data, must fetch
    return await fetcher();
  }
}
```

### Fallback Chain

Try multiple data sources in order:

```typescript
async function getUserWithFallback(id: string): Promise<User | null> {
  // 1. Try cache
  try {
    const cached = await cache.get<User>(`user:${id}`);
    if (cached) return cached;
  } catch (error) {
    console.error('Cache error:', error);
  }

  // 2. Try database
  try {
    const user = await db.users.findById(id);
    if (user) {
      // Cache for next time
      cache.set(`user:${id}`, user, { ttl: 300 }).catch(console.error);
      return user;
    }
  } catch (error) {
    console.error('Database error:', error);
  }

  // 3. Try external API
  try {
    const user = await fetchUserFromAPI(id);
    if (user) {
      cache.set(`user:${id}`, user, { ttl: 300 }).catch(console.error);
      return user;
    }
  } catch (error) {
    console.error('API error:', error);
  }

  return null; // All sources failed
}
```

## Monitoring and Alerting

### Track Error Rates

```typescript
class CacheMetrics {
  private hits = 0;
  private misses = 0;
  private errors = 0;

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await cache.get<T>(key);
      if (value) {
        this.hits++;
      } else {
        this.misses++;
      }
      return value;
    } catch (error) {
      this.errors++;

      // Alert if error rate is high
      if (this.errorRate() > 0.1) { // 10% error rate
        this.sendAlert('High cache error rate!');
      }

      throw error;
    }
  }

  errorRate(): number {
    const total = this.hits + this.misses + this.errors;
    return total === 0 ? 0 : this.errors / total;
  }

  sendAlert(message: string) {
    console.error(`[ALERT] ${message}`, {
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      errorRate: this.errorRate()
    });
  }
}
```

## Testing Error Scenarios

```typescript
import { describe, it, expect } from 'vitest';

describe('Cache error handling', () => {
  it('handles connection errors gracefully', async () => {
    const cache = new LixCache({ url: 'http://localhost:9999' }); // Wrong port

    await expect(cache.get('key')).rejects.toThrow(LixConnectionError);
  });

  it('handles validation errors', async () => {
    const schema = z.object({ email: z.string().email() });
    const collection = cache.collection('test:', schema);

    await expect(
      collection.set('1', { email: 'invalid' })
    ).rejects.toThrow(LixValidationError);
  });

  it('falls back to database on cache error', async () => {
    const mockCache = {
      get: vi.fn().mockRejectedValue(new LixConnectionError('Connection failed'))
    };

    const result = await getUserWithFallback('123');

    expect(result).toEqual(mockDatabaseUser);
  });
});
```

## Next Steps

- [React Integration](/guides/react/) - Handle errors in React components
- [Backend Architecture](/backend/architecture/) - Understand server-side error handling
- [API Reference](/api/) - Full error class documentation
