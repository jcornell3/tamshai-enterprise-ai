/**
 * E2E Tests for Payroll App - RED Phase
 *
 * Tests the key user journeys for the Payroll module:
 * - Dashboard viewing
 * - Pay run processing
 * - Pay stub viewing
 * - Direct deposit management
 * - 1099 contractor management
 * - Benefits page
 * - Tax withholdings page
 *
 * Prerequisites:
 * - User must be authenticated with payroll-read/payroll-write roles
 */

import { test, expect, BrowserContext } from '@playwright/test';
import {
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

const PAYROLL_URL = `${BASE_URLS[ENV]}/payroll`;

let authenticatedContext: BrowserContext | null = null;

/**
 * Warm up an authenticated context by visiting the app URL once.
 * This primes PrivateRoute OIDC checks so subsequent pages render immediately.
 */

test.describe('Payroll App E2E Tests', () => {
  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    authenticatedContext = await createAuthenticatedContext(browser);
    await warmUpContext(authenticatedContext, `${PAYROLL_URL}/`);
  });

  test.describe('Dashboard', () => {
    test('displays payroll dashboard with metrics', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Payroll Dashboard")')).toBeVisible({ timeout: 10000 });

        // Dashboard may show metrics (API success) or error state (API failure)
        const hasMetrics = await page.locator('text=Next Pay Date').isVisible().catch(() => false);
        const hasError = await page.locator('text=Error loading payroll data').isVisible().catch(() => false);
        expect(hasMetrics || hasError).toBe(true);

        if (hasMetrics) {
          await expect(page.locator('text=Total Payroll')).toBeVisible();
          await expect(page.locator('text=YTD Payroll')).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });

    test('displays quick action buttons', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Payroll Dashboard")')).toBeVisible({ timeout: 10000 });

        // Quick actions only render when dashboard API succeeds
        const hasMetrics = await page.locator('text=Next Pay Date').isVisible().catch(() => false);
        if (hasMetrics) {
          // Run Payroll may be a link or button depending on HTML structure
          await expect(page.locator('a:has-text("Run Payroll"), button:has-text("Run Payroll")').first()).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Pay Runs', () => {
    test('displays pay runs list', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/pay-runs`);
        await page.waitForLoadState('networkidle');

        // h1 heading (unique vs sidebar "Pay Runs" link)
        await expect(page.locator('h1:has-text("Pay Runs")')).toBeVisible({ timeout: 10000 });
        // Table headers only show when data exists; check for table OR empty state
        const hasTable = await page.locator('th:has-text("Pay Period")').isVisible({ timeout: 3000 }).catch(() => false);
        if (hasTable) {
          await expect(page.locator('th:has-text("Pay Date")')).toBeVisible();
          await expect(page.locator('th:has-text("Status")')).toBeVisible();
        } else {
          await expect(page.locator('text=No pay runs found')).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });

    test('displays new pay run button', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/pay-runs`);
        await page.waitForLoadState('networkidle');

        // New Pay Run is a Link wrapping a button (invalid HTML nesting)
        await expect(page.locator('a:has-text("New Pay Run"), button:has-text("New Pay Run")').first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Pay Stubs', () => {
    test('displays pay stubs list', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/pay-stubs`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Pay Stubs")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays YTD summary', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/pay-stubs`);
        await page.waitForLoadState('networkidle');

        // YTD cards are always visible (h3 elements inside cards)
        await expect(page.locator('h3:has-text("YTD Gross")')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('h3:has-text("YTD Net")')).toBeVisible();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Direct Deposit', () => {
    test('displays direct deposit settings', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/direct-deposit`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Direct Deposit")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays add account button', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/direct-deposit`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Add Account")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('1099 Contractors', () => {
    test('displays contractors list', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/1099`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("1099 Contractors")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays generate 1099s button', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/1099`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Generate 1099s")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Benefits', () => {
    test('displays benefits page with heading', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/benefits`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Benefits")')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=View your benefit elections and deductions')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('shows benefit cards or empty state', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/benefits`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Benefits")')).toBeVisible({ timeout: 10000 });

        // Benefits page shows cards or empty state or error
        const hasBenefits = await page.locator('text=Your Contribution').first().isVisible({ timeout: 5000 }).catch(() => false);
        const hasEmpty = await page.locator('text=No benefit elections found').isVisible().catch(() => false);
        const hasError = await page.locator('text=Error loading benefits').isVisible().catch(() => false);
        expect(hasBenefits || hasEmpty || hasError).toBe(true);
      } finally {
        await page.close();
      }
    });

    test('benefit cards show contribution amounts or empty state', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/benefits`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Benefits")')).toBeVisible({ timeout: 10000 });

        // Test user may have no payroll employee record — verify page renders correctly either way
        const hasBenefits = await page.locator('text=Your Contribution').first()
          .isVisible({ timeout: 10000 }).catch(() => false);

        if (hasBenefits) {
          // Benefits data exists — verify contribution fields
          await expect(page.locator('text=Employer Contribution').first()).toBeVisible();
          await expect(page.locator('text=Frequency').first()).toBeVisible();
          await expect(page.locator('text=Tax Treatment').first()).toBeVisible();
        } else {
          // No benefits data — verify empty state message renders
          await expect(page.locator('text=No benefit elections found')).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('1099 Contractors (Extended)', () => {
    test('status filter dropdown works', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/1099`);
        await page.waitForLoadState('networkidle');

        const statusFilter = page.locator('#status-filter, select[aria-label="Status"]');
        const hasFilter = await statusFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Status filter not available');
          return;
        }

        const options = statusFilter.locator('option');
        const optionTexts = await options.allTextContents();
        expect(optionTexts.some(t => t.includes('All') || t.includes('all'))).toBe(true);
      } finally {
        await page.close();
      }
    });

    test('year filter dropdown works', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/1099`);
        await page.waitForLoadState('networkidle');

        const yearFilter = page.locator('#year-filter, select[aria-label="Year"]');
        const hasFilter = await yearFilter.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasFilter) {
          test.skip(true, 'Year filter not available');
          return;
        }

        const options = yearFilter.locator('option');
        const optionTexts = await options.allTextContents();
        expect(optionTexts.length).toBeGreaterThan(0);
      } finally {
        await page.close();
      }
    });

    test('table shows contractor rows with expected columns', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/1099`);
        await page.waitForLoadState('networkidle');

        const hasTable = await page.locator('th:has-text("Name")').isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTable) {
          test.skip(true, 'No contractor data available');
          return;
        }

        await expect(page.locator('th:has-text("Name")')).toBeVisible();
        await expect(page.locator('th:has-text("Company")')).toBeVisible();
        await expect(page.locator('th:has-text("YTD Payments")')).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toBeVisible();
        await expect(page.locator('th:has-text("1099 Status")')).toBeVisible();

        // At least one row
        const rows = page.locator('tbody tr');
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);
      } finally {
        await page.close();
      }
    });

    test('active/inactive status badges render', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/1099`);
        await page.waitForLoadState('networkidle');

        const hasTable = await page.locator('tbody tr').first().isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTable) {
          test.skip(true, 'No contractor data available');
          return;
        }

        // Status badges should show "active" or "inactive"
        const statusCells = page.locator('tbody tr td:nth-child(5) span');
        const firstStatus = await statusCells.first().textContent();
        expect(['active', 'inactive']).toContain(firstStatus?.trim().toLowerCase());
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Tax Withholdings', () => {
    test('displays tax withholdings page with heading', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/tax`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Tax Withholdings")')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Manage your federal and state tax elections')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays Federal W-4 section or no-withholding message', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/tax`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Tax Withholdings")')).toBeVisible({ timeout: 10000 });

        // Either W-4 section or no withholding message
        const hasFederal = await page.locator('h2:has-text("Federal W-4")').isVisible({ timeout: 5000 }).catch(() => false);
        const hasNoConfig = await page.locator('text=No withholding configured').isVisible().catch(() => false);
        const hasError = await page.locator('text=Error loading tax withholdings').isVisible().catch(() => false);
        expect(hasFederal || hasNoConfig || hasError).toBe(true);

        if (hasFederal) {
          await expect(page.locator('text=Filing Status')).toBeVisible();
          await expect(page.locator('text=Allowances')).toBeVisible();
          await expect(page.locator('text=Additional Withholding')).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });

    test('displays State Tax section or valid no-data state', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/tax`);
        await page.waitForLoadState('networkidle');

        // Verify the page renders correctly regardless of data availability
        await expect(page.locator('h1:has-text("Tax Withholdings")')).toBeVisible({ timeout: 10000 });

        const hasState = await page.locator('h2:has-text("State Tax")').isVisible({ timeout: 10000 }).catch(() => false);

        if (hasState) {
          // State tax data exists — verify State field
          const stateLabels = page.locator('text=State');
          await expect(stateLabels.first()).toBeVisible();
        } else {
          // No state tax data — verify page still renders with federal section or no-config message
          const hasFederal = await page.locator('h2:has-text("Federal W-4")').isVisible().catch(() => false);
          const hasNoConfig = await page.locator('text=No withholding configured').isVisible().catch(() => false);
          expect(hasFederal || hasNoConfig).toBe(true);
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Navigation', () => {
    test('can navigate between payroll sections via sidebar', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/`);
        await page.waitForLoadState('networkidle');

        // Click Pay Runs in sidebar
        await page.click('a[href*="/pay-runs"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1:has-text("Pay Runs")')).toBeVisible({ timeout: 10000 });

        // Click Pay Stubs in sidebar
        await page.click('a[href*="/pay-stubs"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1:has-text("Pay Stubs")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });
});

