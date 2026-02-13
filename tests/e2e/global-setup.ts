/**
 * Playwright Global Setup - TOTP Provisioning
 *
 * Ensures test-user.journey has TOTP configured with the known secret from
 * TEST_USER_TOTP_SECRET before any E2E tests run. Uses the Keycloak Admin API
 * + Partial Import to provision the credential.
 *
 * When TEST_USER_TOTP_SECRET is set (CI/CD or local with env var):
 *   - Deletes and recreates test-user.journey with known TOTP secret
 *   - Reassigns groups (All-Employees, C-Suite)
 *   - Removes CONFIGURE_TOTP required action
 *   - Writes Base32-encoded bridge value to .totp-secrets/ cache file
 *   - Tests read the cache file (not raw env var) for TOTP code generation
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

const KEYCLOAK_URLS: Record<string, string> = {
  dev: 'https://www.tamshai-playground.local:8443/auth',
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
    await jsonRequest(`${keycloakUrl}/admin/realms/${REALM}/users/${userId}`, {
      method: 'DELETE',
      headers: auth,
    });
  }

  // 3. Create user with TOTP via Partial Import
  // Keycloak stores OTP credentials with JSON-encoded secretData and credentialData.
  // secretData.value is stored as-is; Keycloak uses value.getBytes(UTF-8) as HMAC key.
  // We store the env var string directly, then compute the matching Base32 for otplib.
  const importData = {
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

  if (importRes.status !== 200 || !(importRes.data?.added > 0)) {
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
 * Encoding bridge for TOTP:
 * - Stores totpSecret (env var) directly in Keycloak's secretData.value
 * - Keycloak uses value.getBytes(UTF-8) as HMAC key
 * - Computes Base32(Buffer.from(totpSecret, 'utf8')) and saves to cache file
 * - Test reads cache file → authenticator.generate(cached) → Base32.decode → same UTF-8 bytes
 * - This means the TOTP codes match regardless of what string the env var contains
 */
export default async function globalSetup(): Promise<void> {
  const totpSecret = process.env.TEST_USER_TOTP_SECRET;
  const password = process.env.TEST_USER_PASSWORD;

  if (!totpSecret || !password) {
    console.log(
      '[globalSetup] TEST_USER_TOTP_SECRET or TEST_USER_PASSWORD not set — skipping TOTP provisioning'
    );
    console.log(
      '[globalSetup] Tests will use auto-capture + cached file for TOTP'
    );
    return;
  }

  // Allow CI or custom environments to override the Keycloak URL via env var.
  // Normalize to ensure /auth context path is present (idempotent).
  const rawKeycloakUrl = process.env.KEYCLOAK_URL || KEYCLOAK_URLS[ENV];
  const keycloakUrl = rawKeycloakUrl ? normalizeKeycloakUrl(rawKeycloakUrl) : undefined;
  if (!keycloakUrl) {
    console.log(`[globalSetup] Unknown environment: ${ENV} and no KEYCLOAK_URL set — skipping`);
    return;
  }

  console.log(
    `[globalSetup] Ensuring TOTP for test-user.journey (${ENV}, secret: [REDACTED])`
  );

  try {
    await provisionTotp(keycloakUrl, totpSecret, password);

    // Write the Base32-encoded UTF-8 bytes to the cache file.
    // This bridges the encoding gap between Keycloak and otplib:
    //   Keycloak HMAC key = totpSecret.getBytes(UTF-8)
    //   otplib HMAC key   = Base32.decode(cacheValue)
    // By setting cacheValue = Base32.encode(totpSecret as UTF-8 bytes),
    // Base32.decode(cacheValue) === totpSecret.getBytes(UTF-8) → codes match.
    const username = process.env.TEST_USERNAME || 'test-user.journey';
    const base32ForOtplib = base32Encode(Buffer.from(totpSecret, 'utf-8'));
    saveTotpSecretToCache(username, ENV, base32ForOtplib);
    console.log(`[globalSetup] Base32 bridge: [REDACTED] → [REDACTED]`);
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
