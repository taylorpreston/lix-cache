# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lix Cache is a TypeScript-first caching system designed for exceptional developer experience. The project consists of:

- **Backend (Elixir)**: High-performance HTTP cache API built with Plug, Cowboy, and Cachex (`lix_cache_api/`)
- **TypeScript SDK**: Type-safe client library with full type inference (`lix-cache-sdk/`)
- **Demo App**: React + Vite demo showcasing all SDK features (`lix-cache-demo/`)

The backend handles 100k+ ops/sec with ~200 lines of Elixir code. The project uses **pnpm workspaces** for monorepo management.

## Key Architecture

### Backend Structure (`lix_cache_api/`)

**Configuration** (`config/runtime.exs`)
- Reads environment variables with sensible defaults
- `LIX_CACHE_LIMIT` - Maximum cache items (default: 500,000)
- `PORT` - HTTP server port (default: 4000)
- `LOG_LEVEL` - Logging verbosity (default: info)
- `LIX_AUTH_ENABLED` - Enable authentication (default: false)
- `LIX_API_KEYS` - Comma-separated API keys
- `LIX_CORS_ORIGINS` - Allowed CORS origins (default: *)

**Application Layer** (`lib/lix_cache_api/application.ex`)
- Reads configuration from runtime.exs
- Starts Cachex with configurable item limit
- Starts Plug.Cowboy HTTP server on configurable port
- Uses OTP supervision tree for fault tolerance

**Router Layer** (`lib/lix_cache_api/router.ex`)
- Module name: `LixCacheApi.Router`
- Implements 10 HTTP endpoints using Plug.Router:
  - `POST /cache/set` - Store/update key-value with optional TTL
  - `GET /cache/get` - Retrieve value by key
  - `DELETE /cache/delete` - Remove key from cache
  - `POST /cache/incr` - Atomically increment a numeric value
  - `POST /cache/decr` - Atomically decrement a numeric value
  - `POST /cache/batch` - Execute multiple operations in one request
  - `POST /cache/clear` - Wipe entire cache
  - `GET /cache/scan` - Search keys by prefix, returns values
  - `GET /cache/stats` - Get cache statistics (size, limit, metrics)
  - `GET /health` - Health check endpoint
- Uses Cachex for in-memory storage
- CORS enabled for all origins

**Key Dependencies**
- `bandit` - HTTP server (replaced Cowboy for better performance)
- `jiffy` - Fast JSON encoding/decoding for API responses (Erlang NIF)
- `jason` - JSON encoding for structured logging
- `cachex` - In-memory cache with TTL support
- `cors_plug` - CORS middleware
- `logger_json` - Structured JSON logging
- `telemetry` - Event emission for monitoring
- `telemetry_metrics` - Metrics definitions

### TypeScript SDK Structure (`lix-cache-sdk/`)

**Core Files**
- `src/client.ts` - Main `LixCache` class with all 11 methods (set, get, delete, batch, scan, incr, decr, clear, stats, exists, collection)
- `src/collection.ts` - Type-safe `Collection` class with Zod validation
- `src/types.ts` - TypeScript type definitions for full type inference
- `src/errors.ts` - Custom error classes (LixNotFoundError, LixConnectionError, etc.)
- `src/http.ts` - HTTP client with retry logic, timeout handling, exponential backoff

**Key Features**
- Full TypeScript generics for automatic type inference
- Type-safe collections with Zod schema validation
- Automatic request deduplication (simultaneous requests for same key → 1 HTTP call)
- All API methods return strongly typed responses
- Custom error handling with helpful error messages
- Configurable base URL, timeout, and retry settings
- Works in both Node.js and browser environments

**Installation & Usage**
```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache({
  url: 'http://localhost:4000',  // Optional, defaults to localhost:4000
  timeout: 5000,                  // Optional, defaults to 5000ms
  retries: 3                      // Optional, defaults to 3
});

// Full type inference - no manual type annotations needed!
interface User { name: string; age: number; }
await cache.set('user:1', { name: 'Alice', age: 30 });
const user = await cache.get<User>('user:1');  // user is typed as User | null
```

