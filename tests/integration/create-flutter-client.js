/**
 * Create tamshai-flutter-client in Keycloak
 *
 * This script creates the Flutter client for desktop/mobile OAuth authentication.
 */

const http = require('http');
const querystring = require('querystring');

const CONFIG = {
  keycloakUrl: process.env.KEYCLOAK_URL,
  realm: 'tamshai-corp',
};
const keycloakParsed = new URL(CONFIG.keycloakUrl);

async function getAdminToken() {
  return new Promise((resolve, reject) => {
    const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
    const postData = querystring.stringify(clientSecret
      ? { client_id: 'admin-cli', client_secret: clientSecret, grant_type: 'client_credentials' }
      : { client_id: 'admin-cli', username: 'admin', password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin', grant_type: 'password' }
    );

    const options = {
      hostname: keycloakParsed.hostname,
      port: keycloakParsed.port,
      path: '/realms/master/protocol/openid-connect/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const json = JSON.parse(data);
        resolve(json.access_token);
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function createClient(adminToken) {
  return new Promise((resolve, reject) => {
    const clientConfig = {
      clientId: 'tamshai-flutter-client',
      name: 'Tamshai Flutter Application',
      description:
        'Cross-platform Flutter application for AI assistant (Windows, macOS, iOS, Android)',
      enabled: true,
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      protocol: 'openid-connect',
      redirectUris: [
        'http://localhost:*/callback',
        'http://127.0.0.1:*/callback',
        'com.tamshai.ai://callback',
        'com.tamshai.unifiedflutter://callback',
      ],
      webOrigins: ['http://localhost', 'http://127.0.0.1'],
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'post.logout.redirect.uris': 'http://localhost:*/logout##http://127.0.0.1:*/logout##com.tamshai.ai://logout##com.tamshai.unifiedflutter://logout',
      },
      defaultClientScopes: [
        'openid',
        'profile',
        'email',
        'roles',
        'offline_access',
      ],
    };

    const postData = JSON.stringify(clientConfig);

    const options = {
      hostname: keycloakParsed.hostname,
      port: keycloakParsed.port,
      path: `/admin/realms/${CONFIG.realm}/clients`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 201) {
          resolve({ success: true });
        } else if (res.statusCode === 409) {
          resolve({ success: true, message: 'Client already exists' });
        } else {
          reject(new Error(`Failed to create client: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Creating tamshai-flutter-client in Keycloak...\n');

  try {
    const adminToken = await getAdminToken();
    console.log('Got admin token');

    await createClient(adminToken);
    console.log('Client created successfully!');

    console.log('\nClient configuration:');
    console.log('  - clientId: tamshai-flutter-client');
    console.log('  - publicClient: true (PKCE enabled)');
    console.log('  - redirectUris: http://localhost:*/callback, http://127.0.0.1:*/callback');
    console.log('  - scopes: openid, profile, email, roles, offline_access');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
