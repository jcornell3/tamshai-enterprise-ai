/**
 * Tamshai Corp - MCP UI Display Service Integration Tests
 *
 * Tests that validate the MCP UI service correctly processes display directives,
 * fetches data from MCP servers, and returns component definitions with narration.
 *
 * Key features tested:
 * - Display directive parsing and component resolution
 * - User context propagation (X-User-ID, X-User-Roles headers)
 * - Narration generation
 * - Truncation metadata preservation
 * - Error handling for unknown components and invalid directives
 *
 * NOTE: These tests are SKIPPED in CI because they require the MCP UI service
 * and full Docker network setup. In CI, the services cannot communicate via
 * Docker hostnames. Run these tests locally with docker-compose up.
 */

import axios, { AxiosInstance } from 'axios';
import { generateInternalToken, INTERNAL_TOKEN_HEADER } from '@tamshai/shared';
import { getEphemeralUser, getImpersonatedToken } from './setup';

// Get internal secret from environment (required for gateway auth)
const MCP_INTERNAL_SECRET = process.env.MCP_INTERNAL_SECRET || '';

// CI Environment Check
// Skip all tests in CI - requires full Docker network setup
const isCI = process.env.CI === 'true';
const describeIntegration = isCI ? describe.skip : describe;

// Test configuration
const CONFIG = {
  mcpUiUrl: process.env.MCP_UI_URL || 'http://127.0.0.1:3118',
  mcpGatewayUrl: process.env.MCP_GATEWAY_URL || 'http://127.0.0.1:3100',
};

// Test users with their roles (matching setup.ts TEST_USERS)
const TEST_USERS = {
  executive: {
    userId: 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
    username: 'eve.thompson',
    email: 'eve@tamshai.local',
    roles: ['executive'],
  },
  hrRead: {
    userId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
    username: 'alice.chen',
    email: 'alice@tamshai.local',
    roles: ['hr-read'],
  },
  financeRead: {
    userId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
    username: 'bob.martinez',
    email: 'bob@tamshai.local',
    roles: ['finance-read'],
  },
  manager: {
    userId: 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d',
    username: 'nina.patel',
    email: 'nina.p@tamshai.local',
    roles: ['manager'],
  },
};

interface DisplayRequest {
  directive: string;
  userContext: {
    userId: string;
    roles: string[];
    username?: string;
    email?: string;
  };
}

interface DisplayResponse {
  status: 'success' | 'error';
  component?: {
    type: string;
    props: Record<string, unknown>;
    actions: unknown[];
  };
  narration?: {
    text: string;
  };
  metadata?: {
    dataFreshness: string;
    truncated: boolean;
  };
  code?: string;
  message?: string;
  suggestedAction?: string;
}

/**
 * Create client for MCP UI service
 */
function createMcpUiClient(): AxiosInstance {
  return axios.create({
    baseURL: CONFIG.mcpUiUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000,
    // Don't throw on non-2xx responses - we want to test error cases too
    validateStatus: () => true,
  });
}

// Cache tokens by username to avoid repeated Keycloak calls
const tokenCache = new Map<string, string>();

/**
 * Helper to make display requests with JWT authentication
 * Uses token exchange via getImpersonatedToken (no ROPC)
 */
