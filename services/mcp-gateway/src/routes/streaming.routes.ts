/**
 * Streaming Routes (Architecture v1.4)
 *
 * SSE streaming endpoints for AI queries with heartbeat keep-alive.
 * Extracted from index.ts for improved testability (Phase 3 Refactoring).
 *
 * Features:
 * - SSE streaming for long-running Claude queries (30-60 seconds)
 * - 15-second heartbeat to prevent proxy/gateway timeouts (ADDENDUM #6)
 * - Client disconnect detection with AbortController
 * - Truncation warning injection (Section 5.3)
 * - Pagination metadata (Section 5.2)
 * - Human-in-the-loop confirmations (Section 5.6)
 */

import { Router, Request, Response } from 'express';
import { Logger } from 'winston';
import Anthropic from '@anthropic-ai/sdk';
import {
  MCPToolResponse,
  isSuccessResponse,
  isPendingConfirmationResponse,
} from '../types/mcp-response';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { UserContext } from '../test-utils/mock-user-context';
import { scrubPII } from '../utils/pii-scrubber';
import { sanitizeForLog, MCPServerConfig } from '../utils/gateway-utils';

/**
 * MCP Query result with timeout status for partial response handling
 */
export interface MCPQueryResult {
  server: string;
  data: unknown;
  status: 'success' | 'timeout' | 'error';
  error?: string;
}

/**
 * Configuration for streaming routes
 */
export interface StreamingRoutesConfig {
  /** Claude model to use */
  claudeModel: string;
  /** Heartbeat interval in milliseconds (default: 15000) */
  heartbeatIntervalMs?: number;
}

/**
 * Dependencies for streaming routes
 */
export interface StreamingRoutesDependencies {
  /** Winston logger instance */
  logger: Logger;
  /** Anthropic client instance */
  anthropic: Anthropic;
  /** Configuration */
  config: StreamingRoutesConfig;
  /** Function to get accessible MCP servers for user roles */
  getAccessibleServers: (roles: string[]) => MCPServerConfig[];
  /** Function to query an MCP server */
  queryMCPServer: (
    server: MCPServerConfig,
    query: string,
    userContext: UserContext,
    cursor?: string
  ) => Promise<MCPQueryResult>;
}

/**
 * Create streaming routes with dependency injection
 *
 * @param deps - Injected dependencies for testability
 * @returns Express Router with streaming endpoints
 */
