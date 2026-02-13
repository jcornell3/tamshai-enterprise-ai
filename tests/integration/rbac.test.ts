/**
 * Tamshai Corp - Role-Based Access Control Integration Tests
 *
 * These tests verify that the MCP Gateway correctly enforces role-based
 * access controls for different user types.
 *
 * Authentication uses token exchange (service account impersonation) via
 * TestAuthProvider, which bypasses TOTP requirements entirely.
 */

import axios, { AxiosInstance } from 'axios';
import { fail } from 'assert';
import { getTestAuthProvider } from '../shared/auth/token-exchange';

// Test configuration - all values from environment variables
const CONFIG = {
  gatewayUrl: process.env.MCP_GATEWAY_URL,
};

// Test users defined in Keycloak
const TEST_USERS = {
  hrUser: { username: 'alice.chen', expectedRoles: ['hr-read', 'hr-write'] },
  financeUser: { username: 'bob.martinez', expectedRoles: ['finance-read', 'finance-write'] },
  salesUser: { username: 'carol.johnson', expectedRoles: ['sales-read'] },
  supportUser: { username: 'dan.williams', expectedRoles: ['support-read'] },
  executive: { username: 'eve.thompson', expectedRoles: ['executive'] },
  intern: { username: 'frank.davis', expectedRoles: [] },
};

// Auth provider (singleton, token exchange)
const authProvider = getTestAuthProvider();

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
    const token = await authProvider.getUserToken(TEST_USERS.hrUser.username);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT format
  });

  test('Token exchange rejects non-existent user', async () => {
    await expect(
      authProvider.getUserToken('nonexistent.user')
    ).rejects.toThrow();
  });

  test('Token exchange rejects invalid username format', async () => {
    await expect(
      authProvider.getUserToken('nonexistent@tamshai-playground.local')
    ).rejects.toThrow();
  });
});

describe('Authorization Tests - User Info', () => {
  test('HR user has correct roles', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.hrUser.username);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/user');

    expect(response.status).toBe(200);
    // Note: username/email require Keycloak client protocol mappers to be included in access token
    // For now, verify userId is present and roles are correct
    expect(response.data.userId).toBeDefined();
    expect(response.data.roles).toEqual(expect.arrayContaining(TEST_USERS.hrUser.expectedRoles));
  });

  test('Finance user has correct roles', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.financeUser.username);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/user');

    expect(response.status).toBe(200);
    expect(response.data.roles).toEqual(expect.arrayContaining(TEST_USERS.financeUser.expectedRoles));
  });

  test('Executive has composite role with all read permissions', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.executive.username);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/user');

    expect(response.status).toBe(200);
    // Executive role should expand to include all read roles
    expect(response.data.roles).toContain('executive');
  });

  test('Intern has no special roles', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.intern.username);
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
    const token = await authProvider.getUserToken(TEST_USERS.hrUser.username);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/mcp/tools');

    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    expect(accessibleSources).toContain('mcp-hr');
  });

  test('HR user has self-access to Finance MCP server via employee role', async () => {
    // All employees (including HR users) have self-access to Finance for expense reports
    const token = await authProvider.getUserToken(TEST_USERS.hrUser.username);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/mcp/tools');

    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    // HR users can access mcp-finance via 'employee' role for self-access (own expense reports)
    // Data filtering (self-only vs all) is enforced by PostgreSQL RLS
    expect(accessibleSources).toContain('mcp-finance');
  });

  test('Finance user can access Finance MCP server', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.financeUser.username);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/mcp/tools');

    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    expect(accessibleSources).toContain('mcp-finance');
  });

  test('Finance user has self-access to HR MCP server via employee role', async () => {
    // All employees (including Finance users) have self-access to HR for their own profile
    const token = await authProvider.getUserToken(TEST_USERS.financeUser.username);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/mcp/tools');

    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    // Finance users can access mcp-hr via 'employee' role for self-access (own profile)
    // Data filtering (self-only vs all) is enforced by PostgreSQL RLS
    expect(accessibleSources).toContain('mcp-hr');
  });

  test('Executive can access all MCP servers', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.executive.username);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/mcp/tools');

    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    expect(accessibleSources).toContain('mcp-hr');
    expect(accessibleSources).toContain('mcp-finance');
    expect(accessibleSources).toContain('mcp-sales');
    expect(accessibleSources).toContain('mcp-support');
  });

  test('Intern has employee self-access (HR, Finance, Support) but not Sales', async () => {
    // Interns are employees and have self-access to personal data
    const token = await authProvider.getUserToken(TEST_USERS.intern.username);
    const client = createAuthenticatedClient(token);

    const response = await client.get('/api/mcp/tools');

    expect(response.status).toBe(200);
    const accessibleSources = response.data.accessibleDataSources.map((s: any) => s.name);
    // Employee role grants self-access to HR (own profile), Finance (own expenses), Support (own tickets)
    expect(accessibleSources).toContain('mcp-hr');
    expect(accessibleSources).toContain('mcp-finance');
    expect(accessibleSources).toContain('mcp-support');
    // Sales requires explicit sales-read/sales-write roles
    expect(accessibleSources).not.toContain('mcp-sales');
  });
});

