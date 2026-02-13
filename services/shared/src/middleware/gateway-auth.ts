/**
 * Gateway Authentication Middleware
 *
 * Ensures MCP servers only accept requests from the authenticated MCP Gateway.
 * This prevents the critical authentication bypass vulnerability where attackers
 * could directly call MCP servers with fabricated X-User-ID headers.
 *
 * How it works:
 * 1. MCP Gateway signs requests with an HMAC token containing user identity
 * 2. MCP servers validate the token before processing any request
 * 3. Health endpoints are exempt for Docker healthchecks
 *
 * Usage in MCP servers:
 * ```typescript
 * import { requireGatewayAuth } from '@tamshai/shared';
 *
 * const app = express();
 * app.use(requireGatewayAuth(process.env.MCP_INTERNAL_SECRET));
 *
 * // Health endpoints are automatically exempt
 * app.get('/health', (req, res) => res.json({ status: 'ok' }));
 *
 * // All other routes require gateway auth
 * app.post('/tools/list_employees', handler);
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import { validateInternalToken, TokenValidationResult } from '../utils/internal-token';

/**
 * Header name for the internal authentication token
 */
export const INTERNAL_TOKEN_HEADER = 'x-mcp-internal-token';

/**
 * Paths that are exempt from gateway authentication (health checks)
 */
const EXEMPT_PATHS = ['/health', '/ready', '/healthz', '/livez', '/readyz'];

/**
 * Extended Express Request with validated user context
 */
export interface AuthenticatedRequest extends Request {
  gatewayAuth?: {
    userId: string;
    roles: string[];
    timestamp: number;
  };
}

/**
 * Logger interface for middleware
 * Compatible with Winston, Pino, and console loggers
 */
export interface GatewayAuthLogger {
  warn: (message: string, meta?: Record<string, unknown>) => unknown;
  debug?: (message: string, meta?: Record<string, unknown>) => unknown;
}

/**
 * Default console logger
 */
const defaultLogger: GatewayAuthLogger = {
  warn: (message, meta) => console.warn(`[gateway-auth] ${message}`, meta || ''),
  debug: (message, meta) => console.debug(`[gateway-auth] ${message}`, meta || ''),
};

/**
 * Create middleware that requires gateway authentication
 *
 * This middleware validates the X-MCP-Internal-Token header on all requests
 * except health check endpoints. If the token is missing or invalid, the
 * request is rejected with a 401 Unauthorized response.
 *
 * @param secret - Shared secret for token validation (MCP_INTERNAL_SECRET)
 * @param options - Optional configuration
 * @returns Express middleware function
 */
export function requireGatewayAuth(
  secret: string | undefined,
  options?: {
    logger?: GatewayAuthLogger;
    replayWindowSeconds?: number;
    exemptPaths?: string[];
  }
): (req: Request, res: Response, next: NextFunction) => void {
  const logger = options?.logger || defaultLogger;
  const replayWindow = options?.replayWindowSeconds || 30;
  const exemptPaths = options?.exemptPaths || EXEMPT_PATHS;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Skip auth for health check endpoints
    const path = req.path.toLowerCase();
    if (exemptPaths.some(exempt => path === exempt || path.startsWith(exempt))) {
      return next();
    }

    // Check if secret is configured
    if (!secret) {
      logger.warn('MCP_INTERNAL_SECRET not configured - rejecting request', {
        path: req.path,
        method: req.method,
      });

      return res.status(503).json({
        status: 'error',
        code: 'GATEWAY_AUTH_NOT_CONFIGURED',
        message: 'Service is not properly configured for gateway authentication.',
        suggestedAction: 'Ensure MCP_INTERNAL_SECRET environment variable is set.',
      });
    }

    // Get token from header
    const token = req.headers[INTERNAL_TOKEN_HEADER] as string | undefined;

    if (!token) {
      logger.warn('Missing internal token header', {
        path: req.path,
        method: req.method,
        clientIp: req.ip,
      });

      return res.status(401).json({
        status: 'error',
        code: 'MISSING_GATEWAY_TOKEN',
        message: 'Request must come from authenticated MCP Gateway.',
        suggestedAction: 'Do not call MCP servers directly. Use the MCP Gateway API.',
      });
    }

    // Validate token
    const result: TokenValidationResult = validateInternalToken(secret, token, replayWindow);

    if (!result.valid) {
      logger.warn('Invalid internal token', {
        path: req.path,
        method: req.method,
        error: result.error,
        clientIp: req.ip,
      });

      return res.status(401).json({
        status: 'error',
        code: 'INVALID_GATEWAY_TOKEN',
        message: 'Gateway authentication failed.',
        suggestedAction: 'Ensure your request is coming through the MCP Gateway.',
        details: result.error,
      });
    }

    // Attach validated context to request
    if (result.payload) {
      req.gatewayAuth = {
        userId: result.payload.userId,
        roles: result.payload.roles,
        timestamp: result.payload.timestamp,
      };

      // Also set headers for backward compatibility with existing handlers
      // that read from headers
      req.headers['x-user-id'] = result.payload.userId;
      req.headers['x-user-roles'] = result.payload.roles.join(',');
    }

    logger?.debug?.('Gateway authentication successful', {
      path: req.path,
      userId: result.payload?.userId,
    });

    next();
  };
}

/**
 * Check if a request has been authenticated by the gateway
 *
 * @param req - Express request
 * @returns true if request has valid gateway authentication
 */
export function isGatewayAuthenticated(req: AuthenticatedRequest): boolean {
  return !!req.gatewayAuth?.userId;
}

/**
 * Get the authenticated user context from the request
 *
 * @param req - Express request
 * @returns User context if authenticated, undefined otherwise
 */
export function getGatewayAuthContext(req: AuthenticatedRequest): {
  userId: string;
  roles: string[];
} | undefined {
  if (!req.gatewayAuth) {
    return undefined;
  }

  return {
    userId: req.gatewayAuth.userId,
    roles: req.gatewayAuth.roles,
  };
}
