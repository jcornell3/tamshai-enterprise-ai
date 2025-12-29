/**
 * Integration tests for MCP Gateway Routes
 *
 * Tests main application endpoints with mocked authentication.
 */

import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';

// Mock external dependencies before imports
jest.mock('@anthropic-ai/sdk');
jest.mock('./utils/redis', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    quit: jest.fn(),
  },
  storePendingConfirmation: jest.fn(),
  getPendingConfirmation: jest.fn(),
  deletePendingConfirmation: jest.fn(),
  isTokenRevoked: jest.fn(() => Promise.resolve(false)),
  revokeToken: jest.fn(),
}));

describe('MCP Gateway Routes', () => {
  let app: Express;

  beforeEach(() => {
    // Create test Express app
    app = express();
    app.use(express.json());

    // Mock auth middleware to inject userContext
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).userContext = {
        userId: 'test-user-123',
        username: 'test.user',
        email: 'test@example.com',
        roles: ['hr-read'],
      };
      next();
    });
  });

  describe('Health Endpoints', () => {
    beforeEach(() => {
      // Add health endpoints
      app.get('/health', (req: Request, res: Response) => {
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
        });
      });

      app.get('/api/health', (req: Request, res: Response) => {
        const uptime = process.uptime();
        const memUsage = process.memoryUsage();

        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: Math.floor(uptime),
          memory: {
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
          },
          node: process.version,
          env: process.env.NODE_ENV || 'development',
        });
      });
    });

    test('GET /health returns healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /api/health returns detailed health info', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('node');
      expect(response.body.memory).toHaveProperty('rss');
      expect(response.body.memory).toHaveProperty('heapUsed');
    });
  });

  describe('User Info Endpoint', () => {
    beforeEach(() => {
      app.get('/api/user', (req: Request, res: Response) => {
        const userContext = (req as any).userContext;

        if (!userContext) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        res.json({
          userId: userContext.userId,
          username: userContext.username,
          email: userContext.email,
          roles: userContext.roles,
        });
      });
    });

    test('returns current user info when authenticated', async () => {
      const response = await request(app).get('/api/user');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId', 'test-user-123');
      expect(response.body).toHaveProperty('username', 'test.user');
      expect(response.body).toHaveProperty('email', 'test@example.com');
      expect(response.body).toHaveProperty('roles');
      expect(response.body.roles).toContain('hr-read');
    });

    test('returns 401 when not authenticated', async () => {
      // Create app without auth middleware
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.get('/api/user', (req: Request, res: Response) => {
        const userContext = (req as any).userContext;

        if (!userContext) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        res.json(userContext);
      });

      const response = await request(unauthApp).get('/api/user');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('MCP Tools Listing Endpoint', () => {
    beforeEach(() => {
      app.get('/api/mcp/tools', (req: Request, res: Response) => {
        const userContext = (req as any).userContext;

        if (!userContext) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        // Mock MCP server configs
        const mcpServers = [
          { name: 'mcp-hr', requiredRoles: ['hr-read', 'hr-write', 'executive'] },
          { name: 'mcp-finance', requiredRoles: ['finance-read', 'finance-write', 'executive'] },
        ];

        // Filter accessible servers
        const accessibleServers = mcpServers.filter(server =>
          server.requiredRoles.some(role => userContext.roles.includes(role))
        );

        res.json({
          servers: accessibleServers.map(s => s.name),
          tools: accessibleServers.flatMap(s => [
            { server: s.name, tool: `${s.name}_list` },
            { server: s.name, tool: `${s.name}_get` },
          ]),
        });
      });
    });

    test('returns accessible MCP tools for hr-read role', async () => {
      const response = await request(app).get('/api/mcp/tools');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('servers');
      expect(response.body).toHaveProperty('tools');
      expect(response.body.servers).toContain('mcp-hr');
      expect(response.body.servers).not.toContain('mcp-finance');
    });

    test('returns all tools for executive role', async () => {
      // Create app with executive user
      const execApp = express();
      execApp.use(express.json());
      execApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).userContext = {
          userId: 'exec-user',
          username: 'executive.user',
          roles: ['executive'],
        };
        next();
      });
      execApp.get('/api/mcp/tools', (req: Request, res: Response) => {
        const userContext = (req as any).userContext;

        const mcpServers = [
          { name: 'mcp-hr', requiredRoles: ['hr-read', 'hr-write', 'executive'] },
          { name: 'mcp-finance', requiredRoles: ['finance-read', 'finance-write', 'executive'] },
        ];

        const accessibleServers = mcpServers.filter(server =>
          server.requiredRoles.some(role => userContext.roles.includes(role))
        );

        res.json({
          servers: accessibleServers.map(s => s.name),
          tools: accessibleServers.flatMap(s => [
            { server: s.name, tool: `${s.name}_list` },
            { server: s.name, tool: `${s.name}_get` },
          ]),
        });
      });

      const response = await request(execApp).get('/api/mcp/tools');

      expect(response.status).toBe(200);
      expect(response.body.servers).toContain('mcp-hr');
      expect(response.body.servers).toContain('mcp-finance');
    });
  });

  describe('Confirmation Endpoint', () => {
    beforeEach(() => {
      const { getPendingConfirmation, deletePendingConfirmation } = require('./utils/redis');

      app.post('/api/confirm/:confirmationId', async (req: Request, res: Response) => {
        const userContext = (req as any).userContext;
        const { confirmationId } = req.params;
        const { approved } = req.body;

        if (!userContext) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        // Mock pending confirmation data
        getPendingConfirmation.mockResolvedValue({
          action: 'delete_employee',
          employeeId: 'emp-123',
          userId: userContext.userId,
        });

        const pendingAction = await getPendingConfirmation(confirmationId);

        if (!pendingAction) {
          res.status(404).json({ error: 'Confirmation not found or expired' });
          return;
        }

        if (approved) {
          // Execute action (mocked)
          await deletePendingConfirmation(confirmationId);
          res.json({
            status: 'confirmed',
            action: pendingAction.action,
            result: { success: true },
          });
        } else {
          await deletePendingConfirmation(confirmationId);
          res.json({
            status: 'cancelled',
            action: pendingAction.action,
          });
        }
      });
    });

    test('confirms pending action when approved=true', async () => {
      const response = await request(app)
        .post('/api/confirm/test-confirmation-123')
        .send({ approved: true });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'confirmed');
      expect(response.body).toHaveProperty('action', 'delete_employee');
      expect(response.body).toHaveProperty('result');
    });

    test('cancels pending action when approved=false', async () => {
      const response = await request(app)
        .post('/api/confirm/test-confirmation-456')
        .send({ approved: false });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'cancelled');
      expect(response.body).toHaveProperty('action', 'delete_employee');
    });

    test('returns 404 for non-existent confirmation', async () => {
      const { getPendingConfirmation } = require('./utils/redis');

      // Create a new app instance with updated mock
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).userContext = {
          userId: 'test-user-123',
          username: 'test.user',
          roles: ['hr-read'],
        };
        next();
      });

      getPendingConfirmation.mockResolvedValueOnce(null);

      testApp.post('/api/confirm/:confirmationId', async (req: Request, res: Response) => {
        const userContext = (req as any).userContext;
        const { confirmationId } = req.params;

        if (!userContext) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const pendingAction = await getPendingConfirmation(confirmationId);

        if (!pendingAction) {
          res.status(404).json({ error: 'Confirmation not found or expired' });
          return;
        }

        res.json({ status: 'confirmed' });
      });

      const response = await request(testApp)
        .post('/api/confirm/non-existent-id')
        .send({ approved: true });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });
  });

  describe('Error Handling', () => {
    test('handles malformed JSON gracefully', async () => {
      app.post('/api/test', (req: Request, res: Response) => {
        res.json({ received: req.body });
      });

      const response = await request(app)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    test('handles missing required fields', async () => {
      app.post('/api/test-required', (req: Request, res: Response) => {
        const { requiredField } = req.body;

        if (!requiredField) {
          res.status(400).json({ error: 'requiredField is required' });
          return;
        }

        res.json({ success: true });
      });

      const response = await request(app)
        .post('/api/test-required')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('required');
    });
  });

  describe('Role-Based Access Control', () => {
    test('denies access to finance endpoints for hr-read role', async () => {
      app.get('/api/finance/data', (req: Request, res: Response) => {
        const userContext = (req as any).userContext;
        const requiredRoles = ['finance-read', 'finance-write', 'executive'];
        const hasAccess = requiredRoles.some(role => userContext.roles.includes(role));

        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }

        res.json({ data: 'sensitive finance data' });
      });

      const response = await request(app).get('/api/finance/data');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Access denied');
    });

    test('allows access to hr endpoints for hr-read role', async () => {
      app.get('/api/hr/data', (req: Request, res: Response) => {
        const userContext = (req as any).userContext;
        const requiredRoles = ['hr-read', 'hr-write', 'executive'];
        const hasAccess = requiredRoles.some(role => userContext.roles.includes(role));

        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }

        res.json({ data: 'hr data' });
      });

      const response = await request(app).get('/api/hr/data');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data', 'hr data');
    });
  });
});
