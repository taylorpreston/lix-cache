import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LixCache } from '../src/client';

describe('API Key Warning', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on console.warn before each test
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.warn after each test
    warnSpy.mockRestore();
  });

  describe('Remote server without API key', () => {
    it('should warn when connecting to remote server without API key', () => {
      new LixCache({ url: 'https://cache.example.com' });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connecting to remote server without API key')
      );
    });

    it('should warn for HTTP remote server without API key', () => {
      new LixCache({ url: 'http://cache.example.com' });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connecting to remote server without API key')
      );
    });

    it('should warn for remote server with port without API key', () => {
      new LixCache({ url: 'https://cache.example.com:8080' });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connecting to remote server without API key')
      );
    });
  });

  describe('Localhost detection (should NOT warn)', () => {
    it('should NOT warn for localhost', () => {
      new LixCache({ url: 'http://localhost:4000' });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should NOT warn for 127.0.0.1', () => {
      new LixCache({ url: 'http://127.0.0.1:4000' });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should NOT warn for ::1 (IPv6 localhost)', () => {
      new LixCache({ url: 'http://[::1]:4000' });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should NOT warn for localhost with HTTPS', () => {
      new LixCache({ url: 'https://localhost:4000' });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should NOT warn for localhost without port', () => {
      new LixCache({ url: 'http://localhost' });

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Remote server with API key (should NOT warn)', () => {
    it('should NOT warn when API key is provided', () => {
      new LixCache({
        url: 'https://cache.example.com',
        apiKey: 'test-api-key',
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should NOT warn for HTTP remote with API key', () => {
      new LixCache({
        url: 'http://cache.example.com',
        apiKey: 'test-api-key',
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should NOT warn for remote with port and API key', () => {
      new LixCache({
        url: 'https://cache.example.com:8080',
        apiKey: 'test-api-key',
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Warning message content', () => {
    it('should include helpful information in warning message', () => {
      new LixCache({ url: 'https://cache.example.com' });

      expect(warnSpy).toHaveBeenCalledTimes(1);

      const warningMessage = warnSpy.mock.calls[0][0];
      expect(warningMessage).toContain('⚠️');
      expect(warningMessage).toContain('Lix Cache');
      expect(warningMessage).toContain('remote server');
      expect(warningMessage).toContain('API key');
      expect(warningMessage).toContain('authentication is enabled');
      expect(warningMessage).toContain('requests will fail');
      expect(warningMessage).toContain('new LixCache');
      expect(warningMessage).toContain('apiKey:');
    });
  });

  describe('Multiple instances', () => {
    it('should warn for each remote instance without API key', () => {
      new LixCache({ url: 'https://cache1.example.com' });
      new LixCache({ url: 'https://cache2.example.com' });

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('should warn once per instance (not per operation)', () => {
      const cache = new LixCache({ url: 'https://cache.example.com' });

      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Creating operations shouldn't trigger additional warnings
      // Note: We can't actually call these methods without a running server,
      // but the warning should only appear during construction
    });

    it('should NOT warn for mixed instances (some localhost, some remote with key)', () => {
      new LixCache({ url: 'http://localhost:4000' }); // No warning
      new LixCache({
        url: 'https://cache.example.com',
        apiKey: 'test-key',
      }); // No warning

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should warn for subdomain without API key', () => {
      new LixCache({ url: 'https://api.cache.example.com' });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should warn for IP address (not localhost) without API key', () => {
      new LixCache({ url: 'http://192.168.1.100:4000' });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT warn for default config (defaults to localhost)', () => {
      new LixCache(); // Uses default localhost URL

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
