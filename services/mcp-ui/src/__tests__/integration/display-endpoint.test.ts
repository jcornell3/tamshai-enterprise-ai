/**
 * MCP UI Service - Display Endpoint Integration Tests
 *
 * Integration tests for /api/display and /api/display/components endpoints.
 * These tests mock axios calls to mcp-gateway to test the full request flow
 * without requiring actual MCP servers running.
 *
 * Test coverage:
 * 1. Directive parsing (valid, invalid, malformed params)
 * 2. Component lookup (known, unknown components)
 * 3. MCP data fetching (mock responses, error handling)
 * 4. Response transformation (props mapping, narration generation)
 * 5. Error responses (INVALID_DIRECTIVE, UNKNOWN_COMPONENT codes)
 * 6. /api/display/components endpoint (list available components)
 *
 * Pattern: Following mcp-gateway-proxy.test.ts patterns
 */

import request from 'supertest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { app } from '../../app';
import {
  TEST_USER_CONTEXT,
  EXECUTIVE_USER_CONTEXT,
  LIMITED_USER_CONTEXT,
  HR_ORG_CHART_RESPONSE,
  SALES_CUSTOMER_RESPONSE,
  FINANCE_BUDGET_RESPONSE,
  TRUNCATED_RESPONSE,
  MCP_ERROR_RESPONSE,
  MCP_GATEWAY_URL,
  buildMCPUrl,
} from './setup';

// Create mock adapter for axios
let mockAxios: MockAdapter;

// ============================================================================
// Test Setup and Teardown
// ============================================================================

beforeAll(() => {
  // Set up axios mock before any tests run
  mockAxios = new MockAdapter(axios, { onNoMatch: 'throwException' });
});

beforeEach(() => {
  // Reset mock handlers between tests
  mockAxios.reset();
});

afterAll(() => {
  // Restore axios to original state
  mockAxios.restore();
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a valid display request body
 */
function createDisplayRequest(
  directive: string,
  userContext = TEST_USER_CONTEXT
): { directive: string; userContext: typeof TEST_USER_CONTEXT } {
  return { directive, userContext };
}

/**
 * Set up mock for a specific MCP tool call
 */
function mockMCPTool(
  server: string,
  tool: string,
  response: unknown,
  statusCode = 200
): void {
  const url = buildMCPUrl(server, tool);
  mockAxios.onGet(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*')).reply(statusCode, response);
}

/**
 * Set up mock to simulate network error
 */
function mockMCPNetworkError(server: string, tool: string): void {
  const url = buildMCPUrl(server, tool);
  mockAxios.onGet(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*')).networkError();
}

/**
 * Set up mock to simulate timeout
 */
function mockMCPTimeout(server: string, tool: string): void {
  const url = buildMCPUrl(server, tool);
  mockAxios.onGet(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*')).timeout();
}

// ============================================================================
// 1. DIRECTIVE PARSING TESTS
// ============================================================================

describe('Display Endpoint - Directive Parsing', () => {
  describe('Valid Directives', () => {
    it('should parse directive with all components: domain, component, params', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me,depth=1'));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should parse directive with empty params', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:'));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should parse directive with single param', async () => {
      mockMCPTool('sales', 'get_customer', SALES_CUSTOMER_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:sales:customer:customerId=abc123'));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should parse directive with multiple params', async () => {
      mockMCPTool('finance', 'get_budget', FINANCE_BUDGET_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:finance:budget:department=engineering,year=2026'));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  describe('Invalid Directives', () => {
    it('should return 400 for directive missing display: prefix', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('hr:org_chart:userId=me'));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DIRECTIVE');
    });

    it('should return 400 for directive with wrong prefix', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('show:hr:org_chart:userId=me'));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DIRECTIVE');
    });

    it('should return 400 for directive missing component', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:'));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DIRECTIVE');
    });

    it('should return 400 for directive missing params section', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart'));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DIRECTIVE');
    });

    it('should return 400 for completely invalid format', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('not-a-valid-directive'));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DIRECTIVE');
    });

    it('should return 400 for empty directive string', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest(''));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_FIELD');
    });
  });

  describe('Malformed Parameters', () => {
    it('should handle params without values (key only)', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      // Parser handles this gracefully - params without = are skipped
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId'));

      // Should still work, just with empty params
      expect(response.status).toBe(200);
    });

    it('should handle params with empty values', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId='));

      expect(response.status).toBe(200);
    });

    it('should handle params with special characters in values', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=user@email.com'));

      expect(response.status).toBe(200);
    });

    it('should handle mixed valid and invalid params', async () => {
      mockMCPTool('finance', 'get_budget', FINANCE_BUDGET_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:finance:budget:department=eng,invalid,year=2026'));

      expect(response.status).toBe(200);
    });
  });
});

