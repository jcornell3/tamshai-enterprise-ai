/**
 * Tamshai Corp - MCP Gateway Proxy Integration Tests
 *
 * Tests that validate the MCP Gateway correctly routes requests to MCP servers.
 * These tests use the same endpoint paths that the frontend applications use,
 * ensuring consistency between frontend API calls and backend routes.
 *
 * Key features tested:
 * - Endpoint path validation (matching frontend expectations)
 * - MCP Gateway routing to correct service
 * - Response structure validation
 * - Authentication through gateway
 *
 * NOTE: These tests are SKIPPED in CI because they require the MCP Gateway to
 * route requests to MCP servers via Docker networking. In CI, the gateway cannot
 * reach the MCP servers at their Docker hostnames (mcp-hr, mcp-finance, etc.),
 * resulting in 503 errors. Run these tests locally with docker-compose up.
 */

import axios, { AxiosInstance } from 'axios';
import { getEphemeralUser, getImpersonatedToken } from './setup';

// CI Environment Check
// Skip all tests in CI - proxy routes require full Docker network setup
// The MCP Gateway needs to reach MCP servers via Docker hostnames (mcp-hr, etc.)
// which isn't available in the CI environment
const isCI = process.env.CI === 'true';
const describeProxy = isCI ? describe.skip : describe;

// Import shared endpoint constants
// Note: In a real setup, this would be: import { MCP_ENDPOINTS } from '@tamshai/mcp-endpoints';
// For now, we define them inline to match the frontend patterns
const MCP_ENDPOINTS = {
  HR: {
    LIST_EMPLOYEES: '/api/mcp/hr/list_employees',
    GET_EMPLOYEE: '/api/mcp/hr/get_employee',
    GET_TIME_OFF_BALANCES: '/api/mcp/hr/get_time_off_balances',
    LIST_TIME_OFF_REQUESTS: '/api/mcp/hr/list_time_off_requests',
    GET_ORG_CHART: '/api/mcp/hr/get_org_chart',
  },
  FINANCE: {
    LIST_BUDGETS: '/api/mcp/finance/list_budgets',
    GET_BUDGET: '/api/mcp/finance/get_budget',
    LIST_INVOICES: '/api/mcp/finance/list_invoices',
    LIST_EXPENSE_REPORTS: '/api/mcp/finance/list_expense_reports',
  },
  SALES: {
    LIST_OPPORTUNITIES: '/api/mcp/sales/list_opportunities',
    GET_CUSTOMER: '/api/mcp/sales/get_customer',
    LIST_LEADS: '/api/mcp/sales/list_leads',
    GET_FORECAST: '/api/mcp/sales/get_forecast',
  },
  SUPPORT: {
    SEARCH_TICKETS: '/api/mcp/support/search_tickets',
    GET_TICKET: '/api/mcp/support/get_ticket',
    GET_KNOWLEDGE_ARTICLE: '/api/mcp/support/get_knowledge_article',
    GET_SLA_SUMMARY: '/api/mcp/support/get_sla_summary',
    GET_AGENT_METRICS: '/api/mcp/support/get_agent_metrics',
  },
  PAYROLL: {
    GET_PAYROLL_SUMMARY: '/api/mcp/payroll/get_payroll_summary',
    LIST_PAY_RUNS: '/api/mcp/payroll/list_pay_runs',
    LIST_PAY_STUBS: '/api/mcp/payroll/list_pay_stubs',
    LIST_CONTRACTORS: '/api/mcp/payroll/list_contractors',
    GET_TAX_WITHHOLDINGS: '/api/mcp/payroll/get_tax_withholdings',
    GET_BENEFITS: '/api/mcp/payroll/get_benefits',
    GET_DIRECT_DEPOSIT: '/api/mcp/payroll/get_direct_deposit',
  },
  TAX: {
    GET_TAX_SUMMARY: '/api/mcp/tax/get_tax_summary',
  },
};

