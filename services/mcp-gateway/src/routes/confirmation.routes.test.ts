/**
 * Unit tests for Confirmation Routes
 *
 * Target: 95%+ coverage
 * Tests human-in-the-loop confirmation flow for write operations.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import axios from 'axios';
import { createConfirmationRoutes, ConfirmationRoutesDependencies } from './confirmation.routes';
import { createMockLogger } from '../test-utils/mock-logger';
import { TEST_USERS, UserContext } from '../test-utils/mock-user-context';
import * as redisUtils from '../utils/redis';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock redis utils
jest.mock('../utils/redis', () => ({
  getPendingConfirmation: jest.fn(),
}));

describe('Confirmation Routes', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let deps: ConfirmationRoutesDependencies;

  const mcpServerUrls = {
    hr: 'http://localhost:3001',
    finance: 'http://localhost:3002',
    sales: 'http://localhost:3003',
    support: 'http://localhost:3004',
    payroll: 'http://localhost:3006',
    tax: 'http://localhost:3007',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    deps = {
      logger: mockLogger,
      mcpServerUrls,
      timeout: 30000,
    };
    jest.clearAllMocks();
  });

  describe('createConfirmationRoutes', () => {
    it('should create router with POST /confirm/:confirmationId route', () => {
      const router = createConfirmationRoutes(deps);
      expect(router).toBeDefined();

      const routeCount = router.stack.filter(
        (layer: { route?: unknown }) => layer.route
      ).length;
      expect(routeCount).toBe(1);
    });
  });

  describe('POST /confirm/:confirmationId validation', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createConfirmationRoutes(deps));
    });

    it('should reject request without approved field', async () => {
      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Field "approved" must be a boolean');
    });

    it('should reject request with non-boolean approved field', async () => {
      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: 'yes' })
        .expect(400);

      expect(response.body.error).toBe('Field "approved" must be a boolean');
    });

    it('should reject request with numeric approved field', async () => {
      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: 1 })
        .expect(400);

      expect(response.body.error).toBe('Field "approved" must be a boolean');
    });
  });

  describe('Confirmation Not Found', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createConfirmationRoutes(deps));
    });

    it('should return 404 when confirmation not found', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/confirm/non-existent-id')
        .send({ approved: true })
        .expect(404);

      expect(response.body.error).toBe('Confirmation not found or expired');
      expect(response.body.message).toContain('expired');
    });

    it('should return 404 when confirmation expired', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/confirm/expired-id')
        .send({ approved: true })
        .expect(404);

      expect(response.body.error).toBe('Confirmation not found or expired');
    });
  });

  describe('User Mismatch', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createConfirmationRoutes(deps));
    });

    it('should return 403 when confirming user differs from initiating user', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue({
        userId: 'different-user-id',
        action: 'delete_employee',
        mcpServer: 'hr',
      });

      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: true })
        .expect(403);

      expect(response.body.error).toBe('Confirmation can only be completed by the initiating user');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Confirmation user mismatch',
        expect.objectContaining({
          confirmationId: 'test-confirmation-id',
          initiatingUser: 'different-user-id',
          confirmingUser: TEST_USERS.hrManager.userId,
        })
      );
    });
  });

  describe('Rejection Flow', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createConfirmationRoutes(deps));
    });

    it('should cancel action when approved is false', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue({
        userId: TEST_USERS.hrManager.userId,
        action: 'delete_employee',
        mcpServer: 'hr',
      });

      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: false })
        .expect(200);

      expect(response.body.status).toBe('cancelled');
      expect(response.body.message).toContain('cancelled');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Action rejected by user',
        expect.objectContaining({
          requestId: 'test-request-id',
          confirmationId: 'test-confirmation-id',
        })
      );

      // Should NOT call MCP server
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('Approval Flow', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createConfirmationRoutes(deps));
    });

    it('should execute action when approved is true', async () => {
      const pendingAction = {
        userId: TEST_USERS.hrManager.userId,
        action: 'delete_employee',
        mcpServer: 'hr',
        employeeId: 'emp-123',
      };

      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue(pendingAction);
      mockedAxios.post.mockResolvedValue({
        data: { success: true, message: 'Employee deleted' },
      });

      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: true })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.message).toContain('completed successfully');
      expect(response.body.result).toEqual({ success: true, message: 'Employee deleted' });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3001/execute',
        {
          action: 'delete_employee',
          data: pendingAction,
          userContext: {
            userId: TEST_USERS.hrManager.userId,
            username: TEST_USERS.hrManager.username,
            email: TEST_USERS.hrManager.email,  // Required for RLS policies
            roles: TEST_USERS.hrManager.roles,
          },
        },
        expect.objectContaining({
          timeout: 30000,
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-User-ID': TEST_USERS.hrManager.userId,
            'X-Request-ID': 'test-request-id',
          }),
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Action executed successfully',
        expect.objectContaining({
          confirmationId: 'test-confirmation-id',
          action: 'delete_employee',
        })
      );
    });

    it('should execute action on finance server', async () => {
      const pendingAction = {
        userId: TEST_USERS.hrManager.userId,
        action: 'approve_expense',
        mcpServer: 'finance',
        expenseId: 'exp-456',
      };

      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue(pendingAction);
      mockedAxios.post.mockResolvedValue({
        data: { approved: true },
      });

      await request(app)
        .post('/api/confirm/finance-confirmation')
        .send({ approved: true })
        .expect(200);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3002/execute',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Invalid MCP Server', () => {
    let app: Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'test-request-id';
        next();
      });
      app.use('/api', createConfirmationRoutes(deps));
    });

    it('should return 500 for invalid mcpServer name', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue({
        userId: TEST_USERS.hrManager.userId,
        action: 'malicious_action',
        mcpServer: 'invalid-server',
      });

      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: true })
        .expect(500);

      expect(response.body.error).toBe('Invalid MCP server in pending action');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid MCP server in pending action',
        expect.objectContaining({
          attemptedServer: 'invalid-server',
          validServers: ['hr', 'finance', 'sales', 'support', 'payroll', 'tax'],
        })
      );

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should return 500 for missing mcpServer', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue({
        userId: TEST_USERS.hrManager.userId,
        action: 'some_action',
        mcpServer: '',
      });

      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: true })
        .expect(500);

      expect(response.body.error).toBe('Invalid MCP server in pending action');
    });

    it('should return 500 for non-string mcpServer', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue({
        userId: TEST_USERS.hrManager.userId,
        action: 'some_action',
        mcpServer: { malicious: true },
      });

      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: true })
        .expect(500);

      expect(response.body.error).toBe('Invalid MCP server in pending action');
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
      app.use('/api', createConfirmationRoutes(deps));
    });

    it('should return 500 when MCP execution fails', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue({
        userId: TEST_USERS.hrManager.userId,
        action: 'delete_employee',
        mcpServer: 'hr',
      });
      mockedAxios.post.mockRejectedValue(new Error('Connection refused'));

      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: true })
        .expect(500);

      expect(response.body.error).toBe('Failed to execute confirmed action');
      expect(response.body.requestId).toBe('error-test-request');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Confirmation execution error:',
        expect.any(Error)
      );
    });

    it('should return 500 when Redis lookup fails', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockRejectedValue(
        new Error('Redis connection failed')
      );

      const response = await request(app)
        .post('/api/confirm/test-confirmation-id')
        .send({ approved: true })
        .expect(500);

      expect(response.body.error).toBe('Failed to execute confirmed action');
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
      app.use('/api', createConfirmationRoutes(deps));
    });

    it('should log confirmation request', async () => {
      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue({
        userId: TEST_USERS.hrManager.userId,
        action: 'test_action',
        mcpServer: 'hr',
      });
      mockedAxios.post.mockResolvedValue({ data: {} });

      await request(app)
        .post('/api/confirm/logged-confirmation')
        .send({ approved: true })
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Confirmation request',
        expect.objectContaining({
          requestId: 'log-test-request',
          confirmationId: 'logged-confirmation',
          approved: true,
          userId: TEST_USERS.hrManager.userId,
        })
      );
    });
  });

  describe('Custom Timeout', () => {
    it('should use custom timeout when provided', async () => {
      const customDeps: ConfirmationRoutesDependencies = {
        logger: mockLogger,
        mcpServerUrls,
        timeout: 5000,
      };

      const app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'timeout-test';
        next();
      });
      app.use('/api', createConfirmationRoutes(customDeps));

      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue({
        userId: TEST_USERS.hrManager.userId,
        action: 'test_action',
        mcpServer: 'hr',
      });
      mockedAxios.post.mockResolvedValue({ data: {} });

      await request(app)
        .post('/api/confirm/timeout-test-id')
        .send({ approved: true })
        .expect(200);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should use default timeout when not provided', async () => {
      const depsWithoutTimeout: ConfirmationRoutesDependencies = {
        logger: mockLogger,
        mcpServerUrls,
      };

      const app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userContext: UserContext }).userContext = TEST_USERS.hrManager;
        req.headers['x-request-id'] = 'default-timeout-test';
        next();
      });
      app.use('/api', createConfirmationRoutes(depsWithoutTimeout));

      (redisUtils.getPendingConfirmation as jest.Mock).mockResolvedValue({
        userId: TEST_USERS.hrManager.userId,
        action: 'test_action',
        mcpServer: 'hr',
      });
      mockedAxios.post.mockResolvedValue({ data: {} });

      await request(app)
        .post('/api/confirm/default-timeout-id')
        .send({ approved: true })
        .expect(200);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });
  });
});
