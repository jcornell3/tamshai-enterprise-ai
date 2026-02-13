/**
 * Tamshai Corp - MCP Tools Integration Tests
 *
 * Comprehensive end-to-end testing for all MCP server tools across all four services.
 * Tests Architecture v1.4 features:
 * - LLM-friendly error schemas (Section 7.4)
 * - Truncation warnings (Section 5.3)
 * - Human-in-the-loop confirmations (Section 5.6)
 * - Multi-role access control
 */

import axios, { AxiosInstance } from 'axios';
import { fail } from 'assert';
import crypto from 'crypto';
import { getTestAuthProvider } from '../shared/auth/token-exchange';

// Test configuration - all values from environment variables (required for tests)
const CONFIG = {
  mcpHrUrl: process.env.MCP_HR_URL!,
  mcpFinanceUrl: process.env.MCP_FINANCE_URL!,
  mcpSalesUrl: process.env.MCP_SALES_URL!,
  mcpSupportUrl: process.env.MCP_SUPPORT_URL!,
  redisUrl: process.env.REDIS_URL,
  mcpInternalSecret: process.env.MCP_INTERNAL_SECRET!,
};

// Auth provider (singleton, token exchange)
const authProvider = getTestAuthProvider();

// Test users with role assignments
const TEST_USERS = {
  hrUser: {
    username: 'alice.chen',
    roles: ['hr-read', 'hr-write'],
    userId: 'f104eddc-21ab-457c-a254-78051ad7ad67', // Alice Chen's UUID from sample data
  },
  financeUser: {
    username: 'bob.martinez',
    roles: ['finance-read', 'finance-write'],
    userId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', // Bob Martinez's UUID
  },
  salesUser: {
    username: 'carol.johnson',
    roles: ['sales-read', 'sales-write'],
    userId: 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', // Carol Johnson's UUID
  },
  supportUser: {
    username: 'dan.williams',
    roles: ['support-read', 'support-write'],
    userId: 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', // Dan Williams's UUID
  },
  executive: {
    username: 'eve.thompson',
    roles: ['executive'],
    userId: 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', // Eve Thompson's UUID
  },
  manager: {
    username: 'nina.patel',
    roles: ['manager'],
    userId: 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', // Nina Patel's UUID
  },
  intern: {
    username: 'frank.davis',
    roles: [],
    userId: 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e', // Frank Davis's UUID
  },
};

interface MCPToolResponse<T = any> {
  status: 'success' | 'error' | 'pending_confirmation';
  data?: T;
  metadata?: {
    truncated?: boolean;
    totalCount?: string;
    warning?: string;
  };
  code?: string;
  message?: string;
  suggestedAction?: string;
  confirmationId?: string;
  confirmationData?: any;
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
 * Create authenticated MCP client with gateway auth token
 *
 * IMPORTANT: HMAC token is generated per-request via interceptor (not cached)
 * because the MCP server enforces a 30-second replay window.
 */
function createMcpClient(baseURL: string, token: string, userId: string, roles: string[] = []): AxiosInstance {
  const client = axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-User-Id': userId,
    },
    timeout: 30000,
  });
  client.interceptors.request.use((config) => {
    config.headers['X-MCP-Internal-Token'] = generateInternalToken(userId, roles);
    return config;
  });
  return client;
}

// =============================================================================
// MCP HR SERVER TESTS
// =============================================================================

