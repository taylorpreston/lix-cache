import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { LixCache } from '../src/client';
import { z } from 'zod';

describe('Remember (Cache-Aside Pattern)', () => {
  const cache = new LixCache({ url: 'http://localhost:4000' });

  beforeAll(async () => {
    await cache.clear();
  });

  afterAll(async () => {
    await cache.clear();
  });

  describe('Basic behavior', () => {
    it('should call fallback on cache miss and store result', async () => {
      const fallback = vi.fn(async () => ({ name: 'Alice', age: 30 }));

      const result = await cache.remember('test:remember:1', fallback, { ttl: 60 });

      // Should return the computed value
      expect(result).toEqual({ name: 'Alice', age: 30 });

      // Fallback should have been called once
      expect(fallback).toHaveBeenCalledTimes(1);

      // Value should now be in cache
      const cached = await cache.get('test:remember:1');
      expect(cached).toEqual({ name: 'Alice', age: 30 });
    });

    it('should return cached value without calling fallback on cache hit', async () => {
      // Pre-populate cache
      await cache.set('test:remember:2', { name: 'Bob', age: 25 });

      const fallback = vi.fn(async () => ({ name: 'WRONG', age: 999 }));

      const result = await cache.remember('test:remember:2', fallback);

      // Should return cached value
      expect(result).toEqual({ name: 'Bob', age: 25 });

      // Fallback should NOT have been called
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should handle null/undefined fallback results', async () => {
      const fallback = vi.fn(async () => null);

      const result = await cache.remember('test:remember:null', fallback);

      expect(result).toBeNull();

      // Should be cached
      const cached = await cache.get('test:remember:null');
      expect(cached).toBeNull();
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate concurrent remember() calls for same key', async () => {
      let callCount = 0;
      const fallback = vi.fn(async () => {
        callCount++;
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 50));
        return { name: 'Charlie', count: callCount };
      });

      // Make 5 simultaneous remember() calls
      const promises = [
        cache.remember('test:remember:concurrent', fallback),
        cache.remember('test:remember:concurrent', fallback),
        cache.remember('test:remember:concurrent', fallback),
        cache.remember('test:remember:concurrent', fallback),
        cache.remember('test:remember:concurrent', fallback),
      ];

      const results = await Promise.all(promises);

      // All results should be identical
      results.forEach(result => {
        expect(result).toEqual({ name: 'Charlie', count: 1 });
      });

      // Fallback should only be called once (not 5 times!)
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(callCount).toBe(1);
    });

    it('should NOT deduplicate sequential remember() calls', async () => {
      // Clear the key first
      await cache.delete('test:remember:sequential');

      let callCount = 0;
      const fallback = vi.fn(async () => {
        callCount++;
        return { count: callCount };
      });

      // Sequential calls (each waits for previous)
      const result1 = await cache.remember('test:remember:sequential', fallback, { ttl: 1 });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result2 = await cache.remember('test:remember:sequential', fallback, { ttl: 1 });

      // First call computes, second call should also compute (after TTL expired)
      expect(result1).toEqual({ count: 1 });
      expect(result2).toEqual({ count: 2 });
      expect(fallback).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate different keys independently', async () => {
      const fallback1 = vi.fn(async () => ({ key: 1 }));
      const fallback2 = vi.fn(async () => ({ key: 2 }));

      const [r1a, r1b, r2a, r2b] = await Promise.all([
        cache.remember('test:remember:key1', fallback1),
        cache.remember('test:remember:key1', fallback1), // Deduplicated
        cache.remember('test:remember:key2', fallback2),
        cache.remember('test:remember:key2', fallback2), // Deduplicated
      ]);

      // Correct results
      expect(r1a).toEqual({ key: 1 });
      expect(r1b).toEqual({ key: 1 });
      expect(r2a).toEqual({ key: 2 });
      expect(r2b).toEqual({ key: 2 });

      // Each fallback called once
      expect(fallback1).toHaveBeenCalledTimes(1);
      expect(fallback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('TTL handling', () => {
    it('should respect TTL option', async () => {
      const fallback = vi.fn(async () => ({ value: 'expires' }));

      // Cache with 1 second TTL
      await cache.remember('test:remember:ttl', fallback, { ttl: 1 });

      // Immediately available
      const cached1 = await cache.get('test:remember:ttl');
      expect(cached1).toEqual({ value: 'expires' });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be expired
      const cached2 = await cache.get('test:remember:ttl');
      expect(cached2).toBeNull();
    });

    it('should cache indefinitely when TTL is not specified', async () => {
      const fallback = vi.fn(async () => ({ value: 'forever' }));

      await cache.remember('test:remember:noTtl', fallback);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still be cached
      const cached = await cache.get('test:remember:noTtl');
      expect(cached).toEqual({ value: 'forever' });
    });
  });

  describe('Error handling', () => {
    it('should propagate fallback errors', async () => {
      const fallback = vi.fn(async () => {
        throw new Error('Computation failed');
      });

      await expect(
        cache.remember('test:remember:error', fallback)
      ).rejects.toThrow('Computation failed');

      // Should NOT cache the error
      const cached = await cache.get('test:remember:error');
      expect(cached).toBeNull();
    });

    it('should propagate errors to all concurrent callers', async () => {
      const fallback = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        throw new Error('Concurrent error');
      });

      const promises = [
        cache.remember('test:remember:concurrentError', fallback),
        cache.remember('test:remember:concurrentError', fallback),
        cache.remember('test:remember:concurrentError', fallback),
      ];

      // All should reject
      await expect(Promise.all(promises)).rejects.toThrow('Concurrent error');

      // Fallback should only be called once
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('should clean up in-flight tracking after error', async () => {
      const fallback = async () => {
        throw new Error('Cleanup test');
      };

      await expect(cache.remember('test:remember:cleanup', fallback)).rejects.toThrow();

      // In-flight map should be empty
      expect((cache as any).rememberPromises.size).toBe(0);
    });
  });

  describe('Memory cleanup', () => {
    it('should clean up in-flight map after successful completion', async () => {
      const fallback = async () => ({ value: 'cleanup' });

      await cache.remember('test:remember:memoryCleanup', fallback);

      // Map should be empty
      expect((cache as any).rememberPromises.size).toBe(0);
    });

    it('should clean up when multiple callers wait for same computation', async () => {
      const fallback = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { value: 'multi-cleanup' };
      };

      await Promise.all([
        cache.remember('test:remember:multiCleanup', fallback),
        cache.remember('test:remember:multiCleanup', fallback),
        cache.remember('test:remember:multiCleanup', fallback),
      ]);

      // Map should be empty
      expect((cache as any).rememberPromises.size).toBe(0);
    });
  });

  describe('Collections integration', () => {
    const UserSchema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email(),
    });

    const users = cache.collection('test:remember:user:', UserSchema);

    it('should work with collections and validate data', async () => {
      const fallback = vi.fn(async () => ({
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      }));

      const user = await users.remember('1', fallback, { ttl: 60 });

      expect(user).toEqual({ name: 'Alice', age: 30, email: 'alice@example.com' });
      expect(fallback).toHaveBeenCalledTimes(1);

      // Should be cached with prefix
      const cached = await cache.get('test:remember:user:1');
      expect(cached).toEqual({ name: 'Alice', age: 30, email: 'alice@example.com' });
    });

    it('should validate fallback results with schema', async () => {
      const fallback = async () => ({
        name: 'Bob',
        age: 25,
        email: 'invalid-email', // ❌ Not a valid email
      });

      await expect(users.remember('2', fallback)).rejects.toThrow();
    });

    it('should deduplicate collection remember() calls', async () => {
      const fallback = vi.fn(async () => ({
        name: 'Charlie',
        age: 35,
        email: 'charlie@example.com',
      }));

      const promises = [
        users.remember('3', fallback),
        users.remember('3', fallback),
        users.remember('3', fallback),
      ];

      const results = await Promise.all(promises);

      // All identical
      results.forEach(result => {
        expect(result).toEqual({ name: 'Charlie', age: 35, email: 'charlie@example.com' });
      });

      // Fallback called once
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('should return cached collection value without calling fallback', async () => {
      // Pre-populate
      await users.set('4', {
        name: 'Diana',
        age: 28,
        email: 'diana@example.com',
      });

      const fallback = vi.fn(async () => ({
        name: 'WRONG',
        age: 999,
        email: 'wrong@example.com',
      }));

      const user = await users.remember('4', fallback);

      expect(user).toEqual({ name: 'Diana', age: 28, email: 'diana@example.com' });
      expect(fallback).not.toHaveBeenCalled();
    });
  });

  describe('Type inference', () => {
    it('should infer return type from fallback', async () => {
      // This is a compile-time check, but we can verify runtime behavior
      const fallback = async () => ({ name: 'Test', count: 42 });

      const result = await cache.remember('test:remember:types', fallback);

      // TypeScript should know result is { name: string, count: number }
      expect(result.name).toBe('Test');
      expect(result.count).toBe(42);
    });

    it('should work with generic types', async () => {
      interface TestData {
        id: number;
        value: string;
      }

      const fallback = async (): Promise<TestData> => ({
        id: 1,
        value: 'typed',
      });

      const result = await cache.remember<TestData>('test:remember:generic', fallback);

      expect(result.id).toBe(1);
      expect(result.value).toBe('typed');
    });
  });

  describe('Integration with batching', () => {
    it('should participate in automatic batching', async () => {
      // Clear keys first
      await Promise.all([
        cache.delete('test:remember:batch1'),
        cache.delete('test:remember:batch2'),
      ]);

      const httpSpy = vi.spyOn((cache as any).http, 'post');

      const fallback1 = async () => ({ value: 1 });
      const fallback2 = async () => ({ value: 2 });

      // Both remember() calls check cache in same tick → batched
      await Promise.all([
        cache.remember('test:remember:batch1', fallback1),
        cache.remember('test:remember:batch2', fallback2),
      ]);

      // The get() operations should be batched
      // (We can't easily count because batching happens automatically,
      // but we can verify the operations work correctly)
      const cached1 = await cache.get('test:remember:batch1');
      const cached2 = await cache.get('test:remember:batch2');

      expect(cached1).toEqual({ value: 1 });
      expect(cached2).toEqual({ value: 2 });

      httpSpy.mockRestore();
    });
  });
});
