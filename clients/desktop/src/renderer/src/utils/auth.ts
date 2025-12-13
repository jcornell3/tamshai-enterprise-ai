/**
 * Authentication utilities
 */

import { Tokens, UserInfo } from '../types';

/**
 * Decode JWT token to extract user information
 */
export function decodeToken(accessToken: string): UserInfo | null {
  try {
    const payload = accessToken.split('.')[1];
    const decoded = JSON.parse(atob(payload));

    return {
      userId: decoded.sub,
      username: decoded.preferred_username || 'User',
      email: decoded.email,
      roles: decoded.realm_access?.roles || [],
      groups: decoded.groups || [],
    };
  } catch (error) {
    console.error('[Auth Utils] Failed to decode token:', error);
    return null;
  }
}

/**
 * Check if user has a specific role
 */
export function hasRole(userInfo: UserInfo, role: string): boolean {
  return userInfo.roles.includes(role);
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(userInfo: UserInfo, roles: string[]): boolean {
  return roles.some(role => userInfo.roles.includes(role));
}

/**
 * Get access level for display purposes
 */
export function getAccessLevel(userInfo: UserInfo): string {
  if (hasRole(userInfo, 'executive')) return 'Executive';
  if (hasRole(userInfo, 'manager')) return 'Manager';
  if (hasAnyRole(userInfo, ['hr-write', 'finance-write', 'sales-write', 'support-write'])) {
    return 'Department Admin';
  }
  if (hasAnyRole(userInfo, ['hr-read', 'finance-read', 'sales-read', 'support-read'])) {
    return 'Department User';
  }
  return 'User';
}

/**
 * Check if token is expired
 */
export function isTokenExpired(tokens: Tokens, bufferSeconds: number = 60): boolean {
  const now = Date.now();
  return now >= tokens.expiresAt - (bufferSeconds * 1000);
}