**Type-Safe Collections (with Zod)**

Collections provide runtime validation + automatic TypeScript inference using Zod schemas:

```typescript
import { LixCache } from 'lix-cache-sdk';
import { z } from 'zod';

// Define a schema
const UserSchema = z.object({
  name: z.string(),
  age: z.number().min(0).max(150),
  email: z.string().email()
});

type User = z.infer<typeof UserSchema>;

// Create a type-safe collection
const users = cache.collection('user:', UserSchema);

// All operations are validated at runtime + fully typed!
await users.set('1', {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
}); // ✓ Valid

// This throws a Zod validation error
await users.set('2', {
  name: 'Bob',
  age: 200,  // ✗ Exceeds max age
  email: 'invalid'  // ✗ Not a valid email
});

// Type-safe retrieval
const user = await users.get('1');  // Type: User | null

// Scan returns validated, typed results
const result = await users.scan();  // Type: { items: {key: string, value: User}[], count: number }
```

**Collection Methods:**
- `set(id, value, options?)` - Set with validation (throws on invalid data)
- `get(id)` - Get with validation
- `delete(id)` - Delete item
- `exists(id)` - Check if item exists
- `scan()` - Get all items in collection (validated)
- `clear()` - Delete all items with this prefix

**Benefits:**
- **Runtime validation** - Catches invalid data before caching
- **Type inference** - No manual type annotations needed
- **Auto-prefixing** - No need to repeat "user:" everywhere
- **Helpful errors** - Zod provides detailed validation messages

**Dependencies:**
- Zod is a peer dependency (optional)
- Install with: `pnpm add zod`

**Request Deduplication (Automatic)**

The SDK automatically deduplicates simultaneous requests for the same key. This prevents redundant network calls when multiple parts of your application request the same data at the same time.

```typescript
// Multiple components request the same user simultaneously
const [user1, user2, user3] = await Promise.all([
  cache.get('user:123'),  // Makes HTTP request
  cache.get('user:123'),  // Waits for first request
  cache.get('user:123')   // Waits for first request
]);
// Only 1 HTTP request made! All 3 get the same result

// Works with Collections too
const users = cache.collection('user:', UserSchema);
const [profile1, profile2] = await Promise.all([
  users.get('123'),  // Makes HTTP request
  users.get('123')   // Uses same request
]);
```

**How it works:**
- Tracks in-flight requests by cache key
- Subsequent requests for same key wait for the first request
- Automatic cleanup after request completes
- Zero memory risk (only tracks active requests)
- Errors propagate to all waiting callers

**Benefits:**
- Reduces network calls in React re-render scenarios
- Prevents duplicate requests from concurrent code
- Works automatically without configuration
- No cache invalidation complexity

**Testing**
```bash
cd lix-cache-sdk
pnpm test              # Run test suite (requires API server running)
pnpm build             # Build the SDK
```

### Demo App Structure (`lix-cache-demo/`)

**Purpose**: React app demonstrating all SDK features with a polished UI

**Tech Stack**
- React 19 + TypeScript
- Vite for dev server and bundling
- Tailwind CSS (via CDN)
- Imports SDK via pnpm workspace: `"lix-cache-sdk": "workspace:*"`

**Running the Demo**
```bash
cd lix-cache-demo
pnpm install           # Install dependencies (first time only)
pnpm dev               # Start dev server at http://localhost:5173
```

**Important**: The demo requires both:
1. Elixir API server running on http://localhost:4000
2. Vite config defines `process.env` for browser compatibility (see vite.config.ts)

**Features Demonstrated**
- Basic Operations: Set, Get, Delete with TTL
- Type-Safe Collections: Zod validation with runtime type checking (try invalid emails!)
- Request Deduplication: Visual demo showing 10 simultaneous requests → 1 HTTP call
- Atomic Counters: Increment, Decrement
- Scan: Search by prefix with live results
- Batch Operations: Set 10,000 items at once
- Management: Cache stats and clear operations

