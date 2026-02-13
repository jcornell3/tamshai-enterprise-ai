/**
 * Tamshai Corp - Customer Support Portal Integration Tests
 *
 * These tests verify the customer support functionality including:
 * - Customer realm authentication (tamshai-customers)
 * - Lead vs Basic customer role enforcement
 * - Organization-level data filtering
 * - Customer tool endpoints
 *
 * Prerequisites:
 * - Docker environment running (docker-compose up)
 * - Customer realm provisioned (keycloak/realm-export-customers-dev.json)
 * - MongoDB with sample data loaded
 *
 * Environment Variables (from .env, no hardcoded defaults):
 * - KEYCLOAK_URL: Keycloak base URL (derived from PORT_KEYCLOAK)
 * - MCP_SUPPORT_URL: MCP Support service URL (derived from PORT_MCP_SUPPORT)
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { fail } from 'assert';

// Test configuration - all values from environment variables
const CONFIG = {
  keycloakUrl: process.env.KEYCLOAK_URL,
  keycloakCustomerRealm: process.env.KEYCLOAK_CUSTOMER_REALM,
  mcpSupportUrl: process.env.MCP_SUPPORT_URL,
  clientId: 'customer-portal',
  mcpInternalSecret: process.env.MCP_INTERNAL_SECRET!,
};

// Flag to track if customer realm is available
let customerRealmAvailable = true;

/**
 * Check if customer realm exists in Keycloak
 * This allows tests to skip gracefully in CI environments where
 * the customer realm hasn't been set up yet.
 */
async function checkCustomerRealmAvailable(): Promise<boolean> {
  try {
    const realmUrl = `${CONFIG.keycloakUrl}/realms/${CONFIG.keycloakCustomerRealm}/.well-known/openid-configuration`;
    await axios.get(realmUrl, { timeout: 5000 });
    return true;
  } catch {
    console.log(`\n⚠️  Customer realm '${CONFIG.keycloakCustomerRealm}' not available - skipping customer support tests`);
    console.log(`   To run these tests locally, provision the customer realm using:`);
    console.log(`   keycloak/scripts/docker-sync-realm.sh dev tamshai-keycloak customers\n`);
    return false;
  }
}

// Check realm availability before all tests
beforeAll(async () => {
  customerRealmAvailable = await checkCustomerRealmAvailable();
});

// Customer test password from environment variable (GitHub Secret: CUSTOMER_USER_PASSWORD)
const CUSTOMER_PASSWORD = process.env.CUSTOMER_USER_PASSWORD || '***REDACTED_PASSWORD***';

// Customer test users from realm-export-customers-dev.json
const CUSTOMER_USERS = {
  leadAcme: {
    username: 'jane.smith@acme.com',
    password: CUSTOMER_PASSWORD,
    organizationId: 'org-acme-001',
    organizationName: 'Acme Corporation',
    role: 'lead-customer',
  },
  basicAcme: {
    username: 'bob.developer@acme.com',
    password: CUSTOMER_PASSWORD,
    organizationId: 'org-acme-001',
    organizationName: 'Acme Corporation',
    role: 'basic-customer',
  },
  leadGlobex: {
    username: 'mike.manager@globex.com',
    password: CUSTOMER_PASSWORD,
    organizationId: 'org-globex-002',
    organizationName: 'Globex Industries',
    role: 'lead-customer',
  },
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
}

/**
 * Get access token from customer Keycloak realm using Password Grant
 */
async function getCustomerAccessToken(username: string, password: string): Promise<string> {
  const tokenUrl = `${CONFIG.keycloakUrl}/realms/${CONFIG.keycloakCustomerRealm}/protocol/openid-connect/token`;

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: CONFIG.clientId,
    username,
    password,
    scope: 'openid profile email organization',
  });

  const response = await axios.post<TokenResponse>(tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data.access_token;
}

/**
 * Create authenticated API client for MCP Support
 */
function createAuthenticatedClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: CONFIG.mcpSupportUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * Decode JWT payload (for debugging)
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64Payload = token.split('.')[1];
  const payload = Buffer.from(base64Payload, 'base64').toString('utf-8');
  return JSON.parse(payload);
}

/**
 * Generate internal token for MCP Gateway → MCP Server authentication
 * Mirrors the implementation in @tamshai/shared
 */
function generateInternalToken(userId: string, roles: string[]): string {
  const secret = CONFIG.mcpInternalSecret;
  const timestamp = Math.floor(Date.now() / 1000);
  const rolesString = roles.join(',');
  const payload = `${timestamp}:${userId}:${rolesString}`;

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return `${payload}.${hmac}`;
}

/**
 * Extract user context from JWT for MCP endpoints
 * MCP pattern: Gateway validates JWT and passes user context to downstream services
 */
function extractUserContextFromToken(token: string): Record<string, unknown> {
  const payload = decodeJwtPayload(token);
  return {
    userId: payload.sub,
    username: payload.preferred_username,
    email: payload.email,
    roles: (payload.realm_access as { roles?: string[] })?.roles || [],
    realm: 'customer', // Customer realm token
    organizationId: payload.organization_id,
    organizationName: payload.organization_name,
  };
}

/**
 * Make authenticated request to MCP Support with user context in body
 * Returns the full axios response for compatibility with existing tests
 */
async function mcpRequest(
  token: string,
  endpoint: string,
  data: Record<string, unknown> = {}
) {
  const userContext = extractUserContextFromToken(token);
  const internalToken = generateInternalToken(
    userContext.userId as string,
    userContext.roles as string[]
  );
  const response = await axios.post(`${CONFIG.mcpSupportUrl}${endpoint}`, {
    ...data,
    userContext,
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-MCP-Internal-Token': internalToken,
    },
    timeout: 30000,
  });
  return response;
}

/**
 * Create MCP client that adds userContext to requests
 * Compatible with existing test pattern: client.post(endpoint, data)
 *
 * IMPORTANT: The HMAC internal token is generated per-request (not cached)
 * because the MCP server enforces a 30-second replay window. Caching the
 * token at client creation time causes 401 errors when tests take longer
 * than 30 seconds to reach the server.
 */
function createMcpClient(token: string) {
  const userContext = extractUserContextFromToken(token);
  return {
    post: async (endpoint: string, data: Record<string, unknown> = {}) => {
      // Generate fresh HMAC token per-request to stay within 30s replay window
      const internalToken = generateInternalToken(
        userContext.userId as string,
        userContext.roles as string[]
      );
      return axios.post(`${CONFIG.mcpSupportUrl}${endpoint}`, {
        ...data,
        userContext,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-MCP-Internal-Token': internalToken,
        },
        timeout: 30000,
      });
    },
  };
}

describe('Customer Realm Authentication', () => {
  test('Lead customer can obtain access token', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT format

    // Verify token claims
    const payload = decodeJwtPayload(token);
    expect(payload.preferred_username).toBe(CUSTOMER_USERS.leadAcme.username);
    expect(payload.organization_id).toBe(CUSTOMER_USERS.leadAcme.organizationId);
    expect(payload.organization_name).toBe(CUSTOMER_USERS.leadAcme.organizationName);
  });

  test('Basic customer can obtain access token', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.basicAcme.username,
      CUSTOMER_USERS.basicAcme.password
    );

    expect(token).toBeDefined();

    const payload = decodeJwtPayload(token);
    expect(payload.preferred_username).toBe(CUSTOMER_USERS.basicAcme.username);
    expect(payload.organization_id).toBe(CUSTOMER_USERS.basicAcme.organizationId);
  });

  test('Invalid customer credentials are rejected', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    await expect(
      getCustomerAccessToken('jane.smith@acme.com', 'wrong-password')
    ).rejects.toThrow();
  });

  test('Customer token contains organization claims', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );

    const payload = decodeJwtPayload(token);

    // Organization claims must be present for customer portal
    expect(payload.organization_id).toBeDefined();
    expect(payload.organization_name).toBeDefined();
    expect(payload.organization_id).toBe('org-acme-001');
    expect(payload.organization_name).toBe('Acme Corporation');
  });

  test('Customer token contains correct realm roles', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const leadToken = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );
    const basicToken = await getCustomerAccessToken(
      CUSTOMER_USERS.basicAcme.username,
      CUSTOMER_USERS.basicAcme.password
    );

    const leadPayload = decodeJwtPayload(leadToken);
    const basicPayload = decodeJwtPayload(basicToken);

    // Check realm_access.roles contains customer roles
    const leadRoles = (leadPayload.realm_access as { roles: string[] })?.roles || [];
    const basicRoles = (basicPayload.realm_access as { roles: string[] })?.roles || [];

    expect(leadRoles).toContain('lead-customer');
    expect(basicRoles).toContain('basic-customer');
    expect(basicRoles).not.toContain('lead-customer');
  });
});

