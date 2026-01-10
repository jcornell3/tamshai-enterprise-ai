/**
 * Admin Portal API Routes
 *
 * Provides REST API for user/role/service account management.
 *
 * Authorization: Requires 'admin' or 'executive' role
 * Audit: All actions logged to admin.user_management_audit table
 *
 * Routes:
 *   GET    /admin/users          - List users (paginated)
 *   GET    /admin/users/:id      - Get user details
 *   POST   /admin/users          - Create user
 *   PATCH  /admin/users/:id      - Update user
 *   DELETE /admin/users/:id      - Delete user
 *   POST   /admin/users/:id/reset-password - Reset user password
 *
 * See .specify/specs/012-admin-portal/ADMIN_PORTAL_SPEC.md for full API docs
 */

import { Router, Request, Response } from 'express';
import { getKeycloakAdminClient } from '../lib/keycloak-admin';
import { requireRole } from '../middleware/requireRole';
import { auditLogger } from '../services/audit-logger';
import { logger } from '../utils/logger';

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        preferred_username: string;
        email?: string;
        roles: string[];
      };
    }
  }
}

const router = Router();

// Apply RBAC: All admin routes require 'admin' or 'executive' role
router.use(requireRole(['admin', 'executive']));

// =============================================================================
// User Management Endpoints
// =============================================================================

/**
 * GET /admin/users
 *
 * List all users (paginated)
 *
 * Query Parameters:
 *   - page: number (default: 1)
 *   - limit: number (default: 50, max: 100)
 *   - search: string (search username, email, name)
 *   - enabled: boolean (filter by enabled status)
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const search = req.query.search as string;
    const enabled = req.query.enabled as string;

    const kcAdmin = await getKeycloakAdminClient();

    // Calculate pagination
    const first = (page - 1) * limit;
    const max = limit;

    // Build query params
    const queryParams: any = { first, max };
    if (search) {
      queryParams.search = search;
    }
    if (enabled !== undefined) {
      queryParams.enabled = enabled === 'true';
    }

    // Get users from Keycloak
    const users = await kcAdmin.users.find(queryParams);

    // Get total count (Keycloak doesn't return total, so we estimate)
    const total = users.length < max ? first + users.length : first + users.length + 1;

    // Enrich with roles for each user
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        try {
          const roles = await kcAdmin.users.listRealmRoleMappings({
            id: user.id!,
          });
          return {
            ...user,
            roles: roles.map((r) => r.name),
          };
        } catch (error) {
          logger.error('Failed to get roles for user', { userId: user.id, error });
          return {
            ...user,
            roles: [],
          };
        }
      })
    );

    res.json({
      users: enrichedUsers,
      pagination: {
        page,
        limit,
        total: total > 10000 ? '10000+' : total, // Keycloak limitation
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list users', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list users',
    });
  }
});

/**
 * GET /admin/users/:userId
 *
 * Get user details including roles and audit history
 */
router.get('/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const kcAdmin = await getKeycloakAdminClient();

    // Get user from Keycloak
    const user = await kcAdmin.users.findOne({ id: userId });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Get user roles
    const roles = await kcAdmin.users.listRealmRoleMappings({ id: userId });

    // Get audit history for this user
    const auditHistory = await auditLogger.query({
      targetUserId: userId,
      limit: 20,
    });

    res.json({
      user: {
        ...user,
        roles: roles.map((r) => r.name),
      },
      auditHistory,
    });
  } catch (error) {
    logger.error('Failed to get user', { userId: req.params.userId, error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get user',
    });
  }
});

/**
 * POST /admin/users
 *
 * Create new user (test account, contractor, external user)
 *
 * Request Body:
 *   - username: string (required)
 *   - email: string (required)
 *   - firstName: string (required)
 *   - lastName: string (required)
 *   - userType: 'test' | 'contractor' | 'external' (required)
 *   - temporaryPassword: string (required)
 *   - requirePasswordChange: boolean (default: true)
 *   - enabled: boolean (default: true)
 *   - emailVerified: boolean (default: false)
 *   - attributes: Record<string, string[]>
 *   - roles: string[] (initial role assignments)
 */
