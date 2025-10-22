---
title: API Endpoints
description: Complete HTTP API reference for Lix Cache
---

Lix Cache provides a simple HTTP API for cache operations. All endpoints use JSON for request and response bodies.

**Base URL:** `http://localhost:4000`

## Endpoints Overview

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/cache/set` | Store a value with optional TTL |
| GET | `/cache/get` | Retrieve a value by key |
| DELETE | `/cache/delete` | Remove a key from cache |
| POST | `/cache/incr` | Atomically increment a number |
| POST | `/cache/decr` | Atomically decrement a number |
| POST | `/cache/batch` | Execute multiple operations |
| GET | `/cache/scan` | Search keys by prefix |
| POST | `/cache/clear` | Clear entire cache |
| GET | `/cache/stats` | Get cache statistics |
| GET | `/health` | Health check |

## Set Value

Store a value in the cache with optional TTL.

**Endpoint:** `POST /cache/set`

**Request Body:**
```json
{
  "key": "user:123",
  "value": {"name": "Alice", "age": 30},
  "ttl": 300
}
```

**Parameters:**
- `key` (string, required) - Cache key
- `value` (any, required) - Value to store (any JSON-serializable type)
- `ttl` (number, optional) - Time-to-live in seconds (0 or omit for no expiration)

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid request (missing key/value)

**Examples:**

```bash
# Set with TTL
curl -X POST http://localhost:4000/cache/set \
  -H "Content-Type: application/json" \
  -d '{"key": "user:1", "value": {"name": "Alice"}, "ttl": 60}'

# Set without TTL (permanent)
curl -X POST http://localhost:4000/cache/set \
  -H "Content-Type: application/json" \
  -d '{"key": "config", "value": {"theme": "dark"}}'

# Set string value
curl -X POST http://localhost:4000/cache/set \
  -H "Content-Type: application/json" \
  -d '{"key": "message", "value": "Hello World", "ttl": 300}'

# Set array value
curl -X POST http://localhost:4000/cache/set \
  -H "Content-Type: application/json" \
  -d '{"key": "tags", "value": ["elixir", "cache", "api"]}'
```

## Get Value

Retrieve a value from the cache.

**Endpoint:** `GET /cache/get?key={key}`

**Query Parameters:**
- `key` (string, required) - Cache key to retrieve

**Response (found):**
```json
{
  "value": {"name": "Alice", "age": 30}
}
```

**Response (not found):**
```json
{
  "error": "not found"
}
```

**Status Codes:**
- `200` - Key found
- `404` - Key not found or expired

**Examples:**

```bash
# Get existing key
curl "http://localhost:4000/cache/get?key=user:1"
→ {"value": {"name": "Alice"}}

# Get missing key
curl "http://localhost:4000/cache/get?key=missing"
→ {"error": "not found"}

