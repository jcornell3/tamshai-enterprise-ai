/**
 * Windows Authentication Service
 *
 * Windows-specific implementation using:
 * - Linking API for OAuth (opens system browser, handles protocol callback)
 * - DeepLinkModule native module for protocol activation URL (workaround for RNW issue #6996)
 * - In-memory storage with optional persistence (AsyncStorage native module has linking issues)
 *
 * Article V Compliance:
 * - V.2: Tokens stored in memory (TODO: migrate to Windows Credential Manager via native module)
 * - V.3: PKCE authentication via system browser
 *
 * Note: This is a JavaScript-only implementation that works without native modules.
 * For production, implement a native module for Windows Credential Manager.
 */

import { Linking, NativeModules } from 'react-native';
import { Tokens, AuthConfig } from '../../types';

// Native modules for Windows authentication
// DeepLinkModule - Custom native module for Windows protocol activation
// Works around: https://github.com/microsoft/react-native-windows/issues/6996
// WebAuthModule - Uses WebAuthenticationBroker for modal auth dialog (not browser tab)
const { DeepLinkModule, WebAuthModule } = NativeModules;

const STORAGE_KEY = '@tamshai_tokens';

// In-memory storage fallback since AsyncStorage native module has linking issues on Windows
// Tokens will persist for the app session but need re-login after app restart
// TODO: Implement native Windows Credential Manager module for persistent secure storage
let inMemoryStorage: Record<string, string> = {};

// Try to use AsyncStorage if available, fall back to in-memory
let useAsyncStorage = false;
let AsyncStorageModule: typeof import('@react-native-async-storage/async-storage').default | null = null;

// Attempt to load AsyncStorage - will use in-memory if it fails
try {
  AsyncStorageModule = require('@react-native-async-storage/async-storage').default;
  // Test if it actually works
  if (AsyncStorageModule) {
    useAsyncStorage = true;
    console.log('[Auth:Windows] AsyncStorage module loaded');
  }
} catch (e) {
  console.log('[Auth:Windows] AsyncStorage not available, using in-memory storage');
}

// Storage abstraction
const Storage = {
  async setItem(key: string, value: string): Promise<void> {
    if (useAsyncStorage && AsyncStorageModule) {
      try {
        await AsyncStorageModule.setItem(key, value);
        return;
      } catch (e) {
        console.warn('[Auth:Windows] AsyncStorage.setItem failed, falling back to memory:', e);
        useAsyncStorage = false;
      }
    }
    inMemoryStorage[key] = value;
  },

  async getItem(key: string): Promise<string | null> {
    if (useAsyncStorage && AsyncStorageModule) {
      try {
        return await AsyncStorageModule.getItem(key);
      } catch (e) {
        console.warn('[Auth:Windows] AsyncStorage.getItem failed, falling back to memory:', e);
        useAsyncStorage = false;
      }
    }
    return inMemoryStorage[key] || null;
  },

  async removeItem(key: string): Promise<void> {
    if (useAsyncStorage && AsyncStorageModule) {
      try {
        await AsyncStorageModule.removeItem(key);
        return;
      } catch (e) {
        console.warn('[Auth:Windows] AsyncStorage.removeItem failed, falling back to memory:', e);
        useAsyncStorage = false;
      }
    }
    delete inMemoryStorage[key];
  },
};

// PKCE utilities
// Note: Web Crypto API may not be available in React Native Windows
// Use fallbacks for crypto operations

