import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { LixCache } from '../src/client';

describe('Request Deduplication', () => {
  const cache = new LixCache({ url: 'http://localhost:4000' });

  beforeAll(async () => {
    // Clear cache and set up test data
    await cache.clear();

    await cache.set('test:user:1', { name: 'Alice', age: 30 });
    await cache.set('test:user:2', { name: 'Bob', age: 25 });
  });

  afterAll(async () => {
    await cache.clear();
  });

  describe('Simultaneous requests', () => {
    it('should deduplicate multiple simultaneous get() calls', async () => {
      // Spy on the HTTP client to count actual batch requests
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Make 5 simultaneous requests for the same key
      const promises = [
        cache.get('test:user:1'),
        cache.get('test:user:1'),
        cache.get('test:user:1'),
        cache.get('test:user:1'),
        cache.get('test:user:1'),
      ];

      const results = await Promise.all(promises);

      // All results should be the same
      results.forEach(result => {
        expect(result).toEqual({ name: 'Alice', age: 30 });
      });

      // Should make 1 batch request
      expect(httpSpy).toHaveBeenCalledTimes(1);

      httpSpy.mockRestore();
    });

    it('should deduplicate different keys independently', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Multiple requests for different keys
      const [user1a, user1b, user2a, user2b] = await Promise.all([
        cache.get('test:user:1'),
        cache.get('test:user:1'), // Deduplicated with first
        cache.get('test:user:2'),
        cache.get('test:user:2'), // Deduplicated with third
      ]);

      // Each user should have correct data
      expect(user1a).toEqual({ name: 'Alice', age: 30 });
      expect(user1b).toEqual({ name: 'Alice', age: 30 });
      expect(user2a).toEqual({ name: 'Bob', age: 25 });
      expect(user2b).toEqual({ name: 'Bob', age: 25 });

      // Should make 1 batch request (both keys in same batch)
      expect(httpSpy).toHaveBeenCalledTimes(1);

      httpSpy.mockRestore();
    });

    it('should deduplicate requests for non-existent keys', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Multiple requests for key that doesn't exist
      const promises = [
        cache.get('nonexistent'),
        cache.get('nonexistent'),
        cache.get('nonexistent'),
      ];

      const results = await Promise.all(promises);

      // All should return null
      results.forEach(result => {
        expect(result).toBeNull();
      });

      // Only 1 batch request made
      expect(httpSpy).toHaveBeenCalledTimes(1);

      httpSpy.mockRestore();
    });
  });

  describe('Sequential requests', () => {
    it('should NOT deduplicate sequential requests', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Sequential requests (each waits for previous)
      const result1 = await cache.get('test:user:1');
      const result2 = await cache.get('test:user:1');
      const result3 = await cache.get('test:user:1');

      // All should return same data
      expect(result1).toEqual({ name: 'Alice', age: 30 });
      expect(result2).toEqual({ name: 'Alice', age: 30 });
      expect(result3).toEqual({ name: 'Alice', age: 30 });

      // Should make 3 separate batch requests (not in same tick)
      expect(httpSpy).toHaveBeenCalledTimes(3);

      httpSpy.mockRestore();
    });
  });

  describe('Error handling', () => {
    it('should propagate errors to all waiting callers', async () => {
      // Temporarily break the connection
      const brokenCache = new LixCache({ url: 'http://localhost:9999' });

      // Multiple simultaneous requests to broken server
      const promises = [
        brokenCache.get('any:key'),
        brokenCache.get('any:key'),
        brokenCache.get('any:key'),
      ];

      // All should reject with the same error
      await expect(Promise.all(promises)).rejects.toThrow();
    });

    it('should clean up batch queue after error', async () => {
      const brokenCache = new LixCache({ url: 'http://localhost:9999' });

      // First request fails
      await expect(brokenCache.get('any:key')).rejects.toThrow();

      // Batch queue should be empty (cleaned up after flush)
      expect((brokenCache as any).batchQueue.length).toBe(0);
    });
  });

  describe('Mixed operations', () => {
    it('should handle mix of simultaneous and sequential requests', async () => {
      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Batch 1: Simultaneous
      const batch1 = await Promise.all([
        cache.get('test:user:1'),
        cache.get('test:user:1'),
        cache.get('test:user:1'),
      ]);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Batch 2: Simultaneous (after batch 1 completes)
      const batch2 = await Promise.all([
        cache.get('test:user:1'),
        cache.get('test:user:1'),
      ]);

      // All results correct
      batch1.forEach(r => expect(r).toEqual({ name: 'Alice', age: 30 }));
      batch2.forEach(r => expect(r).toEqual({ name: 'Alice', age: 30 }));

      // Should make 2 batch requests (one per batch)
      expect(httpSpy).toHaveBeenCalledTimes(2);

      httpSpy.mockRestore();
    });
  });

  describe('Memory cleanup', () => {
    it('should clean up batch queue after request completes', async () => {
      // Make a request
      await cache.get('test:user:1');

      // Batch queue should be empty after flush
      expect((cache as any).batchQueue.length).toBe(0);
    });

    it('should clean up batch queue even with simultaneous requests', async () => {
      // Start simultaneous requests
      const promise1 = cache.get('test:user:1');
      const promise2 = cache.get('test:user:1');

      // Let them complete
      await Promise.all([promise1, promise2]);

      // Batch queue should be empty
      expect((cache as any).batchQueue.length).toBe(0);
    });
  });

  describe('Collections integration', () => {
    it('should deduplicate collection get() calls', async () => {
      const { z } = await import('zod');

      const UserSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const users = cache.collection('test:user:', UserSchema);

      const httpSpy = vi.spyOn((cache as any).http, 'post');

      // Multiple simultaneous collection requests
      const [user1, user2, user3] = await Promise.all([
        users.get('1'),
        users.get('1'),
        users.get('1'),
      ]);

      // All should have same data
      expect(user1).toEqual({ name: 'Alice', age: 30 });
      expect(user2).toEqual({ name: 'Alice', age: 30 });
      expect(user3).toEqual({ name: 'Alice', age: 30 });

      // Only 1 batch request
      expect(httpSpy).toHaveBeenCalledTimes(1);

      httpSpy.mockRestore();
    });
  });
});
