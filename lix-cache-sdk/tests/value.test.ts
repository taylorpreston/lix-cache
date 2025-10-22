import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { z } from 'zod';
import { LixCache } from '../src/client';

describe('Value', () => {
  const cache = new LixCache({ url: 'http://localhost:4000' });

  beforeAll(async () => {
    await cache.clear();
  });

  afterAll(async () => {
    await cache.clear();
  });

  describe('TypeScript-only values (no Zod)', () => {
    interface AppConfig {
      theme: string;
      apiUrl: string;
    }

    interface User {
      name: string;
      age: number;
    }

    it('should create a value without schema', () => {
      const config = cache.value<AppConfig>('config:app');
      expect(config).toBeDefined();
    });

    it('should set and get with TypeScript types only', async () => {
      const config = cache.value<AppConfig>('config:app');

      const data: AppConfig = {
        theme: 'dark',
        apiUrl: 'https://api.example.com',
      };

      await config.set(data);
      const retrieved = await config.get();

      expect(retrieved).toEqual(data);
      expect(retrieved?.theme).toBe('dark');
      expect(retrieved?.apiUrl).toBe('https://api.example.com');
    });

    it('should return null for non-existent value', async () => {
      const config = cache.value<AppConfig>('config:nonexistent');
      const result = await config.get();
      expect(result).toBeNull();
    });

    it('should delete value', async () => {
      const config = cache.value<AppConfig>('config:delete-test');

      await config.set({ theme: 'light', apiUrl: 'https://...' });
      expect(await config.exists()).toBe(true);

      await config.delete();
      expect(await config.exists()).toBe(false);

      const result = await config.get();
      expect(result).toBeNull();
    });

    it('should check existence', async () => {
      const config = cache.value<AppConfig>('config:exists-test');

      expect(await config.exists()).toBe(false);

      await config.set({ theme: 'dark', apiUrl: 'https://...' });
      expect(await config.exists()).toBe(true);
    });

    it('should work with TTL', async () => {
      const config = cache.value<AppConfig>('config:ttl-test');

      await config.set(
        { theme: 'dark', apiUrl: 'https://...' },
        { ttl: 1 }
      );

      // Should exist immediately
      let data = await config.get();
      expect(data).toBeDefined();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be gone
      data = await config.get();
      expect(data).toBeNull();
    });

    it('should work with remember()', async () => {
      await cache.clear();

      const config = cache.value<AppConfig>('config:remember-test');

      let callCount = 0;
      const fetchConfig = async (): Promise<AppConfig> => {
        callCount++;
        return { theme: 'dark', apiUrl: 'https://...' };
      };

      // First call - cache miss
      const data1 = await config.remember(fetchConfig);
      expect(data1).toEqual({ theme: 'dark', apiUrl: 'https://...' });
      expect(callCount).toBe(1);

      // Second call - cache hit
      const data2 = await config.remember(fetchConfig);
      expect(data2).toEqual({ theme: 'dark', apiUrl: 'https://...' });
      expect(callCount).toBe(1); // Not called again!
    });

    it('should work with different value types', async () => {
      const boolValue = cache.value<boolean>('flag:enabled');
      await boolValue.set(true);
      expect(await boolValue.get()).toBe(true);

      const stringValue = cache.value<string>('app:name');
      await stringValue.set('My App');
      expect(await stringValue.get()).toBe('My App');

      const numberValue = cache.value<number>('count');
      await numberValue.set(42);
      expect(await numberValue.get()).toBe(42);

      const arrayValue = cache.value<string[]>('tags');
      await arrayValue.set(['a', 'b', 'c']);
      expect(await arrayValue.get()).toEqual(['a', 'b', 'c']);
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

      const data = cache.value<ComplexData>('complex:data');

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

      await data.set(complexValue);
      const retrieved = await data.get();

      expect(retrieved).toEqual(complexValue);
      expect(retrieved?.user.profile.age).toBe(30);
      expect(retrieved?.tags).toEqual(['admin', 'premium']);
    });
  });

  describe('Zod-validated values', () => {
    const AppConfigSchema = z.object({
      theme: z.string(),
      apiUrl: z.string().url(),
    });

    const UserSchema = z.object({
      name: z.string(),
      age: z.number().min(0).max(150),
      email: z.string().email(),
    });

    type AppConfig = z.infer<typeof AppConfigSchema>;
    type User = z.infer<typeof UserSchema>;

    it('should create a value with schema', () => {
      const config = cache.value('config:app', AppConfigSchema);
      expect(config).toBeDefined();
    });

    it('should set and get with validation', async () => {
      const config = cache.value('config:app', AppConfigSchema);

      const data: AppConfig = {
        theme: 'dark',
        apiUrl: 'https://api.example.com',
      };

      await config.set(data);
      const retrieved = await config.get();

      expect(retrieved).toEqual(data);
    });

    it('should validate on set and throw on invalid data', async () => {
      const config = cache.value('config:app', AppConfigSchema);

      // Invalid URL
      await expect(
        config.set({ theme: 'dark', apiUrl: 'not-a-url' } as any)
      ).rejects.toThrow();
    });

    it('should validate on get (catches bad cached data)', async () => {
      const config = cache.value('config:bad-data', AppConfigSchema);

      // Manually set invalid data
      await cache.set('config:bad-data', { invalid: 'data' });

      // Should throw when getting with schema
      await expect(config.get()).rejects.toThrow();
    });

    it('should validate with complex rules', async () => {
      const user = cache.value('user:test', UserSchema);

      // Valid data
      await user.set({
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      });

      // Invalid age (too old)
      await expect(
        user.set({
          name: 'Bob',
          age: 200,
          email: 'bob@example.com',
        })
      ).rejects.toThrow();

      // Invalid email format
      await expect(
        user.set({
          name: 'Charlie',
          age: 25,
          email: 'not-an-email',
        })
      ).rejects.toThrow();
    });

    it('should validate in remember()', async () => {
      await cache.clear();

      const user = cache.value('user:remember', UserSchema);

      // Valid fallback
      const validUser = await user.remember(async () => ({
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      }));
      expect(validUser.name).toBe('Alice');

      // Invalid fallback should throw
      await cache.delete('user:remember-invalid');
      const invalidUser = cache.value('user:remember-invalid', UserSchema);
      await expect(
        invalidUser.remember(async () => ({
          name: 'Bob',
          age: 200, // Too old
          email: 'bob@example.com',
        }))
      ).rejects.toThrow();
    });
  });

  describe('Number operations (incr/decr)', () => {
    it('should increment numeric value', async () => {
      const views = cache.value<number>('page:views');

      // Start from 0
      await cache.delete('page:views');
      const result1 = await views.incr();
      expect(result1).toBe(1);

      // Increment by 1 (default)
      const result2 = await views.incr();
      expect(result2).toBe(2);

      // Increment by custom amount
      const result3 = await views.incr(10);
      expect(result3).toBe(12);
    });

    it('should decrement numeric value', async () => {
      const credits = cache.value<number>('user:credits');

      // Set initial value
      await credits.set(100);

      // Decrement by 1 (default)
      const result1 = await credits.decr();
      expect(result1).toBe(99);

      // Decrement by custom amount
      const result2 = await credits.decr(5);
      expect(result2).toBe(94);
    });

    it('should work with negative numbers', async () => {
      const balance = cache.value<number>('balance');

      await balance.set(5);
      await balance.decr(10);
      const result = await balance.get();
      expect(result).toBe(-5);
    });
  });

  describe('Type requirement', () => {
    it('should require type parameter for TypeScript-only', () => {
      // This is a compile-time check, but we can verify runtime behavior
      interface TestData {
        value: string;
      }

      const data = cache.value<TestData>('test:typed');
      expect(data).toBeDefined();

      // Without type parameter (defaults to never), can't call methods
      // const badData = cache.value('test:untyped');
      // badData.set({ value: 'test' }); // TypeScript error!
    });
  });

  describe('Remember with deduplication', () => {
    it('should deduplicate concurrent remember() calls', async () => {
      await cache.clear();

      interface Report {
        data: string;
        timestamp: number;
      }

      const report = cache.value<Report>('report:daily');

      let callCount = 0;
      const generateReport = async (): Promise<Report> => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return { data: 'report data', timestamp: Date.now() };
      };

      // Make 5 simultaneous remember() calls
      const results = await Promise.all([
        report.remember(generateReport),
        report.remember(generateReport),
        report.remember(generateReport),
        report.remember(generateReport),
        report.remember(generateReport),
      ]);

      // All results should be identical
      const firstResult = results[0];
      results.forEach(result => {
        expect(result).toEqual(firstResult);
      });

      // Fallback should only be called once
      expect(callCount).toBe(1);
    });
  });

  describe('Error handling', () => {
    it('should propagate errors in remember()', async () => {
      const config = cache.value<{ data: string }>('config:error');

      await expect(
        config.remember(async () => {
          throw new Error('Computation failed');
        })
      ).rejects.toThrow('Computation failed');

      // Should NOT cache the error
      const cached = await config.get();
      expect(cached).toBeNull();
    });
  });

  describe('Isolation', () => {
    it('should isolate TypeScript-only and Zod values', async () => {
      interface SimpleConfig {
        value: string;
      }

      const ValidatedSchema = z.object({
        value: z.string(),
        validated: z.boolean(),
      });

      const tsValue = cache.value<SimpleConfig>('isolation:ts');
      const zodValue = cache.value('isolation:zod', ValidatedSchema);

      await tsValue.set({ value: 'ts' });
      await zodValue.set({ value: 'zod', validated: true });

      const tsData = await tsValue.get();
      const zodData = await zodValue.get();

      expect(tsData?.value).toBe('ts');
      expect(zodData?.value).toBe('zod');
      expect(zodData?.validated).toBe(true);
    });

    it('should not interfere with raw cache operations', async () => {
      const value = cache.value<{ data: string }>('test:value');

      await value.set({ data: 'from value' });

      // Raw cache can also access the same key
      const rawData = await cache.get('test:value');
      expect(rawData).toEqual({ data: 'from value' });

      // Raw cache can update it
      await cache.set('test:value', { data: 'from raw' });

      // Value sees the update
      const valueData = await value.get();
      expect(valueData).toEqual({ data: 'from raw' });
    });
  });

  describe('Use cases', () => {
    it('should work for app configuration', async () => {
      interface Config {
        theme: 'light' | 'dark';
        language: string;
        notifications: boolean;
      }

      const appConfig = cache.value<Config>('app:config');

      await appConfig.set({
        theme: 'dark',
        language: 'en',
        notifications: true,
      });

      const config = await appConfig.get();
      expect(config?.theme).toBe('dark');
    });

    it('should work for feature flags', async () => {
      const darkMode = cache.value<boolean>('feature:dark-mode');
      const betaFeatures = cache.value<boolean>('feature:beta');

      await darkMode.set(true);
      await betaFeatures.set(false);

      expect(await darkMode.get()).toBe(true);
      expect(await betaFeatures.get()).toBe(false);
    });

    it('should work for counters/metrics', async () => {
      const pageViews = cache.value<number>('metrics:page-views');
      const activeUsers = cache.value<number>('metrics:active-users');

      await pageViews.set(0);
      await activeUsers.set(0);

      await pageViews.incr(100);
      await activeUsers.incr(5);

      expect(await pageViews.get()).toBe(100);
      expect(await activeUsers.get()).toBe(5);
    });
  });
});
