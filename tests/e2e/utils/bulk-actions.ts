/**
 * E2E Bulk Action Utilities
 *
 * Provides helpers for testing DataTable bulk action patterns.
 * Implements Salesforce Lightning-style bulk selection and action patterns.
 *
 * Architecture v1.5 - Enterprise UX Hardening
 */

import { Page, expect, Locator } from '@playwright/test';

// Default selectors following the DataTable component conventions
const SELECTORS = {
  // Table structure
  table: '[data-testid="data-table"]',
  tableBody: 'tbody',
  tableRow: 'tbody tr',

  // Selection
  headerCheckbox: '[data-testid="select-all-checkbox"]',
  rowCheckbox: '[data-testid="row-checkbox"]',
  selectedRow: 'tr[data-selected="true"]',

  // Bulk action toolbar
  bulkToolbar: '[data-testid="bulk-action-toolbar"]',
  bulkActionButton: '[data-testid^="bulk-action-"]',
  selectedCount: '[data-testid="selected-count"]',

  // Confirmation dialog
  confirmDialog: '[role="dialog"][data-testid="confirm-dialog"]',
  confirmButton: '[data-testid="confirm-action"]',
  cancelButton: '[data-testid="cancel-action"]',
};

/**
 * Assert that bulk action menu is enabled (visible and interactive)
 *
 * The bulk action toolbar should appear when rows are selected.
 * Uses aria-disabled and visibility checks for accessibility compliance.
 *
 * @param page - Playwright Page instance
 */
export async function expectBulkMenuEnabled(page: Page): Promise<void> {
  const toolbar = page.locator(SELECTORS.bulkToolbar);

  // Toolbar should be visible
  await expect(toolbar).toBeVisible({ timeout: 5000 });

  // Toolbar should not be disabled
  await expect(toolbar).not.toHaveAttribute('aria-disabled', 'true');

  // At least one action button should be enabled
  const actionButtons = toolbar.locator(SELECTORS.bulkActionButton);
  const buttonCount = await actionButtons.count();

  if (buttonCount > 0) {
    const firstButton = actionButtons.first();
    await expect(firstButton).toBeEnabled();
  }
}

/**
 * Assert that bulk action menu is disabled (hidden or non-interactive)
 *
 * The bulk action toolbar should be hidden when no rows are selected.
 *
 * @param page - Playwright Page instance
 */
export async function expectBulkMenuDisabled(page: Page): Promise<void> {
  const toolbar = page.locator(SELECTORS.bulkToolbar);

  // Toolbar should either be hidden or disabled
  const isVisible = await toolbar.isVisible().catch(() => false);

  if (isVisible) {
    // If visible, it should be in disabled state
    await expect(toolbar).toHaveAttribute('aria-disabled', 'true');
  }
  // If not visible, the assertion passes (menu is disabled by being hidden)
}

/**
 * Select specific table rows by their index
 *
 * Clicks the row checkboxes at the specified indices.
 * Index is 0-based relative to visible rows.
 *
 * @param page - Playwright Page instance
 * @param rowIndexes - Array of row indices to select (0-based)
 */
export async function selectTableRows(page: Page, rowIndexes: number[]): Promise<void> {
  const rows = page.locator(SELECTORS.tableRow);

  for (const index of rowIndexes) {
    const row = rows.nth(index);
    const checkbox = row.locator(SELECTORS.rowCheckbox);

    // Only click if not already selected
    const isChecked = await checkbox.isChecked().catch(() => false);
    if (!isChecked) {
      await checkbox.click();
    }
  }
}

/**
 * Deselect specific table rows by their index
 *
 * Unchecks the row checkboxes at the specified indices.
 *
 * @param page - Playwright Page instance
 * @param rowIndexes - Array of row indices to deselect (0-based)
 */
export async function deselectTableRows(page: Page, rowIndexes: number[]): Promise<void> {
  const rows = page.locator(SELECTORS.tableRow);

  for (const index of rowIndexes) {
    const row = rows.nth(index);
    const checkbox = row.locator(SELECTORS.rowCheckbox);

    // Only click if currently selected
    const isChecked = await checkbox.isChecked().catch(() => false);
    if (isChecked) {
      await checkbox.click();
    }
  }
}

/**
 * Select all rows using the header checkbox
 *
 * @param page - Playwright Page instance
 */
export async function selectAllRows(page: Page): Promise<void> {
  const headerCheckbox = page.locator(SELECTORS.headerCheckbox);

  // Only click if not already checked
  const isChecked = await headerCheckbox.isChecked().catch(() => false);
  if (!isChecked) {
    await headerCheckbox.click();
  }
}

