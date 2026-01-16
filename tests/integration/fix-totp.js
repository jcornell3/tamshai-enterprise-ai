const axios = require('axios');

async function fixTOTP() {
  // Get admin token
  const tokenResp = await axios.post('http://127.0.0.1:8180/realms/master/protocol/openid-connect/token',
    new URLSearchParams({
      client_id: 'admin-cli',
      username: 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
      grant_type: 'password'
    }));
  const adminToken = tokenResp.data.access_token;
  console.log('Got admin token');

  const realm = 'tamshai-corp';
  const users = ['eve.thompson', 'alice.chen', 'frank.davis', 'bob.martinez', 'carol.johnson', 'dan.williams'];

  for (const username of users) {
    // Get user
    const userResp = await axios.get(
      `http://127.0.0.1:8180/admin/realms/${realm}/users?username=${username}`,
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
        `http://127.0.0.1:8180/admin/realms/${realm}/users/${user.id}`,
        { requiredActions: newActions },
        { headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }}
      );
      console.log(`  -> Removed CONFIGURE_TOTP from ${username}`);
    }
  }
  console.log('Done');
}

fixTOTP().catch(e => console.error(e.message));
