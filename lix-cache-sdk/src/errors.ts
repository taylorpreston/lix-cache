/**
 * Base error class for all Lix Cache errors
 */
export class LixCacheError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LixCacheError';
    Object.setPrototypeOf(this, LixCacheError.prototype);
  }
}

/**
 * Error thrown when there's a network or connection issue
 */
export class LixConnectionError extends LixCacheError {
  constructor(url: string, cause?: unknown) {
    const message = `Failed to connect to Lix Cache server at ${url}.

Possible causes:
  • The cache server is not running
  • The URL is incorrect
  • Network connectivity issues

To fix:
  • Start the server: cd lix_cache_api && iex -S mix
  • Check the URL in your config (default: http://localhost:4000)
  • Verify network connectivity`;

    super(message, cause);
    this.name = 'LixConnectionError';
    Object.setPrototypeOf(this, LixConnectionError.prototype);
  }
}

/**
 * Error thrown when a key is not found in the cache
 */
export class LixNotFoundError extends LixCacheError {
  constructor(public readonly key: string) {
    const message = `Key "${key}" not found in cache.

The key either:
  • Never existed
  • Has expired (TTL reached)
  • Was deleted

Tip: Use optional chaining or check for null:
  const value = await lix.get('${key}');
  if (value) {
    // value exists
  }`;

    super(message);
    this.name = 'LixNotFoundError';
    Object.setPrototypeOf(this, LixNotFoundError.prototype);
  }
}

/**
 * Error thrown when trying to increment/decrement a non-numeric value
 */
export class LixTypeError extends LixCacheError {
  constructor(public readonly key: string, public readonly operation: 'incr' | 'decr') {
    const message = `Cannot ${operation === 'incr' ? 'increment' : 'decrement'} key "${key}" because it contains a non-numeric value.

The incr() and decr() methods only work with numeric values (numbers).

Current value type: ${operation === 'incr' ? 'increment' : 'decrement'} requires a number

To fix:
  • Use a different key for counters (e.g., "${key}:count")
  • Or set a numeric value first: await lix.set('${key}', 0)

Example:
  // Separate keys for different data types
  await lix.set('user:1', { name: 'Alice' });     // Object
  await lix.incr('user:1:login_count');           // Counter`;

    super(message);
    this.name = 'LixTypeError';
    Object.setPrototypeOf(this, LixTypeError.prototype);
  }
}

/**
 * Error thrown when the server returns an unexpected error
 */
export class LixServerError extends LixCacheError {
  constructor(
    public readonly statusCode: number,
    public readonly response: unknown
  ) {
    const message = `Server error (${statusCode}): ${JSON.stringify(response)}

The cache server returned an error response.

If this persists:
  • Check server logs for details
  • Verify the server is running correctly
  • Report this issue if it seems like a bug`;

    super(message);
    this.name = 'LixServerError';
    Object.setPrototypeOf(this, LixServerError.prototype);
  }
}

/**
 * Error thrown when a request times out
 */
export class LixTimeoutError extends LixCacheError {
  constructor(public readonly timeoutMs: number) {
    const message = `Request timed out after ${timeoutMs}ms.

The cache server took too long to respond.

To fix:
  • Increase timeout: new LixCache({ timeout: ${timeoutMs * 2} })
  • Check server performance
  • Verify network conditions`;

    super(message);
    this.name = 'LixTimeoutError';
    Object.setPrototypeOf(this, LixTimeoutError.prototype);
  }
}

/**
 * Error thrown when authentication fails
 */
export class LixAuthError extends LixCacheError {
  constructor() {
    const message = `Authentication failed: Invalid or missing API key.

The cache server requires authentication but the provided API key is invalid or missing.

To fix:
  • Ensure LIX_AUTH_ENABLED=true and LIX_API_KEYS is set on the server
  • Pass the correct API key to the client:

    const cache = new LixCache({
      url: 'http://localhost:4000',
      apiKey: 'your-api-key'
    });

  • Verify the API key matches one of the server's configured keys
  • Check that the server is configured correctly

Generate a secure API key with:
  openssl rand -hex 32`;

    super(message);
    this.name = 'LixAuthError';
    Object.setPrototypeOf(this, LixAuthError.prototype);
  }
}
