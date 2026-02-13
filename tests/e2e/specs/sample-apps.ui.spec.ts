/**
 * E2E Tests for Phase 2 Sample App Pages
 *
 * Tests the following pages added in Phase 2:
 * - HR: EmployeeProfilePage, OrgChartPage, TimeOffPage
 * - Finance: ARRDashboardPage
 * - Sales: LeadsPage, ForecastingPage
 * - Support: SLAPage, AgentMetricsPage
 *
 * Prerequisites:
 * - ALWAYS run with --workers=1 to avoid TOTP reuse issues
 * - Environment variables:
 *   - TEST_USERNAME: User to authenticate as (default: test-user.journey)
 *   - TEST_USER_PASSWORD: User's password (required)
 *   - TEST_USER_TOTP_SECRET: TOTP secret in BASE32 (optional, auto-captured if not set)
 *
 * test-user.journey Access:
 * - In dev: Has executive role (C-Suite group) for full UX testing
 * - In stage/prod: No data access roles (login journey testing only)
 *
 * See docs/testing/TEST_USER_JOURNEY.md for credential management.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import {
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

/**
 * Warm up an authenticated context by visiting the app URL once.
 * This primes PrivateRoute OIDC checks so subsequent pages render immediately.
 */

test.describe('Sample Apps - Phase 2 Pages', () => {

  test.describe('HR App', () => {
    let sharedContext: BrowserContext;
    let sharedPage: Page;

    test.beforeAll(async ({ browser }) => {
      if (!TEST_USER.password) return;
      sharedContext = await createAuthenticatedContext(browser);
      await warmUpContext(sharedContext, `${BASE_URLS[ENV]}/hr/`);
      sharedPage = await sharedContext.newPage();
    });

    test.afterAll(async () => {
      if (sharedContext) await sharedContext.close();
    });

    test('OrgChartPage - displays organization chart', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      // Navigate directly to HR app
      await sharedPage.goto(`${BASE_URLS[ENV]}/hr/`);
      await sharedPage.waitForLoadState('networkidle');

      // Should be on HR app now - click Org Chart nav link
      await sharedPage.click('a:has-text("Org Chart")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title (page header)
      await expect(sharedPage.locator('.page-title:has-text("Organization Chart"), h2:has-text("Organization Chart")')).toBeVisible({ timeout: 10000 });

      // Verify control buttons exist
      await expect(sharedPage.locator('button:has-text("Expand All")')).toBeVisible();
      await expect(sharedPage.locator('button:has-text("Collapse All")')).toBeVisible();

      // Verify search input exists
      await expect(sharedPage.locator('input[placeholder*="Search" i]')).toBeVisible();
    });

    test('TimeOffPage - displays time off management', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/hr/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Time Off nav link
      await sharedPage.click('a:has-text("Time Off")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page content
      await expect(sharedPage.locator('.page-title:has-text("Time Off"), h2:has-text("Time Off")')).toBeVisible({ timeout: 10000 });

      // Verify request button
      await expect(sharedPage.locator('button:has-text("Request Time Off")')).toBeVisible();
    });

    test('TimeOffPage - can open request modal', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/hr/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Time Off nav link
      await sharedPage.click('a:has-text("Time Off")');
      await sharedPage.waitForLoadState('networkidle');

      // Click request button
      await sharedPage.click('button:has-text("Request Time Off")');

      // Verify wizard opens (the wizard component should appear)
      await expect(sharedPage.locator('[role="dialog"], .modal, .wizard, [class*="TimeOffRequestWizard"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('EmployeeProfilePage - displays employee profile', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      // Navigate to Employee Directory (the default HR page)
      await sharedPage.goto(`${BASE_URLS[ENV]}/hr/`);
      await sharedPage.waitForLoadState('networkidle');

      // Wait for employee data to load (requires MCP HR server + sample data)
      const employeeLink = sharedPage.locator('a[href*="/employees/"]').first();
      const hasEmployees = await employeeLink.isVisible({ timeout: 15000 }).catch(() => false);

      if (!hasEmployees) {
        // Skip if no employees are present (MCP HR not running or no sample data)
        test.skip(true, 'No employees in directory - MCP HR may not be running or sample data not loaded');
        return;
      }

      // Click on first employee link to navigate to profile
      await employeeLink.click();
      await sharedPage.waitForLoadState('networkidle');

      // Verify profile page loads - look for breadcrumb link back to directory
      await expect(
        sharedPage.locator('a:has-text("Employee Directory")').first()
      ).toBeVisible({ timeout: 10000 });

      // Verify profile tabs exist (tabs are lowercase: overview, employment, timeoff, documents)
      await expect(
        sharedPage.locator('button:has-text("overview")').or(sharedPage.locator('button:has-text("Overview")'))
      ).toBeVisible({ timeout: 5000 });

      await expect(
        sharedPage.locator('button:has-text("employment")').or(sharedPage.locator('button:has-text("Employment")'))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Finance App', () => {
    let sharedContext: BrowserContext;
    let sharedPage: Page;

    test.beforeAll(async ({ browser }) => {
      if (!TEST_USER.password) return;
      sharedContext = await createAuthenticatedContext(browser);
      await warmUpContext(sharedContext, `${BASE_URLS[ENV]}/finance/`);
      sharedPage = await sharedContext.newPage();
    });

    test.afterAll(async () => {
      if (sharedContext) await sharedContext.close();
    });

    test('ARRDashboardPage - displays ARR metrics', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/finance/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on ARR nav link (labeled "ARR" in navigation)
      await sharedPage.click('a:has-text("ARR")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("ARR Dashboard"), h2:has-text("ARR Dashboard")')).toBeVisible({ timeout: 10000 });

      // Verify key metrics are displayed (actual card titles)
      await expect(sharedPage.locator('text=Annual Recurring Revenue')).toBeVisible({ timeout: 10000 });
      await expect(sharedPage.locator('text=Net New ARR')).toBeVisible();
    });

    test('ARRDashboardPage - displays movement table', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/finance/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on ARR nav link
      await sharedPage.click('a:has-text("ARR")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify ARR movement section exists (actual heading)
      await expect(sharedPage.locator('h3:has-text("ARR Movement")')).toBeVisible({ timeout: 10000 });
    });

    test('ARRDashboardPage - displays cohort analysis', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/finance/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on ARR nav link
      await sharedPage.click('a:has-text("ARR")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify cohort analysis section (actual heading: "Cohort Retention Analysis")
      await expect(sharedPage.locator('h3:has-text("Cohort Retention Analysis")')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Sales App', () => {
    let sharedContext: BrowserContext;
    let sharedPage: Page;

    test.beforeAll(async ({ browser }) => {
      if (!TEST_USER.password) return;
      sharedContext = await createAuthenticatedContext(browser);
      await warmUpContext(sharedContext, `${BASE_URLS[ENV]}/sales/`);
      sharedPage = await sharedContext.newPage();
    });

    test.afterAll(async () => {
      if (sharedContext) await sharedContext.close();
    });

    test('LeadsPage - displays lead list', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/sales/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Leads nav link
      await sharedPage.click('a:has-text("Leads")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("Lead Management"), h2:has-text("Lead Management")')).toBeVisible({ timeout: 10000 });

      // Verify stats card for Total Leads exists
      await expect(sharedPage.locator('[data-testid="total-leads"]').or(sharedPage.locator('text=Total Leads')).first()).toBeVisible({ timeout: 10000 });
    });

    test('LeadsPage - has filtering controls', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/sales/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Leads nav link
      await sharedPage.click('a:has-text("Leads")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify filter controls exist (search input and status select)
      await expect(sharedPage.locator('[data-testid="search-filter"]').or(sharedPage.locator('input[placeholder*="Company" i]')).first()).toBeVisible({ timeout: 10000 });
      await expect(sharedPage.locator('[data-testid="status-filter"]').or(sharedPage.locator('select')).first()).toBeVisible();
    });

    test('ForecastingPage - displays forecast summary', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/sales/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Forecast nav link
      await sharedPage.click('a:has-text("Forecast")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("Sales Forecast"), h2:has-text("Sales Forecast")')).toBeVisible({ timeout: 10000 });

      // Verify team summary cards exist
      await expect(sharedPage.locator('[data-testid="team-quota"]').or(sharedPage.locator('text=Team Quota')).first()).toBeVisible({ timeout: 10000 });
    });

    test('ForecastingPage - has period selector', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/sales/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Forecast nav link
      await sharedPage.click('a:has-text("Forecast")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify period selection control exists
      await expect(sharedPage.locator('[data-testid="period-select"]').or(sharedPage.locator('select.input')).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Support App', () => {
    let sharedContext: BrowserContext;
    let sharedPage: Page;

    test.beforeAll(async ({ browser }) => {
      if (!TEST_USER.password) return;
      sharedContext = await createAuthenticatedContext(browser);
      await warmUpContext(sharedContext, `${BASE_URLS[ENV]}/support/`);
      sharedPage = await sharedContext.newPage();
    });

    test.afterAll(async () => {
      if (sharedContext) await sharedContext.close();
    });

    test('SLAPage - displays SLA compliance', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/support/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on SLA nav link
      await sharedPage.click('a:has-text("SLA")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("SLA Tracking"), h2:has-text("SLA Tracking")')).toBeVisible({ timeout: 10000 });

      // Verify Overall Compliance card exists
      await expect(sharedPage.locator('[data-testid="overall-compliance"]').or(sharedPage.locator('text=Overall Compliance')).first()).toBeVisible({ timeout: 10000 });
    });

    test('SLAPage - displays tier breakdown', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/support/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on SLA nav link
      await sharedPage.click('a:has-text("SLA")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify tier breakdown section (SLA Policies by Tier)
      await expect(sharedPage.locator('h3:has-text("SLA Policies by Tier")')).toBeVisible({ timeout: 10000 });
      // Verify tier labels exist (Starter, Professional, Enterprise)
      await expect(sharedPage.locator('text=Starter').first()).toBeVisible();
    });

    test('SLAPage - displays at-risk tickets', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/support/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on SLA nav link
      await sharedPage.click('a:has-text("SLA")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify At Risk card exists
      await expect(sharedPage.locator('[data-testid="tickets-at-risk"]').or(sharedPage.locator('text=At Risk')).first()).toBeVisible({ timeout: 10000 });
      // Also verify Breached card exists
      await expect(sharedPage.locator('[data-testid="tickets-breached"]').or(sharedPage.locator('text=Breached')).first()).toBeVisible();
    });

    test('AgentMetricsPage - displays agent performance', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/support/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Performance nav link (use .nav-link to avoid matching ticket titles containing "performance")
      await sharedPage.click('a.nav-link:has-text("Performance")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("Agent Performance"), h2:has-text("Agent Performance")')).toBeVisible({ timeout: 10000 });

      // Verify team summary cards exist
      await expect(sharedPage.locator('[data-testid="team-resolved"]').or(sharedPage.locator('text=Team Resolved')).first()).toBeVisible({ timeout: 10000 });
    });

    test('AgentMetricsPage - displays agent leaderboard', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/support/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Performance nav link (use .nav-link to avoid matching ticket titles containing "performance")
      await sharedPage.click('a.nav-link:has-text("Performance")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify Agent Leaderboard section exists
      await expect(sharedPage.locator('h3:has-text("Agent Leaderboard")')).toBeVisible({ timeout: 10000 });
    });

    test('AgentMetricsPage - has period selector', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');

      await sharedPage.goto(`${BASE_URLS[ENV]}/support/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Performance nav link (use .nav-link to avoid matching ticket titles containing "performance")
      await sharedPage.click('a.nav-link:has-text("Performance")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify period selection control exists
      await expect(sharedPage.locator('[data-testid="period-select"]').or(sharedPage.locator('select.input')).first()).toBeVisible({ timeout: 10000 });
    });
  });
});

test.describe('Cross-App Navigation', () => {
  test('can navigate between apps via portal', async ({ browser }) => {
    // Skip if no credentials
    if (!TEST_USER.password) {
      test.skip(true, 'No test credentials configured');
    }

    // Use createAuthenticatedContext to ensure TOTP window guard
    const context = await createAuthenticatedContext(browser);
    await warmUpContext(context, `${BASE_URLS[ENV]}/app/`);
    const page = await context.newPage();

    try {
      // Navigate to portal
      await page.goto(`${BASE_URLS[ENV]}/app/`);

      // Verify we're on the portal
      await expect(page.locator('text=Available Applications')).toBeVisible({ timeout: 30000 });

      // Click HR app card (use correct href)
      const hrCard = page.locator('a[href*="/hr"], [data-app="hr"]').first();
      if (await hrCard.isVisible({ timeout: 5000 })) {
        await hrCard.click();
        await page.waitForLoadState('networkidle');

        // Verify HR app loaded (Employee Directory is the index page)
        await expect(page.locator('text=Employee Directory')).toBeVisible({ timeout: 10000 });
      }
    } finally {
      await context.close();
    }
  });
});
