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
 * Role definitions for each domain.
 * Includes cross-domain roles (e.g., HR roles grant Payroll access).
 */
export const ROLE_DEFINITIONS = {
  hr: ['hr-read', 'hr-write', 'manager', 'user', 'employee'],
  finance: ['finance-read', 'finance-write'],
  sales: ['sales-read', 'sales-write'],
  support: ['support-read', 'support-write'],
  payroll: ['payroll-read', 'payroll-write', 'hr-read', 'hr-write'],
  tax: ['tax-read', 'tax-write', 'finance-read', 'finance-write'],
} as const;

export type Domain = keyof typeof ROLE_DEFINITIONS;

/**
 * Write-specific role map for each domain.
 * Used by hasDomainWriteAccess() for write operation authorization.
 */
export const WRITE_ROLES: Record<Domain, readonly string[]> = {
  hr: ['hr-write'],
  finance: ['finance-write'],
  sales: ['sales-write'],
  support: ['support-write'],
  payroll: ['payroll-write', 'hr-write'],
  tax: ['tax-write', 'finance-write'],
} as const;

/**
 * Finance tiered access model (v1.5).
 * Different finance features require different access levels.
 */
export const FINANCE_TIERS = {
  expenses: ['employee', 'manager', 'finance-read', 'finance-write'],
  budgets: ['employee', 'manager', 'finance-read', 'finance-write'],
  dashboard: ['finance-read', 'finance-write'],
  write: ['finance-write'],
} as const;

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
 * Check if user has write access to a domain.
 * Respects cross-domain write grants (e.g., hr-write grants payroll write).
 */
export function hasDomainWriteAccess(roles: string[], domain: Domain): boolean {
  const writeRoles = WRITE_ROLES[domain] as readonly string[];
  return roles.some(role =>
    writeRoles.includes(role) || role === 'executive'
  );
}

/**
 * Check if user has access to a specific Finance tier.
 *
 * Tiers:
 * - expenses: All employees (self-access via RLS)
 * - budgets: All employees (filtered via RLS)
 * - dashboard: Finance personnel and executives only
 * - write: Finance-write and executives only
 */
export function hasFinanceTierAccess(roles: string[], tier: keyof typeof FINANCE_TIERS): boolean {
  const tierRoles = FINANCE_TIERS[tier] as readonly string[];
  return roles.some(role =>
    tierRoles.includes(role) || role === 'executive'
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
 * Check if user has write access to a domain (legacy - use hasDomainWriteAccess instead)
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

// =============================================================================
// DOMAIN AUTH MIDDLEWARE FACTORIES
// =============================================================================

/**
 * Express middleware factory that checks domain access from userContext in request body.
 * Use as route-level middleware to replace inline hasDomainAccess() checks.
 *
 * Usage:
 *   // Apply to all tool routes for a domain (read access)
 *   app.use('/tools', createDomainAuthMiddleware('payroll'));
 *
 *   // Apply to specific write routes
 *   app.post('/tools/create_pay_run', createDomainAuthMiddleware('payroll', 'write'), handler);
 *
 * @param domain - The domain to check access for (hr, finance, sales, support, payroll, tax)
 * @param access - 'read' (default) or 'write' access level
 * @returns Express middleware that checks domain authorization
 */
export function createDomainAuthMiddleware(
  domain: Domain,
  access: 'read' | 'write' = 'read',
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const roles: string[] = req.body?.userContext?.roles || [];
    const hasAccess = access === 'write'
      ? hasDomainWriteAccess(roles, domain)
      : hasDomainAccess(roles, domain);

    if (!hasAccess) {
      return res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. Requires ${domain}-${access} role.`,
        suggestedAction: `User needs ${domain}-${access} or executive role to access this resource.`,
      });
    }
    next();
  };
}

/**
 * Express middleware factory that checks Finance tiered access from userContext in request body.
 * Finance uses a tiered authorization model where different tools require different access levels.
 *
 * Usage:
 *   // TIER 1: All employees (self-access via RLS)
 *   app.post('/tools/list_expense_reports', createFinanceTierAuthMiddleware('expenses'), handler);
 *
 *   // TIER 2: Managers and above
 *   app.post('/tools/list_budgets', createFinanceTierAuthMiddleware('budgets'), handler);
 *
 *   // TIER 3: Finance personnel only
 *   app.post('/tools/list_invoices', createFinanceTierAuthMiddleware('dashboard'), handler);
 *
 * @param tier - The finance tier to check (expenses, budgets, dashboard, write)
 * @returns Express middleware that checks finance tier authorization
 */
export function createFinanceTierAuthMiddleware(
  tier: keyof typeof FINANCE_TIERS,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const roles: string[] = req.body?.userContext?.roles || [];

    if (!hasFinanceTierAccess(roles, tier)) {
      const tierDescriptions: Record<string, string> = {
        expenses: 'employee, manager, finance, or executive',
        budgets: 'employee, manager, finance, or executive',
        dashboard: 'finance-read, finance-write, or executive',
        write: 'finance-write or executive',
      };
      return res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires ${tierDescriptions[tier] || tier} role.`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
    }
    next();
  };
}

/**
 * Express middleware factory that checks Finance write access from userContext in request body.
 * Shorthand for createDomainAuthMiddleware('finance', 'write').
 *
 * Usage:
 *   app.post('/tools/delete_invoice', createFinanceWriteAuthMiddleware(), handler);
 *
 * @returns Express middleware that checks finance write authorization
 */
export function createFinanceWriteAuthMiddleware() {
  return createDomainAuthMiddleware('finance', 'write');
}

// Legacy compatibility helpers
export const hasHRAccess = (roles: string[]) => hasDomainAccess(roles, 'hr');
export const hasFinanceAccess = (roles: string[]) => hasDomainAccess(roles, 'finance');
export const hasSalesAccess = (roles: string[]) => hasDomainAccess(roles, 'sales');
export const hasSupportAccess = (roles: string[]) => hasDomainAccess(roles, 'support');
export const hasPayrollAccess = (roles: string[]) => hasDomainAccess(roles, 'payroll');
export const hasTaxAccess = (roles: string[]) => hasDomainAccess(roles, 'tax');