function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';

  // Try Web Crypto API first, fall back to Math.random
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const randomValues = new Uint8Array(length);
      crypto.getRandomValues(randomValues);
      for (let i = 0; i < length; i++) {
        result += charset[randomValues[i] % charset.length];
      }
      return result;
    }
  } catch (e) {
    console.warn('[Auth:Windows] crypto.getRandomValues not available, using fallback');
  }

  // Fallback to Math.random (less secure but functional)
  for (let i = 0; i < length; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

// Simple SHA-256 implementation for PKCE code challenge
// This is a pure JS implementation - we skip Web Crypto API on Windows
// because crypto.subtle.digest() hangs indefinitely in React Native Windows
async function sha256(message: string): Promise<ArrayBuffer> {
  // NOTE: We intentionally skip Web Crypto API on Windows.
  // While crypto.subtle exists, digest() hangs forever in RN Windows.
  // Always use the pure JS implementation for reliability.
  console.log('[Auth:Windows] Using pure JS SHA-256 implementation');
  console.log('[Auth:Windows] Input message length:', message.length);

  try {
  // Pure JS SHA-256 implementation
  const utf8 = unescape(encodeURIComponent(message));
  console.log('[Auth:Windows] UTF8 encoded length:', utf8.length);
  const msgBuffer = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    msgBuffer[i] = utf8.charCodeAt(i);
  }
  console.log('[Auth:Windows] Message buffer created');

  // SHA-256 constants
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);

  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const ch = (x: number, y: number, z: number) => (x & y) ^ (~x & z);
  const maj = (x: number, y: number, z: number) => (x & y) ^ (x & z) ^ (y & z);
  const sigma0 = (x: number) => rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
  const sigma1 = (x: number) => rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
  const gamma0 = (x: number) => rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
  const gamma1 = (x: number) => rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10);

  // Padding - SHA-256 requires message + 1 bit + padding + 64-bit length, all in 512-bit blocks
  const msgLen = msgBuffer.length;
  const bitLength = msgLen * 8;

  // Calculate padded length: must be multiple of 64 bytes (512 bits)
  // Need space for: original message + 1 byte (0x80) + padding + 8 bytes (64-bit length)
  let paddedLen = msgLen + 1 + 8; // minimum: message + 0x80 + 64-bit length
  paddedLen = Math.ceil(paddedLen / 64) * 64; // round up to next 64-byte boundary

  console.log('[Auth:Windows] Padding: msgLen=' + msgLen + ', paddedLen=' + paddedLen);

  const padded = new Uint8Array(paddedLen);
  padded.set(msgBuffer);
  padded[msgLen] = 0x80; // append single '1' bit

  // Append length as 64-bit big-endian (we only use lower 32 bits since messages are small)
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLength, false); // lower 32 bits of bit length

  // Process blocks
  for (let i = 0; i < padded.length; i += 64) {
    const W = new Uint32Array(64);
    for (let t = 0; t < 16; t++) {
      W[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      W[t] = (gamma1(W[t - 2]) + W[t - 7] + gamma0(W[t - 15]) + W[t - 16]) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const T1 = (h + sigma1(e) + ch(e, f, g) + K[t] + W[t]) >>> 0;
      const T2 = (sigma0(a) + maj(a, b, c)) >>> 0;
      h = g; g = f; f = e; e = (d + T1) >>> 0;
      d = c; c = b; b = a; a = (T1 + T2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  const result = new ArrayBuffer(32);
  const resultView = new DataView(result);
  for (let i = 0; i < 8; i++) {
    resultView.setUint32(i * 4, H[i], false);
  }
  console.log('[Auth:Windows] SHA-256 hash computed successfully');
  return result;
  } catch (error) {
    console.error('[Auth:Windows] Error in sha256:', error);
    throw error;
  }
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  console.log('[Auth:Windows] generateCodeChallenge called with verifier length:', verifier.length);
  try {
    const digest = await sha256(verifier);
    console.log('[Auth:Windows] SHA-256 digest received, length:', digest.byteLength);

    // Base64 encode - handle environments without btoa
    const bytes = new Uint8Array(digest);
    console.log('[Auth:Windows] Bytes array created, length:', bytes.length);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  let base64: string;
  if (typeof btoa !== 'undefined') {
    base64 = btoa(binary);
  } else {
    // Fallback base64 encoding
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    base64 = '';
    for (let i = 0; i < binary.length; i += 3) {
      const a = binary.charCodeAt(i);
      const b = binary.charCodeAt(i + 1) || 0;
      const c = binary.charCodeAt(i + 2) || 0;
      base64 += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)] +
                (isNaN(binary.charCodeAt(i + 1)) ? '=' : chars[((b & 15) << 2) | (c >> 6)]) +
                (isNaN(binary.charCodeAt(i + 2)) ? '=' : chars[c & 63]);
    }
  }

  // Base64URL encoding
  const result = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  console.log('[Auth:Windows] Code challenge generated successfully');
  return result;
  } catch (error) {
    console.error('[Auth:Windows] Error in generateCodeChallenge:', error);
    throw error;
  }
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
  return exchangeCodeForTokensWithUri(code, codeVerifier, config, config.redirectUrl);
}

/**
 * Exchange authorization code for tokens with a specific redirect URI
 * This is needed because WebAuthenticationBroker uses ms-app:// URIs
 * which differ from the custom scheme used for browser-based auth
 */
