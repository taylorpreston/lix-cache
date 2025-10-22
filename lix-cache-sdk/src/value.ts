import type { z } from 'zod';
import type { LixCache } from './client';
import type { SetOptions, RememberOptions } from './types';

/**
 * A type-safe value wrapper for a single cache key with optional validation.
 *
 * Use Value for reusable references to single cached items (config, flags, etc.)
 * Use Collection for multiple items with a common prefix (users, products, etc.)
 *
 * @example
 * ```typescript
 * // TypeScript-only (no runtime validation)
 * interface AppConfig {
 *   theme: string;
 *   apiUrl: string;
 * }
 * const config = cache.value<AppConfig>('config:app');
 *
 * await config.set({ theme: 'dark', apiUrl: 'https://...' });
 * const data = await config.get(); // Type: AppConfig | null
 *
 * // With Zod validation (runtime safety)
 * import { z } from 'zod';
 *
 * const ConfigSchema = z.object({
 *   theme: z.string(),
 *   apiUrl: z.string().url()
 * });
 *
 * const config = cache.value('config:app', ConfigSchema);
 *
 * // Validates at runtime
 * await config.set({ theme: 'dark', apiUrl: 'https://...' });
 *
 * // For numbers, you can use incr/decr
 * const views = cache.value<number>('page:views');
 * await views.incr(); // Atomic increment
 * ```
 */
export class Value<T> {
  constructor(
    private readonly client: LixCache,
    private readonly key: string,
    private readonly schema?: z.ZodType<T>
  ) {}

  /**
   * Validate and parse data using the Zod schema (if provided)
   */
  private validate(data: unknown): T {
    if (this.schema) {
      return this.schema.parse(data);
    }
    // No schema - trust TypeScript types
    return data as T;
  }

  /**
   * Set the value with optional validation
   * If a schema was provided, validates before setting.
   * Otherwise, trusts TypeScript types.
   */
  async set(value: T, options?: SetOptions): Promise<void> {
    // Validate before setting (if schema provided)
    const validated = this.validate(value);
    return this.client.set(this.key, validated, options);
  }

  /**
   * Get the value with optional validation
   * If a schema was provided, validates on retrieval to catch invalid cached data.
   * Otherwise, trusts TypeScript types.
   */
  async get(): Promise<T | null> {
    const data = await this.client.get(this.key);
    if (data === null) {
      return null;
    }
    // Validate on retrieval (if schema provided) to catch invalid cached data
    return this.validate(data);
  }

  /**
   * Delete the value from the cache
   */
  async delete(): Promise<void> {
    return this.client.delete(this.key);
  }

  /**
   * Check if the value exists in the cache
   */
  async exists(): Promise<boolean> {
    return this.client.exists(this.key);
  }

  /**
   * Get value from cache, or compute and store it if missing (cache-aside pattern)
   *
   * This implements the "remember" pattern:
   * - Check cache first
   * - If found, return validated cached value
   * - If missing, execute fallback function
   * - Validate and store the result
   * - Return the computed value
   *
   * Automatically validates data with the value's schema (if provided).
   * Deduplication is handled by the underlying LixCache.remember() method.
   *
   * @param fallback - Function to compute the value if not cached
   * @param options - Optional settings like TTL
   * @returns The cached or computed value (validated and typed)
   *
   * @example
   * ```typescript
   * const appConfig = cache.value<AppConfig>('config:app');
   *
   * // Fetch from database, cache for 5 minutes
   * const config = await appConfig.remember(
   *   async () => {
   *     const dbConfig = await db.config.findOne();
   *     return { theme: dbConfig.theme, apiUrl: dbConfig.apiUrl };
   *   },
   *   { ttl: 300 }
   * );
   *
   * // With validation
   * const ConfigSchema = z.object({ ... });
   * const config = cache.value('config:app', ConfigSchema);
   * const data = await config.remember(async () => fetchFromDB());
   * // ✅ Validates before caching
   * ```
   */
  async remember(
    fallback: () => Promise<T>,
    options?: RememberOptions
  ): Promise<T> {
    // Use the client's remember with validation
    return this.client.remember(
      this.key,
      async () => {
        const value = await fallback();
        // Validate before returning (will throw if invalid)
        return this.validate(value);
      },
      options
    );
  }

  /**
   * Atomically increment a numeric value
   *
   * Only available when T extends number.
   * If the key doesn't exist, starts from 0.
   *
   * @param amount - Amount to increment by (default: 1)
   * @returns The new value after incrementing
   *
   * @example
   * ```typescript
   * const views = cache.value<number>('page:views');
   * await views.incr(); // Increment by 1
   * await views.incr(10); // Increment by 10
   * ```
   */
  async incr(amount: number = 1): Promise<T extends number ? number : never> {
    return this.client.incr(this.key, amount) as any;
  }

  /**
   * Atomically decrement a numeric value
   *
   * Only available when T extends number.
   * If the key doesn't exist, starts from 0.
   *
   * @param amount - Amount to decrement by (default: 1)
   * @returns The new value after decrementing
   *
   * @example
   * ```typescript
   * const credits = cache.value<number>('user:credits');
   * await credits.decr(); // Decrement by 1
   * await credits.decr(5); // Decrement by 5
   * ```
   */
  async decr(amount: number = 1): Promise<T extends number ? number : never> {
    return this.client.decr(this.key, amount) as any;
  }
}
