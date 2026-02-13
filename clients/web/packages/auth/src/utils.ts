import { User } from 'oidc-client-ts';
import { UserContext, AccessLevel, Role } from './types';

/**
 * Extract user context from OIDC user object
 *
 * IMPORTANT: userContext.userId MUST match JWT token's sub claim
 * (Gateway validates user ownership for confirmations)
 */
export function extractUserContext(oidcUser: User | null | undefined): UserContext | null {
  if (!oidcUser || !oidcUser.profile) {
    return null;
  }

  const profile = oidcUser.profile;

  // Extract roles from JWT
  // Try realm_access.roles first (standard Keycloak location)
  const realmRoles = (profile.realm_access as any)?.roles || [];
  const resourceRoles = (profile.resource_access as any)?.['mcp-gateway']?.roles || [];
  const roles = [...realmRoles, ...resourceRoles] as Role[];

  return {
    userId: profile.sub!,  // CRITICAL: Must match JWT sub claim
    username: profile.preferred_username as string,
    email: profile.email as string,
    roles,
    accessLevel: determineAccessLevel(roles),
  };
}

/**
 * Determine access level from roles (hierarchical)
 */
export function determineAccessLevel(roles: string[]): AccessLevel {
  if (roles.includes('executive')) {
    return AccessLevel.EXECUTIVE;
  }

  // Department heads have department-level access
  const hasDepartmentWrite = roles.some(role =>
    role.endsWith('-write') || role === 'manager'
  );
  if (hasDepartmentWrite) {
    return AccessLevel.DEPARTMENT;
  }

  // Users with read access have manager-level access
  const hasDepartmentRead = roles.some(role => role.endsWith('-read'));
  if (hasDepartmentRead) {
    return AccessLevel.MANAGER;
  }

  if (roles.includes('user')) {
    return AccessLevel.USER;
  }

  return AccessLevel.INTERN;
}

/**
 * Check if user has a specific role
 */
export function hasRole(userContext: UserContext | null, role: Role): boolean {
  return userContext?.roles.includes(role) || false;
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(userContext: UserContext | null, roles: Role[]): boolean {
  return roles.some(role => hasRole(userContext, role));
}

/**
 * Check if user has all of the specified roles
 */
export function hasAllRoles(userContext: UserContext | null, roles: Role[]): boolean {
  return roles.every(role => hasRole(userContext, role));
}

/**
 * Check if user can access HR data
 */
export function canAccessHR(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['hr-read', 'hr-write', 'executive']);
}

/**
 * Check if user can modify HR data
 */
export function canModifyHR(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['hr-write', 'executive']);
}

/**
 * Check if user can access Finance data (full dashboard/ARR - TIER 3)
 */
export function canAccessFinance(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['finance-read', 'finance-write', 'executive']);
}

/**
 * Check if user can modify Finance data
 */
export function canModifyFinance(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['finance-write', 'executive']);
}

// =============================================================================
// TIERED FINANCE ACCESS (v1.5 - Role-Based Access Control Enhancement)
// =============================================================================

/**
 * TIER 1: Expense Reports - accessible by all employees
 * All employees can view their own expense reports (RLS filtering).
 */
export function canAccessFinanceExpenses(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['employee', 'manager', 'finance-read', 'finance-write', 'executive']);
}

/**
 * TIER 2: Budgets - accessible by managers and above
 * Managers can view their department's budget (RLS filtering).
 * Finance users can view all budgets.
 */
export function canAccessFinanceBudgets(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['manager', 'finance-read', 'finance-write', 'executive']);
}

/**
 * TIER 3: Dashboard/ARR/Invoices - finance personnel only
 * Company-wide financial data restricted to Finance team and executives.
 * Same as canAccessFinance() - provided for explicit tier naming.
 */
export function canAccessFinanceDashboard(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['finance-read', 'finance-write', 'executive']);
}

/**
 * Check if user can access Sales data
 */
export function canAccessSales(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['sales-read', 'sales-write', 'executive']);
}

/**
 * Check if user can modify Sales data
 */
export function canModifySales(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['sales-write', 'executive']);
}

/**
 * Check if user can access Support data
 */
export function canAccessSupport(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['support-read', 'support-write', 'executive']);
}

/**
 * Check if user can modify Support data
 */
export function canModifySupport(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['support-write', 'executive']);
}

/**
 * Check if user can access Payroll data
 */
export function canAccessPayroll(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['payroll-read', 'payroll-write', 'hr-read', 'hr-write', 'executive']);
}

/**
 * Check if user can modify Payroll data
 */
export function canModifyPayroll(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['payroll-write', 'hr-write', 'executive']);
}

/**
 * Check if user can access Tax data
 */
export function canAccessTax(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['tax-read', 'tax-write', 'finance-read', 'finance-write', 'executive']);
}

/**
 * Check if user can modify Tax data
 */
export function canModifyTax(userContext: UserContext | null): boolean {
  return hasAnyRole(userContext, ['tax-write', 'finance-write', 'executive']);
}

/**
 * Get user's display name
 */
export function getUserDisplayName(userContext: UserContext | null): string {
  if (!userContext) {
    return 'Guest';
  }

  return userContext.username || userContext.email || 'User';
}

/**
 * Get user's role badges (for UI display)
 */
export function getRoleBadges(userContext: UserContext | null): string[] {
  if (!userContext) {
    return [];
  }

  const badges: string[] = [];

  if (userContext.roles.includes('executive')) {
    badges.push('Executive');
  }

  if (userContext.roles.includes('manager')) {
    badges.push('Manager');
  }

  // Department roles (filter out Keycloak internal roles)
  const internalRolePrefixes = ['default-roles-', 'offline_', 'uma_'];
  const deptRoles = userContext.roles.filter(role =>
    role.includes('-') &&
    !internalRolePrefixes.some(prefix => role.startsWith(prefix))
  );
  deptRoles.forEach(role => {
    const [dept, access] = role.split('-');
    const deptName = dept.charAt(0).toUpperCase() + dept.slice(1);
    badges.push(`${deptName} ${access === 'write' ? 'Admin' : 'Viewer'}`);
  });

  if (badges.length === 0) {
    badges.push('User');
  }

  return badges;
}
