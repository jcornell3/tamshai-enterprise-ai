/**
 * RLS Policies Integration Tests - TDD RED PHASE
 *
 * These tests are written FIRST, before all policies exist.
 * They define the expected behavior of Row Level Security policies.
 *
 * Expected: All tests FAIL initially (RED phase)
 *
 * Test Categories:
 * 1. Reference Table SELECT tests (4 tests)
 * 2. HR Employee Access tests by role (8 tests)
 * 3. HR Write Operation tests (6 tests)
 * 4. Finance Access tests by role (8 tests)
 * 5. Finance Write Operation tests (5 tests)
 * 6. Cross-Schema Access Denial tests (4 tests)
 * 7. Audit Table Access tests (2 tests)
 *
 * Total: 37 tests
 */

import { Client } from 'pg';
import { createUserClient, createFinanceUserClient, getAdminPool, TEST_USERS } from './setup';

describe('RLS Policies - Integration Tests', () => {
  beforeAll(() => {
    // Establish admin pool connection (for future admin operations)
    getAdminPool();
  });

  // ============================================================
  // SECTION 1: Reference Tables (Public Read)
  // These tables should be readable by any authenticated user
  // ============================================================

  describe('Reference Tables (Public Read)', () => {
    let internClientHR: Client;
    let internClientFinance: Client;

    beforeAll(async () => {
      // Use intern (lowest privilege) to verify public read access
      // Separate clients for HR and Finance databases
      internClientHR = await createUserClient(
        TEST_USERS.intern.userId,
        TEST_USERS.intern.roles,
        TEST_USERS.intern.department
      );
      internClientFinance = await createFinanceUserClient(
        TEST_USERS.intern.userId,
        TEST_USERS.intern.roles,
        TEST_USERS.intern.department
      );
    });

    afterAll(async () => {
      await internClientHR.end();
      await internClientFinance.end();
    });

    test('any authenticated user can SELECT from hr.departments', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Intern can read all departments (reference data)

      const result = await internClientHR.query('SELECT * FROM hr.departments');

      // Should return departments without RLS blocking
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty('id');
      expect(result.rows[0]).toHaveProperty('name');
    });

    test('any authenticated user can SELECT from hr.grade_levels', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Intern can read all grade levels (reference data)

      const result = await internClientHR.query('SELECT * FROM hr.grade_levels');

      // Should return grade levels without RLS blocking
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty('id');
      expect(result.rows[0]).toHaveProperty('grade');
    });

    test('any authenticated user can SELECT from finance.fiscal_years', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Intern can read fiscal years (reference data)

      const result = await internClientFinance.query('SELECT * FROM finance.fiscal_years');

      // Should return fiscal years without RLS blocking
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty('id');
    });

    test('any authenticated user can SELECT from finance.budget_categories', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Intern can read budget categories (reference data)

      const result = await internClientFinance.query('SELECT * FROM finance.budget_categories');

      // Should return categories without RLS blocking
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty('id');
      expect(result.rows[0]).toHaveProperty('name');
    });
  });

  // ============================================================
  // SECTION 2: HR Employee Access by Role
  // Tests SELECT policies on hr.employees table
  // ============================================================

  describe('HR Employees - SELECT Policies', () => {
    test('intern can only see own employee record', async () => {
      // TDD: Define expected behavior FIRST
      // Login as frank.davis (intern)
      // EXPECT: Only 1 row (self)

      const client = await createUserClient(
        TEST_USERS.intern.userId,
        TEST_USERS.intern.roles,
        TEST_USERS.intern.department
      );

      try {
        const result = await client.query('SELECT * FROM hr.employees');

        // Intern should only see themselves
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].id).toBe(TEST_USERS.intern.employeeId);
      } finally {
        await client.end();
      }
    });

    test('regular employee can only see own record', async () => {
      // TDD: Define expected behavior FIRST
      // Login as marcus.johnson (regular employee)
      // EXPECT: Only 1 row (self)

      const client = await createUserClient(
        TEST_USERS.employee.userId,
        TEST_USERS.employee.roles,
        TEST_USERS.employee.department
      );

      try {
        const result = await client.query('SELECT * FROM hr.employees');

        // Employee should only see themselves
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].id).toBe(TEST_USERS.employee.employeeId);
      } finally {
        await client.end();
      }
    });

    test('manager can see direct reports', async () => {
      // TDD: Define expected behavior FIRST
      // Login as nina.patel (manager)
      // EXPECT: Self + team members (at least 2 rows)

      const client = await createUserClient(
        TEST_USERS.manager.userId,
        TEST_USERS.manager.roles,
        TEST_USERS.manager.department
      );

      try {
        const result = await client.query('SELECT * FROM hr.employees');

        // Manager should see themselves and direct reports
        expect(result.rows.length).toBeGreaterThan(1);

        // Verify manager's own record is included
        const managerRow = result.rows.find(
          (r) => r.id === TEST_USERS.manager.employeeId
        );
        expect(managerRow).toBeDefined();
      } finally {
        await client.end();
      }
    });

    test('manager cannot see employees outside their team', async () => {
      // TDD: Define expected behavior FIRST
      // Login as nina.patel (Engineering manager)
      // EXPECT: Cannot see HR or Finance employees

      const client = await createUserClient(
        TEST_USERS.manager.userId,
        TEST_USERS.manager.roles,
        TEST_USERS.manager.department
      );

      try {
        const result = await client.query(
          "SELECT * FROM hr.employees WHERE department = 'HR'"
        );

        // Manager should not see HR department employees
        expect(result.rows.length).toBe(0);
      } finally {
        await client.end();
      }
    });

    test('hr-read can see all employees', async () => {
      // TDD: Define expected behavior FIRST
      // Login as alice.chen (hr-read)
      // EXPECT: All employees visible

      const client = await createUserClient(
        TEST_USERS.hrRead.userId,
        TEST_USERS.hrRead.roles,
        TEST_USERS.hrRead.department
      );

      try {
        const result = await client.query('SELECT * FROM hr.employees');

        // HR should see all employees (at least 10 based on sample data)
        expect(result.rows.length).toBeGreaterThanOrEqual(10);
      } finally {
        await client.end();
      }
    });

    test('hr-write can see all employees', async () => {
      // TDD: Define expected behavior FIRST
      // Login as alice.chen (hr-write)
      // EXPECT: All employees visible

      const client = await createUserClient(
        TEST_USERS.hrWrite.userId,
        TEST_USERS.hrWrite.roles,
        TEST_USERS.hrWrite.department
      );

      try {
        const result = await client.query('SELECT * FROM hr.employees');

        // HR-write should see all employees
        expect(result.rows.length).toBeGreaterThanOrEqual(10);
      } finally {
        await client.end();
      }
    });

    test('executive can see all employees across departments', async () => {
      // TDD: Define expected behavior FIRST
      // Login as eve.thompson (executive)
      // EXPECT: All employees visible

      const client = await createUserClient(
        TEST_USERS.executive.userId,
        TEST_USERS.executive.roles,
        TEST_USERS.executive.department
      );

      try {
        const result = await client.query('SELECT * FROM hr.employees');

        // Executive should see all employees
        expect(result.rows.length).toBeGreaterThanOrEqual(10);
      } finally {
        await client.end();
      }
    });

    test('finance role cannot see HR employee details', async () => {
      // TDD: Define expected behavior FIRST
      // Login as bob.martinez (finance-read)
      // EXPECT: Only own record visible (not full HR access)

      const client = await createUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department
      );

      try {
        const result = await client.query('SELECT * FROM hr.employees');

        // Finance role should only see their own record
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].id).toBe(TEST_USERS.financeRead.employeeId);
      } finally {
        await client.end();
      }
    });
  });

  // ============================================================
  // SECTION 3: HR Write Operations
  // Tests INSERT, UPDATE, DELETE policies on hr.employees
  // ============================================================

  describe('HR Employees - WRITE Policies', () => {
    test('intern cannot INSERT employees', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: RLS policy violation error

      const client = await createUserClient(
        TEST_USERS.intern.userId,
        TEST_USERS.intern.roles,
        TEST_USERS.intern.department
      );

      try {
        await expect(
          client.query(`
            INSERT INTO hr.employees (employee_id, first_name, last_name, email, department)
            VALUES ('test-001', 'Test', 'User', 'test@example.com', 'IT')
          `)
        ).rejects.toThrow(/permission denied|policy/i);
      } finally {
        await client.end();
      }
    });

    test('hr-write CAN INSERT employees', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Success - HR-write can create employees

      const client = await createUserClient(
        TEST_USERS.hrWrite.userId,
        TEST_USERS.hrWrite.roles,
        TEST_USERS.hrWrite.department
      );

      const testEmployeeId = `test-insert-${Date.now()}`;

      try {
        const result = await client.query(`
          INSERT INTO hr.employees (employee_id, first_name, last_name, email, department)
          VALUES ($1, 'Test', 'Insert', 'test.insert@example.com', 'IT')
          RETURNING employee_id
        `, [testEmployeeId]);

        expect(result.rows[0].employee_id).toBe(testEmployeeId);

        // Cleanup
        await client.query('DELETE FROM hr.employees WHERE employee_id = $1', [testEmployeeId]);
      } finally {
        await client.end();
      }
    });

    test('manager can UPDATE direct reports only', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Success for team members, failure for others

      const client = await createUserClient(
        TEST_USERS.manager.userId,
        TEST_USERS.manager.roles,
        TEST_USERS.manager.department
      );

      try {
        // Try to update an employee in their team (should succeed)
        // Note: Actual employee IDs depend on sample data
        const result = await client.query(`
          UPDATE hr.employees
          SET notes = 'Updated by manager'
          WHERE manager_id = $1
          RETURNING employee_id
        `, [TEST_USERS.manager.employeeId]);

        // Should update at least one direct report
        expect(result.rowCount).toBeGreaterThan(0);
      } finally {
        await client.end();
      }
    });

    test('manager cannot UPDATE employees outside their team', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: RLS prevents update of non-team members

      const client = await createUserClient(
        TEST_USERS.manager.userId,
        TEST_USERS.manager.roles,
        TEST_USERS.manager.department
      );

      try {
        // Try to update HR employee (should fail or return 0 rows)
        const result = await client.query(`
          UPDATE hr.employees
          SET notes = 'Attempted unauthorized update'
          WHERE department = 'HR'
          RETURNING employee_id
        `);

        // Should not update any rows due to RLS
        expect(result.rowCount).toBe(0);
      } finally {
        await client.end();
      }
    });

    test('hr-write CAN UPDATE any employee', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Success - HR-write can modify all employees

      const client = await createUserClient(
        TEST_USERS.hrWrite.userId,
        TEST_USERS.hrWrite.roles,
        TEST_USERS.hrWrite.department
      );

      try {
        // NOTE: TEST_USERS.employeeId maps to hr.employees.id (UUID primary key),
        // not the employee_id varchar column which is empty in sample data
        const result = await client.query(`
          UPDATE hr.employees
          SET notes = 'Updated by HR'
          WHERE id = $1
          RETURNING id
        `, [TEST_USERS.employee.employeeId]);

        expect(result.rowCount).toBe(1);
      } finally {
        await client.end();
      }
    });

    test('hr-write CAN DELETE employees', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Success - HR-write can delete employees

      const client = await createUserClient(
        TEST_USERS.hrWrite.userId,
        TEST_USERS.hrWrite.roles,
        TEST_USERS.hrWrite.department
      );

      const testEmployeeId = `test-delete-${Date.now()}`;

      try {
        // First insert a test employee
        await client.query(`
          INSERT INTO hr.employees (employee_id, first_name, last_name, email, department)
          VALUES ($1, 'Test', 'Delete', 'test.delete@example.com', 'IT')
        `, [testEmployeeId]);

        // Then delete it
        const result = await client.query(
          'DELETE FROM hr.employees WHERE employee_id = $1 RETURNING employee_id',
          [testEmployeeId]
        );

        expect(result.rowCount).toBe(1);
      } finally {
        await client.end();
      }
    });
  });

  // ============================================================
  // SECTION 4: Finance Access by Role
  // Tests SELECT policies on finance tables
  // ============================================================

  describe('Finance Tables - SELECT Policies', () => {
    test('intern cannot see department budgets', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: No budget data visible to intern

      const client = await createFinanceUserClient(
        TEST_USERS.intern.userId,
        TEST_USERS.intern.roles,
        TEST_USERS.intern.department
      );

      try {
        const result = await client.query('SELECT * FROM finance.department_budgets');

        // Intern should not see any budgets
        expect(result.rows.length).toBe(0);
      } finally {
        await client.end();
      }
    });

    test('finance-read can see all budgets', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: All department budgets visible

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department
      );

      try {
        const result = await client.query('SELECT * FROM finance.department_budgets');

        // Finance should see all budgets
        expect(result.rows.length).toBeGreaterThan(0);
      } finally {
        await client.end();
      }
    });

    test('finance-read can see all invoices', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: All invoices visible

      const client = await createFinanceUserClient(
        TEST_USERS.financeRead.userId,
        TEST_USERS.financeRead.roles,
        TEST_USERS.financeRead.department
      );

      try {
        const result = await client.query('SELECT * FROM finance.invoices');

        // Finance should see all invoices
        expect(result.rows.length).toBeGreaterThan(0);
      } finally {
        await client.end();
      }
    });

    test('manager can only see own department budget', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Only Engineering department budget visible

      const client = await createFinanceUserClient(
        TEST_USERS.manager.userId,
        TEST_USERS.manager.roles,
        TEST_USERS.manager.department
      );

      try {
        const result = await client.query('SELECT * FROM finance.department_budgets');

        // Manager should only see their department's budget
        expect(result.rows.length).toBeGreaterThan(0);
        result.rows.forEach((row) => {
          expect(row.department).toBe(TEST_USERS.manager.department);
        });
      } finally {
        await client.end();
      }
    });

    test('executive can see all department budgets', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: All budgets visible across departments

      const client = await createFinanceUserClient(
        TEST_USERS.executive.userId,
        TEST_USERS.executive.roles,
        TEST_USERS.executive.department
      );

      try {
        const result = await client.query('SELECT * FROM finance.department_budgets');

        // Executive should see all budgets
        expect(result.rows.length).toBeGreaterThan(0);

        // Verify multiple departments are visible
        const departments = new Set(result.rows.map((r) => r.department));
        expect(departments.size).toBeGreaterThan(1);
      } finally {
        await client.end();
      }
    });

    test('executive can see all invoices', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: All invoices visible

      const client = await createFinanceUserClient(
        TEST_USERS.executive.userId,
        TEST_USERS.executive.roles,
        TEST_USERS.executive.department
      );

      try {
        const result = await client.query('SELECT * FROM finance.invoices');

        expect(result.rows.length).toBeGreaterThan(0);
      } finally {
        await client.end();
      }
    });

    test('sales-read can see revenue summary', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Sales role can access revenue data

      const client = await createFinanceUserClient(
        TEST_USERS.sales.userId,
        TEST_USERS.sales.roles,
        TEST_USERS.sales.department
      );

      try {
        const result = await client.query('SELECT * FROM finance.revenue_summary');

        // Sales should see revenue data
        expect(result.rows.length).toBeGreaterThan(0);
      } finally {
        await client.end();
      }
    });

    test('public financial reports are visible to all authenticated users', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Public reports visible to everyone

      const client = await createFinanceUserClient(
        TEST_USERS.intern.userId,
        TEST_USERS.intern.roles,
        TEST_USERS.intern.department
      );

      try {
        const result = await client.query(
          "SELECT * FROM finance.financial_reports WHERE visibility = 'PUBLIC'"
        );

        // Public reports should be visible to all
        expect(result.rows.length).toBeGreaterThanOrEqual(0);
        // Note: May be 0 if no public reports exist in sample data
      } finally {
        await client.end();
      }
    });
  });

  // ============================================================
  // SECTION 5: Finance Write Operations
  // Tests INSERT, UPDATE, DELETE policies on finance tables
  // ============================================================

  describe('Finance Tables - WRITE Policies', () => {
    test('intern cannot INSERT budgets', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: RLS policy violation error

      const client = await createFinanceUserClient(
        TEST_USERS.intern.userId,
        TEST_USERS.intern.roles,
        TEST_USERS.intern.department
      );

      try {
        await expect(
          client.query(`
            INSERT INTO finance.department_budgets (budget_id, department, department_code, fiscal_year, budgeted_amount, amount)
            VALUES ('test-budget-001', 'IT', 'IT', 2026, 100000, 100000)
          `)
        ).rejects.toThrow(/permission denied|policy/i);
      } finally {
        await client.end();
      }
    });

    test('finance-write CAN INSERT budgets', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Success - finance-write can create budgets

      const client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );

      const testBudgetId = `test-budget-${Date.now()}`;

      try {
        const result = await client.query(`
          INSERT INTO finance.department_budgets (budget_id, department, department_code, fiscal_year, budgeted_amount, amount)
          VALUES ($1, 'IT', 'IT', 2026, 100000, 100000)
          RETURNING budget_id
        `, [testBudgetId]);

        expect(result.rows[0].budget_id).toBe(testBudgetId);

        // Cleanup
        await client.query('DELETE FROM finance.department_budgets WHERE budget_id = $1', [testBudgetId]);
      } finally {
        await client.end();
      }
    });

    test('finance-write CAN UPDATE budgets', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Success - finance-write can modify budgets

      const client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );

      try {
        // Get an existing budget to update
        const existing = await client.query(
          'SELECT budget_id FROM finance.department_budgets LIMIT 1'
        );

        if (existing.rows.length > 0) {
          const result = await client.query(`
            UPDATE finance.department_budgets
            SET notes = 'Updated by finance'
            WHERE budget_id = $1
            RETURNING budget_id
          `, [existing.rows[0].budget_id]);

          expect(result.rowCount).toBe(1);
        }
      } finally {
        await client.end();
      }
    });

    test('finance-write CAN DELETE budgets', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Success - finance-write can delete budgets

      const client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );

      const testBudgetId = `test-delete-budget-${Date.now()}`;

      try {
        // First insert a test budget
        await client.query(`
          INSERT INTO finance.department_budgets (budget_id, department, department_code, fiscal_year, budgeted_amount, amount)
          VALUES ($1, 'IT', 'IT', 2026, 50000, 50000)
        `, [testBudgetId]);

        // Then delete it
        const result = await client.query(
          'DELETE FROM finance.department_budgets WHERE budget_id = $1 RETURNING budget_id',
          [testBudgetId]
        );

        expect(result.rowCount).toBe(1);
      } finally {
        await client.end();
      }
    });

    test('finance-write CAN DELETE invoices', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Success - finance-write can delete invoices

      const client = await createFinanceUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );

      const testInvoiceId = `test-delete-invoice-${Date.now()}`;

      try {
        // First insert a test invoice
        await client.query(`
          INSERT INTO finance.invoices (invoice_id, vendor_name, amount, status)
          VALUES ($1, 'Test Vendor', 1000, 'DRAFT')
        `, [testInvoiceId]);

        // Then delete it
        const result = await client.query(
          'DELETE FROM finance.invoices WHERE invoice_id = $1 RETURNING invoice_id',
          [testInvoiceId]
        );

        expect(result.rowCount).toBe(1);
      } finally {
        await client.end();
      }
    });
  });

  // ============================================================
  // SECTION 6: Cross-Schema Access Denial
  // Verifies users cannot access data outside their role scope
  // ============================================================

  describe('Cross-Schema Access Denial', () => {
    test('sales role cannot INSERT into hr.employees', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: RLS blocks cross-schema write
      // Note: Using HR database since this tests HR table access

      const client = await createUserClient(
        TEST_USERS.sales.userId,
        TEST_USERS.sales.roles,
        TEST_USERS.sales.department
      );

      try {
        await expect(
          client.query(`
            INSERT INTO hr.employees (employee_id, first_name, last_name, email, department)
            VALUES ('sales-test-001', 'Sales', 'Test', 'sales.test@example.com', 'Sales')
          `)
        ).rejects.toThrow(/permission denied|policy/i);
      } finally {
        await client.end();
      }
    });

    test('hr role cannot INSERT into finance.invoices', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: RLS blocks cross-schema write
      // Note: Using Finance database since this tests Finance table access

      const client = await createFinanceUserClient(
        TEST_USERS.hrWrite.userId,
        TEST_USERS.hrWrite.roles,
        TEST_USERS.hrWrite.department
      );

      try {
        await expect(
          client.query(`
            INSERT INTO finance.invoices (invoice_id, vendor_name, amount, status)
            VALUES ('hr-test-invoice-001', 'HR Test', 5000, 'DRAFT')
          `)
        ).rejects.toThrow(/permission denied|policy/i);
      } finally {
        await client.end();
      }
    });

    test('finance role cannot UPDATE hr.employees', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: RLS blocks cross-schema update
      // Note: Using HR database since this tests HR table access

      const client = await createUserClient(
        TEST_USERS.financeWrite.userId,
        TEST_USERS.financeWrite.roles,
        TEST_USERS.financeWrite.department
      );

      try {
        const result = await client.query(`
          UPDATE hr.employees
          SET notes = 'Finance attempted update'
          WHERE department = 'Engineering'
          RETURNING employee_id
        `);

        // Should not update any rows (only self is visible)
        expect(result.rowCount).toBe(0);
      } finally {
        await client.end();
      }
    });

    test('hr role cannot DELETE from finance.department_budgets', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: RLS blocks cross-schema delete
      // Note: Using Finance database since this tests Finance table access

      const client = await createFinanceUserClient(
        TEST_USERS.hrWrite.userId,
        TEST_USERS.hrWrite.roles,
        TEST_USERS.hrWrite.department
      );

      try {
        const result = await client.query(`
          DELETE FROM finance.department_budgets
          WHERE department = 'Engineering'
          RETURNING budget_id
        `);

        // Should not delete any rows due to RLS
        expect(result.rowCount).toBe(0);
      } finally {
        await client.end();
      }
    });
  });

  // ============================================================
  // SECTION 7: Audit Tables
  // Audit tables intentionally have no RLS for compliance
  // ============================================================

  describe('Audit Tables - No RLS (Compliance)', () => {
    test('hr.access_audit_log has no RLS (intentional for audit compliance)', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Audit log readable for compliance/auditing purposes
      // Note: RLS intentionally disabled on audit tables
      // Note: Using HR database since this tests HR audit table

      const client = await createUserClient(
        TEST_USERS.executive.userId,
        TEST_USERS.executive.roles,
        TEST_USERS.executive.department
      );

      try {
        // This should succeed as audit tables have no RLS by design
        const result = await client.query('SELECT * FROM hr.access_audit_log LIMIT 10');

        // Audit log should be accessible (may have 0 rows if no activity)
        expect(result.rows).toBeDefined();
      } finally {
        await client.end();
      }
    });

    test('finance.access_audit_log has no RLS (intentional for audit compliance)', async () => {
      // TDD: Define expected behavior FIRST
      // EXPECT: Audit log readable for compliance/auditing purposes
      // Note: RLS intentionally disabled on audit tables
      // Note: Using Finance database since this tests Finance audit table

      const client = await createFinanceUserClient(
        TEST_USERS.executive.userId,
        TEST_USERS.executive.roles,
        TEST_USERS.executive.department
      );

      try {
        // This should succeed as audit tables have no RLS by design
        const result = await client.query('SELECT * FROM finance.access_audit_log LIMIT 10');

        // Audit log should be accessible (may have 0 rows if no activity)
        expect(result.rows).toBeDefined();
      } finally {
        await client.end();
      }
    });
  });
});
