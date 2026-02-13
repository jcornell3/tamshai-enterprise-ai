/**
 * Shared Authorization Middleware
 *
 * Consolidates authorization logic previously duplicated across MCP services.
 * Reduces code duplication by ~40% and centralizes security enforcement.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * User context extracted from JWT token
 */
export interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  departmentId?: string;
  managerId?: string;
}

/**
 * Role definitions for each domain
 */
export const ROLE_DEFINITIONS = {
  hr: ['hr-read', 'hr-write'],
  finance: ['finance-read', 'finance-write'],
  sales: ['sales-read', 'sales-write'],
  support: ['support-read', 'support-write'],
  payroll: ['payroll-read', 'payroll-write'],
  tax: ['tax-read', 'tax-write'],
} as const;

export type Domain = keyof typeof ROLE_DEFINITIONS;

/**
 * Check if user has access to a specific domain
 */
export function hasDomainAccess(roles: string[], domain: Domain): boolean {
  const domainRoles = ROLE_DEFINITIONS[domain] as readonly string[];
  return roles.some(role =>
    domainRoles.includes(role) || role === 'executive'
  );
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(userRoles: string[], requiredRoles: string[]): boolean {
  return requiredRoles.some(role =>
    userRoles.includes(role) || userRoles.includes('executive')
  );
}

/**
 * Check if user has write access to a domain
 */
export function hasWriteAccess(roles: string[], domain: Domain): boolean {
  const writeRole = `${domain}-write`;
  return roles.includes(writeRole) || roles.includes('executive');
}

/**
 * Express middleware factory for role-based authorization
 *
 * Usage:
 *   app.post('/tools/get_employee', requireRole('hr-read', 'hr-write'), handler);
 *   app.post('/tools/update_employee', requireRole('hr-write'), handler);
 *
 * @param roles - One or more roles that grant access
 * @returns Express middleware that checks authorization
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userContext = req.body?.userContext as UserContext | undefined;

    // Check for user context
    if (!userContext?.userId) {
      return res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required for this operation.',
        suggestedAction: 'Ensure the request includes a valid authentication token.',
      });
    }

    // Check authorization
    const userRoles = userContext.roles || [];
    const hasAccess = hasAnyRole(userRoles, roles);

    if (!hasAccess) {
      return res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. Required roles: ${roles.join(' or ')}.`,
        suggestedAction: 'Contact your administrator to request access.',
        userRoles: userRoles,
        requiredRoles: roles,
      });
    }

    next();
  };
}

/**
 * Express middleware factory for domain-based authorization
 *
 * Usage:
 *   app.post('/tools/list_employees', requireDomainAccess('hr'), handler);
 *
 * @param domain - The domain to check access for
 * @returns Express middleware that checks authorization
 */
export function requireDomainAccess(domain: Domain) {
  const domainRoles = ROLE_DEFINITIONS[domain];
  return requireRole(...domainRoles);
}

/**
 * Express middleware factory for write operations
 *
 * Usage:
 *   app.post('/tools/create_employee', requireWriteAccess('hr'), handler);
 *
 * @param domain - The domain requiring write access
 * @returns Express middleware that checks write authorization
 */
export function requireWriteAccess(domain: Domain) {
  const writeRole = `${domain}-write`;
  return requireRole(writeRole);
}

// Legacy compatibility helpers
export const hasHRAccess = (roles: string[]) => hasDomainAccess(roles, 'hr');
export const hasFinanceAccess = (roles: string[]) => hasDomainAccess(roles, 'finance');
export const hasSalesAccess = (roles: string[]) => hasDomainAccess(roles, 'sales');
export const hasSupportAccess = (roles: string[]) => hasDomainAccess(roles, 'support');
export const hasPayrollAccess = (roles: string[]) => hasDomainAccess(roles, 'payroll');
export const hasTaxAccess = (roles: string[]) => hasDomainAccess(roles, 'tax');
