/**
 * Mobile Authentication Service (iOS/Android/macOS)
 *
 * Uses react-native-app-auth for OIDC and react-native-keychain for secure storage.
 *
 * Article V Compliance:
 * - V.2: Tokens stored in iOS Keychain / Android Keystore
 * - V.3: PKCE authentication via react-native-app-auth
 */

import { authorize, refresh, revoke, AuthConfiguration } from 'react-native-app-auth';
import * as Keychain from 'react-native-keychain';
import { Tokens, AuthConfig } from '../../types';
import { Platform } from 'react-native';

const KEYCHAIN_SERVICE = 'com.tamshai.ai';
const KEYCHAIN_USERNAME = 'tokens';

/**
 * Convert our config to react-native-app-auth format
 */
function getAuthConfig(config: AuthConfig): AuthConfiguration {
  return {
    issuer: config.issuer,
    clientId: config.clientId,
    redirectUrl: config.redirectUrl,
    scopes: config.scopes,
    usePKCE: config.usePKCE,
    serviceConfiguration: {
      authorizationEndpoint: `${config.issuer}/protocol/openid-connect/auth`,
      tokenEndpoint: `${config.issuer}/protocol/openid-connect/token`,
      revocationEndpoint: `${config.issuer}/protocol/openid-connect/revoke`,
      endSessionEndpoint: `${config.issuer}/protocol/openid-connect/logout`,
    },
  };
}

/**
 * Perform OIDC login
 */
export async function login(config: AuthConfig): Promise<Tokens> {
  console.log('[Auth:Mobile] Starting OIDC login flow...');

  const authConfig = getAuthConfig(config);

  try {
    const result = await authorize(authConfig);

    console.log('[Auth:Mobile] Login successful');

    const tokens: Tokens = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      idToken: result.idToken,
      accessTokenExpirationDate: result.accessTokenExpirationDate,
      tokenType: result.tokenType,
    };

    await storeTokens(tokens);
    return tokens;
  } catch (error) {
    console.error('[Auth:Mobile] Login failed:', error);
    throw error;
  }
}

/**
 * Refresh tokens
 */
export async function refreshTokens(config: AuthConfig): Promise<Tokens> {
  console.log('[Auth:Mobile] Refreshing tokens...');

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

    await storeTokens(tokens);
    console.log('[Auth:Mobile] Token refresh successful');
    return tokens;
  } catch (error) {
    console.error('[Auth:Mobile] Token refresh failed:', error);
    throw error;
  }
}

/**
 * Logout
 */
export async function logout(config: AuthConfig): Promise<void> {
  console.log('[Auth:Mobile] Logging out...');

  const storedTokens = await getStoredTokens();
  const authConfig = getAuthConfig(config);

  try {
    if (storedTokens?.refreshToken) {
      await revoke(authConfig, {
        tokenToRevoke: storedTokens.refreshToken,
        includeBasicAuth: false,
        sendClientId: true,
      });
    }
  } catch (error) {
    console.warn('[Auth:Mobile] Token revocation failed:', error);
  }

  await clearStoredTokens();
  console.log('[Auth:Mobile] Logout complete');
}

/**
 * Store tokens securely
 */
async function storeTokens(tokens: Tokens): Promise<void> {
  try {
    const tokenData = JSON.stringify({
      refreshToken: tokens.refreshToken,
      accessTokenExpirationDate: tokens.accessTokenExpirationDate,
    });

    await Keychain.setGenericPassword(KEYCHAIN_USERNAME, tokenData, {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    console.log('[Auth:Mobile] Tokens stored securely in', Platform.OS, 'keychain');
  } catch (error) {
    console.error('[Auth:Mobile] Failed to store tokens:', error);
    throw error;
  }
}

/**
 * Get stored tokens
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
    console.error('[Auth:Mobile] Failed to retrieve tokens:', error);
    return null;
  }
}

/**
 * Clear stored tokens
 */
async function clearStoredTokens(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({
      service: KEYCHAIN_SERVICE,
    });
    console.log('[Auth:Mobile] Stored tokens cleared');
  } catch (error) {
    console.error('[Auth:Mobile] Failed to clear tokens:', error);
  }
}

/**
 * Check if valid tokens exist
 */
export async function hasValidStoredTokens(): Promise<boolean> {
  const stored = await getStoredTokens();
  return !!stored?.refreshToken;
}