## Monorepo Structure (pnpm Workspaces)

The project uses pnpm workspaces defined in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'lix-cache-sdk'
  - 'lix-cache-demo'
```

**Benefits**
- Demo app imports SDK directly without publishing to npm
- Changes to SDK are immediately available in demo (after rebuild)
- Shared dependency management across packages

**Workspace Commands**
```bash
pnpm install           # Install all workspace dependencies
pnpm -r build          # Build all packages (recursive)
pnpm --filter lix-cache-sdk test    # Run tests in specific package
```

## Development Commands

### Running the Server

**Recommended: Interactive shell (best for development)**
```bash
cd lix_cache_api
iex -S mix              # Start with interactive Elixir shell
```

Benefits:
- Hot code reloading with `recompile()`
- Inspect cache: `Cachex.keys(:cache)`, `Cachex.get(:cache, "key")`
- View all HTTP requests in real-time
- Easy debugging

**Alternative: Standard run**
```bash
cd lix_cache_api
mix run --no-halt       # Start server (Ctrl+C twice to stop)
```

**With custom configuration:**
```bash
LIX_CACHE_LIMIT=500000 PORT=8080 LOG_LEVEL=debug iex -S mix
```

### Testing
```bash
cd lix_cache_api
mix test              # Run all tests
mix test test/lix_cache_api_test.exs  # Run specific test file
mix test test/lix_cache_api_test.exs:5  # Run specific test by line number
```

### Code Quality
```bash
cd lix_cache_api
mix format            # Format code according to .formatter.exs
mix compile --warnings-as-errors  # Compile with strict warnings
```

### Dependency Management
```bash
cd lix_cache_api
mix deps.get          # Fetch dependencies
mix deps.update --all # Update all dependencies
mix deps.tree         # Show dependency tree
```

## Logging & Monitoring

Lix Cache includes production-ready structured logging with JSON output and Telemetry metrics for monitoring.

### Logging Configuration

**Environment Variables:**
- `LOG_LEVEL` - Set log verbosity (default: `info`)
  - `debug` - Verbose logging (all operations, auth success/failure, request details)
  - `info` - Standard logging (cache operations, HTTP requests)
  - `warn` - Warnings only (auth failures, slow operations)
  - `error` - Errors only (system failures, Cachex errors)

**Examples:**
```bash
# Development (verbose logging)
LOG_LEVEL=debug iex -S mix

# Production (standard logging)
LOG_LEVEL=info mix run --no-halt

# Minimal logging (warnings and errors only)
LOG_LEVEL=warn mix run --no-halt
```

### Log Format

All logs are output as **structured JSON** for easy parsing by log aggregators (Datadog, ELK, CloudWatch, Splunk).

**Example JSON log entry:**
```json
{
  "timestamp": "2025-10-14T12:34:56.789Z",
  "level": "info",
  "message": "cache_operation",
  "metadata": {
    "operation": "get",
    "key": "user:123",
    "hit": true,
    "duration_ms": 2.3,
    "request_id": "FxZ8y9Kq3mN1pL2"
  }
}
```

### What Gets Logged

**HTTP Requests** (via Plug.Telemetry):
- Request method, path, status code
- Request duration in milliseconds
- Unique request ID for tracing

**Cache Operations**:
- Operation type (get/set/delete/incr/decr/batch/scan/clear)
- Cache key (or prefix for scan)
- Cache hit/miss status (for GET operations)
- TTL values (for SET operations)
- Operation count (for batch operations)
- Duration in milliseconds

**Authentication Events**:
- Auth success (debug level)
- Auth failures (warn level)
- Failed attempt reason
- Request path and ID

**Performance Metrics**:
- All operations include `duration_ms` for performance monitoring
- Batch operations include operation count
- Scan operations include result count

### Telemetry Events

The API emits Telemetry events that can be consumed by monitoring tools:

**HTTP Events:**
- `[:lix_cache_api, :request, :start]`
- `[:lix_cache_api, :request, :stop]`
- `[:lix_cache_api, :request, :exception]`

**Cache Events:**
- `[:lix_cache_api, :cache, :get]` - includes `hit: true/false`
- `[:lix_cache_api, :cache, :set]` - includes `ttl`, `key`
- `[:lix_cache_api, :cache, :delete]`
- `[:lix_cache_api, :cache, :incr]` - includes `amount`
- `[:lix_cache_api, :cache, :decr]` - includes `amount`
- `[:lix_cache_api, :cache, :batch]` - includes `count`
- `[:lix_cache_api, :cache, :scan]` - includes `prefix`, `count`
- `[:lix_cache_api, :cache, :clear]` - includes `count`

**Auth Events:**
- `[:lix_cache_api, :auth, :success]`
- `[:lix_cache_api, :auth, :failure]`

### Integrating with Monitoring Tools

**Datadog:**
```elixir
# Add to mix.exs
{:telemetry_metrics_datadog, "~> 0.1"}

