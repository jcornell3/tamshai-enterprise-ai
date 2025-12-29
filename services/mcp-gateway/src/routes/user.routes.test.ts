/**
 * Unit tests for User Routes
 *
 * Tests user info and MCP tools listing endpoints.
 */

import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import userRoutes from './user.routes';
import * as gatewayUtils from '../utils/gateway-utils';

// Authenticated request type for tests
interface AuthenticatedRequest extends Request {
  userContext?: {
    userId: string;
    username: string;
    email?: string;
    roles: string[];
    groups?: string[];
  };
}

// Mock gateway-utils
jest.mock('../utils/gateway-utils', () => ({
  getAccessibleMCPServers: jest.fn(),
}));

describe('User Routes', () => {
  let app: Express;
  let mockGetAccessibleMCPServers: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetAccessibleMCPServers = gatewayUtils.getAccessibleMCPServers as jest.Mock;

    app = express();
    app.use(express.json());

    // Default: inject userContext middleware
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as AuthenticatedRequest).userContext = {
        userId: 'test-user-123',
        username: 'test.user',
        email: 'test@example.com',
        roles: ['hr-read'],
        groups: ['engineering'],
      };
      next();
    });

    app.use(userRoutes);
  });

  describe('GET /api/user', () => {
    test('returns user profile when authenticated', async () => {
      const response = await request(app).get('/api/user');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId', 'test-user-123');
      expect(response.body).toHaveProperty('username', 'test.user');
      expect(response.body).toHaveProperty('email', 'test@example.com');
      expect(response.body).toHaveProperty('roles');
      expect(response.body.roles).toContain('hr-read');
      expect(response.body).toHaveProperty('groups');
      expect(response.body.groups).toContain('engineering');
    });

    test('returns all user profile fields', async () => {
      const response = await request(app).get('/api/user');

      expect(response.body).toEqual({
        userId: 'test-user-123',
        username: 'test.user',
        email: 'test@example.com',
        roles: ['hr-read'],
        groups: ['engineering'],
      });
    });

    test('returns user with multiple roles', async () => {
      // Create app with multi-role user
      const multiRoleApp = express();
      multiRoleApp.use(express.json());
      multiRoleApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as AuthenticatedRequest).userContext = {
          userId: 'exec-user',
          username: 'exec.user',
          email: 'exec@example.com',
          roles: ['executive', 'hr-read', 'finance-read'],
          groups: ['leadership'],
        };
        next();
      });
      multiRoleApp.use(userRoutes);

      const response = await request(multiRoleApp).get('/api/user');

      expect(response.status).toBe(200);
      expect(response.body.roles).toHaveLength(3);
      expect(response.body.roles).toContain('executive');
      expect(response.body.roles).toContain('hr-read');
      expect(response.body.roles).toContain('finance-read');
    });

    test('returns 401 when not authenticated', async () => {
      // Create app without userContext
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use(userRoutes);

      const response = await request(unauthApp).get('/api/user');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('handles user without email', async () => {
      const noEmailApp = express();
      noEmailApp.use(express.json());
      noEmailApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as AuthenticatedRequest).userContext = {
          userId: 'user-no-email',
          username: 'no.email',
          roles: ['user'],
        };
        next();
      });
      noEmailApp.use(userRoutes);

      const response = await request(noEmailApp).get('/api/user');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId', 'user-no-email');
      expect(response.body.email).toBeUndefined();
    });

    test('handles user without groups', async () => {
      const noGroupsApp = express();
      noGroupsApp.use(express.json());
      noGroupsApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as AuthenticatedRequest).userContext = {
          userId: 'user-no-groups',
          username: 'no.groups',
          email: 'nogroups@example.com',
          roles: ['user'],
        };
        next();
      });
      noGroupsApp.use(userRoutes);

      const response = await request(noGroupsApp).get('/api/user');

      expect(response.status).toBe(200);
      expect(response.body.groups).toBeUndefined();
    });
  });

  describe('GET /api/mcp/tools', () => {
    test('returns accessible MCP tools for hr-read role', async () => {
      mockGetAccessibleMCPServers.mockReturnValue([
        { name: 'mcp-hr', description: 'HR data including employees, departments' },
      ]);

      const response = await request(app).get('/api/mcp/tools');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user', 'test.user');
      expect(response.body).toHaveProperty('roles');
      expect(response.body.roles).toContain('hr-read');
      expect(response.body).toHaveProperty('accessibleDataSources');
      expect(response.body.accessibleDataSources).toHaveLength(1);
      expect(response.body.accessibleDataSources[0]).toEqual({
        name: 'mcp-hr',
        description: 'HR data including employees, departments',
      });
    });

    test('returns multiple MCP tools for executive role', async () => {
      const execApp = express();
      execApp.use(express.json());
      execApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as AuthenticatedRequest).userContext = {
          userId: 'exec-123',
          username: 'exec.user',
          roles: ['executive'],
        };
        next();
      });
      execApp.use(userRoutes);

      mockGetAccessibleMCPServers.mockReturnValue([
        { name: 'mcp-hr', description: 'HR data' },
        { name: 'mcp-finance', description: 'Financial data' },
        { name: 'mcp-sales', description: 'CRM data' },
        { name: 'mcp-support', description: 'Support tickets' },
      ]);

      const response = await request(execApp).get('/api/mcp/tools');

      expect(response.status).toBe(200);
      expect(response.body.accessibleDataSources).toHaveLength(4);
      expect(response.body.accessibleDataSources.map((s: { name: string; description: string }) => s.name)).toEqual([
        'mcp-hr',
        'mcp-finance',
        'mcp-sales',
        'mcp-support',
      ]);
    });

    test('returns empty array for user with no MCP access', async () => {
      const noAccessApp = express();
      noAccessApp.use(express.json());
      noAccessApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as AuthenticatedRequest).userContext = {
          userId: 'guest-123',
          username: 'guest.user',
          roles: ['guest'],
        };
        next();
      });
      noAccessApp.use(userRoutes);

      mockGetAccessibleMCPServers.mockReturnValue([]);

      const response = await request(noAccessApp).get('/api/mcp/tools');

      expect(response.status).toBe(200);
      expect(response.body.accessibleDataSources).toHaveLength(0);
      expect(response.body.user).toBe('guest.user');
    });

    test('returns 401 when not authenticated', async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use(userRoutes);

      const response = await request(unauthApp).get('/api/mcp/tools');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('calls getAccessibleMCPServers with correct roles and config', async () => {
      mockGetAccessibleMCPServers.mockReturnValue([]);

      await request(app).get('/api/mcp/tools');

      expect(mockGetAccessibleMCPServers).toHaveBeenCalledWith(['hr-read'], expect.any(Array));
    });

    test('formats MCP server response correctly', async () => {
      mockGetAccessibleMCPServers.mockReturnValue([
        {
          name: 'mcp-hr',
          url: 'http://localhost:3101',
          requiredRoles: ['hr-read'],
          description: 'HR data including employees, departments, org structure',
        },
      ]);

      const response = await request(app).get('/api/mcp/tools');

      expect(response.body.accessibleDataSources[0]).toEqual({
        name: 'mcp-hr',
        description: 'HR data including employees, departments, org structure',
      });
      // Should not include url or requiredRoles
      expect(response.body.accessibleDataSources[0]).not.toHaveProperty('url');
      expect(response.body.accessibleDataSources[0]).not.toHaveProperty('requiredRoles');
    });
  });
});