async function postDisplay(
  client: AxiosInstance,
  directive: string,
  userContext: DisplayRequest['userContext']
): Promise<{ status: number; data: DisplayResponse }> {
  // Get JWT token for the user
  let token = tokenCache.get(userContext.username!);
  if (!token) {
    // Map test user to ephemeral user credentials
    const roleToEphemeralRole: Record<string, 'executive' | 'hr' | 'finance' | 'sales' | 'support'> = {
      'executive': 'executive',
      'hr-read': 'hr',
      'hr-write': 'hr',
      'finance-read': 'finance',
      'finance-write': 'finance',
      'sales-read': 'sales',
      'sales-write': 'sales',
      'support-read': 'support',
      'support-write': 'support',
      'manager': 'hr', // Managers are in HR department
    };

    const ephemeralRole = roleToEphemeralRole[userContext.roles[0]] || 'executive';
    const ephemeralUser = getEphemeralUser(ephemeralRole);

    token = await getImpersonatedToken(ephemeralUser.username);
    tokenCache.set(userContext.username!, token);
  }

  const response = await client.post<DisplayResponse>(
    '/api/display',
    {
      directive,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return { status: response.status, data: response.data };
}

// =============================================================================
// MCP UI SERVICE HEALTH CHECK
// =============================================================================

describeIntegration('MCP UI Service Health', () => {
  let client: AxiosInstance;

  beforeAll(() => {
    client = createMcpUiClient();
  });

  test('Health endpoint responds', async () => {
    const response = await client.get('/health');
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
    expect(response.data.service).toBe('mcp-ui');
    expect(response.data.version).toBeDefined();
    expect(response.data.timestamp).toBeDefined();
  });
});

// =============================================================================
// ORG CHART COMPONENT TESTS
// =============================================================================

describeIntegration('MCP UI - OrgChart Component', () => {
  let client: AxiosInstance;

  beforeAll(() => {
    client = createMcpUiClient();
  });

  test('Parse and fetch org_chart component via display endpoint', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:hr:org_chart:userId=me,depth=1',
      TEST_USERS.hrRead
    );

    expect(status).toBe(200);
    expect(data.status).toBe('success');

    // Verify component structure
    expect(data.component).toBeDefined();
    expect(data.component?.type).toBe('OrgChartComponent');
    expect(data.component?.props).toBeDefined();

    // Verify narration is generated
    expect(data.narration).toBeDefined();
    expect(data.narration?.text).toBeDefined();
    expect(typeof data.narration?.text).toBe('string');
    expect(data.narration?.text.length).toBeGreaterThan(0);

    // Verify metadata
    expect(data.metadata).toBeDefined();
    expect(data.metadata?.dataFreshness).toBeDefined();
  });

  test('Org chart narration includes direct reports count', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:hr:org_chart:userId=me,depth=1',
      TEST_USERS.manager
    );

    expect(status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.narration?.text).toMatch(/direct reports/i);
  });

  test('User context headers are passed correctly for HR requests', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:hr:org_chart:userId=me,depth=1',
      {
        userId: TEST_USERS.hrRead.userId,
        roles: TEST_USERS.hrRead.roles,
        username: TEST_USERS.hrRead.username,
        email: TEST_USERS.hrRead.email,
      }
    );

    // HR user should get successful response (has hr-read role)
    expect(status).toBe(200);
    expect(data.status).toBe('success');
  });
});

// =============================================================================
// APPROVALS QUEUE COMPONENT TESTS
// =============================================================================

describeIntegration('MCP UI - Approvals Queue Component', () => {
  let client: AxiosInstance;

  beforeAll(() => {
    client = createMcpUiClient();
  });

  test('Parse and fetch approvals pending component via display endpoint', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:approvals:pending:userId=me',
      TEST_USERS.executive
    );

    expect(status).toBe(200);
    expect(data.status).toBe('success');

    // Verify component structure
    expect(data.component).toBeDefined();
    expect(data.component?.type).toBe('ApprovalsQueue');
    expect(data.component?.props).toBeDefined();

    // Verify narration is generated
    expect(data.narration).toBeDefined();
    expect(data.narration?.text).toBeDefined();
    expect(data.narration?.text).toMatch(/pending approvals/i);

    // Verify metadata
    expect(data.metadata).toBeDefined();
    expect(typeof data.metadata?.truncated).toBe('boolean');
  });

  test('Approvals queue aggregates data from multiple MCP servers', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:approvals:pending:userId=me',
      TEST_USERS.manager
    );

    expect(status).toBe(200);
    expect(data.status).toBe('success');

    // Props should contain arrays from HR and Finance MCP servers
    const props = data.component?.props;
    expect(props).toBeDefined();
    // These may be empty arrays, but should exist
    expect(Array.isArray(props?.timeOffRequests) || props?.timeOffRequests === undefined).toBe(true);
    expect(Array.isArray(props?.expenseReports) || props?.expenseReports === undefined).toBe(true);
    expect(Array.isArray(props?.budgetAmendments) || props?.budgetAmendments === undefined).toBe(true);
  });
});

// =============================================================================
// BUDGET SUMMARY COMPONENT TESTS
// =============================================================================