# Get expired key
curl "http://localhost:4000/cache/get?key=expired"
→ {"error": "not found"}
```

## Delete Value

Remove a key from the cache.

**Endpoint:** `DELETE /cache/delete?key={key}`

**Query Parameters:**
- `key` (string, required) - Cache key to delete

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200` - Always returns success (even if key didn't exist)

**Examples:**

```bash
# Delete existing key
curl -X DELETE "http://localhost:4000/cache/delete?key=user:1"
→ {"success": true}

# Delete non-existent key (still succeeds)
curl -X DELETE "http://localhost:4000/cache/delete?key=missing"
→ {"success": true}
```

## Increment Value

Atomically increment a numeric value. Creates the key if it doesn't exist (starts at 0).

**Endpoint:** `POST /cache/incr`

**Request Body:**
```json
{
  "key": "counter:views",
  "amount": 1
}
```

**Parameters:**
- `key` (string, required) - Cache key
- `amount` (number, optional) - Amount to increment (default: 1)

**Response:**
```json
{
  "value": 42
}
```

**Status Codes:**
- `200` - Success, returns new value
- `400` - Invalid request or non-numeric value

**Examples:**

```bash
# Increment by 1 (default)
curl -X POST http://localhost:4000/cache/incr \
  -H "Content-Type: application/json" \
  -d '{"key": "page:views"}'
→ {"value": 1}

# Increment by 5
curl -X POST http://localhost:4000/cache/incr \
  -H "Content-Type: application/json" \
  -d '{"key": "page:views", "amount": 5}'
→ {"value": 6}

# Increment creates key if missing
curl -X POST http://localhost:4000/cache/incr \
  -H "Content-Type: application/json" \
  -d '{"key": "new:counter", "amount": 10}'
→ {"value": 10}
```

## Decrement Value

Atomically decrement a numeric value. Creates the key if it doesn't exist (starts at 0).

**Endpoint:** `POST /cache/decr`

**Request Body:**
```json
{
  "key": "inventory:stock",
  "amount": 1
}
```

**Parameters:**
- `key` (string, required) - Cache key
- `amount` (number, optional) - Amount to decrement (default: 1)

**Response:**
```json
{
  "value": 99
}
```

**Status Codes:**
- `200` - Success, returns new value
- `400` - Invalid request or non-numeric value

**Note:** Can go negative!

**Examples:**

```bash
# Decrement by 1 (default)
curl -X POST http://localhost:4000/cache/decr \
  -H "Content-Type: application/json" \
  -d '{"key": "credits:user:1"}'
→ {"value": -1}

# Decrement by 10
curl -X POST http://localhost:4000/cache/decr \
  -H "Content-Type: application/json" \
  -d '{"key": "inventory:widget", "amount": 10}'
→ {"value": 90}
```

## Batch Operations

Execute multiple cache operations in a single request.

**Endpoint:** `POST /cache/batch`

**Request Body:**
```json
{
  "operations": [
    {"op": "get", "key": "user:1"},
    {"op": "set", "key": "user:2", "value": {"name": "Bob"}, "ttl": 300},
    {"op": "delete", "key": "old:key"},
    {"op": "incr", "key": "counter", "amount": 5}
  ]
}
```

**Operation Types:**
- `get` - Get value by key
- `set` - Set value with optional TTL
- `delete` - Delete key
- `incr` - Increment value
- `decr` - Decrement value

**Response:**
```json
{
  "results": [
    {"key": "user:1", "value": {"name": "Alice"}},
    {"success": true},
    {"success": true},
    {"value": 5}
  ]
}
```

**Status Codes:**
- `200` - Success (includes results for all operations)
- `400` - Invalid batch format

**Examples:**

```bash
# Mixed operations
curl -X POST http://localhost:4000/cache/batch \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {"op": "set", "key": "user:1", "value": {"name": "Alice"}},
      {"op": "set", "key": "user:2", "value": {"name": "Bob"}},
      {"op": "get", "key": "user:1"},
      {"op": "incr", "key": "users:count"}
    ]
  }'
→ {
    "results": [
      {"success": true},
      {"success": true},
      {"key": "user:1", "value": {"name": "Alice"}},
      {"value": 1}
    ]
  }

# Bulk insert
curl -X POST http://localhost:4000/cache/batch \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {"op": "set", "key": "item:1", "value": "A", "ttl": 60},
      {"op": "set", "key": "item:2", "value": "B", "ttl": 60},
      {"op": "set", "key": "item:3", "value": "C", "ttl": 60}
    ]
  }'
```

## Scan Keys

Search for keys by prefix and optionally retrieve their values.

**Endpoint:** `GET /cache/scan?prefix={prefix}&keys_only={true|false}`

**Query Parameters:**
- `prefix` (string, optional) - Key prefix to filter (empty = all keys)
- `keys_only` (boolean, optional) - Return only keys, not values (default: false)

**Response (with values):**
```json
{
  "items": [
    {"key": "user:1", "value": {"name": "Alice"}},
    {"key": "user:2", "value": {"name": "Bob"}}
  ],
  "count": 2
}
```

**Response (keys only):**
```json
{
  "keys": ["user:1", "user:2", "user:3"],
  "count": 3
}
```

**Status Codes:**
- `200` - Success (empty array if no matches)

**Examples:**

```bash
# Get all users (with values)
curl "http://localhost:4000/cache/scan?prefix=user:"
→ {
    "items": [
      {"key": "user:1", "value": {"name": "Alice"}},
      {"key": "user:2", "value": {"name": "Bob"}}
    ],
    "count": 2
  }

# Get user keys only (faster, less data)
curl "http://localhost:4000/cache/scan?prefix=user:&keys_only=true"
→ {
    "keys": ["user:1", "user:2", "user:3"],
    "count": 3
  }

# Get all keys in cache
curl "http://localhost:4000/cache/scan"
→ {
    "items": [
      {"key": "user:1", "value": {...}},
      {"key": "config", "value": {...}},
      {"key": "counter", "value": 42}
    ],
    "count": 3
  }

# No matches
curl "http://localhost:4000/cache/scan?prefix=missing:"
→ {"items": [], "count": 0}
```

## Clear Cache

Delete all items from the cache.

**Endpoint:** `POST /cache/clear`

**Request Body:** None

**Response:**
```json
{
  "success": true,
  "cleared": 8
}
```

**Parameters:**
- `cleared` (number) - Number of items removed

**Status Codes:**
- `200` - Success

**Examples:**

```bash
# Clear entire cache
curl -X POST http://localhost:4000/cache/clear
→ {"success": true, "cleared": 1234}

# Clear empty cache
curl -X POST http://localhost:4000/cache/clear
→ {"success": true, "cleared": 0}
```

**Warning:** This operation is immediate and irreversible!

## Cache Statistics

Get cache size, limit, and performance metrics.

**Endpoint:** `GET /cache/stats`

**Response:**
```json
{
  "size": 8,
  "limit": 100000,
  "stats": {
    "hits": 1523,
    "misses": 234,
    "evictions": 12,
    "expirations": 45,
    "operations": 1800
  }
}
```

**Response Fields:**
- `size` - Current number of items in cache
- `limit` - Maximum items before LRU eviction
- `stats.hits` - Cache hits
- `stats.misses` - Cache misses
- `stats.evictions` - Items removed due to size limit
- `stats.expirations` - Items removed due to TTL expiration
- `stats.operations` - Total operations performed

**Status Codes:**
- `200` - Success

**Examples:**

```bash
# Get statistics
curl http://localhost:4000/cache/stats
→ {
    "size": 8,
    "limit": 100000,
    "stats": {
      "hits": 1523,
      "misses": 234,
      "evictions": 0,
      "expirations": 45,
      "operations": 1800
    }
  }

# Calculate hit rate
# Hit rate = hits / (hits + misses)
# 1523 / (1523 + 234) = 86.7%
```

## Health Check

Check if the server is running and healthy.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy"
}
```

**Status Codes:**
- `200` - Server is healthy
- No response - Server is down

**Examples:**

```bash
# Health check
curl http://localhost:4000/health
→ {"status": "healthy"}

