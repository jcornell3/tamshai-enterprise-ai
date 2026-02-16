/**
 * Playwright Global Setup - User Verification & Credential Provisioning
 *
 * Ensures test-user.journey exists with password and TOTP configured.
 * Writes the Base32-encoded TOTP secret to a cache file for oathtool/otplib.
 *
 * IMPORTANT: This setup does NOT delete or recreate the test-user.journey account.
 * It preserves the stable Keycloak user ID that the HR database references.
 * However, it WILL provision missing credentials (password, TOTP) idempotently.
 *
 * TEST_USER_TOTP_SECRET can be provided in either format:
 *   - Base32-encoded (A-Z, 2-7, =) — e.g. from `echo -n "$RAW" | base32`
 *   - Raw plaintext — the string Keycloak stores in secretData.value
 *
 * When credentials are set (CI/CD or local with env var):
 *   - Auto-detects whether TOTP secret is Base32 or raw
 *   - Verifies test-user.journey exists in Keycloak (fails if not found)
 *   - Provisions password if missing
 *   - Provisions TOTP credential if missing
 *   - Writes the Base32 value to .totp-secrets/ cache file for oathtool/otplib
 *
 * When credentials are NOT set:
 *   - Throws an error (credentials required for E2E tests)
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const ENV = process.env.TEST_ENV || 'dev';
const REALM = 'tamshai-corp';

const PORT_CADDY_HTTPS = process.env.PORT_CADDY_HTTPS;

const KEYCLOAK_URLS: Record<string, string> = {
  dev: `https://www.tamshai.local:${PORT_CADDY_HTTPS}/auth`,
  stage: 'https://www.tamshai.com/auth',
  prod: 'https://keycloak-fn44nd7wba-uc.a.run.app/auth',
};

/**
 * Ensure the Keycloak base URL ends with /auth (context path).
 * Idempotent: normalizeKeycloakUrl('.../auth') === '.../auth'
 */
function normalizeKeycloakUrl(url: string): string {
  const stripped = url.replace(/\/+$/, '');
  return stripped.endsWith('/auth') ? stripped : `${stripped}/auth`;
}

// Directory for persisting TOTP secrets per environment (shared with login-journey.ui.spec.ts)
const TOTP_SECRETS_DIR = path.join(__dirname, '.totp-secrets');

// HTTPS agent: only disable cert validation for dev (self-signed certs)
const httpsAgent = new https.Agent({
  rejectUnauthorized: ENV !== 'dev',
});

/**
 * RFC 4648 Base32 encoder (A-Z, 2-7 alphabet).
 *
 * Keycloak stores the raw TOTP secret string in secretData.value and uses
 * its UTF-8 bytes as the HMAC key. otplib's authenticator.generate() Base32-
 * decodes the input before using it as the HMAC key. To bridge this gap,
 * we Base32-encode the UTF-8 bytes of the stored secret so that otplib's
 * Base32-decode produces the same bytes Keycloak uses.
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f];
  }

  // Pad to multiple of 8
  while (result.length % 8 !== 0) {
    result += '=';
  }

  return result;
}

/**
 * Check if a string is valid Base32 (RFC 4648: A-Z, 2-7, optional = padding).
 * Returns false for raw secrets that contain lowercase letters, digits 0/1/8/9, or
 * other characters outside the Base32 alphabet.
 */
function isBase32(value: string): boolean {
  return /^[A-Z2-7]+=*$/.test(value) && value.length >= 8;
}

/**
 * RFC 4648 Base32 decoder (A-Z, 2-7 alphabet).
 * Returns the decoded bytes as a UTF-8 string.
 */
