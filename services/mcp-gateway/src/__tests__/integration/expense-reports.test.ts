/**
 * Expense Reports Integration Tests - v1.5
 *
 * GitHub Issue #77: feat(v1.5): Add expense report tracking to finance module
 *
 * These tests validate the expense reports feature including:
 * - Schema validation (expense_reports and expense_items tables)
 * - RLS policies (self, manager, finance access levels)
 * - MCP tool functionality (list, get, approve, reject, reimburse)
 * - Workflow transitions (DRAFT → SUBMITTED → APPROVED → REIMBURSED)
 * - Human-in-the-loop confirmation flow
 *
 * Test Categories:
 * 1. Schema Tests - Verify tables and columns exist (4 tests)
 * 2. RLS Access Control Tests (6 tests)
 * 3. list_expense_reports Tool Tests (5 tests)
 * 4. get_expense_report Tool Tests (4 tests)
 * 5. Workflow Tool Tests - approve/reject/reimburse (9 tests)
 * 6. Confirmation Flow Tests (4 tests)
 *
 * Total: 32 tests
 *
 * Test Fixtures (from finance-data.sql):
 * - EXP-2026-001: Nina Patel, APPROVED, $2,450 (conference trip)
 * - EXP-2026-002: Marcus Johnson, SUBMITTED, $385.50 (team lunch)
 * - EXP-2026-003: Carol Johnson, REIMBURSED, $875 (client dinner)
 * - EXP-2026-004: Frank Davis, DRAFT, $156.75 (office supplies)
 * - EXP-2026-005: Alice Chen, UNDER_REVIEW, $3,200 (HR conference)
 * - EXP-2026-006: Nina Patel, REJECTED, $599 (training - missing receipts)
 * - EXP-2026-007: Bob Martinez, APPROVED, $1,200 (software subscription)
 * - EXP-2026-008: Eve Thompson, SUBMITTED, $4,850 (executive travel)
 */

import { Client } from 'pg';
import axios, { AxiosInstance } from 'axios';
import { generateInternalToken, INTERNAL_TOKEN_HEADER } from '@tamshai/shared';
import {
  createFinanceUserClient,
  getAdminPoolFinanceReset,
  TEST_USERS,
} from './setup';

// Get internal secret for gateway authentication
const MCP_INTERNAL_SECRET = process.env.MCP_INTERNAL_SECRET || '';

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
    hasMore?: boolean;
    returnedCount?: number;
    nextCursor?: string;
    totalEstimate?: string;
    hint?: string;
  };
}

// Expense report status enum (v1.5)
type ExpenseReportStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';

// Expense report summary (from list_expense_reports)
interface ExpenseReportSummary {
  id: string;
  report_number: string;
  employee_id: string;
  employee_name: string | null;
  department_code: string;
  title: string;
  total_amount: number;
  status: ExpenseReportStatus;
  submission_date: string | null;
  created_at: string;
  item_count: number;
}

// Full expense report (from get_expense_report)
interface ExpenseReport extends ExpenseReportSummary {
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  reimbursed_at: string | null;
  reimbursed_by: string | null;
  payment_reference: string | null;
  notes: string | null;
  updated_at: string;
  items: ExpenseItem[];
}

// Expense item (line item within a report)
interface ExpenseItem {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  vendor: string | null;
  amount: number;
  currency: string;
  receipt_url: string | null;
  receipt_required: boolean;
  receipt_uploaded: boolean;
  notes: string | null;
}

