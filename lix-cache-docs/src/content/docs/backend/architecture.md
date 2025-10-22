---
title: Backend Architecture
description: How Lix Cache's Elixir backend works
---

Lix Cache's backend is built with Elixir for high performance and reliability. It's remarkably simple - about 200 lines of code handle 100k+ operations per second.

## Technology Stack

### Core Technologies

- **Elixir** - Functional language built on Erlang VM (BEAM)
- **Bandit** - Pure Elixir HTTP/1.1 server (1.5-4x faster than Cowboy)
- **Cachex** - High-performance in-memory cache with TTL support
- **jiffy** - C-based JSON encoder/decoder (NIF)
- **Plug** - Composable web application specification

### Why These Technologies?

**Elixir**
- Built for concurrency (millions of lightweight processes)
- Fault-tolerant (OTP supervision trees)
- Low latency (microsecond process scheduling)
- Hot code reloading

**Bandit**
- Pure Elixir HTTP server (no C dependencies)
- Uses Thousand Island connection pooling
- 100 acceptors for high connection throughput
- Optimized for low-latency responses

**Cachex**
- LRU eviction with configurable limits
- TTL support (millisecond precision)
- Atomic operations (incr, decr)
- Statistics and metrics
- Battle-tested in production

**jiffy**
- 2-10x faster than pure Elixir JSON libraries
- C-based NIF (Native Implemented Function)
- Minimal memory allocation
- Used by Cloudflare, Discord, etc.

## Architecture Layers

### 1. Application Layer

**File:** `lib/lix_cache_api/application.ex`

Responsible for:
- Reading environment configuration
- Starting Cachex with configured limits
- Starting Bandit HTTP server
- Supervising all processes

```elixir
defmodule LixCacheApi.Application do
  use Application

  def start(_type, _args) do
    # Read config
    cache_limit = Application.get_env(:lix_cache_api, :cache_limit)
    port = Application.get_env(:lix_cache_api, :port)

    children = [
      # Start cache with limit
      {Cachex, name: :cache, limit: cache_limit, stats: true},

      # Start HTTP server with 100 acceptors
      {Bandit,
        scheme: :http,
        plug: LixCacheApi.Router,
        port: port,
        thousand_island_options: [num_acceptors: 100]
      }
    ]

    opts = [strategy: :one_for_one, name: LixCacheApi.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
```

**Key details:**
- `:one_for_one` strategy: If one child crashes, restart only that child
- Cachex and Bandit run as separate supervised processes
- 100 acceptors = 100 processes accepting connections simultaneously

### 2. Router Layer

**File:** `lib/lix_cache_api/router.ex`

Handles HTTP routing and business logic:

```elixir
defmodule LixCacheApi.Router do
  use Plug.Router
  use Plug.ErrorHandler

  plug CORSPlug  # Enable CORS for all origins
  plug :match
  plug :dispatch

  # 10 endpoints total
  get "/health", do: send_resp(conn, 200, :jiffy.encode(%{status: "healthy"}))
  post "/cache/set", do: handle_set(conn)
  get "/cache/get", do: handle_get(conn)
  # ... 7 more endpoints
end
```

**Request flow:**
1. Client sends HTTP request
2. Bandit accepts connection
3. CORSPlug adds CORS headers
4. Router matches URL pattern
5. Handler function processes request
6. Cachex performs cache operation
7. Response encoded with jiffy
8. HTTP response sent back

### 3. Cache Layer

**Cachex** provides the actual caching:

```elixir
# Set with TTL
Cachex.put(:cache, key, value, ttl: :timer.seconds(60))

# Get
{:ok, value} = Cachex.get(:cache, key)

# Atomic increment
{:ok, new_value} = Cachex.incr(:cache, key, 1)

# Delete
Cachex.del(:cache, key)

# Scan by prefix
Cachex.stream(:cache, of: :key)
|> Stream.filter(&String.starts_with?(&1, prefix))
|> Enum.to_list()
```

## Request Processing

### Example: Set Operation

```elixir
def handle_set(conn) do
  # 1. Parse JSON body (jiffy)
  {:ok, body, conn} = Plug.Conn.read_body(conn)
  params = :jiffy.decode(body, [:return_maps])

  # 2. Extract params
  key = params["key"]
  value = params["value"]
  ttl = params["ttl"]

  # 3. Store in Cachex
  opts = if ttl > 0, do: [ttl: :timer.seconds(ttl)], else: []
  Cachex.put(:cache, key, value, opts)

  # 4. Send response
  send_resp(conn, 200, :jiffy.encode(%{success: true}))
end
```

**Performance:**
- JSON parsing: ~0.1ms (jiffy)
- Cachex write: ~0.001-0.01ms
- Response encoding: ~0.1ms
- **Total: ~0.2-0.3ms per request**

### Example: Batch Operation

```elixir
def handle_batch(conn) do
  {:ok, body, conn} = Plug.Conn.read_body(conn)
  %{"operations" => operations} = :jiffy.decode(body, [:return_maps])

  # Process all operations
  results = Enum.map(operations, fn op ->
    case op["op"] do
      "get" ->
        {:ok, value} = Cachex.get(:cache, op["key"])
        %{key: op["key"], value: value}

      "set" ->
        Cachex.put(:cache, op["key"], op["value"])
        %{success: true}

      # ... handle other operations
    end
  end)

  send_resp(conn, 200, :jiffy.encode(%{results: results}))
end
```