# Use in Docker health check
HEALTHCHECK CMD curl -f http://localhost:4000/health || exit 1

# Use in Kubernetes probe
livenessProbe:
  httpGet:
    path: /health
    port: 4000
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Error Responses

### 400 Bad Request

Invalid request format or parameters.

```json
{
  "error": "Missing required parameter: key"
}
```

### 404 Not Found

Key not found or expired.

```json
{
  "error": "not found"
}
```

### 500 Internal Server Error

Unexpected server error.

```json
{
  "error": "Internal server error"
}
```

## CORS

All endpoints support CORS with the following headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

This allows browser-based applications to make requests directly.

## Rate Limiting

**Currently:** No built-in rate limiting.

**Recommendation:** Use a reverse proxy (nginx, Caddy) or API gateway for rate limiting in production.

Example nginx config:
```nginx
limit_req_zone $binary_remote_addr zone=cache:10m rate=100r/s;

server {
  location / {
    limit_req zone=cache burst=20;
    proxy_pass http://localhost:4000;
  }
}
```

## Performance

**Typical latencies:**
- Single operation: 0.2-0.3ms
- Batch (10 ops): 0.5-1ms
- Batch (100 ops): 1-3ms
- Scan (1000 keys): 2-10ms

**Throughput:**
- 100k+ ops/sec sustained
- 10k+ concurrent connections

## Next Steps

- [Backend Architecture](/backend/architecture/) - Understand how the server works
- [Deployment Guide](/backend/deployment/) - Deploy to production
- [TypeScript SDK](/getting-started/quick-start/) - Use the type-safe SDK instead of raw HTTP