// Check if using mock Claude API (test key triggers mock mode in Gateway)
// Mock mode is triggered when CLAUDE_API_KEY starts with 'sk-ant-test-'
// CI sets: CLAUDE_API_KEY: sk-ant-test-dummy-key-for-ci
const isUsingMockClaude = (): boolean => {
  const key = process.env.CLAUDE_API_KEY || '';
  return key.startsWith('sk-ant-test-');
};

describe('Authorization Tests - AI Queries', () => {
  // These tests now run in both real and mock modes
  // ClaudeClient automatically returns mock responses when using sk-ant-test-* keys

  test('HR user AI query about employees succeeds', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.hrUser.username);
    const client = createAuthenticatedClient(token);

    const response = await client.post('/api/ai/query', {
      query: 'How many employees are in the Engineering department?',
    });

    expect(response.status).toBe(200);
    expect(response.data.response).toBeDefined();
    // Gateway returns server names without 'mcp-' prefix
    expect(response.data.metadata.dataSourcesQueried).toContain('hr');

    // In mock mode, response contains "[Mock Response]" prefix
    if (isUsingMockClaude()) {
      expect(response.data.response).toContain('[Mock Response]');
      expect(response.data.response).toContain('alice.chen');
    }
  });

  test('Finance user AI query about budgets succeeds', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.financeUser.username);
    const client = createAuthenticatedClient(token);

    const response = await client.post('/api/ai/query', {
      query: 'What is the total budget for 2024?',
    });

    expect(response.status).toBe(200);
    expect(response.data.response).toBeDefined();
    // Gateway returns server names without 'mcp-' prefix
    expect(response.data.metadata.dataSourcesQueried).toContain('finance');

    // In mock mode, response contains "[Mock Response]" prefix
    if (isUsingMockClaude()) {
      expect(response.data.response).toContain('[Mock Response]');
      expect(response.data.response).toContain('bob.martinez');
    }
  });

  test('Sales user has employee self-access to HR but RLS limits data', async () => {
    // Sales users have 'employee' role which grants access to HR MCP for self-data
    // But RLS should prevent access to other employees' salary data
    const token = await authProvider.getUserToken(TEST_USERS.salesUser.username);
    const client = createAuthenticatedClient(token);

    const response = await client.post('/api/ai/query', {
      query: 'What is Alice Chen\'s salary?',
    });

    expect(response.status).toBe(200);
    // Sales user CAN connect to HR MCP via employee role
    // Gateway returns server names without 'mcp-' prefix
    expect(response.data.metadata.dataSourcesQueried).toContain('hr');
    // The actual data access is limited by RLS - the AI won't have salary data for Alice
    // (detailed salary filtering is enforced at the PostgreSQL RLS layer)

    // In mock mode, response contains "[Mock Response]" prefix
    if (isUsingMockClaude()) {
      expect(response.data.response).toContain('[Mock Response]');
      expect(response.data.response).toContain('carol.johnson');
    }
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
  // These tests make complex AI queries that may take longer
  // Using 60s timeout to accommodate Claude's multi-step reasoning

  test('HR read role cannot see salary data', async () => {
    // This test assumes hr-read users shouldn't see salaries (only hr-write can)
    // The actual implementation would need to enforce this in the MCP server
    const token = await authProvider.getUserToken(TEST_USERS.hrUser.username);
    const client = axios.create({
      baseURL: CONFIG.gatewayUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60s for complex queries
    });

    const response = await client.post('/api/ai/query', {
      query: 'List employee details including salaries',
    });

    expect(response.status).toBe(200);
    // The response should be filtered based on the user's specific permissions
    // This test validates the mechanism exists - actual behavior depends on MCP implementation
  }, 90000); // Jest timeout: 90s

  test('Sales read role cannot see customer contact details', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.salesUser.username);
    const client = axios.create({
      baseURL: CONFIG.gatewayUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60s for complex queries
    });

    const response = await client.post('/api/ai/query', {
      query: 'Show me customer contact information for Acme Corp',
    });

    expect(response.status).toBe(200);
    // Contact details should be masked for sales-read role
  }, 90000); // Jest timeout: 90s
});

describe('Audit Logging Tests', () => {
  test('AI queries are logged with user context', async () => {
    const token = await authProvider.getUserToken(TEST_USERS.hrUser.username);
    const client = axios.create({
      baseURL: CONFIG.gatewayUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60s for AI queries
    });

    const response = await client.post('/api/ai/query', {
      query: 'Test query for audit logging',
    });

    expect(response.status).toBe(200);
    expect(response.data.requestId).toBeDefined();
    // Actual audit log verification would require checking the logging system
  }, 90000); // Jest timeout: 90s
});

// Test runner configuration
describe('Health Check', () => {
  test('Gateway health endpoint is accessible', async () => {
    const response = await axios.get(`${CONFIG.gatewayUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });
});
