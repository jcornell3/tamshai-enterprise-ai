/**
 * Integration Test Setup for MCP UI Service
 *
 * This setup file provides:
 * - Axios mock adapter for simulating MCP Gateway responses
 * - Test fixtures for common scenarios
 * - Helper functions for test setup/teardown
 *
 * Note: Integration tests mock axios calls to mcp-gateway, so no actual gateway is needed.
 */

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Create axios mock adapter instance
export let mockAxios: MockAdapter;

/**
 * Initialize axios mock adapter before tests run.
 * Call this in beforeAll() or beforeEach() as needed.
 */
export function setupAxiosMock(): MockAdapter {
  mockAxios = new MockAdapter(axios, { onNoMatch: 'throwException' });
  return mockAxios;
}

/**
 * Reset axios mock adapter between tests.
 * Call this in beforeEach() or afterEach() to reset handlers.
 */
export function resetAxiosMock(): void {
  if (mockAxios) {
    mockAxios.reset();
  }
}

/**
 * Restore axios to original state after tests complete.
 * Call this in afterAll() to clean up.
 */
export function teardownAxiosMock(): void {
  if (mockAxios) {
    mockAxios.restore();
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Standard user context for tests
 */
export const TEST_USER_CONTEXT = {
  userId: 'test-user-123',
  roles: ['hr-read', 'finance-read', 'sales-read'],
  username: 'test.user',
  email: 'test.user@tamshai.com',
};

/**
 * Executive user context (all roles)
 */
export const EXECUTIVE_USER_CONTEXT = {
  userId: 'exec-user-456',
  roles: ['executive', 'hr-read', 'finance-read', 'sales-read', 'support-read'],
  username: 'eve.thompson',
  email: 'eve.thompson@tamshai.com',
};

/**
 * Limited user context (single role)
 */
export const LIMITED_USER_CONTEXT = {
  userId: 'limited-user-789',
  roles: ['employee'],
  username: 'frank.davis',
  email: 'frank.davis@tamshai.com',
};

// ============================================================================
// MCP Response Fixtures
// ============================================================================

/**
 * Successful HR org chart response
 */
export const HR_ORG_CHART_RESPONSE = {
  status: 'success',
  data: {
    manager: {
      id: 'manager-001',
      name: 'Alice Chen',
      title: 'VP of HR',
      department: 'Human Resources',
    },
    employee: {
      id: 'emp-001',
      name: 'Test User',
      title: 'HR Specialist',
      department: 'Human Resources',
    },
    peers: [
      {
        id: 'peer-001',
        name: 'Bob Martinez',
        title: 'HR Coordinator',
        department: 'Human Resources',
      },
    ],
    directReports: [
      {
        id: 'report-001',
        name: 'Carol Johnson',
        title: 'HR Associate',
        department: 'Human Resources',
      },
      {
        id: 'report-002',
        name: 'Dan Williams',
        title: 'HR Associate',
        department: 'Human Resources',
      },
    ],
  },
  metadata: {
    dataFreshness: new Date().toISOString(),
    truncated: false,
  },
};

/**
 * Successful Sales customer response
 */
export const SALES_CUSTOMER_RESPONSE = {
  status: 'success',
  data: {
    customer: {
      id: 'cust-001',
      name: 'Acme Corporation',
      industry: 'Technology',
      tier: 'Enterprise',
      revenue: 1500000,
    },
    contacts: [
      {
        id: 'contact-001',
        name: 'John Doe',
        role: 'CTO',
        email: 'john.doe@acme.com',
      },
    ],
    opportunities: [
      {
        id: 'opp-001',
        name: 'Enterprise License Deal',
        value: 500000,
        stage: 'Negotiation',
      },
      {
        id: 'opp-002',
        name: 'Support Contract Renewal',
        value: 100000,
        stage: 'Proposal',
      },
    ],
  },
  metadata: {
    dataFreshness: new Date().toISOString(),
    truncated: false,
  },
};

/**
 * Successful Finance budget response
 */
export const FINANCE_BUDGET_RESPONSE = {
  status: 'success',
  data: {
    department: 'Engineering',
    budget: 1000000,
    spent: 750000,
    remaining: 250000,
    fiscalYear: 2026,
  },
  metadata: {
    dataFreshness: new Date().toISOString(),
    truncated: false,
  },
};

/**
 * Truncated response (tests truncation warning handling)
 */
export const TRUNCATED_RESPONSE = {
  status: 'success',
  data: {
    leads: Array(50).fill({
      id: 'lead-001',
      name: 'Test Lead',
      status: 'new',
    }),
    totalCount: '100+',
  },
  metadata: {
    dataFreshness: new Date().toISOString(),
    truncated: true,
    totalCount: '100+',
  },
};

/**
 * MCP error response
 */
export const MCP_ERROR_RESPONSE = {
  status: 'error',
  code: 'NOT_FOUND',
  message: 'Resource not found',
  suggestedAction: 'Check the ID and try again',
};

/**
 * MCP network error (axios throws on network errors)
 */
export class MCPNetworkError extends Error {
  constructor(message = 'Network Error') {
    super(message);
    this.name = 'AxiosError';
  }
}

// ============================================================================
// MCP Gateway URL patterns
// ============================================================================

export const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || `http://localhost:${process.env.DEV_MCP_GATEWAY}`;

/**
 * Build MCP tool URL for mocking
 */
export function buildMCPUrl(server: string, tool: string): string {
  return `${MCP_GATEWAY_URL}/api/mcp/${server}/${tool}`;
}

/**
 * Build URL regex pattern for matching with query params
 */
export function buildMCPUrlPattern(server: string, tool: string): RegExp {
  return new RegExp(`${MCP_GATEWAY_URL}/api/mcp/${server}/${tool}.*`);
}
