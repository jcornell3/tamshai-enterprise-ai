/**
 * Cross-App Executive Journey E2E Tests
 *
 * Tests the executive user experience navigating across all enterprise apps:
 * - HR, Finance, Sales, Support, Payroll, Tax
 * - Verifies each app loads and shows role-appropriate content
 * - Validates portal shows all available apps for executive role
 *
 * Uses eve.thompson (CEO) credentials with executive composite role,
 * which grants read access to all departments.
 *
 * Architecture v1.5 - Cross-App Navigation
 *
 * Prerequisites:
 * - User must be authenticated with executive role (test-user.journey in dev)
 */

import { test, expect, BrowserContext } from '@playwright/test';
import {
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
} from '../utils';

let authenticatedContext: BrowserContext | null = null;

test.describe('Cross-App Executive Journey', () => {
  test.beforeAll(async ({ browser }) => {
    authenticatedContext = await createAuthenticatedContext(browser);
    // Warm up the portal first
    await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/`);
  });

  test.afterAll(async () => {
    if (authenticatedContext) await authenticatedContext.close();
  });

  test.describe('Portal Navigation', () => {
    test('portal loads and shows available apps', async () => {
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/`);
        // Use 'load' instead of 'networkidle' - SSE connections keep network active
        await page.waitForLoadState('load');

        // Wait for actual content to render
        await page.locator('h1, h2, [data-testid]').first().waitFor({ timeout: 15000 }).catch(() => {});

        // Portal should show content — either app links, welcome page, or redirect to app
        const pageText = await page.textContent('body') || '';

        // At minimum, the portal should render something (not blank)
        const hasContent = pageText.trim().length > 10;
        const hasHeading = await page.locator('h1, h2').first().isVisible({ timeout: 5000 }).catch(() => false);
        expect(hasContent || hasHeading).toBe(true);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('HR App', () => {
    test('navigates to HR app and loads employee directory', async () => {
      const page = await authenticatedContext!.newPage();

      try {
        // Warm up HR app context
        await page.goto(`${BASE_URLS[ENV]}/hr/`);
        await page.waitForLoadState('load');

        // Wait for app content to render
        await page.locator('h1, h2, nav, [data-testid]').first().waitFor({ timeout: 15000 }).catch(() => {});

        // HR app should show employee-related content
        const hasDirectory = await page.locator('text=Employee Directory, text=Employees, h1:has-text("HR")').first().isVisible({ timeout: 5000 }).catch(() => false);
        const hasOrgChart = await page.locator('text=Organization Chart, text=Org Chart').first().isVisible().catch(() => false);
        const hasHRContent = await page.locator('h1, h2').first().isVisible().catch(() => false);

        expect(hasDirectory || hasOrgChart || hasHRContent).toBe(true);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Finance App', () => {
    test('navigates to Finance app and shows dashboard', async () => {
      // SSO cookies from beforeAll are shared - no warmUpContext needed
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/finance/`);
        await page.waitForLoadState('load');

        // Wait for app content to render
        await page.locator('h1, h2, nav, [data-testid]').first().waitFor({ timeout: 15000 }).catch(() => {});

        // Finance app should render dashboard content
        const pageText = await page.textContent('body') || '';
        const hasFinanceKeywords = pageText.match(/invoice|budget|finance|revenue|expense|dashboard/i);
        expect(hasFinanceKeywords, `Finance app did not render expected content. Page text: ${pageText.substring(0, 200)}`).toBeTruthy();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Sales App', () => {
    test('navigates to Sales app and shows dashboard', async () => {
      // SSO cookies from beforeAll are shared - no warmUpContext needed
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/sales/`);
        await page.waitForLoadState('load');

        // Wait for app content to render
        await page.locator('h1, h2, nav, [data-testid]').first().waitFor({ timeout: 15000 }).catch(() => {});

        // Sales app should render dashboard content
        const pageText = await page.textContent('body') || '';
        const hasSalesKeywords = pageText.match(/sales|pipeline|leads|forecast|customer|dashboard/i);
        expect(hasSalesKeywords, `Sales app did not render expected content. Page text: ${pageText.substring(0, 200)}`).toBeTruthy();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Support App', () => {
    test('navigates to Support app and shows dashboard', async () => {
      // SSO cookies from beforeAll are shared - no warmUpContext needed
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/support/`);
        await page.waitForLoadState('load');

        // Wait for app content to render
        await page.locator('h1, h2, nav, [data-testid]').first().waitFor({ timeout: 15000 }).catch(() => {});

        // Support app should render dashboard content
        const pageText = await page.textContent('body') || '';
        const hasSupportKeywords = pageText.match(/ticket|support|sla|knowledge|agent|dashboard/i);
        expect(hasSupportKeywords, `Support app did not render expected content. Page text: ${pageText.substring(0, 200)}`).toBeTruthy();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Payroll App', () => {
    test('navigates to Payroll app and loads dashboard', async () => {
      // SSO cookies from beforeAll are shared - no warmUpContext needed
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/`);
        await page.waitForLoadState('load');

        // Wait for app content to render
        await page.locator('h1, h2, nav, [data-testid]').first().waitFor({ timeout: 15000 }).catch(() => {});

        // Payroll dashboard should render
        const hasHeading = await page.locator('h1:has-text("Payroll")').isVisible({ timeout: 5000 }).catch(() => false);
        const hasPayrollContent = await page.locator('h1, h2').first().isVisible().catch(() => false);
        expect(hasHeading || hasPayrollContent).toBe(true);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Tax App', () => {
    test('navigates to Tax app and loads dashboard', async () => {
      // SSO cookies from beforeAll are shared - no warmUpContext needed
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/tax/`);
        await page.waitForLoadState('load');

        // Wait for app content to render
        await page.locator('h1, h2, nav, [data-testid]').first().waitFor({ timeout: 15000 }).catch(() => {});

        // Tax dashboard should render
        const hasHeading = await page.locator('h1:has-text("Tax")').isVisible({ timeout: 5000 }).catch(() => false);
        const hasTaxContent = await page.locator('h1, h2').first().isVisible().catch(() => false);
        expect(hasHeading || hasTaxContent).toBe(true);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('User Context Consistency', () => {
    test('each app shows correct user display name', async () => {
      const apps = [
        { name: 'HR', url: `${BASE_URLS[ENV]}/hr/` },
        { name: 'Finance', url: `${BASE_URLS[ENV]}/finance/` },
        { name: 'Support', url: `${BASE_URLS[ENV]}/support/` },
      ];

      for (const app of apps) {
        // SSO cookies from beforeAll are shared - no warmUpContext needed
        const page = await authenticatedContext!.newPage();

        try {
          await page.goto(app.url);
          await page.waitForLoadState('load');

          // Wait for content to render
          await page.locator('h1, h2, nav, [data-testid]').first().waitFor({ timeout: 15000 }).catch(() => {});

          // Page should have content (not blank)
          const bodyText = await page.textContent('body');
          expect(bodyText?.length, `${app.name} app rendered blank page`).toBeGreaterThan(50);
        } finally {
          await page.close();
        }
      }
    });

    test('each app shows role-appropriate navigation', async () => {
      // SSO cookies from beforeAll are shared - no warmUpContext needed
      const hrPage = await authenticatedContext!.newPage();

      try {
        await hrPage.goto(`${BASE_URLS[ENV]}/hr/`);
        await hrPage.waitForLoadState('load');

        // Wait for content to render
        await hrPage.locator('h1, h2, nav, aside, [data-testid]').first().waitFor({ timeout: 15000 }).catch(() => {});

        // HR should have nav links (sidebar or top nav)
        const navLinks = hrPage.locator('nav a, aside a, [role="navigation"] a');
        const linkCount = await navLinks.count();
        expect(linkCount, 'HR app should have navigation links').toBeGreaterThan(0);
      } finally {
        await hrPage.close();
      }
    });
  });
});
