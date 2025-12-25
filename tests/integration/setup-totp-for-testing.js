/**
 * Setup TOTP for Human Testing
 *
 * Configures eve.thompson with CONFIGURE_TOTP required action.
 * On next login, she'll be prompted to set up her authenticator app.
 *
 * Other test users (alice.chen, bob.martinez, etc.) are left without
 * TOTP requirement for easier automated testing.
 */

const axios = require('axios');

const CONFIG = {
  keycloakUrl: 'http://127.0.0.1:8180',
  realm: 'tamshai-corp',
};

// User who should have TOTP for human testing
const TOTP_USER = 'eve.thompson';

// Users who should NOT have TOTP (for automated testing)
const NO_TOTP_USERS = ['alice.chen', 'bob.martinez', 'carol.johnson', 'dan.williams', 'frank.davis', 'nina.patel', 'marcus.johnson'];

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

async function main() {
  console.log('🔐 Setting up TOTP configuration for testing...\n');

  const adminToken = await getAdminToken();
  console.log('✅ Got admin token\n');

  // Set up eve.thompson with TOTP requirement
  console.log(`📱 Configuring ${TOTP_USER} for TOTP...`);
  const eveUser = await getUserByUsername(adminToken, TOTP_USER);
  if (eveUser) {
    const currentActions = eveUser.requiredActions || [];
    if (!currentActions.includes('CONFIGURE_TOTP')) {
      await updateUserRequiredActions(adminToken, eveUser.id, [...currentActions, 'CONFIGURE_TOTP']);
      console.log(`   ✅ ${TOTP_USER}: CONFIGURE_TOTP added - will be prompted on next login`);
    } else {
      console.log(`   ℹ️  ${TOTP_USER}: Already has CONFIGURE_TOTP required`);
    }
  } else {
    console.log(`   ❌ ${TOTP_USER}: User not found`);
  }

  // Ensure other users don't have TOTP requirement
  console.log('\n🔓 Ensuring other test users can login without TOTP...');
  for (const username of NO_TOTP_USERS) {
    const user = await getUserByUsername(adminToken, username);
    if (user) {
      const currentActions = user.requiredActions || [];
      if (currentActions.includes('CONFIGURE_TOTP')) {
        const newActions = currentActions.filter(a => a !== 'CONFIGURE_TOTP');
        await updateUserRequiredActions(adminToken, user.id, newActions);
        console.log(`   ✅ ${username}: Removed CONFIGURE_TOTP`);
      } else {
        console.log(`   ℹ️  ${username}: No TOTP requirement (good)`);
      }
    } else {
      console.log(`   ⚠️  ${username}: User not found`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 TOTP Configuration Summary:');
  console.log('='.repeat(60));
  console.log(`\n👤 ${TOTP_USER} (Executive):`);
  console.log('   - Will be prompted to set up TOTP on next login');
  console.log('   - Use any authenticator app (Google Authenticator, Authy, etc.)');
  console.log('   - Scan the QR code when prompted');
  console.log('\n👥 Other test users (alice.chen, bob.martinez, etc.):');
  console.log('   - Can login with just username/password');
  console.log('   - Used for automated testing');
  console.log('\n' + '='.repeat(60));
}

main().catch(e => {
  console.error('❌ Error:', e.response?.data || e.message);
  process.exit(1);
});
