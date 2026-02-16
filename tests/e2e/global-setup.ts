/**
 * Playwright Global Setup - TOTP Provisioning
 *
 * Ensures test-user.journey has TOTP configured with the known secret from
 * TEST_USER_TOTP_SECRET before any E2E tests run. Uses the Keycloak Admin API
 * + Partial Import to provision the credential.
 *
 * TEST_USER_TOTP_SECRET can be provided in either format:
 *   - Base32-encoded (A-Z, 2-7, =) — e.g. from `echo -n "$RAW" | base32`
 *   - Raw plaintext — the string Keycloak stores in secretData.value
 *
 * When TEST_USER_TOTP_SECRET is set (CI/CD or local with env var):
 *   - Auto-detects whether the value is Base32 or raw
 *   - Stores the RAW secret in Keycloak's secretData.value
 *   - Writes the Base32 value to .totp-secrets/ cache file for oathtool/otplib
 *   - Deletes and recreates test-user.journey with known TOTP secret
 *   - Reassigns groups (All-Employees, C-Suite)
 *   - Removes CONFIGURE_TOTP required action
 *
 * When TEST_USER_TOTP_SECRET is NOT set:
 *   - Does nothing (tests fall back to auto-capture + cached file)
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
 * Provision TOTP for test-user.journey using Keycloak Partial Import API.
 *
 * Strategy: delete existing user → recreate with known TOTP secret → reassign groups.
 * This is the same approach used by keycloak/scripts/reset-test-user-totp.py.
 */
async function provisionTotp(
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

  // 2. Delete existing user if present
  // Always recreate to guarantee the TOTP secret matches the env var.
  // We can't read the existing OTP secret back from the Admin API, so we can't
  // verify it matches. A previous auto-capture may have set a different secret.
  const usersRes = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/users?username=test-user.journey&exact=true`,
    { headers: auth }
  );

  if (usersRes.data?.length > 0) {
    const userId = usersRes.data[0].id;
    console.log('[globalSetup] Deleting test-user.journey to recreate with known TOTP...');
    const deleteRes = await jsonRequest(`${keycloakUrl}/admin/realms/${REALM}/users/${userId}`, {
      method: 'DELETE',
      headers: auth,
    });
    if (deleteRes.status !== 204 && deleteRes.status !== 200) {
      console.warn(`[globalSetup] DELETE returned HTTP ${deleteRes.status} — proceeding with OVERWRITE`);
    }
    // Brief delay to let Keycloak flush the deletion
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 3. Create user with TOTP via Partial Import
  // Keycloak stores OTP credentials with JSON-encoded secretData and credentialData.
  // secretData.value is stored as-is; Keycloak uses value.getBytes(UTF-8) as HMAC key.
  // We store the env var string directly, then compute the matching Base32 for otplib.
  const importData = {
    ifResourceExists: 'OVERWRITE',
    users: [
      {
        username: 'test-user.journey',
        email: 'test-user@tamshai.com',
        firstName: 'Test',
        lastName: 'Journey',
        enabled: true,
        emailVerified: true,
        attributes: {
          department: ['Testing'],
          employeeId: ['TEST001'],
          title: ['Journey Test Account'],
        },
        credentials: [
          { type: 'password', value: userPassword, temporary: false },
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

  const added = importRes.data?.added ?? 0;
  const overwritten = importRes.data?.overwritten ?? 0;
  if (importRes.status !== 200 || (added === 0 && overwritten === 0)) {
    throw new Error(
      `Partial Import failed (HTTP ${importRes.status}): ${JSON.stringify(importRes.data)}`
    );
  }

  console.log('[globalSetup] User created with known TOTP secret');

  // 4. Get the newly created user ID
  const newUsersRes = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/users?username=test-user.journey&exact=true`,
    { headers: auth }
  );

  if (!newUsersRes.data?.length) {
    throw new Error('User not found after Partial Import');
  }

  const newUserId = newUsersRes.data[0].id;

  // 5. Remove CONFIGURE_TOTP from required actions (Partial Import may add it)
  await jsonRequest(`${keycloakUrl}/admin/realms/${REALM}/users/${newUserId}`, {
    method: 'PUT',
    headers: auth,
    body: { requiredActions: [] },
  });

  // 6. Reassign groups (All-Employees + C-Suite, matching realm-export-dev.json)
  const groupsRes = await jsonRequest(
    `${keycloakUrl}/admin/realms/${REALM}/groups`,
    { headers: auth }
  );

  const groups = Array.isArray(groupsRes.data) ? groupsRes.data : [];
  const targetGroups = ['All-Employees', 'C-Suite'];

  for (const groupName of targetGroups) {
    const group = groups.find((g: any) => g.name === groupName);
    if (group) {
      await jsonRequest(
        `${keycloakUrl}/admin/realms/${REALM}/users/${newUserId}/groups/${group.id}`,
        { method: 'PUT', headers: auth, body: {} }
      );
      console.log(`[globalSetup] Assigned to ${groupName} group`);
    }
  }

  console.log('[globalSetup] TOTP provisioning complete');
}

/**
 * Playwright globalSetup entry point
 *
 * Handles TEST_USER_TOTP_SECRET in either format:
 *
 * If Base32 (e.g. "PA3GCULJJJVG2Y3MG42WS4BQIJSFMSDF"):
 *   - Decodes to raw for Keycloak secretData.value
 *   - Writes Base32 directly to cache file (no re-encoding)
 *
 * If raw (e.g. "x6aQiJjmcl75ip0BdVHe"):
 *   - Stores raw directly in Keycloak secretData.value
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
    `[globalSetup] Ensuring TOTP for test-user.journey (${ENV}, secret: [REDACTED])`
  );

  try {
    // Store the RAW secret in Keycloak (Keycloak uses raw UTF-8 bytes as HMAC key)
    await provisionTotp(keycloakUrl, rawSecret, password);

    // Write the Base32 value to the cache file for oathtool/otplib
    const username = process.env.TEST_USERNAME || 'test-user.journey';
    saveTotpSecretToCache(username, ENV, base32Secret);
    console.log(`[globalSetup] Cache file written with Base32 value`);
  } catch (error: any) {
    // Credentials were explicitly provided — provisioning MUST succeed
    console.error(`[globalSetup] TOTP provisioning failed: ${error.message}`);
    throw new Error(
      `TOTP provisioning failed for test-user.journey. ` +
      `Keycloak may be unreachable at ${keycloakUrl}. ` +
      `Original error: ${error.message}`
    );
  }
}
