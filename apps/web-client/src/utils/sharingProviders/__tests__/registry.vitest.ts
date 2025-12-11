import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  registerSharingProvider,
  getRegisteredProviders,
  getProviderById,
  shareWith,
  loadShared,
  clearProviders,
} from '../registry';
import type { SharingProviderPlugin } from '../types';

describe('sharingProviders/registry', () => {
  const mockProvider: SharingProviderPlugin = {
    providerId: 'test',
    name: 'Test Provider',
    share: vi.fn(async (content) => ({
      shareId: 'test-123',
      providerId: 'test',
      url: `http://localhost?share=test:test-123`,
    })),
    load: vi.fn(async (shareId) => `SELECT * FROM test_${shareId}`),
  };

  beforeEach(() => {
    // Clear registry before each test
    clearProviders();
  });

  describe('registerSharingProvider', () => {
    test('should register a new provider', () => {
      registerSharingProvider(mockProvider);

      const providers = getRegisteredProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].providerId).toBe('test');
    });

    test('should replace existing provider with same ID', () => {
      registerSharingProvider(mockProvider);

      const updatedProvider: SharingProviderPlugin = {
        providerId: 'test',
        name: 'Updated Test Provider',
        share: vi.fn(async () => ({
          shareId: 'updated-123',
          providerId: 'test',
          url: 'http://localhost?share=test:updated-123',
        })),
        load: vi.fn(async () => 'SELECT 1'),
      };

      registerSharingProvider(updatedProvider);

      const providers = getRegisteredProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('Updated Test Provider');
    });

    test('should register multiple providers', () => {
      const provider1: SharingProviderPlugin = {
        providerId: 'provider1',
        name: 'Provider 1',
        share: vi.fn(async () => ({
          shareId: '1',
          providerId: 'provider1',
          url: 'http://localhost?share=provider1:1',
        })),
        load: vi.fn(async () => 'SELECT 1'),
      };

      const provider2: SharingProviderPlugin = {
        providerId: 'provider2',
        name: 'Provider 2',
        share: vi.fn(async () => ({
          shareId: '2',
          providerId: 'provider2',
          url: 'http://localhost?share=provider2:2',
        })),
        load: vi.fn(async () => 'SELECT 2'),
      };

      registerSharingProvider(provider1);
      registerSharingProvider(provider2);

      const providers = getRegisteredProviders();
      expect(providers).toHaveLength(2);
      expect(providers.map((p) => p.providerId)).toEqual(['provider1', 'provider2']);
    });
  });

  describe('getRegisteredProviders', () => {
    test('should return copy of registry', () => {
      registerSharingProvider(mockProvider);

      const providers1 = getRegisteredProviders();
      const providers2 = getRegisteredProviders();

      expect(providers1).not.toBe(providers2);
      expect(providers1).toEqual(providers2);
    });

    test('should return empty array if no providers registered', () => {
      const providers = getRegisteredProviders();
      expect(providers).toEqual([]);
    });
  });

  describe('getProviderById', () => {
    test('should find provider by ID', () => {
      registerSharingProvider(mockProvider);

      const provider = getProviderById('test');
      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe('test');
    });

    test('should return undefined for unknown provider', () => {
      const provider = getProviderById('unknown');
      expect(provider).toBeUndefined();
    });

    test('should return correct provider when multiple exist', () => {
      const provider1: SharingProviderPlugin = {
        providerId: 'provider1',
        name: 'Provider 1',
        share: vi.fn(async () => ({
          shareId: '1',
          providerId: 'provider1',
          url: 'http://localhost',
        })),
        load: vi.fn(async () => 'SELECT 1'),
      };

      const provider2: SharingProviderPlugin = {
        providerId: 'provider2',
        name: 'Provider 2',
        share: vi.fn(async () => ({
          shareId: '2',
          providerId: 'provider2',
          url: 'http://localhost',
        })),
        load: vi.fn(async () => 'SELECT 2'),
      };

      registerSharingProvider(provider1);
      registerSharingProvider(provider2);

      expect(getProviderById('provider1')?.name).toBe('Provider 1');
      expect(getProviderById('provider2')?.name).toBe('Provider 2');
    });
  });

  describe('shareWith', () => {
    test('should share content using registered provider', async () => {
      registerSharingProvider(mockProvider);

      const result = await shareWith('test', {
        sql: 'SELECT 1',
        tabName: 'Test Query',
      });

      expect(result.shareId).toBe('test-123');
      expect(result.providerId).toBe('test');
      expect(mockProvider.share).toHaveBeenCalledWith({
        sql: 'SELECT 1',
        tabName: 'Test Query',
      });
    });

    test('should throw for unknown provider', async () => {
      await expect(
        shareWith('unknown', { sql: 'SELECT 1' }),
      ).rejects.toThrow('Unknown sharing provider: unknown');
    });

    test('should propagate provider errors', async () => {
      const errorProvider: SharingProviderPlugin = {
        providerId: 'error',
        name: 'Error Provider',
        share: vi.fn(async () => {
          throw new Error('Share failed');
        }),
        load: vi.fn(async () => 'SELECT 1'),
      };

      registerSharingProvider(errorProvider);

      await expect(
        shareWith('error', { sql: 'SELECT 1' }),
      ).rejects.toThrow('Share failed');
    });
  });

  describe('loadShared', () => {
    test('should load shared content', async () => {
      registerSharingProvider(mockProvider);

      const sql = await loadShared('test:abc123');

      expect(sql).toBe('SELECT * FROM test_abc123');
      expect(mockProvider.load).toHaveBeenCalledWith('abc123');
    });

    test('should throw for invalid share format', async () => {
      await expect(loadShared('invalid')).rejects.toThrow('Invalid share format');
    });

    test('should throw for missing share ID', async () => {
      await expect(loadShared('test:')).rejects.toThrow('Invalid share format');
    });

    test('should throw for unknown provider', async () => {
      await expect(loadShared('unknown:abc123')).rejects.toThrow(
        'Unknown sharing provider: unknown',
      );
    });

    test('should propagate provider errors', async () => {
      const errorProvider: SharingProviderPlugin = {
        providerId: 'error',
        name: 'Error Provider',
        share: vi.fn(async () => ({
          shareId: 'x',
          providerId: 'error',
          url: '',
        })),
        load: vi.fn(async () => {
          throw new Error('Load failed');
        }),
      };

      registerSharingProvider(errorProvider);

      await expect(loadShared('error:abc123')).rejects.toThrow('Load failed');
    });
  });

  describe('Plugin system design', () => {
    test('should support provider with optional isAvailable method', async () => {
      const providerWithAvailable: SharingProviderPlugin = {
        providerId: 'available',
        name: 'Available Provider',
        share: vi.fn(async () => ({
          shareId: '1',
          providerId: 'available',
          url: '',
        })),
        load: vi.fn(async () => 'SELECT 1'),
        isAvailable: vi.fn(async () => true),
      };

      registerSharingProvider(providerWithAvailable);

      const provider = getProviderById('available');
      expect(provider?.isAvailable).toBeDefined();

      if (provider?.isAvailable) {
        const available = await provider.isAvailable();
        expect(available).toBe(true);
      }
    });

    test('should support custom provider implementation', async () => {
      const customProvider: SharingProviderPlugin = {
        providerId: 'custom',
        name: 'Custom Provider',
        icon: '🔗',
        share: async (content) => ({
          shareId: `custom-${Date.now()}`,
          providerId: 'custom',
          url: `http://localhost?share=custom:${Date.now()}`,
        }),
        load: async (shareId) => `-- Loaded from custom: ${shareId}`,
      };

      registerSharingProvider(customProvider);

      const result = await shareWith('custom', { sql: 'SELECT 1' });
      expect(result.providerId).toBe('custom');
      expect(result.shareId).toMatch(/^custom-\d+$/);

      const sql = await loadShared(`custom:${result.shareId}`);
      expect(sql).toContain('Loaded from custom');
    });
  });
});