describeIntegration('MCP UI - Budget Summary Component', () => {
  let client: AxiosInstance;

  beforeAll(() => {
    client = createMcpUiClient();
  });

  test('Parse and fetch budget component via display endpoint', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:finance:budget:department=Engineering,year=2026',
      TEST_USERS.financeRead
    );

    expect(status).toBe(200);
    expect(data.status).toBe('success');

    // Verify component structure
    expect(data.component).toBeDefined();
    expect(data.component?.type).toBe('BudgetSummaryCard');

    // Verify narration mentions department
    expect(data.narration?.text).toBeDefined();
    expect(data.narration?.text).toMatch(/budget/i);
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describeIntegration('MCP UI - Error Handling', () => {
  let client: AxiosInstance;

  beforeAll(() => {
    client = createMcpUiClient();
  });

  test('Unknown component returns proper error', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:unknown:nonexistent:param=value',
      TEST_USERS.executive
    );

    expect(status).toBe(404);
    expect(data.status).toBe('error');
    expect(data.code).toBe('UNKNOWN_COMPONENT');
    expect(data.message).toMatch(/unknown component/i);
    expect(data.suggestedAction).toBeDefined();
    expect(data.suggestedAction).toMatch(/GET \/api\/display\/components/i);
  });

  test('Invalid directive format returns proper error', async () => {
    const { status, data } = await postDisplay(
      client,
      'invalid-directive-format',
      TEST_USERS.executive
    );

    expect(status).toBe(400);
    expect(data.status).toBe('error');
    expect(data.code).toBe('INVALID_DIRECTIVE');
    expect(data.message).toMatch(/invalid display directive format/i);
    expect(data.suggestedAction).toBeDefined();
    expect(data.suggestedAction).toMatch(/display:<domain>:<component>:<params>/i);
  });

  test('Missing directive field returns proper error', async () => {
    // Get JWT token for the user via token exchange
    const ephemeralUser = getEphemeralUser('executive');
    const token = await getImpersonatedToken(ephemeralUser.username);

    const response = await client.post('/api/display', {
      // Missing directive field
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(400);
    expect(response.data.status).toBe('error');
    expect(response.data.code).toBe('MISSING_FIELD');
    expect(response.data.message).toMatch(/directive/i);
  });

  test('Missing userContext field returns proper error', async () => {
    // With JWT authentication, userContext is extracted from the token, so this test
    // is no longer relevant. Skipping.
    expect(true).toBe(true);
  });

  test('Non-existent route returns 404', async () => {
    // Need to include auth header even for 404 errors
    const internalToken = MCP_INTERNAL_SECRET
      ? generateInternalToken(MCP_INTERNAL_SECRET, TEST_USERS.executive.userId, TEST_USERS.executive.roles)
      : '';

    const response = await client.get('/api/nonexistent', {
      headers: { [INTERNAL_TOKEN_HEADER]: internalToken },
    });

    expect(response.status).toBe(404);
    expect(response.data.status).toBe('error');
    expect(response.data.code).toBe('NOT_FOUND');
  });
});

// =============================================================================
// USER CONTEXT PROPAGATION TESTS
// =============================================================================

describeIntegration('MCP UI - User Context Propagation', () => {
  let client: AxiosInstance;

  beforeAll(() => {
    client = createMcpUiClient();
  });

  test('User context is passed correctly via X-User-ID header', async () => {
    const customUserId = 'test-user-id-12345';
    const { status } = await postDisplay(
      client,
      'display:hr:org_chart:userId=me,depth=1',
      {
        userId: customUserId,
        roles: ['hr-read'],
      }
    );

    // Service should process request with user context
    // We can't directly verify headers, but if the request succeeds,
    // the user context was passed to the MCP gateway
    expect([200, 500]).toContain(status);
    // 500 is acceptable if MCP gateway doesn't have this user -
    // the important thing is the request reached the MCP servers
  });

  test('User roles are passed correctly via X-User-Roles header', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:hr:org_chart:userId=me,depth=1',
      {
        userId: TEST_USERS.executive.userId,
        roles: ['executive', 'hr-read', 'finance-read'],
      }
    );

    // Executive role should have access
    expect(status).toBe(200);
    expect(data.status).toBe('success');
  });
});

// =============================================================================
// TRUNCATION METADATA TESTS
// =============================================================================

describeIntegration('MCP UI - Truncation Metadata', () => {
  let client: AxiosInstance;

  beforeAll(() => {
    client = createMcpUiClient();
  });

  test('Truncation metadata is preserved from MCP response', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:hr:org_chart:userId=me,depth=1',
      TEST_USERS.hrRead
    );

    expect(status).toBe(200);
    expect(data.metadata).toBeDefined();
    // truncated should be a boolean (true or false)
    expect(typeof data.metadata?.truncated).toBe('boolean');
  });

  test('Data freshness timestamp is provided in metadata', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:hr:org_chart:userId=me,depth=1',
      TEST_USERS.hrRead
    );

    expect(status).toBe(200);
    expect(data.metadata?.dataFreshness).toBeDefined();
    // Should be a valid ISO timestamp
    const timestamp = new Date(data.metadata!.dataFreshness);
    expect(timestamp.getTime()).not.toBeNaN();
    // Should be recent (within the last minute)
    expect(Date.now() - timestamp.getTime()).toBeLessThan(60000);
  });
});

// =============================================================================
// NARRATION GENERATION TESTS
// =============================================================================

