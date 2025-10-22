# lix-cache-server

> Zero-config development server for Lix Cache

The easiest way to run Lix Cache locally. Perfect for development and testing.

## Quick Start

No installation required! Just run:

```bash
npx lix-cache-server
```

That's it! The server starts on `http://localhost:4000` and is ready to use.

## Usage

### Start the server

```bash
npx lix-cache-server
```

### Use a different port

```bash
LIX_CACHE_PORT=5000 npx lix-cache-server
```

### Stop the server

Press `Ctrl+C` in the terminal where the server is running.

## What it does

When you run `npx lix-cache-server`, it:

1. ✅ Checks if Docker is installed
2. ✅ Pulls the latest Lix Cache Docker image (if needed)
3. ✅ Starts the server on port 4000 (or your custom port)
4. ✅ Handles graceful shutdown on Ctrl+C

## Requirements

- **Docker**: Docker Desktop or Docker Engine must be installed and running
  - Download: https://docs.docker.com/get-docker/

That's it! No Elixir, no Erlang, no other dependencies.

## Use with lix-cache-sdk

Once the server is running, use it with the TypeScript SDK:

```typescript
import { LixCache } from 'lix-cache-sdk';

const lix = new LixCache(); // Defaults to http://localhost:4000

await lix.set('user:1', { name: 'Alice', age: 30 });
const user = await lix.get('user:1');
```

## Configuration

Configure using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `LIX_CACHE_PORT` | Port to expose | `4000` |

## API Endpoints

Once running, the server provides:

- `GET /health` - Health check
- `POST /cache/set` - Set value
- `GET /cache/get` - Get value
- `DELETE /cache/delete` - Delete value
- `POST /cache/batch` - Batch operations
- `POST /cache/incr` - Increment counter
- `POST /cache/decr` - Decrement counter
- `GET /cache/scan` - Scan keys
- `GET /cache/stats` - Cache statistics
- `POST /cache/clear` - Clear cache

See the [main documentation](https://github.com/your-org/lix-cache) for API details.

## Troubleshooting

### "Docker is not installed or not running"

Make sure Docker is installed and running:
```bash
docker --version
```

If not installed, download from https://docs.docker.com/get-docker/

### "Failed to pull image"

If you're developing locally, you may need to build the image first:

```bash
cd lix_cache_api
docker build -t lixcache/server:latest .
```

### Port already in use

If port 4000 is already in use:

```bash
LIX_CACHE_PORT=5000 npx lix-cache-server
```

Then configure your SDK:
```typescript
const lix = new LixCache({ url: 'http://localhost:5000' });
```

### Container doesn't stop

If the container doesn't stop cleanly:

```bash
docker stop lix-cache-dev
docker rm lix-cache-dev
```

## Alternative: Run without Docker

If you prefer to run the Elixir backend directly (requires Elixir 1.18+):

```bash
cd lix_cache_api
mix deps.get
iex -S mix
```

## Development

This package is part of the Lix Cache monorepo. To contribute:

1. Clone the repository
2. Make your changes to `lix-cache-server/`
3. Test locally: `node bin/lix-cache-server.js`
4. Submit a pull request

## Links

- **Main Repository**: https://github.com/your-org/lix-cache
- **SDK Documentation**: https://github.com/your-org/lix-cache/tree/main/lix-cache-sdk
- **API Documentation**: https://github.com/your-org/lix-cache/tree/main/lix_cache_api

## License

MIT

## Support

For issues and questions:
- GitHub Issues: https://github.com/your-org/lix-cache/issues
- Documentation: https://github.com/your-org/lix-cache#readme