function base32Decode(encoded: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const stripped = encoded.replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of stripped) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) throw new Error(`Invalid Base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(bytes).toString('utf-8');
}

/**
 * Save the computed TOTP secret to the cache file so the test spec can read it.
 */
function saveTotpSecretToCache(username: string, environment: string, secret: string): void {
  try {
    if (!fs.existsSync(TOTP_SECRETS_DIR)) {
      fs.mkdirSync(TOTP_SECRETS_DIR, { recursive: true });
    }
    const secretFile = path.join(TOTP_SECRETS_DIR, `${username}-${environment}.secret`);
    fs.writeFileSync(secretFile, secret, 'utf-8');
    console.log('[globalSetup] Saved TOTP cache file successfully');
  } catch (error: any) {
    console.warn(`[globalSetup] Failed to save TOTP cache: ${error.message}`);
  }
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
 * Verify test-user.journey exists in Keycloak and has TOTP configured.
 *
 * IMPORTANT: This function does NOT delete or recreate the user.
 * It preserves the stable Keycloak user ID that the HR database references.
 * However, it WILL provision TOTP if missing (idempotent credential setup).
 */
async function verifyAndProvisionUser(
  keycloakUrl: string,
  totpSecret: string,
  userPassword: string
): Promise<void> {
  const adminClientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

  // 1. Authenticate to Admin API (prefer client credentials over ROPC)
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

  const auth = { Authorization: `Bearer ${tokenRes.data.access_token}` };

  // 2. Verify user exists (DO NOT delete or recreate)
  const usersRes = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/users?username=test-user.journey&exact=true`,
    { headers: auth }
  );

  if (!usersRes.data?.length) {
    throw new Error(
      'test-user.journey not found in Keycloak. ' +
      'The user must be pre-provisioned in realm-export-dev.json or via sync-realm.sh. ' +
      'Run: ./keycloak/scripts/docker-sync-realm.sh dev'
    );
  }

  const user = usersRes.data[0];
  console.log(`[globalSetup] Verified test-user.journey exists (id: ${user.id})`);

  // 3. Check if TOTP credential exists
  const credentialsRes = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/users/${user.id}/credentials`,
    { headers: auth }
  );

  const credentials = Array.isArray(credentialsRes.data) ? credentialsRes.data : [];
  const hasTotp = credentials.some((c: any) => c.type === 'otp');
  const hasPassword = credentials.some((c: any) => c.type === 'password');

  // 4. Provision password if missing
  if (!hasPassword) {
    console.log('[globalSetup] Password not set, provisioning...');
    const pwRes = await jsonRequest(
      `${keycloakUrl}/admin/realms/${REALM}/users/${user.id}/reset-password`,
      {
        method: 'PUT',
        headers: auth,
        body: { type: 'password', value: userPassword, temporary: false },
      }
    );
    if (pwRes.status !== 204 && pwRes.status !== 200) {
      throw new Error(`Failed to set password (HTTP ${pwRes.status})`);
    }
    console.log('[globalSetup] Password provisioned');
  }

  // 5. Provision TOTP if missing (preserves user ID)
  if (!hasTotp) {
    console.log('[globalSetup] TOTP not configured, provisioning...');

    // Delete existing OTP credentials (if any partial state)
    for (const cred of credentials.filter((c: any) => c.type === 'otp')) {
      await jsonRequest(
        `${keycloakUrl}/admin/realms/${REALM}/users/${user.id}/credentials/${cred.id}`,
        { method: 'DELETE', headers: auth }
      );
    }

    // Add TOTP credential via the credentials endpoint
    // Keycloak Admin API doesn't have a direct "add OTP" endpoint, so we use
    // the user update with credentials array via partial import (SKIP policy)
    const importData = {
      ifResourceExists: 'SKIP', // Don't modify user, just add credentials
      users: [
        {
          id: user.id,
          username: 'test-user.journey',
          credentials: [
            {
              type: 'otp',
              userLabel: 'E2E Test Authenticator',
              secretData: JSON.stringify({ value: totpSecret }),
              credentialData: JSON.stringify({
                subType: 'totp',
                digits: 6,
                period: 30,
                algorithm: 'HmacSHA1',
                counter: 0,
              }),
            },
          ],
        },
      ],
    };

    const importRes = await jsonRequest(
      `${keycloakUrl}/admin/realms/${REALM}/partialImport`,
      { method: 'POST', headers: auth, body: importData }
    );

    // SKIP means the user won't be modified, but credentials should be added
    // Check if we have any results
    if (importRes.status !== 200) {
      throw new Error(`Partial Import failed (HTTP ${importRes.status}): ${JSON.stringify(importRes.data)}`);
    }

    console.log('[globalSetup] TOTP credential provisioned');

    // Remove CONFIGURE_TOTP from required actions
    await jsonRequest(`${keycloakUrl}/admin/realms/${REALM}/users/${user.id}`, {
      method: 'PUT',
      headers: auth,
      body: { requiredActions: [] },
    });
  } else {
    console.log('[globalSetup] TOTP credential already configured');
  }
}

/**
 * Playwright globalSetup entry point
 *
 * Verifies test-user.journey exists and provisions credentials if missing.
 * Does NOT delete/recreate the user - preserves stable Keycloak user ID.
 *
 * Handles TEST_USER_TOTP_SECRET in either format:
 *
 * If Base32 (e.g. "PA3GCULJJJVG2Y3MG42WS4BQIJSFMSDF"):
 *   - Decodes to raw for Keycloak secretData
 *   - Writes Base32 directly to cache file
 *
 * If raw (e.g. "x6aQiJjmcl75ip0BdVHe"):
 *   - Uses raw directly for Keycloak secretData
 *   - Base32-encodes for cache file (bridge for oathtool/otplib)
 */
export default async function globalSetup(): Promise<void> {
  const totpSecret = process.env.TEST_USER_TOTP_SECRET;
  const password = process.env.TEST_USER_PASSWORD;

  if (!totpSecret || !password) {
    throw new Error(
      '[globalSetup] TEST_USER_TOTP_SECRET or TEST_USER_PASSWORD not set.\n' +
      'Run: eval $(./scripts/secrets/read-github-secrets.sh --e2e --env)\n' +
      'Or populate tests/e2e/.env (see .env.example)'
    );
  }

  // Allow CI or custom environments to override the Keycloak URL via env var.
  // Normalize to ensure /auth context path is present (idempotent).
  const rawKeycloakUrl = process.env.KEYCLOAK_URL || KEYCLOAK_URLS[ENV];
  const keycloakUrl = rawKeycloakUrl ? normalizeKeycloakUrl(rawKeycloakUrl) : undefined;
  if (!keycloakUrl) {
    console.log(`[globalSetup] Unknown environment: ${ENV} and no KEYCLOAK_URL set — skipping`);
    return;
  }

  // Detect format: Base32-encoded or raw plaintext
  // Base32 alphabet is A-Z, 2-7 with = padding — raw secrets typically
  // contain lowercase letters, digits 0/1/8/9, or special characters.
  let rawSecret: string;
  let base32Secret: string;

  if (isBase32(totpSecret)) {
    base32Secret = totpSecret;
    rawSecret = base32Decode(totpSecret);
    console.log(
      `[globalSetup] Detected Base32 TEST_USER_TOTP_SECRET — decoded to raw for Keycloak`
    );
  } else {
    rawSecret = totpSecret;
    base32Secret = base32Encode(Buffer.from(totpSecret, 'utf-8'));
    console.log(
      `[globalSetup] Detected raw TEST_USER_TOTP_SECRET — encoded to Base32 for cache`
    );
  }

  console.log(
    `[globalSetup] Verifying test-user.journey exists (${ENV})`
  );

  try {
    // Verify user exists and provision credentials if missing (preserves user ID)
    await verifyAndProvisionUser(keycloakUrl, rawSecret, password);

    // Write the Base32 value to the cache file for oathtool/otplib
    const username = process.env.TEST_USERNAME || 'test-user.journey';
    saveTotpSecretToCache(username, ENV, base32Secret);
    console.log(`[globalSetup] Cache file written with Base32 value`);
  } catch (error: any) {
    console.error(`[globalSetup] Setup failed: ${error.message}`);
    throw new Error(
      `User setup failed for test-user.journey. ` +
      `Keycloak may be unreachable at ${keycloakUrl}. ` +
      `Original error: ${error.message}`
    );
  }
}
