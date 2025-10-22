---
title: Installation
description: Get started with Lix Cache in under 60 seconds
---

## Prerequisites

- Node.js >= 18.0.0
- pnpm, npm, or yarn

## Quick Install

### 1. Install the SDK

```bash
pnpm add lix-cache-sdk
```

Or with npm:
```bash
npm install lix-cache-sdk
```

Or with yarn:
```bash
yarn add lix-cache-sdk
```

### 2. Start the Server

The easiest way - no installation required:

```bash
npx lix-cache-server
```

This starts the cache server on `http://localhost:4000`. Keep this terminal open.

:::note[Requires Docker]
The npx command uses Docker to run the server. [Get Docker](https://docs.docker.com/get-docker/) if you don't have it.
:::

### 3. Start Caching!

```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();

// You're ready to cache!
await cache.set('key', 'value');
const value = await cache.get('key');
```

That's it! You're caching with full type safety. 🎉

## Alternative Server Installation

### Option 1: Docker Compose

```bash
# Clone the repo
git clone https://github.com/your-org/lix-cache
cd lix-cache/lix_cache_api

# Start with Docker Compose
docker-compose up
```

### Option 2: Elixir (Direct)

If you have Elixir installed:

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

## Environment Configuration

Configure via environment variables:

```bash
LIX_CACHE_URL=http://localhost:4000  # Server URL (optional, this is the default)
```

Or in code:

```typescript
const cache = new LixCache({
  url: 'http://localhost:4000',
  timeout: 5000,      // Request timeout in ms
  maxRetries: 3,      // Max retry attempts
});
```

## Verify Installation

Test that everything works:

```typescript
// test.ts
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();

async function test() {
  // Set a value
  await cache.set('test', { message: 'Hello, Lix!' });

  // Get it back
  const result = await cache.get('test');
  console.log(result); // { message: 'Hello, Lix!' }

  // Check server health
  const health = await cache.health();
  console.log(health); // { status: 'healthy' }
}

test();
```

Run it:

```bash
npx tsx test.ts
```

If you see the output, you're all set!

## Next Steps

- [Quick Start Guide](/getting-started/quick-start/) - Learn the basics
- [Configuration](/getting-started/configuration/) - Customize your setup
- [API Reference](/api/) - Explore all methods