# Add to application.ex children
{TelemetryMetricsDatadog, metrics: LixCacheApi.Telemetry.metrics()}
```

**Prometheus:**
```elixir
# Add to mix.exs
{:telemetry_metrics_prometheus, "~> 1.0"}

# Add to application.ex children
{TelemetryMetricsPrometheus, metrics: LixCacheApi.Telemetry.metrics()}
```

**StatsD:**
```elixir
# Add to mix.exs
{:telemetry_metrics_statsd, "~> 0.6"}

# Add to application.ex children
{TelemetryMetricsStatsd, metrics: LixCacheApi.Telemetry.metrics()}
```

### Request Tracing

Every HTTP request gets a unique `request_id` via `Plug.RequestId`. This ID is:
- Included in all log entries
- Returned in the `x-request-id` response header
- Useful for tracing requests across distributed systems

**Using request IDs for debugging:**
```bash
# Filter logs by request ID
cat logs.json | jq 'select(.metadata.request_id == "FxZ8y9Kq3mN1pL2")'

# See all operations for a single request
grep "FxZ8y9Kq3mN1pL2" logs.json
```

### Performance Monitoring

All cache operations and HTTP requests include duration measurements:

**Identifying slow operations:**
```bash
# Find operations slower than 100ms
cat logs.json | jq 'select(.metadata.duration_ms > 100)'

# Calculate average duration by operation
cat logs.json | jq -r 'select(.message == "cache_operation") | "\(.metadata.operation) \(.metadata.duration_ms)"'
```

**Cache hit ratio:**
```bash
# Calculate hit rate
cat logs.json | jq -r 'select(.metadata.operation == "get") | .metadata.hit' | \
  awk '{sum+=$1; n++} END {print "Hit rate: " sum/n*100 "%"}'
```

### Troubleshooting

**No logs appearing:**
- Check `LOG_LEVEL` is not set to `error` (too restrictive)
- Ensure LoggerJSON backend is configured in `config/runtime.exs`
- Verify dependencies are installed: `mix deps.get`

**Logs not in JSON format:**
- Run `mix deps.get` to ensure `logger_json` is installed
- Check `config/runtime.exs` has `backends: [LoggerJSON]`

**Missing request_id in logs:**
- Ensure `Plug.RequestId` is in the plug pipeline (router.ex)
- Should appear before other plugs

## Security & Authentication

Lix Cache supports API key authentication and CORS origin whitelisting for production deployments.

### Authentication Configuration

**Environment Variables:**
- `LIX_AUTH_ENABLED` - Enable/disable authentication (default: `false`)
- `LIX_API_KEYS` - Comma-separated list of valid API keys
- `LIX_CORS_ORIGINS` - Comma-separated list of allowed origins (default: `*`)

**Development Setup (No Auth):**
```bash
# Auth disabled by default
iex -S mix

# Or explicitly disable
LIX_AUTH_ENABLED=false iex -S mix
```

**Production Setup (With Auth):**
```bash
# Generate a secure API key
openssl rand -hex 32

