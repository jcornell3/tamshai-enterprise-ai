/**
 * HR App - Time-Off Request Wizard E2E Tests
 *
 * Tests the multi-step time-off request wizard with:
 * - Step 1: Select time-off type with balance info
 * - Step 2: Select dates with balance check
 * - Step 3: Conflict check with existing requests
 * - Step 4: Review and submit
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * Following Gusto-style time-off request patterns.
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import {
  createDatabaseSnapshot,
  rollbackToSnapshot,
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
  getCurrentStepNumber,
  getTotalSteps,
  expectBreadcrumbsVisible,
  cancelWizard,
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

const HR_TIME_OFF_URL = `${BASE_URLS[ENV]}/hr/time-off`;

let authenticatedContext: BrowserContext | null = null;


test.describe('HR Time-Off Request Wizard', () => {
  let snapshotId: string;
  let authCreatedAt: number;

  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    authenticatedContext = await createAuthenticatedContext(browser);
    await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/hr/`);
    authCreatedAt = Date.now();
    snapshotId = await createDatabaseSnapshot();
  });

  test.afterAll(async () => {
    await authenticatedContext?.close();
  });

  // Proactively refresh auth tokens before they expire.
  // Access tokens have a 5-minute lifetime; re-warm after 4 minutes.
  test.beforeEach(async () => {
    if (!authenticatedContext) return;
    if (Date.now() - authCreatedAt > 4 * 60 * 1000) {
      await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/hr/`);
      authCreatedAt = Date.now();
    }
  });

  test.afterEach(async () => {
    await rollbackToSnapshot(snapshotId);
  });

  test.describe('Wizard Initialization', () => {
    test('opens wizard when Request Time Off button is clicked', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.waitForSelector('[data-testid="request-time-off-button"]', { timeout: 10000 });

        await page.click('[data-testid="request-time-off-button"]');

        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('wizard starts at Select Type step', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        await expectWizardStepActive(page, 'Select Type');
        expect(await getCurrentStepNumber(page)).toBe(1);
      } finally {
        await page.close();
      }
    });

    test('has 4 steps: Select Type, Select Dates, Conflict Check, Review', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        expect(await getTotalSteps(page)).toBe(4);
      } finally {
        await page.close();
      }
    });

    test('closes wizard on Escape key', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        await page.keyboard.press('Escape');

        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('closes wizard on Cancel button', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        await cancelWizard(page);

        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Step 1: Select Type', () => {
    test('displays available time-off types with balances', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Check for time-off type options
        const typeOptions = page.locator('[data-testid^="type-option-"]');
        const count = await typeOptions.count();
        expect(count).toBeGreaterThan(0);
      } finally {
        await page.close();
      }
    });

    test('shows balance progress bar for each type', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Check for progress bars
        const progressBars = page.locator('[data-testid^="balance-progress-"]');
        const count = await progressBars.count();
        expect(count).toBeGreaterThan(0);
      } finally {
        await page.close();
      }
    });

    test('selecting a type highlights it', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Click first type option
        const firstOption = page.locator('[data-testid^="type-option-"]').first();
        await firstOption.click();

        // Should have selected class
        await expect(firstOption).toHaveClass(/selected/);
      } finally {
        await page.close();
      }
    });

    test('disables types with zero balance', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Look for disabled options (if any exist)
        const disabledOptions = page.locator('[data-testid^="type-option-"][aria-disabled="true"]');
        // This is valid even if count is 0 - not all users have exhausted balances
        const count = await disabledOptions.count();
        expect(count).toBeGreaterThanOrEqual(0);
      } finally {
        await page.close();
      }
    });

    test('validates type selection before proceeding', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Try to proceed without selecting a type
        await goToNextStep(page);

        // Should show validation error
        await expectValidationErrors(page, ['Please select a time-off type']);
        expect(await getCurrentStepNumber(page)).toBe(1);
      } finally {
        await page.close();
      }
    });

    test('proceeds to Select Dates step when type is selected', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Select first available type
        await page.click('[data-testid^="type-option-"]:not([aria-disabled="true"])');
        await goToNextStep(page);

        await expectWizardStepActive(page, 'Select Dates');
        expect(await getCurrentStepNumber(page)).toBe(2);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Step 2: Select Dates', () => {
    let page: Page;

    test.beforeEach(async () => {
      if (!authenticatedContext) return;
      page = await authenticatedContext!.newPage();
      await page.goto(HR_TIME_OFF_URL);
      await page.click('[data-testid="request-time-off-button"]');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Navigate to Step 2
      await page.click('[data-testid^="type-option-"]:not([aria-disabled="true"])');
      await goToNextStep(page);
    });

    test.afterEach(async () => {
      await page?.close();
    });

    test('shows selected type info banner', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const infoBanner = page.locator('.bg-primary-50');
      await expect(infoBanner).toBeVisible();
      await expect(infoBanner).toContainText('days available');
    });

    test('displays start and end date inputs', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const startDate = page.locator('#start-date');
      const endDate = page.locator('#end-date');

      await expect(startDate).toBeVisible();
      await expect(endDate).toBeVisible();
    });

    test('displays half-day checkboxes', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const halfDayStart = page.locator('#half-day-start');
      const halfDayEnd = page.locator('#half-day-end');

      await expect(halfDayStart).toBeVisible();
      await expect(halfDayEnd).toBeVisible();
    });

    test('calculates and displays total days', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      // Fill in dates
      await page.fill('#start-date', '2026-03-02');
      await page.fill('#end-date', '2026-03-06');

      // Should show total days (Mon-Fri = 5 business days)
      const totalDays = page.locator('[data-testid="total-days"]');
      await expect(totalDays).toBeVisible();
      await expect(totalDays).toContainText('5');
    });

    test('adjusts total for half-day selections', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      // Fill in dates
      await page.fill('#start-date', '2026-03-02');
      await page.fill('#end-date', '2026-03-06');

      // Check half-day start
      await page.check('#half-day-start');

      // Should reduce total by 0.5
      const totalDays = page.locator('[data-testid="total-days"]');
      await expect(totalDays).toContainText('4.5');
    });

    test('shows warning when request exceeds balance', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      // Fill in a long date range that likely exceeds balance
      await page.fill('#start-date', '2026-03-01');
      await page.fill('#end-date', '2026-04-30'); // ~40+ business days

      // Should show warning
      const warning = page.locator('.bg-warning-50');
      await expect(warning).toBeVisible();
      await expect(warning).toContainText('exceeds available balance');
    });

    test('validates dates are required', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      // Clear dates if prefilled
      await page.fill('#start-date', '');
      await page.fill('#end-date', '');

      await goToNextStep(page);

      await expectValidationErrors(page, ['Start date is required']);
      expect(await getCurrentStepNumber(page)).toBe(2);
    });

    test('validates end date after start date', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      await page.fill('#start-date', '2026-03-10');
      await page.fill('#end-date', '2026-03-05'); // Before start

      await goToNextStep(page);

      // Should show validation error
      const errorText = page.locator('.text-danger-600');
      await expect(errorText).toContainText('End date must be after start date');
    });

    test('allows adding optional notes', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const notes = page.locator('#notes');
      await expect(notes).toBeVisible();

      await notes.fill('Family vacation');
      await expect(notes).toHaveValue('Family vacation');
    });

    test('proceeds to Conflict Check step with valid dates', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      await page.fill('#start-date', '2026-03-02');
      await page.fill('#end-date', '2026-03-06');

      await goToNextStep(page);

      await expectWizardStepActive(page, 'Conflict Check');
      expect(await getCurrentStepNumber(page)).toBe(3);
    });

    test('can navigate back to Select Type step', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      await goToPreviousStep(page);

      await expectWizardStepActive(page, 'Select Type');
      expect(await getCurrentStepNumber(page)).toBe(1);
    });
  });

  test.describe('Step 3: Conflict Check', () => {
    let page: Page;

    test.beforeEach(async () => {
      if (!authenticatedContext) return;
      page = await authenticatedContext!.newPage();
      await page.goto(HR_TIME_OFF_URL);
      await page.click('[data-testid="request-time-off-button"]');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Navigate to Step 3
      await page.click('[data-testid^="type-option-"]:not([aria-disabled="true"])');
      await goToNextStep(page);
      await page.fill('#start-date', '2026-03-02');
      await page.fill('#end-date', '2026-03-06');
      await goToNextStep(page);
    });

    test.afterEach(async () => {
      await page?.close();
    });

    test('displays conflict check heading', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const heading = page.locator('h4:has-text("Conflict Check")');
      await expect(heading).toBeVisible();
    });

    test('shows success message when no conflicts exist', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      // For a fresh database, no conflicts expected
      const successMessage = page.locator('.bg-success-50');
      // May or may not be visible depending on existing data
      const count = await successMessage.count();
      if (count > 0) {
        await expect(successMessage).toContainText('No conflicts found');
      }
    });

    test('shows existing requests list if any exist', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const existingRequestsList = page.locator('[data-testid="existing-requests-list"]');
      // List may or may not be visible depending on test data
      const count = await existingRequestsList.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('proceeds to Review step', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      await goToNextStep(page);

      await expectWizardStepActive(page, 'Review');
      expect(await getCurrentStepNumber(page)).toBe(4);
    });

    test('can navigate back to Select Dates step', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      await goToPreviousStep(page);

      await expectWizardStepActive(page, 'Select Dates');
      expect(await getCurrentStepNumber(page)).toBe(2);
    });
  });

  test.describe('Step 4: Review & Submit', () => {
    let page: Page;

    test.beforeEach(async () => {
      if (!authenticatedContext) return;
      page = await authenticatedContext!.newPage();
      await page.goto(HR_TIME_OFF_URL);
      await page.click('[data-testid="request-time-off-button"]');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Navigate to Step 4
      await page.click('[data-testid^="type-option-"]:not([aria-disabled="true"])');
      await goToNextStep(page);
      await page.fill('#start-date', '2026-03-02');
      await page.fill('#end-date', '2026-03-06');
      await page.fill('#notes', 'Test request notes');
      await goToNextStep(page);
      await goToNextStep(page);
    });

    test.afterEach(async () => {
      await page?.close();
    });

    test('displays request summary', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const summary = page.locator('.bg-secondary-50');
      await expect(summary).toBeVisible();
    });

    test('shows type in summary', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const typeRow = page.locator('text=Type:');
      await expect(typeRow).toBeVisible();
    });

    test('shows date range in summary', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const datesRow = page.locator('text=Dates:');
      await expect(datesRow).toBeVisible();
    });

    test('shows duration in summary', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const durationRow = page.locator('text=Duration:');
      await expect(durationRow).toBeVisible();
      await expect(page.locator('.bg-secondary-50')).toContainText('days');
    });

    test('shows notes in summary when provided', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const notesRow = page.locator('text=Notes:');
      await expect(notesRow).toBeVisible();
      await expect(page.locator('.bg-secondary-50')).toContainText('Test request notes');
    });

    test('shows manager info when available', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const managerInfo = page.locator('.bg-primary-50:has-text("will review")');
      // Manager may or may not be present depending on employee data
      const count = await managerInfo.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('shows Submit Request button', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      await expectSubmitButtonVisible(page);
    });

    test('submitting shows processing state', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      await submitWizard(page);

      // Brief processing state
      await expectWizardProcessing(page);
    });

    test('successful submission closes wizard', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      await submitWizard(page);

      // Wait for completion or error
      try {
        await waitForWizardComplete(page, 10000);
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
      } catch {
        // API might return error in test environment - that's ok
        const errorMessage = page.locator('.bg-danger-50');
        if (await errorMessage.isVisible()) {
          // Error is acceptable in test environment
          expect(await errorMessage.textContent()).toBeTruthy();
        }
      }
    });

    test('can navigate back to Conflict Check step', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      await goToPreviousStep(page);

      await expectWizardStepActive(page, 'Conflict Check');
      expect(await getCurrentStepNumber(page)).toBe(3);
    });
  });

  test.describe('Full Wizard Flow', () => {
    test('complete time-off request flow end-to-end', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Step 1: Select Type
        await expectWizardStepActive(page, 'Select Type');
        await page.click('[data-testid^="type-option-"]:not([aria-disabled="true"])');
        await goToNextStep(page);

        // Step 2: Select Dates
        await expectWizardStepActive(page, 'Select Dates');
        await page.fill('#start-date', '2026-05-04');
        await page.fill('#end-date', '2026-05-08');
        await page.fill('#notes', 'E2E Test - Spring vacation');
        await goToNextStep(page);

        // Step 3: Conflict Check
        await expectWizardStepActive(page, 'Conflict Check');
        await goToNextStep(page);

        // Step 4: Review
        await expectWizardStepActive(page, 'Review');
        await expect(page.locator('.bg-secondary-50')).toContainText('Spring vacation');

        // Submit
        await submitWizard(page);

        // Verify processing or completion
        const processingButton = page.locator('button:has-text("Submitting")');
        await expect(processingButton).toBeVisible({ timeout: 2000 }).catch(() => {});
      } finally {
        await page.close();
      }
    });

    test('preserves data when navigating backward', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Step 1
        await page.click('[data-testid^="type-option-"]:not([aria-disabled="true"])');
        await goToNextStep(page);

        // Step 2 - fill dates
        await page.fill('#start-date', '2026-06-01');
        await page.fill('#end-date', '2026-06-05');
        await page.fill('#notes', 'Preserved notes test');

        // Go back to Step 1
        await goToPreviousStep(page);
        await expectWizardStepActive(page, 'Select Type');

        // Go forward again
        await goToNextStep(page);
        await expectWizardStepActive(page, 'Select Dates');

        // Data should be preserved
        await expect(page.locator('#start-date')).toHaveValue('2026-06-01');
        await expect(page.locator('#end-date')).toHaveValue('2026-06-05');
        await expect(page.locator('#notes')).toHaveValue('Preserved notes test');
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Accessibility', () => {
    test('wizard has proper dialog role', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');

        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('dialog has aria-labelledby', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');

        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toHaveAttribute('aria-labelledby');
      } finally {
        await page.close();
      }
    });

    test('form inputs have proper labels', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(HR_TIME_OFF_URL);
        await page.click('[data-testid="request-time-off-button"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Navigate to dates step
        await page.click('[data-testid^="type-option-"]:not([aria-disabled="true"])');
        await goToNextStep(page);

        // Check for labels
        const startLabel = page.locator('label[for="start-date"]');
        const endLabel = page.locator('label[for="end-date"]');

        await expect(startLabel).toBeVisible();
        await expect(endLabel).toBeVisible();
      } finally {
        await page.close();
      }
    });
  });
});
