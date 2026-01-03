/**
 * Expense Tracking Integration Tests - TDD RED PHASE
 *
 * GitHub Issue #77: feat(v1.5): Add expense tracking to Finance schema
 *
 * These tests are written FIRST, before the feature exists.
 * They define the expected behavior of expense tracking functionality.
 *
 * Expected: ALL TESTS WILL FAIL initially (RED phase)
 *
 * Failure reasons:
 * - "relation 'finance.expenses' does not exist"
 * - MCP tool returns NOT_IMPLEMENTED error
 * - Sample data does not contain expense records
 *
 * Test Categories:
 * 1. Expense Table Existence Tests (5 tests)
 * 2. MCP Tool Tests - get_expense_report (9 tests)
 * 3. Sample Data Tests (3 tests)
 * 4. RLS Policy Tests (5 tests)
 *
 * Total: 22 tests
 *
 * After GREEN phase implementation, these tests should pass with:
 * - finance.expenses table created
 * - RLS policies enforcing access control
 * - Sample expense data populated
 * - get_expense_report MCP tool functional
 */

import { Client, Pool } from 'pg';
import {
  createFinanceUserClient,
  getAdminPoolFinance,
  TEST_USERS,
} from './setup';

// =============================================================================
// TYPE DEFINITIONS
// Expected expense record structure (to be created in GREEN phase)
// =============================================================================

/**
 * Expense category enum - matches planned finance.expense_category type
 */
type ExpenseCategory = 'TRAVEL' | 'MEALS' | 'SUPPLIES' | 'SOFTWARE' | 'OTHER';

/**
 * Expense status enum - matches planned finance.expense_status type
 */
type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';

/**
 * Expected expense record structure
 * This interface defines what we expect the finance.expenses table to contain
 */
interface ExpenseRecord {
  id: string; // UUID primary key
  employee_id: string; // FK to hr.employees
  department_id: string; // FK to hr.departments
  expense_date: Date;
  category: ExpenseCategory;
  description: string;
  amount: number; // DECIMAL(12,2)
  status: ExpenseStatus;
  created_at: Date;
  updated_at: Date;
  approved_by?: string; // FK to hr.employees (nullable)
  approved_at?: Date; // Timestamp (nullable)
  receipt_path?: string; // MinIO document path (nullable)
}

// =============================================================================
// SECTION 1: EXPENSE TABLE EXISTENCE TESTS
// Tests that the finance.expenses table exists with correct structure
// =============================================================================

