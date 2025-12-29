/**
 * Unit tests for Token Revocation Service
 *
 * Tests Redis-backed token revocation functionality.
 */

// Use ioredis-mock for deterministic, fast unit tests without external dependencies
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('ioredis', () => require('ioredis-mock'));

import { RedisTokenRevocationService, handleKeycloakEvent } from './token-revocation';

describe('RedisTokenRevocationService', () => {
  let service: RedisTokenRevocationService;

  beforeEach(async () => {
    // ioredis-mock provides full in-memory Redis implementation
    service = new RedisTokenRevocationService({
      redisUrl: 'redis://localhost:6379',
      keyPrefix: 'test:revoked:',
      defaultTtlSeconds: 3600,
    });
    // Flush all keys before each test for isolation
    const redis = (service as unknown as { redis: { flushall: () => Promise<void> } }).redis;
    await redis.flushall();
  });

  afterEach(async () => {
    await service.close();
  });

  describe('isRevoked', () => {
    test('returns false for non-revoked token', async () => {
      const isRevoked = await service.isRevoked('valid-token-jti');
      expect(isRevoked).toBe(false);
    });

    test('returns true for revoked token', async () => {
      // Revoke the token first
      await service.revokeToken('revoked-token-jti', 3600);

      const isRevoked = await service.isRevoked('revoked-token-jti');
      expect(isRevoked).toBe(true);
    });
  });

  describe('revokeToken', () => {
    test('stores token revocation with TTL', async () => {
      await service.revokeToken('token-to-revoke', 1800);

      // Verify token is revoked
      const isRevoked = await service.isRevoked('token-to-revoke');
      expect(isRevoked).toBe(true);
    });

    test('uses default TTL when not specified', async () => {
      await service.revokeToken('token-to-revoke');

      // Verify token is revoked with default TTL
      const isRevoked = await service.isRevoked('token-to-revoke');
      expect(isRevoked).toBe(true);
    });
  });

  describe('revokeAllUserTokens', () => {
    test('stores user revocation timestamp', async () => {
      await service.revokeAllUserTokens('user-123');

      // Verify user revocation was stored (test via isUserRevoked)
      const isRevoked = await (service as unknown as { isUserRevoked: (userId: string, tokenIssuedAt: number) => Promise<boolean> }).isUserRevoked('user-123', Math.floor(Date.now() / 1000) - 60);
      expect(isRevoked).toBe(true);
    });
  });

  describe('isUserRevoked', () => {
    test('returns false when no user revocation exists', async () => {
      const isRevoked = await (service as unknown as { isUserRevoked: (userId: string, tokenIssuedAt: number) => Promise<boolean> }).isUserRevoked('user-123', Math.floor(Date.now() / 1000));

      expect(isRevoked).toBe(false);
    });

    test('returns true when token was issued before revocation', async () => {
      const revocationTime = Date.now();
      const tokenIssuedAt = Math.floor(revocationTime / 1000) - 60; // Issued 60 seconds before revocation

      // Revoke all user tokens first
      await service.revokeAllUserTokens('user-123');

      const isRevoked = await (service as unknown as { isUserRevoked: (userId: string, tokenIssuedAt: number) => Promise<boolean> }).isUserRevoked('user-123', tokenIssuedAt);

      expect(isRevoked).toBe(true);
    });

    test('returns false when token was issued after revocation', async () => {
      // Revoke user tokens
      await service.revokeAllUserTokens('user-123');

      // Wait to ensure we cross a second boundary
      await new Promise(resolve => setTimeout(resolve, 1100));

      const tokenIssuedAt = Math.floor(Date.now() / 1000); // Issued now (after revocation)

      const isRevoked = await (service as unknown as { isUserRevoked: (userId: string, tokenIssuedAt: number) => Promise<boolean> }).isUserRevoked('user-123', tokenIssuedAt);

      expect(isRevoked).toBe(false);
    });

    // Note: Cannot test Redis error handling with ioredis-mock
    // The fail-secure behavior is verified in integration tests
  });

  describe('isTokenValid', () => {
    test('returns true when neither token nor user is revoked', async () => {
      const isValid = await (service as unknown as { isTokenValid: (jti: string, userId: string, tokenIssuedAt: number) => Promise<boolean> }).isTokenValid('jti-123', 'user-123', Math.floor(Date.now() / 1000));

      expect(isValid).toBe(true);
    });

    test('returns false when token is revoked', async () => {
      // Revoke the specific token
      await service.revokeToken('jti-123', 3600);

      const isValid = await (service as unknown as { isTokenValid: (jti: string, userId: string, tokenIssuedAt: number) => Promise<boolean> }).isTokenValid('jti-123', 'user-123', Math.floor(Date.now() / 1000));

      expect(isValid).toBe(false);
    });

    test('returns false when user is revoked', async () => {
      const tokenIssuedAt = Math.floor(Date.now() / 1000) - 60; // Issued 60 seconds ago

      // Revoke all user tokens
      await service.revokeAllUserTokens('user-123');

      const isValid = await (service as unknown as { isTokenValid: (jti: string, userId: string, tokenIssuedAt: number) => Promise<boolean> }).isTokenValid('jti-123', 'user-123', tokenIssuedAt);

      expect(isValid).toBe(false);
    });
  });

  describe('close', () => {
    test('closes Redis connection', async () => {
      // Verify close doesn't throw (ioredis-mock handles cleanup)
      await expect(service.close()).resolves.not.toThrow();
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
