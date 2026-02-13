/**
 * k6 Token Exchange Authentication Module
 *
 * Replaces ROPC (password grant) with OAuth 2.0 token exchange for performance tests.
 * Uses a two-step flow:
 *   1. Client credentials grant → service account token
 *   2. Token exchange → impersonated user token
 *
 * Supports two modes:
 *   - Inline token exchange (default): Acquires tokens via HTTP during test
 *   - Pre-generated tokens (TOKENS_FILE): Loads tokens from JSON file (for CI/long tests)
 *
 * @see .claude/plans/test-auth-refactoring.md - Phase 3
 */

import http from 'k6/http';

// Configuration
const KEYCLOAK_URL = __ENV.KEYCLOAK_URL;
const KEYCLOAK_REALM = __ENV.KEYCLOAK_REALM || 'tamshai-corp';
const CLIENT_ID = __ENV.MCP_INTEGRATION_RUNNER_CLIENT_ID || 'mcp-integration-runner';
const CLIENT_SECRET = __ENV.MCP_INTEGRATION_RUNNER_SECRET || '';

// Pre-generated tokens (loaded at init time if TOKENS_FILE is set)
let preGeneratedTokens = null;
if (__ENV.TOKENS_FILE) {
  try {
    const data = open(__ENV.TOKENS_FILE);
    preGeneratedTokens = JSON.parse(data);
    console.log(`[AUTH] Loaded ${Object.keys(preGeneratedTokens).length} pre-generated tokens from ${__ENV.TOKENS_FILE}`);
  } catch (e) {
    console.warn(`[AUTH] Failed to load tokens from ${__ENV.TOKENS_FILE}: ${e.message}`);
  }
}

// Per-VU token cache
let serviceToken = null;
let serviceTokenExpiry = 0;
let userTokenCache = {};

/**
 * Get service account token via client credentials grant.
 * Cached per VU with 30s expiry buffer.
 */
function getServiceToken() {
  const now = Date.now();
  if (serviceToken && serviceTokenExpiry > now + 30000) {
    return serviceToken;
  }

  if (!CLIENT_SECRET) {
    console.warn('[AUTH] MCP_INTEGRATION_RUNNER_SECRET not set - cannot acquire tokens');
    return null;
  }

  const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

  const response = http.post(
    tokenUrl,
    {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    },
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      tags: { name: 'auth-service-token' },
    }
  );

  if (response.status === 200) {
    try {
      const data = JSON.parse(response.body);
      serviceToken = data.access_token;
      serviceTokenExpiry = now + (data.expires_in * 1000);
      return serviceToken;
    } catch {
      return null;
    }
  }

  console.warn(`[AUTH] Service token request failed: ${response.status}`);
  return null;
}

/**
 * Get user token via token exchange.
 * Cached per VU per username with 30s expiry buffer.
 *
 * If TOKENS_FILE is set and contains the username, returns pre-generated token.
 *
 * @param {string} username - Keycloak username to impersonate (e.g., 'alice.chen')
 * @returns {string|null} Access token or null if unavailable
 */
export function getAccessToken(username) {
  username = username || 'alice.chen';

  // Mode 1: Pre-generated tokens
  if (preGeneratedTokens && preGeneratedTokens[username]) {
    return preGeneratedTokens[username];
  }

  // Mode 2: Inline token exchange
  const now = Date.now();
  const cached = userTokenCache[username];
  if (cached && cached.expiry > now + 30000) {
    return cached.token;
  }

  const svcToken = getServiceToken();
  if (!svcToken) {
    return null;
  }

  const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

  const response = http.post(
    tokenUrl,
    {
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      subject_token: svcToken,
      requested_subject: username,
      audience: 'mcp-gateway',
    },
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      tags: { name: 'auth-token-exchange' },
    }
  );

  if (response.status === 200) {
    try {
      const data = JSON.parse(response.body);
      userTokenCache[username] = {
        token: data.access_token,
        expiry: now + (data.expires_in * 1000),
      };
      return data.access_token;
    } catch {
      return null;
    }
  }

  console.warn(`[AUTH] Token exchange failed for ${username}: ${response.status}`);
  return null;
}

/**
 * Clear cached tokens (call between test phases if needed).
 */
export function clearTokenCache() {
  serviceToken = null;
  serviceTokenExpiry = 0;
  userTokenCache = {};
}
