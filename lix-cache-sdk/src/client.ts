import { HttpClient } from './http';
import { Collection } from './collection';
import { Value } from './value';
import type {
  LixCacheConfig,
  SetOptions,
  RememberOptions,
  RememberAllOptions,
  RememberAllResult,
  ScanOptions,
  ScanResult,
  CacheStats,
  ClearResult,
  BatchOperation,
  BatchResult,
  HealthResponse,
} from './types';
import type { z } from 'zod';

/**
 * Lix Cache client for TypeScript
 *
 * A TypeScript-first caching client with exceptional developer experience.
 *
 * @example
 * ```typescript
 * const lix = new LixCache();
 *
 * // Set a value
 * await lix.set('user:1', { name: 'Alice', age: 30 });
 *
 * // Get it back - fully typed!
 * const user = await lix.get<User>('user:1');
 *
 * // Increment a counter
 * await lix.incr('page:views');
 * ```
 */
export class LixCache {
  private http: HttpClient;
  private config: Required<LixCacheConfig>;

  // Automatic batching
  private batchQueue: Array<{
    operation: BatchOperation;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private batchScheduled = false;

  // Track in-flight remember computations for deduplication
  private rememberPromises = new Map<string, Promise<any>>();

  // Track in-flight rememberAll computations for deduplication
  private rememberAllPromises = new Map<string, Promise<any>>();

  constructor(config: LixCacheConfig = {}) {
    // Merge with defaults
    this.config = {
      url: config.url || process.env.LIX_CACHE_URL || 'http://localhost:4000',
      timeout: config.timeout ?? 5000,
      batching: config.batching ?? true,
      batchWindow: config.batchWindow ?? 10,
      localCache: config.localCache ?? false,
      localCacheTTL: config.localCacheTTL ?? 60,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 100,
      apiKey: config.apiKey || process.env.LIX_CACHE_API_KEY || '',
    };

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: this.config.url,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
      apiKey: this.config.apiKey,
    });
  }

  /**
   * Schedule a batch flush on the next microtask
   */
  private scheduleBatch(): void {
    if (this.batchScheduled) {
      return; // Already scheduled
    }

    this.batchScheduled = true;
    queueMicrotask(() => this.flushBatch());
  }

  /**
   * Flush the batch queue by sending all operations in a single request
   */
  private async flushBatch(): Promise<void> {
    this.batchScheduled = false;

    if (this.batchQueue.length === 0) {
      return;
    }

    // Take all queued operations
    const queue = this.batchQueue.splice(0);

    try {
      // Send batch request
      const operations = queue.map(item => item.operation);

      const results = await this.http.post<{ results: BatchResult[] }>(
        '/cache/batch',
        { operations }
      );

      // Resolve each promise with its result
      results.results.forEach((result, index) => {
        const queuedItem = queue[index];

        if (result.op === 'get') {
          queuedItem.resolve(result.value);
        } else if (result.op === 'set') {
          queuedItem.resolve(undefined);
        } else if (result.op === 'delete') {
          queuedItem.resolve(undefined);
        }
      });
    } catch (error) {
      // Reject all promises on error
      queue.forEach(item => item.reject(error));
    }
  }

  /**
   * Set a value in the cache
   *
   * Automatically batched with other operations in the same tick.
   * Multiple set() calls in the same event loop tick are combined
   * into a single HTTP request.
   *
   * @param key - The cache key
   * @param value - The value to store (will be JSON serialized)
   * @param options - Optional settings like TTL
   *
   * @example
   * ```typescript
   * // Store without expiration
   * await lix.set('user:1', { name: 'Alice' });
   *
   * // Store with 60 second TTL
   * await lix.set('session:abc', { token: '...' }, { ttl: 60 });
   *
   * // Multiple sets in same tick → 1 batch request
   * cache.set('user:1', data1);
   * cache.set('user:2', data2);
   * cache.set('user:3', data3);
   * ```
   */
  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      // Add to batch queue
      this.batchQueue.push({
        operation: {
          op: 'set',
          key,
          value,
          ttl: options?.ttl
        },
        resolve,
        reject
      });

      // Schedule batch flush
      this.scheduleBatch();
    });
  }

  /**
   * Get a value from the cache
   *
   * Automatically batched with other operations in the same tick.
   * Multiple get() calls in the same event loop tick are combined
   * into a single HTTP request.
   *
   * Also deduplicates requests for the same key within the batch.
   *
   * @param key - The cache key
   * @returns The cached value, or null if not found
   *
   * @example
   * ```typescript
   * const user = await lix.get<User>('user:1');
   * if (user) {
   *   console.log(user.name); // TypeScript knows the shape!
   * }
   *
   * // Multiple gets in same tick → 1 batch request
   * const [user1, user2, user3] = await Promise.all([
   *   lix.get('user:1'),
   *   lix.get('user:2'),
   *   lix.get('user:3')
   * ]); // Only 1 HTTP request with 3 gets!
   *
   * // Duplicate keys are deduplicated
   * const [a, b, c] = await Promise.all([
   *   lix.get('user:1'),
   *   lix.get('user:1'),  // Uses same promise as first
   *   lix.get('user:1')   // Uses same promise as first
   * ]); // Only 1 get for user:1 in the batch
   * ```
   */
  async get<T>(key: string): Promise<T | null> {
    // Check if already in batch queue (deduplication)
    const existing = this.batchQueue.find(
      item => item.operation.op === 'get' && item.operation.key === key
    );

    if (existing) {
      // Return promise that resolves when batch completes
      return new Promise((resolve, reject) => {
        const originalResolve = existing.resolve;
        const originalReject = existing.reject;

        existing.resolve = (value: any) => {
          originalResolve(value);
          resolve(value);
        };

        existing.reject = (error: any) => {
          originalReject(error);
          reject(error);
        };
      });
    }

    // Add to batch queue
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        operation: {
          op: 'get',
          key
        },
        resolve: (value: any) => {
          // Convert undefined to null for not found
          resolve(value === undefined ? null : value);
        },
        reject
      });

      // Schedule batch flush
      this.scheduleBatch();
    });
  }

  /**
   * Delete a value from the cache
   *
   * Automatically batched with other operations in the same tick.
   *
   * @param key - The cache key to delete
   *
   * @example
   * ```typescript
   * await lix.delete('user:1');
   *
   * // Multiple deletes in same tick → 1 batch request
   * await Promise.all([
   *   lix.delete('user:1'),
   *   lix.delete('user:2'),
   *   lix.delete('user:3')
   * ]);
   * ```
   */
  async delete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Add to batch queue
      this.batchQueue.push({
        operation: {
          op: 'delete',
          key
        },
        resolve,
        reject
      });

      // Schedule batch flush
      this.scheduleBatch();
    });
  }

  /**
   * Atomically increment a numeric value
   *
   * @param key - The cache key (must contain a number)
   * @param amount - Amount to increment by (default: 1)
   * @returns The new value after incrementing
   *
   * @example
   * ```typescript
   * // Increment page views
   * const views = await lix.incr('page:home:views');
   *
   * // Increment by 5
   * const score = await lix.incr('user:score', 5);
   * ```
   */
  async incr(key: string, amount: number = 1): Promise<number> {
    const response = await this.http.post<{ value: number }>('/cache/incr', {
      key,
      amount,
    });
    return response.value;
  }

  /**
   * Atomically decrement a numeric value
   *
   * @param key - The cache key (must contain a number)
   * @param amount - Amount to decrement by (default: 1)
   * @returns The new value after decrementing
   *
   * @example
   * ```typescript
   * // Decrement inventory
   * const remaining = await lix.decr('product:123:inventory');
   *
   * // Decrement by 5
   * const credits = await lix.decr('user:credits', 5);
   * ```
   */
  async decr(key: string, amount: number = 1): Promise<number> {
    const response = await this.http.post<{ value: number }>('/cache/decr', {
      key,
      amount,
    });
    return response.value;
  }

  /**
   * Scan for keys matching a prefix
   *
   * @param prefix - Key prefix to search for (empty string returns all)
   * @param options - Scan options
   * @returns Scan results with items or keys
   *
   * @example
   * ```typescript
   * // Get all users with their data
   * const result = await lix.scan<User>('user:');
   * result.items?.forEach(item => {
   *   console.log(item.key, item.value);
   * });
   *
   * // Get only the keys
   * const result = await lix.scan('user:', { keysOnly: true });
   * console.log(result.keys);
   * ```
   */
  async scan<T = unknown>(
    prefix: string = '',
    options?: ScanOptions
  ): Promise<ScanResult<T>> {
    const params: Record<string, string> = { prefix };
    if (options?.keysOnly) {
      params.keys_only = 'true';
    }

    return this.http.get<ScanResult<T>>('/cache/scan', params);
  }

  /**
   * Clear the entire cache
   *
   * @returns Information about the clear operation
   *
   * @example
   * ```typescript
   * const result = await lix.clear();
   * console.log(`Cleared ${result.cleared} items`);
   * ```
   */
  async clear(): Promise<ClearResult> {
    return this.http.post<ClearResult>('/cache/clear');
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats including size and limit
   *
   * @example
   * ```typescript
   * const stats = await lix.stats();
   * console.log(`${stats.size} / ${stats.limit} items`);
   * ```
   */
  async stats(): Promise<CacheStats> {
    return this.http.get<CacheStats>('/cache/stats');
  }

  /**
   * Execute multiple operations in a single request
   *
   * @param operations - Array of operations to execute
   * @returns Results of each operation
   *
   * @example
   * ```typescript
   * const results = await lix.batch([
   *   { op: 'get', key: 'user:1' },
   *   { op: 'set', key: 'user:2', value: { name: 'Bob' } },
   * ]);
   * ```
   */
  async batch(operations: BatchOperation[]): Promise<BatchResult[]> {
    const response = await this.http.post<{ results: BatchResult[] }>(
      '/cache/batch',
      { operations }
    );
    return response.results;
  }

  /**
   * Check if a key exists in the cache
   *
   * @param key - The cache key to check
   * @returns true if the key exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await lix.exists('user:1');
   * if (exists) {
   *   console.log('User is cached');
   * }
   * ```
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Create a type-safe collection with automatic prefix and optional validation
   *
   * @param prefix - The key prefix for this collection (e.g., 'user:')
   * @param schema - Optional Zod schema for runtime validation and type inference
   * @returns A typed Collection instance
   *
   * @example
   * ```typescript
   * // TypeScript-only (no runtime validation) - MUST provide type parameter!
   * interface User {
   *   name: string;
   *   age: number;
   * }
   * const users = lix.collection<User>('user:'); // ✅ Type required
   *
   * await users.set('1', { name: 'Alice', age: 30 });
   * const user = await users.get('1'); // Typed as User | null
   *
   * // With Zod validation (runtime safety) - type inferred from schema
   * import { z } from 'zod';
   *
   * const UserSchema = z.object({
   *   name: z.string(),
   *   age: z.number(),
   *   email: z.string().email()
   * });
   *
   * const users = lix.collection('user:', UserSchema); // ✅ Type inferred
   *
   * // Auto-prefixes to 'user:1' and validates at runtime
   * await users.set('1', { name: 'Alice', age: 30, email: 'alice@example.com' });
   *
   * // Returns validated typed User | null
   * const user = await users.get('1');
   *
   * // Scan returns validated typed array
   * const allUsers = await users.scan();
   * ```
   */
  collection<T = never>(prefix: string): Collection<T>;
  collection<T>(prefix: string, schema: z.ZodType<T>): Collection<T>;
  collection<T>(prefix: string, schema?: z.ZodType<T>): Collection<T> {
    return new Collection(this, prefix, schema);
  }

  /**
   * Create a type-safe value wrapper for a single cache key with optional validation
   *
   * Use Value for reusable references to single cached items (config, flags, etc.)
   * Use Collection for multiple items with a common prefix (users, products, etc.)
   *
   * @param key - The cache key
   * @param schema - Optional Zod schema for runtime validation and type inference
   * @returns A typed Value instance
   *
   * @example
   * ```typescript
   * // TypeScript-only (no runtime validation) - MUST provide type parameter!
   * interface AppConfig {
   *   theme: string;
   *   apiUrl: string;
   * }
   * const config = lix.value<AppConfig>('config:app'); // ✅ Type required
   *
   * await config.set({ theme: 'dark', apiUrl: 'https://...' });
   * const data = await config.get(); // Typed as AppConfig | null
   *
   * // With Zod validation (runtime safety) - type inferred from schema
   * import { z } from 'zod';
   *
   * const ConfigSchema = z.object({
   *   theme: z.string(),
   *   apiUrl: z.string().url()
   * });
   *
   * const config = lix.value('config:app', ConfigSchema); // ✅ Type inferred
   *
   * // Validates at runtime
   * await config.set({ theme: 'dark', apiUrl: 'https://...' });
   *
   * // Returns validated typed AppConfig | null
   * const data = await config.get();
   *
   * // For numbers, you can use incr/decr
   * const views = lix.value<number>('page:views');
   * await views.incr(); // Atomic increment
   * ```
   */
  value<T = never>(key: string): Value<T>;
  value<T>(key: string, schema: z.ZodType<T>): Value<T>;
  value<T>(key: string, schema?: z.ZodType<T>): Value<T> {
    return new Value(this, key, schema);
  }

  /**
   * Check server health
   *
   * @returns Health status
   *
   * @example
   * ```typescript
   * const health = await lix.health();
   * console.log(health.status); // 'healthy'
   * ```
   */
  async health(): Promise<HealthResponse> {
    return this.http.get<HealthResponse>('/health');
  }

  /**
   * Get a value from cache, or compute and store it if missing (cache-aside pattern)
   *
   * This implements the "remember" pattern popularized by Laravel:
   * - Check cache first
   * - If found, return cached value
   * - If missing, execute fallback function
   * - Store the result in cache
   * - Return the computed value
   *
   * Automatically deduplicates concurrent calls for the same key.
   * Multiple simultaneous remember() calls for the same key will only
   * execute the fallback once, with all callers receiving the same result.
   *
   * @param key - The cache key
   * @param fallback - Function to compute the value if not cached
   * @param options - Optional settings like TTL
   * @returns The cached or computed value (never null)
   *
   * @example
   * ```typescript
   * // Fetch user from API, cache for 5 minutes
   * const user = await lix.remember(
   *   'user:123',
   *   async () => {
   *     const res = await fetch('/api/users/123');
   *     return res.json();
   *   },
   *   { ttl: 300 }
   * );
   *
   * // Expensive computation cached for 1 hour
   * const report = await lix.remember(
   *   'report:monthly',
   *   async () => generateMonthlyReport(),
   *   { ttl: 3600 }
   * );
   *
   * // Concurrent calls are deduplicated
   * const [user1, user2, user3] = await Promise.all([
   *   lix.remember('user:1', fetchUser),
   *   lix.remember('user:1', fetchUser),  // Waits for first call
   *   lix.remember('user:1', fetchUser)   // Waits for first call
   * ]); // fetchUser only called once!
   * ```
   */
  async remember<T>(
    key: string,
    fallback: () => Promise<T>,
    options?: RememberOptions
  ): Promise<T> {
    // Check for in-flight computation (deduplication)
    const inflight = this.rememberPromises.get(key);
    if (inflight) {
      return inflight as Promise<T>;
    }

    // Create promise for this computation
    const promise = (async () => {
      try {
        // Try cache first (uses batched get)
        const cached = await this.get<T>(key);
        if (cached !== null) {
          return cached;
        }

        // Cache miss - compute value
        const value = await fallback();

        // Store in cache (uses batched set)
        await this.set(key, value, options);

        return value;
      } finally {
        // Cleanup after computation completes
        this.rememberPromises.delete(key);
      }
    })();

    // Track this computation
    this.rememberPromises.set(key, promise);

    return promise;
  }

  /**
   * Fetch a list from an API and cache each item individually
   *
   * This implements the "rememberAll" pattern:
   * - Without listTTL: Always fetches from API and caches all items (simple mode)
   * - With listTTL: Checks list marker first, only fetches if marker expired (optimized mode)
   *
   * Returns both an array for iteration and a getBy() function for O(1) lookups.
   * Automatically deduplicates concurrent calls for the same prefix.
   *
   * @param prefix - Key prefix for the items (e.g., 'user:')
   * @param fallback - Function that fetches the list from an API or database
   * @param options - Configuration including getKey function to extract ID from each item
   * @returns Object with items array and getBy lookup function
   *
   * @example
   * ```typescript
   * // Simple mode: Always fetch and cache (no listTTL)
   * const result = await lix.rememberAll(
   *   'user:',
   *   async () => {
   *     const res = await fetch('/api/users');
   *     return res.json();
   *   },
   *   {
   *     getKey: (user) => user.id,  // Extract ID from each user
   *     ttl: 3600  // Cache each user for 1 hour
   *   }
   * );
   *
   * // Iterate through all users
   * result.items.forEach(user => console.log(user.name));
   *
   * // Fast O(1) lookup by ID
   * const alice = result.getBy('123');
   *
   * // Optimized mode: Use list marker to avoid unnecessary API calls
   * const result = await lix.rememberAll(
   *   'user:',
   *   fetchUsers,
   *   {
   *     getKey: (user) => user.id,
   *     ttl: 3600,     // Cache each user for 1 hour
   *     listTTL: 60    // Only fetch list every 60 seconds
   *   }
   * );
   *
   * // Concurrent calls are deduplicated
   * const [result1, result2] = await Promise.all([
   *   lix.rememberAll('user:', fetchUsers, options),
   *   lix.rememberAll('user:', fetchUsers, options)  // Waits for first call
   * ]); // fetchUsers only called once!
   * ```
   */
  async rememberAll<T>(
    prefix: string,
    fallback: () => Promise<T[]>,
    options: RememberAllOptions<T>
  ): Promise<RememberAllResult<T>> {
    const { getKey, ttl, listTTL } = options;
    const listMarkerKey = `${prefix}__list__`;

    // Check for in-flight computation (deduplication)
    const inflight = this.rememberAllPromises.get(prefix);
    if (inflight) {
      return inflight as Promise<RememberAllResult<T>>;
    }

    // Create promise for this computation
    const promise = (async () => {
      try {
        let items: T[];

        // If listTTL is set, use optimized mode with list marker
        if (listTTL !== undefined) {
          // Check if list marker exists
          const markerExists = await this.exists(listMarkerKey);

          if (markerExists) {
            // List marker exists - return cached items
            const scanResult = await this.scan<T>(prefix);
            items = scanResult.items?.map(item => item.value) || [];
          } else {
            // List marker missing - fetch from API
            items = await fallback();

            // Cache all items using batch
            const operations: BatchOperation[] = items.map(item => ({
              op: 'set',
              key: `${prefix}${getKey(item)}`,
              value: item,
              ttl
            }));

            await this.batch(operations);

            // Set list marker
            await this.set(listMarkerKey, true, { ttl: listTTL });
          }
        } else {
          // Simple mode - always fetch from API
          items = await fallback();

          // Cache all items using batch
          const operations: BatchOperation[] = items.map(item => ({
            op: 'set',
            key: `${prefix}${getKey(item)}`,
            value: item,
            ttl
          }));

          await this.batch(operations);
        }

        // Build lookup map for O(1) access
        const itemMap = new Map<string, T>();
        items.forEach(item => {
          itemMap.set(getKey(item), item);
        });

        return {
          items,
          getBy: (key: string) => itemMap.get(key)
        };
      } finally {
        // Cleanup after computation completes
        this.rememberAllPromises.delete(prefix);
      }
    })();

    // Track this computation
    this.rememberAllPromises.set(prefix, promise);

    return promise;
  }
}