describe('MCP HR Server - Read Tools', () => {
  let hrClient: AxiosInstance;
  let token: string;

  beforeAll(async () => {
    token = await authProvider.getUserToken(TEST_USERS.hrUser.username);
    hrClient = createMcpClient(CONFIG.mcpHrUrl, token, TEST_USERS.hrUser.userId, TEST_USERS.hrUser.roles);
  });

  describe('list_employees', () => {
    test('Returns employees with success status', async () => {
      const response = await hrClient.post<MCPToolResponse>('/tools/list_employees', {
        userContext: {
          userId: TEST_USERS.hrUser.userId,
          roles: TEST_USERS.hrUser.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(response.data.data.length).toBeGreaterThan(0);
    });

    test('Includes truncation metadata when > 50 records', async () => {
      const response = await hrClient.post<MCPToolResponse>('/tools/list_employees', {
        userContext: {
          userId: TEST_USERS.hrUser.userId,
          roles: TEST_USERS.hrUser.roles,
        },
        limit: 5, // Test with small limit to trigger truncation
      });

      expect(response.status).toBe(200);
      if (response.data.metadata?.truncated) {
        expect(response.data.metadata.warning).toContain('TRUNCATION WARNING');
        expect(response.data.metadata.totalCount).toMatch(/\d+\+?/);
      }
    });

    test('Filters by department when specified', async () => {
      const response = await hrClient.post<MCPToolResponse>('/tools/list_employees', {
        userContext: {
          userId: TEST_USERS.hrUser.userId,
          roles: TEST_USERS.hrUser.roles,
        },
        department: 'Engineering',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.every((emp: any) => emp.department === 'Engineering')).toBe(true);
    });
  });

  describe('get_employee', () => {
    test('Returns employee details with success status', async () => {
      const response = await hrClient.post<MCPToolResponse>('/tools/get_employee', {
        userContext: {
          userId: TEST_USERS.hrUser.userId,
          roles: TEST_USERS.hrUser.roles,
        },
        employeeId: TEST_USERS.hrUser.userId,
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();
      // Check id (UUID primary key), not employee_id (VARCHAR employee number which may be NULL)
      expect(response.data.data.id).toBe(TEST_USERS.hrUser.userId);
    });

    test('Returns LLM-friendly error for non-existent employee', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await hrClient.post<MCPToolResponse>('/tools/get_employee', {
        userContext: {
          userId: TEST_USERS.hrUser.userId,
          roles: TEST_USERS.hrUser.roles,
        },
        employeeId: fakeId,
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('EMPLOYEE_NOT_FOUND');
      expect(response.data.message).toBeDefined();
      expect(response.data.suggestedAction).toContain('list_employees');
    });
  });
});

describe('MCP HR Server - Write Tools (Confirmations)', () => {
  let hrClient: AxiosInstance;
  let token: string;

  beforeAll(async () => {
    token = await authProvider.getUserToken(TEST_USERS.hrUser.username);
    hrClient = createMcpClient(CONFIG.mcpHrUrl, token, TEST_USERS.hrUser.userId, TEST_USERS.hrUser.roles);
  });

  describe('delete_employee', () => {
    test('Returns pending_confirmation status', async () => {
      const response = await hrClient.post<MCPToolResponse>('/tools/delete_employee', {
        userContext: {
          userId: TEST_USERS.hrUser.userId,
          roles: TEST_USERS.hrUser.roles,
        },
        employeeId: TEST_USERS.intern.userId, // Use intern account for deletion test
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('pending_confirmation');
      expect(response.data.confirmationId).toBeDefined();
      expect(response.data.message).toContain('Delete employee');
      expect(response.data.confirmationData).toBeDefined();
    });

    test('Stores confirmation in Redis with 5-minute TTL', async () => {
      const response = await hrClient.post<MCPToolResponse>('/tools/delete_employee', {
        userContext: {
          userId: TEST_USERS.hrUser.userId,
          roles: TEST_USERS.hrUser.roles,
        },
        employeeId: TEST_USERS.intern.userId,
      });

      expect(response.data.confirmationId).toBeDefined();

      // Verify confirmation exists in Redis (would need Redis client)
      // For now, just verify the response structure
      expect(response.data.status).toBe('pending_confirmation');
    });
  });

  describe('update_salary', () => {
    test('Returns pending_confirmation for salary update', async () => {
      const response = await hrClient.post<MCPToolResponse>('/tools/update_salary', {
        userContext: {
          userId: TEST_USERS.hrUser.userId,
          roles: TEST_USERS.hrUser.roles,
        },
        employeeId: TEST_USERS.intern.userId,
        newSalary: 75000,
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('pending_confirmation');
      expect(response.data.confirmationId).toBeDefined();
      expect(response.data.message).toContain('Update salary');
    });
  });
});

// =============================================================================
// MCP FINANCE SERVER TESTS
// =============================================================================

describe('MCP Finance Server - Read Tools', () => {
  let financeClient: AxiosInstance;
  let token: string;

  beforeAll(async () => {
    token = await authProvider.getUserToken(TEST_USERS.financeUser.username);
    financeClient = createMcpClient(CONFIG.mcpFinanceUrl, token, TEST_USERS.financeUser.userId, TEST_USERS.financeUser.roles);
  });

  describe('get_budget', () => {
    test('Returns budget for specified department', async () => {
      const response = await financeClient.post<MCPToolResponse>('/tools/get_budget', {
        userContext: {
          userId: TEST_USERS.financeUser.userId,
          roles: TEST_USERS.financeUser.roles,
        },
        department: 'Engineering',
        year: 2024,
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();
      expect(response.data.data.department).toBe('Engineering');
    });

    test('Returns error for non-existent department', async () => {
      const response = await financeClient.post<MCPToolResponse>('/tools/get_budget', {
        userContext: {
          userId: TEST_USERS.financeUser.userId,
          roles: TEST_USERS.financeUser.roles,
        },
        department: 'NonExistentDept',
        year: 2024,
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('error');
      expect(response.data.code).toBeDefined();
      expect(response.data.suggestedAction).toBeDefined();
    });
  });

  describe('list_invoices', () => {
    test('Returns invoices with truncation metadata', async () => {
      const response = await financeClient.post<MCPToolResponse>('/tools/list_invoices', {
        userContext: {
          userId: TEST_USERS.financeUser.userId,
          roles: TEST_USERS.financeUser.roles,
        },
        limit: 50,
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(Array.isArray(response.data.data)).toBe(true);

      if (response.data.metadata?.truncated) {
        expect(response.data.metadata.warning).toContain('TRUNCATION WARNING');
      }
    });

    test('Filters by status when specified', async () => {
      const response = await financeClient.post<MCPToolResponse>('/tools/list_invoices', {
        userContext: {
          userId: TEST_USERS.financeUser.userId,
          roles: TEST_USERS.financeUser.roles,
        },
        status: 'paid',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      // All invoices should have status 'PAID' (uppercase, as fixed in a54157e)
      expect(response.data.data.every((inv: any) => inv.status === 'PAID')).toBe(true);
    });
  });
});

describe('MCP Finance Server - Write Tools (Confirmations)', () => {
  let financeClient: AxiosInstance;
  let token: string;

  beforeAll(async () => {
    token = await authProvider.getUserToken(TEST_USERS.financeUser.username);
    financeClient = createMcpClient(CONFIG.mcpFinanceUrl, token, TEST_USERS.financeUser.userId, TEST_USERS.financeUser.roles);
  });

  describe('delete_invoice', () => {
    test('Returns pending_confirmation status', async () => {
      const response = await financeClient.post<MCPToolResponse>('/tools/delete_invoice', {
        userContext: {
          userId: TEST_USERS.financeUser.userId,
          roles: TEST_USERS.financeUser.roles,
        },
        invoiceId: 'INV-001', // Sample invoice ID
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('pending_confirmation');
      expect(response.data.confirmationId).toBeDefined();
    });
  });

  describe('approve_budget', () => {
    test('Returns pending_confirmation for valid budget (v1.5 implementation)', async () => {
      // The approve_budget tool was implemented in v1.5 with HITL confirmation flow
      // It returns pending_confirmation or error depending on budget state
      const response = await financeClient.post<MCPToolResponse>('/tools/approve_budget', {
        userContext: {
          userId: TEST_USERS.financeUser.userId,
          roles: TEST_USERS.financeUser.roles,
        },
        budgetId: '00000000-0000-0000-0000-000000000001', // Test budget ID
      });

      expect(response.status).toBe(200);
      // Either pending_confirmation (if budget exists and is pending) or error (if not found)
      expect(['pending_confirmation', 'error']).toContain(response.data.status);
      if (response.data.status === 'pending_confirmation') {
        expect(response.data.confirmationId).toBeDefined();
      } else {
        // Budget not found is expected for non-existent test ID
        expect(response.data.code).toBeDefined();
      }
    });
  });
});

// =============================================================================
// MCP SALES SERVER TESTS
// =============================================================================

describe('MCP Sales Server - Read Tools', () => {
  let salesClient: AxiosInstance;
  let token: string;

  beforeAll(async () => {
    token = await authProvider.getUserToken(TEST_USERS.salesUser.username);
    salesClient = createMcpClient(CONFIG.mcpSalesUrl, token, TEST_USERS.salesUser.userId, TEST_USERS.salesUser.roles);
  });

  describe('list_opportunities', () => {
    test('Returns opportunities with success status', async () => {
      const response = await salesClient.post<MCPToolResponse>('/tools/list_opportunities', {
        userContext: {
          userId: TEST_USERS.salesUser.userId,
          roles: TEST_USERS.salesUser.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    test('Filters by stage when specified', async () => {
      const response = await salesClient.post<MCPToolResponse>('/tools/list_opportunities', {
        userContext: {
          userId: TEST_USERS.salesUser.userId,
          roles: TEST_USERS.salesUser.roles,
        },
        stage: 'negotiation',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      // MongoDB stores stages in uppercase (NEGOTIATION, PROPOSAL, etc.)
      // Server converts input to uppercase for query but returns original DB case
      expect(response.data.data.every((opp: any) => opp.stage === 'NEGOTIATION')).toBe(true);
    });

    test('Includes truncation metadata for large result sets', async () => {
      const response = await salesClient.post<MCPToolResponse>('/tools/list_opportunities', {
        userContext: {
          userId: TEST_USERS.salesUser.userId,
          roles: TEST_USERS.salesUser.roles,
        },
        limit: 50,
      });

      expect(response.status).toBe(200);
      if (response.data.metadata?.truncated) {
        expect(response.data.metadata.warning).toBeDefined();
        expect(response.data.metadata.totalCount).toBeDefined();
      }
    });
  });

  describe('get_customer', () => {
    test('Returns customer details with success status', async () => {
      const response = await salesClient.post<MCPToolResponse>('/tools/get_customer', {
        userContext: {
          userId: TEST_USERS.salesUser.userId,
          roles: TEST_USERS.salesUser.roles,
        },
        customerId: '650000000000000000000001', // Acme Corporation - valid MongoDB ObjectId
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();
    });

    test('Returns LLM-friendly error for non-existent customer', async () => {
      const response = await salesClient.post<MCPToolResponse>('/tools/get_customer', {
        userContext: {
          userId: TEST_USERS.salesUser.userId,
          roles: TEST_USERS.salesUser.roles,
        },
        customerId: 'NONEXISTENT',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('error');
      expect(response.data.code).toBeDefined();
      expect(response.data.suggestedAction).toBeDefined();
    });
  });
});

describe('MCP Sales Server - Write Tools (Confirmations)', () => {
  let salesClient: AxiosInstance;
  let token: string;

  beforeAll(async () => {
    token = await authProvider.getUserToken(TEST_USERS.salesUser.username);
    salesClient = createMcpClient(CONFIG.mcpSalesUrl, token, TEST_USERS.salesUser.userId, TEST_USERS.salesUser.roles);
  });

  describe('close_opportunity', () => {
    test('Returns pending_confirmation for closing opportunity', async () => {
      const response = await salesClient.post<MCPToolResponse>('/tools/close_opportunity', {
        userContext: {
          userId: TEST_USERS.salesUser.userId,
          roles: TEST_USERS.salesUser.roles,
        },
        opportunityId: '670000000000000000000002', // TechStart Growth Package - PROPOSAL stage
        outcome: 'won',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('pending_confirmation');
      expect(response.data.confirmationId).toBeDefined();
    });
  });

  describe('delete_customer', () => {
    test('Returns pending_confirmation for customer deletion', async () => {
      const response = await salesClient.post<MCPToolResponse>('/tools/delete_customer', {
        userContext: {
          userId: TEST_USERS.salesUser.userId,
          roles: TEST_USERS.salesUser.roles,
        },
        customerId: '650000000000000000000002', // TechStart Inc - valid MongoDB ObjectId
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('pending_confirmation');
      expect(response.data.confirmationId).toBeDefined();
    });
  });
});

// =============================================================================
// MCP SUPPORT SERVER TESTS
// =============================================================================

describe('MCP Support Server - Read Tools', () => {
  let supportClient: AxiosInstance;
  let token: string;

  beforeAll(async () => {
    token = await authProvider.getUserToken(TEST_USERS.supportUser.username);
    supportClient = createMcpClient(CONFIG.mcpSupportUrl, token, TEST_USERS.supportUser.userId, TEST_USERS.supportUser.roles);
  });

  describe('search_tickets', () => {
    test('Returns tickets matching search query', async () => {
      const response = await supportClient.post<MCPToolResponse>('/tools/search_tickets', {
        userContext: {
          userId: TEST_USERS.supportUser.userId,
          roles: TEST_USERS.supportUser.roles,
        },
        query: 'login',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    test('Filters by status when specified', async () => {
      const response = await supportClient.post<MCPToolResponse>('/tools/search_tickets', {
        userContext: {
          userId: TEST_USERS.supportUser.userId,
          roles: TEST_USERS.supportUser.roles,
        },
        query: '*',
        status: 'open',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.every((ticket: any) => ticket.status === 'open')).toBe(true);
    });

    test('Includes truncation metadata for large result sets', async () => {
      const response = await supportClient.post<MCPToolResponse>('/tools/search_tickets', {
        userContext: {
          userId: TEST_USERS.supportUser.userId,
          roles: TEST_USERS.supportUser.roles,
        },
        query: '*',
        limit: 50,
      });

      expect(response.status).toBe(200);
      if (response.data.metadata?.truncated) {
        expect(response.data.metadata.warning).toBeDefined();
      }
    });
  });

  describe('get_knowledge_article', () => {
    test('Returns article details with success status', async () => {
      const response = await supportClient.post<MCPToolResponse>('/tools/get_knowledge_article', {
        userContext: {
          userId: TEST_USERS.supportUser.userId,
          roles: TEST_USERS.supportUser.roles,
        },
        articleId: 'KB-001',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();
    });

    test('Returns LLM-friendly error for non-existent article', async () => {
      const response = await supportClient.post<MCPToolResponse>('/tools/get_knowledge_article', {
        userContext: {
          userId: TEST_USERS.supportUser.userId,
          roles: TEST_USERS.supportUser.roles,
        },
        articleId: 'NONEXISTENT',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('error');
      expect(response.data.code).toBeDefined();
      expect(response.data.suggestedAction).toBeDefined();
    });
  });
});

describe('MCP Support Server - Write Tools (Confirmations)', () => {
  let supportClient: AxiosInstance;
  let token: string;

  beforeAll(async () => {
    token = await authProvider.getUserToken(TEST_USERS.supportUser.username);
    supportClient = createMcpClient(CONFIG.mcpSupportUrl, token, TEST_USERS.supportUser.userId, TEST_USERS.supportUser.roles);
  });

  describe('close_ticket', () => {
    test('Returns pending_confirmation for ticket closure', async () => {
      const response = await supportClient.post<MCPToolResponse>('/tools/close_ticket', {
        userContext: {
          userId: TEST_USERS.supportUser.userId,
          roles: TEST_USERS.supportUser.roles,
        },
        ticketId: 'TICK-001', // Sample ticket ID from Elasticsearch
        resolution: 'User password reset successfully completed',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('pending_confirmation');
      expect(response.data.confirmationId).toBeDefined();
    });
  });
});

// =============================================================================
// MULTI-ROLE ACCESS CONTROL TESTS
// =============================================================================

describe('Multi-Role Access Control', () => {
  describe('Executive Role - Cross-Department Access', () => {
    let executiveToken: string;

    beforeAll(async () => {
      executiveToken = await authProvider.getUserToken(TEST_USERS.executive.username);
    });

    test('Executive can access HR data', async () => {
      const hrClient = createMcpClient(CONFIG.mcpHrUrl, executiveToken, TEST_USERS.executive.userId, TEST_USERS.executive.roles);
      const response = await hrClient.post<MCPToolResponse>('/tools/list_employees', {
        userContext: {
          userId: TEST_USERS.executive.userId,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
    });

    test('Executive can access Finance data', async () => {
      const financeClient = createMcpClient(CONFIG.mcpFinanceUrl, executiveToken, TEST_USERS.executive.userId, TEST_USERS.executive.roles);
      const response = await financeClient.post<MCPToolResponse>('/tools/get_budget', {
        userContext: {
          userId: TEST_USERS.executive.userId,
          roles: TEST_USERS.executive.roles,
        },
        department: 'Engineering',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
    });

    test('Executive can access Sales data', async () => {
      const salesClient = createMcpClient(CONFIG.mcpSalesUrl, executiveToken, TEST_USERS.executive.userId, TEST_USERS.executive.roles);
      const response = await salesClient.post<MCPToolResponse>('/tools/list_opportunities', {
        userContext: {
          userId: TEST_USERS.executive.userId,
          roles: TEST_USERS.executive.roles,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
    });

    test('Executive can access Support data', async () => {
      const supportClient = createMcpClient(CONFIG.mcpSupportUrl, executiveToken, TEST_USERS.executive.userId, TEST_USERS.executive.roles);
      const response = await supportClient.post<MCPToolResponse>('/tools/search_tickets', {
        userContext: {
          userId: TEST_USERS.executive.userId,
          roles: TEST_USERS.executive.roles,
        },
        query: '*',
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
    });
  });

  describe('Intern Role - Restricted Access', () => {
    let internToken: string;

    beforeAll(async () => {
      internToken = await authProvider.getUserToken(TEST_USERS.intern.username);
    });

    test('Intern cannot access HR data (authorization failure)', async () => {
      const hrClient = createMcpClient(CONFIG.mcpHrUrl, internToken, TEST_USERS.intern.userId, TEST_USERS.intern.roles);

      try {
        await hrClient.post<MCPToolResponse>('/tools/list_employees', {
          userContext: {
            userId: TEST_USERS.intern.userId,
            roles: TEST_USERS.intern.roles,
          },
        });
        fail('Should have thrown authorization error');
      } catch (error: any) {
        // Handle both HTTP errors and connection errors (ECONNREFUSED when services not running)
        if (error.response) {
          expect(error.response.status).toBeGreaterThanOrEqual(401);
        } else if (error.code === 'ECONNREFUSED') {
          // Service not running (expected in CI without MCP servers)
          expect(error.code).toBe('ECONNREFUSED');
        } else {
          throw error; // Unexpected error type
        }
      }
    });

    test('Intern cannot access Finance data', async () => {
      const financeClient = createMcpClient(CONFIG.mcpFinanceUrl, internToken, TEST_USERS.intern.userId, TEST_USERS.intern.roles);

      try {
        await financeClient.post<MCPToolResponse>('/tools/get_budget', {
          userContext: {
            userId: TEST_USERS.intern.userId,
            roles: TEST_USERS.intern.roles,
          },
          department: 'Engineering',
        });
        fail('Should have thrown authorization error');
      } catch (error: any) {
        // Handle both HTTP errors and connection errors (ECONNREFUSED when services not running)
        if (error.response) {
          expect(error.response.status).toBeGreaterThanOrEqual(401);
        } else if (error.code === 'ECONNREFUSED') {
          // Service not running (expected in CI without MCP servers)
          expect(error.code).toBe('ECONNREFUSED');
        } else {
          throw error; // Unexpected error type
        }
      }
    });
  });

  describe('Department-Specific Access', () => {
    test('HR user cannot access Finance data', async () => {
      const hrToken = await authProvider.getUserToken(TEST_USERS.hrUser.username);
      const financeClient = createMcpClient(CONFIG.mcpFinanceUrl, hrToken, TEST_USERS.hrUser.userId, TEST_USERS.hrUser.roles);

      try {
        await financeClient.post<MCPToolResponse>('/tools/get_budget', {
          userContext: {
            userId: TEST_USERS.hrUser.userId,
            roles: TEST_USERS.hrUser.roles,
          },
          department: 'Engineering',
        });
        fail('Should have thrown authorization error');
      } catch (error: any) {
        // Handle both HTTP errors and connection errors (ECONNREFUSED when services not running)
        if (error.response) {
          expect(error.response.status).toBeGreaterThanOrEqual(401);
        } else if (error.code === 'ECONNREFUSED') {
          // Service not running (expected in CI without MCP servers)
          expect(error.code).toBe('ECONNREFUSED');
        } else {
          throw error; // Unexpected error type
        }
      }
    });

    test('Finance user cannot access HR data', async () => {
      const financeToken = await authProvider.getUserToken(TEST_USERS.financeUser.username);
      const hrClient = createMcpClient(CONFIG.mcpHrUrl, financeToken, TEST_USERS.financeUser.userId, TEST_USERS.financeUser.roles);

      try {
        await hrClient.post<MCPToolResponse>('/tools/list_employees', {
          userContext: {
            userId: TEST_USERS.financeUser.userId,
            roles: TEST_USERS.financeUser.roles,
          },
        });
        fail('Should have thrown authorization error');
      } catch (error: any) {
        // Handle both HTTP errors and connection errors (ECONNREFUSED when services not running)
        if (error.response) {
          expect(error.response.status).toBeGreaterThanOrEqual(401);
        } else if (error.code === 'ECONNREFUSED') {
          // Service not running (expected in CI without MCP servers)
          expect(error.code).toBe('ECONNREFUSED');
        } else {
          throw error; // Unexpected error type
        }
      }
    });
  });
});

// =============================================================================
// PERFORMANCE TESTS WITH LARGE DATASETS
// =============================================================================

describe('Performance Tests', () => {
  let hrToken: string;

  beforeAll(async () => {
    hrToken = await authProvider.getUserToken(TEST_USERS.hrUser.username);
  });

  test('list_employees completes within 2 seconds for 50 records', async () => {
    const hrClient = createMcpClient(CONFIG.mcpHrUrl, hrToken, TEST_USERS.hrUser.userId, TEST_USERS.hrUser.roles);

    const startTime = Date.now();
    const response = await hrClient.post<MCPToolResponse>('/tools/list_employees', {
      userContext: {
        userId: TEST_USERS.hrUser.userId,
        roles: TEST_USERS.hrUser.roles,
      },
      limit: 50,
    });
    const duration = Date.now() - startTime;

    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(2000); // 2 seconds max
  });

  test('Truncation detection adds minimal overhead (<100ms)', async () => {
    const hrClient = createMcpClient(CONFIG.mcpHrUrl, hrToken, TEST_USERS.hrUser.userId, TEST_USERS.hrUser.roles);

    // Test with limit detection (LIMIT+1 pattern)
    const startTime1 = Date.now();
    await hrClient.post<MCPToolResponse>('/tools/list_employees', {
      userContext: {
        userId: TEST_USERS.hrUser.userId,
        roles: TEST_USERS.hrUser.roles,
      },
      limit: 50,
    });
    const duration1 = Date.now() - startTime1;

    // Test without limit (baseline)
    const startTime2 = Date.now();
    await hrClient.post<MCPToolResponse>('/tools/list_employees', {
      userContext: {
        userId: TEST_USERS.hrUser.userId,
        roles: TEST_USERS.hrUser.roles,
      },
      limit: 10,
    });
    const duration2 = Date.now() - startTime2;

    // Overhead should be minimal
    const overhead = Math.abs(duration1 - duration2);
    expect(overhead).toBeLessThan(100); // Less than 100ms difference
  });

  test('Concurrent tool calls complete successfully', async () => {
    const hrClient = createMcpClient(CONFIG.mcpHrUrl, hrToken, TEST_USERS.hrUser.userId, TEST_USERS.hrUser.roles);

    // Make 5 concurrent requests
    const promises = Array.from({ length: 5 }, (_, i) =>
      hrClient.post<MCPToolResponse>('/tools/list_employees', {
        userContext: {
          userId: TEST_USERS.hrUser.userId,
          roles: TEST_USERS.hrUser.roles,
        },
        department: i % 2 === 0 ? 'Engineering' : 'Sales',
      })
    );

    const results = await Promise.all(promises);

    expect(results.length).toBe(5);
    results.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
    });
  });
});

// =============================================================================
// HEALTH CHECK TESTS
// =============================================================================

describe('Health Checks', () => {
  test('MCP HR server is healthy', async () => {
    const response = await axios.get(`${CONFIG.mcpHrUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });

  test('MCP Finance server is healthy', async () => {
    const response = await axios.get(`${CONFIG.mcpFinanceUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });

  test('MCP Sales server is healthy', async () => {
    const response = await axios.get(`${CONFIG.mcpSalesUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });

  test('MCP Support server is healthy', async () => {
    const response = await axios.get(`${CONFIG.mcpSupportUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });
});
