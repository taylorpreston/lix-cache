import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { LixCache } from '../src/client';

describe('Automatic Batching', () => {
  const cache = new LixCache({ url: 'http://localhost:4000' });

  beforeAll(async () => {
    await cache.clear();
    // Set up some test data
    await cache.set('batch:user:1', { name: 'Alice', age: 30 });
    await cache.set('batch:user:2', { name: 'Bob', age: 25 });
    await cache.set('batch:user:3', { name: 'Charlie', age: 35 });
  });

  afterAll(async () => {
    await cache.clear();
  });

  describe('Multiple gets in same tick', () => {
    it('should batch multiple get() calls into one request', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Multiple gets in same tick
      const promises = Promise.all([
        cache.get('batch:user:1'),
        cache.get('batch:user:2'),
        cache.get('batch:user:3')
      ]);

      const results = await promises;

      // All results should be correct
      expect(results[0]).toEqual({ name: 'Alice', age: 30 });
      expect(results[1]).toEqual({ name: 'Bob', age: 25 });
      expect(results[2]).toEqual({ name: 'Charlie', age: 35 });

      // Should have made 1 batch request
      expect(httpSpy).toHaveBeenCalledWith('/cache/batch', expect.anything());
      expect(httpSpy).toHaveBeenCalledTimes(1);

      httpSpy.mockRestore();
    });

    it('should deduplicate get() calls for same key', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Multiple gets for same key
      const [result1, result2, result3] = await Promise.all([
        cache.get('batch:user:1'),
        cache.get('batch:user:1'),
        cache.get('batch:user:1')
      ]);

      // All should have same result
      expect(result1).toEqual({ name: 'Alice', age: 30 });
      expect(result2).toEqual({ name: 'Alice', age: 30 });
      expect(result3).toEqual({ name: 'Alice', age: 30 });

      // Should have made 1 batch request with 1 get operation
      expect(httpSpy).toHaveBeenCalledTimes(1);
      const batchCall = httpSpy.mock.calls[0][1] as any;
      expect(batchCall.operations).toHaveLength(1);
      expect(batchCall.operations[0]).toEqual({ op: 'get', key: 'batch:user:1' });

      httpSpy.mockRestore();
    });
  });

  describe('Multiple sets in same tick', () => {
    it('should batch multiple set() calls into one request', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Multiple sets in same tick
      await Promise.all([
        cache.set('batch:new:1', { data: 'one' }),
        cache.set('batch:new:2', { data: 'two' }),
        cache.set('batch:new:3', { data: 'three' })
      ]);

      // Should have made 1 batch request
      expect(httpSpy).toHaveBeenCalledWith('/cache/batch', expect.anything());
      expect(httpSpy).toHaveBeenCalledTimes(1);

      // Restore spy before verifying data
      httpSpy.mockRestore();

      // Verify data was actually set
      const result1 = await cache.get('batch:new:1');
      const result2 = await cache.get('batch:new:2');
      const result3 = await cache.get('batch:new:3');

      expect(result1).toEqual({ data: 'one' });
      expect(result2).toEqual({ data: 'two' });
      expect(result3).toEqual({ data: 'three' });
    });

    it('should batch set() with TTL', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      await Promise.all([
        cache.set('batch:ttl:1', { data: 'temp' }, { ttl: 60 }),
        cache.set('batch:ttl:2', { data: 'temp2' }, { ttl: 120 })
      ]);

      expect(httpSpy).toHaveBeenCalledTimes(1);
      const batchCall = httpSpy.mock.calls[0][1] as any;

      expect(batchCall.operations[0].ttl).toBe(60);
      expect(batchCall.operations[1].ttl).toBe(120);

      httpSpy.mockRestore();
    });
  });

  describe('Mixed operations', () => {
    it('should batch get() and set() together', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Mix of get and set operations
      const getPromise = cache.get('batch:user:1');
      const setPromise = cache.set('batch:mixed:1', { data: 'mixed' });

      await Promise.all([getPromise, setPromise]);

      // Should make 1 batch request
      expect(httpSpy).toHaveBeenCalledTimes(1);
      const batchCall = httpSpy.mock.calls[0][1] as any;

      expect(batchCall.operations).toHaveLength(2);
      expect(batchCall.operations[0].op).toBe('get');
      expect(batchCall.operations[1].op).toBe('set');

      httpSpy.mockRestore();
    });
  });

  describe('Sequential operations', () => {
    it('should NOT batch sequential operations', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Sequential operations (each waits for previous)
      await cache.set('batch:seq:1', { data: 'one' });
      await cache.set('batch:seq:2', { data: 'two' });
      await cache.set('batch:seq:3', { data: 'three' });

      // Should make 3 separate batch requests
      expect(httpSpy).toHaveBeenCalledTimes(3);

      httpSpy.mockRestore();
    });
  });

  describe('Missing keys', () => {
    it('should handle get() for non-existent keys', async () => {
      // Ensure the test data exists
      await cache.set('batch:user:1', { name: 'Alice', age: 30 });

      const results = await Promise.all([
        cache.get('batch:nonexistent:1'),
        cache.get('batch:nonexistent:2'),
        cache.get('batch:user:1') // This one exists
      ]);

      expect(results[0]).toBeNull();
      expect(results[1]).toBeNull();
      expect(results[2]).toEqual({ name: 'Alice', age: 30 });
    });
  });

  describe('Order preservation', () => {
    it('should preserve operation order in batch', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      await Promise.all([
        cache.set('batch:order:1', { order: 1 }),
        cache.get('batch:user:1'),
        cache.set('batch:order:2', { order: 2 }),
        cache.get('batch:user:2')
      ]);

      const batchCall = httpSpy.mock.calls[0][1] as any;
      expect(batchCall.operations[0]).toMatchObject({ op: 'set', key: 'batch:order:1' });
      expect(batchCall.operations[1]).toMatchObject({ op: 'get', key: 'batch:user:1' });
      expect(batchCall.operations[2]).toMatchObject({ op: 'set', key: 'batch:order:2' });
      expect(batchCall.operations[3]).toMatchObject({ op: 'get', key: 'batch:user:2' });

      httpSpy.mockRestore();
    });
  });

  describe('Error handling', () => {
    it('should handle batch errors gracefully', async () => {
      // Create cache with invalid URL to trigger error
      const brokenCache = new LixCache({ url: 'http://localhost:9999' });

      // All operations should fail
      await expect(
        Promise.all([
          brokenCache.get('any:key'),
          brokenCache.set('any:key', { data: 'value' })
        ])
      ).rejects.toThrow();
    });
  });

  describe('Bulk operations', () => {
    it('should efficiently batch many operations', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Create 50 operations
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push(cache.set(`batch:bulk:${i}`, { index: i }));
      }

      await Promise.all(operations);

      // Should make 1 batch request
      expect(httpSpy).toHaveBeenCalledTimes(1);

      // Verify operations were batched
      const batchCall = httpSpy.mock.calls[0][1] as any;
      expect(batchCall.operations).toHaveLength(50);

      // Verify data was set correctly
      const result0 = await cache.get('batch:bulk:0');
      const result49 = await cache.get('batch:bulk:49');

      expect(result0).toEqual({ index: 0 });
      expect(result49).toEqual({ index: 49 });

      httpSpy.mockRestore();
    });
  });

  describe('Collections integration', () => {
    it('should automatically batch collection operations', async () => {
      const { z } = await import('zod');

      const UserSchema = z.object({
        name: z.string(),
        age: z.number()
      });

      const users = cache.collection('batch:collection:', UserSchema);

      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Multiple collection operations
      await Promise.all([
        users.set('1', { name: 'Alice', age: 30 }),
        users.set('2', { name: 'Bob', age: 25 }),
        users.get('1')
      ]);

      // Should be batched
      expect(httpSpy).toHaveBeenCalledWith('/cache/batch', expect.anything());

      httpSpy.mockRestore();
    });
  });

  describe('Delete operations', () => {
    it('should batch multiple delete() calls into one request', async () => {
      // Set up test data
      await Promise.all([
        cache.set('batch:delete:1', { data: 'one' }),
        cache.set('batch:delete:2', { data: 'two' }),
        cache.set('batch:delete:3', { data: 'three' })
      ]);

      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Multiple deletes in same tick
      await Promise.all([
        cache.delete('batch:delete:1'),
        cache.delete('batch:delete:2'),
        cache.delete('batch:delete:3')
      ]);

      // Should have made 1 batch request
      expect(httpSpy).toHaveBeenCalledWith('/cache/batch', expect.anything());
      expect(httpSpy).toHaveBeenCalledTimes(1);

      // Verify data was actually deleted
      const results = await Promise.all([
        cache.get('batch:delete:1'),
        cache.get('batch:delete:2'),
        cache.get('batch:delete:3')
      ]);

      expect(results[0]).toBeNull();
      expect(results[1]).toBeNull();
      expect(results[2]).toBeNull();

      httpSpy.mockRestore();
    });

    it('should batch mixed get/set/delete operations', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Mix of operations
      await Promise.all([
        cache.set('batch:mixed:1', { data: 'new' }),
        cache.get('batch:user:1'),
        cache.delete('batch:mixed:1')
      ]);

      // Should make 1 batch request
      expect(httpSpy).toHaveBeenCalledTimes(1);
      const batchCall = httpSpy.mock.calls[0][1] as any;

      expect(batchCall.operations).toHaveLength(3);
      expect(batchCall.operations[0].op).toBe('set');
      expect(batchCall.operations[1].op).toBe('get');
      expect(batchCall.operations[2].op).toBe('delete');

      httpSpy.mockRestore();
    });

    it('should maintain operation order for set then delete', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Set and immediately delete in same tick
      await Promise.all([
        cache.set('batch:temp', { data: 'temporary' }),
        cache.delete('batch:temp')
      ]);

      // Operations should be in order
      const batchCall = httpSpy.mock.calls[0][1] as any;
      expect(batchCall.operations[0]).toMatchObject({ op: 'set', key: 'batch:temp' });
      expect(batchCall.operations[1]).toMatchObject({ op: 'delete', key: 'batch:temp' });

      httpSpy.mockRestore();
    });
  });
});
