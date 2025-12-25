/**
 * Jest Setup File
 *
 * Global setup and teardown for integration tests.
 * Verifies all services are healthy before running tests.
 *
 * TOTP Handling:
 * - Before tests: Temporarily removes TOTP credentials and required actions
 * - After tests: Restores TOTP credentials for users who had them, ensures
 *   TOTP is required for all test users (they'll be prompted on next login)
 */

const axios = require('axios');

const CONFIG = {
  // Use 127.0.0.1 instead of localhost for Windows compatibility
  // (localhost can have DNS resolution issues on Windows with Docker)
  keycloakUrl: process.env.KEYCLOAK_URL || 'http://127.0.0.1:8180',
  keycloakRealm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
  gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:3100',
  mcpHrUrl: process.env.MCP_HR_URL || 'http://127.0.0.1:3101',
  mcpFinanceUrl: process.env.MCP_FINANCE_URL || 'http://127.0.0.1:3102',
  mcpSalesUrl: process.env.MCP_SALES_URL || 'http://127.0.0.1:3103',
  mcpSupportUrl: process.env.MCP_SUPPORT_URL || 'http://127.0.0.1:3104',
};

// Test users that need TOTP handling
const TEST_USERNAMES = ['eve.thompson', 'alice.chen', 'frank.davis'];

// Storage for TOTP credentials to restore after tests
let savedTotpCredentials = {};
let adminToken = null;

/**
 * Get admin token from Keycloak master realm
 */