# Start with authentication
LIX_AUTH_ENABLED=true \
LIX_API_KEYS=your-secret-key-here \
LIX_CORS_ORIGINS=https://yourdomain.com \
iex -S mix
```

**Multi-Tenant Setup (Multiple API Keys):**
```bash
# Support multiple API keys for different teams/services
LIX_AUTH_ENABLED=true \
LIX_API_KEYS=team-a-key,team-b-key,service-x-key \
LIX_CORS_ORIGINS=https://team-a.com,https://team-b.com \
iex -S mix
```

### Using Authentication (SDK)

**TypeScript SDK with API Key:**
```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache({
  url: 'https://cache.example.com',
  apiKey: process.env.LIX_API_KEY  // Store securely in environment variable
});

// All operations automatically include Authorization header
await cache.set('user:1', { name: 'Alice' });
const user = await cache.get('user:1');
```

**Localhost (No API Key Needed):**
```typescript
// SDK automatically detects localhost - no warning
const cache = new LixCache({
  url: 'http://localhost:4000'
  // apiKey optional for localhost
});
```

**Security Warning:**
The SDK will warn you in the console if you connect to a remote server without an API key:
```
⚠️  Lix Cache: Connecting to remote server without API key.
If authentication is enabled on the server, requests will fail.
Pass apiKey in config: new LixCache({ apiKey: "..." })
```

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

### Security Best Practices

1. **Always use HTTPS in production** - API keys should never be sent over HTTP
2. **Store API keys in environment variables** - Never commit keys to git
3. **Restrict CORS origins** - Don't use `*` in production
4. **Rotate keys regularly** - Use multiple keys to enable zero-downtime rotation
5. **Use different keys per environment** - Separate dev/staging/prod keys

### Health Endpoint

The `/health` endpoint is **always public** (no authentication required) to allow load balancers and monitoring tools to check server status.

## API Endpoints

All endpoints use JSON and return JSON responses. Server runs on `http://localhost:4000` by default.

**Note:** When authentication is enabled, all endpoints except `/health` require an `Authorization: Bearer <api-key>` header.

### Basic Operations

**Set a value:**
```bash
# Without authentication
curl -X POST http://localhost:4000/cache/set \
  -H "Content-Type: application/json" \
  -d '{"key": "user:1", "value": {"name": "Alice"}, "ttl": 60}'

# With authentication
curl -X POST http://localhost:4000/cache/set \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"key": "user:1", "value": {"name": "Alice"}, "ttl": 60}'
```

**Get a value:**
```bash
# Without authentication
curl http://localhost:4000/cache/get?key=user:1

# With authentication
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:4000/cache/get?key=user:1
```

**Delete a value:**
```bash
# Without authentication
curl -X DELETE http://localhost:4000/cache/delete?key=user:1

# With authentication
curl -X DELETE \
  -H "Authorization: Bearer your-api-key" \
  http://localhost:4000/cache/delete?key=user:1
```

### Atomic Operations

**Increment (counters, analytics):**
```bash
curl -X POST http://localhost:4000/cache/incr \
  -H "Content-Type: application/json" \
  -d '{"key": "page:views", "amount": 1}'
→ {"value": 1}
```

**Decrement (credits, inventory):**
```bash
curl -X POST http://localhost:4000/cache/decr \
  -H "Content-Type: application/json" \
  -d '{"key": "user:credits", "amount": 5}'
→ {"value": 95}
```

### Batch Operations

**Execute multiple operations:**
```bash
curl -X POST http://localhost:4000/cache/batch \
  -H "Content-Type: application/json" \
  -d '{"operations": [
    {"op": "get", "key": "user:1"},
    {"op": "set", "key": "user:2", "value": {"name": "Bob"}, "ttl": 300}
  ]}'
```

### Search & Discovery

**Scan by prefix (get all users):**
```bash
curl "http://localhost:4000/cache/scan?prefix=user:"
→ {"items": [{"key": "user:1", "value": {...}}, ...], "count": 5}
```

