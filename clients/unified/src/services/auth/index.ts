/**
 * Authentication Service - Platform Router
 *
 * Routes to platform-specific implementations:
 * - iOS/Android: react-native-app-auth + react-native-keychain
 * - Windows: Native Windows APIs (WebAuthenticationBroker + CredentialManager)
 *
 * Article V Compliance:
 * - V.2: Tokens stored in platform-native secure storage
 * - V.3: PKCE authentication via system browser
 */

import { Platform } from 'react-native';
import { Tokens, User, AuthConfig } from '../../types';

// Platform-specific implementations
import * as mobileAuth from './auth.mobile';
import * as windowsAuth from './auth.windows';

// Default auth configuration
export const DEFAULT_CONFIG: AuthConfig = {
  issuer: 'http://localhost:8180/realms/tamshai-corp',
  clientId: 'mcp-gateway-unified',
  redirectUrl: 'com.tamshai.ai://oauth/callback',
  scopes: ['openid', 'profile', 'email', 'roles'],
  usePKCE: true,
};

/**
 * Get the platform-specific auth module
 */
function getAuthModule() {
  if (Platform.OS === 'windows') {
    return windowsAuth;
  }
  // iOS, Android, macOS use mobile implementation
  return mobileAuth;
}

/**
 * Perform OIDC login using system browser
 */
export async function login(config?: AuthConfig): Promise<Tokens> {
  const authModule = getAuthModule();
  return authModule.login(config || DEFAULT_CONFIG);
}

/**
 * Refresh the access token using the stored refresh token
 */
export async function refreshTokens(config?: AuthConfig): Promise<Tokens> {
  const authModule = getAuthModule();
  return authModule.refreshTokens(config || DEFAULT_CONFIG);
}

/**
 * Logout - clear tokens and revoke with IdP
 */
export async function logout(config?: AuthConfig): Promise<void> {
  const authModule = getAuthModule();
  return authModule.logout(config || DEFAULT_CONFIG);
}

/**
 * Get stored tokens from secure storage
 */
export async function getStoredTokens(): Promise<{ refreshToken: string; accessTokenExpirationDate?: string } | null> {
  const authModule = getAuthModule();
  return authModule.getStoredTokens();
}

/**
 * Check if tokens are stored and valid
 */
export async function hasValidStoredTokens(): Promise<boolean> {
  const authModule = getAuthModule();
  return authModule.hasValidStoredTokens();
}

/**
 * Parse user info from ID token (JWT) - shared across platforms
 */
export function parseUserFromToken(idToken: string): User | null {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Base64 decode - handle both browser and React Native
    const payload = JSON.parse(
      typeof atob !== 'undefined'
        ? atob(parts[1])
        : Buffer.from(parts[1], 'base64').toString('utf8')
    );

    return {
      id: payload.sub,
      username: payload.preferred_username,
      email: payload.email,
      name: payload.name || payload.preferred_username,
      roles: payload.resource_access?.['mcp-gateway']?.roles || [],
    };
  } catch (error) {
    console.error('[Auth] Failed to parse ID token:', error);
    return null;
  }
}