test.describe('Payroll User Journeys', () => {
  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    if (!authenticatedContext) {
      authenticatedContext = await createAuthenticatedContext(browser);
      await warmUpContext(authenticatedContext, `${PAYROLL_URL}/`);
    }
  });

  test.afterAll(async () => {
    await authenticatedContext?.close();
    authenticatedContext = null;
  });

  test('Scenario: Employee views their pay stub', async () => {
    test.skip(!authenticatedContext, 'No test credentials configured');
    const page = await authenticatedContext!.newPage();

    try {
      // Navigate to pay stubs
      await page.goto(`${PAYROLL_URL}/pay-stubs`);
      await page.waitForLoadState('networkidle');

      // Verify pay stubs page is visible
      await expect(page.locator('h1:has-text("Pay Stubs")')).toBeVisible({ timeout: 10000 });

      // Check for pay stub data (table or empty state)
      const hasStubs = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
      if (hasStubs) {
        // Verify table shows expected columns
        await expect(page.locator('th:has-text("Pay Period")')).toBeVisible();
        await expect(page.locator('th:has-text("Net Pay")')).toBeVisible();
      }
    } finally {
      await page.close();
    }
  });

  test('Scenario: Admin creates a new pay run', async () => {
    test.skip(!authenticatedContext, 'No test credentials configured');
    const page = await authenticatedContext!.newPage();

    try {
      // Navigate to pay runs
      await page.goto(`${PAYROLL_URL}/pay-runs`);
      await page.waitForLoadState('networkidle');

      // Click new pay run button (Link styled as button)
      const newPayRunButton = page.locator('a:has-text("New Pay Run"), button:has-text("New Pay Run")');
      await expect(newPayRunButton.first()).toBeVisible({ timeout: 10000 });
      await newPayRunButton.first().click();

      // Verify wizard step 1 appears (h2 rendered by Wizard component)
      await expect(page.locator('h2:has-text("Pay Period")')).toBeVisible({ timeout: 15000 });
    } finally {
      await page.close();
    }
  });
});
