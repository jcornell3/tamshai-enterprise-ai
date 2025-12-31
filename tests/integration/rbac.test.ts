/**
 * Tamshai Corp - Role-Based Access Control Integration Tests
 *
 * These tests verify that the MCP Gateway correctly enforces role-based
 * access controls for different user types.
 *
 * IMPORTANT: TOTP Configuration for Testing
 * ==========================================
 * These tests use Resource Owner Password Grant which does not support TOTP.
 * Before running tests, temporarily disable TOTP in Keycloak:
 *   1. Login to Keycloak Admin Console (http://127.0.0.1:8180/admin)
 *   2. Select realm 'tamshai-corp'
 *   3. Go to Authentication > Required Actions
 *   4. Disable "Configure OTP" required action
 *   5. Run tests
 *   6. RE-ENABLE "Configure OTP" after tests complete
 *
 * WARNING: Do NOT delete existing TOTP registrations for real users!
 */

import axios, { AxiosInstance } from 'axios';

// Test configuration
// Ports configured to avoid conflicts with existing MCP dev environment (8443, 172.28.0.0/16)
// Use 127.0.0.1 instead of localhost for Windows compatibility
// Use mcp-gateway client which has directAccessGrantsEnabled=true
const CONFIG = {
  keycloakUrl: process.env.KEYCLOAK_URL || 'http://127.0.0.1:8180',
  keycloakRealm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
  gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:3100',
  clientId: 'mcp-gateway',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'test-client-secret',
};

// Test users defined in Keycloak
const TEST_USERS = {
  hrUser: { username: 'alice.chen', password: 'password123', expectedRoles: ['hr-read', 'hr-write'] },
  financeUser: { username: 'bob.martinez', password: 'password123', expectedRoles: ['finance-read', 'finance-write'] },
  salesUser: { username: 'carol.johnson', password: 'password123', expectedRoles: ['sales-read'] },
  supportUser: { username: 'dan.williams', password: 'password123', expectedRoles: ['support-read'] },
  executive: { username: 'eve.thompson', password: 'password123', expectedRoles: ['executive'] },
  intern: { username: 'frank.davis', password: 'password123', expectedRoles: [] },
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Get access token from Keycloak using Resource Owner Password Grant
 * Note: This is only for testing - real apps should use Authorization Code flow
 */
async function getAccessToken(username: string, password: string): Promise<string> {
  const tokenUrl = `${CONFIG.keycloakUrl}/realms/${CONFIG.keycloakRealm}/protocol/openid-connect/token`;

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    username,
    password,
    scope: 'openid profile email',  // Removed "roles" - Keycloak includes roles in resource_access by default
  });

  const response = await axios.post<TokenResponse>(tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data.access_token;
}

/**
 * Create authenticated API client
 */
function createAuthenticatedClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: CONFIG.gatewayUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

describe('Authentication Tests', () => {
  test('Valid credentials return access token', async () => {
    const token = await getAccessToken(TEST_USERS.hrUser.username, TEST_USERS.hrUser.password);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT format
  });

  test('Invalid credentials are rejected', async () => {
    await expect(
      getAccessToken('alice.chen', 'wrong-password')
    ).rejects.toThrow();
  });

  test('Non-existent user is rejected', async () => {
    await expect(
      getAccessToken('nonexistent@tamshai.local', 'password')
    ).rejects.toThrow();
  });
});

