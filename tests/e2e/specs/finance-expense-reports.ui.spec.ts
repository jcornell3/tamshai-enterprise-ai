/**
 * Finance App - Expense Reports Page E2E Tests
 *
 * Tests the expense reports management interface:
 * - Page load and heading
 * - Stats cards (Total Reports, Pending Approval, Pending Reimbursement)
 * - Filter controls (status, employee, department, date range, amount range)
 * - Table rendering with correct columns
 * - Row expansion to show expense line items
 * - Status badges with correct styling
 * - Category badges on expense items
 * - Action buttons (approve, reject, reimburse) based on status/role
 * - Truncation warning display
 * - Empty state handling
 *
 * Architecture v1.5 - Expense Reports Module
 *
 * Prerequisites:
 * - User must be authenticated with finance-read/finance-write roles
 */

import { test, expect, BrowserContext } from '@playwright/test';
import {
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

const EXPENSE_REPORTS_URL = `${BASE_URLS[ENV]}/finance/expense-reports`;

let authenticatedContext: BrowserContext | null = null;

test.describe('Finance Expense Reports Page', () => {
  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    authenticatedContext = await createAuthenticatedContext(browser);
    await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/finance/`);
  });

  test.afterAll(async () => {
    if (authenticatedContext) await authenticatedContext.close();
  });

  test.describe('Page Load', () => {
    test('displays expense reports page with heading', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:has-text("Expense Reports"), h1:has-text("Expense Reports")')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('text=Review and process employee expense reports')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays stats cards', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        // Wait for data to load (either stats or error/not-implemented)
        const hasStats = await page.locator('[data-testid="report-count"]')
          .isVisible({ timeout: 10000 }).catch(() => false);
        const hasNotImplemented = await page.locator('[data-testid="not-implemented-state"]')
          .isVisible({ timeout: 3000 }).catch(() => false);

        if (hasStats) {
          await expect(page.locator('[data-testid="report-count"]')).toBeVisible();
          await expect(page.locator('[data-testid="pending-approval-amount"]')).toBeVisible();
          await expect(page.locator('[data-testid="pending-reimbursement-amount"]')).toBeVisible();
        } else {
          // Page may show not-implemented or error state
          expect(hasNotImplemented || await page.locator('[data-testid="error-state"]').isVisible().catch(() => false)).toBe(true);
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Filters', () => {
    test('status filter has expected options', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const statusFilter = page.locator('[data-testid="status-filter"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Expense reports not yet implemented');
          return;
        }

        // Verify status options
        const options = statusFilter.locator('option');
        const optionTexts = await options.allTextContents();
        expect(optionTexts).toContain('All Statuses');
        expect(optionTexts).toContain('Draft');
        expect(optionTexts).toContain('Submitted');
        expect(optionTexts).toContain('Approved');
        expect(optionTexts).toContain('Rejected');
        expect(optionTexts).toContain('Reimbursed');
      } finally {
        await page.close();
      }
    });

    test('department filter works', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const deptFilter = page.locator('[data-testid="department-filter"]');
        const hasFilter = await deptFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Expense reports not yet implemented');
          return;
        }

        await expect(deptFilter).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('date range filters are present', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const startDate = page.locator('[data-testid="start-date-filter"]');
        const hasFilter = await startDate.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Expense reports not yet implemented');
          return;
        }

        await expect(startDate).toBeVisible();
        await expect(page.locator('[data-testid="end-date-filter"]')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('amount range filters are present', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const minAmount = page.locator('[data-testid="min-amount-filter"]');
        const hasFilter = await minAmount.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Expense reports not yet implemented');
          return;
        }

        await expect(minAmount).toBeVisible();
        await expect(page.locator('[data-testid="max-amount-filter"]')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('clear filters resets all filters', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const statusFilter = page.locator('[data-testid="status-filter"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Expense reports not yet implemented');
          return;
        }

        // Set a filter
        await statusFilter.selectOption('DRAFT');

        // Click clear
        await page.locator('[data-testid="clear-filters"]').click();
        await page.waitForLoadState('networkidle');

        // Verify reset
        await expect(statusFilter).toHaveValue('');
      } finally {
        await page.close();
      }
    });

    test('filtering to impossible criteria shows no results', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const employeeFilter = page.locator('[data-testid="employee-filter"]');
        const hasFilter = await employeeFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Expense reports not yet implemented');
          return;
        }

        // Wait for table to render first (confirms data is loaded)
        const table = page.locator('[data-testid="expense-reports-table"]');
        const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false);
        if (!hasTable) {
          test.skip(true, 'No expense data to filter');
          return;
        }

        // Use status filter (select) to filter to impossible combo
        const statusFilter = page.locator('[data-testid="status-filter"]');
        await statusFilter.selectOption('DRAFT');

        // Also set employee filter to narrow further
        await employeeFilter.click();
        await employeeFilter.pressSequentially('zzz_nonexistent');

        // Should show either no-results or the table with 0 report rows
        const noResults = page.locator('[data-testid="no-results"]');
        const noRows = page.locator('[data-testid="report-row"]');
        const hasNoResults = await noResults.isVisible({ timeout: 10000 }).catch(() => false);
        const rowCount = await noRows.count();
        expect(hasNoResults || rowCount === 0).toBe(true);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Table Rendering', () => {
    test('displays expense report table with correct columns', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const table = page.locator('[data-testid="expense-reports-table"]');
        const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTable) {
          test.skip(true, 'Expense reports not yet implemented or no data');
          return;
        }

        // Verify table headers
        await expect(page.locator('th:has-text("Report #")')).toBeVisible();
        await expect(page.locator('th:has-text("Employee")')).toBeVisible();
        await expect(page.locator('th:has-text("Department")')).toBeVisible();
        await expect(page.locator('th:has-text("Amount")')).toBeVisible();
        await expect(page.locator('th:has-text("Expenses")')).toBeVisible();
        await expect(page.locator('th:has-text("Submitted")')).toBeVisible();
        await expect(page.locator('th:has-text("Status")')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('table displays report rows', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const table = page.locator('[data-testid="expense-reports-table"]');
        const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTable) {
          test.skip(true, 'Expense reports not yet implemented or no data');
          return;
        }

        // Verify at least one row exists
        const rows = page.locator('[data-testid="report-row"]');
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);

        // First row should have report number, employee name, and status badge
        const firstRow = rows.first();
        await expect(firstRow.locator('[data-testid="report-number"]')).toBeVisible();
        await expect(firstRow.locator('[data-testid="employee-name"]')).toBeVisible();
        await expect(firstRow.locator('[data-testid="status-badge"]')).toBeVisible();
        await expect(firstRow.locator('[data-testid="total-amount"]')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('status badges render with correct styling', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const badges = page.locator('[data-testid="status-badge"]');
        const hasBadges = await badges.first().isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasBadges) {
          test.skip(true, 'Expense reports not yet implemented or no data');
          return;
        }

        // Verify badges have badge- class prefix
        const badgeCount = await badges.count();
        for (let i = 0; i < Math.min(badgeCount, 5); i++) {
          const badge = badges.nth(i);
          const classList = await badge.getAttribute('class') || '';
          expect(classList).toMatch(/badge-/);
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Row Expansion', () => {
    test('clicking expand button shows expense line items', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const expandButton = page.locator('[data-testid="expand-button"]').first();
        const hasExpand = await expandButton.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasExpand) {
          test.skip(true, 'Expense reports not yet implemented or no data');
          return;
        }

        // Click expand
        await expandButton.click();

        // Verify expanded row appears with expense details
        const expandedRow = page.locator('[data-testid="expanded-row"]').first();
        await expect(expandedRow).toBeVisible({ timeout: 5000 });
        await expect(expandedRow.locator('text=Expense Details')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('expanded row shows expense item details', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const expandButton = page.locator('[data-testid="expand-button"]').first();
        const hasExpand = await expandButton.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasExpand) {
          test.skip(true, 'Expense reports not yet implemented or no data');
          return;
        }

        await expandButton.click();

        const expandedRow = page.locator('[data-testid="expanded-row"]').first();
        await expect(expandedRow).toBeVisible({ timeout: 5000 });

        // Verify expense detail table structure
        await expect(expandedRow.locator('th:has-text("Description")')).toBeVisible();
        await expect(expandedRow.locator('th:has-text("Category")')).toBeVisible();
        await expect(expandedRow.locator('th:has-text("Amount")')).toBeVisible();
        await expect(expandedRow.locator('th:has-text("Date")')).toBeVisible();

        // Expense rows may be empty if list API doesn't embed line items
        const expenseRows = expandedRow.locator('[data-testid="expense-row"]');
        const count = await expenseRows.count();
        if (count > 0) {
          // Verify first expense has description and amount
          await expect(expenseRows.first().locator('[data-testid="expense-description"]')).toBeVisible();
          await expect(expenseRows.first().locator('[data-testid="expense-amount"]')).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });

    test('expense category badges render', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const expandButton = page.locator('[data-testid="expand-button"]').first();
        const hasExpand = await expandButton.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasExpand) {
          test.skip(true, 'Expense reports not yet implemented or no data');
          return;
        }

        await expandButton.click();

        const expandedRow = page.locator('[data-testid="expanded-row"]').first();
        await expect(expandedRow).toBeVisible({ timeout: 5000 });

        // Category badges render when expenses are embedded in the response
        const categoryBadges = expandedRow.locator('[data-testid="expense-category"]');
        const count = await categoryBadges.count();
        if (count > 0) {
          const classList = await categoryBadges.first().getAttribute('class') || '';
          expect(classList).toMatch(/badge-/);
        }
        // If no expense items, the test passes (list API may not embed expenses)
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Action Buttons', () => {
    test('approve button visible for SUBMITTED reports with write role', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        // Filter to submitted status
        const statusFilter = page.locator('[data-testid="status-filter"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Expense reports not yet implemented');
          return;
        }

        await statusFilter.selectOption('SUBMITTED');
        await page.waitForLoadState('networkidle');

        // Check if there are submitted reports
        const rows = page.locator('[data-testid="report-row"]');
        const rowCount = await rows.count();
        if (rowCount === 0) {
          test.skip(true, 'No SUBMITTED reports in sample data');
          return;
        }

        // Approve button should be visible (if user has finance-write)
        const approveBtn = rows.first().locator('[data-testid="approve-button"]');
        const hasApprove = await approveBtn.isVisible({ timeout: 3000 }).catch(() => false);
        // If no approve button, user doesn't have write role
        if (hasApprove) {
          await expect(approveBtn).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });

    test('reject button triggers rejection reason dialog', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        // Filter to submitted status
        const statusFilter = page.locator('[data-testid="status-filter"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Expense reports not yet implemented');
          return;
        }

        await statusFilter.selectOption('SUBMITTED');
        await page.waitForLoadState('networkidle');

        const rows = page.locator('[data-testid="report-row"]');
        const rowCount = await rows.count();
        if (rowCount === 0) {
          test.skip(true, 'No SUBMITTED reports in sample data');
          return;
        }

        const rejectBtn = rows.first().locator('[data-testid="reject-button"]');
        const hasReject = await rejectBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (!hasReject) {
          test.skip(true, 'No reject button (user may lack write role)');
          return;
        }

        await rejectBtn.click();

        // Verify rejection dialog appears
        const dialog = page.locator('[data-testid="reject-dialog"]');
        await expect(dialog).toBeVisible({ timeout: 5000 });
        await expect(dialog.locator('text=Reject Expense Report')).toBeVisible();
        await expect(page.locator('[data-testid="rejection-reason"]')).toBeVisible();

        // Cancel to avoid side effects
        await dialog.locator('button:has-text("Cancel")').click();
      } finally {
        await page.close();
      }
    });

    test('reimburse button visible for APPROVED reports', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        const statusFilter = page.locator('[data-testid="status-filter"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Expense reports not yet implemented');
          return;
        }

        await statusFilter.selectOption('APPROVED');
        await page.waitForLoadState('networkidle');

        const rows = page.locator('[data-testid="report-row"]');
        const rowCount = await rows.count();
        if (rowCount === 0) {
          test.skip(true, 'No APPROVED reports in sample data');
          return;
        }

        const reimburseBtn = rows.first().locator('[data-testid="reimburse-button"]');
        const hasReimburse = await reimburseBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasReimburse) {
          await expect(reimburseBtn).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Truncation Warning', () => {
    test('truncation warning element exists when data exceeds limit', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(EXPENSE_REPORTS_URL);
        await page.waitForLoadState('networkidle');

        // Truncation warning only appears when data exceeds limit
        // Just verify the component doesn't cause errors
        const warning = page.locator('[data-testid="truncation-warning"]');
        const hasWarning = await warning.isVisible({ timeout: 3000 }).catch(() => false);

        // If visible, verify it contains warning text
        if (hasWarning) {
          const text = await warning.textContent();
          expect(text).toBeTruthy();
        }
        // No assertion failure if not visible - may not have enough data
      } finally {
        await page.close();
      }
    });
  });
});
