/**
 * Keycloak Role Management Utilities for E2E Tests
 *
 * Provides functions to temporarily grant/revoke roles for test users.
 * Used by tests that need elevated permissions (e.g., executive access).
 *
 * Architecture v1.5 - E2E Test Role Management
 */

import * as https from 'https';
import * as http from 'http';

const ENV = process.env.TEST_ENV || 'dev';
const REALM = 'tamshai-corp';

/**
 * Mask username for logging to avoid clear-text PII exposure.
 * Shows first 3 characters followed by asterisks.
 */
function maskUsername(username: string): string {
  if (username.length <= 3) return '***';
  return `${username.substring(0, 3)}***`;
}

const PORT_CADDY_HTTPS = process.env.PORT_CADDY_HTTPS;

const KEYCLOAK_URLS: Record<string, string> = {
  dev: `https://www.tamshai.local:${PORT_CADDY_HTTPS}/auth`,
  stage: 'https://www.tamshai.com/auth',
  prod: 'https://keycloak-fn44nd7wba-uc.a.run.app/auth',
};

// HTTPS agent: only disable cert validation for dev (self-signed certs)
const httpsAgent = new https.Agent({
  rejectUnauthorized: ENV !== 'dev',
});

/**
 * Normalize Keycloak URL for the current environment.
 */
function normalizeKeycloakUrl(url: string): string {
  const stripped = url.replace(/\/+$/, '');
  if (process.env.CI) {
    return stripped;
  }
  return stripped.endsWith('/auth') ? stripped : `${stripped}/auth`;
}

/**
 * Low-level HTTP request with self-signed cert support
 */
function makeRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
        ...(isHttps ? { agent: httpsAgent } : {}),
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      }
    );

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * JSON-aware HTTP request helper
 */
async function jsonRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    formBody?: string;
  } = {}
): Promise<{ status: number; data: any }> {
  const headers = { ...options.headers };
  let bodyStr: string | undefined;

  if (options.formBody) {
    bodyStr = options.formBody;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(options.body);
  }

  const res = await makeRequest(url, {
    method: options.method,
    headers,
    body: bodyStr,
  });

  let data: any;
  try {
    data = JSON.parse(res.body);
  } catch {
    data = res.body;
  }

  return { status: res.status, data };
}

/**
 * Get admin access token for Keycloak Admin API
 */
async function getAdminToken(keycloakUrl: string): Promise<string> {
  const adminClientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

  const formBody = adminClientSecret
    ? `grant_type=client_credentials&client_id=admin-cli&client_secret=${encodeURIComponent(adminClientSecret)}`
    : `grant_type=password&client_id=admin-cli&username=admin&password=${encodeURIComponent(adminPassword)}`;

  const tokenRes = await jsonRequest(
    `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      formBody,
    }
  );

  if (tokenRes.status !== 200 || !tokenRes.data?.access_token) {
    throw new Error(`Admin authentication failed (HTTP ${tokenRes.status})`);
  }

  return tokenRes.data.access_token;
}

/**
 * Get user ID by username
 */
async function getUserId(
  keycloakUrl: string,
  token: string,
  username: string
): Promise<string> {
  const res = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.data?.length) {
    throw new Error(`User '${username}' not found in Keycloak`);
  }

  return res.data[0].id;
}

/**
 * Get realm role by name
 */
async function getRealmRole(
  keycloakUrl: string,
  token: string,
  roleName: string
): Promise<{ id: string; name: string }> {
  const res = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/roles/${encodeURIComponent(roleName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status !== 200) {
    throw new Error(`Role '${roleName}' not found (HTTP ${res.status})`);
  }

  return { id: res.data.id, name: res.data.name };
}

/**
 * Grant a realm role to a user
 *
 * @param username - The username to grant the role to
 * @param roleName - The realm role name (e.g., 'executive')
 */
export async function grantRealmRole(
  username: string,
  roleName: string
): Promise<void> {
  const rawKeycloakUrl = process.env.KEYCLOAK_URL || KEYCLOAK_URLS[ENV];
  const keycloakUrl = normalizeKeycloakUrl(rawKeycloakUrl);

  const token = await getAdminToken(keycloakUrl);
  const userId = await getUserId(keycloakUrl, token, username);
  const role = await getRealmRole(keycloakUrl, token, roleName);

  const res = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/users/${userId}/role-mappings/realm`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: [{ id: role.id, name: role.name }],
    }
  );

  if (res.status !== 204 && res.status !== 200) {
    throw new Error(`Failed to grant role '${roleName}' to '${username}' (HTTP ${res.status})`);
  }

  console.log(`[roles] Granted '${roleName}' role to '${maskUsername(username)}'`);
}

/**
 * Revoke a realm role from a user
 *
 * @param username - The username to revoke the role from
 * @param roleName - The realm role name (e.g., 'executive')
 */
export async function revokeRealmRole(
  username: string,
  roleName: string
): Promise<void> {
  const rawKeycloakUrl = process.env.KEYCLOAK_URL || KEYCLOAK_URLS[ENV];
  const keycloakUrl = normalizeKeycloakUrl(rawKeycloakUrl);

  const token = await getAdminToken(keycloakUrl);
  const userId = await getUserId(keycloakUrl, token, username);
  const role = await getRealmRole(keycloakUrl, token, roleName);

  const res = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/users/${userId}/role-mappings/realm`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      body: [{ id: role.id, name: role.name }],
    }
  );

  if (res.status !== 204 && res.status !== 200) {
    throw new Error(`Failed to revoke role '${roleName}' from '${username}' (HTTP ${res.status})`);
  }

  console.log(`[roles] Revoked '${roleName}' role from '${maskUsername(username)}'`);
}

/**
 * Get all realm roles assigned to a user
 *
 * @param username - The username to check
 * @returns Array of role names
 */
export async function getUserRealmRoles(username: string): Promise<string[]> {
  const rawKeycloakUrl = process.env.KEYCLOAK_URL || KEYCLOAK_URLS[ENV];
  const keycloakUrl = normalizeKeycloakUrl(rawKeycloakUrl);

  const token = await getAdminToken(keycloakUrl);
  const userId = await getUserId(keycloakUrl, token, username);

  const res = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/users/${userId}/role-mappings/realm`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status !== 200) {
    throw new Error(`Failed to get roles for '${username}' (HTTP ${res.status})`);
  }

  return (res.data || []).map((r: any) => r.name);
}
