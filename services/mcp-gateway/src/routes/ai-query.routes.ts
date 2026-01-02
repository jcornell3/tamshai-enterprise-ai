/**
 * AI Query Routes
 *
 * Routes: /api/ai/query (POST)
 *
 * Handles AI queries by:
 * 1. Determining accessible MCP servers based on user roles
 * 2. Querying all accessible MCP servers in parallel
 * 3. Sending results to Claude API for processing
 * 4. Returning the AI response with metadata
 *
 * Extracted from index.ts for testability (Phase 7 Refactoring)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'winston';
import { scrubPII } from '../utils/pii-scrubber';
import { sanitizeForLog, MCPServerConfig } from '../utils/gateway-utils';
import { MCPQueryResult } from '../mcp/mcp-client';
import { UserContext } from '../test-utils/mock-user-context';

// Extended Request type with userContext property
interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
}

interface AIQueryRequest {
  query: string;
  conversationId?: string;
  context?: Record<string, unknown>;
}

interface AuditLog {
  timestamp: string;
  requestId: string;
  userId: string;
  username: string;
  roles: string[];
  query: string;
  mcpServersAccessed: string[];
  mcpServersDenied: string[];
  responseSuccess: boolean;
  durationMs: number;
}

export interface AIQueryRoutesDependencies {
  logger: Logger;
  getAccessibleServers: (roles: string[]) => MCPServerConfig[];
  getDeniedServers: (roles: string[]) => MCPServerConfig[];
  queryMCPServer: (
    server: MCPServerConfig,
    query: string,
    userContext: UserContext
  ) => Promise<MCPQueryResult>;
  sendToClaudeWithContext: (
    query: string,
    mcpData: Array<{ server: string; data: unknown }>,
    userContext: UserContext
  ) => Promise<string>;
}

/**
 * Creates AI query routes with dependency injection
 */
export function createAIQueryRoutes(deps: AIQueryRoutesDependencies): Router {
  const router = Router();
  const {
    logger,
    getAccessibleServers,
    getDeniedServers,
    queryMCPServer,
    sendToClaudeWithContext,
  } = deps;

  /**
   * POST /ai/query
   * Main AI query endpoint for non-streaming requests
   */
  router.post('/ai/query', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string;
    const userContext: UserContext = (req as AuthenticatedRequest).userContext!;
    const { query, conversationId }: AIQueryRequest = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    logger.info('AI Query received', {
      requestId,
      username: sanitizeForLog(userContext.username),
      query: scrubPII(query.substring(0, 100)),
      roles: userContext.roles,
    });

    try {
      // Determine accessible MCP servers
      const accessibleServers = getAccessibleServers(userContext.roles);
      const deniedServers = getDeniedServers(userContext.roles);

      // Query all accessible MCP servers in parallel
      const mcpPromises = accessibleServers.map((server) =>
        queryMCPServer(server, query, userContext)
      );
      const mcpResults = await Promise.all(mcpPromises);

      // v1.5: Separate successful from failed results
      const successfulResults = mcpResults.filter((r) => r.status === 'success');
      const failedResults = mcpResults.filter((r) => r.status !== 'success');

      // Log any partial response issues
      if (failedResults.length > 0) {
        logger.warn('Partial response in non-streaming query', {
          requestId,
          failed: failedResults.map((r) => ({ server: r.server, status: r.status, error: r.error })),
          successful: successfulResults.map((r) => r.server),
        });
      }

      // Send to Claude with context (only successful results)
      const aiResponse = await sendToClaudeWithContext(query, successfulResults, userContext);

      const durationMs = Date.now() - startTime;

      // Audit log - scrub PII before logging (security fix)
      const auditLog: AuditLog = {
        timestamp: new Date().toISOString(),
        requestId,
        userId: userContext.userId,
        username: userContext.username,
        roles: userContext.roles,
        query: scrubPII(query), // Scrub PII from query before logging
        mcpServersAccessed: successfulResults.map((r) => r.server),
        mcpServersDenied: deniedServers.map((s) => s.name),
        responseSuccess: true,
        durationMs,
      };
      logger.info('Audit log:', auditLog);

      // v1.5: Include partial response warnings in metadata
      const responseWarnings = failedResults.map((r) => ({
        server: r.server,
        status: r.status,
        message: r.error,
      }));

      res.json({
        requestId,
        conversationId: conversationId || uuidv4(),
        response: aiResponse,
        status: failedResults.length > 0 ? 'partial' : 'success',
        metadata: {
          dataSourcesQueried: successfulResults.map((r) => r.server),
          dataSourcesFailed: failedResults.map((r) => r.server),
          processingTimeMs: durationMs,
        },
        ...(responseWarnings.length > 0 && { warnings: responseWarnings }),
      });
    } catch (error) {
      logger.error('AI query error:', error);
      res.status(500).json({
        error: 'Failed to process AI query',
        requestId,
      });
    }
  });

  return router;
}
