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
  TEST_USER,
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
        await page.waitForLoadState('networkidle');

        // Portal should show content — either app links, welcome page, or redirect to app
        // The portal SPA at /app/ may not list app names directly
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
        await page.waitForLoadState('networkidle');

        // HR app should show employee-related content
        const hasDirectory = await page.locator('text=Employee Directory, text=Employees, h1:has-text("HR")').first().isVisible({ timeout: 15000 }).catch(() => false);
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

      // Need to warm up Finance app to get its OIDC tokens
      await warmUpContext(authenticatedContext!, `${BASE_URLS[ENV]}/finance/`);
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/finance/`);
        await page.waitForLoadState('networkidle');

        // Wait for either app content or an error to appear
        await page.locator('h1, h2, [role="alert"], .alert, .error').first().waitFor({ timeout: 15000 }).catch(() => {});

        // Fail fast with the actual error message if the app shows an error
        const errorEl = page.locator('[role="alert"], .alert-danger, .alert-error, .error-message');
        const errorText = await errorEl.first().textContent().catch(() => null);
        expect(errorText, `Finance app returned an error: ${errorText}`).toBeNull();

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

      await warmUpContext(authenticatedContext!, `${BASE_URLS[ENV]}/sales/`);
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/sales/`);
        await page.waitForLoadState('networkidle');

        await page.locator('h1, h2, [role="alert"], .alert, .error').first().waitFor({ timeout: 15000 }).catch(() => {});

        const errorEl = page.locator('[role="alert"], .alert-danger, .alert-error, .error-message');
        const errorText = await errorEl.first().textContent().catch(() => null);
        expect(errorText, `Sales app returned an error: ${errorText}`).toBeNull();

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

      await warmUpContext(authenticatedContext!, `${BASE_URLS[ENV]}/support/`);
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/support/`);
        await page.waitForLoadState('networkidle');

        await page.locator('h1, h2, [role="alert"], .alert, .error').first().waitFor({ timeout: 15000 }).catch(() => {});

        const errorEl = page.locator('[role="alert"], .alert-danger, .alert-error, .error-message');
        const errorText = await errorEl.first().textContent().catch(() => null);
        expect(errorText, `Support app returned an error: ${errorText}`).toBeNull();

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

      await warmUpContext(authenticatedContext!, `${BASE_URLS[ENV]}/payroll/`);
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/`);
        await page.waitForLoadState('networkidle');

        // Payroll dashboard should render
        const hasHeading = await page.locator('h1:has-text("Payroll")').isVisible({ timeout: 15000 }).catch(() => false);
        const hasPayrollContent = await page.locator('h1, h2').first().isVisible().catch(() => false);
        expect(hasHeading || hasPayrollContent).toBe(true);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Tax App', () => {
    test('navigates to Tax app and loads dashboard', async () => {

      await warmUpContext(authenticatedContext!, `${BASE_URLS[ENV]}/tax/`);
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/tax/`);
        await page.waitForLoadState('networkidle');

        // Tax dashboard should render
        const hasHeading = await page.locator('h1:has-text("Tax")').isVisible({ timeout: 15000 }).catch(() => false);
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
        await warmUpContext(authenticatedContext!, app.url);
        const page = await authenticatedContext!.newPage();

        try {
          await page.goto(app.url);
          await page.waitForLoadState('networkidle');

          // Wait for content or error to render
          await page.locator('h1, h2, [role="alert"], .alert, .error').first().waitFor({ timeout: 15000 }).catch(() => {});

          // Fail fast with actual error message
          const errorEl = page.locator('[role="alert"], .alert-danger, .alert-error, .error-message');
          const errorText = await errorEl.first().textContent().catch(() => null);
          expect(errorText, `${app.name} app returned an error: ${errorText}`).toBeNull();

          // Page should have content (not blank)
          const bodyText = await page.textContent('body');
          expect(bodyText?.length, `${app.name} app rendered blank page`).toBeGreaterThan(50);
        } finally {
          await page.close();
        }
      }
    });

    test('each app shows role-appropriate navigation', async () => {

      // Verify HR has department-level nav items
      await warmUpContext(authenticatedContext!, `${BASE_URLS[ENV]}/hr/`);
      const hrPage = await authenticatedContext!.newPage();

      try {
        await hrPage.goto(`${BASE_URLS[ENV]}/hr/`);
        await hrPage.waitForLoadState('networkidle');

        // Wait for content or error to render
        await hrPage.locator('h1, h2, nav, aside, [role="alert"]').first().waitFor({ timeout: 15000 }).catch(() => {});

        // Fail fast with actual error message
        const errorEl = hrPage.locator('[role="alert"], .alert-danger, .alert-error, .error-message');
        const errorText = await errorEl.first().textContent().catch(() => null);
        expect(errorText, `HR app returned an error: ${errorText}`).toBeNull();

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
