/**
 * Authentication Service
 *
 * Article V Compliance:
 * - V.2: Tokens stored in platform-native secure storage (Keychain/Credential Manager)
 * - V.3: PKCE authentication via react-native-app-auth
 *
 * This service handles OIDC authentication flow using the system browser
 * and stores tokens securely using react-native-keychain.
 */

import { authorize, refresh, revoke, AuthConfiguration } from 'react-native-app-auth';
import * as Keychain from 'react-native-keychain';
import { Tokens, User, AuthConfig } from '../types';
import { Platform } from 'react-native';

// Keychain service identifier
const KEYCHAIN_SERVICE = 'com.tamshai.ai';
const KEYCHAIN_USERNAME = 'tokens';

// Default auth configuration (can be overridden)
const DEFAULT_CONFIG: AuthConfig = {
  issuer: 'http://localhost:8180/realms/tamshai-corp',
  clientId: 'mcp-gateway-unified',
  redirectUrl: 'com.tamshai.ai://oauth/callback',
  scopes: ['openid', 'profile', 'email', 'roles'],
  usePKCE: true, // REQUIRED by Article V.3
};

/**
 * Get the auth configuration for react-native-app-auth
 */
function getAuthConfig(config: AuthConfig = DEFAULT_CONFIG): AuthConfiguration {
  return {
    issuer: config.issuer,
    clientId: config.clientId,
    redirectUrl: config.redirectUrl,
    scopes: config.scopes,
    usePKCE: config.usePKCE,
    // Platform-specific service configuration
    serviceConfiguration: {
      authorizationEndpoint: `${config.issuer}/protocol/openid-connect/auth`,
      tokenEndpoint: `${config.issuer}/protocol/openid-connect/token`,
      revocationEndpoint: `${config.issuer}/protocol/openid-connect/revoke`,
      endSessionEndpoint: `${config.issuer}/protocol/openid-connect/logout`,
    },
  };
}

/**
 * Perform OIDC login using system browser
 *
 * Opens the system browser for Keycloak login, handles the callback via
 * native protocol handling (UWP on Windows, AppKit on macOS, URL scheme on mobile).
 *
 * Article V.3: Uses PKCE for secure token exchange.
 */
export async function login(config?: AuthConfig): Promise<Tokens> {
  console.log('[Auth] Starting OIDC login flow...');

  const authConfig = getAuthConfig(config);

  try {
    const result = await authorize(authConfig);

    console.log('[Auth] Login successful');

    const tokens: Tokens = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      idToken: result.idToken,
      accessTokenExpirationDate: result.accessTokenExpirationDate,
      tokenType: result.tokenType,
    };

    // Store refresh token securely (Article V.2)
    await storeTokens(tokens);

    return tokens;
  } catch (error) {
    console.error('[Auth] Login failed:', error);
    throw error;
  }
}

/**
 * Refresh the access token using the stored refresh token
 */
export async function refreshTokens(config?: AuthConfig): Promise<Tokens> {
  console.log('[Auth] Refreshing tokens...');

  const storedTokens = await getStoredTokens();
  if (!storedTokens?.refreshToken) {
    throw new Error('No refresh token available');
  }

  const authConfig = getAuthConfig(config);

  try {
    const result = await refresh(authConfig, {
      refreshToken: storedTokens.refreshToken,
    });

    const tokens: Tokens = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || storedTokens.refreshToken,
      idToken: result.idToken,
      accessTokenExpirationDate: result.accessTokenExpirationDate,
      tokenType: result.tokenType,
    };

    // Update stored tokens
    await storeTokens(tokens);

    console.log('[Auth] Token refresh successful');
    return tokens;
  } catch (error) {
    console.error('[Auth] Token refresh failed:', error);
    throw error;
  }
}

/**
 * Logout - clear tokens and revoke with IdP
 */
export async function logout(config?: AuthConfig): Promise<void> {
  console.log('[Auth] Logging out...');

  const storedTokens = await getStoredTokens();
  const authConfig = getAuthConfig(config);

  try {
    // Revoke token with IdP (best effort)
    if (storedTokens?.refreshToken) {
      await revoke(authConfig, {
        tokenToRevoke: storedTokens.refreshToken,
        includeBasicAuth: false,
        sendClientId: true,
      });
    }
  } catch (error) {
    // Log but don't fail - we still need to clear local tokens
    console.warn('[Auth] Token revocation failed:', error);
  }

  // Clear stored tokens (Article V.2: never leave tokens on disk)
  await clearStoredTokens();

  console.log('[Auth] Logout complete');
}

/**
 * Store tokens securely using platform-native storage
 *
 * Article V.2 Compliance:
 * - Windows: Windows Credential Manager via react-native-keychain
 * - macOS: macOS Keychain via react-native-keychain
 * - iOS: iOS Keychain via react-native-keychain
 * - Android: Android Keystore via react-native-keychain
 *
 * Note: Only the REFRESH token is stored. Access tokens are kept in memory.
 */
async function storeTokens(tokens: Tokens): Promise<void> {
  try {
    const keychainOptions: Keychain.Options = {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    };

    // Only store refresh token - access token should be in memory only
    const tokenData = JSON.stringify({
      refreshToken: tokens.refreshToken,
      // Store expiration to know when to refresh
      accessTokenExpirationDate: tokens.accessTokenExpirationDate,
    });

    await Keychain.setGenericPassword(KEYCHAIN_USERNAME, tokenData, keychainOptions);

    console.log('[Auth] Tokens stored securely in', Platform.OS, 'keychain');
  } catch (error) {
    console.error('[Auth] Failed to store tokens:', error);
    throw error;
  }
}

/**
 * Retrieve stored tokens from platform-native secure storage
 */
export async function getStoredTokens(): Promise<{ refreshToken: string; accessTokenExpirationDate?: string } | null> {
  try {
    const result = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE,
    });

    if (result) {
      return JSON.parse(result.password);
    }

    return null;
  } catch (error) {
    console.error('[Auth] Failed to retrieve tokens:', error);
    return null;
  }
}

/**
 * Clear all stored tokens
 */
async function clearStoredTokens(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({
      service: KEYCHAIN_SERVICE,
    });
    console.log('[Auth] Stored tokens cleared');
  } catch (error) {
    console.error('[Auth] Failed to clear tokens:', error);
  }
}

/**
 * Check if tokens are stored and not expired
 */
export async function hasValidStoredTokens(): Promise<boolean> {
  const stored = await getStoredTokens();

  if (!stored?.refreshToken) {
    return false;
  }

  // Refresh tokens don't have expiration in our case - just check existence
  return true;
}

/**
 * Parse user info from ID token (JWT)
 */
export function parseUserFromToken(idToken: string): User | null {
  try {
    // Decode JWT payload (base64)
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]));

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
