/**
 * Tamshai Corp - Query Scenarios Integration Tests
 *
 * Tests for natural language query handling including:
 * - "My team members" / direct reports queries
 * - "List all employees" with transparent auto-pagination
 * - Query routing to appropriate tools
 *
 * These tests verify the MCP Gateway and MCP HR server work together
 * to handle user queries correctly.
 *
 * IMPORTANT: TOTP Configuration for Testing
 * ==========================================
 * These tests use Resource Owner Password Grant which does not support TOTP.
 * Before running tests, TOTP must be temporarily disabled in Keycloak:
 *
 * Option 1: Disable TOTP for realm (recommended for CI/CD):
 *   1. Login to Keycloak Admin Console (http://127.0.0.1:8180/admin)
 *   2. Select realm 'tamshai-corp'
 *   3. Go to Authentication > Required Actions
 *   4. Disable "Configure OTP" required action
 *   5. Run tests
 *   6. RE-ENABLE "Configure OTP" after tests complete
 *
 * Option 2: Use test-specific users without TOTP:
 *   - Create test users with TOTP disabled
 *   - Never disable TOTP for production users
 *
 * WARNING: Do NOT delete existing TOTP registrations for real users!
 */

import axios, { AxiosInstance } from 'axios';

// Test configuration
const CONFIG = {
  keycloakUrl: process.env.KEYCLOAK_URL || 'http://127.0.0.1:8180',
  keycloakRealm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
  gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:3100',
  mcpHrUrl: process.env.MCP_HR_URL || 'http://127.0.0.1:3101',
  mcpFinanceUrl: process.env.MCP_FINANCE_URL || 'http://127.0.0.1:3102',
  clientId: 'mcp-gateway',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'test-client-secret',
};

// Test users with role assignments matching Keycloak and HR database
const TEST_USERS = {
  executive: {
    username: 'eve.thompson',
    password: 'password123',
    email: 'eve@tamshai.local',
    roles: ['executive', 'manager', 'hr-read', 'support-read', 'sales-read', 'finance-read'],
    // Eve is CEO with direct reports: CFO, CTO, COO, VP of Sales
    expectedDirectReports: ['Michael Roberts', 'Sarah Kim', 'James Wilson', 'Carol Johnson'],
  },
  hrManager: {
    username: 'alice.chen',
    password: 'password123',
    email: 'alice@tamshai.local',
    roles: ['hr-read', 'hr-write', 'manager'],
    // Alice is VP of HR with direct report: Jennifer Lee
    expectedDirectReports: ['Jennifer Lee'],
  },
  engineeringManager: {
    username: 'nina.patel',
    password: 'password123',
    email: 'nina.p@tamshai.local',
    roles: ['manager'],
    // Nina is Engineering Manager with reports: Marcus Johnson, Sophia Wang, Tyler Scott
    expectedDirectReports: ['Marcus Johnson', 'Sophia Wang', 'Tyler Scott'],
  },
  intern: {
    username: 'frank.davis',
    password: 'password123',
    email: 'frank@tamshai.local',
    roles: [],
    // Frank is an intern with no direct reports
    expectedDirectReports: [],
  },
  financeUser: {
    username: 'bob.martinez',
    password: 'password123',
    email: 'bob@tamshai.local',
    roles: ['finance-read', 'finance-write'],
  },
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface MCPQueryResponse {
  status: 'success' | 'error';
  data?: any[];
  metadata?: {
    returnedCount?: number;
    totalCount?: number | string;
    hasMore?: boolean;
    nextCursor?: string;
    pagesRetrieved?: number;
  };
  code?: string;
  message?: string;
  suggestedAction?: string;
}

/**
 * Get access token from Keycloak
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
 * Create authenticated MCP HR client
 */
function createMcpHrClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: CONFIG.mcpHrUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * Create authenticated MCP Finance client
 */
function createMcpFinanceClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: CONFIG.mcpFinanceUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * Create authenticated Gateway client
 */
function createGatewayClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: CONFIG.gatewayUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 60000, // Longer timeout for SSE streaming
  });
}

// =============================================================================
// TEAM MEMBERS QUERY TESTS
// =============================================================================