// ============================================================================
// 2. COMPONENT LOOKUP TESTS
// ============================================================================

describe('Display Endpoint - Component Lookup', () => {
  describe('Known Components', () => {
    it('should find hr:org_chart component', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.status).toBe(200);
      expect(response.body.component.type).toBe('OrgChartComponent');
    });

    it('should find sales:customer component', async () => {
      mockMCPTool('sales', 'get_customer', SALES_CUSTOMER_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:sales:customer:customerId=123'));

      expect(response.status).toBe(200);
      expect(response.body.component.type).toBe('CustomerDetailCard');
    });

    it('should find sales:leads component', async () => {
      mockMCPTool('sales', 'list_leads', {
        status: 'success',
        data: { leads: [], totalCount: 0, filters: {} },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:sales:leads:status=new'));

      expect(response.status).toBe(200);
      expect(response.body.component.type).toBe('LeadsDataTable');
    });

    it('should find sales:forecast component', async () => {
      mockMCPTool('sales', 'get_forecast', {
        status: 'success',
        data: { forecast: 1000000, actual: 850000, period: 'Q1 2026' },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:sales:forecast:period=Q1'));

      expect(response.status).toBe(200);
      expect(response.body.component.type).toBe('ForecastChart');
    });

    it('should find finance:budget component', async () => {
      mockMCPTool('finance', 'get_budget', FINANCE_BUDGET_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:finance:budget:department=eng'));

      expect(response.status).toBe(200);
      expect(response.body.component.type).toBe('BudgetSummaryCard');
    });

    it('should find finance:quarterly_report component', async () => {
      mockMCPTool('finance', 'get_quarterly_report', {
        status: 'success',
        data: {
          quarter: 'Q1',
          year: 2026,
          revenue: 5000000,
          expenses: 4000000,
          profit: 1000000,
        },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:finance:quarterly_report:quarter=Q1,year=2026'));

      expect(response.status).toBe(200);
      expect(response.body.component.type).toBe('QuarterlyReportDashboard');
    });

    it('should find approvals:pending component', async () => {
      // This component makes 3 MCP calls
      mockMCPTool('hr', 'get_pending_time_off', {
        status: 'success',
        data: { timeOffRequests: [] },
      });
      mockMCPTool('finance', 'get_pending_expenses', {
        status: 'success',
        data: { expenseReports: [] },
      });
      mockMCPTool('finance', 'get_pending_budgets', {
        status: 'success',
        data: { budgetAmendments: [] },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:approvals:pending:userId=me'));

      expect(response.status).toBe(200);
      expect(response.body.component.type).toBe('ApprovalsQueue');
    });
  });

  describe('Unknown Components', () => {
    it('should return 404 for unknown domain', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:unknown:component:id=1'));

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('UNKNOWN_COMPONENT');
    });

    it('should return 404 for unknown component in known domain', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:nonexistent:id=1'));

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('UNKNOWN_COMPONENT');
    });

    it('should include suggestedAction pointing to /api/display/components', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:fake:thing:x=y'));

      expect(response.body.suggestedAction).toContain('/api/display/components');
    });

    it('should include the unknown component in error message', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:mystery:widget:param=value'));

      expect(response.body.message).toContain('mystery:widget');
    });
  });
});

// ============================================================================
// 3. MCP DATA FETCHING TESTS
// ============================================================================

describe('Display Endpoint - MCP Data Fetching', () => {
  describe('Successful Responses', () => {
    it('should fetch data from single MCP server', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.component.props).toBeDefined();
    });

    it('should fetch data from multiple MCP servers (approvals)', async () => {
      // approvals:pending calls 3 different MCP tools
      mockMCPTool('hr', 'get_pending_time_off', {
        status: 'success',
        data: { timeOffRequests: [{ id: 'to-001' }] },
      });
      mockMCPTool('finance', 'get_pending_expenses', {
        status: 'success',
        data: { expenseReports: [{ id: 'exp-001' }, { id: 'exp-002' }] },
      });
      mockMCPTool('finance', 'get_pending_budgets', {
        status: 'success',
        data: { budgetAmendments: [] },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:approvals:pending:userId=me'));

      expect(response.status).toBe(200);
      expect(response.body.component.props.timeOffRequests).toHaveLength(1);
      expect(response.body.component.props.expenseReports).toHaveLength(2);
      expect(response.body.component.props.budgetAmendments).toHaveLength(0);
    });

    it('should pass mapped parameters to MCP tools', async () => {
      let capturedParams: Record<string, string> | null = null;
      const url = buildMCPUrl('hr', 'get_org_chart');

      mockAxios.onGet(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*')).reply((config) => {
        capturedParams = config.params as Record<string, string>;
        return [200, HR_ORG_CHART_RESPONSE];
      });

      await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=emp-123,depth=3'));

      expect(capturedParams).toEqual({
        userId: 'emp-123',
        maxDepth: '3',
      });
    });

    it('should include user context headers in MCP requests', async () => {
      let capturedHeaders: Record<string, string> | null = null;
      const url = buildMCPUrl('hr', 'get_org_chart');

      mockAxios.onGet(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*')).reply((config) => {
        capturedHeaders = config.headers as Record<string, string>;
        return [200, HR_ORG_CHART_RESPONSE];
      });

      await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me', EXECUTIVE_USER_CONTEXT));

      expect(capturedHeaders).toBeDefined();
      expect(capturedHeaders!['X-User-ID']).toBe(EXECUTIVE_USER_CONTEXT.userId);
      expect(capturedHeaders!['X-User-Roles']).toContain('executive');
    });
  });

  describe('Error Handling', () => {
    it('should return 500 on MCP network error', async () => {
      mockMCPNetworkError('hr', 'get_org_chart');

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.status).toBe(500);
      expect(response.body.code).toBe('MCP_ERROR');
    });

    it('should return 500 on MCP timeout', async () => {
      mockMCPTimeout('hr', 'get_org_chart');

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.status).toBe(500);
      expect(response.body.code).toBe('MCP_ERROR');
    });

    it('should include suggestedAction on MCP error', async () => {
      mockMCPNetworkError('hr', 'get_org_chart');

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.body.suggestedAction).toBeDefined();
      expect(response.body.suggestedAction).toContain('MCP server');
    });

    it('should handle MCP server returning error status', async () => {
      mockMCPTool('hr', 'get_org_chart', MCP_ERROR_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      // The display route still returns success but with potentially empty data
      // because the MCP response is merged even if it has error status
      expect(response.status).toBe(200);
    });

    it('should handle partial MCP failures in multi-call components', async () => {
      // One succeeds, two fail
      mockMCPTool('hr', 'get_pending_time_off', {
        status: 'success',
        data: { timeOffRequests: [{ id: 'to-001' }] },
      });
      mockMCPNetworkError('finance', 'get_pending_expenses');
      mockMCPNetworkError('finance', 'get_pending_budgets');

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:approvals:pending:userId=me'));

      // Should fail because Promise.all rejects on first error
      expect(response.status).toBe(500);
      expect(response.body.code).toBe('MCP_ERROR');
    });
  });

  describe('Truncation Handling', () => {
    it('should detect and report truncated responses', async () => {
      mockMCPTool('sales', 'list_leads', TRUNCATED_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:sales:leads:status=all'));

      expect(response.status).toBe(200);
      expect(response.body.metadata.truncated).toBe(true);
    });

    it('should not report truncation for non-truncated responses', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.status).toBe(200);
      expect(response.body.metadata.truncated).toBe(false);
    });

    it('should report truncation if any MCP response is truncated', async () => {
      // First call not truncated, second truncated
      mockMCPTool('hr', 'get_pending_time_off', {
        status: 'success',
        data: { timeOffRequests: [] },
      });
      mockMCPTool('finance', 'get_pending_expenses', {
        status: 'success',
        data: { expenseReports: Array(50).fill({ id: 'exp' }) },
        metadata: { truncated: true, totalCount: '100+' },
      });
      mockMCPTool('finance', 'get_pending_budgets', {
        status: 'success',
        data: { budgetAmendments: [] },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:approvals:pending:userId=me'));

      expect(response.status).toBe(200);
      expect(response.body.metadata.truncated).toBe(true);
    });
  });
});

// ============================================================================
// 4. RESPONSE TRANSFORMATION TESTS
// ============================================================================

describe('Display Endpoint - Response Transformation', () => {
  describe('Props Mapping', () => {
    it('should transform HR org chart data to correct props', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      const props = response.body.component.props;
      expect(props.manager).toBeDefined();
      expect(props.manager.name).toBe('Alice Chen');
      expect(props.self).toBeDefined();
      expect(props.self.name).toBe('Test User');
      expect(props.peers).toHaveLength(1);
      expect(props.directReports).toHaveLength(2);
    });

    it('should transform Sales customer data to correct props', async () => {
      mockMCPTool('sales', 'get_customer', SALES_CUSTOMER_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:sales:customer:customerId=123'));

      const props = response.body.component.props;
      expect(props.customer).toBeDefined();
      expect(props.customer.name).toBe('Acme Corporation');
      expect(props.contacts).toHaveLength(1);
      expect(props.opportunities).toHaveLength(2);
    });

    it('should transform Finance budget data to correct props', async () => {
      mockMCPTool('finance', 'get_budget', FINANCE_BUDGET_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:finance:budget:department=eng'));

      const props = response.body.component.props;
      expect(props.department).toBe('Engineering');
      expect(props.budget).toBe(1000000);
      expect(props.spent).toBe(750000);
      expect(props.remaining).toBe(250000);
    });

    it('should handle missing optional fields in transform', async () => {
      mockMCPTool('hr', 'get_org_chart', {
        status: 'success',
        data: {
          manager: null,
          employee: { id: '1', name: 'Solo Worker' },
          // No peers, no directReports
        },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      const props = response.body.component.props;
      expect(props.manager).toBeNull();
      expect(props.peers).toEqual([]);
      expect(props.directReports).toEqual([]);
    });
  });

  describe('Narration Generation', () => {
    it('should generate narration for org chart', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.body.narration).toBeDefined();
      expect(response.body.narration.text).toContain('Alice Chen');
      expect(response.body.narration.text).toContain('2 direct reports');
    });

    it('should generate narration for customer card', async () => {
      mockMCPTool('sales', 'get_customer', SALES_CUSTOMER_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:sales:customer:customerId=123'));

      expect(response.body.narration.text).toContain('Acme Corporation');
      expect(response.body.narration.text).toContain('2 active opportunities');
    });

    it('should generate narration for leads table', async () => {
      mockMCPTool('sales', 'list_leads', {
        status: 'success',
        data: { leads: [{ id: 1 }, { id: 2 }, { id: 3 }], totalCount: 3, filters: {} },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:sales:leads:status=hot'));

      expect(response.body.narration.text).toContain('3');
      expect(response.body.narration.text).toContain('hot');
    });

    it('should generate narration for budget summary', async () => {
      mockMCPTool('finance', 'get_budget', FINANCE_BUDGET_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:finance:budget:department=Engineering'));

      expect(response.body.narration.text).toContain('Engineering');
    });

    it('should generate narration for approvals queue', async () => {
      mockMCPTool('hr', 'get_pending_time_off', {
        status: 'success',
        data: { timeOffRequests: [{ id: '1' }] },
      });
      mockMCPTool('finance', 'get_pending_expenses', {
        status: 'success',
        data: { expenseReports: [{ id: '1' }, { id: '2' }] },
      });
      mockMCPTool('finance', 'get_pending_budgets', {
        status: 'success',
        data: { budgetAmendments: [{ id: '1' }] },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:approvals:pending:userId=me'));

      expect(response.body.narration.text).toContain('4 pending approvals');
      expect(response.body.narration.text).toContain('1 time off');
      expect(response.body.narration.text).toContain('2 expenses');
      expect(response.body.narration.text).toContain('1 budget');
    });

    it('should handle missing data in narration gracefully', async () => {
      mockMCPTool('hr', 'get_org_chart', {
        status: 'success',
        data: {
          employee: { id: '1', name: 'User' },
          // No manager, no directReports
        },
      });

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.body.narration.text).toContain('no one');
      expect(response.body.narration.text).toContain('0 direct reports');
    });
  });

  describe('Metadata', () => {
    it('should include dataFreshness timestamp in ISO format', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.body.metadata.dataFreshness).toBeDefined();
      const date = new Date(response.body.metadata.dataFreshness);
      expect(date.toISOString()).toBe(response.body.metadata.dataFreshness);
    });

    it('should include actions array (empty for now)', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.body.component.actions).toEqual([]);
    });
  });
});

// ============================================================================
// 5. ERROR RESPONSE TESTS
// ============================================================================

describe('Display Endpoint - Error Responses', () => {
  describe('INVALID_DIRECTIVE Error', () => {
    it('should return proper error structure for invalid directive', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('not-valid'));

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        status: 'error',
        code: 'INVALID_DIRECTIVE',
        message: expect.stringContaining('Invalid display directive'),
        suggestedAction: expect.stringContaining('display:'),
      });
    });

    it('should include the invalid directive in error message', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('broken-format'));

      expect(response.body.message).toContain('broken-format');
    });

    it('should provide format example in suggestedAction', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('x'));

      expect(response.body.suggestedAction).toMatch(/display:\w+:\w+:/);
    });
  });

  describe('UNKNOWN_COMPONENT Error', () => {
    it('should return proper error structure for unknown component', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:fake:component:x=y'));

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        status: 'error',
        code: 'UNKNOWN_COMPONENT',
        message: expect.stringContaining('fake:component'),
        suggestedAction: expect.stringContaining('/api/display/components'),
      });
    });
  });

  describe('MISSING_FIELD Error', () => {
    it('should return error when directive field is missing', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ userContext: TEST_USER_CONTEXT });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_FIELD');
      expect(response.body.message).toContain('directive');
    });

    it('should return error when userContext field is missing', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ directive: 'display:hr:org_chart:userId=me' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_FIELD');
      expect(response.body.message).toContain('userContext');
    });

    it('should return error when body is empty', async () => {
      const response = await request(app).post('/api/display').send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_FIELD');
    });
  });

  describe('MCP_ERROR', () => {
    it('should return proper error structure on MCP failure', async () => {
      mockMCPNetworkError('hr', 'get_org_chart');

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:hr:org_chart:userId=me'));

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        status: 'error',
        code: 'MCP_ERROR',
        message: expect.stringContaining('Failed to fetch'),
        suggestedAction: expect.stringContaining('MCP server'),
      });
    });
  });
});

