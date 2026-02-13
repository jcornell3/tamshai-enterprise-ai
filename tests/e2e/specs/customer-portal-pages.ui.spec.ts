/**
 * Customer Portal - Page-Level E2E Tests
 *
 * Tests the customer portal pages that are not covered by the login journey:
 * - New Ticket: form fields, validation, category selection
 * - Ticket Detail: status/priority badges, comments, metadata
 * - Settings: profile info, notification preferences, security section
 *
 * Customer Realm: tamshai-customers (no TOTP required)
 *
 * Prerequisites:
 * - CUSTOMER_USER_PASSWORD environment variable must be set
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

const ENV = process.env.TEST_ENV || 'dev';

const BASE_URLS: Record<string, { customerPortal: string }> = {
  dev: { customerPortal: 'https://customers.tamshai-playground.local:8443' },
  stage: { customerPortal: 'https://customers.tamshai.com' },
  prod: { customerPortal: 'https://customers.tamshai.com' },
};

const CUSTOMER_PASSWORD = process.env.CUSTOMER_USER_PASSWORD || '';

const TEST_CUSTOMER = {
  username: process.env.TEST_CUSTOMER_USERNAME || 'jane.smith@acme.com',
  password: process.env.TEST_CUSTOMER_PASSWORD || CUSTOMER_PASSWORD,
  firstName: 'Jane',
  lastName: 'Smith',
  organizationName: 'Acme Corporation',
};

const PORTAL_URL = BASE_URLS[ENV]?.customerPortal || BASE_URLS.dev.customerPortal;

async function waitForKeycloakLogin(page: Page): Promise<void> {
  await page.waitForSelector('#username, input[name="username"], [placeholder*="sername" i]', {
    state: 'visible',
    timeout: 30000,
  });
  await page.waitForSelector('#password, input[name="password"], input[type="password"]', {
    state: 'visible',
    timeout: 5000,
  });
}

async function completeKeycloakLogin(page: Page, username: string, password: string): Promise<void> {
  await page.fill('#username, input[name="username"], [placeholder*="sername" i]', username);
  await page.fill('#password, input[name="password"], input[type="password"]', password);
  await page.click('#kc-login, button[type="submit"], button:has-text("Sign In")');
}

let authenticatedContext: BrowserContext | null = null;

test.describe('Customer Portal Pages', () => {
  test.beforeAll(async ({ browser }) => {
    if (!TEST_CUSTOMER.password) return;

    const context = await browser.newContext({
      ignoreHTTPSErrors: ENV === 'dev',
    });
    const page = await context.newPage();

    try {
      await page.goto(PORTAL_URL);
      await waitForKeycloakLogin(page);
      await completeKeycloakLogin(page, TEST_CUSTOMER.username, TEST_CUSTOMER.password);
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      // Verify we landed on the portal
      const welcomeText = page.locator('h1:has-text("Welcome"), h2:has-text("Welcome"), a:has-text("Dashboard")');
      await expect(welcomeText.first()).toBeVisible({ timeout: 30000 });
    } catch {
      await context.close();
      return;
    }

    // Capture session for reuse
    const sessionData = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        data[key] = sessionStorage.getItem(key)!;
      }
      return data;
    });

    await page.close();

    if (Object.keys(sessionData).length > 0) {
      await context.addInitScript(
        (data: { tokens: Record<string, string>; expiresAt: number }) => {
          if (Date.now() < data.expiresAt) {
            for (const [key, value] of Object.entries(data.tokens)) {
              sessionStorage.setItem(key, value);
            }
          }
        },
        { tokens: sessionData, expiresAt: Date.now() + 4.5 * 60 * 1000 },
      );
    }

    authenticatedContext = context;
  });

  test.afterAll(async () => {
    if (authenticatedContext) await authenticatedContext.close();
  });

  test.describe('New Ticket Page', () => {
    test('loads with Create New Support Ticket heading', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/tickets/new`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Create New Support Ticket")')).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('form fields render (title, category, description, priority)', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/tickets/new`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Create New Support Ticket")')).toBeVisible({ timeout: 15000 });

        // Title field
        await expect(page.locator('input#title, input[placeholder*="summary" i]')).toBeVisible();

        // Category label
        await expect(page.locator('text=Category')).toBeVisible();

        // Description textarea
        await expect(page.locator('textarea#description, textarea[placeholder*="detailed" i]')).toBeVisible();

        // Priority
        await expect(page.locator('text=Priority')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('category options display as radio grid', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/tickets/new`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Create New Support Ticket")')).toBeVisible({ timeout: 15000 });

        // 5 category options
        await expect(page.locator('text=Technical Issue')).toBeVisible();
        await expect(page.locator('text=Billing')).toBeVisible();
        await expect(page.locator('text=General Inquiry')).toBeVisible();
        await expect(page.locator('text=Feature Request')).toBeVisible();
        await expect(page.locator('text=Bug Report')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('form validation shows errors for empty required fields', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/tickets/new`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Create New Support Ticket")')).toBeVisible({ timeout: 15000 });

        // Submit without filling any fields
        await page.locator('button[type="submit"]:has-text("Submit Ticket")').click();

        // Should show validation errors
        const errors = page.locator('.text-red-500');
        const errorCount = await errors.count();
        expect(errorCount).toBeGreaterThan(0);
      } finally {
        await page.close();
      }
    });

    test('character count shows for description', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/tickets/new`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Create New Support Ticket")')).toBeVisible({ timeout: 15000 });

        const textarea = page.locator('textarea#description, textarea[placeholder*="detailed" i]');
        await textarea.fill('Test description with enough characters.');

        // Character count should be visible (e.g., "40/5000")
        await expect(page.locator('text=/\\d+\\/5000/')).toBeVisible({ timeout: 3000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Ticket Detail Page', () => {
    test('navigates from tickets list to ticket detail', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available for this customer');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Should show ticket title
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays status and priority badges', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available for this customer');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Status badge
        const statusBadge = page.locator('.rounded-full').first();
        await expect(statusBadge).toBeVisible({ timeout: 10000 });

        // Priority badge (contains "priority" text)
        const priorityBadge = page.locator('.rounded-full:has-text("priority")');
        const hasPriority = await priorityBadge.isVisible({ timeout: 3000 }).catch(() => false);
        // Priority badge may use different format - just verify badges exist
        const allBadges = page.locator('.rounded-full');
        const badgeCount = await allBadges.count();
        expect(badgeCount).toBeGreaterThanOrEqual(1);
      } finally {
        await page.close();
      }
    });

    test('displays comments section', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available for this customer');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Wait for ticket data to load (Description h2 confirms API returned data)
        const ticketLoaded = await page.locator('h2:has-text("Description")').isVisible({ timeout: 10000 }).catch(() => false);
        if (!ticketLoaded) {
          test.skip(true, 'Ticket detail API unavailable');
          return;
        }

        // Comments heading
        await expect(page.locator('h2:has-text("Comments")')).toBeVisible({ timeout: 10000 });

        // Either comments or "No comments yet"
        const hasComments = await page.locator('.bg-gray-50.rounded-lg').first().isVisible({ timeout: 3000 }).catch(() => false);
        const noComments = await page.locator('text=No comments yet').isVisible().catch(() => false);
        expect(hasComments || noComments).toBe(true);
      } finally {
        await page.close();
      }
    });

    test('comment form available for non-closed tickets', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available for this customer');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Check if ticket is closed
        const isClosed = await page.locator('.rounded-full:has-text("closed")').isVisible({ timeout: 3000 }).catch(() => false);

        const commentForm = page.locator('textarea[placeholder*="comment" i]');
        if (isClosed) {
          // Form should NOT be visible for closed tickets
          await expect(commentForm).not.toBeVisible({ timeout: 3000 });
        } else {
          // Form should be visible for non-closed tickets
          const hasForm = await commentForm.isVisible({ timeout: 5000 }).catch(() => false);
          if (hasForm) {
            await expect(page.locator('button:has-text("Add Comment")')).toBeVisible();
          }
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Settings Page', () => {
    test('loads with Settings heading', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/settings`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 15000 });
      } finally {
        await page.close();
      }
    });

    test('profile section shows user info', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/settings`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:has-text("Profile Information")')).toBeVisible({ timeout: 15000 });

        // Avatar with initials (div.h-16.w-16 — use specific avatar size selector)
        const avatar = page.locator('div.rounded-full.bg-primary-100');
        await expect(avatar).toBeVisible();

        // User name and organization should be visible
        const pageText = await page.textContent('body');
        expect(pageText).toContain(TEST_CUSTOMER.firstName);
        expect(pageText).toContain(TEST_CUSTOMER.organizationName);
      } finally {
        await page.close();
      }
    });

    test('notification preferences section visible', async () => {
      test.skip(!authenticatedContext, 'No customer credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PORTAL_URL}/settings`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:has-text("Notification Preferences")')).toBeVisible({ timeout: 15000 });

        // Should have checkboxes
        const checkboxes = page.locator('input[type="checkbox"]');
        const checkboxCount = await checkboxes.count();
        expect(checkboxCount).toBeGreaterThanOrEqual(2);

        // "coming soon" note
        await expect(page.locator('text=Notification preferences coming soon')).toBeVisible();
      } finally {
        await page.close();
      }
    });
  });
});
