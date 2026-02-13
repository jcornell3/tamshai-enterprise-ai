/**
 * Remove offline_access scope from Flutter client
 */

const http = require('http');
const querystring = require('querystring');
const keycloakUrl = new URL(process.env.KEYCLOAK_URL);

async function getAdminToken() {
  return new Promise((resolve) => {
    const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
    const postData = querystring.stringify(clientSecret
      ? { client_id: 'admin-cli', client_secret: clientSecret, grant_type: 'client_credentials' }
      : { client_id: 'admin-cli', username: 'admin', password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin', grant_type: 'password' }
    );
    const req = http.request({
      hostname: keycloakUrl.hostname,
      port: keycloakUrl.port,
      path: '/realms/master/protocol/openid-connect/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data).access_token));
    });
    req.write(postData);
    req.end();
  });
}

async function getClient(token) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: keycloakUrl.hostname,
      port: keycloakUrl.port,
      path: '/admin/realms/tamshai-corp/clients?clientId=tamshai-flutter-client',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)[0]));
    });
    req.end();
  });
}

async function getClientScopes(token) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: keycloakUrl.hostname,
      port: keycloakUrl.port,
      path: '/admin/realms/tamshai-corp/client-scopes',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.end();
  });
}

async function removeDefaultScope(token, clientId, scopeId) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: keycloakUrl.hostname,
      port: keycloakUrl.port,
      path: `/admin/realms/tamshai-corp/clients/${clientId}/default-client-scopes/${scopeId}`,
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        console.log('Remove scope status:', res.statusCode);
        resolve(res.statusCode);
      });
    });
    req.end();
  });
}

async function main() {
  const token = await getAdminToken();
  console.log('Got admin token');

  const client = await getClient(token);
  console.log('Client UUID:', client.id);
  console.log('Current default scopes:', client.defaultClientScopes);

  const scopes = await getClientScopes(token);
  const offlineScope = scopes.find(s => s.name === 'offline_access');

  if (offlineScope) {
    console.log('Found offline_access scope ID:', offlineScope.id);
    await removeDefaultScope(token, client.id, offlineScope.id);
    console.log('Removed offline_access from default scopes');
  } else {
    console.log('offline_access scope not found');
  }

  // Verify
  const updatedClient = await getClient(token);
  console.log('Updated default scopes:', updatedClient.defaultClientScopes);
}

main();
