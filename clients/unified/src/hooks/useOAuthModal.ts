/**
 * useOAuthModal - Hook for managing modal-based OAuth flow
 *
 * This hook provides state management for the WebView2-based OAuth modal.
 * It handles PKCE generation, auth URL construction, and callback processing.
 *
 * Usage:
 *   const { startAuth, handleSuccess, handleCancel, modalProps } = useOAuthModal({
 *     config: authConfig,
 *     onTokens: (tokens) => saveTokens(tokens),
 *     onError: (error) => showError(error),
 *   });
 *
 *   // Start auth flow
 *   startAuth();
 *
 *   // Render modal
 *   <OAuthModal {...modalProps} />
 */

import { useState, useCallback, useRef } from 'react';
import { AuthConfig, Tokens } from '../types';

// PKCE utilities - same as in auth.windows.ts
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';

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
    // Fall through to Math.random
  }

  for (let i = 0; i < length; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

// Pure JS SHA-256 implementation
async function sha256(message: string): Promise<ArrayBuffer> {
  const utf8 = unescape(encodeURIComponent(message));
  const msgBuffer = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    msgBuffer[i] = utf8.charCodeAt(i);
  }

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

  const msgLen = msgBuffer.length;
  const bitLength = msgLen * 8;
  let paddedLen = msgLen + 1 + 8;
  paddedLen = Math.ceil(paddedLen / 64) * 64;

  const padded = new Uint8Array(paddedLen);
  padded.set(msgBuffer);
  padded[msgLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLength, false);

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
  return result;
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await sha256(verifier);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  let base64: string;
  if (typeof btoa !== 'undefined') {
    base64 = btoa(binary);
  } else {
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

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface UseOAuthModalOptions {
  config: AuthConfig;
  onTokens: (tokens: Tokens) => void;
  onError: (error: string) => void;
}

interface UseOAuthModalReturn {
  visible: boolean;
  authUrl: string;
  startAuth: () => Promise<void>;
  handleSuccess: (callbackUrl: string) => Promise<void>;
  handleCancel: () => void;
  handleError: (error: string) => void;
  isLoading: boolean;
}

export function useOAuthModal({
  config,
  onTokens,
  onError,
}: UseOAuthModalOptions): UseOAuthModalReturn {
  const [visible, setVisible] = useState(false);
  const [authUrl, setAuthUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Store PKCE values for the current auth flow
  const authStateRef = useRef<{
    codeVerifier: string;
    state: string;
  } | null>(null);

  const startAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('[useOAuthModal] Starting OAuth flow...');

      // Generate PKCE values
      const codeVerifier = generateRandomString(64);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateRandomString(32);

      // Store for callback handling
      authStateRef.current = { codeVerifier, state };

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

      const url = `${authEndpoint}?${params.toString()}`;
      console.log('[useOAuthModal] Auth URL:', url);

      setAuthUrl(url);
      setVisible(true);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      const message = error instanceof Error ? error.message : 'Failed to start auth';
      console.error('[useOAuthModal] Error starting auth:', message);
      onError(message);
    }
  }, [config, onError]);

  const handleSuccess = useCallback(async (callbackUrl: string) => {
    try {
      setIsLoading(true);
      console.log('[useOAuthModal] Processing callback:', callbackUrl);

      if (!authStateRef.current) {
        throw new Error('No pending auth state');
      }

      const { codeVerifier, state } = authStateRef.current;

      // Parse callback URL
      const queryStart = callbackUrl.indexOf('?');
      if (queryStart === -1) {
        throw new Error('Invalid callback URL: no query parameters');
      }

      const queryString = callbackUrl.substring(queryStart + 1);
      const searchParams = new URLSearchParams(queryString);
      const code = searchParams.get('code');
      const returnedState = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (returnedState !== state) {
        throw new Error('State mismatch - possible CSRF attack');
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for tokens
      const tokenEndpoint = `${config.issuer}/protocol/openid-connect/token`;
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code,
        redirect_uri: config.redirectUrl,
        code_verifier: codeVerifier,
      });

      console.log('[useOAuthModal] Exchanging code for tokens...');
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

      const tokens: Tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
        accessTokenExpirationDate: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        tokenType: data.token_type || 'Bearer',
      };

      console.log('[useOAuthModal] Token exchange successful');

      // Clean up
      authStateRef.current = null;
      setVisible(false);
      setIsLoading(false);

      onTokens(tokens);
    } catch (error) {
      setIsLoading(false);
      setVisible(false);
      authStateRef.current = null;
      const message = error instanceof Error ? error.message : 'Failed to process callback';
      console.error('[useOAuthModal] Error processing callback:', message);
      onError(message);
    }
  }, [config, onTokens, onError]);

  const handleCancel = useCallback(() => {
    console.log('[useOAuthModal] User cancelled');
    authStateRef.current = null;
    setVisible(false);
    setIsLoading(false);
    onError('User cancelled authentication');
  }, [onError]);

  const handleError = useCallback((error: string) => {
    console.error('[useOAuthModal] WebView error:', error);
    authStateRef.current = null;
    setVisible(false);
    setIsLoading(false);
    onError(error);
  }, [onError]);

  return {
    visible,
    authUrl,
    startAuth,
    handleSuccess,
    handleCancel,
    handleError,
    isLoading,
  };
}

export default useOAuthModal;
