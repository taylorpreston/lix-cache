import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { LixCache } from '../src/client';

describe('Collection', () => {
  const cache = new LixCache({ url: 'http://localhost:4000' });

  // Define schemas
  const UserSchema = z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
  });

  const ProductSchema = z.object({
    name: z.string(),
    price: z.number().positive(),
    inStock: z.boolean(),
  });

  type User = z.infer<typeof UserSchema>;
  type Product = z.infer<typeof ProductSchema>;

  beforeAll(async () => {
    // Clear the cache before tests
    await cache.clear();
  });

  afterAll(async () => {
    // Clear the cache after tests
    await cache.clear();
  });

  describe('Type-safe operations', () => {
    it('should create a collection with schema', () => {
      const users = cache.collection('user:', UserSchema);
      expect(users).toBeDefined();
    });

    it('should set and get with validation', async () => {
      const users = cache.collection('user:', UserSchema);

      const user: User = {
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      };

      await users.set('1', user);
      const retrieved = await users.get('1');

      expect(retrieved).toEqual(user);
    });

    it('should auto-prefix keys', async () => {
      const users = cache.collection('user:', UserSchema);

      await users.set('2', {
        name: 'Bob',
        age: 25,
        email: 'bob@example.com',
      });

      // Check that the key was prefixed
      const rawValue = await cache.get('user:2');
      expect(rawValue).toBeDefined();
    });

    it('should return null for non-existent keys', async () => {
      const users = cache.collection('user:', UserSchema);
      const result = await users.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('Validation', () => {
    it('should validate on set and throw on invalid data', async () => {
      const users = cache.collection('user:', UserSchema);

      // Missing required field
      await expect(
        users.set('invalid', { name: 'Invalid' } as any)
      ).rejects.toThrow();
    });

    it('should validate email format', async () => {
      const users = cache.collection('user:', UserSchema);

      await expect(
        users.set('invalid-email', {
          name: 'Test',
          age: 20,
          email: 'not-an-email',
        })
      ).rejects.toThrow();
    });

    it('should validate number constraints', async () => {
      const products = cache.collection('product:', ProductSchema);

      // Negative price should fail
      await expect(
        products.set('invalid-price', {
          name: 'Product',
          price: -10,
          inStock: true,
        })
      ).rejects.toThrow();
    });

    it('should validate on get (catches bad cached data)', async () => {
      const users = cache.collection('user:', UserSchema);

      // Manually set invalid data
      await cache.set('user:bad', { invalid: 'data' });

      // Should throw when getting with schema
      await expect(users.get('bad')).rejects.toThrow();
    });
  });

  describe('Scan', () => {
    it('should scan all items in collection', async () => {
      const users = cache.collection('user:', UserSchema);

      // Clear and add test data
      await cache.clear();

      await users.set('1', {
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      });
      await users.set('2', {
        name: 'Bob',
        age: 25,
        email: 'bob@example.com',
      });
      await users.set('3', {
        name: 'Charlie',
        age: 35,
        email: 'charlie@example.com',
      });

      const result = await users.scan();

      expect(result.count).toBe(3);
      expect(result.items).toHaveLength(3);
      expect(result.items[0].value).toHaveProperty('name');
      expect(result.items[0].value).toHaveProperty('email');
    });

    it('should remove prefix from returned keys', async () => {
      const users = cache.collection('user:', UserSchema);

      await cache.clear();
      await users.set('123', {
        name: 'Test',
        age: 20,
        email: 'test@example.com',
      });

      const result = await users.scan();
      expect(result.items[0].key).toBe('123');
      expect(result.items[0].key).not.toContain('user:');
    });

    it('should validate all items on scan', async () => {
      const users = cache.collection('user:', UserSchema);

      await cache.clear();

      // Add valid user
      await users.set('1', {
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      });

      // Manually add invalid data
      await cache.set('user:2', { invalid: 'data' });

      // Should throw when scanning because of invalid item
      await expect(users.scan()).rejects.toThrow();
    });

    it('should return empty array for empty collection', async () => {
      const users = cache.collection('user:', UserSchema);
      await cache.clear();

      const result = await users.scan();
      expect(result.items).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('Delete and Exists', () => {
    it('should delete items from collection', async () => {
      const users = cache.collection('user:', UserSchema);

      await users.set('delete-test', {
        name: 'Delete Me',
        age: 20,
        email: 'delete@example.com',
      });

      let exists = await users.exists('delete-test');
      expect(exists).toBe(true);

      await users.delete('delete-test');

      exists = await users.exists('delete-test');
      expect(exists).toBe(false);
    });

    it('should check existence without retrieving value', async () => {
      const users = cache.collection('user:', UserSchema);

      await users.set('exists-test', {
        name: 'Exists',
        age: 25,
        email: 'exists@example.com',
      });

      expect(await users.exists('exists-test')).toBe(true);
      expect(await users.exists('nonexistent')).toBe(false);
    });
  });

  describe('Collection isolation', () => {
    it('should isolate different collections', async () => {
      await cache.clear();

      const users = cache.collection('user:', UserSchema);
      const products = cache.collection('product:', ProductSchema);

      await users.set('1', {
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      });

      await products.set('1', {
        name: 'Widget',
        price: 19.99,
        inStock: true,
      });

      // Both should exist independently
      const user = await users.get('1');
      const product = await products.get('1');

      expect(user?.name).toBe('Alice');
      expect(product?.name).toBe('Widget');

      // User scan should only return users
      const userResults = await users.scan();
      expect(userResults.count).toBe(1);
      expect(userResults.items[0].value).toHaveProperty('email');

      // Product scan should only return products
      const productResults = await products.scan();
      expect(productResults.count).toBe(1);
      expect(productResults.items[0].value).toHaveProperty('price');
    });
  });

  describe('Clear collection', () => {
    it('should clear all items in collection', async () => {
      const users = cache.collection('user:', UserSchema);

      await cache.clear();

      // Add some users
      await users.set('1', {
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      });
      await users.set('2', {
        name: 'Bob',
        age: 25,
        email: 'bob@example.com',
      });

      // Clear the collection
      const deleted = await users.clear();
      expect(deleted).toBe(2);

      // Verify empty
      const result = await users.scan();
      expect(result.count).toBe(0);
    });

    it('should only clear items with prefix', async () => {
      const users = cache.collection('user:', UserSchema);
      const products = cache.collection('product:', ProductSchema);

      await cache.clear();

      await users.set('1', {
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      });
      await products.set('1', {
        name: 'Widget',
        price: 19.99,
        inStock: true,
      });

      // Clear only users
      await users.clear();

      // Users should be empty
      const userResults = await users.scan();
      expect(userResults.count).toBe(0);

      // Products should still exist
      const productResults = await products.scan();
      expect(productResults.count).toBe(1);
    });
  });

  describe('TTL support', () => {
    it('should support TTL in collection set', async () => {
      const users = cache.collection('user:', UserSchema);

      await users.set(
        'ttl-test',
        {
          name: 'Temporary',
          age: 20,
          email: 'temp@example.com',
        },
        { ttl: 1 }
      );

      // Should exist immediately
      let user = await users.get('ttl-test');
      expect(user).toBeDefined();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should be gone
      user = await users.get('ttl-test');
      expect(user).toBeNull();
    });
  });

  describe('TypeScript-only collections (no Zod)', () => {
    interface SimpleUser {
      name: string;
      age: number;
    }

    interface Product {
      id: string;
      name: string;
      price: number;
    }

    it('should create a collection without schema', () => {
      const users = cache.collection<SimpleUser>('ts-user:');
      expect(users).toBeDefined();
    });

    it('should set and get with TypeScript types only', async () => {
      const users = cache.collection<SimpleUser>('ts-user:');

      const user: SimpleUser = {
        name: 'Alice',
        age: 30,
      };

      await users.set('1', user);
      const retrieved = await users.get('1');

      expect(retrieved).toEqual(user);
      expect(retrieved?.name).toBe('Alice');
      expect(retrieved?.age).toBe(30);
    });

    it('should NOT validate data (trusts TypeScript)', async () => {
      const users = cache.collection<SimpleUser>('ts-user:');

      // TypeScript would catch this at compile-time, but runtime doesn't validate
      // This is expected behavior - TypeScript-only means trust the types
      await users.set('invalid', { name: 'Test', age: 25, extra: 'field' } as any);

      const retrieved = await users.get('invalid');
      expect(retrieved).toBeDefined();
    });

    it('should work with scan', async () => {
      const users = cache.collection<SimpleUser>('ts-user:');

      await cache.clear();

      await users.set('1', { name: 'Alice', age: 30 });
      await users.set('2', { name: 'Bob', age: 25 });
      await users.set('3', { name: 'Charlie', age: 35 });

      const result = await users.scan();

      expect(result.count).toBe(3);
      expect(result.items).toHaveLength(3);
      expect(result.items[0].value).toHaveProperty('name');
      expect(result.items[0].value).toHaveProperty('age');
    });

    it('should work with delete and exists', async () => {
      const users = cache.collection<SimpleUser>('ts-user:');

      await users.set('delete-test', { name: 'Delete Me', age: 20 });

      let exists = await users.exists('delete-test');
      expect(exists).toBe(true);

      await users.delete('delete-test');

      exists = await users.exists('delete-test');
      expect(exists).toBe(false);
    });

    it('should work with TTL', async () => {
      const users = cache.collection<SimpleUser>('ts-user:');

      await users.set('ttl-test', { name: 'Temporary', age: 20 }, { ttl: 1 });

      // Should exist immediately
      let user = await users.get('ttl-test');
      expect(user).toBeDefined();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should be gone
      user = await users.get('ttl-test');
      expect(user).toBeNull();
    });

    it('should work with remember()', async () => {
      const users = cache.collection<SimpleUser>('ts-user:');

      await cache.clear();

      let callCount = 0;
      const fetchUser = async (): Promise<SimpleUser> => {
        callCount++;
        return { name: 'Fetched', age: 40 };
      };

      // First call - cache miss
      const user1 = await users.remember('remember-test', fetchUser);
      expect(user1).toEqual({ name: 'Fetched', age: 40 });
      expect(callCount).toBe(1);

      // Second call - cache hit
      const user2 = await users.remember('remember-test', fetchUser);
      expect(user2).toEqual({ name: 'Fetched', age: 40 });
      expect(callCount).toBe(1); // Not called again!
    });

    it('should work with batch operations', async () => {
      const users = cache.collection<SimpleUser>('ts-user:');

      await cache.clear();

      // Batch set
      await users.batchSet([
        { id: '1', value: { name: 'Alice', age: 30 } },
        { id: '2', value: { name: 'Bob', age: 25 } },
        { id: '3', value: { name: 'Charlie', age: 35 } },
      ]);

      // Batch get
      const results = await users.batchGet(['1', '2', '3']);
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ name: 'Alice', age: 30 });
      expect(results[1]).toEqual({ name: 'Bob', age: 25 });
      expect(results[2]).toEqual({ name: 'Charlie', age: 35 });
    });

    it('should isolate TypeScript-only and Zod collections', async () => {
      const tsUsers = cache.collection<SimpleUser>('ts-user:');
      const zodUsers = cache.collection('zod-user:', UserSchema);

      await cache.clear();

      await tsUsers.set('1', { name: 'TS User', age: 30 });
      await zodUsers.set('1', { name: 'Zod User', age: 25, email: 'zod@example.com' });

      const tsUser = await tsUsers.get('1');
      const zodUser = await zodUsers.get('1');

      expect(tsUser?.name).toBe('TS User');
      expect(zodUser?.name).toBe('Zod User');

      // Verify isolation
      const tsResults = await tsUsers.scan();
      const zodResults = await zodUsers.scan();

      expect(tsResults.count).toBe(1);
      expect(zodResults.count).toBe(1);
    });

    it('should support complex nested types', async () => {
      interface ComplexData {
        user: {
          name: string;
          profile: {
            age: number;
            verified: boolean;
          };
        };
        tags: string[];
      }

      const data = cache.collection<ComplexData>('complex:');

      const complexValue: ComplexData = {
        user: {
          name: 'Alice',
          profile: {
            age: 30,
            verified: true,
          },
        },
        tags: ['admin', 'premium'],
      };

      await data.set('1', complexValue);
      const retrieved = await data.get('1');

      expect(retrieved).toEqual(complexValue);
      expect(retrieved?.user.profile.age).toBe(30);
      expect(retrieved?.tags).toEqual(['admin', 'premium']);
    });
  });
});
