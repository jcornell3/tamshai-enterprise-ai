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
 * - Graceful shutdown with connection draining (Phase 4)
 */

import { Router, Request, Response, RequestHandler } from 'express';
import { Logger } from 'winston';
import Anthropic from '@anthropic-ai/sdk';
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages';
import {
  MCPToolResponse,
  isSuccessResponse,
  isPendingConfirmationResponse,
} from '../types/mcp-response';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { UserContext } from '../test-utils/mock-user-context';
import { scrubPII } from '../utils/pii-scrubber';
import { sanitizeForLog, MCPServerConfig } from '../utils/gateway-utils';
import { promptDefense } from '../ai/prompt-defense';

// =============================================================================
// CONNECTION TRACKING (Phase 4 - Graceful Shutdown)
// =============================================================================

/**
 * Track active SSE connections for graceful shutdown
 * Connections are added when streaming starts and removed on close/error
 */
const activeConnections = new Set<Response>();

/**
 * Get count of active SSE connections
 * Used for monitoring and graceful shutdown decisions
 */
export function getActiveConnectionCount(): number {
  return activeConnections.size;
}

/**
 * Drain all active SSE connections during shutdown
 * Sends shutdown event to all clients and closes connections
 *
 * @returns Number of connections drained
 */
export function drainConnections(): number {
  const count = activeConnections.size;
  for (const res of activeConnections) {
    try {
      res.write(`data: ${JSON.stringify({ type: 'shutdown', message: 'Server is shutting down' })}\n\n`);
      res.end();
    } catch {
      // Connection may already be closed, ignore errors
    }
  }
  activeConnections.clear();
  return count;
}

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
  /** Claude API key (used to detect mock mode) */
  claudeApiKey?: string;
}

/**
 * Check if streaming should use mock mode (for CI integration tests)
 * Mock mode is enabled when API key starts with 'sk-ant-test-'
 *
 * Note: We intentionally do NOT check NODE_ENV === 'test' because:
 * - Unit tests mock the Anthropic SDK directly and expect those mocks to be called
 * - Integration tests use CLAUDE_API_KEY=sk-ant-test-* to trigger mock mode
 */
function isMockMode(apiKey?: string): boolean {
  return apiKey?.startsWith('sk-ant-test-') ?? false;
}

/**
 * Generate mock SSE stream for testing
 * Simulates Claude's streaming response format
 */
