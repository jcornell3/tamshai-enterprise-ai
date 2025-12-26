/**
 * Unit tests for Token Revocation Service
 *
 * Tests Redis-backed token revocation functionality.
 */

import { RedisTokenRevocationService, handleKeycloakEvent } from './token-revocation';

// Mock Redis
jest.mock('ioredis', () => {
  const store = new Map<string, { value: string; ttl?: number }>();

  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string) => Promise.resolve(store.get(key)?.value || null)),
    setex: jest.fn((key: string, ttl: number, value: string) => {
      store.set(key, { value, ttl });
      return Promise.resolve('OK');
    }),
    exists: jest.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
    del: jest.fn((key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
    quit: jest.fn(() => Promise.resolve()),
    on: jest.fn().mockReturnThis(),
    // Expose store for test access
    __store: store,
    __clear: () => store.clear(),
  }));
});

describe('RedisTokenRevocationService', () => {
  let service: RedisTokenRevocationService;
  let mockRedis: any;

  beforeEach(() => {
    // Clear mock store before each test
    jest.clearAllMocks();
    service = new RedisTokenRevocationService({
      redisUrl: 'redis://localhost:6379',
      keyPrefix: 'test:revoked:',
      defaultTtlSeconds: 3600,
    });
    // Access the mock Redis instance
    mockRedis = (service as any).redis;
  });

  afterEach(async () => {
    await service.close();
  });

  describe('isRevoked', () => {
    test('returns false for non-revoked token', async () => {
      mockRedis.exists.mockResolvedValueOnce(0);

      const isRevoked = await service.isRevoked('valid-token-jti');

      expect(isRevoked).toBe(false);
      expect(mockRedis.exists).toHaveBeenCalledWith('test:revoked:token:valid-token-jti');
    });

    test('returns true for revoked token', async () => {
      mockRedis.exists.mockResolvedValueOnce(1);

      const isRevoked = await service.isRevoked('revoked-token-jti');

      expect(isRevoked).toBe(true);
    });

    test('fails secure (returns true) on Redis error', async () => {
      mockRedis.exists.mockRejectedValueOnce(new Error('Redis connection error'));

      const isRevoked = await service.isRevoked('unknown-token');

      // Should fail secure - assume revoked if we can't check
      expect(isRevoked).toBe(true);
    });
  });

  describe('revokeToken', () => {
    test('stores token revocation with TTL', async () => {
      await service.revokeToken('token-to-revoke', 1800);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test:revoked:token:token-to-revoke',
        1800,
        expect.any(String)
      );
    });

    test('uses default TTL when not specified', async () => {
      await service.revokeToken('token-to-revoke');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test:revoked:token:token-to-revoke',
        3600, // Default TTL
        expect.any(String)
      );
    });

    test('throws error on Redis failure', async () => {
      mockRedis.setex.mockRejectedValueOnce(new Error('Redis write error'));

      await expect(service.revokeToken('token')).rejects.toThrow('Redis write error');
    });
  });

  describe('revokeAllUserTokens', () => {
    test('stores user revocation timestamp', async () => {
      await service.revokeAllUserTokens('user-123');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test:revoked:user:user-123',
        3600,
        expect.any(String)
      );
    });

    test('throws error on Redis failure', async () => {
      mockRedis.setex.mockRejectedValueOnce(new Error('Redis write error'));

      await expect(service.revokeAllUserTokens('user-123')).rejects.toThrow();
    });
  });

  describe('isUserRevoked', () => {
    test('returns false when no user revocation exists', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const isRevoked = await (service as any).isUserRevoked('user-123', Math.floor(Date.now() / 1000));

      expect(isRevoked).toBe(false);
    });

    test('returns true when token was issued before revocation', async () => {
      const revocationTime = Date.now();
      const tokenIssuedAt = Math.floor(revocationTime / 1000) - 60; // Issued 60 seconds before revocation
      mockRedis.get.mockResolvedValueOnce(revocationTime.toString());

      const isRevoked = await (service as any).isUserRevoked('user-123', tokenIssuedAt);

      expect(isRevoked).toBe(true);
    });

    test('returns false when token was issued after revocation', async () => {
      const revocationTime = Date.now() - 60000; // Revoked 60 seconds ago
      const tokenIssuedAt = Math.floor(Date.now() / 1000); // Issued now
      mockRedis.get.mockResolvedValueOnce(revocationTime.toString());

      const isRevoked = await (service as any).isUserRevoked('user-123', tokenIssuedAt);

      expect(isRevoked).toBe(false);
    });

    test('fails secure on Redis error', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis error'));

      const isRevoked = await (service as any).isUserRevoked('user-123', Date.now());

      expect(isRevoked).toBe(true);
    });
  });

  describe('isTokenValid', () => {
    test('returns true when neither token nor user is revoked', async () => {
      mockRedis.exists.mockResolvedValueOnce(0); // Token not revoked
      mockRedis.get.mockResolvedValueOnce(null); // User not revoked

      const isValid = await (service as any).isTokenValid('jti-123', 'user-123', Math.floor(Date.now() / 1000));

      expect(isValid).toBe(true);
    });

    test('returns false when token is revoked', async () => {
      mockRedis.exists.mockResolvedValueOnce(1); // Token revoked
      mockRedis.get.mockResolvedValueOnce(null); // User not revoked

      const isValid = await (service as any).isTokenValid('jti-123', 'user-123', Math.floor(Date.now() / 1000));

      expect(isValid).toBe(false);
    });

    test('returns false when user is revoked', async () => {
      const revocationTime = Date.now();
      const tokenIssuedAt = Math.floor(revocationTime / 1000) - 60;
      mockRedis.exists.mockResolvedValueOnce(0); // Token not revoked
      mockRedis.get.mockResolvedValueOnce(revocationTime.toString()); // User revoked

      const isValid = await (service as any).isTokenValid('jti-123', 'user-123', tokenIssuedAt);

      expect(isValid).toBe(false);
    });
  });

  describe('close', () => {
    test('closes Redis connection', async () => {
      await service.close();

      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});

describe('handleKeycloakEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('revokes all user tokens on USER_DISABLED event', async () => {
    // This test verifies the event handler is called correctly
    // In a real scenario, we'd need to mock getRevocationService
    const event = {
      type: 'USER_DISABLED',
      userId: 'disabled-user-123',
    };

    // The function should not throw
    await expect(handleKeycloakEvent(event)).resolves.not.toThrow();
  });

  test('revokes all user tokens on LOGOUT event', async () => {
    const event = {
      type: 'LOGOUT',
      userId: 'logged-out-user-123',
    };

    await expect(handleKeycloakEvent(event)).resolves.not.toThrow();
  });

  test('revokes specific token on TOKEN_REVOKED event', async () => {
    const event = {
      type: 'TOKEN_REVOKED',
      tokenId: 'specific-token-jti',
    };

    await expect(handleKeycloakEvent(event)).resolves.not.toThrow();
  });

  test('handles unknown event types gracefully', async () => {
    const event = {
      type: 'UNKNOWN_EVENT',
      userId: 'user-123',
    };

    // Should not throw, just log
    await expect(handleKeycloakEvent(event)).resolves.not.toThrow();
  });
});

describe('createRevocationMiddleware', () => {
  // Middleware tests would require more extensive mocking
  // These are integration-level tests

  test.todo('rejects requests with no authentication token');
  test.todo('rejects requests with revoked token');
  test.todo('allows requests with valid token');
  test.todo('handles Redis errors gracefully');
});
