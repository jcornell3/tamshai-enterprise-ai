/**
 * Fix Flutter client - remove offline_access scope
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

async function updateClient(token, client) {
  return new Promise((resolve) => {
    const scopes = client.defaultClientScopes || [];
    const newScopes = scopes.filter(s => s !== 'offline_access');

    const updateData = JSON.stringify({
      defaultClientScopes: newScopes
    });

    const req = http.request({
      hostname: keycloakUrl.hostname,
      port: keycloakUrl.port,
      path: '/admin/realms/tamshai-corp/clients/' + client.id,
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        console.log('Update status:', res.statusCode);
        console.log('Removed offline_access from default scopes');
        console.log('New scopes:', newScopes);
        resolve();
      });
    });
    req.write(updateData);
    req.end();
  });
}

async function main() {
  const token = await getAdminToken();
  const client = await getClient(token);
  if (client) {
    console.log('Current defaultClientScopes:', client.defaultClientScopes);
    await updateClient(token, client);
  } else {
    console.log('Client not found');
  }
}

main();
