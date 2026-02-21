/**
 * Finance App - Bulk Invoice Operations E2E Tests
 *
 * Tests the invoice batch approval flow with:
 * - Bulk row selection
 * - Bulk action toolbar behavior
 * - Confirmation dialogs
 * - State reversion after tests
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * Following Salesforce Lightning patterns for bulk operations.
 *
 * This test temporarily grants 'finance-write' role to test-user.journey,
 * runs the tests, then revokes the role. The finance-write role is required
 * for RLS policies to allow invoice approval operations.
 */

import { test, expect, BrowserContext } from '@playwright/test';
import {
  resetFinanceInvoices,
  expectBulkMenuEnabled,
  expectBulkMenuDisabled,
  selectTableRows,
  deselectTableRows,
  selectAllRows,
  deselectAllRows,
  getSelectedRowCount,
  clickBulkAction,
  confirmBulkAction,
  cancelBulkAction,
  expectSelectedCount,
  expectBulkActionsAvailable,
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
  grantRealmRole,
  revokeRealmRole,
} from '../utils';

const INVOICES_URL = `${BASE_URLS[ENV]}/finance/invoices`;
const FINANCE_WRITE_ROLE = 'finance-write';

let authenticatedContext: BrowserContext | null = null;

test.describe('Finance Invoice Bulk Operations', () => {
  let authCreatedAt: number;

  test.beforeAll(async ({ browser }) => {
    // Grant finance-write role BEFORE authentication so JWT includes the role
    console.log(`[finance-bulk] Granting '${FINANCE_WRITE_ROLE}' role to '${TEST_USER.username}'...`);
    await grantRealmRole(TEST_USER.username, FINANCE_WRITE_ROLE);

    // Now authenticate - the JWT will include the finance-write role
    authenticatedContext = await createAuthenticatedContext(browser);
    await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/finance/`);
    authCreatedAt = Date.now();
    // Ensure invoices are in their seed data state before the suite
    await resetFinanceInvoices();
  });

  test.afterAll(async () => {
    // Always revoke the role, even if tests fail
    try {
      console.log(`[finance-bulk] Revoking '${FINANCE_WRITE_ROLE}' role from '${TEST_USER.username}'...`);
      await revokeRealmRole(TEST_USER.username, FINANCE_WRITE_ROLE);
    } catch (error) {
      console.error(`[finance-bulk] Failed to revoke role: ${error}`);
    }

    await authenticatedContext?.close();
  });

  // Proactively refresh auth tokens before they expire.
  // Access tokens have a 5-minute lifetime; re-warm after 3 minutes.
  test.beforeEach(async () => {
    if (Date.now() - authCreatedAt > 3 * 60 * 1000) {
      await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/finance/`);
      authCreatedAt = Date.now();
    }
  });

  test.afterEach(async () => {
    // Reset invoice statuses to seed data values after each test
    await resetFinanceInvoices();
  });

  test.describe('Bulk Action Toolbar State', () => {
    test('bulk action menu is disabled when no rows are selected', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await expectBulkMenuDisabled(page);
      } finally {
        await page.close();
      }
    });

    test('bulk action menu enables when rows are selected', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        await expectBulkMenuEnabled(page);
      } finally {
        await page.close();
      }
    });

    test('bulk action menu disables when all rows are deselected', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        await expectBulkMenuEnabled(page);
        await deselectTableRows(page, [0]);
        await expectBulkMenuDisabled(page);
      } finally {
        await page.close();
      }
    });

    test('shows correct selected count in toolbar', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1, 2]);
        await expectSelectedCount(page, 3);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Row Selection Behavior', () => {
    test('individual row checkboxes toggle selection', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        expect(await getSelectedRowCount(page)).toBe(1);
        await selectTableRows(page, [1]);
        expect(await getSelectedRowCount(page)).toBe(2);
        await deselectTableRows(page, [0]);
        expect(await getSelectedRowCount(page)).toBe(1);
      } finally {
        await page.close();
      }
    });

    test('header checkbox selects all visible rows', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        const rowCount = await page.locator('tbody tr').count();
        await selectAllRows(page);
        expect(await getSelectedRowCount(page)).toBe(rowCount);
      } finally {
        await page.close();
      }
    });

    test('header checkbox deselects all when all are selected', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectAllRows(page);
        expect(await getSelectedRowCount(page)).toBeGreaterThan(0);
        await deselectAllRows(page);
        expect(await getSelectedRowCount(page)).toBe(0);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Bulk Approval Flow', () => {
    // Helper: navigate to invoices page, filter to PENDING via UI
    async function gotoPendingInvoices(page: import('@playwright/test').Page): Promise<number> {
      await page.goto(INVOICES_URL);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 15000 });
      await page.selectOption('[data-testid="status-filter"]', 'PENDING');
      await page.waitForTimeout(500);
      return page.locator('tbody tr').count();
    }

    test('approve action is available for pending invoices', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        const rowCount = await gotoPendingInvoices(page);
        expect(rowCount).toBeGreaterThanOrEqual(2);
        await selectTableRows(page, [0, 1]);
        await expectBulkActionsAvailable(page, ['approve']);
      } finally {
        await page.close();
      }
    });

    test('shows confirmation dialog before bulk approval', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        const rowCount = await gotoPendingInvoices(page);
        expect(rowCount).toBeGreaterThanOrEqual(3);
        await selectTableRows(page, [0, 1, 2]);
        await clickBulkAction(page, 'approve');
        const dialog = page.locator('[role="dialog"][data-testid="confirm-dialog"]');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('3');
      } finally {
        await page.close();
      }
    });

    test('canceling confirmation does not modify data', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        const rowCount = await gotoPendingInvoices(page);
        expect(rowCount).toBeGreaterThanOrEqual(1);
        const initialCount = rowCount;
        await selectTableRows(page, [0]);
        await clickBulkAction(page, 'approve');
        await cancelBulkAction(page);
        const finalCount = await page.locator('tbody tr').count();
        expect(finalCount).toBe(initialCount);
      } finally {
        await page.close();
      }
    });

    test('confirming approval updates invoice statuses', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        const rowCount = await gotoPendingInvoices(page);
        expect(rowCount).toBeGreaterThanOrEqual(2);
        const initialCount = rowCount;
        await selectTableRows(page, [0, 1]);
        await clickBulkAction(page, 'approve');
        await confirmBulkAction(page);

        // After local confirm dialog, the MCP tool returns pending_confirmation
        // which renders an ApprovalCard for human-in-the-loop confirmation
        const apiConfirmation = page.locator('[data-testid="api-confirmation"]');
        await expect(apiConfirmation).toBeVisible({ timeout: 5000 });

        // Click "Approve" in the ApprovalCard and wait for confirmation API response
        const [confirmResponse] = await Promise.all([
          page.waitForResponse((res) => res.url().includes('/api/confirm/'), { timeout: 10000 }),
          apiConfirmation.locator('.btn-success').click(),
        ]);
        expect(confirmResponse.status()).toBe(200);

        // Wait for ApprovalCard to disappear and data to refresh
        await expect(apiConfirmation).not.toBeVisible({ timeout: 10000 });
        await page.waitForResponse(
          (res) => res.url().includes('list_invoices') && res.status() === 200,
          { timeout: 10000 }
        );

        // Allow React to re-render with new data
        await page.waitForTimeout(500);
        const finalCount = await page.locator('tbody tr').count();
        expect(finalCount).toBe(initialCount - 2);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Bulk Rejection Flow', () => {
    // Helper: navigate to invoices page, filter to PENDING via UI
    async function gotoPendingInvoices(page: import('@playwright/test').Page): Promise<number> {
      await page.goto(INVOICES_URL);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 15000 });
      await page.selectOption('[data-testid="status-filter"]', 'PENDING');
      await page.waitForTimeout(500);
      return page.locator('tbody tr').count();
    }

    test('reject action is available for pending invoices', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        const rowCount = await gotoPendingInvoices(page);
        expect(rowCount).toBeGreaterThanOrEqual(1);
        await selectTableRows(page, [0]);
        await expectBulkActionsAvailable(page, ['reject']);
      } finally {
        await page.close();
      }
    });

    test('rejection requires reason input', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        const rowCount = await gotoPendingInvoices(page);
        expect(rowCount).toBeGreaterThanOrEqual(1);
        await selectTableRows(page, [0]);
        await clickBulkAction(page, 'reject');
        const dialog = page.locator('[role="dialog"][data-testid="confirm-dialog"]');
        await expect(dialog).toBeVisible();
        const reasonInput = dialog.locator('textarea, input[name="reason"]');
        await expect(reasonInput).toBeVisible();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Bulk Export Flow', () => {
    test('export action is available for any selection', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1, 2]);
        await expectBulkActionsAvailable(page, ['export']);
      } finally {
        await page.close();
      }
    });

    test('export downloads file for selected invoices', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1]);
        const downloadPromise = page.waitForEvent('download');
        await clickBulkAction(page, 'export');
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('invoices');
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Accessibility', () => {
    test('bulk action toolbar has proper ARIA attributes', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        const toolbar = page.locator('[data-testid="bulk-action-toolbar"]');
        await expect(toolbar).toHaveAttribute('role', 'toolbar');
        await expect(toolbar).toHaveAttribute('aria-label');
      } finally {
        await page.close();
      }
    });

    test('selected row count is announced to screen readers', async () => {
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1]);
        const liveRegion = page.locator('[aria-live="polite"], [role="status"]');
        await expect(liveRegion).toContainText(/2.*selected/i);
      } finally {
        await page.close();
      }
    });
  });
});
