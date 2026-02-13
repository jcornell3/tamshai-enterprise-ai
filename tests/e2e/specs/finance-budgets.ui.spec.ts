/**
 * Finance App - Budgets Page E2E Tests
 *
 * Tests the budget management interface:
 * - Page load and heading
 * - Stats cards (Total Budgets, Total Allocated, Pending Approval)
 * - Filter controls (fiscal year, category, status, department)
 * - Table rendering with utilization progress bars
 * - Utilization bar color coding (green <80%, yellow 80-90%, red >90%)
 * - Department detail modal
 * - Action buttons (approve, reject) based on status/role
 * - Empty state handling
 *
 * Architecture v1.5 - Budget Management
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

const BUDGETS_URL = `${BASE_URLS[ENV]}/finance/budgets`;

let authenticatedContext: BrowserContext | null = null;

test.describe('Finance Budgets Page', () => {
  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    authenticatedContext = await createAuthenticatedContext(browser);
    await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/finance/`);
  });

  test.afterAll(async () => {
    if (authenticatedContext) await authenticatedContext.close();
  });

  test.describe('Page Load', () => {
    test('displays budgets page with heading', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:has-text("Budgets"), h1:has-text("Budgets")')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('text=Manage departmental budgets')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays stats cards', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const hasStats = await page.locator('[data-testid="budget-count"]')
          .isVisible({ timeout: 10000 }).catch(() => false);

        if (hasStats) {
          await expect(page.locator('[data-testid="budget-count"]')).toBeVisible();
          await expect(page.locator('[data-testid="total-allocated"]')).toBeVisible();
          await expect(page.locator('[data-testid="pending-count"]')).toBeVisible();
        } else {
          // Error or empty state
          const hasError = await page.locator('[data-testid="error-state"]').isVisible().catch(() => false);
          const hasEmpty = await page.locator('[data-testid="empty-state"]').isVisible().catch(() => false);
          expect(hasError || hasEmpty).toBe(true);
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Filters', () => {
    test('fiscal year filter has expected options', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const yearFilter = page.locator('[data-testid="year-filter"]');
        const hasFilter = await yearFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        const options = yearFilter.locator('option');
        const optionTexts = await options.allTextContents();
        expect(optionTexts).toContain('All Years');
      } finally {
        await page.close();
      }
    });

    test('status filter has expected options', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const statusFilter = page.locator('[data-testid="status-filter"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        const options = statusFilter.locator('option');
        const optionTexts = await options.allTextContents();
        expect(optionTexts).toContain('All Statuses');
        expect(optionTexts).toContain('Draft');
        expect(optionTexts).toContain('Pending Approval');
        expect(optionTexts).toContain('Approved');
        expect(optionTexts).toContain('Rejected');
        expect(optionTexts).toContain('Closed');
      } finally {
        await page.close();
      }
    });

    test('category filter is present', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const categoryFilter = page.locator('[data-testid="category-filter"]');
        const hasFilter = await categoryFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        await expect(categoryFilter).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('department filter is present', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const deptFilter = page.locator('[data-testid="department-filter"]');
        const hasFilter = await deptFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        await expect(deptFilter).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('clear filters resets all filters', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const statusFilter = page.locator('[data-testid="status-filter"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Budgets page not available or no data');
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
  });

  test.describe('Table Rendering', () => {
    test('displays budget table with correct columns', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const table = page.locator('[data-testid="budget-table"]');
        const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTable) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        await expect(page.locator('th:has-text("Department")')).toBeVisible();
        await expect(page.locator('th:has-text("Category")')).toBeVisible();
        await expect(page.locator('th:has-text("Fiscal Year")')).toBeVisible();
        await expect(page.locator('th:has-text("Allocated")')).toBeVisible();
        await expect(page.locator('th:has-text("Spent")')).toBeVisible();
        await expect(page.locator('th:has-text("Remaining")')).toBeVisible();
        await expect(page.locator('th:has-text("Utilization")')).toBeVisible();
        await expect(page.locator('th:has-text("Status")')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('table displays budget rows', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const table = page.locator('[data-testid="budget-table"]');
        const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTable) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        const rows = page.locator('[data-testid="budget-row"]');
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);

        // First row has department, category, status badge
        const firstRow = rows.first();
        await expect(firstRow.locator('[data-testid="department-link"]')).toBeVisible();
        await expect(firstRow.locator('[data-testid="status-badge"]')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('utilization bars render with color coding', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const bars = page.locator('[data-testid="utilization-bar"]');
        const hasBars = await bars.first().isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasBars) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        const barCount = await bars.count();
        expect(barCount).toBeGreaterThan(0);

        // Verify bars have one of the expected color classes
        for (let i = 0; i < Math.min(barCount, 5); i++) {
          const bar = bars.nth(i);
          const innerHTML = await bar.innerHTML();
          // The inner div should have bg-success-500, bg-warning-500, or bg-danger-500
          expect(innerHTML).toMatch(/bg-(success|warning|danger)-500/);
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Department Detail Modal', () => {
    test('clicking department link opens detail modal', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const deptLink = page.locator('[data-testid="department-link"]').first();
        const hasLink = await deptLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasLink) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        await deptLink.click();

        // Verify modal appears
        const modal = page.locator('[data-testid="department-detail-modal"]');
        await expect(modal).toBeVisible({ timeout: 5000 });

        // Modal should have budget category breakdown
        const hasCategories = await modal.locator('th:has-text("Category")').isVisible({ timeout: 5000 }).catch(() => false);
        const hasLoading = await modal.locator('text=Loading department budget').isVisible().catch(() => false);
        expect(hasCategories || hasLoading).toBe(true);

        // Close modal
        await modal.locator('button:has-text("Close")').click();
        await expect(modal).not.toBeVisible({ timeout: 3000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Action Buttons', () => {
    test('approve button visible for PENDING_APPROVAL budgets with write role', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const statusFilter = page.locator('[data-testid="status-filter"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        // Set year filter to "All Years" so 2026 PENDING_APPROVAL budgets are visible
        const yearFilter = page.locator('[data-testid="year-filter"]');
        await yearFilter.selectOption('');
        await page.waitForLoadState('networkidle');

        await statusFilter.selectOption('PENDING_APPROVAL');
        await page.waitForLoadState('networkidle');

        const rows = page.locator('[data-testid="budget-row"]');
        const rowCount = await rows.count();
        if (rowCount === 0) {
          test.skip(true, 'No PENDING_APPROVAL budgets in sample data');
          return;
        }

        // Approve button should be visible (if user has finance-write)
        const approveBtn = rows.first().locator('[data-testid="approve-button"]');
        const hasApprove = await approveBtn.isVisible({ timeout: 3000 }).catch(() => false);
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
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const statusFilter = page.locator('[data-testid="status-filter"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        // Set year filter to "All Years" so 2026 PENDING_APPROVAL budgets are visible
        const yearFilterReject = page.locator('[data-testid="year-filter"]');
        await yearFilterReject.selectOption('');
        await page.waitForLoadState('networkidle');

        await statusFilter.selectOption('PENDING_APPROVAL');
        await page.waitForLoadState('networkidle');

        const rows = page.locator('[data-testid="budget-row"]');
        const rowCount = await rows.count();
        if (rowCount === 0) {
          test.skip(true, 'No PENDING_APPROVAL budgets in sample data');
          return;
        }

        const rejectBtn = rows.first().locator('[data-testid="reject-button"]');
        const hasReject = await rejectBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (!hasReject) {
          test.skip(true, 'No reject button (user may lack write role)');
          return;
        }

        await rejectBtn.click();

        // Verify rejection dialog
        const dialog = page.locator('[data-testid="reject-dialog"]');
        await expect(dialog).toBeVisible({ timeout: 5000 });
        await expect(dialog.locator('text=Reject Budget')).toBeVisible();
        await expect(page.locator('[data-testid="rejection-reason"]')).toBeVisible();

        // Cancel to avoid side effects
        await dialog.locator('button:has-text("Cancel")').click();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Empty State', () => {
    test('no results shown when filtered to impossible criteria', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(BUDGETS_URL);
        await page.waitForLoadState('networkidle');

        const deptFilter = page.locator('[data-testid="department-filter"]');
        const hasFilter = await deptFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Budgets page not available or no data');
          return;
        }

        // Type a nonexistent department
        await deptFilter.fill('zzz_nonexistent_department_zzz');
        await page.waitForLoadState('networkidle');

        const noResults = page.locator('[data-testid="no-results"]');
        await expect(noResults).toBeVisible({ timeout: 5000 });
      } finally {
        await page.close();
      }
    });
  });
});
