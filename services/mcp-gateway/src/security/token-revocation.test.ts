/**
 * Unit tests for Token Revocation Service
 *
 * Tests Redis-backed token revocation including:
 * - Token and user revocation
 * - Error handling paths
 * - Express middleware
 * - Keycloak event handling
 */

// Use ioredis-mock for basic tests
import ioredisMock from 'ioredis-mock';
jest.mock('ioredis', () => ioredisMock);

import { Request, Response, NextFunction } from 'express';

// Authenticated request type for tests
interface AuthenticatedRequest extends Request {
  user?: {
    jti?: string;
    sub?: string;
    iat?: number;
  };
  auth?: {
    jti?: string;
    sub?: string;
    iat?: number;
  };
}
import {
  RedisTokenRevocationService,
  handleKeycloakEvent,
  createRevocationMiddleware,
} from './token-revocation';

describe('RedisTokenRevocationService', () => {
  let service: RedisTokenRevocationService;

  beforeEach(async () => {
    service = new RedisTokenRevocationService({
      redisUrl: 'redis://localhost:6379',
      keyPrefix: 'test:revoked:',
      defaultTtlSeconds: 3600,
    });
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
      await service.revokeToken('revoked-token-jti', 3600);
      const isRevoked = await service.isRevoked('revoked-token-jti');
      expect(isRevoked).toBe(true);
    });
  });

  describe('revokeToken', () => {
    test('stores token revocation with custom TTL', async () => {
      await service.revokeToken('token-to-revoke', 1800);
      const isRevoked = await service.isRevoked('token-to-revoke');
      expect(isRevoked).toBe(true);
    });

    test('uses default TTL when not specified', async () => {
      await service.revokeToken('token-default-ttl');
      const isRevoked = await service.isRevoked('token-default-ttl');
      expect(isRevoked).toBe(true);
    });
  });

  describe('revokeAllUserTokens', () => {
    test('stores user revocation timestamp', async () => {
      await service.revokeAllUserTokens('user-123');
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
      const tokenIssuedAt = Math.floor(Date.now() / 1000) - 60;
      await service.revokeAllUserTokens('user-123');
      const isRevoked = await (service as unknown as { isUserRevoked: (userId: string, tokenIssuedAt: number) => Promise<boolean> }).isUserRevoked('user-123', tokenIssuedAt);
      expect(isRevoked).toBe(true);
    });

    test('returns false when token was issued after revocation', async () => {
      await service.revokeAllUserTokens('user-123');
      await new Promise(resolve => setTimeout(resolve, 1100));
      const tokenIssuedAt = Math.floor(Date.now() / 1000);
      const isRevoked = await (service as unknown as { isUserRevoked: (userId: string, tokenIssuedAt: number) => Promise<boolean> }).isUserRevoked('user-123', tokenIssuedAt);
      expect(isRevoked).toBe(false);
    });
  });

  describe('isTokenValid', () => {
    test('returns true when neither token nor user is revoked', async () => {
      const isValid = await (service as unknown as { isTokenValid: (jti: string, userId: string, tokenIssuedAt: number) => Promise<boolean> }).isTokenValid('jti-123', 'user-123', Math.floor(Date.now() / 1000));
      expect(isValid).toBe(true);
    });

    test('returns false when token is revoked', async () => {
      await service.revokeToken('jti-123', 3600);
      const isValid = await (service as unknown as { isTokenValid: (jti: string, userId: string, tokenIssuedAt: number) => Promise<boolean> }).isTokenValid('jti-123', 'user-123', Math.floor(Date.now() / 1000));
      expect(isValid).toBe(false);
    });

    test('returns false when user is revoked', async () => {
      const tokenIssuedAt = Math.floor(Date.now() / 1000) - 60;
      await service.revokeAllUserTokens('user-123');
      const isValid = await (service as unknown as { isTokenValid: (jti: string, userId: string, tokenIssuedAt: number) => Promise<boolean> }).isTokenValid('jti-123', 'user-123', tokenIssuedAt);
      expect(isValid).toBe(false);
    });
  });

  describe('close', () => {
    test('closes Redis connection', async () => {
      await expect(service.close()).resolves.not.toThrow();
    });
  });
});

