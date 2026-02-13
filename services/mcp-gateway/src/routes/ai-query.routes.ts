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

import { Router, Request, Response, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'winston';
import { scrubPII } from '../utils/pii-scrubber';
import { sanitizeForLog, MCPServerConfig } from '../utils/gateway-utils';
import { MCPQueryResult } from '../mcp/mcp-client';
import { UserContext } from '../test-utils/mock-user-context';
import { getMCPContext as getMCPContextDefault, storeMCPContext as storeMCPContextDefault } from '../utils/redis';

// Extended Request type with userContext property
interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
}

interface AIQueryRequest {
  query: string;
  conversationId?: string;
  context?: Record<string, unknown>;
  forceRefresh?: boolean;
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
  /** Send query to Claude with pre-formatted data context string (for cached contexts) */
  queryWithContext?: (
    query: string,
    dataContext: string,
    userContext: UserContext
  ) => Promise<string>;
  /** Get cached MCP context from Redis (injectable for testing) */
  getMCPContext?: (userId: string) => Promise<string | null>;
  /** Store MCP context in Redis (injectable for testing) */
  storeMCPContext?: (userId: string, context: string, ttl?: number) => Promise<void>;
  rateLimiter: RequestHandler;
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
    queryWithContext: queryWithContextFn,
    getMCPContext: getMCPContextFn = getMCPContextDefault,
    storeMCPContext: storeMCPContextFn = storeMCPContextDefault,
    rateLimiter,
  } = deps;

  /**
   * POST /ai/query
   * Main AI query endpoint for non-streaming requests
   */
  router.post('/ai/query', rateLimiter, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string;
    const userContext: UserContext = (req as AuthenticatedRequest).userContext!;
    const { query, conversationId, forceRefresh }: AIQueryRequest = req.body;

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

      // Check Redis for cached MCP context
      let mcpDataString: string | null = null;
      let cacheHit = false;

      if (!forceRefresh) {
        try {
          mcpDataString = await getMCPContextFn(userContext.userId);
          if (mcpDataString) {
            cacheHit = true;
            logger.info('MCP context cache hit', { requestId, userId: userContext.userId });
          }
        } catch (err) {
          logger.warn('Failed to read MCP context cache', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      let resolvedResults: MCPQueryResult[];
      let successfulResults: MCPQueryResult[];
      let failedResults: MCPQueryResult[];

      if (!cacheHit) {
        // Cache miss: Query all accessible MCP servers in parallel with timeout
        const MCP_TIMEOUT_MS = parseInt(process.env.MCP_QUERY_TIMEOUT_MS || '5000');

        const mcpPromises = accessibleServers.map(async (server) => {
          try {
            // Race between actual query and timeout
            const result = await Promise.race([
              queryMCPServer(server, query, userContext),
              new Promise<MCPQueryResult>((_, reject) =>
                setTimeout(() => reject(new Error('MCP_QUERY_TIMEOUT')), MCP_TIMEOUT_MS)
              ),
            ]);
            return result;
          } catch (error) {
            // Handle timeout or query failure gracefully
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.warn(`MCP server query failed`, {
              server: server.name,
              error: errorMessage,
              timeout: errorMessage === 'MCP_QUERY_TIMEOUT',
            });
            return {
              server: server.name,
              status: 'error' as const,
              error: errorMessage,
              data: null,
              durationMs: MCP_TIMEOUT_MS,
            };
          }
        });

        const mcpResults = await Promise.allSettled(mcpPromises);
        resolvedResults = mcpResults
          .filter((r): r is PromiseFulfilledResult<MCPQueryResult> => r.status === 'fulfilled')
          .map((r) => r.value);

        successfulResults = resolvedResults.filter((r) => r.status === 'success');
        failedResults = resolvedResults.filter((r) => r.status !== 'success');

        // Serialize and cache the successful results
        mcpDataString = successfulResults
          .filter((d) => d.data !== null)
          .map((d) => `[Data from ${d.server}]:\n${JSON.stringify(d.data, null, 2)}`)
          .join('\n\n');

        // Store in Redis (fire-and-forget, don't block response)
        storeMCPContextFn(userContext.userId, mcpDataString).catch((err) =>
          logger.warn('Failed to cache MCP context', { error: err instanceof Error ? err.message : String(err) })
        );
      } else {
        // Cache hit: no individual server results available
        resolvedResults = [];
        successfulResults = [];
        failedResults = [];
      }

      // Log any partial response issues
      if (failedResults.length > 0) {
        logger.warn('Partial response in non-streaming query', {
          requestId,
          failed: failedResults.map((r) => ({ server: r.server, status: r.status, error: r.error })),
          successful: successfulResults.map((r) => r.server),
        });
      }

      // Send to Claude with context
      let aiResponse: string;
      if (queryWithContextFn && mcpDataString !== null) {
        // Use queryWithContext for byte-identical cached prompts
        aiResponse = await queryWithContextFn(query, mcpDataString, userContext);
      } else {
        // Fallback to original method (backwards compatibility)
        aiResponse = await sendToClaudeWithContext(query, successfulResults, userContext);
      }

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
