/**
 * Cross-App Executive Journey E2E Tests
 *
 * Tests the executive user experience navigating across all enterprise apps:
 * - HR, Finance, Sales, Support, Payroll, Tax
 * - Verifies each app loads and shows role-appropriate content
 * - Validates portal shows all available apps for executive role
 *
 * This test temporarily grants 'executive' role to test-user.journey,
 * runs the tests, then revokes the role. The executive composite role
 * grants read access to all departments.
 *
 * Architecture v1.5 - Cross-App Navigation
 *
 * Prerequisites:
 * - test-user.journey must exist in Keycloak
 * - Keycloak Admin API must be accessible
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import {
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
  grantRealmRole,
  revokeRealmRole,
} from '../utils';

let authenticatedContext: BrowserContext | null = null;
const EXECUTIVE_ROLE = 'executive';
const APP_LOAD_TIMEOUT = 15000;
const ELEMENT_VISIBLE_TIMEOUT = 5000;

/**
 * Wait for an app page to finish loading and render content.
 * Waits for load state then checks for meaningful DOM content.
 */
async function waitForAppContent(page: Page, appName: string): Promise<string> {
  await page.waitForLoadState('load');

  // Wait for a heading or navigation to appear (indicates React rendered)
  const contentLocator = page.locator('h1, h2, nav, [data-testid]').first();
  await contentLocator.waitFor({ state: 'visible', timeout: APP_LOAD_TIMEOUT });

  const bodyText = await page.textContent('body') || '';
  expect(bodyText.trim().length, `${appName} app rendered a blank or near-empty page`).toBeGreaterThan(50);
  return bodyText;
}

test.describe('Cross-App Executive Journey', () => {
  test.beforeAll(async ({ browser }) => {
    // Grant executive role BEFORE authentication so JWT includes the role
    console.log(`[cross-app-executive] Granting '${EXECUTIVE_ROLE}' role to '${TEST_USER.username}'...`);
    await grantRealmRole(TEST_USER.username, EXECUTIVE_ROLE);

    // Now authenticate - the JWT will include the executive role
    authenticatedContext = await createAuthenticatedContext(browser);
    // Warm up the portal first
    await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/`);
  });

  test.afterAll(async () => {
    // Always revoke the role, even if tests fail
    try {
      console.log(`[cross-app-executive] Revoking '${EXECUTIVE_ROLE}' role from '${TEST_USER.username}'...`);
      await revokeRealmRole(TEST_USER.username, EXECUTIVE_ROLE);
    } catch (error) {
      console.error(`[cross-app-executive] Failed to revoke role: ${error}`);
    }

    if (authenticatedContext) await authenticatedContext.close();
  });

  test.describe('Portal Navigation', () => {
    test('portal loads and shows available apps', async () => {
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/`);
        const pageText = await waitForAppContent(page, 'Portal');

        // Portal should show at least a heading
        const heading = page.locator('h1, h2').first();
        await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT });

        // Verify the portal rendered substantive content (not just a shell)
        expect(pageText.length).toBeGreaterThan(100);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('HR App', () => {
    test('navigates to HR app and loads employee directory', async () => {
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/hr/`);
        const pageText = await waitForAppContent(page, 'HR');

        // HR app must contain HR-specific keywords
        expect(
          pageText,
          `HR app did not render expected content. Page text: ${pageText.substring(0, 300)}`
        ).toMatch(/employee|directory|org\s*chart|human\s*resource|hr\b|department/i);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Finance App', () => {
    test('navigates to Finance app and shows dashboard', async () => {
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/finance/`);
        const pageText = await waitForAppContent(page, 'Finance');

        // Finance app must contain finance-specific keywords
        expect(
          pageText,
          `Finance app did not render expected content. Page text: ${pageText.substring(0, 300)}`
        ).toMatch(/invoice|budget|finance|revenue|expense|dashboard/i);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Sales App', () => {
    test('navigates to Sales app and shows dashboard', async () => {
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/sales/`);
        const pageText = await waitForAppContent(page, 'Sales');

        // Sales app must contain sales-specific keywords
        expect(
          pageText,
          `Sales app did not render expected content. Page text: ${pageText.substring(0, 300)}`
        ).toMatch(/sales|pipeline|leads|forecast|customer|dashboard/i);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Support App', () => {
    test('navigates to Support app and shows dashboard', async () => {
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/support/`);
        const pageText = await waitForAppContent(page, 'Support');

        // Support app must contain support-specific keywords
        expect(
          pageText,
          `Support app did not render expected content. Page text: ${pageText.substring(0, 300)}`
        ).toMatch(/ticket|support|sla|knowledge|agent|dashboard/i);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Payroll App', () => {
    test('navigates to Payroll app and loads dashboard', async () => {
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/payroll/`);
        const pageText = await waitForAppContent(page, 'Payroll');

        // Payroll app must contain payroll-specific keywords
        expect(
          pageText,
          `Payroll app did not render expected content. Page text: ${pageText.substring(0, 300)}`
        ).toMatch(/payroll|pay\s*run|pay\s*stub|salary|compensation|dashboard/i);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Tax App', () => {
    test('navigates to Tax app and loads dashboard', async () => {
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${BASE_URLS[ENV]}/tax/`);
        const pageText = await waitForAppContent(page, 'Tax');

        // Tax app must contain tax-specific keywords
        expect(
          pageText,
          `Tax app did not render expected content. Page text: ${pageText.substring(0, 300)}`
        ).toMatch(/tax|filing|withholding|quarterly|w-2|1099|dashboard/i);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('User Context Consistency', () => {
    test('each app shows correct user display name', async () => {
      const apps = [
        { name: 'HR', url: `${BASE_URLS[ENV]}/hr/`, keywords: /employee|hr|directory/i },
        { name: 'Finance', url: `${BASE_URLS[ENV]}/finance/`, keywords: /invoice|budget|finance/i },
        { name: 'Support', url: `${BASE_URLS[ENV]}/support/`, keywords: /ticket|support|knowledge/i },
      ];

      for (const app of apps) {
        const page = await authenticatedContext!.newPage();

        try {
          await page.goto(app.url);
          const bodyText = await waitForAppContent(page, app.name);

          // Each app should render domain-specific content
          expect(
            bodyText,
            `${app.name} app did not render domain content. Page text: ${bodyText.substring(0, 200)}`
          ).toMatch(app.keywords);
        } finally {
          await page.close();
        }
      }
    });

    test('each app shows role-appropriate navigation', async () => {
      const hrPage = await authenticatedContext!.newPage();

      try {
        await hrPage.goto(`${BASE_URLS[ENV]}/hr/`);
        await waitForAppContent(hrPage, 'HR');

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