router.post('/users', async (req: Request, res: Response) => {
  try {
    const {
      username,
      email,
      firstName,
      lastName,
      userType,
      temporaryPassword,
      requirePasswordChange = true,
      enabled = true,
      emailVerified = false,
      attributes = {},
      roles = [],
    } = req.body;

    // Validation
    if (!username || !email || !firstName || !lastName || !userType || !temporaryPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields',
        required: ['username', 'email', 'firstName', 'lastName', 'userType', 'temporaryPassword'],
      });
    }

    // Validate user type
    if (!['test', 'contractor', 'external'].includes(userType)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid userType',
        allowed: ['test', 'contractor', 'external'],
      });
    }

    const kcAdmin = await getKeycloakAdminClient();

    // Create user in Keycloak
    const newUser = await kcAdmin.users.create({
      username,
      email,
      firstName,
      lastName,
      enabled,
      emailVerified,
      attributes: {
        ...attributes,
        userType: [userType],
        source: ['manual'],
      },
    });

    // Set password
    await kcAdmin.users.resetPassword({
      id: newUser.id,
      credential: {
        temporary: requirePasswordChange,
        type: 'password',
        value: temporaryPassword,
      },
    });

    // Assign roles if provided
    if (roles && roles.length > 0) {
      const realmRoles = await kcAdmin.roles.find();
      const rolesToAssign = realmRoles.filter((r) => roles.includes(r.name!));

      if (rolesToAssign.length > 0) {
        await kcAdmin.users.addRealmRoleMappings({
          id: newUser.id,
          roles: rolesToAssign.map((r) => ({ id: r.id!, name: r.name! })),
        });
      }
    }

    // Audit log
    await auditLogger.log({
      adminUserId: (req.user as any).sub,
      adminUsername: (req.user as any).preferred_username,
      adminEmail: (req.user as any).email,
      actionType: 'create_user',
      targetUserId: newUser.id,
      targetUsername: username,
      targetEmail: email,
      details: {
        userType,
        roles,
        attributes,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logger.info('User created via admin portal', {
      adminUser: (req.user as any).preferred_username,
      newUserId: newUser.id,
      username,
    });

    res.status(201).json({
      userId: newUser.id,
      username,
      email,
      message: 'User created successfully',
    });
  } catch (error: any) {
    // Handle specific Keycloak errors
    if (error.response?.status === 409) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Username or email already exists',
      });
    }

    logger.error('Failed to create user', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create user',
    });
  }
});

/**
 * PATCH /admin/users/:userId
 *
 * Update user details
 *
 * Request Body (all fields optional):
 *   - email: string
 *   - firstName: string
 *   - lastName: string
 *   - enabled: boolean
 *   - emailVerified: boolean
 *   - attributes: Record<string, string[]>
 */
router.patch('/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { email, firstName, lastName, enabled, emailVerified, attributes } = req.body;

    const kcAdmin = await getKeycloakAdminClient();

    // Get current user state (for audit log)
    const currentUser = await kcAdmin.users.findOne({ id: userId });

    if (!currentUser) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Check if user is from HR database (cannot disable)
    const userSource = currentUser.attributes?.source?.[0];
    if (enabled === false && userSource === 'hr-database') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot disable HR-sourced users (managed by identity-sync)',
      });
    }

    // Build update payload
    const updatePayload: any = {};
    if (email !== undefined) updatePayload.email = email;
    if (firstName !== undefined) updatePayload.firstName = firstName;
    if (lastName !== undefined) updatePayload.lastName = lastName;
    if (enabled !== undefined) updatePayload.enabled = enabled;
    if (emailVerified !== undefined) updatePayload.emailVerified = emailVerified;
    if (attributes !== undefined) {
      updatePayload.attributes = {
        ...currentUser.attributes,
        ...attributes,
      };
    }

    // Update user in Keycloak
    await kcAdmin.users.update({ id: userId }, updatePayload);

    // Audit log with before/after
    const updatedFields = Object.keys(updatePayload);
    await auditLogger.log({
      adminUserId: (req.user as any).sub,
      adminUsername: (req.user as any).preferred_username,
      adminEmail: (req.user as any).email,
      actionType: 'update_user',
      targetUserId: userId,
      targetUsername: currentUser.username,
      targetEmail: currentUser.email,
      changes: {
        before: Object.fromEntries(
          updatedFields.map((field) => [field, (currentUser as any)[field]])
        ),
        after: updatePayload,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logger.info('User updated via admin portal', {
      adminUser: (req.user as any).preferred_username,
      userId,
      updatedFields,
    });

    res.json({
      message: 'User updated successfully',
      updatedFields,
    });
  } catch (error) {
    logger.error('Failed to update user', { userId: req.params.userId, error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update user',
    });
  }
});

