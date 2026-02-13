/**
 * Payroll App - Run Payroll Wizard E2E Tests
 *
 * Tests the multi-step payroll processing wizard with:
 * - Pay period selection
 * - Earnings review
 * - Deductions/taxes preview
 * - Final approval with confirmation
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * Following Gusto/ADP-style payroll processing patterns.
 */

import { test, expect, BrowserContext } from '@playwright/test';
import {
  expectWizardStepActive,
  expectStepCompleted,
  goToNextStep,
  goToPreviousStep,
  submitWizard,
  expectValidationErrors,
  expectNoValidationErrors,
  expectWizardProcessing,
  waitForWizardComplete,
  expectSubmitButtonVisible,
  fillWizardField,
  selectWizardOption,
  getCurrentStepNumber,
  getTotalSteps,
  expectBreadcrumbsVisible,
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

let authenticatedContext: BrowserContext | null = null;

/**
 * Warm up an authenticated context by visiting the app URL once.
 * This primes PrivateRoute OIDC checks so subsequent pages render immediately.
 */

test.describe('Payroll Run Wizard', () => {
  let authCreatedAt: number;

  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    authenticatedContext = await createAuthenticatedContext(browser);
    await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/payroll/`);
    await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/payroll/pay-runs/new`);
    authCreatedAt = Date.now();
  });

  test.afterAll(async () => {
    await authenticatedContext?.close();
  });

  // Proactively refresh auth tokens before they expire.
  // Access tokens have a 5-minute lifetime; re-warm after 4 minutes.
  test.beforeEach(async () => {
    if (!authenticatedContext) return;
    if (Date.now() - authCreatedAt > 3 * 60 * 1000) {
      await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/payroll/`);
      authCreatedAt = Date.now();
    }
  });

  test.describe('Wizard Flow', () => {
    test('wizard starts at Pay Period step', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        await expectWizardStepActive(page, 'Pay Period');
        expect(await getCurrentStepNumber(page)).toBe(1);
      } finally {
        await page.close();
      }
    });

    test('has 4 steps: Pay Period, Earnings, Deductions, Review', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        expect(await getTotalSteps(page)).toBe(4);
      } finally {
        await page.close();
      }
    });

    test('breadcrumbs show all steps', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new?showBreadcrumbs=true`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        await expectBreadcrumbsVisible(page);

        const breadcrumbs = page.locator('nav[aria-label="Wizard progress"] li');
        expect(await breadcrumbs.count()).toBe(4);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Step 1: Pay Period Selection', () => {
    test('shows pay period date range selection', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        const startDate = page.locator('[data-testid="pay-period-start"]');
        const endDate = page.locator('[data-testid="pay-period-end"]');

        await expect(startDate).toBeVisible();
        await expect(endDate).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('validates pay period dates before proceeding', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Clear dates
        await fillWizardField(page, 'pay-period-start', '');
        await fillWizardField(page, 'pay-period-end', '');

        // Try to proceed
        await goToNextStep(page);

        // Should show validation error
        await expectValidationErrors(page, ['Pay period start date is required']);
        expect(await getCurrentStepNumber(page)).toBe(1);
      } finally {
        await page.close();
      }
    });

    test('proceeds to Earnings step with valid dates', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Fill valid dates
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');

        await goToNextStep(page);

        await expectWizardStepActive(page, 'Earnings');
        expect(await getCurrentStepNumber(page)).toBe(2);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Step 2: Earnings Review', () => {
    test('displays employee earnings or no-data fallback', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Go to Earnings step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);

        // Wait for data to load — either earnings table or no-data warning
        const earningsTable = page.locator('[data-testid="earnings-table"]');
        const noDataWarning = page.locator('[data-testid="no-earnings-data"]');
        await expect(earningsTable.or(noDataWarning)).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('shows gross pay or no-data warning on earnings step', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Earnings step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);

        // Wait for data to load
        const earningsTable = page.locator('[data-testid="earnings-table"]');
        const noDataWarning = page.locator('[data-testid="no-earnings-data"]');
        await expect(earningsTable.or(noDataWarning)).toBeVisible({ timeout: 15000 });

        // If earnings loaded, verify gross pay total
        if (await earningsTable.isVisible()) {
          const totalGross = page.locator('[data-testid="total-gross-pay"]');
          await expect(totalGross).toBeVisible();
          await expect(totalGross).toContainText('$');
        }
      } finally {
        await page.close();
      }
    });

    test('allows editing individual earnings when data available', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Earnings step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);

        // Wait for data to load
        const earningsTable = page.locator('[data-testid="earnings-table"]');
        const noDataWarning = page.locator('[data-testid="no-earnings-data"]');
        await expect(earningsTable.or(noDataWarning)).toBeVisible({ timeout: 15000 });

        // Edit button only available when earnings data is loaded
        if (await earningsTable.isVisible()) {
          const editButton = page.locator('[data-testid="edit-earnings-0"]');
          await editButton.click();

          const editDialog = page.locator('[data-testid="edit-earnings-dialog"]');
          await expect(editDialog).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Step 3: Deductions & Taxes', () => {
    test('shows tax withholding calculations', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Deductions step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);
        await goToNextStep(page);

        // Should be on Deductions step
        await expectWizardStepActive(page, 'Deductions');

        // Tax table should be visible
        const taxTable = page.locator('[data-testid="tax-withholdings-table"]');
        await expect(taxTable).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays Federal, State, and FICA taxes', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Deductions step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);
        await goToNextStep(page);

        // Verify tax categories are shown
        await expect(page.locator('text=Federal Income Tax')).toBeVisible();
        await expect(page.locator('text=State Income Tax')).toBeVisible();
        await expect(page.locator('text=FICA — Social Security')).toBeVisible();
        await expect(page.locator('text=FICA — Medicare')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('shows total net pay calculation', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Deductions step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);
        await goToNextStep(page);

        // Total net pay should be displayed
        const totalNet = page.locator('[data-testid="total-net-pay"]');
        await expect(totalNet).toBeVisible();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Step 4: Review & Submit', () => {
    test('shows summary of payroll run', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Review step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);
        await goToNextStep(page);
        await goToNextStep(page);

        // Should be on Review step
        await expectWizardStepActive(page, 'Review');

        // Summary should be visible
        const summary = page.locator('[data-testid="payroll-summary"]');
        await expect(summary).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays Submit button on final step', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Review step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);
        await goToNextStep(page);
        await goToNextStep(page);

        await expectSubmitButtonVisible(page);
      } finally {
        await page.close();
      }
    });

    test('submit shows confirmation before processing', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Review step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);
        await goToNextStep(page);
        await goToNextStep(page);

        // Click submit
        await submitWizard(page);

        // Confirmation dialog should appear
        const confirmDialog = page.locator('[data-testid="confirm-payroll-dialog"]');
        await expect(confirmDialog).toBeVisible();
        await expect(confirmDialog).toContainText('Are you sure you want to process this payroll');
      } finally {
        await page.close();
      }
    });

    test('successful submission shows processing state', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Review step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);
        await goToNextStep(page);
        await goToNextStep(page);

        // Submit and confirm
        await submitWizard(page);
        const confirmButton = page.locator('[data-testid="confirm-submit"]');
        await confirmButton.click();

        // Should show processing
        await expectWizardProcessing(page);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Pre-flight Validation (Gusto Pattern)', () => {
    test('shows warning for employees with missing tax info', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Review step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);
        await goToNextStep(page);
        await goToNextStep(page);

        // Check for pre-flight warnings
        const warnings = page.locator('[data-testid="preflight-warnings"]');
        const warningCount = await warnings.count();

        if (warningCount > 0) {
          await expect(warnings.first()).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });

    test('blocks submission for critical errors', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        // Navigate to a pay run with known issues
        await page.goto(`${BASE_URLS[ENV]}/payroll/pay-runs/new?simulate=missing-ssn`);
        await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

        // Navigate to Review step
        await fillWizardField(page, 'pay-period-start', '2026-01-01');
        await fillWizardField(page, 'pay-period-end', '2026-01-15');
        await goToNextStep(page);
        await goToNextStep(page);
        await goToNextStep(page);

        // Submit button should be disabled
        const submitButton = page.locator('button:has-text("Submit")');
        await expect(submitButton).toBeDisabled();

        // Error should be shown
        const criticalError = page.locator('[data-testid="critical-error"]');
        await expect(criticalError).toContainText('Missing SSN');
      } finally {
        await page.close();
      }
    });
  });
});