**Keys only mode:**
```bash
curl "http://localhost:4000/cache/scan?prefix=user:&keys_only=true"
→ {"keys": ["user:1", "user:2", ...], "count": 5}
```

### Management

**Clear entire cache:**
```bash
curl -X POST http://localhost:4000/cache/clear
→ {"success": true, "cleared": 8}
```

**Get cache statistics:**
```bash
curl http://localhost:4000/cache/stats
→ {"size": 8, "limit": 100000, "stats": {...}}
```

**Health check:**
```bash
curl http://localhost:4000/health
→ {"status": "healthy"}
```

## Important Implementation Notes

### Configuration
All configuration is read at startup from `config/runtime.exs` via environment variables:

**Cache & Server:**
- `LIX_CACHE_LIMIT=500000` - Maximum cache items (default: 500,000)
- `PORT=8080` - HTTP server port (default: 4000)

**Authentication:**
- `LIX_AUTH_ENABLED=true` - Enable authentication (default: false)
- `LIX_API_KEYS=key1,key2` - Comma-separated API keys

**CORS:**
- `LIX_CORS_ORIGINS=https://app.com,https://admin.com` - Allowed origins (default: `*`)

### TTL Handling
- TTL is specified in seconds in the API
- Converted to milliseconds using `:timer.seconds(ttl)` before passing to Cachex
- If TTL is not provided or is 0, items persist indefinitely (no expiration)
- TTL is optional in both `/cache/set` and batch operations

### Atomic Operations (incr/decr)
- Use `Cachex.incr()` for atomic increment/decrement
- Prevents race conditions when multiple clients modify counters
- If key doesn't exist, starts from 0
- Can go negative with decrement
- Essential for: counters, rate limiting, inventory, voting

### Scan Endpoint
- Returns both keys and values by default for best DX (one network call)
- Use `?keys_only=true` for just key names (faster, less data)
- Empty prefix returns all cache items
- Results include `count` field for easy validation

### Error Handling
- Missing keys return 404 with `{"error": "not found"}`
- Cachex errors return 400 with `{"error": inspect(reason)}`
- Successful operations return 200 with appropriate response data

### Browser Compatibility (SDK)
- The SDK references `process.env.LIX_CACHE_URL` for configuration
- When using the SDK in browser environments (React, Vite, etc.), you must define `process.env` in your bundler config
- **Vite users**: Add to `vite.config.ts`:
  ```typescript
  export default defineConfig({
    plugins: [react()],
    define: {
      'process.env': {}  // Required for SDK to work in browser
    }
  })
  ```
- Without this, you'll get: `ReferenceError: process is not defined`

### Cachex Stats
- Stats are enabled in the Cachex configuration: `{Cachex, name: :cache, limit: cache_limit, stats: true}`
- This allows the `/cache/stats` endpoint to return detailed metrics
- Stats include hit/miss rates, eviction counts, and other performance data

## Design Decisions & Rationale

This section documents important architectural decisions and why certain features were implemented (or deliberately not implemented).

### Request Deduplication (Implemented)

**Decision:** Automatically deduplicate simultaneous requests for the same key at the SDK level.

**Why we built it:**
- Zero memory risk (only tracks in-flight requests, not responses)
- Solves real problem: React re-renders, concurrent requests from multiple components
- Simple implementation (~30 lines of code)
- Works everywhere (browser + Node.js)
- No cache invalidation complexity

**How it works:**
- SDK tracks in-flight requests by key in a Map
- Subsequent requests for same key wait for first request to complete
- Automatic cleanup after request completes
- Errors propagate to all waiting callers

**When it helps:**
- Multiple components requesting same data simultaneously
- React strict mode double-rendering
- Concurrent async operations

### Client-Side Caching (NOT Implemented)

**Decision:** Do NOT implement in-memory client-side caching in the SDK.

