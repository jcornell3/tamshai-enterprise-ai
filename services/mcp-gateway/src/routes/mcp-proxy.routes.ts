/**
 * MCP Tool Proxy Routes
 *
 * Routes: /api/mcp/:serverName/:toolName (GET and POST)
 *
 * Allows web applications to directly call MCP tools with proper authorization.
 * The gateway validates the user's access to the MCP server and forwards the request.
 *
 * Extracted from index.ts for testability (Phase 7 Refactoring)
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { Logger } from 'winston';
import { MCPServerConfig, isValidToolName } from '../utils/gateway-utils';
import {
  MCPToolResponse,
  isSuccessResponse,
  isPendingConfirmationResponse,
} from '../types/mcp-response';
import { UserContext } from '../test-utils/mock-user-context';
import { getIdentityToken } from '../utils/gcp-auth';
import { buildSafeQueryParams, sanitizeForLogging } from '../utils/sanitize';
import { generateInternalToken, INTERNAL_TOKEN_HEADER } from '@tamshai/shared';

// Extended Request type with userContext property
interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
}

export interface MCPProxyRoutesDependencies {
  logger: Logger;
  mcpServers: MCPServerConfig[];
  getAccessibleServers: (roles: string[]) => MCPServerConfig[];
  timeout?: number;
  internalSecret?: string; // Shared secret for MCP server authentication (MCP_INTERNAL_SECRET)
}

/**
 * Creates MCP proxy routes with dependency injection
 */
