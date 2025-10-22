/**
 * Configuration options for the Lix Cache client
 */
export interface LixCacheConfig {
  /**
   * Base URL of the Lix Cache server
   * @default 'http://localhost:4000'
   */
  url?: string;

  /**
   * API key for authentication
   * Required if the server has LIX_AUTH_ENABLED=true
   * @default undefined
   */
  apiKey?: string;

  /**
   * Request timeout in milliseconds
   * @default 5000
   */
  timeout?: number;

  /**
   * Enable request batching
   * @default true
   */
  batching?: boolean;

  /**
   * Batching window in milliseconds
   * @default 10
   */
  batchWindow?: number;

  /**
   * Enable client-side caching
   * @default false
   */
  localCache?: boolean;

  /**
   * Local cache TTL in seconds
   * @default 60
   */
  localCacheTTL?: number;

  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial retry delay in milliseconds
   * @default 100
   */
  retryDelay?: number;
}

/**
 * Options for set operations
 */
export interface SetOptions {
  /**
   * Time to live in seconds (0 = no expiration)
   */
  ttl?: number;
}

/**
 * Options for remember operations
 */
export interface RememberOptions {
  /**
   * Time to live in seconds (0 = no expiration)
   */
  ttl?: number;
}

/**
 * Options for rememberAll operations
 */
export interface RememberAllOptions<T> {
  /**
   * Function to extract the cache key from each item
   * @example (user) => user.id
   */
  getKey: (item: T) => string;

  /**
   * Time to live in seconds for individual cached items (0 = no expiration)
   */
  ttl?: number;

  /**
   * Optional: Time to live in seconds for the list marker
   * When set, enables smart caching - list is only fetched when marker expires
   * When omitted, list is always fetched from the fallback function
   */
  listTTL?: number;
}

/**
 * Result from a rememberAll operation
 */
export interface RememberAllResult<T> {
  /**
   * Array of all items
   */
  items: T[];

  /**
   * O(1) lookup function to get an item by key
   * @param key - The key to lookup
   * @returns The item if found, undefined otherwise
   */
  getBy: (key: string) => T | undefined;
}

/**
 * Options for scan operations
 */
export interface ScanOptions {
  /**
   * Return only keys (no values)
   * @default false
   */
  keysOnly?: boolean;
}

/**
 * Result from a scan operation
 */
export interface ScanResult<T = unknown> {
  /**
   * Array of items (only present when keysOnly is false)
   */
  items?: Array<{
    key: string;
    value: T;
  }>;

  /**
   * Array of keys (only present when keysOnly is true)
   */
  keys?: string[];

  /**
   * Total count of matching items
   */
  count: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /**
   * Current number of items in the cache
   */
  size: number;

  /**
   * Maximum number of items the cache can hold
   */
  limit: number;

  /**
   * Additional statistics from Cachex
   */
  stats: Record<string, unknown>;
}

/**
 * Response from clear operation
 */
export interface ClearResult {
  /**
   * Whether the operation was successful
   */
  success: boolean;

  /**
   * Number of items that were cleared
   */
  cleared: number;
}

/**
 * Batch operation types
 */
export type BatchOperation =
  | {
      op: 'get';
      key: string;
    }
  | {
      op: 'set';
      key: string;
      value: unknown;
      ttl?: number;
    }
  | {
      op: 'delete';
      key: string;
    };

/**
 * Batch operation result
 */
export type BatchResult =
  | {
      op: 'get';
      key: string;
      value: unknown;
    }
  | {
      op: 'set';
      key: string;
      success: boolean;
    }
  | {
      op: 'delete';
      key: string;
      success: boolean;
    };

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
}
