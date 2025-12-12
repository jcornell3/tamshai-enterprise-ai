/**
 * User context extracted from JWT token
 */
export interface UserContext {
  userId: string;         // JWT sub claim (Keycloak user ID)
  username: string;       // JWT preferred_username
  email?: string;         // JWT email
  roles: string[];        // JWT realm_access.roles
  accessLevel: AccessLevel;
}

/**
 * Access level hierarchy
 */
export enum AccessLevel {
  INTERN = 'intern',
  USER = 'user',
  MANAGER = 'manager',
  DEPARTMENT = 'department',
  EXECUTIVE = 'executive',
}

/**
 * Department-specific roles
 */
export type DepartmentRole =
  | 'hr-read'
  | 'hr-write'
  | 'finance-read'
  | 'finance-write'
  | 'sales-read'
  | 'sales-write'
  | 'support-read'
  | 'support-write';

/**
 * General roles
 */
export type GeneralRole = 'manager' | 'executive' | 'user' | 'intern';

/**
 * All possible roles
 */
export type Role = DepartmentRole | GeneralRole;

/**
 * Authentication state
 */
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserContext | null;
  error: Error | null;
}
