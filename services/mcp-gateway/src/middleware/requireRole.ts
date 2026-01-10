/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Enforces role requirements for protected routes.
 *
 * Usage:
 *   router.use('/admin', authenticate, requireRole(['admin', 'executive']));
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Express middleware that requires user to have one of the specified roles
 *
 * Prerequisites:
 * - `authenticate` middleware must run first (populates req.user)
 * - req.user must have a `roles` array property
 *
 * @param allowedRoles - Array of role names that are allowed access
 * @returns Express middleware function
 *
 * @example
 * // Require admin or executive role
 * router.use('/admin', authenticate, requireRole(['admin', 'executive']));
 *
 * @example
 * // Require specific role for endpoint
 * router.delete('/users/:id', authenticate, requireRole(['admin']), deleteUser);
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if user is authenticated
    if (!req.user) {
      logger.warn('requireRole: No user found in request (authenticate middleware not run?)');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    // Extract user roles
    const userRoles = (req.user as any).roles || [];

    if (!Array.isArray(userRoles)) {
      logger.error('requireRole: User roles is not an array', {
        userId: (req.user as any).sub,
        rolesType: typeof userRoles,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Invalid role configuration',
      });
      return;
    }

    // Check if user has at least one of the required roles
    const hasRequiredRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRequiredRole) {
      logger.warn('requireRole: Access denied - insufficient permissions', {
        userId: (req.user as any).sub,
        username: (req.user as any).preferred_username,
        userRoles,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
      });

      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        required: `One of: ${allowedRoles.join(', ')}`,
        actual: userRoles,
      });
      return;
    }

    // User has required role, proceed
    logger.debug('requireRole: Access granted', {
      userId: (req.user as any).sub,
      username: (req.user as any).preferred_username,
      userRoles,
      path: req.path,
      method: req.method,
    });

    next();
  };
}

/**
 * Check if user can assign a specific role (privilege escalation prevention)
 *
 * Rules:
 * - Executive can assign any role
 * - Admin can assign any role except executive
 * - HR-write can only assign basic read roles
 * - Others cannot assign roles
 *
 * @param userRoles - Roles the admin user has
 * @param targetRole - Role being assigned
 * @returns True if user can assign the role
 */
export function canAssignRole(userRoles: string[], targetRole: string): boolean {
  // Executive can assign any role (super-admin)
  if (userRoles.includes('executive')) {
    return true;
  }

  // Admin can assign any role except executive
  if (userRoles.includes('admin')) {
    return targetRole !== 'executive';
  }

  // HR-write can only assign basic read roles
  if (userRoles.includes('hr-write')) {
    const ALLOWED_ROLES = ['hr-read', 'finance-read', 'sales-read', 'support-read'];
    return ALLOWED_ROLES.includes(targetRole);
  }

  // No other roles can assign
  return false;
}

/**
 * Check if user can revoke a specific role
 *
 * Rules:
 * - Cannot revoke roles from yourself (prevents self-lockout)
 * - Same rules as canAssignRole otherwise
 *
 * @param userRoles - Roles the admin user has
 * @param targetRole - Role being revoked
 * @param targetUserId - User ID having role revoked
 * @param currentUserId - Current admin user ID
 * @returns True if user can revoke the role
 */
export function canRevokeRole(
  userRoles: string[],
  targetRole: string,
  targetUserId: string,
  currentUserId: string
): boolean {
  // Cannot revoke roles from yourself
  if (targetUserId === currentUserId) {
    return false;
  }

  // Same rules as assignment otherwise
  return canAssignRole(userRoles, targetRole);
}
