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

// Extended Request type with userContext property
interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
}

export interface MCPProxyRoutesDependencies {
  logger: Logger;
  mcpServers: MCPServerConfig[];
  getAccessibleServers: (roles: string[]) => MCPServerConfig[];
  timeout?: number;
}

/**
 * Creates MCP proxy routes with dependency injection
 */
export function createMCPProxyRoutes(deps: MCPProxyRoutesDependencies): Router {
  const router = Router();
  const { logger, mcpServers, getAccessibleServers, timeout = 30000 } = deps;

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

    // Convert query params to proper types (Express parses everything as strings)
    const queryParams: Record<string, string | number | string[]> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (value === undefined) continue;
      // Try to parse as number if it looks numeric
      if (typeof value === 'string' && /^\d+$/.test(value)) {
        queryParams[key] = parseInt(value, 10);
      } else if (typeof value === 'string') {
        queryParams[key] = value;
      } else if (Array.isArray(value)) {
        queryParams[key] = value.filter((v): v is string => typeof v === 'string');
      }
      // Skip ParsedQs objects (nested query params)
    }

    logger.info(`MCP tool call: ${serverName}/${toolName}`, {
      requestId,
      userId: userContext.userId,
      queryParams,
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

      // Forward request to MCP server (MCP servers expect POST with {input, userContext})
      // SECURITY: toolName is validated above, server.url comes from trusted config
      const mcpResponse = await axios.post(
        `${server.url}/tools/${encodeURIComponent(toolName)}`,
        {
          input: queryParams, // Query params become input
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

    logger.info(`MCP tool call (POST): ${serverName}/${toolName}`, {
      requestId,
      userId: userContext.userId,
      body,
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
      const mcpResponse = await axios.post(
        `${server.url}/tools/${encodeURIComponent(toolName)}`,
        body,
        {
          timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userContext.userId,
            'X-User-Roles': userContext.roles.join(','),
            'X-Request-ID': requestId,
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
