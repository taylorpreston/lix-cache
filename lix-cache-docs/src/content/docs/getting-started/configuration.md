---
title: Configuration
description: Configure Lix Cache for your environment
---

## Client Configuration

All configuration is optional with sensible defaults:

```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache({
  // Server URL (default: http://localhost:4000)
  url: 'http://localhost:4000',

  // Request timeout in milliseconds (default: 5000)
  timeout: 5000,

  // Maximum retry attempts (default: 3)
  maxRetries: 3,

  // Initial retry delay in milliseconds (default: 100)
  // Doubles on each retry (exponential backoff)
  retryDelay: 100,
});
```

## Environment Variables

You can also configure via environment variables:

```bash
LIX_CACHE_URL=http://localhost:4000
```

Example `.env` file:

```bash
LIX_CACHE_URL=http://cache-server:4000
```

The SDK will automatically read from `process.env.LIX_CACHE_URL`.

## Server Configuration

Configure the Lix Cache server via environment variables:

```bash
# Maximum cache items (default: 100,000)
LIX_CACHE_LIMIT=500000

# Server port (default: 4000)
PORT=8080
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  lix-cache:
    image: lixcache/server:latest
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - LIX_CACHE_LIMIT=100000
    restart: unless-stopped
```

## Production Settings

### Recommended Client Config

```typescript
const cache = new LixCache({
  url: process.env.LIX_CACHE_URL || 'http://localhost:4000',
  timeout: 10000,     // 10s for production
  maxRetries: 5,      // More retries for network issues
  retryDelay: 200,    // Longer initial delay
});
```

### Recommended Server Config

```bash
# For high-traffic applications
LIX_CACHE_LIMIT=1000000  # 1 million items
PORT=4000
```

## Performance Tuning

### Client-Side

**Automatic batching** is always enabled - no configuration needed. Operations in the same event loop tick are automatically batched.

**Request deduplication** is always enabled - multiple simultaneous requests for the same key are automatically deduplicated.

### Server-Side

The server uses:
- **Bandit** - Pure Elixir HTTP server
- **Cachex** - In-memory caching with ETS
- **jiffy** - Fast JSON encoding/decoding (C-based NIF)

No tuning needed - it's fast by default! (~3,000 ops/sec on localhost)

## Monitoring

### Check Server Health

```typescript
const health = await cache.health();
console.log(health); // { status: 'healthy' }
```

### Get Cache Statistics

```typescript
const stats = await cache.stats();
console.log(stats);
// {
//   size: 1234,        // Current items in cache
//   limit: 100000,     // Maximum items
//   stats: { ... }     // Detailed metrics
// }
```

## Multiple Environments

### Development

```typescript
// .env.development
LIX_CACHE_URL=http://localhost:4000
```

### Staging

```typescript
// .env.staging
LIX_CACHE_URL=http://cache-staging.example.com
```

### Production

```typescript
// .env.production
LIX_CACHE_URL=http://cache.example.com
```

## Troubleshooting

### Connection Issues

If you see connection errors:

1. **Check server is running**: `curl http://localhost:4000/health`
2. **Check URL**: Verify `LIX_CACHE_URL` is correct
3. **Check firewall**: Ensure port is accessible
4. **Increase timeout**: Try `timeout: 10000`

### Timeout Issues

If requests timeout frequently:

1. **Increase client timeout**: `timeout: 10000`
2. **Reduce retry delay**: `retryDelay: 50`
3. **Check server load**: Use `/cache/stats` endpoint
4. **Increase cache limit**: Set `LIX_CACHE_LIMIT` higher

### Memory Issues

If server runs out of memory:

1. **Set cache limit**: `LIX_CACHE_LIMIT=50000`
2. **Use shorter TTLs**: Expire old data faster
3. **Clear old data**: Use `cache.clear()` or `/cache/clear`
4. **Scale horizontally**: Run multiple cache servers

## Next Steps

- [Quick Start Guide](/getting-started/quick-start/) - Try it out
- [Collections Guide](/guides/collections/) - Type-safe caching
- [Backend Deployment](/backend/deployment/) - Production setup
