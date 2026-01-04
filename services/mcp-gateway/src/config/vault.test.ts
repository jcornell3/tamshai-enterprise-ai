/**
 * Vault Client Unit Tests
 *
 * Tests the VaultClient and getSecretWithFallback functions.
 * Uses mocked fetch for Vault API calls.
 */

import { VaultClient, getSecretWithFallback } from './vault';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock logger to avoid console noise
jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('VaultClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('create', () => {
    it('should return null when VAULT_ADDR is not set', async () => {
      delete process.env.VAULT_ADDR;

      const client = await VaultClient.create();

      expect(client).toBeNull();
    });

    it('should create client with dev token', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      const client = await VaultClient.create();

      expect(client).not.toBeNull();
    });

    it('should authenticate with AppRole when credentials provided', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_ROLE_ID = 'test-role-id';
      process.env.VAULT_SECRET_ID = 'test-secret-id';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          auth: {
            client_token: 'app-token',
            lease_duration: 3600,
            renewable: true,
          },
        }),
      });

      const client = await VaultClient.create();

      expect(client).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://vault:8200/v1/auth/approle/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            role_id: 'test-role-id',
            secret_id: 'test-secret-id',
          }),
        })
      );
    });

    it('should return null when AppRole authentication fails', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_ROLE_ID = 'test-role-id';
      process.env.VAULT_SECRET_ID = 'test-secret-id';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const client = await VaultClient.create();

      expect(client).toBeNull();
    });

    it('should return null when no auth method available', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      // No VAULT_TOKEN, VAULT_ROLE_ID, or VAULT_SECRET_ID

      const client = await VaultClient.create();

      expect(client).toBeNull();
    });
  });

  describe('getSecret', () => {
    it('should read secret from Vault', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            data: {
              claude_api_key: 'sk-test-key',
              other_secret: 'other-value',
            },
            metadata: {
              created_time: '2024-01-01T00:00:00Z',
              version: 1,
            },
          },
        }),
      });

      const client = await VaultClient.create();
      const secret = await client!.getSecret('mcp-gateway', 'claude_api_key');

      expect(secret).toBe('sk-test-key');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://vault:8200/v1/tamshai/data/mcp-gateway',
        expect.objectContaining({
          headers: { 'X-Vault-Token': 'dev-token' },
        })
      );
    });

    it('should return null for non-existent secret path', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const client = await VaultClient.create();
      const secret = await client!.getSecret('nonexistent', 'key');

      expect(secret).toBeNull();
    });

    it('should return null for non-existent key in existing path', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            data: {
              existing_key: 'value',
            },
            metadata: { version: 1 },
          },
        }),
      });

      const client = await VaultClient.create();
      const secret = await client!.getSecret('mcp-gateway', 'nonexistent_key');

      expect(secret).toBeNull();
    });

    it('should cache secrets', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            data: { key: 'cached-value' },
            metadata: { version: 1 },
          },
        }),
      });

      const client = await VaultClient.create();

      // First call - should hit Vault
      await client!.getSecret('path', 'key');

      // Second call - should use cache
      await client!.getSecret('path', 'key');

      // Only one fetch call (for the first read)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use custom mount path', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';
      process.env.VAULT_MOUNT_PATH = 'custom-mount';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { data: { key: 'value' }, metadata: { version: 1 } },
        }),
      });

      const client = await VaultClient.create();
      await client!.getSecret('path', 'key');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://vault:8200/v1/custom-mount/data/path',
        expect.any(Object)
      );
    });
  });

  describe('getSecrets', () => {
    it('should return all secrets at a path', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            data: {
              key1: 'value1',
              key2: 'value2',
            },
            metadata: { version: 1 },
          },
        }),
      });

      const client = await VaultClient.create();
      const secrets = await client!.getSecrets('mcp-gateway');

      expect(secrets).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('should return null for non-existent path', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const client = await VaultClient.create();
      const secrets = await client!.getSecrets('nonexistent');

      expect(secrets).toBeNull();
    });
  });

  describe('isHealthy', () => {
    it('should return true when Vault is healthy', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      mockFetch
        .mockResolvedValueOnce({ ok: true }) // health check in isHealthy
        .mockResolvedValueOnce({ ok: true }); // initial health check

      const client = await VaultClient.create();

      mockFetch.mockResolvedValueOnce({ ok: true });
      const healthy = await client!.isHealthy();

      expect(healthy).toBe(true);
    });

    it('should return false when Vault is unhealthy', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      const client = await VaultClient.create();

      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      const healthy = await client!.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false when fetch throws', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      const client = await VaultClient.create();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const healthy = await client!.isHealthy();

      expect(healthy).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'dev-token';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { data: { key: 'value' }, metadata: { version: 1 } },
        }),
      });

      const client = await VaultClient.create();

      // First call
      await client!.getSecret('path', 'key');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call (cached)
      await client!.getSecret('path', 'key');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clear cache
      client!.clearCache();

      // Third call (not cached)
      await client!.getSecret('path', 'key');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('getSecretWithFallback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return Vault value when available', async () => {
    process.env.VAULT_ADDR = 'http://vault:8200';
    process.env.VAULT_TOKEN = 'dev-token';
    process.env.MY_SECRET = 'env-value';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { data: { key: 'vault-value' }, metadata: { version: 1 } },
      }),
    });

    const client = await VaultClient.create();
    const value = await getSecretWithFallback(
      client,
      'path',
      'key',
      'MY_SECRET'
    );

    expect(value).toBe('vault-value');
  });

  it('should fall back to env var when Vault returns null', async () => {
    process.env.VAULT_ADDR = 'http://vault:8200';
    process.env.VAULT_TOKEN = 'dev-token';
    process.env.MY_SECRET = 'env-value';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const client = await VaultClient.create();
    const value = await getSecretWithFallback(
      client,
      'nonexistent',
      'key',
      'MY_SECRET'
    );

    expect(value).toBe('env-value');
  });

  it('should fall back to env var when client is null', async () => {
    process.env.MY_SECRET = 'env-value';

    const value = await getSecretWithFallback(null, 'path', 'key', 'MY_SECRET');

    expect(value).toBe('env-value');
  });

  it('should return default when neither Vault nor env has value', async () => {
    const value = await getSecretWithFallback(
      null,
      'path',
      'key',
      'NONEXISTENT_VAR',
      'default-value'
    );

    expect(value).toBe('default-value');
  });

  it('should return undefined when no value and no default', async () => {
    const value = await getSecretWithFallback(
      null,
      'path',
      'key',
      'NONEXISTENT_VAR'
    );

    expect(value).toBeUndefined();
  });
});
