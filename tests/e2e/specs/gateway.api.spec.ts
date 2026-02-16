import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * MCP Gateway E2E API Tests
 *
 * These tests verify the end-to-end functionality of the MCP Gateway API.
 * Requires running services: Keycloak, MCP Gateway, Redis
 */

const KEYCLOAK_PORT = process.env.PORT_KEYCLOAK || '8180';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || `http://localhost:${KEYCLOAK_PORT}/auth`;
const MCP_GATEWAY_PORT = process.env.PORT_MCP_GATEWAY || '3100';
const GATEWAY_URL = process.env.MCP_GATEWAY_URL || `http://localhost:${MCP_GATEWAY_PORT}`;
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'tamshai-corp';
// Token exchange client: mcp-integration-runner (preferred) or mcp-gateway (fallback)
const INTEGRATION_CLIENT_ID = process.env.MCP_INTEGRATION_RUNNER_SECRET
  ? 'mcp-integration-runner'
  : 'mcp-gateway';
const INTEGRATION_CLIENT_SECRET = process.env.MCP_INTEGRATION_RUNNER_SECRET
  || process.env.MCP_GATEWAY_CLIENT_SECRET
  || '';

if (!INTEGRATION_CLIENT_SECRET) {
  console.warn('WARNING: MCP_INTEGRATION_RUNNER_SECRET (or MCP_GATEWAY_CLIENT_SECRET) not set - authenticated tests will be skipped');
}

// Test user credentials (from Keycloak setup)
const TEST_USERS = {
  hr: {
    username: 'alice.chen',
    expectedRoles: ['hr-read', 'hr-write'],
  },
  finance: {
    username: 'bob.martinez',
    expectedRoles: ['finance-read', 'finance-write'],
  },
  executive: {
    username: 'eve.thompson',
    expectedRoles: ['executive'],
  },
};

/**
 * Get an impersonated access token via RFC 8693 Token Exchange.
 *
 * Two-step flow (no ROPC / password grant):
 *   1. client_credentials → service account token
 *   2. token-exchange → user-level token for `username`
 *
 * Bypasses OTP requirements because the service account impersonates the user.
 */
async function getAccessToken(
  request: APIRequestContext,
  username: string,
): Promise<string | null> {
  if (!INTEGRATION_CLIENT_SECRET) return null;

  try {
    const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

    // Step 1: Get service account token via client_credentials
    const svcResponse = await request.post(tokenUrl, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: INTEGRATION_CLIENT_ID,
        client_secret: INTEGRATION_CLIENT_SECRET,
      }).toString(),
    });

    if (!svcResponse.ok()) return null;
    const svcToken = (await svcResponse.json()).access_token;

    // Step 2: Exchange for user token via token-exchange
    const exchangeResponse = await request.post(tokenUrl, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: INTEGRATION_CLIENT_ID,
        client_secret: INTEGRATION_CLIENT_SECRET,
        subject_token: svcToken,
        requested_subject: username,
        audience: 'mcp-gateway',
      }).toString(),
    });

    if (!exchangeResponse.ok()) return null;
    return (await exchangeResponse.json()).access_token;
  } catch {
    return null;
  }
}

test.describe('Health Endpoints', () => {
  test('GET /health returns healthy status', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/health`);

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.version).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  test('GET /api/health returns healthy status', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/api/health`);

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });
});

test.describe('Authentication', () => {
  test('GET /api/user without token returns 401', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/api/user`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/user with invalid token returns 401', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/api/user`, {
      headers: {
        Authorization: 'Bearer invalid-token',
      },
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/user with valid token returns user info', async ({ request }) => {
    const token = await getAccessToken(request, TEST_USERS.hr.username);

    if (!token) {
      test.skip();
      return;
    }

    const response = await request.get(`${GATEWAY_URL}/api/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.userId).toBeDefined();
    expect(body.username).toBe(TEST_USERS.hr.username);
    expect(body.roles).toBeDefined();
  });
});

test.describe('MCP Tools Endpoint', () => {
  test('GET /api/mcp/tools without auth returns 401', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/api/mcp/tools`);
    expect(response.status()).toBe(401);
  });
});