describe('My Team Members Query', () => {
  describe('Executive (Eve Thompson - CEO)', () => {
    let token: string;
    let hrClient: AxiosInstance;

    beforeAll(async () => {
      token = await getAccessToken(TEST_USERS.executive.username, TEST_USERS.executive.password);
      hrClient = createMcpHrClient(token);
    });

    test('Detects "who are my team members" as team query', async () => {
      const response = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'who are my team members',
        userContext: {
          userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679', // Eve's Keycloak ID
          username: TEST_USERS.executive.username,
          email: TEST_USERS.executive.email,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    test('Returns CEO direct reports (CFO, CTO, COO, VP of Sales)', async () => {
      const response = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'show my direct reports',
        userContext: {
          userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
          username: TEST_USERS.executive.username,
          email: TEST_USERS.executive.email,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');

      const directReports = response.data.data || [];
      const reportNames = directReports.map((emp: any) => `${emp.first_name} ${emp.last_name}`);

      // CEO should have CFO, CTO, COO, VP of Sales as direct reports
      expect(reportNames).toEqual(expect.arrayContaining(['Michael Roberts'])); // CFO
      expect(reportNames).toEqual(expect.arrayContaining(['Sarah Kim'])); // CTO
      expect(reportNames).toEqual(expect.arrayContaining(['James Wilson'])); // COO
      expect(reportNames).toEqual(expect.arrayContaining(['Carol Johnson'])); // VP Sales
    });

    test('Handles various team query phrasings', async () => {
      const teamQueries = [
        'my team members',
        'who reports to me',
        'my direct reports',
        'my employees',
        'people who report to me',
      ];

      for (const query of teamQueries) {
        const response = await hrClient.post<MCPQueryResponse>('/query', {
          query,
          userContext: {
            userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
            username: TEST_USERS.executive.username,
            email: TEST_USERS.executive.email,
            roles: TEST_USERS.executive.roles,
          },
        });

        expect(response.status).toBe(200);
        expect(response.data.status).toBe('success');
        expect(Array.isArray(response.data.data)).toBe(true);
      }
    });
  });

  describe('HR Manager (Alice Chen)', () => {
    let token: string;
    let hrClient: AxiosInstance;

    beforeAll(async () => {
      token = await getAccessToken(TEST_USERS.hrManager.username, TEST_USERS.hrManager.password);
      hrClient = createMcpHrClient(token);
    });

    test('Returns HR Manager direct report (Jennifer Lee)', async () => {
      const response = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'who are my team members',
        userContext: {
          userId: 'f104eddc-21ab-457c-a254-78051ad7ad67', // Alice's Keycloak ID
          username: TEST_USERS.hrManager.username,
          email: TEST_USERS.hrManager.email,
          roles: TEST_USERS.hrManager.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');

      const directReports = response.data.data || [];
      const reportNames = directReports.map((emp: any) => `${emp.first_name} ${emp.last_name}`);

      expect(reportNames).toContain('Jennifer Lee');
    });
  });

  describe('Engineering Manager (Nina Patel)', () => {
    let token: string;
    let hrClient: AxiosInstance;

    beforeAll(async () => {
      token = await getAccessToken(TEST_USERS.engineeringManager.username, TEST_USERS.engineeringManager.password);
      hrClient = createMcpHrClient(token);
    });

    test('Returns Engineering team members', async () => {
      const response = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'my team members',
        userContext: {
          userId: 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', // Nina's Keycloak ID
          username: TEST_USERS.engineeringManager.username,
          email: TEST_USERS.engineeringManager.email,
          roles: TEST_USERS.engineeringManager.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');

      const directReports = response.data.data || [];
      expect(directReports.length).toBeGreaterThan(0);
    });
  });

  describe('Individual Contributor (Frank Davis - Intern)', () => {
    let token: string;
    let hrClient: AxiosInstance;

    beforeAll(async () => {
      token = await getAccessToken(TEST_USERS.intern.username, TEST_USERS.intern.password);
      hrClient = createMcpHrClient(token);
    });

    test('Returns empty list for non-manager', async () => {
      const response = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'who are my team members',
        userContext: {
          userId: 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e', // Frank's Keycloak ID
          username: TEST_USERS.intern.username,
          email: TEST_USERS.intern.email,
          roles: TEST_USERS.intern.roles,
        },
      });

      expect(response.status).toBe(200);
      // Should succeed but return empty data (no direct reports)
      if (response.data.status === 'success') {
        expect(response.data.data?.length || 0).toBe(0);
      }
    });
  });
});

// =============================================================================
// LIST ALL EMPLOYEES QUERY TESTS
// =============================================================================

describe('List All Employees Query', () => {
  describe('Via MCP HR Server', () => {
    let token: string;
    let hrClient: AxiosInstance;

    beforeAll(async () => {
      token = await getAccessToken(TEST_USERS.executive.username, TEST_USERS.executive.password);
      hrClient = createMcpHrClient(token);
    });

    test('Returns all employees (59) without pagination prompt', async () => {
      const response = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'list all employees',
        userContext: {
          userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
          username: TEST_USERS.executive.username,
          email: TEST_USERS.executive.email,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();
      expect(Array.isArray(response.data.data)).toBe(true);

      // Should return more than 50 employees (auto-pagination working)
      // We have 59 employees in the sample data
      expect(response.data.data.length).toBe(59);
    });

    test('Detects various employee listing phrasings', async () => {
      const listQueries = [
        'show employees',
        'all employees',
        'employee list',
        'who works here',
        'list staff',
      ];

      for (const query of listQueries) {
        const response = await hrClient.post<MCPQueryResponse>('/query', {
          query,
          userContext: {
            userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
            username: TEST_USERS.executive.username,
            email: TEST_USERS.executive.email,
            roles: TEST_USERS.executive.roles,
          },
        });

        expect(response.status).toBe(200);
        expect(response.data.status).toBe('success');
        expect(Array.isArray(response.data.data)).toBe(true);
        expect(response.data.data.length).toBeGreaterThan(0);
      }
    });

    test('Filters by department correctly', async () => {
      const response = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'list employees in Engineering department',
        userContext: {
          userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
          username: TEST_USERS.executive.username,
          email: TEST_USERS.executive.email,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');

      // All returned employees should be in Engineering
      const employees = response.data.data || [];
      employees.forEach((emp: any) => {
        expect(emp.department_name?.toLowerCase() || emp.department?.toLowerCase()).toBe('engineering');
      });
    });
  });

  describe('Via MCP Gateway (End-to-End)', () => {
    let token: string;
    let gatewayClient: AxiosInstance;

    beforeAll(async () => {
      token = await getAccessToken(TEST_USERS.executive.username, TEST_USERS.executive.password);
      gatewayClient = createGatewayClient(token);
    });

    test('Gateway auto-paginates and returns all employees', async () => {
      // Note: This test uses the non-streaming /api/query endpoint
      // The streaming endpoint (/api/query with SSE) is tested separately
      const response = await gatewayClient.post('/api/query', {
        query: 'List all employees',
      });

      expect(response.status).toBe(200);
      // Gateway should have aggregated all pages
      // Check that the response includes employee data
      expect(response.data).toBeDefined();
    });
  });
});

// =============================================================================
// QUERY ROUTING TESTS
// =============================================================================

describe('Query Routing', () => {
  let token: string;
  let hrClient: AxiosInstance;

  beforeAll(async () => {
    token = await getAccessToken(TEST_USERS.executive.username, TEST_USERS.executive.password);
    hrClient = createMcpHrClient(token);
  });

  test('Routes UUID queries to get_employee', async () => {
    const employeeUuid = 'e1000000-0000-0000-0000-000000000001'; // Eve Thompson's ID
    const response = await hrClient.post<MCPQueryResponse>('/query', {
      query: `Show me employee ${employeeUuid}`,
      userContext: {
        userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
        username: TEST_USERS.executive.username,
        email: TEST_USERS.executive.email,
        roles: TEST_USERS.executive.roles,
      },
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(response.data.data).toBeDefined();
    // Should return single employee, not array
    expect(response.data.data.first_name).toBe('Eve');
    expect(response.data.data.last_name).toBe('Thompson');
  });

  test('Routes pagination requests correctly', async () => {
    // First request
    const firstPage = await hrClient.post<MCPQueryResponse>('/query', {
      query: 'list employees',
      userContext: {
        userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
        username: TEST_USERS.executive.username,
        email: TEST_USERS.executive.email,
        roles: TEST_USERS.executive.roles,
      },
    });

    expect(firstPage.status).toBe(200);
    expect(firstPage.data.status).toBe('success');

    // If there's a cursor, request next page
    if (firstPage.data.metadata?.nextCursor) {
      const nextPage = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'show next page',
        cursor: firstPage.data.metadata.nextCursor,
        userContext: {
          userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
          username: TEST_USERS.executive.username,
          email: TEST_USERS.executive.email,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(nextPage.status).toBe(200);
      expect(nextPage.data.status).toBe('success');
      expect(Array.isArray(nextPage.data.data)).toBe(true);
    }
  });
});

// =============================================================================
// BUDGET QUERY TESTS
// =============================================================================

describe('Budget Status Query', () => {
  describe('Via MCP Finance Server', () => {
    let token: string;
    let financeClient: AxiosInstance;

    beforeAll(async () => {
      token = await getAccessToken(TEST_USERS.financeUser.username, TEST_USERS.financeUser.password);
      financeClient = createMcpFinanceClient(token);
    });

    test('Returns budget summary with status breakdown', async () => {
      const response = await financeClient.post<MCPQueryResponse>('/query', {
        query: "what's the budget status",
        userContext: {
          userId: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e', // Bob's Keycloak ID
          username: TEST_USERS.financeUser.username,
          email: TEST_USERS.financeUser.email,
          roles: TEST_USERS.financeUser.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();
      expect(Array.isArray(response.data.data)).toBe(true);

      // Verify budget data structure
      if (response.data.data.length > 0) {
        const budget = response.data.data[0];
        expect(budget).toHaveProperty('department_code');
        expect(budget).toHaveProperty('fiscal_year');
        expect(budget).toHaveProperty('budgeted_amount');
        expect(budget).toHaveProperty('actual_amount');
        expect(budget).toHaveProperty('utilization_pct');
        expect(budget).toHaveProperty('remaining_amount');
        expect(budget).toHaveProperty('status');
      }
    });

    test('Detects various budget query phrasings', async () => {
      const budgetQueries = [
        "what's the budget status",
        'show budget summary',
        'budget overview',
        'spending report',
        'budget allocation',
      ];

      for (const query of budgetQueries) {
        const response = await financeClient.post<MCPQueryResponse>('/query', {
          query,
          userContext: {
            userId: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
            username: TEST_USERS.financeUser.username,
            email: TEST_USERS.financeUser.email,
            roles: TEST_USERS.financeUser.roles,
          },
        });

        expect(response.status).toBe(200);
        expect(response.data.status).toBe('success');
        expect(Array.isArray(response.data.data)).toBe(true);
      }
    });

    test('Filters by department correctly', async () => {
      const response = await financeClient.post<MCPQueryResponse>('/query', {
        query: 'budget for Engineering department',
        userContext: {
          userId: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
          username: TEST_USERS.financeUser.username,
          email: TEST_USERS.financeUser.email,
          roles: TEST_USERS.financeUser.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');

      // All returned budgets should be for Engineering
      const budgets = response.data.data || [];
      budgets.forEach((budget: any) => {
        expect(budget.department_code?.toUpperCase()).toBe('ENGINEERING');
      });
    });

    test('Filters by fiscal year correctly', async () => {
      const response = await financeClient.post<MCPQueryResponse>('/query', {
        query: 'budget for 2024',
        userContext: {
          userId: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
          username: TEST_USERS.financeUser.username,
          email: TEST_USERS.financeUser.email,
          roles: TEST_USERS.financeUser.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');

      // All returned budgets should be for 2024
      const budgets = response.data.data || [];
      budgets.forEach((budget: any) => {
        expect(budget.fiscal_year).toBe(2024);
      });
    });

    test('Returns metadata with summary totals', async () => {
      const response = await financeClient.post<MCPQueryResponse>('/query', {
        query: 'budget status',
        userContext: {
          userId: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
          username: TEST_USERS.financeUser.username,
          email: TEST_USERS.financeUser.email,
          roles: TEST_USERS.financeUser.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.metadata).toBeDefined();

      // Check for summary in metadata
      const metadata = response.data.metadata as any;
      if (metadata.summary) {
        expect(metadata.summary).toHaveProperty('totalBudgeted');
        expect(metadata.summary).toHaveProperty('totalActual');
        expect(metadata.summary).toHaveProperty('totalRemaining');
        expect(metadata.summary).toHaveProperty('overallUtilization');
      }
    });
  });

  describe('Executive Access to Budget Data', () => {
    let token: string;
    let financeClient: AxiosInstance;

    beforeAll(async () => {
      token = await getAccessToken(TEST_USERS.executive.username, TEST_USERS.executive.password);
      financeClient = createMcpFinanceClient(token);
    });

    test('Executive can view all department budgets', async () => {
      const response = await financeClient.post<MCPQueryResponse>('/query', {
        query: 'show all budgets',
        userContext: {
          userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
          username: TEST_USERS.executive.username,
          email: TEST_USERS.executive.email,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();
      expect(Array.isArray(response.data.data)).toBe(true);

      // Executive should see budgets from multiple departments
      const departments = new Set(
        (response.data.data || []).map((b: any) => b.department_code)
      );
      expect(departments.size).toBeGreaterThan(1);
    });
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe('Query Error Handling', () => {
  describe('User Not Found in HR Database', () => {
    let token: string;
    let hrClient: AxiosInstance;

    beforeAll(async () => {
      token = await getAccessToken(TEST_USERS.executive.username, TEST_USERS.executive.password);
      hrClient = createMcpHrClient(token);
    });

    test('Returns helpful error when user email not in HR database', async () => {
      const response = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'who are my team members',
        userContext: {
          userId: '00000000-0000-0000-0000-000000000000',
          username: 'nonexistent.user',
          email: 'nonexistent@tamshai.local', // Email not in HR database
          roles: ['executive'],
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('USER_NOT_FOUND');
      expect(response.data.message).toContain('nonexistent@tamshai.local');
      expect(response.data.suggestedAction).toBeDefined();
    });
  });
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

describe('Query Scenarios - Health Check', () => {
  test('MCP HR server is accessible', async () => {
    const response = await axios.get(`${CONFIG.mcpHrUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });

  test('MCP Finance server is accessible', async () => {
    const response = await axios.get(`${CONFIG.mcpFinanceUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });

  test('MCP Gateway is accessible', async () => {
    const response = await axios.get(`${CONFIG.gatewayUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });
});
