import type { z } from 'zod';
import type { LixCache } from './client';
import type { SetOptions, RememberAllOptions, RememberAllResult } from './types';

/**
 * A type-safe collection that automatically prefixes keys and optionally validates data.
 *
 * @example
 * ```typescript
 * // TypeScript-only (no runtime validation)
 * interface User {
 *   name: string;
 *   age: number;
 * }
 * const users = cache.collection<User>('user:');
 *
 * await users.set('1', { name: 'Alice', age: 30 });
 * const user = await users.get('1'); // Typed as User | null
 *
 * // With Zod validation (runtime safety)
 * import { z } from 'zod';
 *
 * const UserSchema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 *   email: z.string().email()
 * });
 *
 * const users = cache.collection('user:', UserSchema);
 *
 * // Auto-prefixes to 'user:1' and validates
 * await users.set('1', { name: 'Alice', age: 30, email: 'alice@example.com' });
 *
 * // Returns validated typed User | null
 * const user = await users.get('1');
 * ```
 */
export class Collection<T> {
  constructor(
    private readonly client: LixCache,
    private readonly prefix: string,
    private readonly schema?: z.ZodType<T>
  ) {}

  /**
   * Get the full cache key by prepending the prefix
   */
  private getKey(id: string): string {
    return `${this.prefix}${id}`;
  }

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
   * Set a value in the collection with optional validation
   * If a schema was provided, validates before setting.
   * Otherwise, trusts TypeScript types.
   */
  async set(id: string, value: T, options?: SetOptions): Promise<void> {
    // Validate before setting (if schema provided)
    const validated = this.validate(value);
    return this.client.set(this.getKey(id), validated, options);
  }

  /**
   * Get a value from the collection with optional validation
   * If a schema was provided, validates on retrieval to catch invalid cached data.
   * Otherwise, trusts TypeScript types.
   */
  async get(id: string): Promise<T | null> {
    const data = await this.client.get(this.getKey(id));
    if (data === null) {
      return null;
    }
    // Validate on retrieval (if schema provided) to catch invalid cached data
    return this.validate(data);
  }

  /**
   * Delete a value from the collection
   */
  async delete(id: string): Promise<void> {
    return this.client.delete(this.getKey(id));
  }

  /**
   * Check if a key exists in the collection
   */
  async exists(id: string): Promise<boolean> {
    return this.client.exists(this.getKey(id));
  }

  /**
   * Scan all items in the collection
   * Returns all items with this prefix, validated and typed
   */
  async scan(): Promise<{ items: Array<{ key: string; value: T }>; count: number }> {
    const result = await this.client.scan(this.prefix);

    // Handle empty results
    if (!result.items || result.items.length === 0) {
      return { items: [], count: 0 };
    }

    // Validate all items
    const validatedItems = result.items.map(item => ({
      key: item.key.replace(this.prefix, ''), // Remove prefix from returned keys
      value: this.validate(item.value)
    }));

    return {
      items: validatedItems,
      count: validatedItems.length
    };
  }

  /**
   * Clear all items in this collection
   * Warning: This scans for all items with the prefix and deletes them
   */
  async clear(): Promise<number> {
    const result = await this.scan();
    let deleted = 0;

    for (const item of result.items) {
      await this.delete(item.key);
      deleted++;
    }

    return deleted;
  }

  /**
   * Set multiple values in the collection with validation
   * All values are validated before any are set
   *
   * @param items - Array of items to set
   * @returns Promise that resolves when all items are set
   *
   * @example
   * ```typescript
   * await users.batchSet([
   *   { id: '1', value: { name: 'Alice', age: 30, email: 'alice@example.com' } },
   *   { id: '2', value: { name: 'Bob', age: 25, email: 'bob@example.com' }, ttl: 60 },
   *   { id: '3', value: { name: 'Charlie', age: 35, email: 'charlie@example.com' } }
   * ]);
   * ```
   */
  async batchSet(items: Array<{ id: string; value: T; ttl?: number }>): Promise<void> {
    // Validate all items first (fail fast if any are invalid)
    const validatedItems = items.map(item => ({
      id: item.id,
      value: this.validate(item.value),
      ttl: item.ttl
    }));

    // Build batch operations
    const operations = validatedItems.map(item => ({
      op: 'set' as const,
      key: this.getKey(item.id),
      value: item.value,
      ttl: item.ttl
    }));

    // Execute batch
    await this.client.batch(operations);
  }

  /**
   * Get multiple values from the collection with validation
   * Returns an array of values in the same order as the IDs
   * Missing items return null
   *
   * @param ids - Array of IDs to retrieve
   * @returns Array of values (or null for missing items)
   *
   * @example
   * ```typescript
   * const users = await users.batchGet(['1', '2', '3']);
   * // Returns: [User | null, User | null, User | null]
   * ```
   */
  async batchGet(ids: string[]): Promise<Array<T | null>> {
    // Build batch get operations
    const operations = ids.map(id => ({
      op: 'get' as const,
      key: this.getKey(id)
    }));

    // Execute batch
    const results = await this.client.batch(operations);

    // Validate and return results in order
    return results.map((result) => {
      if (result.op === 'get') {
        if (result.value === null || result.value === undefined) {
          return null;
        }
        // Validate each retrieved value
        return this.validate(result.value);
      }
      return null;
    });
  }

