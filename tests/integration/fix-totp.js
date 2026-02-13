const axios = require('axios');

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;

async function fixTOTP() {
  // Get admin token (prefer client credentials over ROPC)
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  const params = clientSecret
    ? { client_id: 'admin-cli', client_secret: clientSecret, grant_type: 'client_credentials' }
    : { client_id: 'admin-cli', username: 'admin', password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin', grant_type: 'password' };

  const tokenResp = await axios.post(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams(params));
  const adminToken = tokenResp.data.access_token;
  console.log('Got admin token');

  const realm = 'tamshai-corp';
  const users = ['eve.thompson', 'alice.chen', 'frank.davis', 'bob.martinez', 'carol.johnson', 'dan.williams'];

  for (const username of users) {
    // Get user
    const userResp = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${realm}/users?username=${username}`,
      { headers: { Authorization: `Bearer ${adminToken}` }}
    );
    if (userResp.data.length === 0) {
      console.log(`User ${username} not found`);
      continue;
    }
    const user = userResp.data[0];
    console.log(`${username}: requiredActions = ${JSON.stringify(user.requiredActions || [])}`);

    // Remove CONFIGURE_TOTP if present
    if (user.requiredActions && user.requiredActions.includes('CONFIGURE_TOTP')) {
      const newActions = user.requiredActions.filter(a => a !== 'CONFIGURE_TOTP');
      await axios.put(
        `${KEYCLOAK_URL}/admin/realms/${realm}/users/${user.id}`,
        { requiredActions: newActions },
        { headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }}
      );
      console.log(`  -> Removed CONFIGURE_TOTP from ${username}`);
    }
  }
  console.log('Done');
}

fixTOTP().catch(e => console.error(e.message));