function writeMockStream(
  res: Response,
  query: string,
  userContext: UserContext,
  mcpServers: string[]
): void {
  const mockResponse = `[Mock Response] Query processed successfully for user ${userContext.username} ` +
    `with roles: ${userContext.roles.join(', ')}. ` +
    `Data sources consulted: ${mcpServers.join(', ') || 'none'}. ` +
    `Query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`;

  // Split into chunks to simulate streaming
  const words = mockResponse.split(' ');
  const chunkSize = 3;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '');
    res.write(`data: ${JSON.stringify({ type: 'text', text: chunk })}\n\n`);
  }
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
  /** Rate limiter middleware for AI query endpoints */
  rateLimiter: RequestHandler;
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
    rateLimiter,
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

    let safeQuery: string;
    try {
      safeQuery = promptDefense.sanitize(query);
    } catch (error) {
      logger.warn('Blocked a suspicious query due to prompt injection defenses.', {
        requestId,
        username: sanitizeForLog(userContext.username),
        originalQuery: scrubPII(query.substring(0, 200)),
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(400).json({ error: 'Invalid query.' });
      return;
    }

    logger.info('SSE Query received', {
      requestId,
      username: sanitizeForLog(userContext.username),
      query: scrubPII(query.substring(0, 100)),
      roles: userContext.roles,
      hasCursor: !!cursor,
    });

    // DISPLAY DIRECTIVE PRE-PROCESSING CHECK
    // Check for display directive triggers BEFORE calling Claude (more reliable + saves API cost)
    const queryLower = query.toLowerCase();
    let displayDirective: string | null = null;

    logger.info('🔍 Directive detection check', {
      requestId,
      query,
      queryLower,
      includesApproval: queryLower.includes('approval'),
      includesAwaitingMyApproval: queryLower.includes('awaiting my approval'),
    });

    // Helper: Extract year from query (2020-2030), default to current year
    const extractYear = (q: string, defaultYear = 2026): number => {
      const match = q.match(/\b(202[0-9])\b/);
      return match ? parseInt(match[1]) : defaultYear;
    };

    // Helper: Extract department from query
    const extractDepartment = (q: string, defaultDept = 'Engineering'): string => {
      const deptMatch = q.match(/\b(engineering|finance|hr|human resources|sales|it|marketing|executive|operations|legal)\b/i);
      if (!deptMatch) return defaultDept;
      const dept = deptMatch[1].toLowerCase();
      // Normalize department names
      if (dept === 'human resources') return 'HR';
      return dept.charAt(0).toUpperCase() + dept.slice(1);
    };

    // Helper: Extract quarter from query (Q1-Q4)
    const extractQuarter = (q: string, defaultQuarter = 'Q1'): string => {
      const match = q.match(/\b(q[1-4])\b/i);
      return match ? match[1].toUpperCase() : defaultQuarter;
    };

    // Helper: Extract lead status from query
    // Maps natural language to valid lead statuses: NEW, CONTACTED, QUALIFIED, CONVERTED, DISQUALIFIED
    const extractLeadStatus = (q: string, defaultStatus = 'NEW'): string => {
      const statusMatch = q.match(/\b(hot|warm|cold|new|qualified|contacted|converted|disqualified|nurturing)\b/i);
      if (!statusMatch) return defaultStatus;

      const matched = statusMatch[1].toLowerCase();
      // Map temperature terms to pipeline statuses
      const statusMap: Record<string, string> = {
        'hot': 'QUALIFIED',      // Hot leads are qualified and ready
        'warm': 'CONTACTED',     // Warm leads have been contacted
        'cold': 'NEW',           // Cold leads are new/uncontacted
        'nurturing': 'CONTACTED', // Nurturing implies contacted
      };

      return statusMap[matched] || matched.toUpperCase();
    };

    // Helper: Extract limit from query
    const extractLimit = (q: string, defaultLimit = 50): number => {
      const match = q.match(/\b(\d+)\s+(leads|records|results)\b/i);
      return match ? parseInt(match[1]) : defaultLimit;
    };

    // Check each directive's trigger keywords with parameter extraction
    if (
      queryLower.includes('org chart') ||
      queryLower.includes('team structure') ||
      queryLower.includes('show my team') ||
      queryLower.includes('who reports') ||
      queryLower.includes('direct reports') ||
      queryLower.includes('organizational chart') ||
      queryLower.includes('show me my org chart')
    ) {
      displayDirective = 'display:hr:org_chart:userId=me,depth=1';
    } else if (
      queryLower.includes('approval') || // Matches both singular and plural
      queryLower.includes('things to approve') ||
      queryLower.includes('items to approve') ||
      queryLower.includes('awaiting my approval') ||
      queryLower.includes('need my approval') ||
      queryLower.includes('time off requests')
    ) {
      displayDirective = 'display:approvals:pending:userId=me';
    } else if (
      queryLower.includes('leads') ||
      queryLower.includes('pipeline') ||
      queryLower.includes('prospects') ||
      queryLower.includes('show leads')
    ) {
      const status = extractLeadStatus(query);
      const limit = extractLimit(query);
      displayDirective = `display:sales:leads:status=${status},limit=${limit}`;
    } else if (
      queryLower.includes('forecast') ||
      queryLower.includes('quota') ||
      queryLower.includes('sales targets') ||
      queryLower.includes('revenue forecast')
    ) {
      // Extract period (quarter or year)
      const quarter = query.match(/\b(q[1-4])\b/i);
      const year = query.match(/\b(202[0-9])\b/);
      const period = quarter ? quarter[1].toUpperCase() : (year ? year[1] : 'current');
      displayDirective = `display:sales:forecast:period=${period}`;
    } else if (
      queryLower.includes('budget') ||
      queryLower.includes('spending') ||
      queryLower.includes('department budget') ||
      queryLower.includes('show budget')
    ) {
      const department = extractDepartment(query);
      const year = extractYear(query);
      displayDirective = `display:finance:budget:department=${department},year=${year}`;
    } else if (
      queryLower.includes('quarterly financials') ||
      queryLower.includes('q1 report') ||
      queryLower.includes('q2 report') ||
      queryLower.includes('q3 report') ||
      queryLower.includes('q4 report') ||
      queryLower.includes('quarterly report')
    ) {
      const quarter = extractQuarter(query);
      const year = extractYear(query, 2025);
      displayDirective = `display:finance:quarterly_report:quarter=${quarter},year=${year}`;
    }

    // If directive matched, send it immediately and skip Claude API call
    if (displayDirective) {
      logger.info('Display directive matched - bypassing Claude', {
        requestId,
        directive: displayDirective,
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Send directive as a text chunk (must include type field for client compatibility)
      res.write(`data: ${JSON.stringify({ type: 'text', text: displayDirective })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();

      logger.info('Display directive sent', {
        requestId,
        duration: Date.now() - startTime,
      });
      return;
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Track connection for graceful shutdown (Phase 4)
    activeConnections.add(res);

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
      // Remove from active connections (Phase 4 graceful shutdown)
      activeConnections.delete(res);
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
        queryMCPServer(server, safeQuery, userContext, cursor)
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

      // Track usage from stream events for cache metrics (declared here for both mock and real mode)
      let streamUsage: Record<string, unknown> = {};

      // MOCK MODE: Return simulated streaming response for testing/CI
      if (isMockMode(config.claudeApiKey)) {
        logger.info('Mock mode: Returning simulated streaming response', {
          requestId,
          username: userContext.username,
          roles: userContext.roles,
          mcpServers: mcpResults.filter(r => r.status === 'success').map(r => r.server),
        });

        const successfulServers = mcpResults.filter(r => r.status === 'success').map(r => r.server);
        writeMockStream(res, safeQuery, userContext, successfulServers);
      } else {
        // Stream Claude response
        const stream = await anthropic.messages.stream({
          model: config.claudeModel,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: safeQuery,
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

          if (chunk.type === 'message_start') {
            const startEvent = chunk as unknown as { message?: { usage?: Record<string, unknown> } };
            if (startEvent.message?.usage) {
              streamUsage = startEvent.message.usage;
            }
          }

          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const sanitizedChunk = promptDefense.scanOutput(chunk.delta.text);
            res.write(`data: ${JSON.stringify({ type: 'text', text: sanitizedChunk })}\n\n`);
          }
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
        logger.info('SSE query completed', {
          requestId,
          durationMs,
          cacheCreationTokens: streamUsage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: streamUsage.cache_read_input_tokens ?? 0,
        });
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
   * Build system prompt for Claude with user context and data.
   *
   * Returns TextBlockParam[] with cache_control on the data block
   * to enable Anthropic's prompt caching (10% cost for cache reads).
   */
  function buildSystemPrompt(
    userContext: UserContext,
    dataContext: string,
    paginationInstructions: string,
    truncationWarnings: string[]
  ): TextBlockParam[] {
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    });

    const instructions = `You are an AI assistant for Tamshai Corp, a family investment management organization.
You have access to enterprise data based on the user's role permissions.
The current user is "${userContext.username}" (email: ${userContext.email || 'unknown'}) with system roles: ${userContext.roles.join(', ')}.

Current date: ${currentDate}

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
6. When asked about "my team", first identify the user in the employee data, then find their direct reports${paginationInstructions}${truncationWarnings.length > 0 ? '\n\n' + truncationWarnings.join('\n') : ''}`;

    const dataBlock = `Available data context:\n${dataContext || 'No relevant data available for this query.'}`;

    return [
      {
        type: "text" as const,
        text: instructions,
      },
      {
        type: "text" as const,
        text: dataBlock,
        cache_control: { type: "ephemeral" as const },
      },
    ];
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
  router.get('/query', rateLimiter, async (req: Request, res: Response) => {
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
  router.post('/query', rateLimiter, async (req: Request, res: Response) => {
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