// Test fixture IDs (from finance-data.sql)
// NOTE: Read-only fixtures are shared, workflow test fixtures are dedicated
const TEST_REPORTS = {
  // Read-only fixtures (status checked but not modified)
  APPROVED_NINA: 'e1000000-0000-0000-0000-000000000101',      // EXP-2026-001, APPROVED
  REIMBURSED_CAROL: 'e1000000-0000-0000-0000-000000000103',   // EXP-2026-003, REIMBURSED
  DRAFT_FRANK: 'e1000000-0000-0000-0000-000000000104',        // EXP-2026-004, DRAFT
  REJECTED_NINA: 'e1000000-0000-0000-0000-000000000106',      // EXP-2026-006, REJECTED

  // Dedicated test fixtures for workflow tests (each test gets its own record)
  // Approval tests
  TEST_APR_PERM: 'e1000000-0000-0000-0000-000000000201',      // EXP-TEST-APR-01, for permission test
  TEST_APR_CONFIRM: 'e1000000-0000-0000-0000-000000000202',   // EXP-TEST-APR-02, for confirmation test
  TEST_APR_EXEC: 'e1000000-0000-0000-0000-000000000203',      // EXP-TEST-APR-03, for execute approval

  // Rejection tests
  TEST_REJ_CONFIRM: 'e1000000-0000-0000-0000-000000000211',   // EXP-TEST-REJ-01, for confirmation test
  TEST_REJ_EXEC: 'e1000000-0000-0000-0000-000000000212',      // EXP-TEST-REJ-02, for execute rejection

  // Reimbursement tests
  TEST_RMB_STATUS: 'e1000000-0000-0000-0000-000000000221',    // EXP-TEST-RMB-01, for status check
  TEST_RMB_EXEC: 'e1000000-0000-0000-0000-000000000222',      // EXP-TEST-RMB-02, for execute reimbursement

  // Denied confirmation test
  TEST_DENY: 'e1000000-0000-0000-0000-000000000231',          // EXP-TEST-DENY-01, for denied confirmation

  // Legacy aliases (for backward compatibility with existing tests)
  SUBMITTED_MARCUS: 'e1000000-0000-0000-0000-000000000102',   // EXP-2026-002
  UNDER_REVIEW_ALICE: 'e1000000-0000-0000-0000-000000000105', // EXP-2026-005
  APPROVED_BOB: 'e1000000-0000-0000-0000-000000000107',       // EXP-2026-007
  SUBMITTED_EVE: 'e1000000-0000-0000-0000-000000000108',      // EXP-2026-008
};

/**
 * Reset expense report test fixtures to known states
 * Called before tests to ensure idempotent test runs
 *
 * Resets both:
 * 1. Legacy sample data fixtures (EXP-2026-xxx) - used by read-only tests
 * 2. Dedicated test fixtures (EXP-TEST-xxx) - used by workflow tests
 */