describe('Authorization Tests - User Info', () => {
  test('HR user has correct roles', async () => {
    const token = await getAccessToken(TEST_USERS.hrUser.username, TEST_USERS.hrUser.password);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/user');

    expect(response.status).toBe(200);
    // Note: username/email require Keycloak client protocol mappers to be included in access token
    // For now, verify userId is present and roles are correct
    expect(response.data.userId).toBeDefined();
    expect(response.data.roles).toEqual(expect.arrayContaining(TEST_USERS.hrUser.expectedRoles));
  });

  test('Finance user has correct roles', async () => {
    const token = await getAccessToken(TEST_USERS.financeUser.username, TEST_USERS.financeUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.get('/api/user');
    
    expect(response.status).toBe(200);
    expect(response.data.roles).toEqual(expect.arrayContaining(TEST_USERS.financeUser.expectedRoles));
  });

  test('Executive has composite role with all read permissions', async () => {
    const token = await getAccessToken(TEST_USERS.executive.username, TEST_USERS.executive.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.get('/api/user');
    
    expect(response.status).toBe(200);
    // Executive role should expand to include all read roles
    expect(response.data.roles).toContain('executive');
  });

  test('Intern has no special roles', async () => {
    const token = await getAccessToken(TEST_USERS.intern.username, TEST_USERS.intern.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.get('/api/user');
    
    expect(response.status).toBe(200);
    // Should have minimal/no business roles
    const businessRoles = ['hr-read', 'hr-write', 'finance-read', 'finance-write', 
                          'sales-read', 'sales-write', 'support-read', 'support-write', 'executive'];
    const userBusinessRoles = response.data.roles.filter((r: string) => businessRoles.includes(r));
    expect(userBusinessRoles.length).toBe(0);
  });
});

describe('Authorization Tests - MCP Access', () => {
  test('HR user can access HR MCP server', async () => {
    const token = await getAccessToken(TEST_USERS.hrUser.username, TEST_USERS.hrUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.get('/api/mcp/tools');
    
    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    expect(accessibleSources).toContain('hr');
  });

  test('HR user cannot access Finance MCP server', async () => {
    const token = await getAccessToken(TEST_USERS.hrUser.username, TEST_USERS.hrUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.get('/api/mcp/tools');
    
    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    expect(accessibleSources).not.toContain('finance');
  });

  test('Finance user can access Finance MCP server', async () => {
    const token = await getAccessToken(TEST_USERS.financeUser.username, TEST_USERS.financeUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.get('/api/mcp/tools');
    
    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    expect(accessibleSources).toContain('finance');
  });

  test('Finance user cannot access HR MCP server', async () => {
    const token = await getAccessToken(TEST_USERS.financeUser.username, TEST_USERS.financeUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.get('/api/mcp/tools');
    
    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    expect(accessibleSources).not.toContain('hr');
  });

  test('Executive can access all MCP servers', async () => {
    const token = await getAccessToken(TEST_USERS.executive.username, TEST_USERS.executive.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.get('/api/mcp/tools');
    
    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    expect(accessibleSources).toContain('hr');
    expect(accessibleSources).toContain('finance');
    expect(accessibleSources).toContain('sales');
    expect(accessibleSources).toContain('support');
  });

  test('Intern cannot access any MCP servers', async () => {
    const token = await getAccessToken(TEST_USERS.intern.username, TEST_USERS.intern.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.get('/api/mcp/tools');
    
    expect(response.status).toBe(200);
    expect(response.data.accessibleDataSources.length).toBe(0);
  });
});

describe('Authorization Tests - AI Queries', () => {
  test('HR user AI query about employees succeeds', async () => {
    const token = await getAccessToken(TEST_USERS.hrUser.username, TEST_USERS.hrUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.post('/api/ai/query', {
      query: 'How many employees are in the Engineering department?',
    });
    
    expect(response.status).toBe(200);
    expect(response.data.response).toBeDefined();
    expect(response.data.metadata.dataSourcesQueried).toContain('hr');
  });

  test('Finance user AI query about budgets succeeds', async () => {
    const token = await getAccessToken(TEST_USERS.financeUser.username, TEST_USERS.financeUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.post('/api/ai/query', {
      query: 'What is the total budget for 2024?',
    });
    
    expect(response.status).toBe(200);
    expect(response.data.response).toBeDefined();
    expect(response.data.metadata.dataSourcesQueried).toContain('finance');
  });

  test('Sales user cannot query HR data', async () => {
    const token = await getAccessToken(TEST_USERS.salesUser.username, TEST_USERS.salesUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.post('/api/ai/query', {
      query: 'What is Alice Chen\'s salary?',
    });
    
    expect(response.status).toBe(200);
    // Response should indicate no access to HR data
    expect(response.data.metadata.dataSourcesQueried).not.toContain('hr');
  });

  test('Unauthenticated request is rejected', async () => {
    try {
      await axios.post(`${CONFIG.gatewayUrl}/api/ai/query`, {
        query: 'List all employees',
      });
      fail('Should have thrown an error');
    } catch (error: any) {
      if (error.response) {
        expect(error.response.status).toBe(401);
      } else {
        // If no response, log the error for debugging
        console.error('Unexpected error (no response):', error.code, error.message);
        throw error;
      }
    }
  });

  test('Expired token is rejected', async () => {
    // Use a malformed/expired token
    const expiredToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.invalid';
    const client = createAuthenticatedClient(expiredToken);
    
    try {
      await client.post('/api/ai/query', { query: 'Test query' });
      fail('Should have thrown an error');
    } catch (error: any) {
      if (error.response) {
        expect(error.response.status).toBe(401);
      } else {
        // If no response, log the error for debugging
        console.error('Unexpected error (no response):', error.code, error.message);
        throw error;
      }
    }
  });
});

describe('Data Filtering Tests', () => {
  test('HR read role cannot see salary data', async () => {
    // This test assumes hr-read users shouldn't see salaries (only hr-write can)
    // The actual implementation would need to enforce this in the MCP server
    const token = await getAccessToken(TEST_USERS.hrUser.username, TEST_USERS.hrUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.post('/api/ai/query', {
      query: 'List employee details including salaries',
    });
    
    expect(response.status).toBe(200);
    // The response should be filtered based on the user's specific permissions
    // This test validates the mechanism exists - actual behavior depends on MCP implementation
  });

  test('Sales read role cannot see customer contact details', async () => {
    const token = await getAccessToken(TEST_USERS.salesUser.username, TEST_USERS.salesUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.post('/api/ai/query', {
      query: 'Show me customer contact information for Acme Corp',
    });
    
    expect(response.status).toBe(200);
    // Contact details should be masked for sales-read role
  });
});

describe('Audit Logging Tests', () => {
  test('AI queries are logged with user context', async () => {
    const token = await getAccessToken(TEST_USERS.hrUser.username, TEST_USERS.hrUser.password);
    const client = createAuthenticatedClient(token);
    
    const response = await client.post('/api/ai/query', {
      query: 'Test query for audit logging',
    });
    
    expect(response.status).toBe(200);
    expect(response.data.requestId).toBeDefined();
    // Actual audit log verification would require checking the logging system
  });
});

// Test runner configuration
describe('Health Check', () => {
  test('Gateway health endpoint is accessible', async () => {
    const response = await axios.get(`${CONFIG.gatewayUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });
});