## Configuration

### Environment Variables

Defined in `config/runtime.exs`:

```elixir
config :lix_cache_api,
  cache_limit: System.get_env("LIX_CACHE_LIMIT", "100000") |> String.to_integer(),
  port: System.get_env("PORT", "4000") |> String.to_integer()
```

**Configuration options:**
- `LIX_CACHE_LIMIT` - Maximum cache items (default: 100,000)
- `PORT` - HTTP server port (default: 4000)

**Start with custom config:**
```bash
LIX_CACHE_LIMIT=500000 PORT=8080 mix run --no-halt
```

### Cachex Configuration

```elixir
{Cachex,
  name: :cache,           # Process name
  limit: cache_limit,     # Max items (LRU eviction)
  stats: true             # Enable statistics
}
```

**Features enabled:**
- LRU eviction when limit reached
- TTL support (millisecond precision)
- Atomic operations
- Statistics tracking

### Bandit Configuration

```elixir
{Bandit,
  scheme: :http,                        # HTTP/1.1
  plug: LixCacheApi.Router,             # Router module
  port: port,                           # Port number
  thousand_island_options: [
    num_acceptors: 100                  # Connection pool size
  ]
}
```

**100 acceptors** means 100 processes ready to accept new connections simultaneously, enabling high throughput.

## Performance Characteristics

### Throughput

- **Single operation:** 0.2-0.3ms
- **Batch operations:** 0.5-2ms (depends on batch size)
- **Sustained load:** 100k+ ops/sec
- **Concurrent connections:** 10,000+

### Memory Usage

- **Base:** ~30-50 MB (Elixir VM + Cachex)
- **Per item:** ~1-2 KB (depends on value size)
- **100k items:** ~150-250 MB total

### Latency Distribution

```
p50: 0.2ms
p95: 0.5ms
p99: 1.5ms
p99.9: 5ms
```

## Fault Tolerance

### Supervision Tree

```
Application.Supervisor (one_for_one)
├── Cachex (:cache)
└── Bandit (HTTP server)
```

**Restart strategies:**
- Cachex crashes → Restart Cachex, lose all cache data
- Bandit crashes → Restart Bandit, existing connections drop
- Application crashes → Restart everything

**In practice:**
- Cachex is extremely stable (no crashes in production)
- Bandit handles errors gracefully (bad requests don't crash server)
- OTP supervisor ensures automatic recovery

### Error Handling

```elixir
use Plug.ErrorHandler

def handle_errors(conn, %{kind: kind, reason: reason, stack: stack}) do
  # Log error
  IO.inspect({kind, reason, stack})

  # Return 500
  send_resp(conn, 500, :jiffy.encode(%{error: "Internal server error"}))
end
```

**Error behavior:**
- Bad JSON → 400 Bad Request
- Missing key → 404 Not Found
- Cachex error → 400 with error details
- Unhandled exception → 500 Internal Server Error

## Monitoring

### Health Check

```elixir
get "/health" do
  send_resp(conn, 200, :jiffy.encode(%{status: "healthy"}))
end
```

**Use for:**
- Docker health checks
- Load balancer health probes
- Uptime monitoring

### Cache Statistics

```elixir
get "/cache/stats" do
  {:ok, size} = Cachex.size(:cache)
  {:ok, stats} = Cachex.stats(:cache)

  send_resp(conn, 200, :jiffy.encode(%{
    size: size,
    limit: cache_limit,
    stats: stats
  }))
end
```

**Returns:**
- Current item count
- Cache limit
- Hit/miss rates
- Eviction count
- Operation counts

## Production Deployment

### Docker

```dockerfile
FROM elixir:1.17-alpine

WORKDIR /app
COPY . .

RUN mix local.hex --force && \
    mix local.rebar --force && \
    mix deps.get && \
    mix compile

ENV PORT=4000
ENV LIX_CACHE_LIMIT=100000

CMD ["mix", "run", "--no-halt"]
```

### Kubernetes

```yaml
apiVersion: v1
kind: Service
metadata:
  name: lix-cache
spec:
  ports:
    - port: 4000
  selector:
    app: lix-cache
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lix-cache
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: lix-cache
          image: lix-cache:latest
          ports:
            - containerPort: 4000
          env:
            - name: LIX_CACHE_LIMIT
              value: "500000"
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
```

### Fly.io

```toml
app = "lix-cache"

[env]
  LIX_CACHE_LIMIT = "500000"

[[services]]
  http_checks = []
  internal_port = 4000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]
```

## Scaling

### Vertical Scaling

**Single server can handle:**
- 100k ops/sec
- 10k concurrent connections
- 1M cache items

**Increase limits:**
```bash
LIX_CACHE_LIMIT=5000000 mix run --no-halt
```

### Horizontal Scaling

**Multiple servers:**
- Each server has independent cache
- Use consistent hashing in client
- Or use load balancer (round-robin)

**Trade-offs:**
- No shared state between servers
- Cache hit rate decreases (each server has subset)
- But: Linear scalability (2x servers = 2x throughput)

## Next Steps

- [API Endpoints](/backend/endpoints/) - Detailed endpoint reference
- [Deployment Guide](/backend/deployment/) - Deploy to production
- [Configuration](/getting-started/configuration/) - Configure server and client