async function exchangeCodeForTokensWithUri(
  code: string,
  codeVerifier: string,
  config: AuthConfig,
  redirectUri: string
): Promise<Tokens> {
  const tokenEndpoint = `${config.issuer}/protocol/openid-connect/token`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  console.log('[Auth:Windows] Token exchange - redirect_uri:', redirectUri);

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
 * Perform OIDC login using WebAuthenticationBroker (modal dialog)
 * Falls back to system browser if WebAuthModule is not available
 *
 * IMPORTANT: WebAuthenticationBroker requires an ms-app:// callback URI.
 * The custom scheme com.tamshai.ai:// won't work with WAB.
 * We get the proper URI via WebAuthModule.getCallbackUri() and use that
 * for the OAuth flow when using WAB.
 */
export async function login(config: AuthConfig): Promise<Tokens> {
  console.log('[Auth:Windows] Starting OIDC login flow...');

  // Generate PKCE values
  console.log('[Auth:Windows] Generating PKCE code verifier...');
  const codeVerifier = generateRandomString(64);
  console.log('[Auth:Windows] Code verifier generated, generating challenge...');
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  console.log('[Auth:Windows] Code challenge generated:', codeChallenge.substring(0, 10) + '...');
  const state = generateRandomString(32);
  console.log('[Auth:Windows] State generated');

  // Try WebAuthModule first (modal dialog - preferred UX)
  // SPEC REQUIREMENT: Must use OS-native secure browser modal, not browser tab
  // NOTE: WebAuthenticationBroker can access localhost if the app has a loopback exemption:
  //   CheckNetIsolation.exe LoopbackExempt -a -n="TamshaiAiUnified_mz456f93e3tka"
  // This exemption persists across builds and allows WAB to reach localhost Keycloak.
  if (WebAuthModule?.authenticate && WebAuthModule?.getCallbackUri) {
    console.log('[Auth:Windows] Using WebAuthenticationBroker (modal dialog)');
    try {
      // Get the ms-app:// callback URI that WAB requires
      const wabCallbackUri = await WebAuthModule.getCallbackUri();
      console.log('[Auth:Windows] WAB callback URI:', wabCallbackUri);

      // Build authorization URL with the WAB callback URI
      const authEndpoint = `${config.issuer}/protocol/openid-connect/auth`;
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: wabCallbackUri,  // Use ms-app:// URI for WAB
        response_type: 'code',
        scope: config.scopes.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authUrl = `${authEndpoint}?${params.toString()}`;
      console.log('[Auth:Windows] Auth URL:', authUrl);

      // WebAuthModule.authenticate returns the full callback URL with code
      const callbackUrl = await WebAuthModule.authenticate(authUrl, wabCallbackUri);
      console.log('[Auth:Windows] WebAuthModule returned:', callbackUrl);

      // Parse the callback URL - WAB returns ms-app://...?code=...&state=...
      // The URL class may not parse ms-app:// correctly, so extract params manually
      let code: string | null = null;
      let returnedState: string | null = null;
      let error: string | null = null;

      const queryStart = callbackUrl.indexOf('?');
      if (queryStart !== -1) {
        const queryString = callbackUrl.substring(queryStart + 1);
        const searchParams = new URLSearchParams(queryString);
        code = searchParams.get('code');
        returnedState = searchParams.get('state');
        error = searchParams.get('error');
      }

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (returnedState !== state) {
        throw new Error('State mismatch - possible CSRF attack');
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for tokens - use the WAB callback URI as redirect_uri
      const tokens = await exchangeCodeForTokensWithUri(code, codeVerifier, config, wabCallbackUri);
      await storeTokens(tokens);
      console.log('[Auth:Windows] Login successful via WebAuthenticationBroker');
      return tokens;
    } catch (error: any) {
      // If user cancelled, propagate that specific error
      if (error?.message?.includes('cancelled') || error?.message?.includes('User cancelled')) {
        throw new Error('User cancelled authentication');
      }
      console.error('[Auth:Windows] WebAuthModule error:', error);
      console.error('[Auth:Windows] Error message:', error?.message);
      console.error('[Auth:Windows] Error code:', error?.code);
      // SPEC REQUIREMENT: Must use modal dialog, throw error instead of falling back to browser
      throw new Error(`WebAuthenticationBroker failed: ${error?.message || 'Unknown error'}`);
    }
  } else {
    console.log('[Auth:Windows] WebAuthModule not available, using system browser');
  }

  // Build authorization URL for browser fallback (uses custom scheme)
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
  console.log('[Auth:Windows] Auth URL:', authUrl);

  // Fallback: Use system browser with deep link callback
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
  try {
    const canOpen = await Linking.canOpenURL(authUrl);
    console.log('[Auth:Windows] canOpenURL result:', canOpen);

    if (!canOpen) {
      pendingAuthState = null;
      throw new Error('Cannot open authentication URL');
    }

    console.log('[Auth:Windows] Calling Linking.openURL...');
    await Linking.openURL(authUrl);
    console.log('[Auth:Windows] Linking.openURL completed');
  } catch (error) {
    console.error('[Auth:Windows] Error opening URL:', error);
    pendingAuthState = null;
    throw error;
  }

  console.log('[Auth:Windows] Opened browser for authentication');

  // Wait for callback
  const tokens = await tokenPromise;

  // Store tokens
  await storeTokens(tokens);

  console.log('[Auth:Windows] Login successful via system browser');
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
export async function storeTokens(tokens: Tokens): Promise<void> {
  try {
    const tokenData = JSON.stringify({
      refreshToken: tokens.refreshToken,
      accessTokenExpirationDate: tokens.accessTokenExpirationDate,
    });

    await Storage.setItem(STORAGE_KEY, tokenData);
    console.log('[Auth:Windows] Tokens stored' + (useAsyncStorage ? '' : ' (in-memory)'));
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
    const tokenData = await Storage.getItem(STORAGE_KEY);
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
    await Storage.removeItem(STORAGE_KEY);
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

// Interval ID for IPC file polling
let ipcPollingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start polling for callback URL from IPC file
 * This handles the case where a second instance passes the OAuth callback URL
 * via a temp file (single-instance pattern)
 */
function startIpcPolling(): void {
  if (ipcPollingInterval) {
    return; // Already polling
  }

  if (!DeepLinkModule?.checkForCallbackUrl) {
    console.log('[Auth:Windows] DeepLinkModule.checkForCallbackUrl not available, skipping IPC polling');
    return;
  }

  console.log('[Auth:Windows] Starting IPC file polling for callback URL');

  ipcPollingInterval = setInterval(async () => {
    try {
      const url = await DeepLinkModule.checkForCallbackUrl();
      if (url && url.startsWith('com.tamshai.ai://callback')) {
        console.log('[Auth:Windows] Received callback URL from IPC:', url);
        stopIpcPolling();
        handleOAuthCallback(url);
      }
    } catch (err) {
      // Silently ignore polling errors
    }
  }, 500); // Poll every 500ms
}

/**
 * Stop polling for callback URL
 */
function stopIpcPolling(): void {
  if (ipcPollingInterval) {
    clearInterval(ipcPollingInterval);
    ipcPollingInterval = null;
    console.log('[Auth:Windows] Stopped IPC file polling');
  }
}

/**
 * Initialize the URL listener for OAuth callbacks
 * Call this early in app startup
 */
export function initializeOAuthListener(): void {
  // Handle URL when app is already running
  Linking.addEventListener('url', ({ url }) => {
    console.log('[Auth:Windows] URL event received:', url);
    if (url.startsWith('com.tamshai.ai://callback')) {
      handleOAuthCallback(url);
    }
  });

  // Handle URL that opened the app - try both methods
  // Method 1: React Native's Linking.getInitialURL (may return null due to RNW bug #6996)
  Linking.getInitialURL().then((url) => {
    console.log('[Auth:Windows] Linking.getInitialURL:', url);
    if (url && url.startsWith('com.tamshai.ai://callback')) {
      handleOAuthCallback(url);
    }
  });

  // Method 2: Our custom DeepLinkModule (workaround for RNW bug #6996)
  // This captures the URL from command line args when app is launched via protocol
  if (DeepLinkModule) {
    DeepLinkModule.getInitialURL()
      .then((url: string) => {
        console.log('[Auth:Windows] DeepLinkModule.getInitialURL:', url);
        if (url && url.startsWith('com.tamshai.ai://callback')) {
          handleOAuthCallback(url);
          // Clear it so it's not processed again
          DeepLinkModule.clearInitialURL();
        }
      })
      .catch((err: Error) => {
        console.warn('[Auth:Windows] DeepLinkModule.getInitialURL failed:', err);
      });

    // Start polling for IPC file (for single-instance URL passing)
    startIpcPolling();
  } else {
    console.warn('[Auth:Windows] DeepLinkModule not available');
  }

  console.log('[Auth:Windows] OAuth listener initialized');
}
