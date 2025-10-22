# Lix Cache Server

A high-performance caching server built with Elixir and Cachex. Provides a RESTful API for caching operations with automatic batching support.

## Features

- ✅ Fast in-memory caching with ETS
- ✅ RESTful HTTP API
- ✅ Batch operations for efficiency
- ✅ TTL support
- ✅ Atomic counters (increment/decrement)
- ✅ Key scanning and filtering
- ✅ Health checks
- ✅ CORS enabled
- ✅ Docker-ready

## Quick Start

### Option 1: Using Docker (Recommended)

The easiest way to run Lix Cache locally:

```bash
# Using docker-compose
docker-compose up

# Or using Docker directly
docker build -t lixcache/server .
docker run -p 4000:4000 lixcache/server
```

The server will be available at `http://localhost:4000`.

### Option 2: Using Elixir Directly

If you have Elixir installed:

```bash
# Install dependencies
mix deps.get

# Start the server
iex -S mix

# Or run in production mode
MIX_ENV=prod mix run --no-halt
```

## Configuration

Configure the server using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `4000` |
| `CACHE_LIMIT` | Maximum number of cache items | `100000` |
| `MIX_ENV` | Environment (dev/prod) | `dev` |

Example:

```bash
PORT=5000 CACHE_LIMIT=50000 docker-compose up
```

## API Endpoints

### Health Check
```
GET /health
```

### Set Value
```
POST /cache/set
Body: { "key": "user:1", "value": {...}, "ttl": 300 }
```

### Get Value
```
GET /cache/get?key=user:1
```

### Delete Value
```
DELETE /cache/delete?key=user:1
```

### Batch Operations
```
POST /cache/batch
Body: {
  "operations": [
    { "op": "get", "key": "user:1" },
    { "op": "set", "key": "user:2", "value": {...}, "ttl": 60 },
    { "op": "delete", "key": "user:3" }
  ]
}
```

### Increment/Decrement
```
POST /cache/incr
Body: { "key": "counter", "amount": 1 }

POST /cache/decr
Body: { "key": "counter", "amount": 1 }
```

### Scan Keys
```
GET /cache/scan?prefix=user:&keys_only=false
```

### Cache Stats
```
GET /cache/stats
```

### Clear Cache
```
POST /cache/clear
```

## Development

### Running Tests

```bash
mix test
```

### Code Formatting

```bash
mix format
```

## Docker Production Deployment

### Build and Push

```bash
# Build for production
docker build -t lixcache/server:v0.1.0 -t lixcache/server:latest .

# Push to Docker Hub
docker push lixcache/server:v0.1.0
docker push lixcache/server:latest
```

### Run in Production

```bash
docker run -d \
  --name lix-cache \
  -p 4000:4000 \
  -e PORT=4000 \
  -e CACHE_LIMIT=100000 \
  --restart unless-stopped \
  lixcache/server:latest
```

### Docker Compose Production

```yaml
version: '3.8'
services:
  lix-cache:
    image: lixcache/server:latest
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - CACHE_LIMIT=100000
    restart: unless-stopped
```

## Health Checks

The server includes a health check endpoint at `/health` that returns:

```json
{
  "status": "healthy"
}
```

Docker health check is configured to poll this endpoint every 30 seconds.

## Performance

- **Throughput**: Handles thousands of requests per second per core
- **Latency**: Sub-millisecond cache operations
- **Memory**: Configurable cache size limit
- **Concurrency**: Highly concurrent thanks to Elixir/Erlang

## Scaling

### Horizontal Scaling

Each instance maintains its own in-memory cache. For true distributed caching across multiple instances, consider:

1. Using a load balancer with sticky sessions
2. Implementing cache warming on startup
3. Using Redis/Memcached for shared state (future feature)

### Vertical Scaling

Increase memory limits and cache size:

```bash
docker run -d \
  -m 2g \
  -e CACHE_LIMIT=1000000 \
  lixcache/server:latest
```

## Monitoring

### Metrics Endpoint (Coming Soon)

```
GET /metrics
```

Will provide Prometheus-compatible metrics including:
- Request rates
- Cache hit/miss ratios
- Memory usage
- Response times

### Logging

Logs are written to stdout in structured format. Configure log aggregation with:
- Docker log drivers
- ELK stack
- Datadog
- CloudWatch

## Security

The current version is designed for internal use within trusted networks. Future versions will include:

- API key authentication
- Rate limiting
- TLS/HTTPS support
- Request signing

**For production use**, deploy behind a reverse proxy (nginx, Traefik) with TLS termination.

## Requirements

- **Runtime**: Elixir 1.18+ and Erlang 27+
- **Docker**: Docker 20.10+ (for containerized deployment)
- **Memory**: Minimum 256MB RAM (adjust based on cache size)

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [github.com/your-org/lix-cache](https://github.com/your-org/lix-cache)
- Documentation: See main repository README

## Contributing

Contributions welcome! Please read the contributing guidelines first.