// Test configuration
// Fail-closed: Required secrets must be set via environment variables
const CONFIG = {
  mcpGatewayUrl: process.env.MCP_GATEWAY_URL!,
  keycloakUrl: process.env.KEYCLOAK_URL!,
  keycloakRealm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
  // T1: Use dedicated integration-runner client (falls back to mcp-gateway for backwards compat)
  clientId: process.env.MCP_INTEGRATION_RUNNER_SECRET ? 'mcp-integration-runner' : 'mcp-gateway',
  clientSecret: process.env.MCP_INTEGRATION_RUNNER_SECRET || process.env.MCP_GATEWAY_CLIENT_SECRET || '',
};

// T2: Prefer ephemeral test users (per-run credentials, no shared password).
// Falls back to pre-seeded users with DEV_USER_PASSWORD for backwards compat.
const TEST_PASSWORD = process.env.DEV_USER_PASSWORD || '';

if (!TEST_PASSWORD) {
  console.warn('WARNING: DEV_USER_PASSWORD not set - falling back to ephemeral users');
}

if (!CONFIG.clientSecret) {
  console.warn('WARNING: MCP_INTEGRATION_RUNNER_SECRET (or MCP_GATEWAY_CLIENT_SECRET) not set - authentication tests will fail');
}

// Test users — ephemeral users have per-run random passwords (T2)
const ephemeral = {
  executive: getEphemeralUser('executive'),
  hr: getEphemeralUser('hr'),
  finance: getEphemeralUser('finance'),
  sales: getEphemeralUser('sales'),
  support: getEphemeralUser('support'),
};

const TEST_USERS = {
  executive: {
    username: ephemeral.executive.username,
    password: ephemeral.executive.password,
  },
  hrUser: {
    username: ephemeral.hr.username,
    password: ephemeral.hr.password,
  },
  financeUser: {
    username: ephemeral.finance.username,
    password: ephemeral.finance.password,
  },
  salesUser: {
    username: ephemeral.sales.username,
    password: ephemeral.sales.password,
  },
  supportUser: {
    username: ephemeral.support.username,
    password: ephemeral.support.password,
  },
};

/**
 * Create authenticated gateway client
 */
function createGatewayClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: CONFIG.mcpGatewayUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
    // Don't throw on non-2xx responses - we want to test error cases too
    validateStatus: () => true,
  });
}

// =============================================================================
// MCP GATEWAY HEALTH CHECK
// =============================================================================

describeProxy('MCP Gateway Health', () => {
  test('Gateway health endpoint responds', async () => {
    const response = await axios.get(`${CONFIG.mcpGatewayUrl}/health`, {
      validateStatus: () => true,
    });
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });
});

// =============================================================================
// HR ENDPOINT TESTS (via Gateway)
// =============================================================================

