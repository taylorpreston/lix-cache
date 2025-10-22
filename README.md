# Lix Cache

> **TypeScript-first caching with exceptional developer experience**

Lix Cache is a modern caching system built specifically for TypeScript developers. It combines a high-performance Elixir backend with a type-safe SDK that makes caching feel native to your TypeScript application.

```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();

// Set with full type inference
await cache.set('user:1', { name: 'Alice', age: 30 });

// Get with automatic type safety
const user = await cache.get<User>('user:1');  // User | null
```

---

## Why Lix Cache?

**The problem with existing solutions:**

Current caching solutions (Redis, Memcached) work great for operations teams, but the developer experience is lacking:
- ❌ No type safety - everything is a string
- ❌ Manual JSON serialization everywhere
- ❌ Cryptic error messages
- ❌ No IDE autocomplete or inline documentation

**Lix Cache fixes this:**

- ✅ **Full type inference** - TypeScript knows your data shapes automatically
- ✅ **Zero configuration** - works out of the box with sensible defaults
- ✅ **Automatic batching** - operations in the same tick become one request
- ✅ **Request deduplication** - multiple requests for the same key → one operation
- ✅ **Cache-aside pattern** - `remember()` handles get/compute/set automatically
- ✅ **Type-safe collections** - Runtime validation with Zod schemas
- ✅ **Helpful errors** - clear messages that help you fix issues
- ✅ **Modern API** - Promise-based, clean, intuitive

---

## Quick Start

### 1. Start the server

The fastest way to get started:

```bash
npx lix-cache-server
```

This starts the cache server on `http://localhost:4000` using Docker.

