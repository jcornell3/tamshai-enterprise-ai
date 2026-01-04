/**
 * Budget Approval Workflow Integration Tests - TDD RED PHASE
 *
 * GitHub Issue #78: feat(v1.5): Add approval workflow to department_budgets
 *
 * These tests are written FIRST, before the approval workflow exists.
 * They define the expected behavior for the v1.5 budget approval feature.
 *
 * Expected: ALL TESTS WILL FAIL initially (RED phase)
 *
 * Tests will fail with errors like:
 * - "column does not exist"
 * - "relation does not exist"
 * - "NOT_IMPLEMENTED" error responses
 *
 * Test Categories:
 * 1. Schema Migration Tests - Verify approval columns exist (8 tests)
 * 2. Budget Approval History Table Tests (3 tests)
 * 3. approve_budget MCP Tool Tests (7 tests)
 * 4. submit_budget MCP Tool Tests (5 tests)
 * 5. Business Rules Tests (5 tests)
 *
 * Total: 28 tests
 *
 * Current State (v1.3):
 * - finance.department_budgets has NO approval workflow columns
 * - No budget_approval_history table exists
 * - approve_budget tool returns NOT_IMPLEMENTED error
 *
 * Target State (v1.5):
 * - department_budgets gets: status, submitted_by, submitted_at, approved_by, approved_at, rejection_reason, version
 * - New table: budget_approval_history with full audit trail
 * - approve_budget tool returns pending_confirmation status
 * - New submit_budget tool for department heads
 */

import { Client } from 'pg';
import axios, { AxiosInstance } from 'axios';
import {
  createFinanceUserClient,
  getAdminPoolFinance,
  TEST_USERS,
} from './setup';

// MCP Tool Response type (matching v1.4 spec)
interface MCPToolResponse<T = unknown> {
  status: 'success' | 'error' | 'pending_confirmation';
  data?: T;
  code?: string;
  message?: string;
  suggestedAction?: string;
  confirmationId?: string;
  confirmationData?: Record<string, unknown>;
  metadata?: {
    truncated?: boolean;
    totalCount?: string;
    warning?: string | null;
  };
}

// Budget status enum (v1.5 target)
type BudgetStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

// Budget with approval columns (v1.5 target schema)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface BudgetWithApproval {
  id: string;
  budget_id: string;
  department_code: string;
  department: string;
  fiscal_year: number;
  budgeted_amount: number;
  actual_amount: number;
  forecast_amount: number;
  notes: string | null;
  // NEW v1.5 approval columns (these DO NOT EXIST yet)
  status: BudgetStatus;
  submitted_by: string | null;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  version: number;
}

// Budget approval history entry (v1.5 target)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface BudgetApprovalHistory {
  id: string;
  budget_id: string;
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';
  actor_id: string;
  action_at: Date;
  comments: string | null;
}