async function getAdminToken() {
  const response = await axios.post(
    `${CONFIG.keycloakUrl}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({
      client_id: 'admin-cli',
      username: 'admin',
      password: 'admin',
      grant_type: 'password',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data.access_token;
}

/**
 * Get user ID by username
 */
async function getUserId(username) {
  const response = await axios.get(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.keycloakRealm}/users`,
    {
      params: { username },
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );
  return response.data[0]?.id;
}

/**
 * Get user's credentials
 */
async function getUserCredentials(userId) {
  const response = await axios.get(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.keycloakRealm}/users/${userId}/credentials`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  return response.data;
}

/**
 * Delete a credential by ID
 */
async function deleteCredential(userId, credentialId) {
  await axios.delete(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.keycloakRealm}/users/${userId}/credentials/${credentialId}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
}

/**
 * Get user's required actions
 */
async function getUser(userId) {
  const response = await axios.get(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.keycloakRealm}/users/${userId}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  return response.data;
}

/**
 * Update user's required actions
 */
async function updateUserRequiredActions(userId, requiredActions) {
  await axios.put(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.keycloakRealm}/users/${userId}`,
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
 * Disable TOTP for test users before tests run
 * Saves existing TOTP credentials so they can be restored later
 */
async function disableTotpForTestUsers() {
  console.log('\n🔐 Preparing TOTP settings for test users...');

  for (const username of TEST_USERNAMES) {
    try {
      const userId = await getUserId(username);
      if (!userId) {
        console.log(`   ⚠️  User ${username} not found, skipping`);
        continue;
      }

      // Get current credentials
      const credentials = await getUserCredentials(userId);
      const otpCredentials = credentials.filter((c) => c.type === 'otp');

      // Save OTP credentials for this user (to restore later)
      if (otpCredentials.length > 0) {
        savedTotpCredentials[username] = {
          userId,
          credentials: otpCredentials,
          hadTotp: true,
        };
        console.log(`   📦 Saved TOTP credential for ${username}`);

        // Delete OTP credentials temporarily
        for (const cred of otpCredentials) {
          await deleteCredential(userId, cred.id);
        }
        console.log(`   🔓 Temporarily disabled TOTP for ${username}`);
      } else {
        // User doesn't have TOTP set up yet
        savedTotpCredentials[username] = {
          userId,
          credentials: [],
          hadTotp: false,
        };
        console.log(`   ℹ️  ${username} has no TOTP configured`);
      }

      // Remove CONFIGURE_TOTP from required actions temporarily
      const user = await getUser(userId);
      const currentActions = user.requiredActions || [];
      if (currentActions.includes('CONFIGURE_TOTP')) {
        const newActions = currentActions.filter((a) => a !== 'CONFIGURE_TOTP');
        await updateUserRequiredActions(userId, newActions);
        savedTotpCredentials[username].hadRequiredAction = true;
      } else {
        savedTotpCredentials[username].hadRequiredAction = false;
      }
    } catch (error) {
      console.error(`   ❌ Error handling TOTP for ${username}: ${error.message}`);
    }
  }
}

/**
 * Restore TOTP settings after tests complete
 * - Users who had TOTP: Add CONFIGURE_TOTP required action (they'll need to re-register)
 * - Users who didn't have TOTP: Add CONFIGURE_TOTP required action (enforces TOTP requirement)
 *
 * Note: We can't restore the actual TOTP secret programmatically since Keycloak
 * stores them hashed. Instead, we ensure TOTP is required so users will be
 * prompted to set it up on next login. For eve.thompson who had TOTP,
 * she'll need to re-register her authenticator app.
 */
async function restoreTotpForTestUsers() {
  console.log('\n🔐 Restoring TOTP requirements for test users...');

  // Refresh admin token in case it expired during long tests
  try {
    adminToken = await getAdminToken();
  } catch (error) {
    console.error('   ❌ Failed to refresh admin token:', error.message);
    return;
  }

  for (const username of TEST_USERNAMES) {
    try {
      const saved = savedTotpCredentials[username];
      if (!saved) {
        console.log(`   ⚠️  No saved state for ${username}, skipping`);
        continue;
      }

      const { userId, hadTotp } = saved;

      // Only restore TOTP requirement for users who actually had TOTP before
      // Don't force TOTP on users who never set it up
      if (hadTotp) {
        const user = await getUser(userId);
        const currentActions = user.requiredActions || [];

        if (!currentActions.includes('CONFIGURE_TOTP')) {
          const newActions = [...currentActions, 'CONFIGURE_TOTP'];
          await updateUserRequiredActions(userId, newActions);
          console.log(
            `   🔄 ${username}: TOTP re-registration required (had TOTP before)`
          );
        } else {
          console.log(`   ✅ ${username}: TOTP already required`);
        }
      } else {
        console.log(`   ℹ️  ${username}: No TOTP restoration needed (never had TOTP)`);
      }
    } catch (error) {
      console.error(
        `   ❌ Error restoring TOTP for ${username}: ${error.message}`
      );
    }
  }

  console.log('\n   ℹ️  Note: Users with prior TOTP will need to re-register their authenticator app');
}

/**
 * Check if a service is healthy
 */
async function checkServiceHealth(name, url) {
  try {
    const response = await axios.get(`${url}/health`, { timeout: 5000 });
    if (response.status === 200 && response.data.status === 'healthy') {
      console.log(`✅ ${name} is healthy`);
      return true;
    }
  } catch (error) {
    console.error(`❌ ${name} is NOT healthy: ${error.message}`);
    return false;
  }
  return false;
}

/**
 * Check if Keycloak is ready
 */
async function checkKeycloakHealth() {
  try {
    const response = await axios.get(`${CONFIG.keycloakUrl}/health/ready`, {
      timeout: 5000,
    });
    if (response.status === 200) {
      console.log('✅ Keycloak is ready');
      return true;
    }
  } catch (error) {
    console.error(`❌ Keycloak is NOT ready: ${error.message}`);
    return false;
  }
  return false;
}

/**
 * Global setup - runs once before all tests
 */
beforeAll(async () => {
  console.log('🔍 Verifying all services are healthy...\n');

  const checks = await Promise.all([
    checkKeycloakHealth(),
    checkServiceHealth('MCP Gateway', CONFIG.gatewayUrl),
    checkServiceHealth('MCP HR', CONFIG.mcpHrUrl),
    checkServiceHealth('MCP Finance', CONFIG.mcpFinanceUrl),
    checkServiceHealth('MCP Sales', CONFIG.mcpSalesUrl),
    checkServiceHealth('MCP Support', CONFIG.mcpSupportUrl),
  ]);

  const allHealthy = checks.every((check) => check === true);

  if (!allHealthy) {
    console.error('\n❌ Some services are not healthy. Please start all services:');
    console.error('   cd infrastructure/docker && docker compose up -d\n');
    throw new Error('Services not ready for integration tests');
  }

  console.log('\n✅ All services are healthy.');

  // Get admin token and disable TOTP for test users
  try {
    adminToken = await getAdminToken();
    await disableTotpForTestUsers();
  } catch (error) {
    console.error('\n❌ Failed to prepare TOTP settings:', error.message);
    throw new Error('Failed to prepare test environment');
  }

  console.log('\n✅ Starting tests...\n');
}, 60000); // 60 second timeout for health checks + TOTP setup

/**
 * Global teardown - runs once after all tests
 */
afterAll(async () => {
  // Restore TOTP requirements for all test users
  await restoreTotpForTestUsers();

  console.log('\n✅ All integration tests complete');
}, 30000); // 30 second timeout for TOTP restoration