/**
 * Deselect all rows using the header checkbox
 *
 * @param page - Playwright Page instance
 */
export async function deselectAllRows(page: Page): Promise<void> {
  const headerCheckbox = page.locator(SELECTORS.headerCheckbox);

  // Click to deselect if checked
  const isChecked = await headerCheckbox.isChecked().catch(() => false);
  if (isChecked) {
    await headerCheckbox.click();
  }
}

/**
 * Get the count of currently selected rows
 *
 * @param page - Playwright Page instance
 * @returns Number of selected rows
 */
export async function getSelectedRowCount(page: Page): Promise<number> {
  // Try to get from toolbar count first
  const countElement = page.locator(SELECTORS.selectedCount);
  const isVisible = await countElement.isVisible().catch(() => false);

  if (isVisible) {
    const text = await countElement.textContent() || '0';
    const match = text.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  // Fallback: count selected rows
  const selectedRows = page.locator(SELECTORS.selectedRow);
  return await selectedRows.count();
}

/**
 * Click a bulk action button by its action ID
 *
 * @param page - Playwright Page instance
 * @param actionId - The action ID (e.g., 'approve', 'reject', 'delete')
 */
export async function clickBulkAction(page: Page, actionId: string): Promise<void> {
  const toolbar = page.locator(SELECTORS.bulkToolbar);
  await expect(toolbar).toBeVisible();

  const actionButton = toolbar.locator(`[data-testid="bulk-action-${actionId}"]`);
  await expect(actionButton).toBeEnabled();
  await actionButton.click();
}

/**
 * Confirm a pending bulk action in the confirmation dialog
 *
 * @param page - Playwright Page instance
 */
export async function confirmBulkAction(page: Page): Promise<void> {
  const dialog = page.locator(SELECTORS.confirmDialog);
  await expect(dialog).toBeVisible({ timeout: 5000 });

  const confirmButton = dialog.locator(SELECTORS.confirmButton);
  await confirmButton.click();

  // Wait for dialog to close
  await expect(dialog).not.toBeVisible({ timeout: 5000 });
}

/**
 * Cancel a pending bulk action in the confirmation dialog
 *
 * @param page - Playwright Page instance
 */
export async function cancelBulkAction(page: Page): Promise<void> {
  const dialog = page.locator(SELECTORS.confirmDialog);
  await expect(dialog).toBeVisible({ timeout: 5000 });

  const cancelButton = dialog.locator(SELECTORS.cancelButton);
  await cancelButton.click();

  // Wait for dialog to close
  await expect(dialog).not.toBeVisible({ timeout: 5000 });
}

/**
 * Assert the selected count displays a specific number
 *
 * @param page - Playwright Page instance
 * @param expectedCount - Expected number of selected items
 */
export async function expectSelectedCount(page: Page, expectedCount: number): Promise<void> {
  const actualCount = await getSelectedRowCount(page);
  expect(actualCount).toBe(expectedCount);
}

/**
 * Assert specific bulk actions are available
 *
 * @param page - Playwright Page instance
 * @param actionIds - Array of expected action IDs
 */
export async function expectBulkActionsAvailable(page: Page, actionIds: string[]): Promise<void> {
  const toolbar = page.locator(SELECTORS.bulkToolbar);
  await expect(toolbar).toBeVisible();

  for (const actionId of actionIds) {
    const actionButton = toolbar.locator(`[data-testid="bulk-action-${actionId}"]`);
    await expect(actionButton).toBeVisible();
  }
}

/**
 * Assert the header checkbox is in indeterminate state
 *
 * Indeterminate state occurs when some but not all rows are selected.
 *
 * @param page - Playwright Page instance
 */
export async function expectHeaderCheckboxIndeterminate(page: Page): Promise<void> {
  const headerCheckbox = page.locator(SELECTORS.headerCheckbox);
  await expect(headerCheckbox).toHaveAttribute('data-indeterminate', 'true');
}

/**
 * Get row data for selected rows
 *
 * Returns the text content of selected rows for verification.
 *
 * @param page - Playwright Page instance
 * @returns Array of row text contents
 */
export async function getSelectedRowsData(page: Page): Promise<string[]> {
  const selectedRows = page.locator(SELECTORS.selectedRow);
  const count = await selectedRows.count();

  const rowData: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await selectedRows.nth(i).textContent();
    if (text) rowData.push(text.trim());
  }

  return rowData;
}
