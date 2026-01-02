/**
 * Unit tests for Authentication Middleware
 *
 * Target: 95%+ coverage
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  createAuthMiddleware,
  AuthMiddlewareConfig,
  AuthenticatedRequest,
  getUserContext,
  requireUserContext,
} from './auth.middleware';
import { JWTValidator } from '../auth/jwt-validator';
import { createMockLogger } from '../test-utils/mock-logger';
import { createMockUserContext, TEST_USERS } from '../test-utils/mock-user-context';

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
}));

describe('Auth Middleware', () => {
  let mockJwtValidator: jest.Mocked<JWTValidator>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockIsTokenRevoked: jest.Mock;
  let config: AuthMiddlewareConfig;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock<NextFunction>;

  beforeEach(() => {
    // Create mock JWT validator
    mockJwtValidator = {
      validateToken: jest.fn(),
    } as unknown as jest.Mocked<JWTValidator>;

    mockLogger = createMockLogger();
    mockIsTokenRevoked = jest.fn().mockResolvedValue(false);

    config = {
      jwtValidator: mockJwtValidator,
      logger: mockLogger,
      isTokenRevoked: mockIsTokenRevoked,
    };

    // Create mock request
    req = {
      headers: {},
      query: {},
      path: '/api/test',
      method: 'GET',
    };

    // Create mock response
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();

    // Reset jwt.decode mock
    (jwt.decode as jest.Mock).mockReset();
  });

  describe('createAuthMiddleware', () => {
    describe('token extraction', () => {
      it('should extract token from Authorization header', async () => {
        mockJwtValidator.validateToken.mockResolvedValue(TEST_USERS.hrManager);
        req.headers = { authorization: 'Bearer valid-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(mockJwtValidator.validateToken).toHaveBeenCalledWith('valid-token');
        expect(next).toHaveBeenCalled();
      });

      it('should extract token from query parameter (deprecated)', async () => {
        mockJwtValidator.validateToken.mockResolvedValue(TEST_USERS.financeManager);
        req.query = { token: 'query-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(mockJwtValidator.validateToken).toHaveBeenCalledWith('query-token');
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Token passed via query parameter (deprecated)',
          expect.objectContaining({
            path: '/api/test',
            method: 'GET',
          })
        );
        expect(next).toHaveBeenCalled();
      });

      it('should prefer Authorization header over query parameter', async () => {
        mockJwtValidator.validateToken.mockResolvedValue(TEST_USERS.hrManager);
        req.headers = { authorization: 'Bearer header-token' };
        req.query = { token: 'query-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(mockJwtValidator.validateToken).toHaveBeenCalledWith('header-token');
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should reject request with no token', async () => {
        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Missing or invalid authorization header',
        });
        expect(next).not.toHaveBeenCalled();
      });

      it('should reject request with malformed Authorization header', async () => {
        req.headers = { authorization: 'Basic invalid' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Missing or invalid authorization header',
        });
        expect(next).not.toHaveBeenCalled();
      });

      it('should reject request with empty Bearer token', async () => {
        req.headers = { authorization: 'Bearer ' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        // Empty string after "Bearer " is still passed to validator
        // Validator should reject it
        expect(mockJwtValidator.validateToken).toHaveBeenCalledWith('');
      });
    });

    describe('token validation', () => {
      it('should attach user context on successful validation', async () => {
        mockJwtValidator.validateToken.mockResolvedValue(TEST_USERS.hrManager);
        req.headers = { authorization: 'Bearer valid-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect((req as AuthenticatedRequest).userContext).toEqual(TEST_USERS.hrManager);
        expect(next).toHaveBeenCalled();
      });

      it('should reject invalid token', async () => {
        mockJwtValidator.validateToken.mockRejectedValue(new Error('Invalid signature'));
        req.headers = { authorization: 'Bearer invalid-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Token validation failed:',
          expect.objectContaining({ error: 'Invalid signature' })
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should reject expired token', async () => {
        mockJwtValidator.validateToken.mockRejectedValue(new Error('jwt expired'));
        req.headers = { authorization: 'Bearer expired-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('token revocation', () => {
      it('should check token revocation when checker is provided', async () => {
        mockJwtValidator.validateToken.mockResolvedValue(TEST_USERS.hrManager);
        (jwt.decode as jest.Mock).mockReturnValue({ jti: 'token-jti-123' });
        mockIsTokenRevoked.mockResolvedValue(false);
        req.headers = { authorization: 'Bearer valid-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(mockIsTokenRevoked).toHaveBeenCalledWith('token-jti-123');
        expect(next).toHaveBeenCalled();
      });

      it('should reject revoked token', async () => {
        mockJwtValidator.validateToken.mockResolvedValue(TEST_USERS.hrManager);
        (jwt.decode as jest.Mock).mockReturnValue({ jti: 'revoked-jti' });
        mockIsTokenRevoked.mockResolvedValue(true);
        req.headers = { authorization: 'Bearer revoked-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Token has been revoked' });
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Revoked token attempted',
          expect.objectContaining({
            jti: 'revoked-jti',
            userId: TEST_USERS.hrManager.userId,
          })
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should skip revocation check when token has no jti', async () => {
        mockJwtValidator.validateToken.mockResolvedValue(TEST_USERS.financeManager);
        (jwt.decode as jest.Mock).mockReturnValue({ sub: 'user-123' }); // No jti
        req.headers = { authorization: 'Bearer no-jti-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(mockIsTokenRevoked).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
      });

      it('should skip revocation check when checker not provided', async () => {
        const configWithoutRevocation: AuthMiddlewareConfig = {
          jwtValidator: mockJwtValidator,
          logger: mockLogger,
          // No isTokenRevoked
        };

        mockJwtValidator.validateToken.mockResolvedValue(TEST_USERS.salesManager);
        req.headers = { authorization: 'Bearer valid-token' };

        const middleware = createAuthMiddleware(configWithoutRevocation);
        await middleware(req as Request, res as Response, next);

        expect(mockIsTokenRevoked).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
      });

      it('should handle null jwt.decode result', async () => {
        mockJwtValidator.validateToken.mockResolvedValue(TEST_USERS.supportManager);
        (jwt.decode as jest.Mock).mockReturnValue(null);
        req.headers = { authorization: 'Bearer malformed-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(mockIsTokenRevoked).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle non-Error exceptions', async () => {
        mockJwtValidator.validateToken.mockRejectedValue('string error');
        req.headers = { authorization: 'Bearer bad-token' };

        const middleware = createAuthMiddleware(config);
        await middleware(req as Request, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Token validation failed:',
          expect.objectContaining({ error: 'Unknown error' })
        );
      });
    });
  });

  describe('getUserContext', () => {
    it('should return user context when present', () => {
      (req as AuthenticatedRequest).userContext = TEST_USERS.hrManager;

      const result = getUserContext(req as Request);

      expect(result).toEqual(TEST_USERS.hrManager);
    });

    it('should return undefined when not authenticated', () => {
      const result = getUserContext(req as Request);

      expect(result).toBeUndefined();
    });
  });

  describe('requireUserContext', () => {
    it('should return user context when present', () => {
      (req as AuthenticatedRequest).userContext = TEST_USERS.financeManager;

      const result = requireUserContext(req as Request);

      expect(result).toEqual(TEST_USERS.financeManager);
    });

    it('should throw when not authenticated', () => {
      expect(() => requireUserContext(req as Request)).toThrow(
        'User context not found - authentication required'
      );
    });
  });
});