**Why we skipped it:**
- **Memory management risk:** Team had previous production issues with LRU cache causing Docker pod crashes
- **Architecture mismatch:** The backend (Elixir/Cachex) IS the cache. Adding client-side cache creates double-caching with unclear benefits
- **Complexity vs benefit:** Would need LRU eviction, size limits, memory estimation, cleanup intervals - significant complexity for ~2ms localhost savings
- **Cache invalidation is hard:** No way to invalidate client cache when server data changes
- **Not the value prop:** SDK's value is type safety and DX, not being a cache library

**When it might make sense in the future:**
- High-latency networks (cross-region, 100ms+ round trips)
- Mobile/cellular use cases (200-500ms latency)
- Clear user demand with specific use cases
- After measuring actual performance bottlenecks

**Alternatives that provide similar benefits:**
- Request deduplication (implemented) - prevents redundant requests
- React Query / TanStack Query - battle-tested cache for React apps
- HTTP cache headers (see Browser Caching below)

### Browser Caching via Cache-Control Headers (NOT Implemented)

**Decision:** Do NOT add `Cache-Control` headers to API responses (for now).

**Why we skipped it:**
- **Cache invalidation complexity:** No way to remotely bust browser cache. Items cached for 60s stay cached for 60s
- **Staleness risk:** Items without server TTL (cached "forever") need special handling
- **Version tracking overhead:** Best solution (versioned keys) adds complexity
- **Unclear benefit:** Without real production metrics, don't know if 10-300ms savings justify complexity
- **Can add later:** Backend changes are simple (~50 lines), can implement if users request it

**What we considered:**
1. **Simple max-age:** Just add `Cache-Control: max-age=60` - but what about items without TTL?
2. **Match server TTL:** Use Cachex TTL for browser cache - but "forever" items become permanently cached
3. **Conservative defaults:** Short TTLs (10-30s) for safety - reduces benefit
4. **ETags:** Always revalidate - still makes round trip, less benefit
5. **Version-based keys:** Change URL when data changes - adds complexity

**When to revisit:**
- Users report performance issues with cross-region latency
- Mobile app use cases emerge
- Have actual metrics showing network time is bottleneck
- Can implement per-request browser caching: `cache.get('user:1', { browserCache: 60 })`

### Design Philosophy

**Lessons learned:**
1. **Premature optimization is real:** Don't add complexity before knowing it's needed
2. **Memory management is risky:** Production issues are worse than slightly slower performance
3. **Simple wins are valuable:** Request deduplication gives 80% of benefit with 20% of complexity
4. **Backend is fast enough:** localhost or same-region = ~2-10ms, already acceptable
5. **Cache invalidation is hard:** Avoid it unless absolutely necessary
6. **YAGNI (You Ain't Gonna Need It):** Build what's needed now, add features based on real user demand

**What we focus on instead:**
- Exceptional type safety (Collections with Zod)
- Great developer experience (helpful errors, auto-completion)
- Simplicity and reliability (less code = fewer bugs)
- Features that differentiate (type-safe caching, not generic caching)

## Project Vision

The goal is to make caching feel native to TypeScript with:
- ✅ **Full type inference without manual annotations** (implemented via TypeScript generics)
- ✅ **Automatic request deduplication** (implemented - prevents redundant simultaneous requests)
- ✅ **Type-safe collections with Zod** (implemented - runtime validation + type inference)
- ✅ **Beautiful, helpful error messages** (implemented via custom error classes)
- ⏳ **Batch operations** (API endpoint exists, SDK uses it)
- 🔮 **React hooks** (future - wrapper around React Query recommended)
- 🔮 **Next.js middleware** (future - if demand emerges)
- 🔮 **Browser caching** (future - per-request opt-in if users need it)

**Current Focus:**
The TypeScript SDK prioritizes exceptional developer experience through type safety and simplicity. The Elixir backend handles high-performance caching (100k+ items, sub-10ms operations).

**Architecture Philosophy:**
- Backend = centralized, battle-tested cache (Cachex)
- SDK = thin, type-safe wrapper with smart client-side optimizations (deduplication)
- No double-caching or memory management complexity
- Features added based on user demand, not speculation

See `docs/IDEA.md` for complete product vision and business case.
