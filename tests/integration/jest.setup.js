/**
 * Jest Setup File
 *
 * Global setup and teardown for integration tests.
 * Verifies all services are healthy before running tests.
 *
 * TOTP Handling:
 * - Uses direct access grants which bypass OTP requirement
 * - Does NOT delete any user credentials
 * - Temporarily removes CONFIGURE_TOTP required action (if present)
 * - Restores required actions after tests
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

// Storage for user state to restore after tests
let savedUserState = {};
let adminToken = null;

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
 * Get user details
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
 * Prepare test users for automated testing
 *
 * IMPORTANT: We do NOT delete OTP credentials!
 * We only temporarily remove CONFIGURE_TOTP from required actions.
 * The mcp-gateway client uses direct access grants which bypass OTP.
 */
async function prepareTestUsers() {
  console.log('\n🔐 Preparing test users for automated testing...');
  console.log('   (OTP credentials are preserved - only required actions are modified)\n');

  for (const username of TEST_USERNAMES) {
    try {
      const userId = await getUserId(username);
      if (!userId) {
        console.log(`   ⚠️  User ${username} not found, skipping`);
        continue;
      }

      const user = await getUser(userId);
      const currentActions = user.requiredActions || [];

      // Check if user has existing OTP credential
      const credentials = await getUserCredentials(userId);
      const hasOtpCredential = credentials.some((c) => c.type === 'otp');

      // Save current state for restoration
      savedUserState[username] = {
        userId,
        requiredActions: [...currentActions],
        hasOtpCredential,
      };

      // Remove CONFIGURE_TOTP from required actions if present
      if (currentActions.includes('CONFIGURE_TOTP')) {
        const newActions = currentActions.filter((a) => a !== 'CONFIGURE_TOTP');
        await updateUserRequiredActions(userId, newActions);
        console.log(`   ✅ ${username}: Temporarily removed CONFIGURE_TOTP requirement`);
      } else {
        console.log(`   ℹ️  ${username}: No CONFIGURE_TOTP requirement to remove`);
      }

      if (hasOtpCredential) {
        console.log(`   📱 ${username}: Has existing OTP credential (will be preserved)`);
      }
    } catch (error) {
      console.error(`   ❌ Error preparing ${username}: ${error.message}`);
    }
  }
}

/**
 * Restore test users to their original state
 *
 * IMPORTANT: Only add CONFIGURE_TOTP if user doesn't have an OTP credential.
 * Users with existing OTP credentials should NOT be forced to re-register.
 */
async function restoreTestUsers() {
  console.log('\n🔐 Restoring test users to original state...');

  // Refresh admin token in case it expired during long tests
  try {
    adminToken = await getAdminToken();
  } catch (error) {
    console.error('   ❌ Failed to refresh admin token:', error.message);
    return;
  }

  for (const username of TEST_USERNAMES) {
    try {
      const saved = savedUserState[username];
      if (!saved) {
        console.log(`   ⚠️  No saved state for ${username}, skipping`);
        continue;
      }

      const { userId, requiredActions, hasOtpCredential } = saved;

      // Check current OTP credential status (may have changed during tests)
      const currentCredentials = await getUserCredentials(userId);
      const currentlyHasOtp = currentCredentials.some((c) => c.type === 'otp');

      // Determine what required actions to restore
      let actionsToRestore = [...requiredActions];

      // If user has OTP credential, remove CONFIGURE_TOTP from restoration
      // (they don't need to re-register - they can just use their existing authenticator)
      if (currentlyHasOtp && actionsToRestore.includes('CONFIGURE_TOTP')) {
        actionsToRestore = actionsToRestore.filter((a) => a !== 'CONFIGURE_TOTP');
        console.log(`   📱 ${username}: Has OTP credential, skipping CONFIGURE_TOTP restoration`);
      }

      // Restore required actions
      await updateUserRequiredActions(userId, actionsToRestore);

      if (actionsToRestore.includes('CONFIGURE_TOTP')) {
        console.log(`   ✅ ${username}: Restored CONFIGURE_TOTP requirement (no OTP credential)`);
      } else if (requiredActions.includes('CONFIGURE_TOTP') && currentlyHasOtp) {
        console.log(`   ✅ ${username}: OTP already configured, no re-registration needed`);
      } else {
        console.log(`   ℹ️  ${username}: No CONFIGURE_TOTP needed`);
      }
    } catch (error) {
      console.error(`   ❌ Error restoring ${username}: ${error.message}`);
    }
  }

  console.log('\n   ✅ All user states restored');
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

  // Get admin token and prepare test users
  try {
    adminToken = await getAdminToken();
    await prepareTestUsers();
  } catch (error) {
    console.error('\n❌ Failed to prepare test users:', error.message);
    throw new Error('Failed to prepare test environment');
  }

  console.log('\n✅ Starting tests...\n');
}, 60000); // 60 second timeout for health checks + user preparation

/**
 * Global teardown - runs once after all tests
 */
afterAll(async () => {
  // Restore test users to their original state
  await restoreTestUsers();

  console.log('\n✅ All integration tests complete');
}, 30000); // 30 second timeout for user restoration
