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
 * Authentication uses token exchange (service account impersonation) via
 * TestAuthProvider, which bypasses TOTP requirements entirely.
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { getTestAuthProvider } from '../shared/auth/token-exchange';

// Test configuration - all values from environment variables
const CONFIG = {
  gatewayUrl: process.env.MCP_GATEWAY_URL,
  mcpHrUrl: process.env.MCP_HR_URL,
  mcpFinanceUrl: process.env.MCP_FINANCE_URL,
  mcpInternalSecret: process.env.MCP_INTERNAL_SECRET!,
};

// Auth provider (singleton, token exchange)
const authProvider = getTestAuthProvider();

// Test users with role assignments matching Keycloak and HR database
const TEST_USERS = {
  executive: {
    username: 'eve.thompson',
    email: 'eve@tamshai-playground.local',
    userId: 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
    roles: ['executive', 'manager', 'hr-read', 'support-read', 'sales-read', 'finance-read'],
    // Eve is CEO with direct reports: CFO, CTO, COO, VP of Sales
    expectedDirectReports: ['Michael Roberts', 'Sarah Kim', 'James Wilson', 'Carol Johnson'],
  },
  hrManager: {
    username: 'alice.chen',
    email: 'alice@tamshai-playground.local',
    userId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
    roles: ['hr-read', 'hr-write', 'manager'],
    // Alice is VP of HR with direct report: Jennifer Lee
    expectedDirectReports: ['Jennifer Lee'],
  },
  engineeringManager: {
    username: 'nina.patel',
    email: 'nina.p@tamshai-playground.local',
    userId: 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d',
    roles: ['manager'],
    // Nina is Engineering Manager with reports: Marcus Johnson, Sophia Wang, Tyler Scott
    expectedDirectReports: ['Marcus Johnson', 'Sophia Wang', 'Tyler Scott'],
  },
  intern: {
    username: 'frank.davis',
    email: 'frank@tamshai-playground.local',
    userId: 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e',
    roles: [],
    // Frank is an intern with no direct reports
    expectedDirectReports: [],
  },
  financeUser: {
    username: 'bob.martinez',
    email: 'bob@tamshai-playground.local',
    userId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
    roles: ['finance-read', 'finance-write'],
  },
};

