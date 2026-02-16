/**
 * Playwright Global Setup - TOTP Verification & Cache
 *
 * Verifies test-user.journey exists with TOTP configured and writes the
 * Base32-encoded secret to a cache file for oathtool/otplib to generate codes.
 *
 * IMPORTANT: This setup does NOT create or modify the test-user.journey account.
 * The user must already exist in Keycloak with TOTP configured. This preserves
 * the stable Keycloak user ID that the HR database references.
 *
 * TEST_USER_TOTP_SECRET can be provided in either format:
 *   - Base32-encoded (A-Z, 2-7, =) — e.g. from `echo -n "$RAW" | base32`
 *   - Raw plaintext — the string Keycloak stores in secretData.value
 *
 * When TEST_USER_TOTP_SECRET is set (CI/CD or local with env var):
 *   - Auto-detects whether the value is Base32 or raw
 *   - Verifies test-user.journey exists in Keycloak (fails if not found)
 *   - Writes the Base32 value to .totp-secrets/ cache file for oathtool/otplib
 *
 * When TEST_USER_TOTP_SECRET is NOT set:
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
 * Verify test-user.journey exists in Keycloak.
 *
 * IMPORTANT: This function does NOT create, modify, or delete the user.
 * The user must already exist in Keycloak with TOTP configured.
 * This preserves the stable Keycloak user ID that the HR database references.
 */
async function verifyUserExists(keycloakUrl: string): Promise<void> {
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

  // 3. Verify TOTP credential exists (read-only check)
  const credentialsRes = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/users/${user.id}/credentials`,
    { headers: auth }
  );

  const credentials = Array.isArray(credentialsRes.data) ? credentialsRes.data : [];
  const hasTotp = credentials.some((c: any) => c.type === 'otp');

  if (!hasTotp) {
    throw new Error(
      'test-user.journey exists but has no TOTP credential configured. ' +
      'Re-provision the user via realm-export-dev.json or manually add TOTP. ' +
      'The TOTP secret must match TEST_USER_TOTP_SECRET.'
    );
  }

  console.log('[globalSetup] TOTP credential verified');
}

/**
 * Playwright globalSetup entry point
 *
 * Verifies test-user.journey exists with TOTP, then writes the secret to cache.
 *
 * Handles TEST_USER_TOTP_SECRET in either format:
 *
 * If Base32 (e.g. "PA3GCULJJJVG2Y3MG42WS4BQIJSFMSDF"):
 *   - Writes Base32 directly to cache file (no re-encoding)
 *
 * If raw (e.g. "x6aQiJjmcl75ip0BdVHe"):
 *   - Base32-encodes for cache file (bridge for oathtool/otplib)
 */
export default async function globalSetup(): Promise<void> {
  const totpSecret = process.env.TEST_USER_TOTP_SECRET;

  if (!totpSecret) {
    throw new Error(
      '[globalSetup] TEST_USER_TOTP_SECRET not set.\n' +
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
    // Verify user exists (read-only - no modification)
    await verifyUserExists(keycloakUrl);

    // Write the Base32 value to the cache file for oathtool/otplib
    const username = process.env.TEST_USERNAME || 'test-user.journey';
    saveTotpSecretToCache(username, ENV, base32Secret);
    console.log(`[globalSetup] Cache file written with Base32 value`);
  } catch (error: any) {
    console.error(`[globalSetup] Verification failed: ${error.message}`);
    throw new Error(
      `User verification failed for test-user.journey. ` +
      `Keycloak may be unreachable at ${keycloakUrl}. ` +
      `Original error: ${error.message}`
    );
  }
}