describe('MCP Support Health Check', () => {
  test('MCP Support service is healthy', async () => {
    const response = await axios.get(`${CONFIG.mcpSupportUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });
});

describe('Customer Tool Authorization', () => {
  test('Lead customer can access customer_list_tickets tool', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_list_tickets', {});

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    // Lead sees all org tickets
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('Basic customer can access customer_list_tickets tool', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.basicAcme.username,
      CUSTOMER_USERS.basicAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_list_tickets', {});

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    // Basic sees only own tickets
  });

  test('Lead customer can access customer_list_contacts tool', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_list_contacts', {});

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
  });

  test('Basic customer cannot access customer_list_contacts tool', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.basicAcme.username,
      CUSTOMER_USERS.basicAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_list_contacts', {});

    // Should return error, not throw
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('error');
    expect(response.data.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  test('Customer can search knowledge base', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.basicAcme.username,
      CUSTOMER_USERS.basicAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_search_kb', {
      query: 'password reset',
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });
});

describe('Organization Data Isolation', () => {
  test('Lead customer from different org cannot see Acme tickets', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    // Get ticket from Acme first
    const acmeToken = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );
    const acmeClient = createMcpClient(acmeToken);

    const acmeTicketsResponse = await acmeClient.post('/tools/customer_list_tickets', {});
    const acmeTickets = acmeTicketsResponse.data.data || [];

    if (acmeTickets.length > 0) {
      // Try to access Acme ticket from Globex user
      const globexToken = await getCustomerAccessToken(
        CUSTOMER_USERS.leadGlobex.username,
        CUSTOMER_USERS.leadGlobex.password
      );
      const globexClient = createMcpClient(globexToken);

      const response = await globexClient.post('/tools/customer_get_ticket', {
        ticketId: acmeTickets[0].ticket_id,
      });

      // Should get access denied or not found
      expect(['error'].includes(response.data.status)).toBe(true);
      expect(['ACCESS_DENIED', 'TICKET_NOT_FOUND'].includes(response.data.code)).toBe(true);
    }
  });

  test('Globex customer ticket list does not include Acme tickets', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const globexToken = await getCustomerAccessToken(
      CUSTOMER_USERS.leadGlobex.username,
      CUSTOMER_USERS.leadGlobex.password
    );
    const client = createMcpClient(globexToken);

    const response = await client.post('/tools/customer_list_tickets', {});

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');

    // All tickets should belong to Globex org
    const tickets = response.data.data || [];
    tickets.forEach((ticket: any) => {
      expect(ticket.organization_id).toBe(CUSTOMER_USERS.leadGlobex.organizationId);
    });
  });
});

describe('Internal Notes Security', () => {
  test('Customer cannot see internal_notes on tickets', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_list_tickets', {});

    expect(response.status).toBe(200);
    const tickets = response.data.data || [];

    // CRITICAL: internal_notes must NEVER be exposed
    tickets.forEach((ticket: any) => {
      expect(ticket.internal_notes).toBeUndefined();
    });
  });

  test('Customer cannot see internal_notes on single ticket', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );
    const client = createMcpClient(token);

    // First get a ticket ID
    const listResponse = await client.post('/tools/customer_list_tickets', {});
    const tickets = listResponse.data.data || [];

    if (tickets.length > 0) {
      const ticketResponse = await client.post('/tools/customer_get_ticket', {
        ticketId: tickets[0].ticket_id,
      });

      expect(ticketResponse.status).toBe(200);
      expect(ticketResponse.data.data.internal_notes).toBeUndefined();
    }
  });
});

describe('Ticket Operations', () => {
  test('Customer can create a ticket', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.basicAcme.username,
      CUSTOMER_USERS.basicAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_submit_ticket', {
      title: 'Integration Test Ticket',
      description: 'This is an integration test ticket created during automated testing. Please ignore.',
      category: 'technical',
      priority: 'low',
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(response.data.data.ticketId).toBeDefined();
    expect(response.data.data.ticketId).toMatch(/^TKT-/);
  });

  test('Customer can add comment to own ticket', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.basicAcme.username,
      CUSTOMER_USERS.basicAcme.password
    );
    const client = createMcpClient(token);

    // First create a ticket
    const createResponse = await client.post('/tools/customer_submit_ticket', {
      title: 'Ticket for Comment Test',
      description: 'Integration test ticket for testing comment functionality.',
      category: 'general',
    });

    if (createResponse.data.status === 'success') {
      const ticketId = createResponse.data.data.ticketId;

      // Add comment
      const commentResponse = await client.post('/tools/customer_add_comment', {
        ticketId,
        content: 'This is a test comment from integration tests.',
      });

      expect(commentResponse.status).toBe(200);
      expect(commentResponse.data.status).toBe('success');
    }
  });
});

describe('Lead-Only Operations', () => {
  test('Lead customer can initiate contact invite (pending confirmation)', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_invite_contact', {
      email: `test-invite-${Date.now()}@acme.com`,
      firstName: 'Test',
      lastName: 'Invite',
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('pending_confirmation');
    expect(response.data.confirmationId).toBeDefined();
    expect(response.data.message).toContain('Invite new contact');
  });

  test('Basic customer cannot invite contacts', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.basicAcme.username,
      CUSTOMER_USERS.basicAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_invite_contact', {
      email: 'should-fail@acme.com',
      firstName: 'Should',
      lastName: 'Fail',
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('error');
    expect(response.data.code).toBe('INSUFFICIENT_PERMISSIONS');
  });
});

describe('Error Handling', () => {
  test('Request without authentication returns 401', async () => {
    // Gateway-auth middleware validates internal token before checking userContext
    // Requests without X-MCP-Internal-Token header are rejected with 401
    try {
      await axios.post(`${CONFIG.mcpSupportUrl}/tools/customer_list_tickets`, {});
      fail('Should have thrown an error');
    } catch (error: any) {
      if (error.response) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.code).toBe('MISSING_GATEWAY_TOKEN');
      } else {
        throw error;
      }
    }
  });

  test('Invalid ticket ID returns appropriate error', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.leadAcme.username,
      CUSTOMER_USERS.leadAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_get_ticket', {
      ticketId: 'NONEXISTENT-TICKET-ID',
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('error');
    expect(response.data.code).toBe('TICKET_NOT_FOUND');
    expect(response.data.suggestedAction).toBeDefined();
  });

  test('Validation error for short ticket title', async () => {
    if (!customerRealmAvailable) return; // Skip if customer realm not available

    const token = await getCustomerAccessToken(
      CUSTOMER_USERS.basicAcme.username,
      CUSTOMER_USERS.basicAcme.password
    );
    const client = createMcpClient(token);

    const response = await client.post('/tools/customer_submit_ticket', {
      title: 'Hi', // Too short
      description: 'This description is long enough but title is too short.',
      category: 'general',
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('error');
    expect(response.data.code).toBe('VALIDATION_ERROR');
  });
});