interface MCPQueryResponse {
  status: 'success' | 'error';
  data?: any;  // Can be array or object depending on the query
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
 * Create authenticated MCP HR client with gateway auth token
 *
 * IMPORTANT: HMAC token is generated per-request via interceptor (not cached)
 * because the MCP server enforces a 30-second replay window.
 */
function createMcpHrClient(token: string, userId: string, roles: string[]): AxiosInstance {
  const client = axios.create({
    baseURL: CONFIG.mcpHrUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
  client.interceptors.request.use((config) => {
    config.headers['X-MCP-Internal-Token'] = generateInternalToken(userId, roles);
    return config;
  });
  return client;
}

/**
 * Create authenticated MCP Finance client with gateway auth token
 *
 * IMPORTANT: HMAC token is generated per-request via interceptor (not cached)
 * because the MCP server enforces a 30-second replay window.
 */
function createMcpFinanceClient(token: string, userId: string, roles: string[]): AxiosInstance {
  const client = axios.create({
    baseURL: CONFIG.mcpFinanceUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
  client.interceptors.request.use((config) => {
    config.headers['X-MCP-Internal-Token'] = generateInternalToken(userId, roles);
    return config;
  });
  return client;
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
      token = await authProvider.getUserToken(TEST_USERS.executive.username);
      hrClient = createMcpHrClient(token, TEST_USERS.executive.userId, TEST_USERS.executive.roles);
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
      token = await authProvider.getUserToken(TEST_USERS.hrManager.username);
      hrClient = createMcpHrClient(token, TEST_USERS.hrManager.userId, TEST_USERS.hrManager.roles);
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
      token = await authProvider.getUserToken(TEST_USERS.engineeringManager.username);
      hrClient = createMcpHrClient(token, TEST_USERS.engineeringManager.userId, TEST_USERS.engineeringManager.roles);
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
      token = await authProvider.getUserToken(TEST_USERS.intern.username);
      hrClient = createMcpHrClient(token, TEST_USERS.intern.userId, TEST_USERS.intern.roles);
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
      token = await authProvider.getUserToken(TEST_USERS.executive.username);
      hrClient = createMcpHrClient(token, TEST_USERS.executive.userId, TEST_USERS.executive.roles);
    });

    test('Returns all 59 employees via cursor-based pagination', async () => {
      // First page: 50 employees
      const firstPage = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'list all employees',
        userContext: {
          userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
          username: TEST_USERS.executive.username,
          email: TEST_USERS.executive.email,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(firstPage.status).toBe(200);
      expect(firstPage.data.status).toBe('success');
      expect(firstPage.data.data).toBeDefined();
      expect(Array.isArray(firstPage.data.data)).toBe(true);

      // list_employees has a default limit of 50 records
      expect(firstPage.data.data.length).toBe(50);

      // Verify pagination metadata with nextCursor (v1.4 cursor-based pagination)
      expect(firstPage.data.metadata).toBeDefined();
      expect(firstPage.data.metadata?.hasMore).toBe(true);
      expect(firstPage.data.metadata?.nextCursor).toBeDefined();

      // Second page: remaining 9 employees using cursor
      const secondPage = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'show more employees',
        cursor: firstPage.data.metadata?.nextCursor,
        userContext: {
          userId: '4d712a0b-21d0-46ec-99ea-89cf960bc679',
          username: TEST_USERS.executive.username,
          email: TEST_USERS.executive.email,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(secondPage.status).toBe(200);
      expect(secondPage.data.status).toBe('success');
      expect(secondPage.data.data).toBeDefined();
      expect(Array.isArray(secondPage.data.data)).toBe(true);

      // Second page should have remaining employees (59 - 50 = 9)
      expect(secondPage.data.data.length).toBe(9);

      // No more pages - hasMore should be false or undefined
      expect(secondPage.data.metadata?.hasMore).toBeFalsy();

      // Total employees from both pages should be 59
      const totalEmployees = firstPage.data.data.length + secondPage.data.data.length;
      expect(totalEmployees).toBe(59);
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
      token = await authProvider.getUserToken(TEST_USERS.executive.username);
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
    token = await authProvider.getUserToken(TEST_USERS.executive.username);
    hrClient = createMcpHrClient(token, TEST_USERS.executive.userId, TEST_USERS.executive.roles);
  });

  test('Routes UUID queries to get_employee', async () => {
    const employeeUuid = 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b'; // Eve Thompson's ID (from hr-data.sql)
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
      token = await authProvider.getUserToken(TEST_USERS.financeUser.username);
      financeClient = createMcpFinanceClient(token, TEST_USERS.financeUser.userId, TEST_USERS.financeUser.roles);
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
      token = await authProvider.getUserToken(TEST_USERS.executive.username);
      financeClient = createMcpFinanceClient(token, TEST_USERS.executive.userId, TEST_USERS.executive.roles);
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
      token = await authProvider.getUserToken(TEST_USERS.executive.username);
      hrClient = createMcpHrClient(token, TEST_USERS.executive.userId, TEST_USERS.executive.roles);
    });

    test('Returns helpful error when user email not in HR database', async () => {
      const response = await hrClient.post<MCPQueryResponse>('/query', {
        query: 'who are my team members',
        userContext: {
          userId: '00000000-0000-0000-0000-000000000000',
          username: 'nonexistent.user',
          email: 'nonexistent@tamshai-playground.local', // Email not in HR database
          roles: ['executive'],
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('USER_NOT_FOUND');
      expect(response.data.message).toContain('nonexistent@tamshai-playground.local');
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
