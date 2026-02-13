/**
 * Setup Keycloak Protocol Mappers
 *
 * Adds preferred_username and email claims to the access token
 * for the mcp-gateway client.
 */

const axios = require('axios');

const CONFIG = {
  keycloakUrl: process.env.KEYCLOAK_URL,
  realm: 'tamshai-corp',
  clientId: 'mcp-gateway',
};

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

async function getClientId(adminToken) {
  const response = await axios.get(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.realm}/clients`,
    {
      params: { clientId: CONFIG.clientId },
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );
  return response.data[0]?.id;
}

async function getExistingMappers(adminToken, clientUuid) {
  const response = await axios.get(
    `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.realm}/clients/${clientUuid}/protocol-mappers/models`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  return response.data;
}

async function createMapper(adminToken, clientUuid, mapper) {
  try {
    await axios.post(
      `${CONFIG.keycloakUrl}/admin/realms/${CONFIG.realm}/clients/${clientUuid}/protocol-mappers/models`,
      mapper,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ Created mapper: ${mapper.name}`);
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(`ℹ️  Mapper already exists: ${mapper.name}`);
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log('🔧 Setting up Keycloak protocol mappers for mcp-gateway client...\n');

  // Get admin token
  const adminToken = await getAdminToken();
  console.log('✅ Got admin token');

  // Get client UUID
  const clientUuid = await getClientId(adminToken);
  if (!clientUuid) {
    console.error('❌ Client mcp-gateway not found');
    process.exit(1);
  }
  console.log(`✅ Found client: ${CONFIG.clientId} (${clientUuid})`);

  // Check existing mappers
  const existingMappers = await getExistingMappers(adminToken, clientUuid);
  console.log(`ℹ️  Existing mappers: ${existingMappers.map(m => m.name).join(', ') || 'none'}`);

  // Define mappers to add
  const mappers = [
    {
      name: 'username',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-property-mapper',
      config: {
        'user.attribute': 'username',
        'claim.name': 'preferred_username',
        'jsonType.label': 'String',
        'id.token.claim': 'true',
        'access.token.claim': 'true',
        'userinfo.token.claim': 'true',
      },
    },
    {
      name: 'email',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-property-mapper',
      config: {
        'user.attribute': 'email',
        'claim.name': 'email',
        'jsonType.label': 'String',
        'id.token.claim': 'true',
        'access.token.claim': 'true',
        'userinfo.token.claim': 'true',
      },
    },
    {
      name: 'email_verified',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-property-mapper',
      config: {
        'user.attribute': 'emailVerified',
        'claim.name': 'email_verified',
        'jsonType.label': 'boolean',
        'id.token.claim': 'true',
        'access.token.claim': 'true',
        'userinfo.token.claim': 'true',
      },
    },
  ];

  // Create mappers
  console.log('\n📝 Creating protocol mappers...');
  for (const mapper of mappers) {
    await createMapper(adminToken, clientUuid, mapper);
  }

  // Verify by getting a test token via token exchange (no ROPC)
  console.log('\n🧪 Verifying mappers with test token (token exchange)...');
  try {
    const integrationRunnerSecret = process.env.MCP_INTEGRATION_RUNNER_SECRET;
    if (!integrationRunnerSecret) {
      console.log('⚠️  MCP_INTEGRATION_RUNNER_SECRET not set - skipping token verification');
      console.log('   Set this env var to verify mappers via token exchange.');
      return;
    }

    // Step 1: Get service account token (client credentials)
    const serviceTokenResp = await axios.post(
      `${CONFIG.keycloakUrl}/realms/${CONFIG.realm}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'mcp-integration-runner',
        client_secret: integrationRunnerSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Step 2: Exchange for alice.chen's token
    const tokenResp = await axios.post(
      `${CONFIG.keycloakUrl}/realms/${CONFIG.realm}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: 'mcp-integration-runner',
        client_secret: integrationRunnerSecret,
        subject_token: serviceTokenResp.data.access_token,
        requested_subject: 'alice.chen',
        audience: 'mcp-gateway',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const token = tokenResp.data.access_token;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    console.log('\n📋 Token claims:');
    console.log(`   preferred_username: ${payload.preferred_username || '(missing)'}`);
    console.log(`   email: ${payload.email || '(missing)'}`);
    console.log(`   email_verified: ${payload.email_verified}`);
    console.log(`   sub: ${payload.sub}`);

    if (payload.preferred_username && payload.email) {
      console.log('\n✅ Protocol mappers configured successfully!');
    } else {
      console.log('\n⚠️  Some claims still missing - mappers may need time to take effect');
    }
  } catch (error) {
    console.error('❌ Token verification failed:', error.response?.data || error.message);
  }
}

main().catch(e => {
  console.error('❌ Error:', e.response?.data || e.message);
  process.exit(1);
});