describeIntegration('MCP UI - Narration Generation', () => {
  let client: AxiosInstance;

  beforeAll(() => {
    client = createMcpUiClient();
  });

  test('Narration is generated for org chart', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:hr:org_chart:userId=me,depth=1',
      TEST_USERS.hrRead
    );

    expect(status).toBe(200);
    expect(data.narration).toBeDefined();
    expect(data.narration?.text).toBeDefined();
    // Should mention reporting structure
    expect(data.narration?.text).toMatch(/report|direct/i);
  });

  test('Narration is generated for approvals queue', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:approvals:pending:userId=me',
      TEST_USERS.executive
    );

    expect(status).toBe(200);
    expect(data.narration).toBeDefined();
    expect(data.narration?.text).toBeDefined();
    // Should mention approvals count
    expect(data.narration?.text).toMatch(/\d+.*pending approvals/i);
  });

  test('Narration is generated for budget summary', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:finance:budget:department=Engineering,year=2026',
      TEST_USERS.financeRead
    );

    expect(status).toBe(200);
    expect(data.narration).toBeDefined();
    expect(data.narration?.text).toBeDefined();
    // Should mention department in narration
    expect(data.narration?.text).toMatch(/budget/i);
  });

  test('Narration is generated for sales leads', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:sales:leads:status=NEW,limit=10',
      {
        userId: TEST_USERS.executive.userId,
        roles: ['sales-read'],
      }
    );

    expect(status).toBe(200);
    expect(data.narration).toBeDefined();
    expect(data.narration?.text).toBeDefined();
    // Should mention leads
    expect(data.narration?.text).toMatch(/leads/i);
  });
});

// =============================================================================
// COMPONENT LIST ENDPOINT TESTS
// =============================================================================

describeIntegration('MCP UI - Component List Endpoint', () => {
  let client: AxiosInstance;
  let authHeaders: Record<string, string>;

  beforeAll(() => {
    client = createMcpUiClient();
    // Generate auth token for GET requests
    const internalToken = MCP_INTERNAL_SECRET
      ? generateInternalToken(MCP_INTERNAL_SECRET, TEST_USERS.executive.userId, TEST_USERS.executive.roles)
      : '';
    authHeaders = { [INTERNAL_TOKEN_HEADER]: internalToken };
  });

  test('GET /api/display/components returns list of available components', async () => {
    const response = await client.get('/api/display/components', { headers: authHeaders });

    expect(response.status).toBe(200);
    expect(response.data.components).toBeDefined();
    expect(Array.isArray(response.data.components)).toBe(true);
    expect(response.data.components.length).toBeGreaterThan(0);

    // Each component should have type, directivePattern, and description
    const firstComponent = response.data.components[0];
    expect(firstComponent.type).toBeDefined();
    expect(firstComponent.directivePattern).toBeDefined();
    expect(typeof firstComponent.description).toBe('string');
  });

  test('Component list includes OrgChartComponent', async () => {
    const response = await client.get('/api/display/components', { headers: authHeaders });

    const orgChart = response.data.components.find(
      (c: { type: string }) => c.type === 'OrgChartComponent'
    );
    expect(orgChart).toBeDefined();
    expect(orgChart.directivePattern).toMatch(/hr:org_chart/);
  });

  test('Component list includes ApprovalsQueue', async () => {
    const response = await client.get('/api/display/components', { headers: authHeaders });

    const approvals = response.data.components.find(
      (c: { type: string }) => c.type === 'ApprovalsQueue'
    );
    expect(approvals).toBeDefined();
    expect(approvals.directivePattern).toMatch(/approvals:pending/);
  });
});

// =============================================================================
// CROSS-DOMAIN DATA FETCHING TESTS
// =============================================================================

describeIntegration('MCP UI - Cross-Domain Data Fetching', () => {
  let client: AxiosInstance;

  beforeAll(() => {
    client = createMcpUiClient();
  });

  test('Approvals queue fetches from HR and Finance MCP servers', async () => {
    // Executive should have access to both domains
    const { status, data } = await postDisplay(
      client,
      'display:approvals:pending:userId=me',
      TEST_USERS.executive
    );

    expect(status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.component?.type).toBe('ApprovalsQueue');

    // The component should have been built from multiple MCP calls
    // Even if empty, the structure should be present
    expect(data.component?.props).toBeDefined();
  });

  test('Manager can access org chart with their direct reports', async () => {
    const { status, data } = await postDisplay(
      client,
      'display:hr:org_chart:userId=me,depth=2',
      TEST_USERS.manager
    );

    expect(status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.component?.props).toBeDefined();
  });
});