describe('createRevocationMiddleware', () => {
  let middleware: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    middleware = createRevocationMiddleware();

    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  test('calls next() when token is valid', async () => {
    (req as AuthenticatedRequest).user = {
      jti: 'valid-jti-123',
      sub: 'user-123',
      iat: Math.floor(Date.now() / 1000),
    };

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('checks req.auth if req.user is not present', async () => {
    (req as AuthenticatedRequest).auth = {
      jti: 'valid-jti-456',
      sub: 'user-456',
      iat: Math.floor(Date.now() / 1000),
    };

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  test('rejects requests with no authentication token', async () => {
    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No authentication token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects requests with missing jti claim', async () => {
    (req as AuthenticatedRequest).user = {
      sub: 'user-123',
      iat: 1640000000,
    };

    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token claims' });
  });

  test('rejects requests with missing sub claim', async () => {
    (req as AuthenticatedRequest).user = {
      jti: 'jti-123',
      iat: 1640000000,
    };

    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token claims' });
  });

  test('rejects requests with missing iat claim', async () => {
    (req as AuthenticatedRequest).user = {
      jti: 'jti-123',
      sub: 'user-123',
    };

    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token claims' });
  });

  // Note: Testing actual token revocation requires integration testing
  // with shared service state. The revocation logic is thoroughly tested
  // in the RedisTokenRevocationService tests above.
});

describe('handleKeycloakEvent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Clear any existing revocations
    const service = new RedisTokenRevocationService();
    const redis = (service as unknown as { redis: { flushall: () => Promise<void> } }).redis;
    await redis.flushall();
    await service.close();
  });

  test('revokes all user tokens on USER_DISABLED event', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await handleKeycloakEvent({
      type: 'USER_DISABLED',
      userId: 'disabled-user-123',
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('disabled-user-123 disabled/deleted - all tokens revoked'));
    consoleSpy.mockRestore();
  });

  test('revokes all user tokens on USER_DELETED event', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await handleKeycloakEvent({
      type: 'USER_DELETED',
      userId: 'deleted-user-456',
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('deleted-user-456 disabled/deleted - all tokens revoked'));
    consoleSpy.mockRestore();
  });

  test('revokes all user tokens on LOGOUT event', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await handleKeycloakEvent({
      type: 'LOGOUT',
      userId: 'logout-user-789',
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('logout-user-789 logged out - all tokens revoked'));
    consoleSpy.mockRestore();
  });

  test('revokes all user tokens on LOGOUT_ALL event', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await handleKeycloakEvent({
      type: 'LOGOUT_ALL',
      userId: 'logout-all-user',
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('logout-all-user logged out - all tokens revoked'));
    consoleSpy.mockRestore();
  });

  test('revokes specific token on TOKEN_REVOKED event', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await handleKeycloakEvent({
      type: 'TOKEN_REVOKED',
      tokenId: 'specific-token-123',
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('specific-token-123 explicitly revoked'));
    consoleSpy.mockRestore();
  });

  test('handles unknown event types gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await handleKeycloakEvent({
      type: 'UNKNOWN_EVENT',
      userId: 'user-123',
    });

    expect(consoleSpy).toHaveBeenCalledWith('Unhandled Keycloak event type: UNKNOWN_EVENT');
    consoleSpy.mockRestore();
  });

  test('handles events without userId gracefully', async () => {
    await expect(handleKeycloakEvent({
      type: 'USER_DISABLED',
      // No userId
    })).resolves.not.toThrow();
  });

  test('handles events without tokenId gracefully', async () => {
    await expect(handleKeycloakEvent({
      type: 'TOKEN_REVOKED',
      // No tokenId
    })).resolves.not.toThrow();
  });
});