/**
 * DELETE /admin/users/:userId
 *
 * Delete user (soft delete for HR users, hard delete for manual users)
 *
 * Query Parameters:
 *   - force: boolean (default: false) - Force hard delete even for HR users
 */
router.delete('/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const force = req.query.force === 'true';

    const kcAdmin = await getKeycloakAdminClient();

    // Get user info
    const user = await kcAdmin.users.findOne({ id: userId });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    const userSource = user.attributes?.source?.[0];
    let deleteType: 'soft' | 'hard';

    // Determine delete type
    if (userSource === 'hr-database' && !force) {
      // Soft delete (disable + mark deleted)
      deleteType = 'soft';
      await kcAdmin.users.update(
        { id: userId },
        {
          enabled: false,
          attributes: {
            ...user.attributes,
            deletedAt: [new Date().toISOString()],
            deletedBy: [(req.user as any).sub],
          },
        }
      );
    } else {
      // Hard delete
      deleteType = 'hard';
      await kcAdmin.users.del({ id: userId });
    }

    // Audit log
    await auditLogger.log({
      adminUserId: (req.user as any).sub,
      adminUsername: (req.user as any).preferred_username,
      adminEmail: (req.user as any).email,
      actionType: 'delete_user',
      targetUserId: userId,
      targetUsername: user.username,
      targetEmail: user.email,
      details: {
        deleteType,
        force,
        userSource,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logger.info('User deleted via admin portal', {
      adminUser: (req.user as any).preferred_username,
      userId,
      deleteType,
    });

    res.json({
      message: 'User deleted successfully',
      deleteType,
      restorable: deleteType === 'soft',
    });
  } catch (error) {
    logger.error('Failed to delete user', { userId: req.params.userId, error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete user',
    });
  }
});

/**
 * POST /admin/users/:userId/reset-password
 *
 * Reset user password (admin-initiated)
 *
 * Request Body:
 *   - newPassword: string (required)
 *   - temporary: boolean (default: true) - Force change on next login
 */
router.post('/users/:userId/reset-password', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { newPassword, temporary = true } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'newPassword is required',
      });
    }

    const kcAdmin = await getKeycloakAdminClient();

    // Get user info
    const user = await kcAdmin.users.findOne({ id: userId });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Reset password
    await kcAdmin.users.resetPassword({
      id: userId,
      credential: {
        temporary,
        type: 'password',
        value: newPassword,
      },
    });

    // Audit log
    await auditLogger.log({
      adminUserId: (req.user as any).sub,
      adminUsername: (req.user as any).preferred_username,
      adminEmail: (req.user as any).email,
      actionType: 'reset_password',
      targetUserId: userId,
      targetUsername: user.username,
      targetEmail: user.email,
      details: {
        temporary,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logger.info('User password reset via admin portal', {
      adminUser: (req.user as any).preferred_username,
      userId,
      temporary,
    });

    res.json({
      message: 'Password reset successfully',
      temporary,
    });
  } catch (error) {
    logger.error('Failed to reset password', { userId: req.params.userId, error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to reset password',
    });
  }
});

export default router;