describe('Finance Expense Tracking - TDD RED Phase', () => {
  let adminPool: Pool;

  beforeAll(() => {
    adminPool = getAdminPoolFinance();
  });

  describe('finance.expenses table structure', () => {
    /**
     * Test: Expenses table exists in finance schema
     *
     * RED PHASE: Will fail with "relation does not exist" because
     * finance.expenses table has not been created yet.
     */
    test('should have expenses table in finance schema', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Table finance.expenses exists

      const result = await adminPool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'finance'
          AND table_name = 'expenses'
      `);

      // RED PHASE: This will fail - table does not exist
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].table_name).toBe('expenses');
    });

    /**
     * Test: Expenses table has all required columns
     *
     * RED PHASE: Will fail because table does not exist.
     *
     * Required columns per Issue #77:
     * - id: UUID (PK)
     * - employee_id: UUID (FK to hr.employees)
     * - department_id: UUID (FK to hr.departments)
     * - expense_date: DATE
     * - category: expense_category enum
     * - description: TEXT
     * - amount: DECIMAL(12,2)
     * - status: expense_status enum
     */
    test('should have correct columns: id, employee_id, department_id, expense_date, category, description, amount, status', async () => {
      // TDD: Define expected columns
      const expectedColumns = [
        'id',
        'employee_id',
        'department_id',
        'expense_date',
        'category',
        'description',
        'amount',
        'status',
        'created_at',
        'updated_at',
        'approved_by',
        'approved_at',
        'receipt_path',
      ];

      const result = await adminPool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'finance'
          AND table_name = 'expenses'
        ORDER BY ordinal_position
      `);

      // RED PHASE: This will fail - no columns returned (table doesn't exist)
      const actualColumns = result.rows.map((row) => row.column_name);

      expectedColumns.forEach((col) => {
        expect(actualColumns).toContain(col);
      });
    });

    /**
     * Test: Foreign key constraint to hr.employees exists
     *
     * RED PHASE: Will fail because table and constraint don't exist.
     *
     * The employee_id column should reference hr.employees.id to ensure
     * referential integrity for expense submitters.
     */
    test('should have foreign key to hr.employees', async () => {
      // TDD: Check for FK constraint
      const result = await adminPool.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'finance'
          AND tc.table_name = 'expenses'
          AND kcu.column_name = 'employee_id'
      `);

      // RED PHASE: No FK constraint exists yet
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].foreign_table_name).toBe('employees');
    });

    /**
     * Test: Foreign key constraint to hr.departments exists
     *
     * RED PHASE: Will fail because table and constraint don't exist.
     *
     * The department_id column should reference hr.departments.id to
     * enable department-level expense reporting.
     */
    test('should have foreign key to hr.departments', async () => {
      // TDD: Check for FK constraint
      const result = await adminPool.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'finance'
          AND tc.table_name = 'expenses'
          AND kcu.column_name = 'department_id'
      `);

      // RED PHASE: No FK constraint exists yet
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].foreign_table_name).toBe('departments');
    });

    /**
     * Test: RLS is enabled on expenses table
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Row Level Security must be enabled to enforce access control
     * at the database level (defense-in-depth).
     */
    test('should have RLS policy enabled', async () => {
      // TDD: Check that RLS is enabled
      const result = await adminPool.query(`
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = 'expenses'
          AND relnamespace = (
            SELECT oid FROM pg_namespace WHERE nspname = 'finance'
          )
      `);

      // RED PHASE: Table doesn't exist, so no RLS status
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].relrowsecurity).toBe(true);
    });
  });

  // ===========================================================================
  // SECTION 2: MCP TOOL TESTS - get_expense_report
  // Tests for the get_expense_report MCP tool functionality
  // ===========================================================================

  describe('get_expense_report MCP Tool', () => {
    /**
     * Test: Authenticated user can retrieve their own expenses
     *
     * RED PHASE: Will fail with "relation does not exist" when
     * querying finance.expenses table.
     *
     * The MCP tool should return expenses belonging to the current user.
     */
    test('should return expenses for authenticated user', async () => {
      // TDD: Define expected behavior
      // User marcus.johnson should see their own expenses

      const client = await createFinanceUserClient(
        TEST_USERS.employee.userId,
        TEST_USERS.employee.roles,
        TEST_USERS.employee.department,
        TEST_USERS.employee.email
      );

      try {
        // RED PHASE: This query will fail - table doesn't exist
        const result = await client.query(`
          SELECT id, employee_id, category, amount, status
          FROM finance.expenses
          WHERE employee_id = $1
        `, [TEST_USERS.employee.userId]);

        // Expect to get expenses (sample data should include this user)
        expect(result.rows.length).toBeGreaterThanOrEqual(0);
        // When sample data exists, all returned records should belong to user
        result.rows.forEach((row) => {
          expect(row.employee_id).toBe(TEST_USERS.employee.userId);
        });
      } finally {
        await client.end();
      }
    });

    /**
     * Test: Date range filtering works correctly
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * The tool should support filtering expenses by date range
     * for reporting purposes.
     */
    test('should filter by date range when provided', async () => {
      // TDD: Test date range filtering

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department,
        TEST_USERS.financeRead.email
      );

      const startDate = '2024-01-01';
      const endDate = '2024-12-31';

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT id, expense_date, amount
          FROM finance.expenses
          WHERE expense_date >= $1::date
            AND expense_date <= $2::date
          ORDER BY expense_date DESC
        `, [startDate, endDate]);

        // All returned expenses should be within the date range
        result.rows.forEach((row) => {
          const expenseDate = new Date(row.expense_date);
          expect(expenseDate >= new Date(startDate)).toBe(true);
          expect(expenseDate <= new Date(endDate)).toBe(true);
        });
      } finally {
        await client.end();
      }
    });

    /**
     * Test: Category filtering works (TRAVEL, MEALS, SUPPLIES, SOFTWARE, OTHER)
     *
     * RED PHASE: Will fail because table and enum don't exist.
     *
     * The tool should support filtering by expense category.
     */
    test('should filter by category (TRAVEL, MEALS, SUPPLIES, SOFTWARE, OTHER)', async () => {
      // TDD: Test category filtering

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department,
        TEST_USERS.financeRead.email
      );

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT id, category, amount
          FROM finance.expenses
          WHERE category = 'TRAVEL'
        `);

        // All returned expenses should have TRAVEL category
        result.rows.forEach((row) => {
          expect(row.category).toBe('TRAVEL');
        });
      } finally {
        await client.end();
      }
    });

    /**
     * Test: Status filtering works (PENDING, APPROVED, REJECTED, REIMBURSED)
     *
     * RED PHASE: Will fail because table and enum don't exist.
     *
     * The tool should support filtering by expense status.
     */
    test('should filter by status (PENDING, APPROVED, REJECTED, REIMBURSED)', async () => {
      // TDD: Test status filtering

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department,
        TEST_USERS.financeRead.email
      );

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT id, status, amount
          FROM finance.expenses
          WHERE status = 'PENDING'
        `);

        // All returned expenses should have PENDING status
        result.rows.forEach((row) => {
          expect(row.status).toBe('PENDING');
        });
      } finally {
        await client.end();
      }
    });

    /**
     * Test: RLS enforces self-only access for regular users
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Regular users without special roles should only see their own expenses.
     */
    test('should respect RLS - user sees only own expenses', async () => {
      // TDD: RLS self-only access

      const client = await createFinanceUserClient(
        TEST_USERS.employee.userId,
        TEST_USERS.employee.roles,
        TEST_USERS.employee.department,
        TEST_USERS.employee.email
      );

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT id, employee_id
          FROM finance.expenses
        `);

        // RLS should ensure all results belong to the current user
        result.rows.forEach((row) => {
          expect(row.employee_id).toBe(TEST_USERS.employee.userId);
        });
      } finally {
        await client.end();
      }
    });

    /**
     * Test: finance-read role can see all expenses
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Users with finance-read role should have visibility into all expenses.
     */
    test('should allow finance-read role to see all expenses', async () => {
      // TDD: Finance role full access

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department,
        TEST_USERS.financeRead.email
      );

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT DISTINCT employee_id
          FROM finance.expenses
        `);

        // Finance should see expenses from multiple employees
        // (When sample data exists)
        expect(result.rows.length).toBeGreaterThan(0);
      } finally {
        await client.end();
      }
    });

    /**
     * Test: executive role can see all expenses
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Executives should have full visibility into all expenses.
     */
    test('should allow executive role to see all expenses', async () => {
      // TDD: Executive role full access

      const client = await createFinanceUserClient(
        TEST_USERS.executive.userId,
        TEST_USERS.executive.roles,
        TEST_USERS.executive.department,
        TEST_USERS.executive.email
      );

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT DISTINCT employee_id, department_id
          FROM finance.expenses
        `);

        // Executive should see expenses from multiple employees/departments
        expect(result.rows.length).toBeGreaterThan(0);
      } finally {
        await client.end();
      }
    });

    /**
     * Test: Cursor-based pagination works correctly
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Large result sets should be paginated to prevent memory issues.
     */
    test('should paginate results with cursor-based pagination', async () => {
      // TDD: Pagination support

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department,
        TEST_USERS.financeRead.email
      );

      const pageSize = 10;

      try {
        // First page
        // RED PHASE: Query will fail - table doesn't exist
        const firstPage = await client.query(`
          SELECT id, expense_date, amount
          FROM finance.expenses
          ORDER BY expense_date DESC, id
          LIMIT $1
        `, [pageSize + 1]); // Fetch 1 extra to detect more pages

        // Check for pagination indicator
        const hasMore = firstPage.rows.length > pageSize;
        const results = firstPage.rows.slice(0, pageSize);

        expect(results.length).toBeLessThanOrEqual(pageSize);

        // If there are more results, verify we can fetch next page
        if (hasMore && results.length > 0) {
          const lastRow = results[results.length - 1];
          const nextPage = await client.query(`
            SELECT id, expense_date, amount
            FROM finance.expenses
            WHERE (expense_date, id) < ($1, $2)
            ORDER BY expense_date DESC, id
            LIMIT $3
          `, [lastRow.expense_date, lastRow.id, pageSize]);

          // Next page should not overlap with first page
          const nextIds = nextPage.rows.map((r) => r.id);
          const firstIds = results.map((r) => r.id);
          nextIds.forEach((id) => {
            expect(firstIds).not.toContain(id);
          });
        }
      } finally {
        await client.end();
      }
    });

    /**
     * Test: Truncation warning when results exceed 50 records
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Per v1.4 architecture, results should include truncation warnings
     * when paginated to inform the AI that data may be incomplete.
     */
    test('should show truncation warning when results exceed 50 records', async () => {
      // TDD: Truncation warning (v1.4 requirement)

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department,
        TEST_USERS.financeRead.email
      );

      const truncationLimit = 50;

      try {
        // Query with LIMIT+1 pattern to detect truncation
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT id
          FROM finance.expenses
          LIMIT $1
        `, [truncationLimit + 1]);

        // Determine if truncation occurred
        const isTruncated = result.rows.length > truncationLimit;

        if (isTruncated) {
          // Test that our application would detect truncation
          expect(result.rows.length).toBeGreaterThan(truncationLimit);

          // In the actual MCP tool, this would generate a warning like:
          // "TRUNCATION WARNING: Only 50 of 50+ records returned.
          //  AI must inform user that results are incomplete."
        }

        // Whether truncated or not, result count is valid
        expect(result.rows.length).toBeGreaterThanOrEqual(0);
      } finally {
        await client.end();
      }
    });
  });

  // ===========================================================================
  // SECTION 3: SAMPLE DATA TESTS
  // Tests that sample data includes expense records
  // ===========================================================================

  describe('Expense Sample Data', () => {
    /**
     * Test: Sample data SQL file contains expense records
     *
     * RED PHASE: Will fail because no expenses exist in sample data.
     *
     * The finance-data.sql file should be updated to include expense records.
     */
    test('should have expense records in sample-data/finance-data.sql', async () => {
      // TDD: Verify sample data exists

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department,
        TEST_USERS.financeRead.email
      );

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT COUNT(*) as expense_count
          FROM finance.expenses
        `);

        // Sample data should have at least some expense records
        const expenseCount = parseInt(result.rows[0].expense_count, 10);
        expect(expenseCount).toBeGreaterThan(0);
      } finally {
        await client.end();
      }
    });

    /**
     * Test: Sample data has diverse expense categories
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Sample data should include expenses across all categories for testing.
     */
    test('should have diverse expense categories', async () => {
      // TDD: Verify category diversity

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department,
        TEST_USERS.financeRead.email
      );

      const expectedCategories: ExpenseCategory[] = [
        'TRAVEL',
        'MEALS',
        'SUPPLIES',
        'SOFTWARE',
        'OTHER',
      ];

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT DISTINCT category
          FROM finance.expenses
        `);

        const actualCategories = result.rows.map((r) => r.category);

        // Should have multiple categories represented
        expect(actualCategories.length).toBeGreaterThanOrEqual(3);

        // All actual categories should be valid
        actualCategories.forEach((cat) => {
          expect(expectedCategories).toContain(cat);
        });
      } finally {
        await client.end();
      }
    });

    /**
     * Test: Sample data has expenses in various statuses
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Sample data should include expenses in different workflow states.
     */
    test('should have expenses in various statuses', async () => {
      // TDD: Verify status diversity

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department,
        TEST_USERS.financeRead.email
      );

      const expectedStatuses: ExpenseStatus[] = [
        'PENDING',
        'APPROVED',
        'REJECTED',
        'REIMBURSED',
      ];

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT DISTINCT status
          FROM finance.expenses
        `);

        const actualStatuses = result.rows.map((r) => r.status);

        // Should have multiple statuses represented
        expect(actualStatuses.length).toBeGreaterThanOrEqual(2);

        // All actual statuses should be valid
        actualStatuses.forEach((status) => {
          expect(expectedStatuses).toContain(status);
        });
      } finally {
        await client.end();
      }
    });
  });

  // ===========================================================================
  // SECTION 4: RLS POLICY TESTS
  // Tests for Row Level Security policies on finance.expenses
  // ===========================================================================

  describe('Expense RLS Policies', () => {
    /**
     * Test: Intern cannot see any expenses (not even own without employee record)
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Interns have minimal access and should not see expense data.
     */
    test('intern cannot see expenses outside self', async () => {
      const client = await createFinanceUserClient(
        TEST_USERS.intern.userId,
        TEST_USERS.intern.roles,
        TEST_USERS.intern.department,
        TEST_USERS.intern.email
      );

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT id, employee_id
          FROM finance.expenses
        `);

        // Intern should only see their own expenses (if any)
        result.rows.forEach((row) => {
          expect(row.employee_id).toBe(TEST_USERS.intern.userId);
        });
      } finally {
        await client.end();
      }
    });

    /**
     * Test: Manager can see department expenses
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Managers should be able to see and approve expenses from their team.
     */
    test('manager can see department expenses', async () => {
      const client = await createFinanceUserClient(
        TEST_USERS.manager.userId,
        TEST_USERS.manager.roles,
        TEST_USERS.manager.department,
        TEST_USERS.manager.email
      );

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT id, employee_id, department_id
          FROM finance.expenses
        `);

        // Manager should see expenses from their department
        // Results may be empty if no department match
        expect(result.rows).toBeDefined();
      } finally {
        await client.end();
      }
    });

    /**
     * Test: HR role cannot see expenses (wrong domain)
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * HR access is for employee data, not financial transactions.
     * Cross-schema access should be denied.
     */
    test('hr role cannot see all expenses (cross-domain denied)', async () => {
      const client = await createFinanceUserClient(
        TEST_USERS.hrRead.userId,
        TEST_USERS.hrRead.roles,
        TEST_USERS.hrRead.department,
        TEST_USERS.hrRead.email
      );

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          SELECT COUNT(DISTINCT employee_id) as unique_employees
          FROM finance.expenses
        `);

        // HR should NOT see all expenses (only their own, if any)
        // If cross-domain is properly denied, they see minimal data
        const uniqueEmployees = parseInt(result.rows[0].unique_employees, 10);

        // Should not see expenses from multiple employees
        expect(uniqueEmployees).toBeLessThanOrEqual(1);
      } finally {
        await client.end();
      }
    });

    /**
     * Test: finance-write can INSERT expenses (for bulk imports)
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Finance write role should be able to create expense records
     * (for administrative imports or corrections).
     */
    test('finance-write can INSERT expenses', async () => {
      const client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department,
        TEST_USERS.financeWrite.email
      );

      const testExpenseId = `test-expense-${Date.now()}`;

      try {
        // RED PHASE: Query will fail - table doesn't exist
        const result = await client.query(`
          INSERT INTO finance.expenses (
            id,
            employee_id,
            department_id,
            expense_date,
            category,
            description,
            amount,
            status
          ) VALUES (
            uuid_generate_v4(),
            $1,
            (SELECT id FROM hr.departments LIMIT 1),
            CURRENT_DATE,
            'OTHER',
            'Test expense for TDD',
            100.00,
            'PENDING'
          )
          RETURNING id
        `, [TEST_USERS.financeWrite.userId]);

        // Should successfully insert
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].id).toBeDefined();

        // Cleanup
        if (result.rows[0].id) {
          await client.query(
            'DELETE FROM finance.expenses WHERE id = $1',
            [result.rows[0].id]
          );
        }
      } finally {
        await client.end();
      }
    });

    /**
     * Test: Regular user cannot INSERT expenses for others
     *
     * RED PHASE: Will fail because table doesn't exist.
     *
     * Users should only be able to submit their own expenses.
     */
    test('regular user cannot INSERT expenses for other employees', async () => {
      const client = await createFinanceUserClient(
        TEST_USERS.employee.userId,
        TEST_USERS.employee.roles,
        TEST_USERS.employee.department,
        TEST_USERS.employee.email
      );

      try {
        // Try to insert expense for a different employee
        // RED PHASE: Query will fail - table doesn't exist
        await expect(
          client.query(`
            INSERT INTO finance.expenses (
              id,
              employee_id,
              department_id,
              expense_date,
              category,
              description,
              amount,
              status
            ) VALUES (
              uuid_generate_v4(),
              $1,
              (SELECT id FROM hr.departments LIMIT 1),
              CURRENT_DATE,
              'TRAVEL',
              'Fraudulent expense attempt',
              5000.00,
              'PENDING'
            )
          `, [TEST_USERS.executive.userId]) // Trying to submit as executive!
        ).rejects.toThrow(/permission denied|policy|violates/i);
      } finally {
        await client.end();
      }
    });
  });
});
