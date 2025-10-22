import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { LixCache } from '../src/client';

describe('LixCache', () => {
  let lix: LixCache;

  beforeEach(() => {
    lix = new LixCache({
      url: process.env.LIX_CACHE_URL || 'http://localhost:4000',
    });
  });

  // Clean up only at the very end of all tests
  afterAll(async () => {
    try {
      await lix.clear();
    } catch (error) {
      // Ignore errors if server is not running
    }
  });

  describe('Basic Operations', () => {
    it('should set and get a value', async () => {
      const testValue = { name: 'Alice', age: 30 };

      await lix.set('test:user', testValue);
      const result = await lix.get<typeof testValue>('test:user');

      expect(result).toEqual(testValue);
    });

    it('should return null for non-existent key', async () => {
      const result = await lix.get('nonexistent:key:12345');
      expect(result).toBeNull();
    });

    it('should delete a value', async () => {
      await lix.set('test:delete', { foo: 'bar' });
      await lix.delete('test:delete');

      const result = await lix.get('test:delete');
      expect(result).toBeNull();
    });

    it('should set with TTL', async () => {
      await lix.set('test:ttl', { value: 'expires' }, { ttl: 1 });
      const result = await lix.get('test:ttl');

      expect(result).toEqual({ value: 'expires' });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const expired = await lix.get('test:ttl');
      expect(expired).toBeNull();
    });
  });

  describe('Counters', () => {
    it('should increment a counter', async () => {
      const count1 = await lix.incr('test:counter:1');
      expect(count1).toBe(1);

      const count2 = await lix.incr('test:counter:1');
      expect(count2).toBe(2);
    });

    it('should increment by custom amount', async () => {
      const count = await lix.incr('test:counter:2', 10);
      expect(count).toBe(10);
    });

    it('should decrement a counter', async () => {
      await lix.set('test:counter:3', 10);
      const count = await lix.decr('test:counter:3', 3);
      expect(count).toBe(7);
    });

    it('should increment existing numeric value', async () => {
      await lix.set('test:counter:4', 100);
      const count = await lix.incr('test:counter:4', 5);
      expect(count).toBe(105);
    });
  });

  describe('Scan', () => {
    beforeEach(async () => {
      // Setup test data with unique prefixes
      await lix.set('scantest:user:1', { name: 'Alice' });
      await lix.set('scantest:user:2', { name: 'Bob' });
      await lix.set('scantest:user:3', { name: 'Charlie' });
      await lix.set('scantest:product:1', { title: 'Laptop' });
    });

    it('should scan by prefix with values', async () => {
      const result = await lix.scan('scantest:user:');

      expect(result.count).toBe(3);
      expect(result.items).toHaveLength(3);
      expect(result.items?.every((item) => item.key.startsWith('scantest:user:'))).toBe(true);
    });

    it('should scan by prefix with keys only', async () => {
      const result = await lix.scan('scantest:user:', { keysOnly: true });

      expect(result.count).toBe(3);
      expect(result.keys).toHaveLength(3);
      expect(result.keys?.every((key) => key.startsWith('scantest:user:'))).toBe(true);
      expect(result.items).toBeUndefined();
    });

    it('should scan all items with empty prefix', async () => {
      const result = await lix.scan('');

      expect(result.count).toBeGreaterThanOrEqual(4); // At least our 4 test items
    });

    it('should return empty results for non-matching prefix', async () => {
      const result = await lix.scan('nonexistent:prefix:xyz:');

      expect(result.count).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  describe('Batch Operations', () => {
    it('should execute batch operations', async () => {
      // Setup
      await lix.set('batch:1', { value: 'one' });

      const results = await lix.batch([
        { op: 'get', key: 'batch:1' },
        { op: 'set', key: 'batch:2', value: { value: 'two' } },
        { op: 'get', key: 'batch:2' },
      ]);

      expect(results).toHaveLength(3);

      // First operation - get existing key
      expect(results[0].op).toBe('get');
      expect(results[0].key).toBe('batch:1');
      if (results[0].op === 'get') {
        expect(results[0].value).toEqual({ value: 'one' });
      }

      // Second operation - set new key
      expect(results[1].op).toBe('set');
      expect(results[1].key).toBe('batch:2');
      if (results[1].op === 'set') {
        expect(results[1].success).toBe(true);
      }

      // Third operation - get newly set key
      expect(results[2].op).toBe('get');
      expect(results[2].key).toBe('batch:2');
      if (results[2].op === 'get') {
        expect(results[2].value).toEqual({ value: 'two' });
      }
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const client = new LixCache();
      expect(client).toBeInstanceOf(LixCache);
    });

    it('should use custom configuration', () => {
      const client = new LixCache({
        url: 'http://custom:4000',
        timeout: 10000,
        maxRetries: 5,
      });
      expect(client).toBeInstanceOf(LixCache);
    });

    it('should read URL from environment variable', () => {
      process.env.LIX_CACHE_URL = 'http://env:4000';
      const client = new LixCache();
      expect(client).toBeInstanceOf(LixCache);
      delete process.env.LIX_CACHE_URL;
    });
  });

  // Management tests run LAST to avoid interfering with other tests
  describe('Management', () => {
    it('should check health', async () => {
      const health = await lix.health();

      expect(health.status).toBe('healthy');
    });

    it('should get cache stats', async () => {
      await lix.set('statstest:1', { value: 1 });

      const stats = await lix.stats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('limit');
      expect(stats.size).toBeGreaterThanOrEqual(1);
      expect(stats.limit).toBeGreaterThan(0);
    });

    // Clear test runs LAST to avoid affecting other tests
    it('should clear the cache', async () => {
      await lix.set('cleartest:1', { value: 1 });
      await lix.set('cleartest:2', { value: 2 });

      const result = await lix.clear();

      expect(result.success).toBe(true);
      expect(result.cleared).toBeGreaterThanOrEqual(2);

      const stats = await lix.stats();
      expect(stats.size).toBe(0);
    });
  });
});
