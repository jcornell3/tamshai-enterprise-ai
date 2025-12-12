/**
 * @tamshai/auth
 *
 * Authentication package for Tamshai Enterprise AI web applications
 *
 * Features:
 * - OIDC authentication with Keycloak
 * - PKCE flow (Article V compliance)
 * - Role-based access control
 * - JWT token management
 * - Silent token refresh
 *
 * Security:
 * - Access tokens stored in memory only
 * - Refresh tokens in sessionStorage
 * - 5-minute token lifetime
 * - Automatic token refresh
 */

// Components
export { AuthProvider } from './AuthProvider';
export { PrivateRoute } from './PrivateRoute';

// Hooks
export { useAuth } from './useAuth';

// Utilities
export {
  extractUserContext,
  determineAccessLevel,
  hasRole,
  hasAnyRole,
  hasAllRoles,
  canAccessHR,
  canModifyHR,
  canAccessFinance,
  canModifyFinance,
  canAccessSales,
  canModifySales,
  canAccessSupport,
  canModifySupport,
  getUserDisplayName,
  getRoleBadges,
} from './utils';

// Configuration
export { oidcConfig, apiConfig } from './config';

// Types
export type {
  UserContext,
  AuthState,
  DepartmentRole,
  GeneralRole,
  Role,
} from './types';
export { AccessLevel } from './types';