export function createMCPProxyRoutes(deps: MCPProxyRoutesDependencies): Router {
  const router = Router();
  const { logger, mcpServers, getAccessibleServers, timeout = 30000, internalSecret } = deps;

  // Warn if internal secret is not configured (security risk)
  if (!internalSecret) {
    logger.warn('MCP_INTERNAL_SECRET not configured - MCP servers may be vulnerable to direct access');
  }

  /**
   * GET /mcp/:serverName/:toolName
   * Invokes an MCP tool with query parameters
   */
  router.get('/mcp/:serverName/:toolName', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    const userContext: UserContext = (req as AuthenticatedRequest).userContext!;
    const { serverName, toolName } = req.params;

    // SECURITY: Validate toolName to prevent SSRF/path traversal
    if (!isValidToolName(toolName)) {
      logger.warn('Invalid tool name rejected', {
        requestId,
        userId: userContext.userId,
        toolName,
      });
      res.status(400).json({
        status: 'error',
        code: 'INVALID_TOOL_NAME',
        message: 'Tool name contains invalid characters',
        suggestedAction: 'Tool names must start with a letter and contain only alphanumeric characters, underscores, or hyphens',
      });
      return;
    }

    // Convert query params to proper types with security validation
    // Uses buildSafeQueryParams which:
    // - Validates keys against safe pattern (alphanumeric, underscore, hyphen, dot)
    // - Prevents prototype pollution by rejecting dangerous keys
    // - Uses Object.create(null) for the result object
    const queryParams = buildSafeQueryParams(req.query as Record<string, unknown>);

    // Sanitize for logging to prevent log injection attacks
    // lgtm[js/log-injection] - queryParams sanitized via sanitizeForLogging
    logger.info(`MCP tool call: ${serverName}/${toolName}`, {
      requestId,
      userId: userContext.userId,
      queryParams: sanitizeForLogging(queryParams),
    });

    try {
      // Find the MCP server configuration
      const server = mcpServers.find((s) => s.name === serverName);
      if (!server) {
        res.status(404).json({
          status: 'error',
          code: 'SERVER_NOT_FOUND',
          message: `MCP server '${serverName}' not found`,
          suggestedAction: `Available servers: ${mcpServers.map((s) => s.name).join(', ')}`,
        });
        return;
      }

      // Check if user has access to this server
      const accessibleServers = getAccessibleServers(userContext.roles);
      const hasAccess = accessibleServers.some((s) => s.name === serverName);

      if (!hasAccess) {
        logger.warn('Unauthorized MCP server access attempt', {
          requestId,
          userId: userContext.userId,
          serverName,
          userRoles: userContext.roles,
        });

        res.status(403).json({
          status: 'error',
          code: 'ACCESS_DENIED',
          message: `You do not have access to the '${serverName}' data source`,
          suggestedAction: `Required roles: ${server.requiredRoles.join(' or ')}. Your roles: ${userContext.roles.join(', ')}`,
        });
        return;
      }

      // Forward request to MCP server
      // SECURITY: toolName is validated above, server.url comes from trusted config
      const targetUrl = `${server.url}/tools/${encodeURIComponent(toolName)}`;

      // Get GCP identity token for Cloud Run service-to-service auth
      // Returns null in dev/stage (non-GCP environments)
      const identityToken = await getIdentityToken(server.url);

      // Generate internal authentication token for MCP server
      const mcpInternalToken = internalSecret
        ? generateInternalToken(internalSecret, userContext.userId, userContext.roles)
        : undefined;

      const mcpResponse = await axios.post(
        targetUrl,
        {
          ...queryParams, // Spread query params at root level (MCP servers read directly from body)
          userContext: {
            userId: userContext.userId,
            username: userContext.username,
            email: userContext.email,
            roles: userContext.roles,
          },
        },
        {
          timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            // Add internal token for MCP server authentication (prevents direct access bypass)
            ...(mcpInternalToken && { [INTERNAL_TOKEN_HEADER]: mcpInternalToken }),
            // Include GCP identity token if available (Cloud Run service-to-service)
            ...(identityToken && { Authorization: `Bearer ${identityToken}` }),
          },
        }
      );

      // v1.4: Check for truncation warnings and inject into response
      const toolResponse = mcpResponse.data as MCPToolResponse;
      if (isSuccessResponse(toolResponse) && toolResponse.metadata?.truncated) {
        logger.info('Truncation detected in MCP response', {
          requestId,
          serverName,
          toolName,
          returnedCount: toolResponse.metadata.returnedCount,
        });
      }

      res.json(toolResponse);
    } catch (error) {
      handleMCPError(error, serverName, requestId, logger, res);
    }
  });

  /**
   * POST /mcp/:serverName/:toolName
   * Invokes an MCP tool with body parameters (for write operations)
   */
  router.post('/mcp/:serverName/:toolName', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    const userContext: UserContext = (req as AuthenticatedRequest).userContext!;
    const { serverName, toolName } = req.params;
    const body = req.body;

    // SECURITY: Validate toolName to prevent SSRF/path traversal
    if (!isValidToolName(toolName)) {
      logger.warn('Invalid tool name rejected', {
        requestId,
        userId: userContext.userId,
        toolName,
      });
      res.status(400).json({
        status: 'error',
        code: 'INVALID_TOOL_NAME',
        message: 'Tool name contains invalid characters',
        suggestedAction: 'Tool names must start with a letter and contain only alphanumeric characters, underscores, or hyphens',
      });
      return;
    }

    // Sanitize body for logging to prevent log injection attacks
    // lgtm[js/log-injection] - body sanitized via sanitizeForLogging
    logger.info(`MCP tool call (POST): ${serverName}/${toolName}`, {
      requestId,
      userId: userContext.userId,
      body: sanitizeForLogging(body),
    });

    try {
      // Find the MCP server configuration
      const server = mcpServers.find((s) => s.name === serverName);
      if (!server) {
        res.status(404).json({
          status: 'error',
          code: 'SERVER_NOT_FOUND',
          message: `MCP server '${serverName}' not found`,
        });
        return;
      }

      // Check if user has access to this server
      const accessibleServers = getAccessibleServers(userContext.roles);
      const hasAccess = accessibleServers.some((s) => s.name === serverName);

      if (!hasAccess) {
        logger.warn('Unauthorized MCP server access attempt', {
          requestId,
          userId: userContext.userId,
          serverName,
          userRoles: userContext.roles,
        });

        res.status(403).json({
          status: 'error',
          code: 'ACCESS_DENIED',
          message: `You do not have access to the '${serverName}' data source`,
        });
        return;
      }

      // Forward request to MCP server
      // SECURITY: toolName is validated above, server.url comes from trusted config
      const targetUrl = `${server.url}/tools/${encodeURIComponent(toolName)}`;

      // Get GCP identity token for Cloud Run service-to-service auth
      // Returns null in dev/stage (non-GCP environments)
      const identityToken = await getIdentityToken(server.url);

      // Generate internal authentication token for MCP server
      const mcpInternalToken = internalSecret
        ? generateInternalToken(internalSecret, userContext.userId, userContext.roles)
        : undefined;

      // Inject userContext into body so MCP servers can authorize requests
      // MCP servers read userContext from req.body (same pattern as GET handler)
      const enrichedBody = {
        ...body,
        userContext: {
          userId: userContext.userId,
          username: userContext.username,
          email: userContext.email,
          roles: userContext.roles,
        },
      };

      const mcpResponse = await axios.post(
        targetUrl,
        enrichedBody,
        {
          timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userContext.userId,
            'X-User-Roles': userContext.roles.join(','),
            'X-Request-ID': requestId,
            // Add internal token for MCP server authentication (prevents direct access bypass)
            ...(mcpInternalToken && { [INTERNAL_TOKEN_HEADER]: mcpInternalToken }),
            // Include GCP identity token if available (Cloud Run service-to-service)
            ...(identityToken && { Authorization: `Bearer ${identityToken}` }),
          },
        }
      );

      const toolResponse = mcpResponse.data as MCPToolResponse;

      // v1.4: Handle pending confirmations
      if (isPendingConfirmationResponse(toolResponse)) {
        logger.info('Pending confirmation created', {
          requestId,
          confirmationId: toolResponse.confirmationId,
          action: toolName,
        });
      }

      res.json(toolResponse);
    } catch (error) {
      handleMCPError(error, serverName, requestId, logger, res);
    }
  });

  return router;
}

/**
 * Common error handler for MCP proxy errors
 */
function handleMCPError(
  error: unknown,
  serverName: string,
  requestId: string,
  logger: Logger,
  res: Response
): void {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      // MCP server returned an error
      res.status(error.response.status).json(error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      res.status(503).json({
        status: 'error',
        code: 'SERVICE_UNAVAILABLE',
        message: `MCP server '${serverName}' is not available`,
        suggestedAction: 'Please try again later or contact support',
      });
    } else {
      logger.error('MCP tool proxy error:', error);
      res.status(500).json({
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Failed to communicate with MCP server',
        suggestedAction: 'Please try again or contact support',
      });
    }
  } else {
    logger.error('MCP tool proxy error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to communicate with MCP server',
      suggestedAction: 'Please try again or contact support',
    });
  }
}
