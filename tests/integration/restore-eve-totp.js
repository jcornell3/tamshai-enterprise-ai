/**
 * Restore eve.thompson's TOTP credential
 *
 * Sets up eve.thompson with the known test TOTP secret: [REDACTED-DEV-TOTP]
 * This allows using a pre-configured authenticator app for testing.
 *
 * To add this secret to your authenticator app:
 * 1. Open Google Authenticator, Authy, or similar
 * 2. Add new account manually (not QR code)
 * 3. Account name: eve.thompson@tamshai
 * 4. Secret key: [REDACTED-DEV-TOTP]
 * 5. Type: Time-based (TOTP)
 */

const axios = require('axios');

const CONFIG = {
  keycloakUrl: process.env.KEYCLOAK_URL,
  realm: 'tamshai-corp',
};

const TOTP_SECRET = '[REDACTED-DEV-TOTP]';
const TARGET_USER = 'eve.thompson';

async function getAdminToken() {
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  const params = clientSecret
    ? { client_id: 'admin-cli', client_secret: clientSecret, grant_type: 'client_credentials' }
    : { client_id: 'admin-cli', username: 'admin', password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin', grant_type: 'password' };

  const response = await axios.post(
    `${CONFIG.keycloakUrl}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams(params),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data.access_token;
}

async function getUserByUsername(adminToken, username) {
  const response = await axios.get(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.realm}/users`,
    {
      params: { username },
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );
  return response.data[0];
}

async function getUserCredentials(adminToken, userId) {
  const response = await axios.get(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.realm}/users/${userId}/credentials`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  return response.data;
}

async function deleteCredential(adminToken, userId, credentialId) {
  await axios.delete(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.realm}/users/${userId}/credentials/${credentialId}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
}

async function updateUserRequiredActions(adminToken, userId, requiredActions) {
  await axios.put(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.realm}/users/${userId}`,
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
 * Unfortunately, Keycloak does not provide a direct API to set TOTP credentials.
 * The standard flow is:
 * 1. User initiates TOTP setup via account console or required action
 * 2. Keycloak generates a secret and QR code
 * 3. User scans QR code and enters verification code
 *
 * Workaround options:
 * A) Use Keycloak's internal API (not officially supported)
 * B) Use REST API to trigger credential setup flow
 * C) Have user manually set up TOTP via Keycloak account console
 *
 * This script will:
 * 1. Remove any existing OTP credentials
 * 2. Add CONFIGURE_TOTP required action
 * 3. Provide instructions for manual setup with the known secret
 */
async function main() {
  console.log('🔐 Restoring TOTP for eve.thompson...\n');

  const adminToken = await getAdminToken();
  console.log('✅ Got admin token\n');

  const user = await getUserByUsername(adminToken, TARGET_USER);
  if (!user) {
    console.error(`❌ User ${TARGET_USER} not found`);
    process.exit(1);
  }
  console.log(`✅ Found user: ${TARGET_USER} (${user.id})`);

  // Check existing OTP credentials
  const credentials = await getUserCredentials(adminToken, user.id);
  const otpCredentials = credentials.filter((c) => c.type === 'otp');

  if (otpCredentials.length > 0) {
    console.log(`ℹ️  User already has ${otpCredentials.length} OTP credential(s)`);
    console.log('   Removing existing OTP credentials to set up fresh...');
    for (const cred of otpCredentials) {
      await deleteCredential(adminToken, user.id, cred.id);
      console.log(`   ✅ Removed OTP credential: ${cred.id}`);
    }
  }

  // Remove CONFIGURE_TOTP if present (we'll add it back)
  const currentActions = user.requiredActions || [];
  const newActions = currentActions.filter((a) => a !== 'CONFIGURE_TOTP');
  newActions.push('CONFIGURE_TOTP');
  await updateUserRequiredActions(adminToken, user.id, newActions);
  console.log('✅ Added CONFIGURE_TOTP required action\n');

  console.log('=' .repeat(70));
  console.log('📱 TOTP SETUP INSTRUCTIONS FOR eve.thompson');
  console.log('='.repeat(70));
  console.log(`
On next login, eve.thompson will be prompted to set up TOTP.

Option 1: Use Keycloak's generated QR code
   - Just scan the QR code shown by Keycloak with your authenticator app

Option 2: Pre-configure with known secret (for testing)
   - Open your authenticator app (Google Authenticator, Authy, etc.)
   - Add new account MANUALLY (not QR code)
   - Account name: eve.thompson@tamshai
   - Secret key: ${TOTP_SECRET}
   - Type: Time-based (TOTP)
   - Then on Keycloak setup screen, enter the code from your app

Keycloak Account Console URL:
   ${CONFIG.keycloakUrl}/realms/tamshai-corp/account

Login:
   Username: eve.thompson
   Password: [REDACTED-DEV-PASSWORD]
`);
  console.log('='.repeat(70));
}

main().catch((e) => {
  console.error('❌ Error:', e.response?.data || e.message);
  process.exit(1);
});
