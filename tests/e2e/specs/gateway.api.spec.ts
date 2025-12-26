import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * MCP Gateway E2E API Tests
 *
 * These tests verify the end-to-end functionality of the MCP Gateway API.
 * Requires running services: Keycloak, MCP Gateway, Redis
 */

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8180';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3100';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'tamshai-corp';

// Test user credentials (from Keycloak setup)
const TEST_USERS = {
  hr: {
    username: 'alice.chen',
    password: 'password123',
    expectedRoles: ['hr-read', 'hr-write'],
  },
  finance: {
    username: 'bob.martinez',
    password: 'password123',
    expectedRoles: ['finance-read', 'finance-write'],
  },
  executive: {
    username: 'eve.thompson',
    password: 'password123',
    expectedRoles: ['executive'],
  },
};

/**
 * Get access token from Keycloak using password grant
 * Note: Password grant is for testing only
 */
async function getAccessToken(
  request: APIRequestContext,
  username: string,
  password: string,
  totp?: string
): Promise<string | null> {
  try {
    const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: 'mcp-gateway',
      username,
      password,
      scope: 'openid',
    });

    if (totp) {
      params.append('totp', totp);
    }

    const response = await request.post(tokenUrl, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: params.toString(),
    });

    if (response.ok()) {
      const data = await response.json();
      return data.access_token;
    }

    return null;
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

  test.skip('GET /api/user with valid token returns user info', async ({ request }) => {
    // Skip if Keycloak is not available
    const token = await getAccessToken(
      request,
      TEST_USERS.hr.username,
      TEST_USERS.hr.password
    );

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
    const token = await getAccessToken(
      request,
      TEST_USERS.hr.username,
      TEST_USERS.hr.password
    );

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
    const token = await getAccessToken(
      request,
      TEST_USERS.hr.username,
      TEST_USERS.hr.password
    );

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
    const token = await getAccessToken(
      request,
      TEST_USERS.hr.username,
      TEST_USERS.hr.password
    );

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
    const token = await getAccessToken(
      request,
      TEST_USERS.hr.username,
      TEST_USERS.hr.password
    );

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
    const token = await getAccessToken(
      request,
      TEST_USERS.hr.username,
      TEST_USERS.hr.password
    );

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
  test.skip('HR user cannot access finance MCP server', async ({ request }) => {
    const token = await getAccessToken(
      request,
      TEST_USERS.hr.username,
      TEST_USERS.hr.password
    );

    if (!token) {
      test.skip();
      return;
    }

    const response = await request.get(
      `${GATEWAY_URL}/api/mcp/finance/list_budgets`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('ACCESS_DENIED');
  });

  test.skip('Executive user can access all MCP servers', async ({ request }) => {
    const token = await getAccessToken(
      request,
      TEST_USERS.executive.username,
      TEST_USERS.executive.password
    );

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