  /**
   * Delete multiple values from the collection
   *
   * @param ids - Array of IDs to delete
   * @returns Promise that resolves when all items are deleted
   *
   * @example
   * ```typescript
   * await users.batchDelete(['1', '2', '3']);
   * ```
   */
  async batchDelete(ids: string[]): Promise<void> {
    // Use Promise.all for parallel deletes
    await Promise.all(ids.map(id => this.delete(id)));
  }

  /**
   * Get a value from cache, or compute and store it if missing (cache-aside pattern)
   *
   * This implements the "remember" pattern for type-safe collections:
   * - Check cache first
   * - If found, return validated cached value
   * - If missing, execute fallback function
   * - Validate and store the result
   * - Return the computed value
   *
   * Automatically prefixes the key and validates data with the collection's schema.
   * Deduplication is handled by the underlying LixCache.remember() method.
   *
   * @param id - The item ID (will be prefixed automatically)
   * @param fallback - Function to compute the value if not cached
   * @param options - Optional settings like TTL
   * @returns The cached or computed value (validated and typed)
   *
   * @example
   * ```typescript
   * const UserSchema = z.object({
   *   name: z.string(),
   *   age: z.number(),
   *   email: z.string().email()
   * });
   *
   * const users = cache.collection('user:', UserSchema);
   *
   * // Fetch user from database, validate and cache for 5 minutes
   * const user = await users.remember(
   *   '123',
   *   async () => {
   *     const dbUser = await db.users.findById(123);
   *     return { name: dbUser.name, age: dbUser.age, email: dbUser.email };
   *   },
   *   { ttl: 300 }
   * );
   *
   * // Validation happens automatically
   * const user = await users.remember('456', async () => ({
   *   name: 'Alice',
   *   age: 30,
   *   email: 'invalid-email'  // ❌ Throws Zod validation error!
   * }));
   *
   * // Concurrent calls are deduplicated
   * const [user1, user2] = await Promise.all([
   *   users.remember('123', fetchUser),
   *   users.remember('123', fetchUser)  // Waits for first call
   * ]); // fetchUser only called once, result validated once
   * ```
   */
  async remember(
    id: string,
    fallback: () => Promise<T>,
    options?: SetOptions
  ): Promise<T> {
    // Use the client's remember with our prefix
    return this.client.remember(
      this.getKey(id),
      async () => {
        const value = await fallback();
        // Validate before returning (will throw if invalid)
        return this.validate(value);
      },
      options
    );
  }

  /**
   * Fetch a list from an API and cache each item individually
   *
   * This implements the "rememberAll" pattern for collections:
   * - Without listTTL: Always fetches from API and caches all items (simple mode)
   * - With listTTL: Checks list marker first, only fetches if marker expired (optimized mode)
   *
   * Returns both an array for iteration and a getBy() function for O(1) lookups.
   * Automatically validates all items with the collection's schema.
   *
   * @param fallback - Function that fetches the list from an API or database
   * @param options - Configuration including getKey function to extract ID from each item
   * @returns Object with items array and getBy lookup function
   *
   * @example
   * ```typescript
   * const UserSchema = z.object({
   *   id: z.string(),
   *   name: z.string(),
   *   email: z.string().email()
   * });
   *
   * const users = cache.collection('user:', UserSchema);
   *
   * // Simple mode: Always fetch and cache (no listTTL)
   * const result = await users.rememberAll(
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
   * const result = await users.rememberAll(
   *   fetchUsers,
   *   {
   *     getKey: (user) => user.id,
   *     ttl: 3600,     // Cache each user for 1 hour
   *     listTTL: 60    // Only fetch list every 60 seconds
   *   }
   * );
   * ```
   */
  async rememberAll(
    fallback: () => Promise<T[]>,
    options: RememberAllOptions<T>
  ): Promise<RememberAllResult<T>> {
    const { getKey, ttl, listTTL } = options;
    const listMarkerKey = `${this.prefix}__list__`;

    let items: T[];

    // If listTTL is set, use optimized mode with list marker
    if (listTTL !== undefined) {
      // Check if list marker exists
      const markerExists = await this.client.exists(listMarkerKey);

      if (markerExists) {
        // List marker exists - return cached items
        const scanResult = await this.scan();
        items = scanResult.items.map(item => item.value);
      } else {
        // List marker missing - fetch from API
        const fetchedItems = await fallback();

        // Validate all items
        items = fetchedItems.map(item => this.validate(item));

        // Cache all items using batchSet
        await this.batchSet(
          items.map(item => ({
            id: getKey(item),
            value: item,
            ttl
          }))
        );

        // Set list marker
        await this.client.set(listMarkerKey, true, { ttl: listTTL });
      }
    } else {
      // Simple mode - always fetch from API
      const fetchedItems = await fallback();

      // Validate all items
      items = fetchedItems.map(item => this.validate(item));

      // Cache all items using batchSet
      await this.batchSet(
        items.map(item => ({
          id: getKey(item),
          value: item,
          ttl
        }))
      );
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
  }
}