> **Requirements:** Docker must be installed. [Get Docker](https://docs.docker.com/get-docker/)

### 2. Install the SDK

```bash
npm install lix-cache-sdk
# or
pnpm add lix-cache-sdk
```

### 3. Start caching!

```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();

// Basic operations
await cache.set('user:1', { name: 'Alice', age: 30 });
const user = await cache.get<User>('user:1');
await cache.delete('user:1');

// With TTL (time-to-live)
await cache.set('session:abc', { token: '...' }, { ttl: 3600 });

// Cache-aside pattern (remember)
const user = await cache.remember('user:123', async () => {
  return await db.users.findById('123');
}, { ttl: 300 });

// Type-safe collections with Zod
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number().min(0),
  email: z.string().email()
});

const users = cache.collection('user:', UserSchema);

await users.set('1', { name: 'Alice', age: 30, email: 'alice@example.com' });
const alice = await users.get('1');  // Fully typed and validated!
```

---

## Features

### 🎯 Core Features

- **Basic Operations**: get, set, delete with full type safety
- **Atomic Operations**: increment, decrement for counters
- **Batch Operations**: execute multiple operations in one request
- **Scan**: search keys by prefix
- **TTL Support**: automatic expiration with configurable time-to-live
- **Cache Statistics**: monitor cache size, hit rates, and performance

### 🚀 Advanced Features

- **Automatic Batching**: Operations in the same event loop tick are automatically batched into a single HTTP request
- **Request Deduplication**: Multiple simultaneous requests for the same key share a single operation
- **Cache-Aside Pattern**: `remember()` method handles the check/compute/store pattern automatically
- **Type-Safe Collections**: Runtime validation with Zod schemas + compile-time types
- **Value Objects**: Single-key management with `cache.value('key')` for cleaner code
- **Bulk Operations**: `rememberAll()` for fetching and caching lists efficiently

### 🏗️ Backend Features

- **High Performance**: Built with Elixir/OTP - handles 100k+ ops/sec
- **Simple Deployment**: Single Docker container, no clustering complexity
- **Authentication**: API key support for production deployments
- **Structured Logging**: JSON logs with Telemetry integration
- **CORS Support**: Configurable origins for browser usage
- **Health Checks**: `/health` endpoint for monitoring

---

## Monorepo Structure

This monorepo contains all Lix Cache packages:

```
lix-cache/
├── lix_cache_api/          # Elixir backend (Docker image)
├── lix-cache-sdk/          # TypeScript SDK (npm package)
├── lix-cache-server/       # CLI tool for local dev (npm package)
├── lix-cache-docs/         # Documentation site (Astro)
├── lix-cache-demo/         # React demo app (not published)
├── lix-cache-benchmarks/   # Performance benchmarks (not published)
└── docs/                   # Design docs and guides
```

### Published Packages

| Package | Description | Install |
|---------|-------------|---------|
| **[lix-cache-sdk](./lix-cache-sdk)** | TypeScript SDK for Lix Cache | `npm install lix-cache-sdk` |
| **[lix-cache-server](./lix-cache-server)** | Zero-config dev server | `npx lix-cache-server` |
| **lix_cache_api** | Elixir backend | `docker pull lixcache/server` |

---

## Documentation

### Getting Started
- [Installation Guide](./lix-cache-sdk/README.md#installation)
- [Quick Start Tutorial](./lix-cache-sdk/README.md#quick-start)
- [Configuration Options](./lix-cache-sdk/README.md#configuration)

### Guides
- [Type-Safe Collections](./lix-cache-sdk/README.md#type-safe-collections)
- [Cache-Aside Pattern (remember)](./lix-cache-sdk/README.md#cache-aside-pattern)
- [Automatic Batching](./lix-cache-sdk/CLAUDE.md#automatic-batching)
- [Request Deduplication](./lix-cache-sdk/CLAUDE.md#request-deduplication)

### Backend
- [API Endpoints](./lix_cache_api/README.md#api-endpoints)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Architecture Overview](./CLAUDE.md#backend-structure)

### Examples
- [React Demo App](./lix-cache-demo) (local development)
- [Performance Benchmarks](./lix-cache-benchmarks) (local development)

---

## Examples

### Basic Caching

```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();

// Simple get/set
await cache.set('config', { theme: 'dark', lang: 'en' });
const config = await cache.get('config');

// With expiration (5 minutes)
await cache.set('temp-token', 'abc123', { ttl: 300 });
```

### Cache-Aside Pattern

```typescript
// Automatically checks cache, fetches if missing, and stores
const user = await cache.remember(
  `user:${userId}`,
  async () => await db.users.findById(userId),
  { ttl: 600 }
);

// Multiple calls deduplicated automatically
await Promise.all([
  cache.remember('user:1', fetchUser),
  cache.remember('user:1', fetchUser),  // Waits for first call
  cache.remember('user:1', fetchUser)   // Only 1 DB query!
]);
```

### Type-Safe Collections

```typescript
import { z } from 'zod';

const ProductSchema = z.object({
  name: z.string(),
  price: z.number().positive(),
  inStock: z.boolean()
});

const products = cache.collection('product:', ProductSchema);

// Runtime validation + type inference
await products.set('1', {
  name: 'Laptop',
  price: 999,
  inStock: true
});

// This throws a Zod validation error
await products.set('2', {
  name: 'Phone',
  price: -50,  // ❌ Must be positive!
  inStock: true
});

// Fully typed results
const laptop = await products.get('1');  // Product | null
```

### Atomic Counters

```typescript
// Page view counter
await cache.incr('page:views');           // Returns 1
await cache.incr('page:views');           // Returns 2
await cache.incr('page:views', 10);       // Returns 12

// Credits system
await cache.set('user:credits', 100);
await cache.decr('user:credits', 5);      // Returns 95
```

### Batch Operations

```typescript
// Automatically batched when in same tick
const results = await Promise.all([
  cache.get('user:1'),
  cache.get('user:2'),
  cache.get('user:3'),
  cache.set('user:4', data),
  cache.set('user:5', data)
]);
// Only 1 HTTP request made! ⚡
```

---

## Development

### Prerequisites

- **Node.js** 18+ (for SDK and tooling)
- **pnpm** 9+ (for workspace management)
- **Docker** (for running the backend)
- **Elixir** 1.18+ (optional, for backend development)

### Setup

```bash
# Clone the repository
git clone https://github.com/taylorpreston/lix-cache.git
cd lix-cache

# Install dependencies
pnpm install

# Start the backend
npx lix-cache-server
# OR run Elixir directly:
cd lix_cache_api && iex -S mix

# In another terminal, run SDK tests
cd lix-cache-sdk
pnpm test

# Build all packages
pnpm -r build
```

### Running Tests

```bash
# SDK tests (requires backend running)
cd lix-cache-sdk
pnpm test

# Backend tests
cd lix_cache_api
mix test

# Run benchmarks
cd lix-cache-benchmarks
pnpm bench
```

### Local Development

```bash
# Start backend with hot reloading
cd lix_cache_api
iex -S mix

# Watch SDK for changes
cd lix-cache-sdk
pnpm dev

# Run demo app
cd lix-cache-demo
pnpm dev

# Serve documentation locally
cd lix-cache-docs
pnpm dev
```

---

## Production Deployment

### Docker

```bash
docker run -d \
  --name lix-cache \
  -p 4000:4000 \
  -e PORT=4000 \
  -e LIX_CACHE_LIMIT=100000 \
  -e LIX_AUTH_ENABLED=true \
  -e LIX_API_KEYS=your-secret-key \
  lixcache/server:latest
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `4000` |
| `LIX_CACHE_LIMIT` | Maximum cache items | `500000` |
| `LIX_AUTH_ENABLED` | Enable API key auth | `false` |
| `LIX_API_KEYS` | Comma-separated API keys | - |
| `LIX_CORS_ORIGINS` | Allowed CORS origins | `*` |
| `LOG_LEVEL` | Logging verbosity | `info` |

### Platform-Specific Guides

See our [Deployment Guide](./docs/DEPLOYMENT.md) for detailed instructions:
- Fly.io
- Railway
- Render
- AWS ECS/Fargate
- Digital Ocean
- Kubernetes

---

## Performance

Lix Cache is built for speed:

- **Backend**: Elixir/OTP handles 100,000+ operations/sec on a single node
- **Latency**: Sub-10ms response times for local/same-region deployments
- **Automatic Batching**: Reduces network overhead by 10-100x
- **Request Deduplication**: Eliminates redundant operations

See [benchmarks](./lix-cache-benchmarks) for detailed performance comparisons with Redis.

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**: Follow the existing code style
4. **Add tests**: Ensure tests pass with `pnpm test`
5. **Commit**: `git commit -m 'Add amazing feature'`
6. **Push**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- **TypeScript**: Use strict mode, provide types for all public APIs
- **Elixir**: Follow standard formatting (`mix format`)
- **Tests**: Write tests for new features and bug fixes
- **Documentation**: Update README and docs for user-facing changes
- **Commits**: Use clear, descriptive commit messages

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## Roadmap

### ✅ Completed
- Core SDK with type safety
- Elixir backend with 10 HTTP endpoints
- Automatic batching and request deduplication
- Type-safe collections with Zod
- Cache-aside pattern (remember/rememberAll)
- Authentication and API keys
- Structured logging and telemetry
- Comprehensive test suite
- Documentation site

### 🚧 In Progress
- Publishing to npm and Docker Hub
- CI/CD pipeline (GitHub Actions)
- Performance benchmarks vs Redis

### 🔮 Planned
- React hooks package (`lix-cache-react`)
- Next.js middleware and App Router support
- Managed cloud hosting (Lix Cloud)
- Multi-region replication
- Prometheus metrics endpoint
- CLI for cache inspection/debugging
- Additional language SDKs (Python, Go)

---

## Architecture

Lix Cache uses a simple client-server architecture:

```
┌─────────────────────────────────────┐
│   Your TypeScript Application      │
│                                     │
│   import { LixCache }               │
│   const cache = new LixCache()      │
│                                     │
│   ┌──────────────────────────┐     │
│   │  lix-cache-sdk           │     │
│   │  • Type inference        │     │
│   │  • Auto batching         │     │
│   │  • Deduplication         │     │
│   │  • Zod validation        │     │
│   └───────────┬──────────────┘     │
└───────────────┼────────────────────┘
                │
                │ HTTP/JSON
                │
┌───────────────▼────────────────────┐
│   Elixir Backend                   │
│                                    │
│   ┌────────────────────────────┐  │
│   │  Plug Router               │  │
│   │  • 10 HTTP endpoints       │  │
│   │  • Auth & CORS             │  │
│   │  • Telemetry               │  │
│   └───────────┬────────────────┘  │
│               │                    │
│   ┌───────────▼────────────────┐  │
│   │  Cachex (ETS)              │  │
│   │  • In-memory storage       │  │
│   │  • TTL management          │  │
│   │  • 100k+ ops/sec           │  │
│   └────────────────────────────┘  │
└────────────────────────────────────┘
```

**Key Design Decisions:**
- **Elixir backend**: High performance, fault tolerance, simple deployment
- **TypeScript SDK**: Type safety, DX, automatic optimizations
- **HTTP/JSON**: Simple, debuggable, works everywhere
- **No clustering**: Keep it simple - scale vertically or use load balancer
- **Automatic batching**: Reduce network calls without configuration

See [CLAUDE.md](./CLAUDE.md) for detailed architectural decisions and rationale.

---

## FAQ

### How is this different from Redis?

Lix Cache is built **specifically for TypeScript developers**:
- Full type inference without manual type annotations
- Automatic batching and deduplication
- Type-safe collections with runtime validation
- Cache-aside pattern built-in
- Helpful error messages

Redis is a general-purpose data store with broad language support but no TypeScript-specific features.

### Is it production-ready?

The code is stable and well-tested, but Lix Cache is in **early release** (v0.1.0). We recommend:
- ✅ Use for new projects and non-critical services
- ✅ Use for development and testing
- ⚠️ Use with monitoring for production services
- ❌ Don't use for mission-critical data (yet)

### Can I use it with Next.js/React?

Yes! The SDK works in both Node.js and browser environments. React hooks are planned.

### How do I scale Lix Cache?

Currently, each instance has its own cache. For scaling:
1. **Vertical scaling**: Increase memory/CPU (simple, recommended)
2. **Horizontal scaling**: Multiple instances behind load balancer with sticky sessions
3. **Future**: Multi-region replication (roadmap)

### Is there a managed/hosted version?

Not yet. Self-hosting via Docker is currently the only option. Managed hosting ("Lix Cloud") is planned.

### What about persistence?

Lix Cache stores data in memory only. It's designed as a **cache**, not a database. For persistent data, use a database and Lix Cache as your caching layer.

---

## License

[MIT](./LICENSE) - Copyright (c) 2024 Lix Cache

---

## Support

- **Documentation**: [Full docs](./lix-cache-docs)
- **Issues**: [GitHub Issues](https://github.com/taylorpreston/lix-cache/issues)
- **Discussions**: [GitHub Discussions](https://github.com/taylorpreston/lix-cache/discussions)

---

**Built with ❤️ for TypeScript developers who deserve better caching**
