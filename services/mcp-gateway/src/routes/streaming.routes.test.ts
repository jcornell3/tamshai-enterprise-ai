/**
 * Unit tests for Streaming Routes
 *
 * Target: 95%+ coverage
 * Tests SSE streaming, heartbeat, client disconnect handling, and error scenarios.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { EventEmitter } from 'events';
import {
  createStreamingRoutes,
  StreamingRoutesDependencies,
  StreamingRoutesConfig,
  MCPQueryResult,
} from './streaming.routes';
import { createMockLogger } from '../test-utils/mock-logger';
import { TEST_USERS } from '../test-utils/mock-user-context';
import { MCPServerConfig } from '../utils/gateway-utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteLayer = any;

describe('Streaming Routes', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockAnthropic: jest.Mocked<{
    messages: {
      stream: jest.Mock;
    };
  }>;
  let mockGetAccessibleServers: jest.Mock;
  let mockQueryMCPServer: jest.Mock;
  let config: StreamingRoutesConfig;
  let deps: StreamingRoutesDependencies;

  // Mock MCP server configs
  const mockHRServer: MCPServerConfig = {
    name: 'mcp-hr',
    url: 'http://localhost:3001',
    requiredRoles: ['hr-read'],
    description: 'HR MCP Server',
  };

  const mockFinanceServer: MCPServerConfig = {
    name: 'mcp-finance',
    url: 'http://localhost:3002',
    requiredRoles: ['finance-read'],
    description: 'Finance MCP Server',
  };

  // Helper to create async iterator for Claude stream
  function createMockStream(chunks: { type: string; delta: { type: string; text: string } }[]) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          yield chunk;
        }
      },
    };
  }

  // Helper to create mock request/response for direct handler testing
  function createMockReqRes(userContext = TEST_USERS.hrManager) {
    const reqEmitter = new EventEmitter();
    const req = Object.assign(reqEmitter, {
      body: { query: 'test query' },
      query: {},
      headers: { 'x-request-id': 'test-request-id' },
      method: 'POST',
      path: '/api/query',
      userContext,
    }) as unknown as Request;

    const writtenData: string[] = [];
    const res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((data: string) => {
        writtenData.push(data);
        return true;
      }),
      end: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      _writtenData: writtenData,
    } as unknown as Response & { _writtenData: string[] };

    const next = jest.fn() as NextFunction;

    return { req, res, next };
  }

  beforeEach(() => {
    mockLogger = createMockLogger();

    // Create mock Anthropic client
    mockAnthropic = {
      messages: {
        stream: jest.fn(),
      },
    };

    mockGetAccessibleServers = jest.fn();
    mockQueryMCPServer = jest.fn();

    config = {
      claudeModel: 'claude-sonnet-4-20250514',
      heartbeatIntervalMs: 0, // Disable heartbeat for tests
    };

    deps = {
      logger: mockLogger,
      anthropic: mockAnthropic as unknown as StreamingRoutesDependencies['anthropic'],
      config,
      getAccessibleServers: mockGetAccessibleServers,
      queryMCPServer: mockQueryMCPServer,
      rateLimiter: (req: any, res: any, next: any) => next(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createStreamingRoutes', () => {
    it('should create router with GET and POST /query routes', () => {
      const router = createStreamingRoutes(deps);
      expect(router).toBeDefined();

      // Check router has routes by examining stack
      const routeCount = router.stack.filter(
        (layer) => layer.route
      ).length;
      expect(routeCount).toBe(2);
    });
  });

  describe('GET /api/query validation', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: typeof TEST_USERS.hrManager }).userContext = TEST_USERS.hrManager;
        next();
      });
      app.use('/api', createStreamingRoutes(deps));
    });

    it('should reject request without query parameter', async () => {
      const response = await request(app)
        .get('/api/query')
        .expect(400);

      expect(response.body.error).toBe('Query parameter "q" is required');
    });
  });

  describe('POST /api/query validation', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: typeof TEST_USERS.hrManager }).userContext = TEST_USERS.hrManager;
        next();
      });
      app.use('/api', createStreamingRoutes(deps));
    });

    it('should reject request without query in body', async () => {
      const response = await request(app)
        .post('/api/query')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Field "query" is required');
    });
  });

  describe('handleStreamingQuery (via direct router testing)', () => {
    let router: ReturnType<typeof createStreamingRoutes>;

    beforeEach(() => {
      router = createStreamingRoutes(deps);
    });

    // Get the POST handler from router for direct testing
    function getPostHandler() {
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');
      return handler;
    }

    it('should stream Claude response to client', async () => {
      mockGetAccessibleServers.mockReturnValue([mockFinanceServer]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-finance',
        data: { status: 'success', data: [{ name: 'Test' }] },
        status: 'success',
      });

      mockAnthropic.messages.stream.mockResolvedValue(
        createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: ' World' } },
        ])
      );

      const { req, res, next } = createMockReqRes();
      const handler = getPostHandler();

      await handler(req, res, next);

      // Verify stream chunks were written
      const allData = res._writtenData.join('');
      expect(allData).toContain('"type":"text"');
      expect(allData).toContain('"text":"Hello"');
      expect(allData).toContain('"text":" World"');
      expect(allData).toContain('[DONE]');
      expect(res.end).toHaveBeenCalled();
    });

    it('should accept cursor from request', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: { status: 'success', data: [] },
        status: 'success',
      });

      mockAnthropic.messages.stream.mockResolvedValue(
        createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Page 2' } },
        ])
      );

      const { req, res, next } = createMockReqRes();
      req.body = { query: 'list employees', cursor: 'page-2-cursor' };
      const handler = getPostHandler();

      await handler(req, res, next);

      // Cursor should have been passed to MCP query
      expect(mockQueryMCPServer).toHaveBeenCalledWith(
        mockHRServer,
        'list employees',
        expect.objectContaining({ userId: TEST_USERS.hrManager.userId }),
        'page-2-cursor'
      );

      // Should log that cursor was present
      expect(mockLogger.info).toHaveBeenCalledWith(
        'SSE Query received',
        expect.objectContaining({ hasCursor: true })
      );
    });

    it('should set correct SSE headers', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: { status: 'success', data: [] },
        status: 'success',
      });

      mockAnthropic.messages.stream.mockResolvedValue(
        createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Test' } },
        ])
      );

      const { req, res, next } = createMockReqRes();
      const handler = getPostHandler();

      await handler(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();
    });
  });

  describe('MCP Server Failures (v1.5 Partial Response)', () => {
    let router: ReturnType<typeof createStreamingRoutes>;

    beforeEach(() => {
      router = createStreamingRoutes(deps);
    });

    function getPostHandler() {
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');
      return handler;
    }

    it('should send service_unavailable event when MCP servers timeout', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer, mockFinanceServer]);

      // One success, one timeout
      mockQueryMCPServer
        .mockResolvedValueOnce({
          server: 'mcp-hr',
          data: { status: 'success', data: [] },
          status: 'success',
        })
        .mockResolvedValueOnce({
          server: 'mcp-finance',
          data: null,
          status: 'timeout',
          error: 'Service did not respond in time',
        });

      mockAnthropic.messages.stream.mockResolvedValue(
        createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } },
        ])
      );

      const { req, res, next } = createMockReqRes();
      const handler = getPostHandler();

      await handler(req, res, next);

      const allData = res._writtenData.join('');
      expect(allData).toContain('service_unavailable');
      expect(allData).toContain('mcp-finance');
      expect(allData).toContain('TIMEOUT');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Partial response due to service failures',
        expect.objectContaining({
          timedOut: ['mcp-finance'],
          successful: ['mcp-hr'],
        })
      );
    });

    it('should handle MCP server errors', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);

      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: null,
        status: 'error',
        error: 'Database connection failed',
      });

      mockAnthropic.messages.stream.mockResolvedValue(
        createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Error response' } },
        ])
      );

      const { req, res, next } = createMockReqRes();
      const handler = getPostHandler();

      await handler(req, res, next);

      const allData = res._writtenData.join('');
      expect(allData).toContain('service_unavailable');
      expect(allData).toContain('ERROR');
    });
  });

  describe('Truncation Warnings (v1.4 Section 5.3)', () => {
    let router: ReturnType<typeof createStreamingRoutes>;

    beforeEach(() => {
      router = createStreamingRoutes(deps);
    });

    function getPostHandler() {
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');
      return handler;
    }

    it('should include truncation warnings in Claude prompt', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);

      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: {
          status: 'success',
          data: [{ id: 1 }, { id: 2 }],
          metadata: {
            truncated: true,
            returnedCount: 50,
            totalCount: '100+',
          },
        },
        status: 'success',
      });

      let capturedSystemPrompt = '';
      mockAnthropic.messages.stream.mockImplementation(({ system }) => {
        capturedSystemPrompt = system as string;
        return createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } },
        ]);
      });

      const { req, res, next } = createMockReqRes();
      req.body = { query: 'list all employees' };
      const handler = getPostHandler();

      await handler(req, res, next);

      expect(capturedSystemPrompt).toContain('TRUNCATION WARNING');
      expect(capturedSystemPrompt).toContain('mcp-hr');
      expect(capturedSystemPrompt).toContain('50');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Truncation detected in MCP response',
        expect.objectContaining({
          server: 'mcp-hr',
          returnedCount: 50,
        })
      );
    });
  });

  describe('Pagination (v1.4 Section 5.2)', () => {
    let router: ReturnType<typeof createStreamingRoutes>;

    beforeEach(() => {
      router = createStreamingRoutes(deps);
    });

    function getPostHandler() {
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');
      return handler;
    }

    it('should send pagination metadata when hasMore is true', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);

      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: {
          status: 'success',
          data: [{ id: 1 }],
          metadata: {
            hasMore: true,
            nextCursor: 'cursor-abc123',
            hint: 'Request next page for more results',
            returnedCount: 50,
          },
        },
        status: 'success',
      });

      mockAnthropic.messages.stream.mockResolvedValue(
        createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } },
        ])
      );

      const { req, res, next } = createMockReqRes();
      req.body = { query: 'list employees' };
      const handler = getPostHandler();

      await handler(req, res, next);

      const allData = res._writtenData.join('');
      expect(allData).toContain('"type":"pagination"');
      expect(allData).toContain('cursor-abc123');
      expect(allData).toContain('hasMore');
    });

    it('should include pagination instructions in Claude prompt', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);

      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: {
          status: 'success',
          data: [{ id: 1 }],
          metadata: {
            hasMore: true,
            nextCursor: 'cursor-abc',
            hint: 'Request next page',
            returnedCount: 50,
          },
        },
        status: 'success',
      });

      let capturedSystemPrompt = '';
      mockAnthropic.messages.stream.mockImplementation(({ system }) => {
        capturedSystemPrompt = system as string;
        return createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } },
        ]);
      });

      const { req, res, next } = createMockReqRes();
      req.body = { query: 'list employees' };
      const handler = getPostHandler();

      await handler(req, res, next);

      expect(capturedSystemPrompt).toContain('PAGINATION INFO');
      expect(capturedSystemPrompt).toContain('More data is available');
    });
  });

  describe('Pending Confirmations (v1.4 Section 5.6)', () => {
    let router: ReturnType<typeof createStreamingRoutes>;

    beforeEach(() => {
      router = createStreamingRoutes(deps);
    });

    function getPostHandler() {
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');
      return handler;
    }

    it('should return pending confirmation without calling Claude', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);

      const confirmationResponse = {
        status: 'pending_confirmation' as const,
        confirmationId: 'confirm-uuid-123',
        message: 'Are you sure you want to delete employee John?',
        confirmationData: {
          action: 'delete_employee',
          mcpServer: 'mcp-hr',
          userId: 'user-123',
          timestamp: Date.now(),
          employeeId: 'emp-456',
        },
      };

      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: confirmationResponse,
        status: 'success',
      });

      const { req, res, next } = createMockReqRes();
      req.body = { query: 'delete employee john' };
      const handler = getPostHandler();

      await handler(req, res, next);

      // Claude should NOT have been called
      expect(mockAnthropic.messages.stream).not.toHaveBeenCalled();

      const allData = res._writtenData.join('');
      expect(allData).toContain('pending_confirmation');
      expect(allData).toContain('confirm-uuid-123');
      expect(allData).toContain('[DONE]');
    });
  });

  describe('Error Handling', () => {
    let router: ReturnType<typeof createStreamingRoutes>;

    beforeEach(() => {
      router = createStreamingRoutes(deps);
    });

    function getPostHandler() {
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');
      return handler;
    }

    it('should send error event when Claude API fails', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: { status: 'success', data: [] },
        status: 'success',
      });

      mockAnthropic.messages.stream.mockRejectedValue(new Error('API rate limit exceeded'));

      const { req, res, next } = createMockReqRes();
      const handler = getPostHandler();

      await handler(req, res, next);

      const allData = res._writtenData.join('');
      expect(allData).toContain('"type":"error"');
      expect(allData).toContain('Failed to process query');
      expect(allData).toContain('[DONE]');

      expect(mockLogger.error).toHaveBeenCalledWith('SSE query error:', expect.any(Error));
    });
  });

  describe('System Prompt Building', () => {
    let router: ReturnType<typeof createStreamingRoutes>;

    beforeEach(() => {
      router = createStreamingRoutes(deps);
    });

    function getPostHandler() {
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');
      return handler;
    }

    it('should include user context in system prompt', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: { status: 'success', data: [{ name: 'Employee Data' }] },
        status: 'success',
      });

      let capturedSystemPrompt = '';
      mockAnthropic.messages.stream.mockImplementation(({ system }) => {
        capturedSystemPrompt = system as string;
        return createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } },
        ]);
      });

      const { req, res, next } = createMockReqRes();
      req.body = { query: 'who is my manager?' };
      const handler = getPostHandler();

      await handler(req, res, next);

      expect(capturedSystemPrompt).toContain(TEST_USERS.hrManager.username);
      expect(capturedSystemPrompt).toContain(TEST_USERS.hrManager.email);
      expect(capturedSystemPrompt).toContain('hr-read');
      expect(capturedSystemPrompt).toContain('[Data from mcp-hr]');
      expect(capturedSystemPrompt).toContain('Employee Data');
      expect(capturedSystemPrompt).toContain('Tamshai Corp');
      expect(capturedSystemPrompt).toContain('family investment management');
    });

    it('should handle empty data context gracefully', async () => {
      mockGetAccessibleServers.mockReturnValue([]);

      let capturedSystemPrompt = '';
      mockAnthropic.messages.stream.mockImplementation(({ system }) => {
        capturedSystemPrompt = system as string;
        return createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'No data' } },
        ]);
      });

      const { req, res, next } = createMockReqRes();
      const handler = getPostHandler();

      await handler(req, res, next);

      expect(capturedSystemPrompt).toContain('No relevant data available');
    });
  });

  describe('SSE Heartbeat (ADDENDUM #6)', () => {
    it('should use default heartbeat interval when not configured', () => {
      const depsWithoutInterval: StreamingRoutesDependencies = {
        ...deps,
        config: {
          claudeModel: 'claude-sonnet-4-20250514',
          // No heartbeatIntervalMs - should default to 15000
        },
      };

      const router = createStreamingRoutes(depsWithoutInterval);
      expect(router).toBeDefined();
    });

    it('should use configured heartbeat interval', () => {
      const depsWithCustomInterval: StreamingRoutesDependencies = {
        ...deps,
        config: {
          claudeModel: 'claude-sonnet-4-20250514',
          heartbeatIntervalMs: 5000,
        },
      };

      const router = createStreamingRoutes(depsWithCustomInterval);
      expect(router).toBeDefined();
    });

    it('should skip heartbeat when interval is 0', async () => {
      const router = createStreamingRoutes(deps);
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');

      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-hr',
        data: { status: 'success', data: [] },
        status: 'success',
      });

      mockAnthropic.messages.stream.mockResolvedValue(
        createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        ])
      );

      const { req, res, next } = createMockReqRes();
      await handler(req, res, next);

      // No heartbeat should be written when interval is 0
      const allData = res._writtenData.join('');
      expect(allData).not.toContain(': heartbeat');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'SSE query completed',
        expect.objectContaining({ requestId: expect.any(String) })
      );
    });
  });

  describe('Client Disconnect Handling', () => {
    let router: ReturnType<typeof createStreamingRoutes>;

    beforeEach(() => {
      router = createStreamingRoutes(deps);
    });

    function getPostHandler() {
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');
      return handler;
    }

    it('should abort before Claude call if client disconnects during MCP queries', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);

      // Create a delayed MCP query to give time for disconnect
      let resolveMCPQuery: (value: MCPQueryResult) => void;
      const mcpQueryPromise = new Promise<MCPQueryResult>((resolve) => {
        resolveMCPQuery = resolve;
      });
      mockQueryMCPServer.mockReturnValue(mcpQueryPromise);

      const { req, res, next } = createMockReqRes();
      const handler = getPostHandler();

      // Start the handler
      const handlerPromise = handler(req, res, next);

      // Simulate client disconnect before MCP query completes
      (req as unknown as EventEmitter).emit('close');

      // Now resolve MCP query
      resolveMCPQuery!({
        server: 'mcp-hr',
        data: { status: 'success', data: [] },
        status: 'success',
      });

      await handlerPromise;

      // Claude API should NOT have been called
      expect(mockAnthropic.messages.stream).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Client disconnected from SSE stream',
        expect.objectContaining({ requestId: 'test-request-id' })
      );
    });

    it('should handle request error event', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);

      let resolveMCPQuery: (value: MCPQueryResult) => void;
      const mcpQueryPromise = new Promise<MCPQueryResult>((resolve) => {
        resolveMCPQuery = resolve;
      });
      mockQueryMCPServer.mockReturnValue(mcpQueryPromise);

      const { req, res, next } = createMockReqRes();
      const handler = getPostHandler();

      const handlerPromise = handler(req, res, next);

      // Emit error
      (req as unknown as EventEmitter).emit('error', new Error('Connection reset'));

      resolveMCPQuery!({
        server: 'mcp-hr',
        data: { status: 'success', data: [] },
        status: 'success',
      });

      await handlerPromise;

      expect(mockLogger.error).toHaveBeenCalledWith(
        'SSE request error',
        expect.objectContaining({ error: 'Connection reset' })
      );
    });
  });

  describe('Different User Contexts', () => {
    let router: ReturnType<typeof createStreamingRoutes>;

    beforeEach(() => {
      router = createStreamingRoutes(deps);
    });

    function getPostHandler() {
      const postRoute = router.stack.find(
        (layer: RouteLayer) => layer.route?.path === '/query' && layer.route?.methods?.post
      );
      const handler = postRoute?.route?.stack[0]?.handle;
      if (!handler) throw new Error('POST handler not found');
      return handler;
    }

    it('should work with finance manager user', async () => {
      mockGetAccessibleServers.mockReturnValue([mockFinanceServer]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'mcp-finance',
        data: { status: 'success', data: [] },
        status: 'success',
      });

      mockAnthropic.messages.stream.mockResolvedValue(
        createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Finance data' } },
        ])
      );

      const { req, res, next } = createMockReqRes(TEST_USERS.financeManager);
      req.body = { query: 'show budget' };
      const handler = getPostHandler();

      await handler(req, res, next);

      const allData = res._writtenData.join('');
      expect(allData).toContain('Finance data');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'SSE Query received',
        expect.objectContaining({
          roles: expect.arrayContaining(['finance-read']),
        })
      );
    });

    it('should work with executive user accessing multiple servers', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer, mockFinanceServer]);
      mockQueryMCPServer
        .mockResolvedValueOnce({
          server: 'mcp-hr',
          data: { status: 'success', data: [{ type: 'hr' }] },
          status: 'success',
        })
        .mockResolvedValueOnce({
          server: 'mcp-finance',
          data: { status: 'success', data: [{ type: 'finance' }] },
          status: 'success',
        });

      let capturedSystemPrompt = '';
      mockAnthropic.messages.stream.mockImplementation(({ system }) => {
        capturedSystemPrompt = system as string;
        return createMockStream([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Executive view' } },
        ]);
      });

      const { req, res, next } = createMockReqRes(TEST_USERS.executive);
      req.body = { query: 'show all data' };
      const handler = getPostHandler();

      await handler(req, res, next);

      const allData = res._writtenData.join('');
      expect(allData).toContain('Executive view');

      // Both MCP servers should have been queried
      expect(mockQueryMCPServer).toHaveBeenCalledTimes(2);

      // System prompt should contain data from both servers
      expect(capturedSystemPrompt).toContain('[Data from mcp-hr]');
      expect(capturedSystemPrompt).toContain('[Data from mcp-finance]');
    });
  });
});