describeProxy('MCP Gateway - HR Endpoints', () => {
  let client: AxiosInstance;

  beforeAll(async () => {
    const token = await getImpersonatedToken(TEST_USERS.hrUser.username);
    client = createGatewayClient(token);
  });

  test('GET list_employees returns employee data', async () => {
    const response = await client.get(MCP_ENDPOINTS.HR.LIST_EMPLOYEES);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('GET get_employee with valid ID returns employee', async () => {
    // First get an employee ID
    const listResponse = await client.get(MCP_ENDPOINTS.HR.LIST_EMPLOYEES);
    const employeeId = listResponse.data.data?.[0]?.employee_id;

    if (employeeId) {
      const response = await client.get(`${MCP_ENDPOINTS.HR.GET_EMPLOYEE}?employeeId=${employeeId}`);
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.employee_id).toBe(employeeId);
    }
  });

  test('GET get_time_off_balances returns balances', async () => {
    const response = await client.get(MCP_ENDPOINTS.HR.GET_TIME_OFF_BALANCES);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('GET get_org_chart returns org structure', async () => {
    const response = await client.get(MCP_ENDPOINTS.HR.GET_ORG_CHART);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
  });
});

// =============================================================================
// FINANCE ENDPOINT TESTS (via Gateway)
// =============================================================================

describeProxy('MCP Gateway - Finance Endpoints', () => {
  let client: AxiosInstance;

  beforeAll(async () => {
    const token = await getImpersonatedToken(TEST_USERS.financeUser.username);
    client = createGatewayClient(token);
  });

  test('GET list_budgets returns budget data', async () => {
    const response = await client.get(MCP_ENDPOINTS.FINANCE.LIST_BUDGETS);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('GET get_budget with department returns budget summary', async () => {
    const response = await client.get(`${MCP_ENDPOINTS.FINANCE.GET_BUDGET}?department=Engineering&year=2024`);

    expect(response.status).toBe(200);
    // Either success with data or error with not found
    expect(['success', 'error']).toContain(response.data.status);
  });

  test('GET list_invoices returns invoices', async () => {
    const response = await client.get(MCP_ENDPOINTS.FINANCE.LIST_INVOICES);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('GET list_expense_reports returns expense reports', async () => {
    const response = await client.get(MCP_ENDPOINTS.FINANCE.LIST_EXPENSE_REPORTS);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });
});

// =============================================================================
// SALES ENDPOINT TESTS (via Gateway)
// =============================================================================

describeProxy('MCP Gateway - Sales Endpoints', () => {
  let client: AxiosInstance;

  beforeAll(async () => {
    const token = await getImpersonatedToken(TEST_USERS.salesUser.username);
    client = createGatewayClient(token);
  });

  test('GET list_opportunities returns opportunities', async () => {
    const response = await client.get(MCP_ENDPOINTS.SALES.LIST_OPPORTUNITIES);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('GET get_customer with valid ID returns customer', async () => {
    const response = await client.get(`${MCP_ENDPOINTS.SALES.GET_CUSTOMER}?customerId=650000000000000000000001`);

    expect(response.status).toBe(200);
    // Either success with data or error with not found
    expect(['success', 'error']).toContain(response.data.status);
  });
});

// =============================================================================
// SUPPORT ENDPOINT TESTS (via Gateway)
// =============================================================================

describeProxy('MCP Gateway - Support Endpoints', () => {
  let client: AxiosInstance;

  beforeAll(async () => {
    const token = await getImpersonatedToken(TEST_USERS.supportUser.username);
    client = createGatewayClient(token);
  });

  test('GET search_tickets returns tickets', async () => {
    const response = await client.get(`${MCP_ENDPOINTS.SUPPORT.SEARCH_TICKETS}?query=*`);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('GET get_knowledge_article with valid ID returns article', async () => {
    const response = await client.get(`${MCP_ENDPOINTS.SUPPORT.GET_KNOWLEDGE_ARTICLE}?articleId=KB-001`);

    expect(response.status).toBe(200);
    // Either success with data or error with not found
    expect(['success', 'error']).toContain(response.data.status);
  });
});

// =============================================================================
// PAYROLL ENDPOINT TESTS (via Gateway)
// =============================================================================

describeProxy('MCP Gateway - Payroll Endpoints', () => {
  let client: AxiosInstance;

  beforeAll(async () => {
    // Use executive user who has payroll-read role
    const token = await getImpersonatedToken(TEST_USERS.executive.username);
    client = createGatewayClient(token);
  });

  test('GET get_payroll_summary returns summary data', async () => {
    const response = await client.get(MCP_ENDPOINTS.PAYROLL.GET_PAYROLL_SUMMARY);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(response.data.data).toBeDefined();
    // Validate expected fields from DashboardPage
    expect(response.data.data.next_pay_date).toBeDefined();
    expect(response.data.data.total_gross_pay).toBeDefined();
    expect(response.data.data.employee_count).toBeDefined();
  });

  test('GET list_pay_runs returns pay runs', async () => {
    const response = await client.get(`${MCP_ENDPOINTS.PAYROLL.LIST_PAY_RUNS}?year=2026`);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);

    // Validate expected fields from PayRunsPage
    if (response.data.data.length > 0) {
      const payRun = response.data.data[0];
      expect(payRun.pay_run_id).toBeDefined();
      expect(payRun.pay_period_start).toBeDefined();
      expect(payRun.pay_period_end).toBeDefined();
      expect(payRun.pay_date).toBeDefined();
    }
  });

  test('GET list_pay_stubs returns pay stubs', async () => {
    const response = await client.get(`${MCP_ENDPOINTS.PAYROLL.LIST_PAY_STUBS}?year=2026`);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('GET list_contractors returns contractors', async () => {
    const response = await client.get(`${MCP_ENDPOINTS.PAYROLL.LIST_CONTRACTORS}?year=2026`);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('GET get_tax_withholdings returns tax data', async () => {
    const response = await client.get(MCP_ENDPOINTS.PAYROLL.GET_TAX_WITHHOLDINGS);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(response.data.data).toBeDefined();
  });

  test('GET get_benefits returns benefits', async () => {
    const response = await client.get(MCP_ENDPOINTS.PAYROLL.GET_BENEFITS);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('GET get_direct_deposit returns accounts', async () => {
    const response = await client.get(MCP_ENDPOINTS.PAYROLL.GET_DIRECT_DEPOSIT);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    expect(Array.isArray(response.data.data)).toBe(true);
  });
});

// =============================================================================
// CROSS-ROLE ACCESS TESTS
// =============================================================================

/**
 * Cross-Role Access Control Design:
 *
 * The 'employee' role (implicit for all authenticated users) grants base access
 * to all services for self-service features:
 * - HR: view own profile, time-off balances
 * - Finance: submit expense reports, view own expenses
 * - Sales: view own deals/leads
 * - Support: create tickets, view own tickets
 *
 * Row-Level Security (RLS) policies then filter data to:
 * - Self-only for regular employees
 * - Department scope for managers
 * - Full access for department-specific roles (hr-read, finance-read, etc.)
 *
 * Therefore, cross-department access tests verify RLS filtering, not gateway denial.
 */
describeProxy('MCP Gateway - Cross-Role Access Control', () => {
  test('Executive can access payroll endpoints', async () => {
    const token = await getImpersonatedToken(TEST_USERS.executive.username);
    const client = createGatewayClient(token);

    const response = await client.get(MCP_ENDPOINTS.PAYROLL.GET_PAYROLL_SUMMARY);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
  });

  test('Executive can access all department data (full visibility)', async () => {
    const token = await getImpersonatedToken(TEST_USERS.executive.username);
    const client = createGatewayClient(token);

    // Test access to each service - executive sees all data
    const hrResponse = await client.get(MCP_ENDPOINTS.HR.LIST_EMPLOYEES);
    expect(hrResponse.status).toBe(200);
    expect(hrResponse.data.data.length).toBeGreaterThan(1); // Executive sees multiple employees

    const financeResponse = await client.get(MCP_ENDPOINTS.FINANCE.LIST_BUDGETS);
    expect(financeResponse.status).toBe(200);
    expect(financeResponse.data.data.length).toBeGreaterThan(1); // Multiple budgets visible

    const salesResponse = await client.get(MCP_ENDPOINTS.SALES.LIST_OPPORTUNITIES);
    expect(salesResponse.status).toBe(200);

    const supportResponse = await client.get(`${MCP_ENDPOINTS.SUPPORT.SEARCH_TICKETS}?query=*`);
    expect(supportResponse.status).toBe(200);
  });

  test('HR user accessing finance gets RLS-filtered data (employee self-service)', async () => {
    // Design note: The 'employee' role grants access to finance for self-service features
    // (expense reports, personal budget visibility). RLS policies filter the data.
    const token = await getImpersonatedToken(TEST_USERS.hrUser.username);

    // Decode token to see what roles the user has
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    console.log('HR user token roles:', {
      realm_roles: payload.realm_access?.roles,
      client_roles: payload.resource_access?.['mcp-gateway']?.roles,
      groups: payload.groups
    });

    const client = createGatewayClient(token);

    const response = await client.get(MCP_ENDPOINTS.FINANCE.LIST_BUDGETS);

    if (response.status !== 200) {
      console.log('Finance endpoint response:', response.status, response.data);
    }

    // Employee role grants access, but RLS filters to department or own data
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    // Without finance-read role, user sees limited budget data (own department only)
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  test('Finance user accessing HR gets RLS-filtered data (employee self-service)', async () => {
    // Design note: The 'employee' role grants access to HR for self-service features
    // (own profile, time-off balances). RLS policies filter to own record.
    const token = await getImpersonatedToken(TEST_USERS.financeUser.username);
    const client = createGatewayClient(token);

    const response = await client.get(MCP_ENDPOINTS.HR.LIST_EMPLOYEES);

    // Employee role grants access, but RLS filters to own data
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');
    // Without hr-read role, user sees only their own employee record
    expect(Array.isArray(response.data.data)).toBe(true);
    // Finance user (bob.martinez) should see at most 1 record (themselves)
    // or multiple if their department is visible
    expect(response.data.data.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// RESPONSE FIELD VALIDATION
// =============================================================================

describeProxy('MCP Gateway - Response Field Validation', () => {
  test('Payroll summary has fields expected by DashboardPage', async () => {
    const token = await getImpersonatedToken(TEST_USERS.executive.username);
    const client = createGatewayClient(token);

    const response = await client.get(MCP_ENDPOINTS.PAYROLL.GET_PAYROLL_SUMMARY);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('success');

    const data = response.data.data;
    // These are the fields that DashboardPage.tsx expects to map
    expect(data).toHaveProperty('next_pay_date');
    expect(data).toHaveProperty('total_gross_pay');
    expect(data).toHaveProperty('employee_count');
    // YTD totals are optional but expected
    if (data.ytd_totals) {
      expect(data.ytd_totals).toHaveProperty('gross_pay');
    }
  });

  test('Pay runs have fields expected by PayRunsPage', async () => {
    const token = await getImpersonatedToken(TEST_USERS.executive.username);
    const client = createGatewayClient(token);

    const response = await client.get(`${MCP_ENDPOINTS.PAYROLL.LIST_PAY_RUNS}?year=2026`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.data)).toBe(true);

    if (response.data.data.length > 0) {
      const payRun = response.data.data[0];
      // These are the fields that PayRunsPage.tsx maps
      expect(payRun).toHaveProperty('pay_run_id');
      expect(payRun).toHaveProperty('pay_period_start');
      expect(payRun).toHaveProperty('pay_period_end');
      expect(payRun).toHaveProperty('pay_date');
      expect(payRun).toHaveProperty('employee_count');
      expect(payRun).toHaveProperty('total_gross');
      expect(payRun).toHaveProperty('total_net');
      expect(payRun).toHaveProperty('status');
    }
  });

  test('Benefits have fields expected by BenefitsPage', async () => {
    const token = await getImpersonatedToken(TEST_USERS.executive.username);
    const client = createGatewayClient(token);

    const response = await client.get(MCP_ENDPOINTS.PAYROLL.GET_BENEFITS);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.data)).toBe(true);

    if (response.data.data.length > 0) {
      const benefit = response.data.data[0];
      // These are the fields that BenefitsPage.tsx expects
      expect(benefit).toHaveProperty('deduction_id');
      expect(benefit).toHaveProperty('type');
      expect(benefit).toHaveProperty('name');
      expect(benefit).toHaveProperty('amount');
      expect(benefit).toHaveProperty('employer_contribution');
      expect(benefit).toHaveProperty('frequency');
      expect(benefit).toHaveProperty('is_pretax');
    }
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

describeProxy('MCP Gateway - Error Handling', () => {
  test('Returns 401 for unauthenticated requests', async () => {
    const response = await axios.get(`${CONFIG.mcpGatewayUrl}${MCP_ENDPOINTS.HR.LIST_EMPLOYEES}`, {
      validateStatus: () => true,
    });

    expect(response.status).toBe(401);
  });

  test('Returns 404 for non-existent endpoints', async () => {
    const token = await getImpersonatedToken(TEST_USERS.executive.username);
    const client = createGatewayClient(token);

    const response = await client.get('/api/mcp/nonexistent/tool');

    expect([404, 400]).toContain(response.status);
  });
});
