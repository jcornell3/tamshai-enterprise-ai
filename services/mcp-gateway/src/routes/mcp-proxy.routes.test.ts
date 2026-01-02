/**
 * Unit tests for MCP Proxy Routes
 *
 * Target: 95%+ coverage
 * Tests MCP tool proxy endpoints for GET and POST operations.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import axios from 'axios';
import { createMCPProxyRoutes, MCPProxyRoutesDependencies } from './mcp-proxy.routes';
import { createMockLogger } from '../test-utils/mock-logger';
import { TEST_USERS, UserContext } from '../test-utils/mock-user-context';
import { MCPServerConfig } from '../utils/gateway-utils';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MCP Proxy Routes', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockGetAccessibleServers: jest.Mock;
  let deps: MCPProxyRoutesDependencies;

  // Mock MCP server configs
  const mockHRServer: MCPServerConfig = {
    name: 'hr',
    url: 'http://localhost:3001',
    requiredRoles: ['hr-read', 'hr-write'],
    description: 'HR MCP Server',
  };

  const mockFinanceServer: MCPServerConfig = {
    name: 'finance',
    url: 'http://localhost:3002',
    requiredRoles: ['finance-read', 'finance-write'],
    description: 'Finance MCP Server',
  };

  const mcpServers = [mockHRServer, mockFinanceServer];

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockGetAccessibleServers = jest.fn();

    deps = {
      logger: mockLogger,
      mcpServers,
      getAccessibleServers: mockGetAccessibleServers,
      timeout: 30000,
    };

    jest.clearAllMocks();
  });

  describe('createMCPProxyRoutes', () => {
    it('should create router with GET and POST /mcp/:serverName/:toolName routes', () => {
      const router = createMCPProxyRoutes(deps);
      expect(router).toBeDefined();

      const routeCount = router.stack.filter(
        (layer: { route?: unknown }) => layer.route
      ).length;
      expect(routeCount).toBe(2);
    });
  });

  describe('GET /mcp/:serverName/:toolName', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createMCPProxyRoutes(deps));
    });

    describe('Tool Name Validation', () => {
      it('should reject invalid tool name with special characters', async () => {
        const response = await request(app)
          .get('/api/mcp/hr/invalid$tool')
          .expect(400);

        expect(response.body.code).toBe('INVALID_TOOL_NAME');
        expect(response.body.message).toContain('invalid characters');

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Invalid tool name rejected',
          expect.objectContaining({
            toolName: 'invalid$tool',
          })
        );
      });

      it('should reject tool name starting with number', async () => {
        const response = await request(app)
          .get('/api/mcp/hr/123tool')
          .expect(400);

        expect(response.body.code).toBe('INVALID_TOOL_NAME');
      });

      it('should reject tool name with spaces', async () => {
        const response = await request(app)
          .get('/api/mcp/hr/my%20tool')
          .expect(400);

        expect(response.body.code).toBe('INVALID_TOOL_NAME');
      });

      it('should accept valid tool names', async () => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
        mockedAxios.post.mockResolvedValue({
          data: { status: 'success', data: [] },
        });

        await request(app)
          .get('/api/mcp/hr/list_employees')
          .expect(200);

        expect(mockedAxios.post).toHaveBeenCalled();
      });

      it('should accept tool names with hyphens and underscores', async () => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
        mockedAxios.post.mockResolvedValue({
          data: { status: 'success', data: [] },
        });

        await request(app)
          .get('/api/mcp/hr/get-employee_data')
          .expect(200);

        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    describe('Server Not Found', () => {
      it('should return 404 for unknown server', async () => {
        const response = await request(app)
          .get('/api/mcp/unknown-server/list_items')
          .expect(404);

        expect(response.body.code).toBe('SERVER_NOT_FOUND');
        expect(response.body.message).toContain('unknown-server');
        expect(response.body.suggestedAction).toContain('hr, finance');
      });
    });

    describe('Access Control', () => {
      it('should return 403 when user lacks access to server', async () => {
        mockGetAccessibleServers.mockReturnValue([]);

        const response = await request(app)
          .get('/api/mcp/hr/list_employees')
          .expect(403);

        expect(response.body.code).toBe('ACCESS_DENIED');
        expect(response.body.message).toContain("'hr'");
        expect(response.body.suggestedAction).toContain('hr-read');

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Unauthorized MCP server access attempt',
          expect.objectContaining({
            serverName: 'hr',
            userRoles: TEST_USERS.hrManager.roles,
          })
        );
      });

      it('should allow access when user has required role', async () => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
        mockedAxios.post.mockResolvedValue({
          data: { status: 'success', data: [] },
        });

        await request(app)
          .get('/api/mcp/hr/list_employees')
          .expect(200);

        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    describe('Query Parameter Handling', () => {
      beforeEach(() => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
        mockedAxios.post.mockResolvedValue({
          data: { status: 'success', data: [] },
        });
      });

      it('should convert string query params', async () => {
        await request(app)
          .get('/api/mcp/hr/search_employees?name=John&department=Engineering')
          .expect(200);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3001/tools/search_employees',
          expect.objectContaining({
            input: { name: 'John', department: 'Engineering' },
          }),
          expect.any(Object)
        );
      });

      it('should convert numeric query params', async () => {
        await request(app)
          .get('/api/mcp/hr/list_employees?limit=50&offset=100')
          .expect(200);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3001/tools/list_employees',
          expect.objectContaining({
            input: { limit: 50, offset: 100 },
          }),
          expect.any(Object)
        );
      });

      it('should handle array query params', async () => {
        await request(app)
          .get('/api/mcp/hr/filter_employees?roles=admin&roles=manager')
          .expect(200);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3001/tools/filter_employees',
          expect.objectContaining({
            input: { roles: ['admin', 'manager'] },
          }),
          expect.any(Object)
        );
      });

      it('should skip undefined values', async () => {
        await request(app)
          .get('/api/mcp/hr/get_employee?id=123')
          .expect(200);

        const callArgs = mockedAxios.post.mock.calls[0] as [string, { input: Record<string, unknown> }, unknown];
        expect(callArgs[1].input).toEqual({ id: 123 });
      });
    });

    describe('MCP Server Communication', () => {
      beforeEach(() => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      });

      it('should forward request with correct headers', async () => {
        mockedAxios.post.mockResolvedValue({
          data: { status: 'success', data: [] },
        });

        await request(app)
          .get('/api/mcp/hr/list_employees')
          .expect(200);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3001/tools/list_employees',
          expect.objectContaining({
            userContext: {
              userId: TEST_USERS.hrManager.userId,
              username: TEST_USERS.hrManager.username,
              email: TEST_USERS.hrManager.email,
              roles: TEST_USERS.hrManager.roles,
            },
          }),
          expect.objectContaining({
            timeout: 30000,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': 'test-request-id',
            },
          })
        );
      });

      it('should URL-encode tool name', async () => {
        mockedAxios.post.mockResolvedValue({
          data: { status: 'success', data: [] },
        });

        await request(app)
          .get('/api/mcp/hr/special_tool')
          .expect(200);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3001/tools/special_tool',
          expect.any(Object),
          expect.any(Object)
        );
      });
    });

    describe('Truncation Detection', () => {
      beforeEach(() => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      });

      it('should log truncation warning when response is truncated', async () => {
        mockedAxios.post.mockResolvedValue({
          data: {
            status: 'success',
            data: [{ id: 1 }],
            metadata: {
              truncated: true,
              returnedCount: 50,
            },
          },
        });

        await request(app)
          .get('/api/mcp/hr/list_employees')
          .expect(200);

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Truncation detected in MCP response',
          expect.objectContaining({
            serverName: 'hr',
            toolName: 'list_employees',
            returnedCount: 50,
          })
        );
      });

      it('should not log when response is not truncated', async () => {
        mockedAxios.post.mockResolvedValue({
          data: {
            status: 'success',
            data: [{ id: 1 }],
          },
        });

        await request(app)
          .get('/api/mcp/hr/list_employees')
          .expect(200);

        expect(mockLogger.info).not.toHaveBeenCalledWith(
          'Truncation detected in MCP response',
          expect.any(Object)
        );
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      });

      it('should forward MCP server error responses', async () => {
        mockedAxios.post.mockRejectedValue({
          isAxiosError: true,
          response: {
            status: 400,
            data: { error: 'Invalid employee ID' },
          },
        });
        (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

        const response = await request(app)
          .get('/api/mcp/hr/get_employee?id=invalid')
          .expect(400);

        expect(response.body.error).toBe('Invalid employee ID');
      });

      it('should return 503 when MCP server is unavailable', async () => {
        mockedAxios.post.mockRejectedValue({
          isAxiosError: true,
          code: 'ECONNREFUSED',
        });
        (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

        const response = await request(app)
          .get('/api/mcp/hr/list_employees')
          .expect(503);

        expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
        expect(response.body.message).toContain("'hr'");
      });

      it('should return 500 for unexpected errors', async () => {
        mockedAxios.post.mockRejectedValue(new Error('Unexpected error'));
        (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(false);

        const response = await request(app)
          .get('/api/mcp/hr/list_employees')
          .expect(500);

        expect(response.body.code).toBe('INTERNAL_ERROR');

        expect(mockLogger.error).toHaveBeenCalledWith(
          'MCP tool proxy error:',
          expect.any(Error)
        );
      });
    });
  });

  describe('POST /mcp/:serverName/:toolName', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createMCPProxyRoutes(deps));
    });

    describe('Tool Name Validation', () => {
      it('should reject invalid tool name with special characters', async () => {
        const response = await request(app)
          .post('/api/mcp/hr/invalid$tool')
          .send({ data: 'test' })
          .expect(400);

        expect(response.body.code).toBe('INVALID_TOOL_NAME');
      });

      it('should reject tool name starting with number', async () => {
        const response = await request(app)
          .post('/api/mcp/hr/123tool')
          .send({ data: 'test' })
          .expect(400);

        expect(response.body.code).toBe('INVALID_TOOL_NAME');
      });
    });

    describe('Server Not Found', () => {
      it('should return 404 for unknown server', async () => {
        const response = await request(app)
          .post('/api/mcp/unknown/create_item')
          .send({ name: 'test' })
          .expect(404);

        expect(response.body.code).toBe('SERVER_NOT_FOUND');
      });
    });

    describe('Access Control', () => {
      it('should return 403 when user lacks write access', async () => {
        mockGetAccessibleServers.mockReturnValue([]);

        const response = await request(app)
          .post('/api/mcp/hr/create_employee')
          .send({ name: 'John' })
          .expect(403);

        expect(response.body.code).toBe('ACCESS_DENIED');
      });
    });

    describe('Request Forwarding', () => {
      beforeEach(() => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      });

      it('should forward body to MCP server', async () => {
        mockedAxios.post.mockResolvedValue({
          data: { status: 'success', id: 'new-emp-123' },
        });

        const requestBody = {
          name: 'John Doe',
          email: 'john@example.com',
          department: 'Engineering',
        };

        await request(app)
          .post('/api/mcp/hr/create_employee')
          .send(requestBody)
          .expect(200);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3001/tools/create_employee',
          requestBody,
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-User-ID': TEST_USERS.hrManager.userId,
              'X-User-Roles': TEST_USERS.hrManager.roles.join(','),
            }),
          })
        );
      });
    });

    describe('Pending Confirmation Handling', () => {
      beforeEach(() => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      });

      it('should log pending confirmation response', async () => {
        mockedAxios.post.mockResolvedValue({
          data: {
            status: 'pending_confirmation',
            confirmationId: 'confirm-123',
            message: 'Are you sure you want to delete this employee?',
          },
        });

        const response = await request(app)
          .post('/api/mcp/hr/delete_employee')
          .send({ employeeId: 'emp-456' })
          .expect(200);

        expect(response.body.status).toBe('pending_confirmation');
        expect(response.body.confirmationId).toBe('confirm-123');

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Pending confirmation created',
          expect.objectContaining({
            confirmationId: 'confirm-123',
            action: 'delete_employee',
          })
        );
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      });

      it('should forward MCP server error responses', async () => {
        mockedAxios.post.mockRejectedValue({
          isAxiosError: true,
          response: {
            status: 422,
            data: { error: 'Validation failed', details: ['Email required'] },
          },
        });
        (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

        const response = await request(app)
          .post('/api/mcp/hr/create_employee')
          .send({ name: 'John' })
          .expect(422);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should return 503 when MCP server is unavailable', async () => {
        mockedAxios.post.mockRejectedValue({
          isAxiosError: true,
          code: 'ECONNREFUSED',
        });
        (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

        const response = await request(app)
          .post('/api/mcp/hr/create_employee')
          .send({ name: 'John' })
          .expect(503);

        expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
      });

      it('should return 500 for unexpected errors', async () => {
        mockedAxios.post.mockRejectedValue(new Error('Network error'));
        (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(false);

        const response = await request(app)
          .post('/api/mcp/hr/create_employee')
          .send({ name: 'John' })
          .expect(500);

        expect(response.body.code).toBe('INTERNAL_ERROR');
      });
    });
  });

  describe('Logging', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'log-test-request';
        next();
      });
      app.use('/api', createMCPProxyRoutes(deps));

      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockedAxios.post.mockResolvedValue({
        data: { status: 'success' },
      });
    });

    it('should log GET tool calls', async () => {
      await request(app)
        .get('/api/mcp/hr/list_employees?limit=10')
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MCP tool call: hr/list_employees',
        expect.objectContaining({
          requestId: 'log-test-request',
          userId: TEST_USERS.hrManager.userId,
          queryParams: { limit: 10 },
        })
      );
    });

    it('should log POST tool calls', async () => {
      await request(app)
        .post('/api/mcp/hr/create_employee')
        .send({ name: 'John' })
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MCP tool call (POST): hr/create_employee',
        expect.objectContaining({
          requestId: 'log-test-request',
          userId: TEST_USERS.hrManager.userId,
          body: { name: 'John' },
        })
      );
    });
  });

  describe('Custom Timeout', () => {
    it('should use custom timeout when provided', async () => {
      const customDeps: MCPProxyRoutesDependencies = {
        logger: mockLogger,
        mcpServers,
        getAccessibleServers: mockGetAccessibleServers,
        timeout: 5000,
      };

      const app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'timeout-test';
        next();
      });
      app.use('/api', createMCPProxyRoutes(customDeps));

      mockGetAccessibleServers.mockReturnValue([mockHRServer]);
      mockedAxios.post.mockResolvedValue({
        data: { status: 'success' },
      });

      await request(app)
        .get('/api/mcp/hr/list_employees')
        .expect(200);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });
  });
});
