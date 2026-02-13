/**
 * Jest Setup File
 *
 * Global setup and teardown for integration tests.
 * Verifies all services are healthy before running tests.
 *
 * Authentication:
 * - User tokens acquired via token exchange (no ROPC on mcp-gateway client)
 * - Admin tokens use admin-cli client credentials (KEYCLOAK_ADMIN_CLIENT_SECRET)
 *   with ROPC fallback (KEYCLOAK_ADMIN_PASSWORD) for environments not yet configured
 *
 * TOTP Handling:
 * - Token exchange bypasses OTP requirement (service account impersonation)
 * - Does NOT delete any user credentials
 * - Temporarily removes CONFIGURE_TOTP required action (if present)
 * - Restores required actions after tests
 */

const axios = require('axios');

const CONFIG = {
  // All URLs from environment variables - set via GitHub Variables
  keycloakUrl: process.env.KEYCLOAK_URL,
  keycloakRealm: process.env.KEYCLOAK_REALM,
  gatewayUrl: process.env.MCP_GATEWAY_URL,
  mcpHrUrl: process.env.MCP_HR_URL,
  mcpFinanceUrl: process.env.MCP_FINANCE_URL,
  mcpSalesUrl: process.env.MCP_SALES_URL,
  mcpSupportUrl: process.env.MCP_SUPPORT_URL,
};

// All test users - TOTP should be required for all of them
const TEST_USERNAMES = [
  'eve.thompson',   // Executive
  'alice.chen',     // HR Manager
  'bob.martinez',   // Finance
  'carol.johnson',  // Sales
  'dan.williams',   // Support
  'frank.davis',    // Intern
  'nina.patel',     // Manager
  'marcus.johnson', // Engineer
];

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
 * Get admin token from Keycloak master realm.
 * Prefers client credentials (KEYCLOAK_ADMIN_CLIENT_SECRET) over ROPC.
 */
async function getAdminToken() {
  const tokenUrl = `${CONFIG.keycloakUrl}/realms/master/protocol/openid-connect/token`;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;

  console.log(`\n=== Admin Token Acquisition ===`);
  console.log(`Token URL: ${tokenUrl}`);
  console.log(`Client credentials: ${clientSecret ? 'YES' : 'NO'}`);
  console.log(`ROPC fallback: ${adminPassword ? 'YES' : 'NO'}`);

  try {
    const params = clientSecret
      ? { client_id: 'admin-cli', client_secret: clientSecret, grant_type: 'client_credentials' }
      : { client_id: 'admin-cli', username: 'admin', password: adminPassword, grant_type: 'password' };

    const response = await axios.post(
      tokenUrl,
      new URLSearchParams(params),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    console.log(`✅ Admin token acquired via ${clientSecret ? 'client credentials' : 'ROPC (fallback)'}`);
    return response.data.access_token;
  } catch (error) {
    console.error(`❌ Admin token acquisition failed`);
    if (error.response) {
      console.error(`HTTP Status: ${error.response.status}`);
      console.error(`Response: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    throw error;
  }
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
 * Token exchange (via mcp-integration-runner) bypasses OTP requirements.
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
 * Restore TOTP requirement for all test users
 *
 * After QA testing, TOTP should be re-enabled for all users:
 * - If user has OTP credential: No action needed (they can use their authenticator)
 * - If user has no OTP credential: Add CONFIGURE_TOTP (they'll be prompted on next login)
 */
async function restoreTestUsers() {
  console.log('\n🔐 Re-enabling TOTP requirement for all test users...');

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

      const { userId } = saved;

      // Check current OTP credential status
      const currentCredentials = await getUserCredentials(userId);
      const hasOtpCredential = currentCredentials.some((c) => c.type === 'otp');

      // Get current user state
      const user = await getUser(userId);
      const currentActions = user.requiredActions || [];

      if (hasOtpCredential) {
        // User has OTP credential - they don't need CONFIGURE_TOTP
        // Remove it if present (they can just use their existing authenticator)
        if (currentActions.includes('CONFIGURE_TOTP')) {
          const newActions = currentActions.filter((a) => a !== 'CONFIGURE_TOTP');
          await updateUserRequiredActions(userId, newActions);
        }
        console.log(`   ✅ ${username}: Has OTP credential, TOTP ready to use`);
      } else {
        // User has no OTP credential - add CONFIGURE_TOTP so they're prompted
        if (!currentActions.includes('CONFIGURE_TOTP')) {
          const newActions = [...currentActions, 'CONFIGURE_TOTP'];
          await updateUserRequiredActions(userId, newActions);
          console.log(`   🔒 ${username}: Added CONFIGURE_TOTP (will be prompted on next login)`);
        } else {
          console.log(`   🔒 ${username}: CONFIGURE_TOTP already required`);
        }
      }
    } catch (error) {
      console.error(`   ❌ Error restoring ${username}: ${error.message}`);
    }
  }

  console.log('\n   ✅ TOTP requirement restored for all users');
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
 * Note: Keycloak 23.0 in start-dev mode doesn't have reliable /health endpoints
 * so we check if the admin console is accessible instead
 */
async function checkKeycloakHealth() {
  try {
    const response = await axios.get(`${CONFIG.keycloakUrl}/`, {
      timeout: 5000,
    });
    // Check if response contains "Keycloak" (admin console HTML)
    if (response.status === 200 && response.data.includes('Keycloak')) {
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

  // Debug: Log test configuration
  console.log('=== Jest Setup Configuration ===');
  console.log(`KEYCLOAK_URL: ${CONFIG.keycloakUrl}`);
  console.log(`KEYCLOAK_REALM: ${CONFIG.keycloakRealm}`);
  console.log(`GATEWAY_URL: ${CONFIG.gatewayUrl}`);
  console.log(`CI mode: ${process.env.CI === 'true' ? 'YES' : 'NO'}`);
  console.log(`KEYCLOAK_ADMIN_PASSWORD set: ${process.env.KEYCLOAK_ADMIN_PASSWORD ? 'YES' : 'NO'}`);
  console.log('================================\n');

  // In CI, only check Keycloak (MCP services are mocked)
  const isCI = process.env.CI === 'true';

  const checks = isCI
    ? await Promise.all([checkKeycloakHealth()])
    : await Promise.all([
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

  console.log(isCI ? '\n✅ Keycloak is healthy (CI mode).' : '\n✅ All services are healthy.');

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
 *
 * NOTE: We skip restoration in ALL environments because:
 * 1. afterAll runs after EACH test file, not after all tests
 * 2. Restoring TOTP mid-run breaks subsequent test files (401 errors)
 * 3. Users with CONFIGURE_TOTP required action cannot authenticate via direct grants
 *
 * To restore TOTP requirements after testing, manually run:
 *   cd keycloak/scripts && ./docker-sync-realm.sh dev
 */
afterAll(async () => {
  // Skip restoration to prevent breaking subsequent test files
  // Each test file's beforeAll removes CONFIGURE_TOTP,
  // but afterAll runs before the next file's beforeAll
  console.log('\n✅ All integration tests complete (skipping TOTP restoration to prevent mid-run breakage)');
}, 30000); // 30 second timeout
