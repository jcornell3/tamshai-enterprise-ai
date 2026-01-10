/**
 * Unit tests for Admin Routes
 *
 * Tests admin portal user/role management endpoints.
 * Coverage target: 90%+
 */

import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import { auditLogger as mockAuditLogger } from '../services/audit-logger';

// Mock Keycloak admin client - defined before the module mock
const mockKcAdminClient = {
  users: {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    del: jest.fn(),
    resetPassword: jest.fn(),
    listRealmRoleMappings: jest.fn(),
    addRealmRoleMappings: jest.fn(),
  },
  roles: {
    find: jest.fn(),
  },
  setConfig: jest.fn(),
};

// Mock Keycloak admin client module
jest.mock('../lib/keycloak-admin', () => ({
  getKeycloakAdminClient: jest.fn(async () => mockKcAdminClient),
  cleanupKeycloakAdminClient: jest.fn(),
  isKeycloakAdminHealthy: jest.fn(async () => true),
}));

import adminRoutes from './admin.routes';

// Mock audit logger
jest.mock('../services/audit-logger', () => ({
  auditLogger: {
    log: jest.fn().mockResolvedValue('audit-log-id-123'),
    query: jest.fn().mockResolvedValue([]),
  },
}));

// Mock requireRole middleware (allow by default, test denials separately)
jest.mock('../middleware/requireRole', () => ({
  requireRole: jest.fn(() => (req: Request, res: Response, next: NextFunction) => {
    // Check if user has required role (admin or executive)
    const userRoles = (req as any).user?.roles || [];
    const hasRequiredRole = userRoles.includes('admin') || userRoles.includes('executive');

    if (!hasRequiredRole) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }

    next();
  }),
}));

// Authenticated request type for tests
interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    preferred_username: string;
    email?: string;
    roles: string[];
  };
}

