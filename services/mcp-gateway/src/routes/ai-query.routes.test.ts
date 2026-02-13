/**
 * Unit tests for AI Query Routes
 *
 * Target: 95%+ coverage
 * Tests non-streaming AI query endpoint with MCP server querying and Claude integration.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Mock uuid to return predictable IDs
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: jest.fn(() => `test-uuid-${++uuidCounter}`),
}));

import { createAIQueryRoutes, AIQueryRoutesDependencies } from './ai-query.routes';
import { createMockLogger } from '../test-utils/mock-logger';
import { TEST_USERS, UserContext } from '../test-utils/mock-user-context';
import { MCPServerConfig } from '../utils/gateway-utils';

describe('AI Query Routes', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockGetAccessibleServers: jest.Mock;
  let mockGetDeniedServers: jest.Mock;
  let mockQueryMCPServer: jest.Mock;
  let mockSendToClaudeWithContext: jest.Mock;
  let mockQueryWithContext: jest.Mock;
  let mockGetMCPContext: jest.Mock;
  let mockStoreMCPContext: jest.Mock;
  let deps: AIQueryRoutesDependencies;

  // Mock MCP server configs
  const mockHRServer: MCPServerConfig = {
    name: 'hr',
    url: 'http://localhost:3001',
    requiredRoles: ['hr-read'],
    description: 'HR MCP Server',
  };

  const mockFinanceServer: MCPServerConfig = {
    name: 'finance',
    url: 'http://localhost:3002',
    requiredRoles: ['finance-read'],
    description: 'Finance MCP Server',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockGetAccessibleServers = jest.fn();
    mockGetDeniedServers = jest.fn();
    mockQueryMCPServer = jest.fn();
    mockSendToClaudeWithContext = jest.fn();
    mockQueryWithContext = jest.fn();
    mockGetMCPContext = jest.fn().mockResolvedValue(null); // Default: cache miss
    mockStoreMCPContext = jest.fn().mockResolvedValue(undefined);

    deps = {
      logger: mockLogger,
      getAccessibleServers: mockGetAccessibleServers,
      getDeniedServers: mockGetDeniedServers,
      queryMCPServer: mockQueryMCPServer,
      sendToClaudeWithContext: mockSendToClaudeWithContext,
      queryWithContext: mockQueryWithContext,
      getMCPContext: mockGetMCPContext,
      storeMCPContext: mockStoreMCPContext,
      rateLimiter: (req: Request, res: Response, next: NextFunction) => next(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAIQueryRoutes', () => {
    it('should create router with POST /ai/query route', () => {
      const router = createAIQueryRoutes(deps);
      expect(router).toBeDefined();

      const routeCount = router.stack.filter(
        (layer: { route?: unknown }) => layer.route
      ).length;
      expect(routeCount).toBe(1);
    });
  });

  describe('POST /ai/query validation', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createAIQueryRoutes(deps));
    });

    it('should reject request without query', async () => {
      const response = await request(app)
        .post('/api/ai/query')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Query is required');
    });

    it('should reject request with non-string query', async () => {
      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 123 })
        .expect(400);

      expect(response.body.error).toBe('Query is required');
    });

    it('should reject request with null query', async () => {
      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: null })
        .expect(400);

      expect(response.body.error).toBe('Query is required');
    });
  });

  describe('Successful AI Query', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createAIQueryRoutes(deps));
    });

    it('should query MCP servers and return Claude response', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([mockFinanceServer]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: { employees: [{ name: 'John' }] },
        status: 'success',
      });
      mockQueryWithContext.mockResolvedValue('Here is the employee information...');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'Who are the employees?' })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.response).toBe('Here is the employee information...');
      expect(response.body.requestId).toBe('test-request-id');
      expect(response.body.metadata.dataSourcesQueried).toContain('hr');
      expect(response.body.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);

      expect(mockQueryMCPServer).toHaveBeenCalledWith(
        mockHRServer,
        'Who are the employees?',
        expect.objectContaining({ userId: TEST_USERS.hrManager.userId })
      );

      // queryWithContext should be called with the serialized data context string
      expect(mockQueryWithContext).toHaveBeenCalledWith(
        'Who are the employees?',
        expect.stringContaining('[Data from hr]'),
        expect.objectContaining({ userId: TEST_USERS.hrManager.userId })
      );
    });

    it('should generate conversationId if not provided', async () => {
      mockGetAccessibleServers.mockReturnValue([]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryWithContext.mockResolvedValue('Response');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'test' })
        .expect(200);

      expect(response.body.conversationId).toBeDefined();
      // UUID is mocked to return 'test-uuid-X' pattern
      expect(response.body.conversationId).toMatch(/^test-uuid-\d+$/);
    });

    it('should use provided conversationId', async () => {
      mockGetAccessibleServers.mockReturnValue([]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryWithContext.mockResolvedValue('Response');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'test', conversationId: 'existing-conv-id' })
        .expect(200);

      expect(response.body.conversationId).toBe('existing-conv-id');
    });

    it('should query multiple MCP servers in parallel', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer, mockFinanceServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer
        .mockResolvedValueOnce({
          server: 'hr',
          data: { employees: [] },
          status: 'success',
        })
        .mockResolvedValueOnce({
          server: 'finance',
          data: { budgets: [] },
          status: 'success',
        });
      mockQueryWithContext.mockResolvedValue('Combined response');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show all data' })
        .expect(200);

      expect(mockQueryMCPServer).toHaveBeenCalledTimes(2);
      expect(response.body.metadata.dataSourcesQueried).toContain('hr');
      expect(response.body.metadata.dataSourcesQueried).toContain('finance');
    });
  });

  describe('Partial Response (v1.5)', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.executive;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createAIQueryRoutes(deps));
    });

    it('should return partial status when some MCP servers fail', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer, mockFinanceServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer
        .mockResolvedValueOnce({
          server: 'hr',
          data: { employees: [] },
          status: 'success',
        })
        .mockResolvedValueOnce({
          server: 'finance',
          data: null,
          status: 'timeout',
          error: 'Service did not respond',
        });
      mockQueryWithContext.mockResolvedValue('Partial data response');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show all data' })
        .expect(200);

      expect(response.body.status).toBe('partial');
      expect(response.body.metadata.dataSourcesQueried).toContain('hr');
      expect(response.body.metadata.dataSourcesFailed).toContain('finance');
      expect(response.body.warnings).toBeDefined();
      expect(response.body.warnings[0].server).toBe('finance');
      expect(response.body.warnings[0].status).toBe('timeout');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Partial response in non-streaming query',
        expect.objectContaining({
          failed: expect.arrayContaining([
            expect.objectContaining({ server: 'finance', status: 'timeout' }),
          ]),
          successful: ['hr'],
        })
      );
    });

    it('should handle all MCP servers failing', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: null,
        status: 'error',
        error: 'Database connection failed',
      });
      mockQueryWithContext.mockResolvedValue('No data available');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show employees' })
        .expect(200);

      expect(response.body.status).toBe('partial');
      expect(response.body.metadata.dataSourcesQueried).toHaveLength(0);
      expect(response.body.metadata.dataSourcesFailed).toContain('hr');
    });

    it('should only send successful results to Claude', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer, mockFinanceServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer
        .mockResolvedValueOnce({
          server: 'hr',
          data: { employees: ['John'] },
          status: 'success',
        })
        .mockResolvedValueOnce({
          server: 'finance',
          data: null,
          status: 'error',
          error: 'Failed',
        });
      mockQueryWithContext.mockResolvedValue('Response');

      await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show data' })
        .expect(200);

      // Verify only successful results passed to Claude via queryWithContext
      expect(mockQueryWithContext).toHaveBeenCalledWith(
        'Show data',
        expect.stringContaining('[Data from hr]'),
        expect.any(Object)
      );
    });
  });

  describe('Audit Logging', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'audit-test-request';
        next();
      });
      app.use('/api', createAIQueryRoutes(deps));
    });

    it('should log audit information on successful query', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([mockFinanceServer]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: {},
        status: 'success',
      });
      mockQueryWithContext.mockResolvedValue('Response');

      await request(app)
        .post('/api/ai/query')
        .send({ query: 'test query' })
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Audit log:',
        expect.objectContaining({
          requestId: 'audit-test-request',
          userId: TEST_USERS.hrManager.userId,
          username: TEST_USERS.hrManager.username,
          roles: TEST_USERS.hrManager.roles,
          mcpServersAccessed: ['hr'],
          mcpServersDenied: ['finance'],
          responseSuccess: true,
          durationMs: expect.any(Number),
        })
      );
    });

    it('should scrub SSN from query in audit log', async () => {
      mockGetAccessibleServers.mockReturnValue([]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryWithContext.mockResolvedValue('Response');

      await request(app)
        .post('/api/ai/query')
        .send({ query: 'Find user with SSN 123-45-6789' })
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Audit log:',
        expect.objectContaining({
          query: expect.stringContaining('[SSN-REDACTED]'),
        })
      );
    });
  });

  describe('Error Handling', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'error-test-request';
        next();
      });
      app.use('/api', createAIQueryRoutes(deps));
    });

    it('should return 500 when Claude API fails', async () => {
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: {},
        status: 'success',
      });
      mockQueryWithContext.mockRejectedValue(new Error('Claude API rate limit'));

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'test' })
        .expect(500);

      expect(response.body.error).toBe('Failed to process AI query');
      expect(response.body.requestId).toBe('error-test-request');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'AI query error:',
        expect.any(Error)
      );
    });

    it('should handle MCP query errors gracefully and return partial response', async () => {
      // v1.5: MCP query errors are now handled gracefully with timeout wrapper
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer.mockRejectedValue(new Error('Network error'));
      mockQueryWithContext.mockResolvedValue('Error response');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'test' })
        .expect(200);

      // Should return partial status with warnings about failed MCP server
      expect(response.body.status).toBe('partial');
      expect(response.body.warnings).toBeDefined();
      expect(response.body.warnings).toHaveLength(1);
      expect(response.body.warnings[0].message).toBe('Network error');
      expect(response.body.metadata.dataSourcesFailed).toHaveLength(1);

      // Logger should have warned about the failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MCP server query failed',
        expect.objectContaining({
          error: 'Network error',
          timeout: false,
        })
      );
    });
  });

  describe('Different User Contexts', () => {
    it('should work with executive user accessing all servers', async () => {
      const app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.executive;
        req.headers['x-request-id'] = 'exec-request';
        next();
      });
      app.use('/api', createAIQueryRoutes(deps));

      mockGetAccessibleServers.mockReturnValue([mockHRServer, mockFinanceServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: {},
        status: 'success',
      });
      mockQueryWithContext.mockResolvedValue('Executive response');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show all' })
        .expect(200);

      expect(response.body.response).toBe('Executive response');
      expect(mockGetAccessibleServers).toHaveBeenCalledWith(
        expect.arrayContaining(['executive'])
      );
    });

    it('should work with user having no server access', async () => {
      const app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.intern;
        req.headers['x-request-id'] = 'user-request';
        next();
      });
      app.use('/api', createAIQueryRoutes(deps));

      mockGetAccessibleServers.mockReturnValue([]);
      mockGetDeniedServers.mockReturnValue([mockHRServer, mockFinanceServer]);
      mockQueryWithContext.mockResolvedValue('No data available');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show employees' })
        .expect(200);

      expect(mockQueryMCPServer).not.toHaveBeenCalled();
      expect(response.body.metadata.dataSourcesQueried).toHaveLength(0);
    });
  });

  describe('Query Logging', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'log-test-request';
        next();
      });
      app.use('/api', createAIQueryRoutes(deps));
    });

    it('should log query receipt with sanitized info', async () => {
      mockGetAccessibleServers.mockReturnValue([]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryWithContext.mockResolvedValue('Response');

      await request(app)
        .post('/api/ai/query')
        .send({ query: 'A very long query that exceeds 100 characters and should be truncated for logging purposes to prevent log bloat' })
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'AI Query received',
        expect.objectContaining({
          requestId: 'log-test-request',
          roles: TEST_USERS.hrManager.roles,
        })
      );
    });

    it('should scrub PII from logged query', async () => {
      mockGetAccessibleServers.mockReturnValue([]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryWithContext.mockResolvedValue('Response');

      await request(app)
        .post('/api/ai/query')
        .send({ query: 'Find user with SSN 123-45-6789' })
        .expect(200);

      // Check that the logged query has SSN scrubbed
      const logCalls = mockLogger.info.mock.calls as unknown as Array<[string, { query?: string }]>;
      const queryReceivedLog = logCalls.find((call) => call[0] === 'AI Query received');
      expect(queryReceivedLog).toBeDefined();
      expect(queryReceivedLog?.[1]?.query).toContain('[SSN-REDACTED]');
    });
  });

  describe('MCP Context Caching', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'cache-test-request';
        next();
      });
      app.use('/api', createAIQueryRoutes(deps));
    });

    it('should query MCP servers on cache miss', async () => {
      mockGetMCPContext.mockResolvedValue(null); // cache miss
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: { employees: [{ name: 'John' }] },
        status: 'success',
      });
      mockQueryWithContext.mockResolvedValue('Fresh data response');

      await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show employees' })
        .expect(200);

      // MCP server should have been queried
      expect(mockQueryMCPServer).toHaveBeenCalledTimes(1);
      // Context should have been stored in cache
      expect(mockStoreMCPContext).toHaveBeenCalledWith(
        TEST_USERS.hrManager.userId,
        expect.stringContaining('[Data from hr]')
      );
    });

    it('should use cached context on cache hit (does not query MCP servers)', async () => {
      const cachedContext = '[Data from hr]:\n{"employees": [{"name": "Alice"}]}';
      mockGetMCPContext.mockResolvedValue(cachedContext); // cache hit
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryWithContext.mockResolvedValue('Cached data response');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show employees' })
        .expect(200);

      // MCP servers should NOT have been queried
      expect(mockQueryMCPServer).not.toHaveBeenCalled();
      // queryWithContext should receive the exact cached string
      expect(mockQueryWithContext).toHaveBeenCalledWith(
        'Show employees',
        cachedContext,
        expect.objectContaining({ userId: TEST_USERS.hrManager.userId })
      );
      expect(response.body.response).toBe('Cached data response');

      // Should log cache hit
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MCP context cache hit',
        expect.objectContaining({ userId: TEST_USERS.hrManager.userId })
      );
    });

    it('should bypass cache when forceRefresh is true', async () => {
      const cachedContext = '[Data from hr]:\n{"employees": []}';
      mockGetMCPContext.mockResolvedValue(cachedContext);
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: { employees: [{ name: 'Updated' }] },
        status: 'success',
      });
      mockQueryWithContext.mockResolvedValue('Fresh response');

      await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show employees', forceRefresh: true })
        .expect(200);

      // getMCPContext should NOT have been called (skipped due to forceRefresh)
      expect(mockGetMCPContext).not.toHaveBeenCalled();
      // MCP server should have been queried
      expect(mockQueryMCPServer).toHaveBeenCalledTimes(1);
      // New context should be stored
      expect(mockStoreMCPContext).toHaveBeenCalled();
    });

    it('should store context in Redis after fresh MCP query', async () => {
      mockGetMCPContext.mockResolvedValue(null);
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: { employees: [{ name: 'John' }] },
        status: 'success',
      });
      mockQueryWithContext.mockResolvedValue('Response');

      await request(app)
        .post('/api/ai/query')
        .send({ query: 'test' })
        .expect(200);

      expect(mockStoreMCPContext).toHaveBeenCalledWith(
        TEST_USERS.hrManager.userId,
        expect.any(String)
      );
    });

    it('should handle Redis read failure gracefully (falls back to fresh query)', async () => {
      mockGetMCPContext.mockRejectedValue(new Error('Redis connection lost'));
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: { employees: [] },
        status: 'success',
      });
      mockQueryWithContext.mockResolvedValue('Fallback response');

      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show employees' })
        .expect(200);

      // Should fall back to querying MCP servers
      expect(mockQueryMCPServer).toHaveBeenCalledTimes(1);
      expect(response.body.response).toBe('Fallback response');

      // Should log the Redis failure warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to read MCP context cache',
        expect.objectContaining({ error: 'Redis connection lost' })
      );
    });

    it('should handle Redis write failure gracefully (fire-and-forget)', async () => {
      mockGetMCPContext.mockResolvedValue(null);
      mockStoreMCPContext.mockRejectedValue(new Error('Redis write failed'));
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryMCPServer.mockResolvedValue({
        server: 'hr',
        data: { employees: [] },
        status: 'success',
      });
      mockQueryWithContext.mockResolvedValue('Response');

      // Should not throw even though Redis write fails
      const response = await request(app)
        .post('/api/ai/query')
        .send({ query: 'test' })
        .expect(200);

      expect(response.body.response).toBe('Response');
    });

    it('should pass byte-identical context string on cache hit', async () => {
      const exactCachedString = '[Data from hr]:\n{\n  "employees": [\n    {\n      "name": "Alice Chen"\n    }\n  ]\n}';
      mockGetMCPContext.mockResolvedValue(exactCachedString);
      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockGetDeniedServers.mockReturnValue([]);
      mockQueryWithContext.mockResolvedValue('Response');

      await request(app)
        .post('/api/ai/query')
        .send({ query: 'Show data' })
        .expect(200);

      // Verify the EXACT cached string is passed (byte-identical for Anthropic cache)
      const passedContext = mockQueryWithContext.mock.calls[0][1];
      expect(passedContext).toBe(exactCachedString);
      expect(passedContext.length).toBe(exactCachedString.length);
    });
  });
});
