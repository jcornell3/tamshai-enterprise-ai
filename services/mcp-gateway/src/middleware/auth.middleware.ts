/**
 * Authentication Middleware
 *
 * Validates JWT tokens and attaches user context to requests.
 * Extracted from index.ts for improved testability (Phase 3).
 *
 * Features:
 * - Bearer token validation via Authorization header
 * - Query param token support (deprecated, for EventSource compatibility)
 * - Token revocation checking via Redis cache
 * - User context extraction (userId, username, email, roles, groups)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Logger } from 'winston';
import { JWTValidator } from '../auth/jwt-validator';
import { UserContext } from '../test-utils/mock-user-context';

/**
 * Extended Request type with userContext property
 */
export interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
}

/**
 * Function type for checking token revocation
 */
export type TokenRevocationChecker = (jti: string) => Promise<boolean>;

/**
 * Configuration for auth middleware
 */
export interface AuthMiddlewareConfig {
  /** JWT validator instance */
  jwtValidator: JWTValidator;
  /** Logger instance */
  logger: Logger;
  /** Function to check if token is revoked (optional, for DI) */
  isTokenRevoked?: TokenRevocationChecker;
}

/**
 * Create authentication middleware with dependency injection
 *
 * @param config - Middleware configuration with injected dependencies
 * @returns Express middleware function
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  const { jwtValidator, logger, isTokenRevoked } = config;

  return async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    const tokenFromQuery = req.query.token as string | undefined;

    // Accept token from either Authorization header or query param
    // SECURITY NOTE: Query param tokens are DEPRECATED due to URL logging risks
    // Prefer POST /api/query with Authorization header for SSE streaming
    let token: string;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (tokenFromQuery) {
      // DEPRECATED: Token in URL is logged and visible in browser history
      // This is kept for backwards compatibility with EventSource clients
      // New clients should use POST /api/query with fetch() streaming
      token = tokenFromQuery;
      logger.warn('Token passed via query parameter (deprecated)', {
        path: req.path,
        method: req.method,
        // Don't log the actual token for security
        warning: 'Query param tokens are visible in logs and browser history',
      });
    } else {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    try {
      // Validate token and extract user context
      const userContext = await jwtValidator.validateToken(token);

      // v1.4: Check token revocation in Redis (if revocation checker provided)
      if (isTokenRevoked) {
        const payload = jwt.decode(token) as jwt.JwtPayload;
        if (payload?.jti && await isTokenRevoked(payload.jti)) {
          logger.warn('Revoked token attempted', {
            jti: payload.jti,
            userId: userContext.userId,
          });
          res.status(401).json({ error: 'Token has been revoked' });
          return;
        }
      }

      // Attach user context to request
      (req as AuthenticatedRequest).userContext = userContext;
      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Token validation failed:', { error: errorMessage });
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * Helper to extract user context from authenticated request
 *
 * @param req - Express request (should be AuthenticatedRequest)
 * @returns UserContext or undefined if not authenticated
 */
export function getUserContext(req: Request): UserContext | undefined {
  return (req as AuthenticatedRequest).userContext;
}

/**
 * Helper to require user context (throws if not present)
 *
 * @param req - Express request (should be AuthenticatedRequest)
 * @returns UserContext
 * @throws Error if user context is not present
 */
export function requireUserContext(req: Request): UserContext {
  const userContext = getUserContext(req);
  if (!userContext) {
    throw new Error('User context not found - authentication required');
  }
  return userContext;
}
