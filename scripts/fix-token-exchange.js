const http = require('http');
const fs = require('fs');

const KEYCLOAK_URL = 'http://localhost:8180';
const REALM = 'tamshai-corp';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'TamshaiDevAdmin123!';

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function bindPolicyToPermission(adminToken, rmClientUuid, permId, policyId, permName) {
  console.log(`  Binding policy to ${permName} permission...`);

  // Check if already bound
  const assocRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/clients/${rmClientUuid}/authz/resource-server/policy/${permId}/associatedPolicies`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  let assocPolicies = [];
  try {
    assocPolicies = JSON.parse(assocRes.body);
  } catch (e) {
    // Empty or invalid response
  }

  const alreadyBound = Array.isArray(assocPolicies) && assocPolicies.some(p => p.id === policyId);

  if (alreadyBound) {
    console.log(`  Policy already bound to ${permName} - IDEMPOTENT`);
    return true;
  }

  // Get current permission state
  const currPermRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/clients/${rmClientUuid}/authz/resource-server/permission/scope/${permId}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  const currentPerm = JSON.parse(currPermRes.body);

  // Add policy to policies array
  currentPerm.policies = currentPerm.policies || [];
  const hasPolicy = currentPerm.policies.indexOf(policyId) >= 0;
  if (!hasPolicy) {
    currentPerm.policies.push(policyId);
  }

  // Update permission
  const updateRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/clients/${rmClientUuid}/authz/resource-server/permission/scope/${permId}`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  }, JSON.stringify(currentPerm));

  console.log(`  Update response: ${updateRes.status}`);

  // Verify
  await new Promise(r => setTimeout(r, 500));
  const verifyRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/clients/${rmClientUuid}/authz/resource-server/policy/${permId}/associatedPolicies`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  let verifyPolicies = [];
  try {
    verifyPolicies = JSON.parse(verifyRes.body);
  } catch (e) {
    // Empty or invalid response
  }

  if (Array.isArray(verifyPolicies) && verifyPolicies.length > 0) {
    console.log(`  ${permName} policy binding verified`);
    return true;
  } else {
    console.error(`  FAILED: ${permName} policy binding did not persist`);
    return false;
  }
}

async function main() {
  console.log('Getting admin token...');
  const tokenRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: '/auth/realms/master/protocol/openid-connect/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, `client_id=admin-cli&username=${ADMIN_USER}&password=${encodeURIComponent(ADMIN_PASS)}&grant_type=password`);

  const adminToken = JSON.parse(tokenRes.body).access_token;
  if (!adminToken) {
    console.error('Failed to get admin token:', tokenRes.body);
    process.exit(1);
  }
  console.log('Admin token obtained');

  // Get realm-management client UUID
  console.log('Getting realm-management client...');
  const rmRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/clients?clientId=realm-management`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const rmClients = JSON.parse(rmRes.body);
  const rmClientUuid = rmClients[0]?.id;
  console.log('realm-management UUID:', rmClientUuid);

  // Get mcp-integration-runner client UUID
  console.log('Getting mcp-integration-runner client...');
  const runnerRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/clients?clientId=mcp-integration-runner`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const runnerClients = JSON.parse(runnerRes.body);
  const runnerClientUuid = runnerClients[0]?.id;
  console.log('mcp-integration-runner UUID:', runnerClientUuid);

  // Get mcp-gateway client UUID
  console.log('Getting mcp-gateway client...');
  const gwRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/clients?clientId=mcp-gateway`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const gwClients = JSON.parse(gwRes.body);
  const gwClientUuid = gwClients[0]?.id;
  console.log('mcp-gateway UUID:', gwClientUuid);

  // Step 1: Enable users-management-permissions (bootstraps Authorization Services)
  console.log('Enabling users-management-permissions...');
  const usersPermRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/users-management-permissions`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  }, JSON.stringify({ enabled: true }));

  const usersPermData = JSON.parse(usersPermRes.body);
  console.log('Users permissions enabled, impersonate perm ID:', usersPermData.scopePermissions?.impersonate);

  // Step 2: Enable mcp-gateway management permissions (creates token-exchange permission)
  console.log('Enabling mcp-gateway management permissions...');
  const gwPermRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/clients/${gwClientUuid}/management/permissions`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  }, JSON.stringify({ enabled: true }));

  const gwPermData = JSON.parse(gwPermRes.body);
  const tokenExchangePermId = gwPermData.scopePermissions?.['token-exchange'];
  console.log('Gateway permissions enabled, token-exchange perm ID:', tokenExchangePermId);

  // Step 3: Get or create mcp-integration-runner-policy
  console.log('Getting mcp-integration-runner-policy...');
  const policyRes = await httpRequest({
    hostname: 'localhost',
    port: 8180,
    path: `/auth/admin/realms/${REALM}/clients/${rmClientUuid}/authz/resource-server/policy?name=mcp-integration-runner-policy`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  let policies = [];
  try {
    policies = JSON.parse(policyRes.body);
  } catch (e) {
    // Empty response
  }

  let policyId = policies[0]?.id;

  if (!policyId) {
    console.log('Creating mcp-integration-runner-policy...');
    const newPolicyRes = await httpRequest({
      hostname: 'localhost',
      port: 8180,
      path: `/auth/admin/realms/${REALM}/clients/${rmClientUuid}/authz/resource-server/policy/client`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({
      type: 'client',
      logic: 'POSITIVE',
      decisionStrategy: 'UNANIMOUS',
      name: 'mcp-integration-runner-policy',
      description: 'Allow MCP integration runner to perform token exchange',
      clients: [runnerClientUuid]
    }));

    const newPolicy = JSON.parse(newPolicyRes.body);
    policyId = newPolicy.id;
    console.log('Policy created:', policyId);
  } else {
    console.log('Policy already exists:', policyId);
  }

  // Step 4: Bind policy to impersonate permission
  const impersonatePermId = usersPermData.scopePermissions?.impersonate;
  if (impersonatePermId) {
    await bindPolicyToPermission(adminToken, rmClientUuid, impersonatePermId, policyId, 'impersonate');
  }

  // Step 5: Bind policy to token-exchange permission
  if (tokenExchangePermId) {
    await bindPolicyToPermission(adminToken, rmClientUuid, tokenExchangePermId, policyId, 'token-exchange');
  }

  console.log('\nSUCCESS: Token exchange permissions configured');
  console.log('This script is idempotent - safe to run multiple times');
}

main().catch(console.error);
