/**
 * E2E Tests for Tax App
 *
 * Tests the key user journeys for the Tax module:
 * - Dashboard viewing with compliance status
 * - Sales tax rates lookup
 * - Quarterly tax estimates management
 * - Annual filings (1099s, W-2s) tracking
 * - State tax registrations
 * - Audit log viewing
 * - AI query for tax questions
 *
 * Uses 2 auth contexts to avoid TOTP code reuse (30s window):
 *   Block 1: All component tests (~26 tests, ~16s total)
 *   Block 2: User journey tests (~5 tests, ~3s total)
 * Both are well within the 5-minute JWT TTL.
 *
 * Prerequisites:
 * - User must be authenticated with tax-read/tax-write roles
 */

import { test, expect, BrowserContext } from '@playwright/test';
import {
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

const TAX_URL = `${BASE_URLS[ENV]}/tax`;

/**
 * Prime the auth context by visiting the app URL.
 * The first page load in a new context triggers OIDC session
 * establishment via PrivateRoute. Doing this in beforeAll ensures
 * all test pages have a fully initialized auth session.
 */

// --- Block 1: All component/feature tests (single auth context) ---

test.describe('Tax App E2E Tests', () => {
  let ctx: BrowserContext | null = null;
  let authCreatedAt: number;

  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    ctx = await createAuthenticatedContext(browser);
    await warmUpContext(ctx, `${TAX_URL}/`);
    authCreatedAt = Date.now();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  // Proactively refresh auth tokens before they expire.
  // Access tokens have a 5-minute lifetime; re-warm after 4 minutes.
  test.beforeEach(async () => {
    if (!ctx) return;
    if (Date.now() - authCreatedAt > 4 * 60 * 1000) {
      await warmUpContext(ctx, `${TAX_URL}/`);
      authCreatedAt = Date.now();
    }
  });

  test.describe('Dashboard', () => {
    test('displays tax dashboard with compliance status', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Tax Dashboard")')).toBeVisible({ timeout: 15000 });
        // Metrics only render when API returns data
        const hasData = await page.locator('h3:has-text("Total Tax Liability")').isVisible({ timeout: 5000 }).catch(() => false);
        if (hasData) {
          await expect(page.locator('h3:has-text("Paid to Date")')).toBeVisible();
          await expect(page.locator('h3:has-text("Remaining Balance")')).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });

    test('displays compliance status badge', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Tax Dashboard")')).toBeVisible({ timeout: 15000 });
        // Badge only shows when API returns data
        const complianceStatus = page.locator('text=/Compliant|At Risk|Non-Compliant/');
        await expect(complianceStatus.first()).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('displays upcoming deadlines section', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Tax Dashboard")')).toBeVisible({ timeout: 15000 });
        // Deadlines section only renders when API data loads
        await expect(page.locator('h2:has-text("Upcoming Deadlines")')).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('displays state tax breakdown', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:has-text("State Tax Breakdown")')).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Sales Tax Rates', () => {
    test('displays sales tax rates table', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/sales-tax`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Sales Tax Rates")')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('th:has-text("State")')).toBeVisible();
        await expect(page.locator('th:has-text("Base Rate")')).toBeVisible();
        await expect(page.locator('th:has-text("Combined Rate")')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays state filter or search', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/sales-tax`);
        await page.waitForLoadState('networkidle');

        const searchOrFilter = page.locator('input[placeholder*="Search"], select, input[type="search"]');
        await expect(searchOrFilter.first()).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Quarterly Estimates', () => {
    test('displays quarterly estimates list', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/quarterly`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Quarterly Tax Estimates")')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('th:has-text("Quarter")')).toBeVisible();
        await expect(page.locator('th:has-text("Federal")')).toBeVisible();
        await expect(page.locator('th:has-text("State")')).toBeVisible();
        await expect(page.locator('th:has-text("Total")')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays due dates for estimates', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/quarterly`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('th:has-text("Due Date")')).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('displays payment status for estimates', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/quarterly`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('th:has-text("Status")')).toBeVisible({ timeout: 15000 });
        // Status badges only appear when table has data rows
        const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasRows) {
          const statusBadge = page.locator('text=/Paid|Pending|Overdue|Partial/i');
          await expect(statusBadge.first()).toBeVisible({ timeout: 10000 });
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Annual Filings', () => {
    test('displays annual filings list', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/filings`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Annual Tax Filings")')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('th:has-text("Year")')).toBeVisible();
        await expect(page.locator('th:has-text("Type")')).toBeVisible();
        await expect(page.locator('th:has-text("Entity")')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays filing types (1099, W-2, etc)', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/filings`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Annual Tax Filings")')).toBeVisible({ timeout: 15000 });
        // Filing type badges only appear when table has data rows
        const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasRows) {
          const filingTypes = page.locator('text=/1099|W-2|941/');
          await expect(filingTypes.first()).toBeVisible({ timeout: 10000 });
        }
      } finally {
        await page.close();
      }
    });

    test('displays filing status', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/filings`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('th:has-text("Status")')).toBeVisible({ timeout: 15000 });
        // Status badges only appear when table has data rows
        const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasRows) {
          const statusBadge = page.locator('text=/Filed|Accepted|Draft|Amended/i');
          await expect(statusBadge.first()).toBeVisible({ timeout: 10000 });
        }
      } finally {
        await page.close();
      }
    });

    test('displays confirmation numbers for filed returns', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/filings`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('th:has-text("Confirmation")')).toBeVisible({ timeout: 15000 });
        // Confirmation numbers only appear when table has data rows
        const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasRows) {
          const confirmationNumber = page.locator('text=/IRS-|SSA-|CONF-/');
          await expect(confirmationNumber.first()).toBeVisible({ timeout: 10000 });
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('State Registrations', () => {
    test('displays state registrations list', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/registrations`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("State Tax Registrations")')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('th:has-text("State")')).toBeVisible();
        await expect(page.locator('th:has-text("Type")')).toBeVisible();
        await expect(page.locator('th:has-text("Registration")')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays registration types', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/registrations`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("State Tax Registrations")')).toBeVisible({ timeout: 15000 });
        const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasRows) {
          const regTypes = page.locator('text=/Sales Tax|Income Tax|Franchise Tax/i');
          await expect(regTypes.first()).toBeVisible({ timeout: 10000 });
        }
      } finally {
        await page.close();
      }
    });

    test('displays registration status', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/registrations`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('th:has-text("Status")')).toBeVisible({ timeout: 15000 });
        const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasRows) {
          const statusBadge = page.locator('text=/Active|Pending|Expired/i');
          await expect(statusBadge.first()).toBeVisible({ timeout: 10000 });
        }
      } finally {
        await page.close();
      }
    });

    test('displays filing frequency', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/registrations`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('th:has-text("Filing Frequency")')).toBeVisible({ timeout: 15000 });
        const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasRows) {
          const frequency = page.locator('text=/Monthly|Quarterly|Annually/i');
          await expect(frequency.first()).toBeVisible({ timeout: 10000 });
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Audit Log', () => {
    test('displays audit log entries', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/audit-log`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Audit Log")')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('th:has-text("Timestamp")')).toBeVisible();
        await expect(page.locator('th:has-text("Action")')).toBeVisible();
        await expect(page.locator('th:has-text("User")')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays action types', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/audit-log`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Audit Log")')).toBeVisible({ timeout: 15000 });
        const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasRows) {
          const actionTypes = page.locator('text=/Create|Update|Submit|Approve/i');
          await expect(actionTypes.first()).toBeVisible({ timeout: 10000 });
        }
      } finally {
        await page.close();
      }
    });

    test('displays entity types', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/audit-log`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('th:has-text("Entity Type")')).toBeVisible({ timeout: 15000 });
        const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasRows) {
          const entityTypes = page.locator('text=/Filing|Estimate|Registration/i');
          await expect(entityTypes.first()).toBeVisible({ timeout: 10000 });
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('AI Query', () => {
    test('displays AI query interface', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/ai-query`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("AI Tax Assistant")')).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('displays query input textarea', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/ai-query`);
        await page.waitForLoadState('networkidle');

        const textarea = page.locator('textarea, input[type="text"]');
        await expect(textarea.first()).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('displays submit button', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/ai-query`);
        await page.waitForLoadState('networkidle');

        const submitButton = page.locator('button:has-text("Ask"), button:has-text("Submit"), button:has-text("Send")');
        await expect(submitButton.first()).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('displays example queries', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/ai-query`);
        await page.waitForLoadState('networkidle');

        // Example query buttons contain text like "Quarterly estimate", "sales tax rate"
        const exampleButton = page.locator('button').filter({ hasText: /estimate|tax rate|deadline|filing/i });
        await expect(exampleButton.first()).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Navigation', () => {
    test('can navigate between tax sections via sidebar', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/`);
        await page.waitForLoadState('networkidle');

        // Click Sales Tax in sidebar using href selector
        await page.click('a[href*="/sales-tax"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1:has-text("Sales Tax Rates")')).toBeVisible({ timeout: 15000 });

        // Click Quarterly Estimates in sidebar
        await page.click('a[href*="/quarterly"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1:has-text("Quarterly Tax Estimates")')).toBeVisible({ timeout: 15000 });

        // Click Annual Filings in sidebar
        await page.click('a[href*="/filings"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1:has-text("Annual Tax Filings")')).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('displays sign out button', async () => {
      test.skip(!ctx, 'No test credentials configured');
      const page = await ctx!.newPage();

      try {
        await page.goto(`${TAX_URL}/`);
        await page.waitForLoadState('networkidle');

        // Layout header has Sign Out button
        await expect(page.locator('text=Sign Out')).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });
  });
});

// --- Block 2: User Journeys (reuses shared auth context) ---

let sharedJourneyContext: BrowserContext | null = null;

test.describe('Tax User Journeys', () => {
  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    if (!sharedJourneyContext) {
      sharedJourneyContext = await createAuthenticatedContext(browser);
      await warmUpContext(sharedJourneyContext, `${TAX_URL}/`);
    }
  });

  test.afterAll(async () => {
    await sharedJourneyContext?.close();
  });

  test('Scenario: Finance user reviews quarterly tax estimates', async () => {
    test.skip(!sharedJourneyContext, 'No test credentials configured');
    const page = await sharedJourneyContext!.newPage();

    try {
      await page.goto(`${TAX_URL}/quarterly`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1:has-text("Quarterly Tax Estimates")')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('th:has-text("Federal")')).toBeVisible();
      await expect(page.locator('th:has-text("State")')).toBeVisible();
      await expect(page.locator('th:has-text("Due Date")')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('Scenario: Tax accountant checks annual filings status', async () => {
    test.skip(!sharedJourneyContext, 'No test credentials configured');
    const page = await sharedJourneyContext!.newPage();

    try {
      await page.goto(`${TAX_URL}/filings`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1:has-text("Annual Tax Filings")')).toBeVisible({ timeout: 15000 });
      // Check for filing types in data rows (conditional on data availability)
      const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
      if (hasRows) {
        await expect(page.locator('text=/1099/').first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=/W-2/').first()).toBeVisible({ timeout: 10000 });
      }
    } finally {
      await page.close();
    }
  });

  test('Scenario: Compliance officer reviews audit log', async () => {
    test.skip(!sharedJourneyContext, 'No test credentials configured');
    const page = await sharedJourneyContext!.newPage();

    try {
      await page.goto(`${TAX_URL}/audit-log`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1:has-text("Audit Log")')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('th:has-text("User")')).toBeVisible();
      await expect(page.locator('th:has-text("Timestamp")')).toBeVisible();
      await expect(page.locator('th:has-text("Action")')).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('Scenario: User asks AI about sales tax rates', async () => {
    test.skip(!sharedJourneyContext, 'No test credentials configured');
    const page = await sharedJourneyContext!.newPage();

    try {
      await page.goto(`${TAX_URL}/ai-query`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1:has-text("AI Tax Assistant")')).toBeVisible({ timeout: 15000 });

      const textarea = page.locator('textarea, input[type="text"]');
      await expect(textarea.first()).toBeVisible({ timeout: 15000 });
      await textarea.first().fill('What is the sales tax rate in California?');

      const submitButton = page.locator('button:has-text("Ask"), button:has-text("Submit"), button:has-text("Send")');
      await expect(submitButton.first()).toBeVisible({ timeout: 15000 });
    } finally {
      await page.close();
    }
  });

  test('Scenario: User views state tax registration details', async () => {
    test.skip(!sharedJourneyContext, 'No test credentials configured');
    const page = await sharedJourneyContext!.newPage();

    try {
      await page.goto(`${TAX_URL}/registrations`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1:has-text("State Tax Registrations")')).toBeVisible({ timeout: 15000 });
      // Check table structure
      await expect(page.locator('th:has-text("State")')).toBeVisible();
      await expect(page.locator('th:has-text("Type")')).toBeVisible();
    } finally {
      await page.close();
    }
  });
});
