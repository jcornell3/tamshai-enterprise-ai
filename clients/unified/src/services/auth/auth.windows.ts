/**
 * Windows Authentication Service
 *
 * Windows-specific implementation using:
 * - Linking API for OAuth (opens system browser, handles protocol callback)
 * - AsyncStorage for token storage (fallback until native CredentialManager is implemented)
 *
 * Article V Compliance:
 * - V.2: Tokens stored securely (TODO: migrate to Windows Credential Manager)
 * - V.3: PKCE authentication via system browser
 *
 * Note: This is a JavaScript-only implementation that works without native modules.
 * For production, consider implementing a native module for Windows Credential Manager.
 */

import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tokens, AuthConfig } from '../../types';

const STORAGE_KEY = '@tamshai_tokens';

// PKCE utilities
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  // Base64URL encoding
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Store for pending auth state
let pendingAuthState: {
  codeVerifier: string;
  state: string;
  config: AuthConfig;
  resolve: (tokens: Tokens) => void;
  reject: (error: Error) => void;
} | null = null;

/**
 * Handle OAuth callback URL
 * This should be called when the app receives the OAuth redirect
 */
export async function handleOAuthCallback(url: string): Promise<void> {
  if (!pendingAuthState) {
    console.warn('[Auth:Windows] No pending auth state for callback');
    return;
  }

  try {
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');
    const error = urlObj.searchParams.get('error');

    if (error) {
      pendingAuthState.reject(new Error(`OAuth error: ${error}`));
      pendingAuthState = null;
      return;
    }

    if (state !== pendingAuthState.state) {
      pendingAuthState.reject(new Error('State mismatch'));
      pendingAuthState = null;
      return;
    }

    if (!code) {
      pendingAuthState.reject(new Error('No authorization code received'));
      pendingAuthState = null;
      return;
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(
      code,
      pendingAuthState.codeVerifier,
      pendingAuthState.config
    );

    pendingAuthState.resolve(tokens);
    pendingAuthState = null;
  } catch (error) {
    if (pendingAuthState) {
      pendingAuthState.reject(error instanceof Error ? error : new Error('Unknown error'));
      pendingAuthState = null;
    }
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  config: AuthConfig
): Promise<Tokens> {
  const tokenEndpoint = `${config.issuer}/protocol/openid-connect/token`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUrl,
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    accessTokenExpirationDate: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    tokenType: data.token_type || 'Bearer',
  };
}

/**
 * Perform OIDC login
 */
export async function login(config: AuthConfig): Promise<Tokens> {
  console.log('[Auth:Windows] Starting OIDC login flow...');

  // Generate PKCE values
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  // Build authorization URL
  const authEndpoint = `${config.issuer}/protocol/openid-connect/auth`;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUrl,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${authEndpoint}?${params.toString()}`;

  // Set up listener for callback before opening browser
  const setupListener = (): Promise<Tokens> => {
    return new Promise((resolve, reject) => {
      pendingAuthState = {
        codeVerifier,
        state,
        config,
        resolve,
        reject,
      };

      // Set a timeout
      setTimeout(() => {
        if (pendingAuthState) {
          pendingAuthState.reject(new Error('Login timeout'));
          pendingAuthState = null;
        }
      }, 5 * 60 * 1000); // 5 minute timeout
    });
  };

  const tokenPromise = setupListener();

  // Open system browser
  const canOpen = await Linking.canOpenURL(authUrl);
  if (!canOpen) {
    pendingAuthState = null;
    throw new Error('Cannot open authentication URL');
  }

  await Linking.openURL(authUrl);
  console.log('[Auth:Windows] Opened browser for authentication');

  // Wait for callback
  const tokens = await tokenPromise;

  // Store tokens
  await storeTokens(tokens);

  console.log('[Auth:Windows] Login successful');
  return tokens;
}

/**
 * Refresh tokens
 */
export async function refreshTokens(config: AuthConfig): Promise<Tokens> {
  console.log('[Auth:Windows] Refreshing tokens...');

  const storedTokens = await getStoredTokens();
  if (!storedTokens?.refreshToken) {
    throw new Error('No refresh token available');
  }

  const tokenEndpoint = `${config.issuer}/protocol/openid-connect/token`;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: storedTokens.refreshToken,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  const tokens: Tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || storedTokens.refreshToken,
    idToken: data.id_token,
    accessTokenExpirationDate: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    tokenType: data.token_type || 'Bearer',
  };

  await storeTokens(tokens);
  console.log('[Auth:Windows] Token refresh successful');
  return tokens;
}

/**
 * Logout
 */
export async function logout(config: AuthConfig): Promise<void> {
  console.log('[Auth:Windows] Logging out...');

  const storedTokens = await getStoredTokens();

  // Revoke token with IdP (best effort)
  if (storedTokens?.refreshToken) {
    try {
      const revokeEndpoint = `${config.issuer}/protocol/openid-connect/revoke`;
      await fetch(revokeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          token: storedTokens.refreshToken,
          token_type_hint: 'refresh_token',
        }).toString(),
      });
    } catch (error) {
      console.warn('[Auth:Windows] Token revocation failed:', error);
    }
  }

  await clearStoredTokens();
  console.log('[Auth:Windows] Logout complete');
}

/**
 * Store tokens
 * TODO: Migrate to Windows Credential Manager for production
 */
async function storeTokens(tokens: Tokens): Promise<void> {
  try {
    const tokenData = JSON.stringify({
      refreshToken: tokens.refreshToken,
      accessTokenExpirationDate: tokens.accessTokenExpirationDate,
    });

    await AsyncStorage.setItem(STORAGE_KEY, tokenData);
    console.log('[Auth:Windows] Tokens stored');
  } catch (error) {
    console.error('[Auth:Windows] Failed to store tokens:', error);
    throw error;
  }
}

/**
 * Get stored tokens
 */
export async function getStoredTokens(): Promise<{ refreshToken: string; accessTokenExpirationDate?: string } | null> {
  try {
    const tokenData = await AsyncStorage.getItem(STORAGE_KEY);
    if (tokenData) {
      return JSON.parse(tokenData);
    }
    return null;
  } catch (error) {
    console.error('[Auth:Windows] Failed to retrieve tokens:', error);
    return null;
  }
}

/**
 * Clear stored tokens
 */
async function clearStoredTokens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('[Auth:Windows] Stored tokens cleared');
  } catch (error) {
    console.error('[Auth:Windows] Failed to clear tokens:', error);
  }
}

/**
 * Check if valid tokens exist
 */
export async function hasValidStoredTokens(): Promise<boolean> {
  const stored = await getStoredTokens();
  return !!stored?.refreshToken;
}

/**
 * Initialize the URL listener for OAuth callbacks
 * Call this early in app startup
 */
export function initializeOAuthListener(): void {
  // Handle URL when app is already running
  Linking.addEventListener('url', ({ url }) => {
    if (url.startsWith('com.tamshai.ai://oauth/callback')) {
      handleOAuthCallback(url);
    }
  });

  // Handle URL that opened the app
  Linking.getInitialURL().then((url) => {
    if (url && url.startsWith('com.tamshai.ai://oauth/callback')) {
      handleOAuthCallback(url);
    }
  });

  console.log('[Auth:Windows] OAuth listener initialized');
}