// ============================================================================
// 6. /api/display/components ENDPOINT TESTS
// ============================================================================

describe('GET /api/display/components', () => {
  describe('Response Structure', () => {
    it('should return 200 status', async () => {
      const response = await request(app).get('/api/display/components');
      expect(response.status).toBe(200);
    });

    it('should return components array', async () => {
      const response = await request(app).get('/api/display/components');
      expect(response.body.components).toBeInstanceOf(Array);
    });

    it('should return correct number of registered components', async () => {
      const response = await request(app).get('/api/display/components');
      // Based on component-registry.ts: 7 components registered
      expect(response.body.components.length).toBe(7);
    });
  });

  describe('Component Metadata', () => {
    it('should include type field for each component', async () => {
      const response = await request(app).get('/api/display/components');

      for (const component of response.body.components) {
        expect(component.type).toBeDefined();
        expect(typeof component.type).toBe('string');
      }
    });

    it('should include directivePattern field for each component', async () => {
      const response = await request(app).get('/api/display/components');

      for (const component of response.body.components) {
        expect(component.directivePattern).toBeDefined();
        expect(component.directivePattern).toMatch(/^display:\w+:\w+:<params>$/);
      }
    });

    it('should include description field for each component', async () => {
      const response = await request(app).get('/api/display/components');

      for (const component of response.body.components) {
        expect(component.description).toBeDefined();
        expect(typeof component.description).toBe('string');
      }
    });
  });

  describe('Registered Components', () => {
    it('should include OrgChartComponent', async () => {
      const response = await request(app).get('/api/display/components');

      const orgChart = response.body.components.find(
        (c: { type: string }) => c.type === 'OrgChartComponent'
      );
      expect(orgChart).toBeDefined();
      expect(orgChart.directivePattern).toBe('display:hr:org_chart:<params>');
    });

    it('should include CustomerDetailCard', async () => {
      const response = await request(app).get('/api/display/components');

      const customer = response.body.components.find(
        (c: { type: string }) => c.type === 'CustomerDetailCard'
      );
      expect(customer).toBeDefined();
      expect(customer.directivePattern).toBe('display:sales:customer:<params>');
    });

    it('should include LeadsDataTable', async () => {
      const response = await request(app).get('/api/display/components');

      const leads = response.body.components.find(
        (c: { type: string }) => c.type === 'LeadsDataTable'
      );
      expect(leads).toBeDefined();
      expect(leads.directivePattern).toBe('display:sales:leads:<params>');
    });

    it('should include ForecastChart', async () => {
      const response = await request(app).get('/api/display/components');

      const forecast = response.body.components.find(
        (c: { type: string }) => c.type === 'ForecastChart'
      );
      expect(forecast).toBeDefined();
      expect(forecast.directivePattern).toBe('display:sales:forecast:<params>');
    });

    it('should include BudgetSummaryCard', async () => {
      const response = await request(app).get('/api/display/components');

      const budget = response.body.components.find(
        (c: { type: string }) => c.type === 'BudgetSummaryCard'
      );
      expect(budget).toBeDefined();
      expect(budget.directivePattern).toBe('display:finance:budget:<params>');
    });

    it('should include QuarterlyReportDashboard', async () => {
      const response = await request(app).get('/api/display/components');

      const quarterly = response.body.components.find(
        (c: { type: string }) => c.type === 'QuarterlyReportDashboard'
      );
      expect(quarterly).toBeDefined();
      expect(quarterly.directivePattern).toBe('display:finance:quarterly_report:<params>');
    });

    it('should include ApprovalsQueue', async () => {
      const response = await request(app).get('/api/display/components');

      const approvals = response.body.components.find(
        (c: { type: string }) => c.type === 'ApprovalsQueue'
      );
      expect(approvals).toBeDefined();
      expect(approvals.directivePattern).toBe('display:approvals:pending:<params>');
    });
  });

  describe('Component Descriptions', () => {
    it('should have meaningful description for OrgChartComponent', async () => {
      const response = await request(app).get('/api/display/components');

      const orgChart = response.body.components.find(
        (c: { type: string }) => c.type === 'OrgChartComponent'
      );
      expect(orgChart.description).toContain('organizational');
    });

    it('should have meaningful description for ApprovalsQueue', async () => {
      const response = await request(app).get('/api/display/components');

      const approvals = response.body.components.find(
        (c: { type: string }) => c.type === 'ApprovalsQueue'
      );
      expect(approvals.description).toContain('pending');
    });
  });
});