describe('Admin Routes', () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset default mock implementations
    mockKcAdminClient.users.find.mockResolvedValue([]);
    mockKcAdminClient.users.findOne.mockResolvedValue(null);
    mockKcAdminClient.users.create.mockResolvedValue({ id: 'new-user-123' });
    mockKcAdminClient.users.update.mockResolvedValue({});
    mockKcAdminClient.users.del.mockResolvedValue({});
    mockKcAdminClient.users.resetPassword.mockResolvedValue({});
    mockKcAdminClient.users.listRealmRoleMappings.mockResolvedValue([]);
    mockKcAdminClient.users.addRealmRoleMappings.mockResolvedValue({});
    mockKcAdminClient.roles.find.mockResolvedValue([]);
    (mockAuditLogger.log as jest.Mock).mockResolvedValue('audit-log-id-123');
    (mockAuditLogger.query as jest.Mock).mockResolvedValue([]);

    // Create test Express app
    app = express();
    app.use(express.json());

    // Default: inject admin user
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as AuthenticatedRequest).user = {
        sub: 'admin-user-123',
        preferred_username: 'admin.user',
        email: 'admin@example.com',
        roles: ['admin'],
      };
      next();
    });

    app.use('/api/admin', adminRoutes);
  });

  // =============================================================================
  // Authentication & Authorization Tests
  // =============================================================================

  describe('Authorization', () => {
    test('rejects requests without admin or executive role', async () => {
      // Create app with non-admin user
      const nonAdminApp = express();
      nonAdminApp.use(express.json());
      nonAdminApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as AuthenticatedRequest).user = {
          sub: 'user-123',
          preferred_username: 'regular.user',
          email: 'user@example.com',
          roles: ['hr-read'],
        };
        next();
      });
      nonAdminApp.use('/api/admin', adminRoutes);

      const response = await request(nonAdminApp).get('/api/admin/users');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Forbidden');
    });

    test('allows requests with admin role', async () => {
      mockKcAdminClient.users.find.mockResolvedValue([]);

      const response = await request(app).get('/api/admin/users');

      expect(response.status).toBe(200);
    });

    test('allows requests with executive role', async () => {
      // Create app with executive user
      const execApp = express();
      execApp.use(express.json());
      execApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as AuthenticatedRequest).user = {
          sub: 'exec-user-123',
          preferred_username: 'exec.user',
          email: 'exec@example.com',
          roles: ['executive'],
        };
        next();
      });
      execApp.use('/api/admin', adminRoutes);

      mockKcAdminClient.users.find.mockResolvedValue([]);

      const response = await request(execApp).get('/api/admin/users');

      expect(response.status).toBe(200);
    });
  });

  // =============================================================================
  // GET /admin/users - List Users
  // =============================================================================

  describe('GET /admin/users', () => {
    test('returns paginated list of users', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          username: 'alice.chen',
          email: 'alice@example.com',
          firstName: 'Alice',
          lastName: 'Chen',
          enabled: true,
        },
        {
          id: 'user-2',
          username: 'bob.martinez',
          email: 'bob@example.com',
          firstName: 'Bob',
          lastName: 'Martinez',
          enabled: true,
        },
      ];

      mockKcAdminClient.users.find.mockResolvedValue(mockUsers);
      mockKcAdminClient.users.listRealmRoleMappings
        .mockResolvedValueOnce([{ name: 'hr-read' }, { name: 'hr-write' }])
        .mockResolvedValueOnce([{ name: 'finance-read' }]);

      const response = await request(app).get('/api/admin/users');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('users');
      expect(response.body.users).toHaveLength(2);
      expect(response.body.users[0]).toHaveProperty('roles');
      expect(response.body.users[0].roles).toContain('hr-read');
      expect(response.body).toHaveProperty('pagination');
    });

    test('supports pagination parameters', async () => {
      mockKcAdminClient.users.find.mockResolvedValue([]);

      const response = await request(app).get('/api/admin/users?page=2&limit=25');

      expect(response.status).toBe(200);
      expect(mockKcAdminClient.users.find).toHaveBeenCalledWith(
        expect.objectContaining({
          first: 25,
          max: 25,
        })
      );
    });

    test('supports search parameter', async () => {
      mockKcAdminClient.users.find.mockResolvedValue([]);

      const response = await request(app).get('/api/admin/users?search=alice');

      expect(response.status).toBe(200);
      expect(mockKcAdminClient.users.find).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'alice',
        })
      );
    });

    test('supports enabled filter', async () => {
      mockKcAdminClient.users.find.mockResolvedValue([]);

      const response = await request(app).get('/api/admin/users?enabled=true');

      expect(response.status).toBe(200);
      expect(mockKcAdminClient.users.find).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        })
      );
    });

    test('handles Keycloak errors gracefully', async () => {
      mockKcAdminClient.users.find.mockRejectedValue(new Error('Keycloak connection failed'));

      const response = await request(app).get('/api/admin/users');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Internal Server Error');
    });

    test('handles role fetching errors gracefully', async () => {
      const mockUsers = [{ id: 'user-1', username: 'alice.chen' }];

      mockKcAdminClient.users.find.mockResolvedValue(mockUsers);
      mockKcAdminClient.users.listRealmRoleMappings.mockRejectedValue(
        new Error('Role fetch failed')
      );

      const response = await request(app).get('/api/admin/users');

      expect(response.status).toBe(200);
      expect(response.body.users[0].roles).toEqual([]);
    });
  });

  // =============================================================================
  // GET /admin/users/:userId - Get User Details
  // =============================================================================

  describe('GET /admin/users/:userId', () => {
    test('returns user details with roles and audit history', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'alice.chen',
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Chen',
        enabled: true,
      };

      const mockRoles = [{ name: 'hr-read' }, { name: 'hr-write' }];

      const mockAuditHistory = [
        {
          id: 'audit-1',
          timestamp: '2025-01-09T12:00:00Z',
          action_type: 'update_user',
        },
      ];

      mockKcAdminClient.users.findOne.mockResolvedValue(mockUser);
      mockKcAdminClient.users.listRealmRoleMappings.mockResolvedValue(mockRoles);
      (mockAuditLogger.query as jest.Mock).mockResolvedValue(mockAuditHistory);

      const response = await request(app).get('/api/admin/users/user-123');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('username', 'alice.chen');
      expect(response.body.user).toHaveProperty('roles');
      expect(response.body.user.roles).toContain('hr-read');
      expect(response.body).toHaveProperty('auditHistory');
      expect(mockAuditLogger.query).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: 'user-123',
          limit: 20,
        })
      );
    });

    test('returns 404 for non-existent user', async () => {
      mockKcAdminClient.users.findOne.mockResolvedValue(null);

      const response = await request(app).get('/api/admin/users/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });

    test('handles Keycloak errors', async () => {
      mockKcAdminClient.users.findOne.mockRejectedValue(new Error('Keycloak error'));

      const response = await request(app).get('/api/admin/users/user-123');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Internal Server Error');
    });
  });

  // =============================================================================
  // POST /admin/users - Create User
  // =============================================================================

  describe('POST /admin/users', () => {
    test('creates user with valid data', async () => {
      const newUserData = {
        username: 'test.contractor',
        email: 'test@contractor.com',
        firstName: 'Test',
        lastName: 'Contractor',
        userType: 'contractor',
        temporaryPassword: 'TempPass123!',
      };

      mockKcAdminClient.users.create.mockResolvedValue({ id: 'new-user-123' });

      const response = await request(app).post('/api/admin/users').send(newUserData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('userId', 'new-user-123');
      expect(response.body).toHaveProperty('username', 'test.contractor');
      expect(mockKcAdminClient.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'test.contractor',
          email: 'test@contractor.com',
        })
      );
      expect(mockKcAdminClient.users.resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-user-123',
          credential: expect.objectContaining({
            value: 'TempPass123!',
          }),
        })
      );
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'create_user',
          targetUserId: 'new-user-123',
        })
      );
    });

    test('creates user with roles', async () => {
      const newUserData = {
        username: 'test.user',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        userType: 'test',
        temporaryPassword: 'TempPass123!',
        roles: ['hr-read', 'finance-read'],
      };

      const mockRealmRoles = [
        { id: 'role-1', name: 'hr-read' },
        { id: 'role-2', name: 'finance-read' },
        { id: 'role-3', name: 'sales-read' },
      ];

      mockKcAdminClient.users.create.mockResolvedValue({ id: 'new-user-123' });
      mockKcAdminClient.roles.find.mockResolvedValue(mockRealmRoles);

      const response = await request(app).post('/api/admin/users').send(newUserData);

      expect(response.status).toBe(201);
      expect(mockKcAdminClient.users.addRealmRoleMappings).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-user-123',
          roles: expect.arrayContaining([
            { id: 'role-1', name: 'hr-read' },
            { id: 'role-2', name: 'finance-read' },
          ]),
        })
      );
    });

    test('validates required fields', async () => {
      const invalidData = {
        username: 'test.user',
        email: 'test@example.com',
        // Missing firstName, lastName, userType, temporaryPassword
      };

      const response = await request(app).post('/api/admin/users').send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad Request');
      expect(response.body).toHaveProperty('message', 'Missing required fields');
    });

    test('validates userType', async () => {
      const invalidData = {
        username: 'test.user',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        userType: 'invalid-type',
        temporaryPassword: 'TempPass123!',
      };

      const response = await request(app).post('/api/admin/users').send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad Request');
      expect(response.body).toHaveProperty('message', 'Invalid userType');
    });

    test('handles duplicate username/email', async () => {
      const newUserData = {
        username: 'existing.user',
        email: 'existing@example.com',
        firstName: 'Existing',
        lastName: 'User',
        userType: 'test',
        temporaryPassword: 'TempPass123!',
      };

      const mockError: any = new Error('User exists');
      mockError.response = { status: 409 };
      mockKcAdminClient.users.create.mockRejectedValue(mockError);

      const response = await request(app).post('/api/admin/users').send(newUserData);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'Conflict');
      expect(response.body).toHaveProperty('message', 'Username or email already exists');
    });

    test('handles Keycloak errors', async () => {
      const newUserData = {
        username: 'test.user',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        userType: 'test',
        temporaryPassword: 'TempPass123!',
      };

      mockKcAdminClient.users.create.mockRejectedValue(new Error('Keycloak error'));

      const response = await request(app).post('/api/admin/users').send(newUserData);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Internal Server Error');
    });
  });

  // =============================================================================
  // PATCH /admin/users/:userId - Update User
  // =============================================================================

  describe('PATCH /admin/users/:userId', () => {
    test('updates user details', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'alice.chen',
        email: 'alice.old@example.com',
        firstName: 'Alice',
        lastName: 'Chen',
        enabled: true,
        attributes: { source: ['manual'] },
      };

      const updateData = {
        email: 'alice.new@example.com',
        firstName: 'Alicia',
      };

      mockKcAdminClient.users.findOne.mockResolvedValue(mockUser);

      const response = await request(app).patch('/api/admin/users/user-123').send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'User updated successfully');
      expect(mockKcAdminClient.users.update).toHaveBeenCalledWith(
        { id: 'user-123' },
        expect.objectContaining({
          email: 'alice.new@example.com',
          firstName: 'Alicia',
        })
      );
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'update_user',
          targetUserId: 'user-123',
        })
      );
    });

    test('prevents disabling HR-sourced users', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'alice.chen',
        email: 'alice@example.com',
        enabled: true,
        attributes: { source: ['hr-database'] },
      };

      const updateData = { enabled: false };

      mockKcAdminClient.users.findOne.mockResolvedValue(mockUser);

      const response = await request(app).patch('/api/admin/users/user-123').send(updateData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad Request');
      expect(response.body.message).toContain('Cannot disable HR-sourced users');
    });

    test('returns 404 for non-existent user', async () => {
      mockKcAdminClient.users.findOne.mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/admin/users/nonexistent')
        .send({ email: 'new@example.com' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });

    test('handles Keycloak errors', async () => {
      mockKcAdminClient.users.findOne.mockRejectedValue(new Error('Keycloak error'));

      const response = await request(app)
        .patch('/api/admin/users/user-123')
        .send({ email: 'new@example.com' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Internal Server Error');
    });
  });

  // =============================================================================
  // DELETE /admin/users/:userId - Delete User
  // =============================================================================

  describe('DELETE /admin/users/:userId', () => {
    test('soft deletes HR-sourced user by default', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'alice.chen',
        email: 'alice@example.com',
        attributes: { source: ['hr-database'] },
      };

      mockKcAdminClient.users.findOne.mockImplementation(async () => mockUser);

      const response = await request(app).delete('/api/admin/users/user-123');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('deleteType', 'soft');
      expect(response.body).toHaveProperty('restorable', true);
      expect(mockKcAdminClient.users.update).toHaveBeenCalledWith(
        { id: 'user-123' },
        expect.objectContaining({
          enabled: false,
        })
      );
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'delete_user',
          targetUserId: 'user-123',
        })
      );
    });

    test('hard deletes manual user', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'test.contractor',
        email: 'test@contractor.com',
        attributes: { source: ['manual'] },
      };

      mockKcAdminClient.users.findOne.mockResolvedValue(mockUser);

      const response = await request(app).delete('/api/admin/users/user-123');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('deleteType', 'hard');
      expect(response.body).toHaveProperty('restorable', false);
      expect(mockKcAdminClient.users.del).toHaveBeenCalledWith({ id: 'user-123' });
    });

    test('force deletes HR-sourced user with force=true', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'alice.chen',
        email: 'alice@example.com',
        attributes: { source: ['hr-database'] },
      };

      mockKcAdminClient.users.findOne.mockResolvedValue(mockUser);

      const response = await request(app).delete('/api/admin/users/user-123?force=true');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('deleteType', 'hard');
      expect(mockKcAdminClient.users.del).toHaveBeenCalledWith({ id: 'user-123' });
    });

    test('returns 404 for non-existent user', async () => {
      mockKcAdminClient.users.findOne.mockResolvedValue(null);

      const response = await request(app).delete('/api/admin/users/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });

    test('handles Keycloak errors', async () => {
      mockKcAdminClient.users.findOne.mockRejectedValue(new Error('Keycloak error'));

      const response = await request(app).delete('/api/admin/users/user-123');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Internal Server Error');
    });
  });

  // =============================================================================
  // POST /admin/users/:userId/reset-password - Reset Password
  // =============================================================================

  describe('POST /admin/users/:userId/reset-password', () => {
    test('resets user password', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'alice.chen',
        email: 'alice@example.com',
      };

      const resetData = {
        newPassword: 'NewSecurePassword123!',
        temporary: true,
      };

      mockKcAdminClient.users.findOne.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/admin/users/user-123/reset-password')
        .send(resetData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Password reset successfully');
      expect(mockKcAdminClient.users.resetPassword).toHaveBeenCalledWith({
        id: 'user-123',
        credential: {
          temporary: true,
          type: 'password',
          value: 'NewSecurePassword123!',
        },
      });
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'reset_password',
          targetUserId: 'user-123',
        })
      );
    });

    test('validates newPassword is provided', async () => {
      const response = await request(app)
        .post('/api/admin/users/user-123/reset-password')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad Request');
      expect(response.body).toHaveProperty('message', 'newPassword is required');
    });

    test('returns 404 for non-existent user', async () => {
      mockKcAdminClient.users.findOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/admin/users/nonexistent/reset-password')
        .send({ newPassword: 'NewPass123!' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });

    test('handles Keycloak errors', async () => {
      mockKcAdminClient.users.findOne.mockRejectedValue(new Error('Keycloak error'));

      const response = await request(app)
        .post('/api/admin/users/user-123/reset-password')
        .send({ newPassword: 'NewPass123!' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Internal Server Error');
    });
  });
});