describe('Budget Approval Workflow - TDD RED PHASE', () => {
  let financeClient: AxiosInstance;

  beforeAll(() => {
    // Establish admin pool connection (for future admin operations)
    getAdminPoolFinance();

    // Create axios client for MCP Finance server
    financeClient = axios.create({
      baseURL: process.env.MCP_FINANCE_URL || 'http://localhost:3102',
      timeout: 10000,
      validateStatus: () => true, // Don't throw on non-2xx status
    });
  });

  // ============================================================
  // SECTION 1: Schema Migration Tests
  // Verify that approval workflow columns exist in department_budgets
  // These tests WILL FAIL because the columns don't exist in v1.3
  // ============================================================

  describe('Budget Approval Schema - department_budgets approval columns', () => {
    let client: Client;

    beforeAll(async () => {
      // Use finance admin client to check schema
      client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );
    });

    afterAll(async () => {
      await client.end();
    });

    test('should have status column (DRAFT, PENDING_APPROVAL, APPROVED, REJECTED)', async () => {
      // TDD RED: This column DOES NOT EXIST in v1.3
      // Expected error: "column \"status\" does not exist"

      const result = await client.query(`
        SELECT status FROM finance.department_budgets LIMIT 1
      `);

      // When implemented, status should be one of the valid enum values
      expect(result.rows.length).toBeGreaterThanOrEqual(0);
      if (result.rows.length > 0) {
        expect(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']).toContain(
          result.rows[0].status
        );
      }
    });

    test('should have submitted_by column referencing hr.employees', async () => {
      // TDD RED: This column DOES NOT EXIST in v1.3
      // Expected error: "column \"submitted_by\" does not exist"

      const result = await client.query(`
        SELECT submitted_by FROM finance.department_budgets LIMIT 1
      `);

      // When implemented, submitted_by should be a UUID or null
      expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });

    test('should have submitted_at timestamp column', async () => {
      // TDD RED: This column DOES NOT EXIST in v1.3
      // Expected error: "column \"submitted_at\" does not exist"

      const result = await client.query(`
        SELECT submitted_at FROM finance.department_budgets LIMIT 1
      `);

      expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });

    test('should have approved_by column referencing hr.employees', async () => {
      // TDD RED: This column DOES NOT EXIST in v1.3
      // Expected error: "column \"approved_by\" does not exist"

      const result = await client.query(`
        SELECT approved_by FROM finance.department_budgets LIMIT 1
      `);

      expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });

    test('should have approved_at timestamp column', async () => {
      // TDD RED: This column DOES NOT EXIST in v1.3
      // Expected error: "column \"approved_at\" does not exist"

      const result = await client.query(`
        SELECT approved_at FROM finance.department_budgets LIMIT 1
      `);

      expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });

    test('should have rejection_reason text column', async () => {
      // TDD RED: This column DOES NOT EXIST in v1.3
      // Expected error: "column \"rejection_reason\" does not exist"

      const result = await client.query(`
        SELECT rejection_reason FROM finance.department_budgets LIMIT 1
      `);

      expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });

    test('should have version integer column for optimistic locking', async () => {
      // TDD RED: This column DOES NOT EXIST in v1.3
      // Expected error: "column \"version\" does not exist"

      const result = await client.query(`
        SELECT version FROM finance.department_budgets LIMIT 1
      `);

      // Version should be an integer, starting at 1
      expect(result.rows.length).toBeGreaterThanOrEqual(0);
      if (result.rows.length > 0) {
        expect(typeof result.rows[0].version).toBe('number');
        expect(result.rows[0].version).toBeGreaterThanOrEqual(1);
      }
    });

    test('should have default status of DRAFT for new budgets', async () => {
      // TDD RED: The status column DOES NOT EXIST in v1.3
      // Expected error: "column \"status\" does not exist"

      // Insert a test budget and verify default status
      const testBudgetId = `test-default-status-${Date.now()}`;

      const insertResult = await client.query(`
        INSERT INTO finance.department_budgets
          (budget_id, department_code, department, fiscal_year, budgeted_amount, amount)
        VALUES ($1, 'TEST', 'Test Department', 2026, 100000, 100000)
        RETURNING status
      `, [testBudgetId]);

      expect(insertResult.rows[0].status).toBe('DRAFT');

      // Cleanup
      await client.query(
        'DELETE FROM finance.department_budgets WHERE budget_id = $1',
        [testBudgetId]
      );
    });
  });

  // ============================================================
  // SECTION 2: Budget Approval History Table Tests
  // Verify that the audit trail table exists
  // These tests WILL FAIL because the table doesn't exist in v1.3
  // ============================================================

  describe('Budget Approval Schema - budget_approval_history table', () => {
    let client: Client;

    beforeAll(async () => {
      client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );
    });

    afterAll(async () => {
      await client.end();
    });

    test('should have budget_approval_history table', async () => {
      // TDD RED: This table DOES NOT EXIST in v1.3
      // Expected error: "relation \"finance.budget_approval_history\" does not exist"

      const result = await client.query(`
        SELECT * FROM finance.budget_approval_history LIMIT 1
      `);

      expect(result.rows).toBeDefined();
    });

    test('should have required columns: id, budget_id, action, actor_id, action_at, comments', async () => {
      // TDD RED: This table DOES NOT EXIST in v1.3
      // Expected error: "relation \"finance.budget_approval_history\" does not exist"

      const result = await client.query(`
        SELECT
          id,
          budget_id,
          action,
          actor_id,
          action_at,
          comments
        FROM finance.budget_approval_history
        LIMIT 1
      `);

      // When implemented, all columns should exist
      expect(result.rows).toBeDefined();
    });

    test('should have RLS policy for finance-read access', async () => {
      // TDD RED: This table DOES NOT EXIST in v1.3
      // Create a finance-read user and verify they can query the history

      const financeReadClient = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department
      );

      try {
        const result = await financeReadClient.query(`
          SELECT * FROM finance.budget_approval_history LIMIT 10
        `);

        // Finance-read should be able to see approval history
        expect(result.rows).toBeDefined();
      } finally {
        await financeReadClient.end();
      }
    });
  });

  // ============================================================
  // SECTION 3: approve_budget MCP Tool Tests
  // Verify the tool returns pending_confirmation and handles business rules
  // These tests WILL FAIL because the tool returns NOT_IMPLEMENTED in v1.3
  // ============================================================

  describe('approve_budget MCP Tool', () => {
    describe('validation', () => {
      test('should reject approval of non-PENDING_APPROVAL budgets', async () => {
        // TDD RED: Tool returns NOT_IMPLEMENTED in v1.3
        // In v1.5, this should return an error with code 'INVALID_STATUS'

        const response = await financeClient.post<MCPToolResponse>(
          '/tools/approve_budget',
          {
            userContext: {
              userId: TEST_USERS.financeWrite.userId,
              roles: TEST_USERS.financeWrite.roles,
            },
            budgetId: 'BUD-ENG-2024-SAL', // This budget exists but has no status in v1.3
            approvedAmount: 2500000,
          }
        );

        // In v1.5, should get INVALID_STATUS error, not NOT_IMPLEMENTED
        expect(response.data.status).toBe('error');
        expect(response.data.code).toBe('INVALID_STATUS');
        expect(response.data.message).toContain('PENDING_APPROVAL');
      });

      test('should require finance-write role', async () => {
        // TDD RED: Tool returns NOT_IMPLEMENTED for any request in v1.3
        // In v1.5, this should return UNAUTHORIZED error for finance-read user

        const response = await financeClient.post<MCPToolResponse>(
          '/tools/approve_budget',
          {
            userContext: {
              userId: TEST_USERS.financeRead.userId,
              roles: TEST_USERS.financeRead.roles, // Only has finance-read, not finance-write
            },
            budgetId: 'BUD-ENG-2024-SAL',
            approvedAmount: 2500000,
          }
        );

        expect(response.data.status).toBe('error');
        expect(response.data.code).toBe('UNAUTHORIZED');
        expect(response.data.suggestedAction).toContain('finance-write');
      });

      test('should prevent approving own submitted budget (separation of duties)', async () => {
        // TDD RED: No submission workflow exists in v1.3
        // In v1.5, if alice.chen submitted a budget, she cannot approve it

        // This test assumes alice.chen submitted the budget
        const response = await financeClient.post<MCPToolResponse>(
          '/tools/approve_budget',
          {
            userContext: {
              userId: TEST_USERS.hrWrite.userId, // alice.chen
              roles: ['finance-write'], // Assuming she has finance-write for test
            },
            budgetId: 'budget-submitted-by-alice', // Hypothetical budget
            approvedAmount: 500000,
          }
        );

        expect(response.data.status).toBe('error');
        expect(response.data.code).toBe('SEPARATION_OF_DUTIES');
        expect(response.data.message).toContain('cannot approve your own');
      });
    });

    describe('confirmation flow (v1.4 pattern)', () => {
      test('should return pending_confirmation status', async () => {
        // TDD RED: Tool returns NOT_IMPLEMENTED in v1.3
        // In v1.5, should return pending_confirmation for valid request

        const response = await financeClient.post<MCPToolResponse>(
          '/tools/approve_budget',
          {
            userContext: {
              userId: TEST_USERS.financeWrite.userId,
              roles: TEST_USERS.financeWrite.roles,
            },
            budgetId: 'BUD-ENG-2024-SAL',
            approvedAmount: 2500000,
          }
        );

        // In v1.5, should get pending_confirmation, not NOT_IMPLEMENTED error
        expect(response.data.status).toBe('pending_confirmation');
      });

      test('should include confirmationId', async () => {
        // TDD RED: Tool returns NOT_IMPLEMENTED in v1.3

        const response = await financeClient.post<MCPToolResponse>(
          '/tools/approve_budget',
          {
            userContext: {
              userId: TEST_USERS.financeWrite.userId,
              roles: TEST_USERS.financeWrite.roles,
            },
            budgetId: 'BUD-ENG-2024-SAL',
            approvedAmount: 2500000,
          }
        );

        expect(response.data.status).toBe('pending_confirmation');
        expect(response.data.confirmationId).toBeDefined();
        expect(typeof response.data.confirmationId).toBe('string');
        expect(response.data.confirmationId?.length).toBeGreaterThan(0);
      });

      test('should include confirmation message with budget amount and department', async () => {
        // TDD RED: Tool returns NOT_IMPLEMENTED in v1.3

        const response = await financeClient.post<MCPToolResponse>(
          '/tools/approve_budget',
          {
            userContext: {
              userId: TEST_USERS.financeWrite.userId,
              roles: TEST_USERS.financeWrite.roles,
            },
            budgetId: 'BUD-ENG-2024-SAL',
            approvedAmount: 2500000,
          }
        );

        expect(response.data.status).toBe('pending_confirmation');
        expect(response.data.message).toContain('Engineering');
        expect(response.data.message).toContain('2500000');
        expect(response.data.confirmationData).toMatchObject({
          budgetId: 'BUD-ENG-2024-SAL',
          department: 'Engineering',
          amount: 2500000,
        });
      });

      test('should execute approval on confirmation', async () => {
        // TDD RED: No confirmation execution in v1.3

        // Step 1: Request approval (get confirmationId)
        const approvalResponse = await financeClient.post<MCPToolResponse>(
          '/tools/approve_budget',
          {
            userContext: {
              userId: TEST_USERS.financeWrite.userId,
              roles: TEST_USERS.financeWrite.roles,
            },
            budgetId: 'BUD-ENG-2024-SAL',
            approvedAmount: 2500000,
          }
        );

        expect(approvalResponse.data.status).toBe('pending_confirmation');
        const confirmationId = approvalResponse.data.confirmationId;

        // Step 2: Execute confirmation
        const executeResponse = await financeClient.post<MCPToolResponse>(
          '/execute',
          {
            userContext: {
              userId: TEST_USERS.financeWrite.userId,
              roles: TEST_USERS.financeWrite.roles,
            },
            confirmationId,
            approved: true,
          }
        );

        expect(executeResponse.data.status).toBe('success');
        expect(executeResponse.data.data).toMatchObject({
          budgetId: 'BUD-ENG-2024-SAL',
          status: 'APPROVED',
          approvedBy: TEST_USERS.financeWrite.userId,
        });
      });

      test('should execute rejection on denial', async () => {
        // TDD RED: No confirmation execution in v1.3

        // Step 1: Request approval (get confirmationId)
        const approvalResponse = await financeClient.post<MCPToolResponse>(
          '/tools/approve_budget',
          {
            userContext: {
              userId: TEST_USERS.financeWrite.userId,
              roles: TEST_USERS.financeWrite.roles,
            },
            budgetId: 'BUD-HR-2024-SAL',
            approvedAmount: 750000,
          }
        );

        expect(approvalResponse.data.status).toBe('pending_confirmation');
        const confirmationId = approvalResponse.data.confirmationId;

        // Step 2: Reject the confirmation
        const executeResponse = await financeClient.post<MCPToolResponse>(
          '/execute',
          {
            userContext: {
              userId: TEST_USERS.financeWrite.userId,
              roles: TEST_USERS.financeWrite.roles,
            },
            confirmationId,
            approved: false,
            rejectionReason: 'Budget exceeds department allocation limits',
          }
        );

        expect(executeResponse.data.status).toBe('success');
        expect(executeResponse.data.data).toMatchObject({
          budgetId: 'BUD-HR-2024-SAL',
          status: 'REJECTED',
          rejectionReason: 'Budget exceeds department allocation limits',
        });
      });
    });

    describe('audit trail', () => {
      test('should create budget_approval_history entry on approval', async () => {
        // TDD RED: No approval history table in v1.3

        const client = await createFinanceUserClient(
          TEST_USERS.financeWrite.userId,
          TEST_USERS.financeWrite.roles,
          TEST_USERS.financeWrite.department
        );

        try {
          // Approve a budget through the tool flow
          const approvalResponse = await financeClient.post<MCPToolResponse>(
            '/tools/approve_budget',
            {
              userContext: {
                userId: TEST_USERS.financeWrite.userId,
                roles: TEST_USERS.financeWrite.roles,
              },
              budgetId: 'BUD-FIN-2024-SAL',
              approvedAmount: 450000,
            }
          );

          // Execute the approval
          if (approvalResponse.data.confirmationId) {
            await financeClient.post('/execute', {
              userContext: {
                userId: TEST_USERS.financeWrite.userId,
                roles: TEST_USERS.financeWrite.roles,
              },
              confirmationId: approvalResponse.data.confirmationId,
              approved: true,
            });
          }

          // Check audit trail
          const historyResult = await client.query(`
            SELECT * FROM finance.budget_approval_history
            WHERE budget_id = (SELECT id FROM finance.department_budgets WHERE budget_id = 'BUD-FIN-2024-SAL')
            AND action = 'APPROVED'
            ORDER BY action_at DESC
            LIMIT 1
          `);

          expect(historyResult.rows.length).toBe(1);
          expect(historyResult.rows[0].action).toBe('APPROVED');
          expect(historyResult.rows[0].actor_id).toBe(TEST_USERS.financeWrite.userId);
        } finally {
          await client.end();
        }
      });

      test('should create budget_approval_history entry on rejection', async () => {
        // TDD RED: No approval history table in v1.3

        const client = await createFinanceUserClient(
          TEST_USERS.financeWrite.userId,
          TEST_USERS.financeWrite.roles,
          TEST_USERS.financeWrite.department
        );

        try {
          // Reject a budget through the tool flow
          const approvalResponse = await financeClient.post<MCPToolResponse>(
            '/tools/approve_budget',
            {
              userContext: {
                userId: TEST_USERS.financeWrite.userId,
                roles: TEST_USERS.financeWrite.roles,
              },
              budgetId: 'BUD-MKT-2024-MKT',
              approvedAmount: 800000,
            }
          );

          // Execute as rejection
          if (approvalResponse.data.confirmationId) {
            await financeClient.post('/execute', {
              userContext: {
                userId: TEST_USERS.financeWrite.userId,
                roles: TEST_USERS.financeWrite.roles,
              },
              confirmationId: approvalResponse.data.confirmationId,
              approved: false,
              rejectionReason: 'Marketing budget needs revision',
            });
          }

          // Check audit trail
          const historyResult = await client.query(`
            SELECT * FROM finance.budget_approval_history
            WHERE budget_id = (SELECT id FROM finance.department_budgets WHERE budget_id = 'BUD-MKT-2024-MKT')
            AND action = 'REJECTED'
            ORDER BY action_at DESC
            LIMIT 1
          `);

          expect(historyResult.rows.length).toBe(1);
          expect(historyResult.rows[0].action).toBe('REJECTED');
          expect(historyResult.rows[0].comments).toBe('Marketing budget needs revision');
        } finally {
          await client.end();
        }
      });

      test('should record actor_id, timestamp, and comments', async () => {
        // TDD RED: No approval history table in v1.3

        const client = await createFinanceUserClient(
          TEST_USERS.financeWrite.userId,
          TEST_USERS.financeWrite.roles,
          TEST_USERS.financeWrite.department
        );

        try {
          const beforeTime = new Date();

          // Create approval
          const approvalResponse = await financeClient.post<MCPToolResponse>(
            '/tools/approve_budget',
            {
              userContext: {
                userId: TEST_USERS.financeWrite.userId,
                roles: TEST_USERS.financeWrite.roles,
              },
              budgetId: 'BUD-IT-2024-TECH',
              approvedAmount: 600000,
              comments: 'Approved with reduced allocation',
            }
          );

          // Execute approval
          if (approvalResponse.data.confirmationId) {
            await financeClient.post('/execute', {
              userContext: {
                userId: TEST_USERS.financeWrite.userId,
                roles: TEST_USERS.financeWrite.roles,
              },
              confirmationId: approvalResponse.data.confirmationId,
              approved: true,
              comments: 'Approved with reduced allocation',
            });
          }

          const afterTime = new Date();

          // Check history record
          const historyResult = await client.query(`
            SELECT * FROM finance.budget_approval_history
            WHERE budget_id = (SELECT id FROM finance.department_budgets WHERE budget_id = 'BUD-IT-2024-TECH')
            ORDER BY action_at DESC
            LIMIT 1
          `);

          expect(historyResult.rows.length).toBe(1);
          const record = historyResult.rows[0];

          // Verify actor_id
          expect(record.actor_id).toBe(TEST_USERS.financeWrite.userId);

          // Verify timestamp is reasonable
          const actionTime = new Date(record.action_at);
          expect(actionTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
          expect(actionTime.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 5000); // Allow 5s tolerance

          // Verify comments
          expect(record.comments).toBe('Approved with reduced allocation');
        } finally {
          await client.end();
        }
      });
    });
  });

  // ============================================================
  // SECTION 4: submit_budget MCP Tool Tests
  // Verify the new submission workflow
  // These tests WILL FAIL because the tool doesn't exist in v1.3
  // ============================================================

  describe('submit_budget MCP Tool', () => {
    test('should change budget status from DRAFT to PENDING_APPROVAL', async () => {
      // TDD RED: Tool does not exist in v1.3

      const response = await financeClient.post<MCPToolResponse>(
        '/tools/submit_budget',
        {
          userContext: {
            userId: TEST_USERS.manager.userId, // Department head
            roles: TEST_USERS.manager.roles,
          },
          budgetId: 'BUD-ENG-2024-SAL',
        }
      );

      expect(response.data.status).toBe('success');
      expect(response.data.data).toMatchObject({
        budgetId: 'BUD-ENG-2024-SAL',
        previousStatus: 'DRAFT',
        newStatus: 'PENDING_APPROVAL',
      });
    });

    test('should set submitted_by to current user', async () => {
      // TDD RED: Tool does not exist in v1.3

      const client = await createFinanceUserClient(
        TEST_USERS.manager.userId,
        TEST_USERS.manager.roles,
        TEST_USERS.manager.department
      );

      try {
        // Submit budget
        await financeClient.post<MCPToolResponse>('/tools/submit_budget', {
          userContext: {
            userId: TEST_USERS.manager.userId,
            roles: TEST_USERS.manager.roles,
          },
          budgetId: 'BUD-ENG-2024-SAL',
        });

        // Verify submitted_by
        const result = await client.query(`
          SELECT submitted_by FROM finance.department_budgets
          WHERE budget_id = 'BUD-ENG-2024-SAL'
        `);

        expect(result.rows[0].submitted_by).toBe(TEST_USERS.manager.userId);
      } finally {
        await client.end();
      }
    });

    test('should set submitted_at timestamp', async () => {
      // TDD RED: Tool does not exist in v1.3

      const client = await createFinanceUserClient(
        TEST_USERS.manager.userId,
        TEST_USERS.manager.roles,
        TEST_USERS.manager.department
      );

      try {
        const beforeTime = new Date();

        // Submit budget
        await financeClient.post<MCPToolResponse>('/tools/submit_budget', {
          userContext: {
            userId: TEST_USERS.manager.userId,
            roles: TEST_USERS.manager.roles,
          },
          budgetId: 'BUD-ENG-2024-SAL',
        });

        const afterTime = new Date();

        // Verify submitted_at
        const result = await client.query(`
          SELECT submitted_at FROM finance.department_budgets
          WHERE budget_id = 'BUD-ENG-2024-SAL'
        `);

        const submittedAt = new Date(result.rows[0].submitted_at);
        expect(submittedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        expect(submittedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 5000);
      } finally {
        await client.end();
      }
    });

    test('should require user to be department head', async () => {
      // TDD RED: Tool does not exist in v1.3
      // Regular employees should not be able to submit budgets

      const response = await financeClient.post<MCPToolResponse>(
        '/tools/submit_budget',
        {
          userContext: {
            userId: TEST_USERS.employee.userId, // Regular employee, not manager
            roles: TEST_USERS.employee.roles,
          },
          budgetId: 'BUD-ENG-2024-SAL',
        }
      );

      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('UNAUTHORIZED');
      expect(response.data.message).toContain('department head');
    });

    test('should reject if budget already submitted', async () => {
      // TDD RED: Tool does not exist in v1.3
      // Cannot submit a budget that's already in PENDING_APPROVAL status

      // First submission (should succeed)
      await financeClient.post<MCPToolResponse>('/tools/submit_budget', {
        userContext: {
          userId: TEST_USERS.manager.userId,
          roles: TEST_USERS.manager.roles,
        },
        budgetId: 'BUD-ENG-2024-SAL',
      });

      // Second submission (should fail)
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/submit_budget',
        {
          userContext: {
            userId: TEST_USERS.manager.userId,
            roles: TEST_USERS.manager.roles,
          },
          budgetId: 'BUD-ENG-2024-SAL',
        }
      );

      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('ALREADY_SUBMITTED');
      expect(response.data.suggestedAction).toContain('PENDING_APPROVAL');
    });
  });

  // ============================================================
  // SECTION 5: Business Rules Tests
  // Verify separation of duties and workflow enforcement
  // These tests WILL FAIL because the workflow doesn't exist in v1.3
  // ============================================================

  describe('Budget Approval Business Rules', () => {
    test('only department heads can submit budgets', async () => {
      // TDD RED: No submission workflow in v1.3

      // Try to submit as intern (should fail)
      const internResponse = await financeClient.post<MCPToolResponse>(
        '/tools/submit_budget',
        {
          userContext: {
            userId: TEST_USERS.intern.userId,
            roles: TEST_USERS.intern.roles,
          },
          budgetId: 'BUD-IT-2024-TECH',
        }
      );

      expect(internResponse.data.status).toBe('error');
      expect(internResponse.data.code).toBe('UNAUTHORIZED');

      // Try to submit as regular employee (should fail)
      const employeeResponse = await financeClient.post<MCPToolResponse>(
        '/tools/submit_budget',
        {
          userContext: {
            userId: TEST_USERS.employee.userId,
            roles: TEST_USERS.employee.roles,
          },
          budgetId: 'BUD-ENG-2024-SAL',
        }
      );

      expect(employeeResponse.data.status).toBe('error');
      expect(employeeResponse.data.code).toBe('UNAUTHORIZED');

      // Try to submit as manager (should succeed)
      const managerResponse = await financeClient.post<MCPToolResponse>(
        '/tools/submit_budget',
        {
          userContext: {
            userId: TEST_USERS.manager.userId,
            roles: TEST_USERS.manager.roles,
          },
          budgetId: 'BUD-ENG-2024-SAL',
        }
      );

      expect(managerResponse.data.status).toBe('success');
    });

    test('only finance-write can approve/reject', async () => {
      // TDD RED: No approval workflow in v1.3

      // Finance-read cannot approve
      const financeReadResponse = await financeClient.post<MCPToolResponse>(
        '/tools/approve_budget',
        {
          userContext: {
            userId: TEST_USERS.financeRead.userId,
            roles: TEST_USERS.financeRead.roles,
          },
          budgetId: 'BUD-SALES-2024-SAL',
          approvedAmount: 1200000,
        }
      );

      expect(financeReadResponse.data.status).toBe('error');
      expect(financeReadResponse.data.code).toBe('UNAUTHORIZED');

      // Manager cannot approve (even their own department)
      const managerResponse = await financeClient.post<MCPToolResponse>(
        '/tools/approve_budget',
        {
          userContext: {
            userId: TEST_USERS.manager.userId,
            roles: TEST_USERS.manager.roles,
          },
          budgetId: 'BUD-ENG-2024-SAL',
          approvedAmount: 2500000,
        }
      );

      expect(managerResponse.data.status).toBe('error');
      expect(managerResponse.data.code).toBe('UNAUTHORIZED');

      // Finance-write CAN approve
      const financeWriteResponse = await financeClient.post<MCPToolResponse>(
        '/tools/approve_budget',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          budgetId: 'BUD-SALES-2024-SAL',
          approvedAmount: 1200000,
        }
      );

      expect(financeWriteResponse.data.status).toBe('pending_confirmation');
    });

    test('cannot approve own submitted budget', async () => {
      // TDD RED: No approval workflow in v1.3
      // Separation of duties: submitter cannot be approver

      // Create a test budget submitted by bob.martinez (finance)
      const client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );

      try {
        const testBudgetId = `test-sep-duties-${Date.now()}`;

        // Insert a test budget with bob.martinez as submitter
        await client.query(`
          INSERT INTO finance.department_budgets
            (budget_id, department_code, department, fiscal_year, budgeted_amount, amount,
             status, submitted_by, submitted_at)
          VALUES ($1, 'FIN', 'Finance', 2026, 500000, 500000,
                  'PENDING_APPROVAL', $2, NOW())
        `, [testBudgetId, TEST_USERS.financeWrite.userId]);

        // Bob tries to approve his own submission
        const response = await financeClient.post<MCPToolResponse>(
          '/tools/approve_budget',
          {
            userContext: {
              userId: TEST_USERS.financeWrite.userId,
              roles: TEST_USERS.financeWrite.roles,
            },
            budgetId: testBudgetId,
            approvedAmount: 500000,
          }
        );

        expect(response.data.status).toBe('error');
        expect(response.data.code).toBe('SEPARATION_OF_DUTIES');
        expect(response.data.message).toContain('cannot approve your own');

        // Cleanup
        await client.query(
          'DELETE FROM finance.department_budgets WHERE budget_id = $1',
          [testBudgetId]
        );
      } finally {
        await client.end();
      }
    });

    test('rejected budgets can be revised and resubmitted', async () => {
      // TDD RED: No rejection/revision workflow in v1.3

      const client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );

      try {
        const testBudgetId = `test-revision-${Date.now()}`;

        // Create a rejected budget
        await client.query(`
          INSERT INTO finance.department_budgets
            (budget_id, department_code, department, fiscal_year, budgeted_amount, amount,
             status, rejection_reason, version)
          VALUES ($1, 'ENG', 'Engineering', 2026, 3000000, 3000000,
                  'REJECTED', 'Exceeds department allocation', 1)
        `, [testBudgetId]);

        // Update the budget (revise it)
        await client.query(`
          UPDATE finance.department_budgets
          SET budgeted_amount = 2500000, amount = 2500000, status = 'DRAFT'
          WHERE budget_id = $1
        `, [testBudgetId]);

        // Resubmit (should work)
        const response = await financeClient.post<MCPToolResponse>(
          '/tools/submit_budget',
          {
            userContext: {
              userId: TEST_USERS.manager.userId,
              roles: TEST_USERS.manager.roles,
            },
            budgetId: testBudgetId,
          }
        );

        expect(response.data.status).toBe('success');
        expect(response.data.data?.newStatus).toBe('PENDING_APPROVAL');

        // Cleanup
        await client.query(
          'DELETE FROM finance.department_budgets WHERE budget_id = $1',
          [testBudgetId]
        );
      } finally {
        await client.end();
      }
    });

    test('approved budgets increment version on changes', async () => {
      // TDD RED: No version tracking in v1.3

      const client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );

      try {
        const testBudgetId = `test-version-${Date.now()}`;

        // Create an approved budget with version 1
        await client.query(`
          INSERT INTO finance.department_budgets
            (budget_id, department_code, department, fiscal_year, budgeted_amount, amount,
             status, approved_by, approved_at, version)
          VALUES ($1, 'SALES', 'Sales', 2026, 1000000, 1000000,
                  'APPROVED', $2, NOW(), 1)
        `, [testBudgetId, TEST_USERS.financeWrite.userId]);

        // Make changes to approved budget (triggers new version)
        await client.query(`
          UPDATE finance.department_budgets
          SET budgeted_amount = 1200000, amount = 1200000
          WHERE budget_id = $1
        `, [testBudgetId]);

        // Check version incremented
        const result = await client.query(`
          SELECT version FROM finance.department_budgets
          WHERE budget_id = $1
        `, [testBudgetId]);

        expect(result.rows[0].version).toBe(2);

        // Cleanup
        await client.query(
          'DELETE FROM finance.department_budgets WHERE budget_id = $1',
          [testBudgetId]
        );
      } finally {
        await client.end();
      }
    });
  });
});
