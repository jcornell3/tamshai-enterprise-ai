/**
 * Shared Keycloak Admin API Utilities
 *
 * Provides stateless functions for Keycloak admin operations used by
 * both integration test setups (jest.setup and gateway setup.ts).
 *
 * All functions accept an admin token and config — no module-level state.
 *
 * @example
 * ```typescript
 * import { getKeycloakAdminToken, getUserId, prepareTestUsers } from '../../shared/auth/keycloak-admin';
 *
 * const token = await getKeycloakAdminToken(config);
 * const userId = await getUserId(token, config, 'alice.chen');
 * ```
 */

import axios from 'axios';

export interface KeycloakAdminConfig {
  url: string;   // Keycloak base URL (e.g., http://127.0.0.1:8180/auth)
  realm: string; // Realm name (e.g., tamshai-corp)
}

export interface KeycloakCredential {
  type: string;
  id: string;
}

export interface KeycloakUser {
  id: string;
  username: string;
  requiredActions: string[];
}

export interface SavedUserState {
  userId: string;
  requiredActions: string[];
  hasOtpCredential: boolean;
}

/**
 * Get admin token from Keycloak master realm.
 * Prefers client credentials (KEYCLOAK_ADMIN_CLIENT_SECRET) over ROPC.
 */
export async function getKeycloakAdminToken(config: KeycloakAdminConfig): Promise<string> {
  const tokenUrl = `${config.url}/realms/master/protocol/openid-connect/token`;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;

  if (clientSecret) {
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        client_id: 'admin-cli',
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
  }

  if (!adminPassword) {
    throw new Error('KEYCLOAK_ADMIN_CLIENT_SECRET or KEYCLOAK_ADMIN_PASSWORD environment variable is required');
  }

  const response = await axios.post(
    tokenUrl,
    new URLSearchParams({
      client_id: 'admin-cli',
      username: 'admin',
      password: adminPassword,
      grant_type: 'password',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data.access_token;
}

/**
 * Get user ID by username
 */
export async function getUserId(
  adminToken: string,
  config: KeycloakAdminConfig,
  username: string,
): Promise<string | null> {
  const response = await axios.get<KeycloakUser[]>(
    `${config.url}/admin/realms/${config.realm}/users`,
    {
      params: { username },
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );
  return response.data[0]?.id || null;
}

/**
 * Get user details
 */
export async function getUser(
  adminToken: string,
  config: KeycloakAdminConfig,
  userId: string,
): Promise<KeycloakUser> {
  const response = await axios.get<KeycloakUser>(
    `${config.url}/admin/realms/${config.realm}/users/${userId}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  return response.data;
}

/**
 * Get user's credentials
 */
export async function getUserCredentials(
  adminToken: string,
  config: KeycloakAdminConfig,
  userId: string,
): Promise<KeycloakCredential[]> {
  const response = await axios.get<KeycloakCredential[]>(
    `${config.url}/admin/realms/${config.realm}/users/${userId}/credentials`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  return response.data;
}

/**
 * Update user's required actions
 */
export async function updateUserRequiredActions(
  adminToken: string,
  config: KeycloakAdminConfig,
  userId: string,
  requiredActions: string[],
): Promise<void> {
  await axios.put(
    `${config.url}/admin/realms/${config.realm}/users/${userId}`,
    { requiredActions },
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Prepare test users for automated testing (parallelized).
 *
 * Temporarily removes CONFIGURE_TOTP from required actions.
 * Does NOT delete OTP credentials.
 *
 * @returns Map of username → saved state for restoration
 */
export async function prepareTestUsers(
  adminToken: string,
  config: KeycloakAdminConfig,
  usernames: string[],
): Promise<Record<string, SavedUserState>> {
  const savedState: Record<string, SavedUserState> = {};

  const results = await Promise.all(
    usernames.map(async (username) => {
      try {
        const userId = await getUserId(adminToken, config, username);
        if (!userId) {
          return `\u26a0\ufe0f  User ${username} not found, skipping`;
        }

        const user = await getUser(adminToken, config, userId);
        const currentActions = user.requiredActions || [];

        const credentials = await getUserCredentials(adminToken, config, userId);
        const hasOtpCredential = credentials.some((c) => c.type === 'otp');

        savedState[username] = {
          userId,
          requiredActions: [...currentActions],
          hasOtpCredential,
        };

        const messages: string[] = [];

        if (currentActions.includes('CONFIGURE_TOTP')) {
          const newActions = currentActions.filter((a) => a !== 'CONFIGURE_TOTP');
          await updateUserRequiredActions(adminToken, config, userId, newActions);
          messages.push(`\u2705 ${username}: Temporarily removed CONFIGURE_TOTP requirement`);
        } else {
          messages.push(`\u2139\ufe0f  ${username}: No CONFIGURE_TOTP requirement to remove`);
        }

        if (hasOtpCredential) {
          messages.push(`\ud83d\udcf1 ${username}: Has existing OTP credential (will be preserved)`);
        }

        return messages.join('\n   ');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `\u274c Error preparing ${username}: ${message}`;
      }
    })
  );

  results.forEach((result) => console.log(`   ${result}`));
  return savedState;
}

/**
 * Restore TOTP requirement for all test users (parallelized).
 *
 * - If user has OTP credential: ensure CONFIGURE_TOTP is removed
 * - If user has no OTP credential: add CONFIGURE_TOTP
 */
export async function restoreTestUsers(
  adminToken: string,
  config: KeycloakAdminConfig,
  usernames: string[],
  savedState: Record<string, SavedUserState>,
): Promise<void> {
  const results = await Promise.all(
    usernames.map(async (username) => {
      try {
        const saved = savedState[username];
        if (!saved) {
          return `\u26a0\ufe0f  No saved state for ${username}, skipping`;
        }

        const { userId } = saved;

        const currentCredentials = await getUserCredentials(adminToken, config, userId);
        const hasOtpCredential = currentCredentials.some((c) => c.type === 'otp');

        const user = await getUser(adminToken, config, userId);
        const currentActions = user.requiredActions || [];

        if (hasOtpCredential) {
          if (currentActions.includes('CONFIGURE_TOTP')) {
            const newActions = currentActions.filter((a) => a !== 'CONFIGURE_TOTP');
            await updateUserRequiredActions(adminToken, config, userId, newActions);
          }
          return `\u2705 ${username}: Has OTP credential, TOTP ready to use`;
        } else {
          if (!currentActions.includes('CONFIGURE_TOTP')) {
            const newActions = [...currentActions, 'CONFIGURE_TOTP'];
            await updateUserRequiredActions(adminToken, config, userId, newActions);
            return `\ud83d\udd12 ${username}: Added CONFIGURE_TOTP (will be prompted on next login)`;
          } else {
            return `\ud83d\udd12 ${username}: CONFIGURE_TOTP already required`;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `\u274c Error restoring ${username}: ${message}`;
      }
    })
  );

  results.forEach((result) => console.log(`   ${result}`));
  console.log('\n   \u2705 TOTP requirement restored for all users');
}