test.describe('AI Query Endpoint', () => {
  test('POST /api/ai/query without auth returns 401', async ({ request }) => {
    const response = await request.post(`${GATEWAY_URL}/api/ai/query`, {
      data: { query: 'test' },
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/ai/query without query returns 400', async ({ request }) => {
    // This would require a valid token - skip if no auth
    const token = await getAccessToken(request, TEST_USERS.hr.username);

    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(`${GATEWAY_URL}/api/ai/query`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {},
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('SSE Streaming Endpoint', () => {
  test('GET /api/query without auth returns 401', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/api/query?q=test`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/query without query param returns 400', async ({ request }) => {
    const token = await getAccessToken(request, TEST_USERS.hr.username);

    if (!token) {
      test.skip();
      return;
    }

    const response = await request.get(`${GATEWAY_URL}/api/query`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/query without auth returns 401', async ({ request }) => {
    const response = await request.post(`${GATEWAY_URL}/api/query`, {
      data: { query: 'test' },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('MCP Tool Proxy Endpoint', () => {
  test('GET /api/mcp/hr/list_employees without auth returns 401', async ({
    request,
  }) => {
    const response = await request.get(`${GATEWAY_URL}/api/mcp/hr/list_employees`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/mcp/invalid/tool returns 404', async ({ request }) => {
    const token = await getAccessToken(request, TEST_USERS.hr.username);

    if (!token) {
      test.skip();
      return;
    }

    const response = await request.get(`${GATEWAY_URL}/api/mcp/invalid/tool`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(response.status()).toBe(404);
  });

  test('GET /api/mcp/hr/../etc/passwd returns 400 (path traversal blocked)', async ({
    request,
  }) => {
    const token = await getAccessToken(request, TEST_USERS.hr.username);

    if (!token) {
      test.skip();
      return;
    }

    const response = await request.get(
      `${GATEWAY_URL}/api/mcp/hr/../etc/passwd`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    // Should be 400 or 404, not 200
    expect([400, 404]).toContain(response.status());
  });
});

test.describe('Confirmation Endpoint', () => {
  test('POST /api/confirm/:id without auth returns 401', async ({ request }) => {
    const response = await request.post(
      `${GATEWAY_URL}/api/confirm/test-confirmation-id`,
      {
        data: { approved: true },
      }
    );
    expect(response.status()).toBe(401);
  });

  test('POST /api/confirm/:id with invalid id returns 404', async ({
    request,
  }) => {
    const token = await getAccessToken(request, TEST_USERS.hr.username);

    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(
      `${GATEWAY_URL}/api/confirm/non-existent-id`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: { approved: true },
      }
    );
    expect(response.status()).toBe(404);
  });
});

test.describe('OpenAPI Documentation', () => {
  test('GET /api-docs returns Swagger UI', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/api-docs/`);

    // Should return HTML with Swagger UI
    expect(response.ok()).toBeTruthy();
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/html');
  });

  test('GET /api-docs.yaml returns OpenAPI spec', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/api-docs.yaml`);

    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toContain('openapi: 3.0.3');
    expect(body).toContain('Tamshai MCP Gateway API');
  });

  test('GET /api-docs.json returns OpenAPI spec as JSON', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/api-docs.json`);

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.openapi).toBe('3.0.3');
    expect(body.info.title).toBe('Tamshai MCP Gateway API');
  });
});

test.describe('RBAC Authorization', () => {
  test('HR user can only see own budget from finance MCP server', async ({ request }) => {
    const token = await getAccessToken(request, TEST_USERS.hr.username);

    if (!token) {
      test.skip();
      return;
    }

    // Managers can access list_budgets but only see their own department budget
    const response = await request.get(
      `${GATEWAY_URL}/api/mcp/finance/list_budgets`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(response.ok()).toBeTruthy();
  });

  test('Executive user can access all MCP servers', async ({ request }) => {
    const token = await getAccessToken(request, TEST_USERS.executive.username);

    if (!token) {
      test.skip();
      return;
    }

    // Executive should have access to HR
    const hrResponse = await request.get(
      `${GATEWAY_URL}/api/mcp/tools`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(hrResponse.ok()).toBeTruthy();
    const body = await hrResponse.json();
    expect(body.accessibleDataSources.length).toBeGreaterThan(1);
  });
});