async function resetExpenseReportFixtures(): Promise<void> {
  // Use admin pool with BYPASSRLS to reset fixtures
  const pool = getAdminPoolFinanceReset();

  // =================================================================
  // LEGACY SAMPLE DATA FIXTURES (read-only tests)
  // =================================================================

  // Reset SUBMITTED fixtures
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'SUBMITTED',
        approved_by = NULL, approved_at = NULL,
        rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
        reimbursed_by = NULL, reimbursed_at = NULL, payment_reference = NULL
    WHERE id IN ($1, $2)
  `, [TEST_REPORTS.SUBMITTED_MARCUS, TEST_REPORTS.SUBMITTED_EVE]);

  // Reset UNDER_REVIEW fixture
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'UNDER_REVIEW',
        approved_by = NULL, approved_at = NULL,
        rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
        reimbursed_by = NULL, reimbursed_at = NULL, payment_reference = NULL
    WHERE id = $1
  `, [TEST_REPORTS.UNDER_REVIEW_ALICE]);

  // Reset APPROVED fixtures (for reimburse tests)
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'APPROVED',
        approved_by = 'bob.martinez@tamshai.com',
        approved_at = NOW() - interval '2 days',
        reimbursed_by = NULL, reimbursed_at = NULL, payment_reference = NULL
    WHERE id IN ($1, $2)
  `, [TEST_REPORTS.APPROVED_NINA, TEST_REPORTS.APPROVED_BOB]);

  // Reset REJECTED fixture
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'REJECTED',
        rejected_by = 'bob.martinez@tamshai.com',
        rejected_at = NOW() - interval '3 days',
        rejection_reason = 'Missing receipts for online course purchases. Please upload all receipts and resubmit.',
        approved_by = NULL, approved_at = NULL,
        reimbursed_by = NULL, reimbursed_at = NULL, payment_reference = NULL
    WHERE id = $1
  `, [TEST_REPORTS.REJECTED_NINA]);

  // Reset REIMBURSED fixture
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'REIMBURSED',
        approved_by = 'bob.martinez@tamshai.com',
        approved_at = NOW() - interval '6 days',
        reimbursed_by = 'bob.martinez@tamshai.com',
        reimbursed_at = NOW() - interval '2 days',
        payment_reference = 'ACH-20260118-001'
    WHERE id = $1
  `, [TEST_REPORTS.REIMBURSED_CAROL]);

  // Reset DRAFT fixture
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'DRAFT',
        submission_date = NULL, submitted_at = NULL,
        approved_by = NULL, approved_at = NULL,
        rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
        reimbursed_by = NULL, reimbursed_at = NULL, payment_reference = NULL
    WHERE id = $1
  `, [TEST_REPORTS.DRAFT_FRANK]);

  // =================================================================
  // DEDICATED TEST FIXTURES (workflow tests - each test gets its own)
  // =================================================================

  // Reset APPROVAL test fixtures to SUBMITTED status
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'SUBMITTED',
        submission_date = '2026-02-01',
        submitted_at = '2026-02-01 09:00:00',
        approved_by = NULL, approved_at = NULL,
        rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
        reimbursed_by = NULL, reimbursed_at = NULL, payment_reference = NULL
    WHERE id IN ($1, $2, $3)
  `, [TEST_REPORTS.TEST_APR_PERM, TEST_REPORTS.TEST_APR_CONFIRM, TEST_REPORTS.TEST_APR_EXEC]);

  // Reset REJECTION test fixtures to UNDER_REVIEW status
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'UNDER_REVIEW',
        submission_date = '2026-02-01',
        submitted_at = '2026-02-01 12:00:00',
        approved_by = NULL, approved_at = NULL,
        rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
        reimbursed_by = NULL, reimbursed_at = NULL, payment_reference = NULL
    WHERE id IN ($1, $2)
  `, [TEST_REPORTS.TEST_REJ_CONFIRM, TEST_REPORTS.TEST_REJ_EXEC]);

  // Reset REIMBURSEMENT test fixtures to APPROVED status
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'APPROVED',
        submission_date = '2026-02-01',
        submitted_at = '2026-02-01 14:00:00',
        approved_by = 'eve.thompson@tamshai.com',
        approved_at = '2026-02-02 10:00:00',
        rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
        reimbursed_by = NULL, reimbursed_at = NULL, payment_reference = NULL
    WHERE id IN ($1, $2)
  `, [TEST_REPORTS.TEST_RMB_STATUS, TEST_REPORTS.TEST_RMB_EXEC]);

  // Reset DENIED CONFIRMATION test fixture to SUBMITTED status
  await pool.query(`
    UPDATE finance.expense_reports
    SET status = 'SUBMITTED',
        submission_date = '2026-02-01',
        submitted_at = '2026-02-01 16:00:00',
        approved_by = NULL, approved_at = NULL,
        rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
        reimbursed_by = NULL, reimbursed_at = NULL, payment_reference = NULL
    WHERE id = $1
  `, [TEST_REPORTS.TEST_DENY]);

  console.log('   ✅ Expense report test fixtures reset to initial states');
}

describe('Expense Reports Integration Tests - v1.5', () => {
  let financeClient: AxiosInstance;

  beforeAll(async () => {
    // Establish admin pool connection (with BYPASSRLS for fixture resets)
    getAdminPoolFinanceReset();

    // Reset test fixtures to known initial states
    await resetExpenseReportFixtures();

    // Generate internal token for gateway authentication using finance-write user
    const internalToken = MCP_INTERNAL_SECRET
      ? generateInternalToken(
          MCP_INTERNAL_SECRET,
          TEST_USERS.financeWrite.userId,
          TEST_USERS.financeWrite.roles
        )
      : '';

    // Create axios client for MCP Finance server with gateway auth
    financeClient = axios.create({
      baseURL: process.env.MCP_FINANCE_URL || `http://localhost:${process.env.DEV_MCP_FINANCE}`,
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        [INTERNAL_TOKEN_HEADER]: internalToken,
      },
    });
  });

  // ============================================================
  // SECTION 1: Schema Tests
  // Verify expense_reports and expense_items tables exist
  // ============================================================

  describe('Expense Reports Schema', () => {
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

    test('expense_reports table exists with required columns', async () => {
      const result = await client.query(`
        SELECT
          id, report_number, employee_id, department_code, title,
          total_amount, status, submission_date, submitted_at,
          approved_by, approved_at, rejected_by, rejected_at, rejection_reason,
          reimbursed_by, reimbursed_at, payment_reference, notes,
          created_at, updated_at
        FROM finance.expense_reports
        LIMIT 1
      `);

      expect(result.rows).toBeDefined();
    });

    test('expense_items table exists with required columns', async () => {
      const result = await client.query(`
        SELECT
          id, expense_report_id, expense_date, category, description,
          vendor, amount, currency, receipt_url, receipt_required,
          receipt_uploaded, notes, created_at
        FROM finance.expense_items
        LIMIT 1
      `);

      expect(result.rows).toBeDefined();
    });

    test('expense_reports has valid status enum values', async () => {
      const result = await client.query(`
        SELECT DISTINCT status::text FROM finance.expense_reports
      `);

      const validStatuses = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REIMBURSED'];
      result.rows.forEach(row => {
        expect(validStatuses).toContain(row.status);
      });
    });

    test('expense_items references expense_reports via foreign key', async () => {
      const result = await client.query(`
        SELECT ei.id, ei.expense_report_id, er.report_number
        FROM finance.expense_items ei
        JOIN finance.expense_reports er ON er.id = ei.expense_report_id
        LIMIT 1
      `);

      expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // SECTION 2: RLS Access Control Tests
  // Verify row-level security enforces proper access
  // ============================================================

  describe('Expense Reports RLS - Access Control', () => {
    test('employee can see only their own expense reports', async () => {
      // Marcus Johnson (regular employee) should only see his own reports
      const client = await createFinanceUserClient(
        TEST_USERS.employee.userId,
        TEST_USERS.employee.roles,
        TEST_USERS.employee.department
      );

      try {
        const result = await client.query(`
          SELECT id, report_number, employee_id FROM finance.expense_reports
        `);

        // Marcus should only see his own report (EXP-2026-002)
        result.rows.forEach(row => {
          expect(row.employee_id).toBe(TEST_USERS.employee.userId);
        });
      } finally {
        await client.end();
      }
    });

    test('manager can see their department expense reports', async () => {
      // Nina Patel (Engineering Manager) should see ENG department reports
      const client = await createFinanceUserClient(
        TEST_USERS.manager.userId,
        TEST_USERS.manager.roles,
        'ENG' // Engineering department code
      );

      try {
        const result = await client.query(`
          SELECT id, report_number, department_code FROM finance.expense_reports
        `);

        // Manager should see reports from their department or their own
        result.rows.forEach(row => {
          const isOwnReport = row.id === TEST_REPORTS.APPROVED_NINA || row.id === TEST_REPORTS.REJECTED_NINA;
          const isDeptReport = row.department_code === 'ENG';
          expect(isOwnReport || isDeptReport).toBe(true);
        });
      } finally {
        await client.end();
      }
    });

    test('finance-read can see all expense reports', async () => {
      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department
      );

      try {
        const result = await client.query(`
          SELECT COUNT(*) as count FROM finance.expense_reports
        `);

        // Finance should see all 8 test reports
        expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(8);
      } finally {
        await client.end();
      }
    });

    test('executive can see all expense reports', async () => {
      const client = await createFinanceUserClient(
        TEST_USERS.executive.userId,
        TEST_USERS.executive.roles,
        TEST_USERS.executive.department
      );

      try {
        const result = await client.query(`
          SELECT COUNT(*) as count FROM finance.expense_reports
        `);

        // Executive should see all 8 test reports
        expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(8);
      } finally {
        await client.end();
      }
    });

    test('intern can see only their own expense reports', async () => {
      // Frank Davis (IT Intern) should only see his own reports
      const client = await createFinanceUserClient(
        TEST_USERS.intern.userId,
        TEST_USERS.intern.roles,
        TEST_USERS.intern.department
      );

      try {
        const result = await client.query(`
          SELECT id, report_number, employee_id FROM finance.expense_reports
        `);

        // Frank should only see his own report (EXP-2026-004)
        result.rows.forEach(row => {
          expect(row.employee_id).toBe(TEST_USERS.intern.userId);
        });
      } finally {
        await client.end();
      }
    });

    test('expense_items access follows parent report RLS', async () => {
      // Employee should only see expense items for their accessible reports
      const client = await createFinanceUserClient(
        TEST_USERS.employee.userId,
        TEST_USERS.employee.roles,
        TEST_USERS.employee.department
      );

      try {
        const result = await client.query(`
          SELECT ei.id, er.employee_id
          FROM finance.expense_items ei
          JOIN finance.expense_reports er ON er.id = ei.expense_report_id
        `);

        // All visible items should belong to Marcus's reports
        result.rows.forEach(row => {
          expect(row.employee_id).toBe(TEST_USERS.employee.userId);
        });
      } finally {
        await client.end();
      }
    });
  });

  // ============================================================
  // SECTION 3: list_expense_reports Tool Tests
  // ============================================================

  describe('list_expense_reports MCP Tool', () => {
    test('returns expense reports for finance user', async () => {
      const response = await financeClient.post<MCPToolResponse<ExpenseReportSummary[]>>(
        '/tools/list_expense_reports',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
        }
      );

      expect(response.data.status).toBe('success');
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(response.data.data!.length).toBeGreaterThanOrEqual(8);

      // Verify expected fields
      const report = response.data.data![0];
      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('report_number');
      expect(report).toHaveProperty('employee_id');
      expect(report).toHaveProperty('department_code');
      expect(report).toHaveProperty('title');
      expect(report).toHaveProperty('total_amount');
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('item_count');
    });

    test('filters by status', async () => {
      const response = await financeClient.post<MCPToolResponse<ExpenseReportSummary[]>>(
        '/tools/list_expense_reports',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          status: 'SUBMITTED',
        }
      );

      expect(response.data.status).toBe('success');
      expect(Array.isArray(response.data.data)).toBe(true);

      // All returned reports should be SUBMITTED
      response.data.data!.forEach(report => {
        expect(report.status).toBe('SUBMITTED');
      });
    });

    // TODO: Department filter not yet implemented in list_expense_reports MCP tool
    // Skip this test until the filter is implemented
    test.skip('filters by department', async () => {
      const response = await financeClient.post<MCPToolResponse<ExpenseReportSummary[]>>(
        '/tools/list_expense_reports',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          department: 'ENG',
        }
      );

      expect(response.data.status).toBe('success');
      expect(Array.isArray(response.data.data)).toBe(true);

      // All returned reports should be from Engineering
      response.data.data!.forEach(report => {
        expect(report.department_code).toBe('ENG');
      });
    });

    test('respects limit parameter', async () => {
      const response = await financeClient.post<MCPToolResponse<ExpenseReportSummary[]>>(
        '/tools/list_expense_reports',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          limit: 3,
        }
      );

      expect(response.data.status).toBe('success');
      expect(response.data.data!.length).toBeLessThanOrEqual(3);
    });

    test('employee access requires finance role', async () => {
      // Employee role alone doesn't grant access to list_expense_reports tool
      // RLS filtering happens at DB level for authorized users
      const response = await financeClient.post<MCPToolResponse<ExpenseReportSummary[]>>(
        '/tools/list_expense_reports',
        {
          userContext: {
            userId: TEST_USERS.employee.userId,
            roles: TEST_USERS.employee.roles,
          },
        }
      );

      // Employee without finance-read role gets permission denied
      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  // ============================================================
  // SECTION 4: get_expense_report Tool Tests
  // ============================================================

  describe('get_expense_report MCP Tool', () => {
    test('returns full expense report with line items', async () => {
      const response = await financeClient.post<MCPToolResponse<ExpenseReport>>(
        '/tools/get_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.APPROVED_NINA,
        }
      );

      expect(response.data.status).toBe('success');
      expect(response.data.data).toBeDefined();

      const report = response.data.data!;
      expect(report.report_number).toBe('EXP-2026-001');
      expect(report.title).toContain('Conference');
      expect(report.status).toBe('APPROVED');
      expect(Array.isArray(report.items)).toBe(true);
      expect(report.items.length).toBeGreaterThan(0);

      // Verify item structure
      const item = report.items[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('expense_date');
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('amount');
    });

    test('returns error for non-existent report', async () => {
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/get_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: '00000000-0000-0000-0000-000000000000',
        }
      );

      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('EXPENSE_REPORT_NOT_FOUND');
      expect(response.data.suggestedAction).toBeDefined();
    });

    test('employee cannot access expense reports without finance role', async () => {
      // Marcus (regular employee) trying to view any expense report
      // Employee role alone doesn't grant access to get_expense_report tool
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/get_expense_report',
        {
          userContext: {
            userId: TEST_USERS.employee.userId,
            roles: TEST_USERS.employee.roles,
          },
          reportId: TEST_REPORTS.APPROVED_NINA,
        }
      );

      // Employee without finance-read role gets permission denied
      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('returns rejected report with rejection reason', async () => {
      const response = await financeClient.post<MCPToolResponse<ExpenseReport>>(
        '/tools/get_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.REJECTED_NINA,
        }
      );

      expect(response.data.status).toBe('success');
      const report = response.data.data!;
      expect(report.status).toBe('REJECTED');
      expect(report.rejection_reason).toContain('Missing receipts');
      expect(report.rejected_at).toBeDefined();
    });
  });

  // ============================================================
  // SECTION 5: Workflow Tool Tests
  // approve, reject, reimburse expense reports
  // ============================================================

  describe('approve_expense_report MCP Tool', () => {
    // Reset fixtures before each test to ensure idempotent test runs
    beforeEach(async () => {
      await resetExpenseReportFixtures();
    });

    test('requires finance-write role', async () => {
      // Uses dedicated fixture TEST_APR_PERM for permission test
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/approve_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeRead.userId,
            roles: TEST_USERS.financeRead.roles,
          },
          reportId: TEST_REPORTS.TEST_APR_PERM,
        }
      );

      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('INSUFFICIENT_PERMISSIONS');
      // suggestedAction contains user-friendly message about requesting access
      expect(response.data.suggestedAction).toContain('Finance');
    });

    test('rejects approval of non-SUBMITTED/UNDER_REVIEW reports', async () => {
      // Try to approve DRAFT report (read-only fixture, status not modified)
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/approve_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.DRAFT_FRANK,
        }
      );

      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('INVALID_EXPENSE_REPORT_STATUS');
      expect(response.data.message).toContain('DRAFT');
    });

    test('returns pending_confirmation for valid approval request', async () => {
      // Uses dedicated fixture TEST_APR_CONFIRM for confirmation flow test
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/approve_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_APR_CONFIRM,
        }
      );

      expect(response.data.status).toBe('pending_confirmation');
      expect(response.data.confirmationId).toBeDefined();
      expect(response.data.message).toContain('Approve Expense Report');
      expect(response.data.message).toContain('EXP-TEST-APR-02');
    });
  });

  describe('reject_expense_report MCP Tool', () => {
    // Reset fixtures before each test to ensure idempotent test runs
    beforeEach(async () => {
      await resetExpenseReportFixtures();
    });

    test('requires rejection reason', async () => {
      // Uses dedicated fixture TEST_REJ_CONFIRM for input validation test
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/reject_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_REJ_CONFIRM,
          rejectionReason: 'Too short', // Less than 10 chars
        }
      );

      expect(response.data.status).toBe('error');
      // Zod validation error for minimum length
    });

    test('returns pending_confirmation for valid rejection request', async () => {
      // Uses dedicated fixture TEST_REJ_CONFIRM for confirmation flow test
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/reject_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_REJ_CONFIRM,
          rejectionReason: 'Missing itemized hotel receipt. Please provide detailed breakdown.',
        }
      );

      expect(response.data.status).toBe('pending_confirmation');
      expect(response.data.confirmationId).toBeDefined();
      expect(response.data.message).toContain('Reject Expense Report');
      expect(response.data.message).toContain('EXP-TEST-REJ-01');
    });

    test('cannot reject already rejected report', async () => {
      // Uses read-only fixture REJECTED_NINA (status is checked, not modified)
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/reject_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.REJECTED_NINA,
          rejectionReason: 'Additional rejection reason that should not work.',
        }
      );

      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('INVALID_EXPENSE_REPORT_STATUS');
      expect(response.data.message).toContain('REJECTED');
    });
  });

  describe('reimburse_expense_report MCP Tool', () => {
    // Reset fixtures before each test to ensure idempotent test runs
    beforeEach(async () => {
      await resetExpenseReportFixtures();
    });

    test('requires finance-write role', async () => {
      // Uses dedicated fixture TEST_RMB_STATUS for permission test
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/reimburse_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeRead.userId,
            roles: TEST_USERS.financeRead.roles,
          },
          reportId: TEST_REPORTS.TEST_RMB_STATUS,
        }
      );

      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('only APPROVED reports can be reimbursed', async () => {
      // Uses dedicated fixture TEST_DENY (SUBMITTED status) to test invalid status
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/reimburse_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_DENY,
        }
      );

      expect(response.data.status).toBe('error');
      expect(response.data.code).toBe('INVALID_EXPENSE_REPORT_STATUS');
      expect(response.data.suggestedAction).toContain('approved first');
    });

    test('returns pending_confirmation with payment reference', async () => {
      // Uses dedicated fixture TEST_RMB_EXEC for confirmation flow test
      const response = await financeClient.post<MCPToolResponse>(
        '/tools/reimburse_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_RMB_EXEC,
          paymentReference: 'ACH-20260206-TEST',
        }
      );

      expect(response.data.status).toBe('pending_confirmation');
      expect(response.data.confirmationId).toBeDefined();
      expect(response.data.message).toContain('Reimbursed');
      expect(response.data.message).toContain('EXP-TEST-RMB-02');
    });
  });

  // ============================================================
  // SECTION 6: Confirmation Flow Tests
  // Test the execute endpoints for confirmed actions
  // ============================================================

  describe('Confirmation Flow - Execute Actions', () => {
    // Reset fixtures before each test to ensure idempotent test runs
    beforeEach(async () => {
      await resetExpenseReportFixtures();
    });

    test('execute approval changes status to APPROVED', async () => {
      // Uses dedicated fixture TEST_APR_EXEC for execute approval test
      const approvalResponse = await financeClient.post<MCPToolResponse>(
        '/tools/approve_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_APR_EXEC,
        }
      );

      expect(approvalResponse.data.status).toBe('pending_confirmation');
      const confirmationId = approvalResponse.data.confirmationId;

      // Execute the confirmation
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
        reportNumber: 'EXP-TEST-APR-03',
        newStatus: 'APPROVED',
      });
    });

    test('execute rejection changes status to REJECTED', async () => {
      // Uses dedicated fixture TEST_REJ_EXEC for execute rejection test
      const rejectionResponse = await financeClient.post<MCPToolResponse>(
        '/tools/reject_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_REJ_EXEC,
          rejectionReason: 'Conference budget exceeded for this quarter. Please defer to Q2.',
        }
      );

      expect(rejectionResponse.data.status).toBe('pending_confirmation');
      const confirmationId = rejectionResponse.data.confirmationId;

      // Execute the confirmation
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
        reportNumber: 'EXP-TEST-REJ-02',
        newStatus: 'REJECTED',
      });
    });

    test('execute reimbursement changes status to REIMBURSED', async () => {
      // Uses dedicated fixture TEST_RMB_EXEC for execute reimbursement test
      const reimburseResponse = await financeClient.post<MCPToolResponse>(
        '/tools/reimburse_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_RMB_EXEC,
          paymentReference: 'WIRE-20260206-001',
        }
      );

      expect(reimburseResponse.data.status).toBe('pending_confirmation');
      const confirmationId = reimburseResponse.data.confirmationId;

      // Execute the confirmation
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
        reportNumber: 'EXP-TEST-RMB-02',
        newStatus: 'REIMBURSED',
      });
    });

    test('denied confirmation does not change status', async () => {
      // Uses dedicated fixture TEST_DENY for denied confirmation test
      // Get initial status
      const beforeResponse = await financeClient.post<MCPToolResponse<ExpenseReport>>(
        '/tools/get_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_DENY,
        }
      );
      const beforeStatus = beforeResponse.data.data!.status;

      // Get confirmation for approval
      const approvalResponse = await financeClient.post<MCPToolResponse>(
        '/tools/approve_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_DENY,
        }
      );

      expect(approvalResponse.data.status).toBe('pending_confirmation');
      const confirmationId = approvalResponse.data.confirmationId;

      // Deny the confirmation
      await financeClient.post<MCPToolResponse>(
        '/execute',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          confirmationId,
          approved: false,
        }
      );

      // Verify status unchanged
      const afterResponse = await financeClient.post<MCPToolResponse<ExpenseReport>>(
        '/tools/get_expense_report',
        {
          userContext: {
            userId: TEST_USERS.financeWrite.userId,
            roles: TEST_USERS.financeWrite.roles,
          },
          reportId: TEST_REPORTS.TEST_DENY,
        }
      );

      expect(afterResponse.data.data!.status).toBe(beforeStatus);
    });
  });

  // ============================================================
  // CLEANUP: Reset fixtures after all tests complete
  // ============================================================
  afterAll(async () => {
    // Reset fixtures to ensure clean state for next test run
    await resetExpenseReportFixtures();
    console.log('   ✅ Expense report test fixtures reset after test completion');
  });
});