// ============================================================================
// ADDITIONAL EDGE CASES
// ============================================================================

describe('Display Endpoint - Edge Cases', () => {
  describe('Request Validation', () => {
    it('should handle null body gracefully', async () => {
      const response = await request(app)
        .post('/api/display')
        .send('null')
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
    });

    it('should handle non-JSON content type', async () => {
      const response = await request(app)
        .post('/api/display')
        .send('not json')
        .set('Content-Type', 'text/plain');

      // Express JSON middleware returns 400 for invalid JSON
      expect([400, 415]).toContain(response.status);
    });

    it('should handle userContext with minimal fields', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);

      const response = await request(app)
        .post('/api/display')
        .send({
          directive: 'display:hr:org_chart:userId=me',
          userContext: LIMITED_USER_CONTEXT,
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent requests', async () => {
      mockMCPTool('hr', 'get_org_chart', HR_ORG_CHART_RESPONSE);
      mockMCPTool('sales', 'get_customer', SALES_CUSTOMER_RESPONSE);
      mockMCPTool('finance', 'get_budget', FINANCE_BUDGET_RESPONSE);

      const requests = [
        request(app)
          .post('/api/display')
          .send(createDisplayRequest('display:hr:org_chart:userId=me')),
        request(app)
          .post('/api/display')
          .send(createDisplayRequest('display:sales:customer:customerId=123')),
        request(app)
          .post('/api/display')
          .send(createDisplayRequest('display:finance:budget:department=eng')),
      ];

      const responses = await Promise.all(requests);

      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
      }
    });
  });

  describe('Large Responses', () => {
    it('should handle large data sets in response', async () => {
      const largeLeadsResponse = {
        status: 'success',
        data: {
          leads: Array(100)
            .fill(null)
            .map((_, i) => ({
              id: `lead-${i}`,
              name: `Lead ${i}`,
              status: 'new',
              value: i * 1000,
            })),
          totalCount: 100,
          filters: {},
        },
      };

      mockMCPTool('sales', 'list_leads', largeLeadsResponse);

      const response = await request(app)
        .post('/api/display')
        .send(createDisplayRequest('display:sales:leads:status=all'));

      expect(response.status).toBe(200);
      expect(response.body.component.props.leads).toHaveLength(100);
    });
  });
});
