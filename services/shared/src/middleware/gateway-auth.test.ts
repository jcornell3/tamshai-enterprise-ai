/**
 * Gateway Authentication Middleware Tests
 */

import { Request, Response } from 'express';
import {
  requireGatewayAuth,
  isGatewayAuthenticated,
  getGatewayAuthContext,
  INTERNAL_TOKEN_HEADER,
  AuthenticatedRequest,
} from './gateway-auth';
import { generateInternalToken } from '../utils/internal-token';

// Mock Express request/response
function createMockRequest(options: {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
}): AuthenticatedRequest {
  return {
    path: options.path || '/tools/list_employees',
    method: options.method || 'POST',
    headers: options.headers || {},
    ip: '127.0.0.1',
  } as AuthenticatedRequest;
}

function createMockResponse(): Response & { statusCode?: number; jsonData?: unknown } {
  const res: Partial<Response> & { statusCode?: number; jsonData?: unknown } = {
    statusCode: undefined,
    jsonData: undefined,
  };

  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  });

  res.json = jest.fn((data: unknown) => {
    res.jsonData = data;
    return res as Response;
  });

  return res as Response & { statusCode?: number; jsonData?: unknown };
}

describe('requireGatewayAuth middleware', () => {
  const secret = 'test-secret-key-12345';
  const userId = 'user-123';
  const roles = ['hr-read', 'hr-write'];

  describe('when secret is not configured', () => {
    it('returns 503 Service Unavailable', () => {
      const middleware = requireGatewayAuth(undefined);
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.statusCode).toBe(503);
      expect(res.jsonData).toMatchObject({
        status: 'error',
        code: 'GATEWAY_AUTH_NOT_CONFIGURED',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('still allows health endpoints', () => {
      const middleware = requireGatewayAuth(undefined);
      const req = createMockRequest({ path: '/health' });
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeUndefined();
    });
  });

  describe('when token is missing', () => {
    it('returns 401 Unauthorized', () => {
      const middleware = requireGatewayAuth(secret);
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toMatchObject({
        status: 'error',
        code: 'MISSING_GATEWAY_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('when token is invalid', () => {
    it('returns 401 for malformed token', () => {
      const middleware = requireGatewayAuth(secret);
      const req = createMockRequest({
        headers: { [INTERNAL_TOKEN_HEADER]: 'invalid-token' },
      });
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toMatchObject({
        status: 'error',
        code: 'INVALID_GATEWAY_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for token with wrong secret', () => {
      const middleware = requireGatewayAuth(secret);
      const token = generateInternalToken('wrong-secret', userId, roles);
      const req = createMockRequest({
        headers: { [INTERNAL_TOKEN_HEADER]: token },
      });
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toMatchObject({
        status: 'error',
        code: 'INVALID_GATEWAY_TOKEN',
      });
    });

    it('returns 401 for expired token', () => {
      const middleware = requireGatewayAuth(secret, { replayWindowSeconds: 1 });

      // Create an expired token (timestamp 10 seconds ago)
      const oldTimestamp = Math.floor(Date.now() / 1000) - 10;
      const payload = `${oldTimestamp}:${userId}:${roles.join(',')}`;
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const expiredToken = `${payload}.${hmac}`;

      const req = createMockRequest({
        headers: { [INTERNAL_TOKEN_HEADER]: expiredToken },
      });
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toMatchObject({
        code: 'INVALID_GATEWAY_TOKEN',
      });
    });
  });

  describe('when token is valid', () => {
    it('calls next() and attaches user context', () => {
      const middleware = requireGatewayAuth(secret);
      const token = generateInternalToken(secret, userId, roles);
      const req = createMockRequest({
        headers: { [INTERNAL_TOKEN_HEADER]: token },
      });
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.gatewayAuth).toBeDefined();
      expect(req.gatewayAuth?.userId).toBe(userId);
      expect(req.gatewayAuth?.roles).toEqual(roles);
    });

    it('sets x-user-id and x-user-roles headers for backward compatibility', () => {
      const middleware = requireGatewayAuth(secret);
      const token = generateInternalToken(secret, userId, roles);
      const req = createMockRequest({
        headers: { [INTERNAL_TOKEN_HEADER]: token },
      });
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(req.headers['x-user-id']).toBe(userId);
      expect(req.headers['x-user-roles']).toBe('hr-read,hr-write');
    });
  });

  describe('health endpoint exemption', () => {
    const exemptPaths = ['/health', '/ready', '/healthz', '/livez', '/readyz'];

    exemptPaths.forEach(path => {
      it(`allows ${path} without token`, () => {
        const middleware = requireGatewayAuth(secret);
        const req = createMockRequest({ path });
        const res = createMockResponse();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeUndefined();
      });
    });

    it('allows custom exempt paths', () => {
      const middleware = requireGatewayAuth(secret, {
        exemptPaths: ['/custom-health'],
      });
      const req = createMockRequest({ path: '/custom-health' });
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('custom logger', () => {
    it('uses provided logger for warnings', () => {
      const logger = {
        warn: jest.fn(),
        debug: jest.fn(),
      };

      const middleware = requireGatewayAuth(secret, { logger });
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        'Missing internal token header',
        expect.any(Object)
      );
    });
  });
});

describe('isGatewayAuthenticated', () => {
  it('returns true when gatewayAuth is set', () => {
    const req = createMockRequest({}) as AuthenticatedRequest;
    req.gatewayAuth = { userId: 'user-123', roles: ['hr-read'], timestamp: Date.now() };

    expect(isGatewayAuthenticated(req)).toBe(true);
  });

  it('returns false when gatewayAuth is not set', () => {
    const req = createMockRequest({}) as AuthenticatedRequest;

    expect(isGatewayAuthenticated(req)).toBe(false);
  });

  it('returns false when gatewayAuth.userId is empty', () => {
    const req = createMockRequest({}) as AuthenticatedRequest;
    req.gatewayAuth = { userId: '', roles: [], timestamp: Date.now() };

    expect(isGatewayAuthenticated(req)).toBe(false);
  });
});

describe('getGatewayAuthContext', () => {
  it('returns user context when authenticated', () => {
    const req = createMockRequest({}) as AuthenticatedRequest;
    req.gatewayAuth = { userId: 'user-123', roles: ['hr-read'], timestamp: Date.now() };

    const context = getGatewayAuthContext(req);

    expect(context).toEqual({
      userId: 'user-123',
      roles: ['hr-read'],
    });
  });

  it('returns undefined when not authenticated', () => {
    const req = createMockRequest({}) as AuthenticatedRequest;

    const context = getGatewayAuthContext(req);

    expect(context).toBeUndefined();
  });
});

describe('INTERNAL_TOKEN_HEADER', () => {
  it('is x-mcp-internal-token', () => {
    expect(INTERNAL_TOKEN_HEADER).toBe('x-mcp-internal-token');
  });
});