export function createStreamingRoutes(deps: StreamingRoutesDependencies): Router {
  const router = Router();
  const {
    logger,
    anthropic,
    config,
    getAccessibleServers,
    queryMCPServer,
  } = deps;

  const HEARTBEAT_INTERVAL = config.heartbeatIntervalMs ?? 15000;

  /**
   * SSE Streaming Query Handler (Section 6.1)
   *
   * Handles the core streaming logic for both GET and POST endpoints.
   * Includes heartbeat to prevent proxy timeouts during long Claude responses.
   */
  async function handleStreamingQuery(
    req: Request,
    res: Response,
    query: string,
    cursor?: string
  ): Promise<void> {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string;
    const userContext: UserContext = (req as AuthenticatedRequest).userContext!;

    logger.info('SSE Query received', {
      requestId,
      username: sanitizeForLog(userContext.username),
      query: scrubPII(query.substring(0, 100)),
      roles: userContext.roles,
      hasCursor: !!cursor,
    });

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Track stream state for cleanup
    let streamClosed = false;
    let heartbeatInterval: NodeJS.Timeout | null = null;

    // ADDENDUM #6: Start heartbeat to prevent proxy timeouts
    // Skip heartbeat if interval is 0 (useful for testing)
    if (HEARTBEAT_INTERVAL > 0) {
      heartbeatInterval = setInterval(() => {
        if (!streamClosed) {
          res.write(': heartbeat\n\n'); // SSE comment (ignored by clients)
          // Note: res.flush() is not available in standard Express
          // If using compression middleware, it may buffer - X-Accel-Buffering handles nginx
        }
      }, HEARTBEAT_INTERVAL);
    }

    // Client disconnect handling
    const cleanup = () => {
      streamClosed = true;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    };

    req.on('close', () => {
      logger.info('Client disconnected from SSE stream', { requestId });
      cleanup();
    });

    req.on('error', (err) => {
      logger.error('SSE request error', { requestId, error: err.message });
      cleanup();
    });

    try {
      // Determine accessible MCP servers
      const accessibleServers = getAccessibleServers(userContext.roles);

      // Query all accessible MCP servers in parallel (with cursor for pagination)
      const mcpPromises = accessibleServers.map((server) =>
        queryMCPServer(server, query, userContext, cursor)
      );
      const mcpResults = await Promise.all(mcpPromises);

      // Check if client disconnected during MCP queries
      if (streamClosed) {
        logger.info('Client disconnected before Claude call, aborting', { requestId });
        cleanup();
        return;
      }

      // v1.5: Detect timeouts and send service unavailability warnings
      const successfulResults = mcpResults.filter((r) => r.status === 'success');
      const timedOutResults = mcpResults.filter((r) => r.status === 'timeout');
      const errorResults = mcpResults.filter((r) => r.status === 'error');

      // Send SSE events for service unavailability (v1.5 partial response)
      if (timedOutResults.length > 0 || errorResults.length > 0) {
        const warnings = [
          ...timedOutResults.map((r) => ({
            server: r.server,
            code: 'TIMEOUT',
            message: r.error || 'Service did not respond in time',
          })),
          ...errorResults.map((r) => ({
            server: r.server,
            code: 'ERROR',
            message: r.error || 'Service error',
          })),
        ];

        res.write(`data: ${JSON.stringify({
          type: 'service_unavailable',
          warnings,
          successfulServers: successfulResults.map((r) => r.server),
          failedServers: [...timedOutResults, ...errorResults].map((r) => r.server),
        })}\n\n`);

        logger.warn('Partial response due to service failures', {
          requestId,
          timedOut: timedOutResults.map((r) => r.server),
          errors: errorResults.map((r) => r.server),
          successful: successfulResults.map((r) => r.server),
        });
      }

      // v1.4: Check for pagination metadata and pending confirmations
      const paginationInfo: { server: string; hasMore: boolean; nextCursor?: string; hint?: string }[] = [];

      mcpResults.forEach((result) => {
        const mcpResponse = result.data as MCPToolResponse;
        if (isSuccessResponse(mcpResponse) && mcpResponse.metadata?.hasMore) {
          paginationInfo.push({
            server: result.server,
            hasMore: mcpResponse.metadata.hasMore,
            nextCursor: mcpResponse.metadata.nextCursor,
            hint: mcpResponse.metadata.hint,
          });
        }
      });

      const hasPagination = paginationInfo.length > 0;

      // v1.4: Extract truncation warnings (Article III.2, Section 5.3)
      const truncationWarnings: string[] = [];
      mcpResults.forEach((result) => {
        const mcpResponse = result.data as MCPToolResponse;
        if (isSuccessResponse(mcpResponse) && mcpResponse.metadata?.truncated) {
          const returnedCount = mcpResponse.metadata.returnedCount || 50;
          truncationWarnings.push(
            `TRUNCATION WARNING: Data from ${result.server} returned only ${returnedCount} of ${returnedCount}+ records. ` +
            `You MUST inform the user that results are incomplete and may not represent the full dataset.`
          );
          logger.info('Truncation detected in MCP response', {
            requestId,
            server: result.server,
            returnedCount,
          });
        }
      });

      const pendingConfirmations = mcpResults.filter((result) => {
        const mcpResponse = result.data as MCPToolResponse;
        return isPendingConfirmationResponse(mcpResponse);
      });

      // If there are pending confirmations, return them immediately (no Claude call)
      if (pendingConfirmations.length > 0) {
        const confirmationResponse = pendingConfirmations[0].data as MCPToolResponse;
        res.write(`data: ${JSON.stringify(confirmationResponse)}\n\n`);
        res.write('data: [DONE]\n\n');
        cleanup();
        res.end();
        return;
      }

      // Build context from MCP data
      const dataContext = mcpResults
        .filter((d) => d.data !== null)
        .map((d) => `[Data from ${d.server}]:\n${JSON.stringify(d.data, null, 2)}`)
        .join('\n\n');

      // v1.4: Build pagination instructions for Claude
      let paginationInstructions = '';
      if (hasPagination) {
        const hints = paginationInfo.map(p => p.hint).filter(Boolean);
        paginationInstructions = `\n\nPAGINATION INFO: More data is available. ${hints.join(' ')} You MUST inform the user that they are viewing a partial result set and can request more data.`;
      }

      const systemPrompt = buildSystemPrompt(userContext, dataContext, paginationInstructions, truncationWarnings);

      // Check if client disconnected before expensive Claude call (ADDENDUM #6 - cost savings)
      if (streamClosed) {
        logger.info('Client disconnected before Claude API call, saved API cost', { requestId });
        cleanup();
        return;
      }

      // Stream Claude response
      const stream = await anthropic.messages.stream({
        model: config.claudeModel,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
      });

      // Stream each chunk to the client
      for await (const chunk of stream) {
        // Check if client disconnected mid-stream
        if (streamClosed) {
          logger.info('Client disconnected mid-stream, aborting', { requestId });
          break;
        }

        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.delta.text })}\n\n`);
        }
      }

      // Only send completion if client still connected
      if (!streamClosed) {
        // Send pagination metadata if more data is available
        if (hasPagination) {
          res.write(`data: ${JSON.stringify({
            type: 'pagination',
            hasMore: true,
            cursors: paginationInfo.map(p => ({ server: p.server, cursor: p.nextCursor })),
            hint: 'More data available. Request next page to continue.',
          })}\n\n`);
        }

        // Send completion signal
        res.write('data: [DONE]\n\n');
        res.end();

        const durationMs = Date.now() - startTime;
        logger.info('SSE query completed', { requestId, durationMs });
      }
    } catch (error) {
      // Only send error if client still connected
      if (!streamClosed) {
        logger.error('SSE query error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to process query' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } finally {
      cleanup();
    }
  }

  /**
   * Build system prompt for Claude with user context and data
   */
  function buildSystemPrompt(
    userContext: UserContext,
    dataContext: string,
    paginationInstructions: string,
    truncationWarnings: string[]
  ): string {
    return `You are an AI assistant for Tamshai Corp, a family investment management organization.
You have access to enterprise data based on the user's role permissions.
The current user is "${userContext.username}" (email: ${userContext.email || 'unknown'}) with system roles: ${userContext.roles.join(', ')}.

IMPORTANT - User Identity Context:
- First, look for this user in the employee data to understand their position and department
- Use their employee record to determine who their team members or direct reports are
- If the user asks about "my team" or "my employees", find the user in the data first, then find employees who report to them or are in their department

When answering questions:
1. Only use the data provided in the context below
2. If the data doesn't contain information to answer the question, say so
3. Never make up or infer sensitive information not in the data
4. Be concise and professional
5. If asked about data you don't have access to, explain that the user's role doesn't have permission
6. When asked about "my team", first identify the user in the employee data, then find their direct reports${paginationInstructions}${truncationWarnings.length > 0 ? '\n\n' + truncationWarnings.join('\n') : ''}

Available data context:
${dataContext || 'No relevant data available for this query.'}`;
  }

  /**
   * GET /api/query - SSE Streaming Query (EventSource compatible)
   *
   * @deprecated Use POST /api/query instead for better security.
   *
   * SECURITY WARNING: This endpoint accepts tokens via query parameter
   * which causes tokens to appear in:
   * - Server access logs
   * - Browser history
   * - Proxy logs
   * - Network monitoring tools
   *
   * Kept for backwards compatibility with EventSource clients.
   */
  router.get('/query', async (req: Request, res: Response) => {
    const query = req.query.q as string;
    const cursor = req.query.cursor as string | undefined;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    await handleStreamingQuery(req, res, query, cursor);
  });

  /**
   * POST /api/query - SSE Streaming Query (RECOMMENDED)
   *
   * This is the preferred endpoint for AI queries. Supports:
   * - fetch() API with streaming response
   * - Proper Authorization header (not exposed in logs)
   * - JSON body for complex queries
   */
  router.post('/query', async (req: Request, res: Response) => {
    const { query, cursor } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Field "query" is required' });
      return;
    }

    await handleStreamingQuery(req, res, query, cursor);
  });

  return router;
}

// Export types for testing
export type { UserContext };
