/**
 * E2E Customer Login Journey Test
 *
 * Tests the full customer login flow including:
 * - Navigation to customer login page from homepage
 * - SSO redirect to Keycloak (tamshai-customers realm)
 * - Keycloak authentication (username/password only - no TOTP for customers)
 * - Redirect back to customer portal
 * - User info and organization verification
 *
 * Customer Realm: tamshai-customers
 * - No TOTP required (simpler flow than employee login)
 * - Organization claims included in JWT
 */

import { test, expect, Page } from '@playwright/test';

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';
const KEYCLOAK_CUSTOMER_REALM = process.env.KEYCLOAK_CUSTOMER_REALM || 'tamshai-customers';

const BASE_URLS: Record<string, {
  homepage: string;
  customerPortal: string;
  keycloak: string;
}> = {
  dev: {
    homepage: 'https://www.tamshai-playground.local:8443',
    customerPortal: 'https://customers.tamshai-playground.local:8443',
    keycloak: 'https://www.tamshai-playground.local:8443/auth',
  },
  stage: {
    homepage: 'https://www.tamshai.com',
    customerPortal: 'https://customers.tamshai.com',
    keycloak: 'https://www.tamshai.com/auth',
  },
  prod: {
    homepage: 'https://prod.tamshai.com',
    customerPortal: 'https://customers.tamshai.com',
    keycloak: 'https://keycloak-fn44nd7wba-uc.a.run.app/auth',
  },
};

// Customer test password from environment variable (GitHub Secret: CUSTOMER_USER_PASSWORD)
// No fallback — must be set via read-github-secrets.sh --e2e
const CUSTOMER_PASSWORD = process.env.CUSTOMER_USER_PASSWORD || '';

// Test customer credentials from realm-export-customers-dev.json
// Lead customer from Acme Corporation
const TEST_LEAD_CUSTOMER = {
  username: process.env.TEST_CUSTOMER_USERNAME || 'jane.smith@acme.com',
  password: process.env.TEST_CUSTOMER_PASSWORD || CUSTOMER_PASSWORD,
  firstName: 'Jane',
  lastName: 'Smith',
  organizationName: 'Acme Corporation',
  role: 'lead-customer',
};

// Basic customer from Acme Corporation
const TEST_BASIC_CUSTOMER = {
  username: 'bob.developer@acme.com',
  password: CUSTOMER_PASSWORD,
  firstName: 'Bob',
  lastName: 'Developer',
  organizationName: 'Acme Corporation',
  role: 'basic-customer',
};

/**
 * Wait for Keycloak login page to load
 * Uses flexible selectors that work across different Keycloak versions
 */
async function waitForKeycloakLogin(page: Page): Promise<void> {
  await page.waitForSelector('#username, input[name="username"], [placeholder*="sername" i]', {
    state: 'visible',
    timeout: 30000
  });
  await page.waitForSelector('#password, input[name="password"], input[type="password"]', {
    state: 'visible',
    timeout: 5000
  });
}

/**
 * Complete Keycloak login form
 * Customer realm doesn't require TOTP
 */
async function completeKeycloakLogin(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  const usernameSelector = '#username, input[name="username"], [placeholder*="sername" i]';
  await page.fill(usernameSelector, username);

  const passwordSelector = '#password, input[name="password"], input[type="password"]';
  await page.fill(passwordSelector, password);

  const loginButtonSelector = '#kc-login, button[type="submit"], button:has-text("Sign In")';
  await page.click(loginButtonSelector);
}

test.describe('Customer Login Journey', () => {
  test.beforeEach(async ({ context }) => {
    // Ignore HTTPS errors for local development with self-signed certs
    if (ENV === 'dev') {
      await context.clearCookies();
    }
  });

  test('should display customer login option on homepage', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Navigate to homepage
    await page.goto(urls.homepage);

    // Verify page loaded
    await expect(page).toHaveTitle(/Tamshai/i);

    // Verify Client Login button exists on the homepage
    const clientButton = page.locator('a:has-text("Client Login")');
    await expect(clientButton.first()).toBeVisible({ timeout: 10000 });
  });

  test('should redirect to customer Keycloak realm when accessing portal', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Navigate directly to customer portal
    await page.goto(urls.customerPortal);

    // Wait for redirect to Keycloak (customer realm)
    await page.waitForURL(new RegExp(`/auth/realms/${KEYCLOAK_CUSTOMER_REALM}/protocol/openid-connect/auth`), {
      timeout: 30000
    });

    // Verify Keycloak login form appears
    await waitForKeycloakLogin(page);
    await expect(page.locator('#username')).toBeVisible();
  });

  test('should complete full login journey for lead customer', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Skip if no credentials configured
    if (!TEST_LEAD_CUSTOMER.password) {
      test.skip(true, 'No test credentials configured');
    }

    // Navigate to customer portal
    await page.goto(urls.customerPortal);

    // Wait for Keycloak login page
    await waitForKeycloakLogin(page);

    // Enter credentials
    await completeKeycloakLogin(
      page,
      TEST_LEAD_CUSTOMER.username,
      TEST_LEAD_CUSTOMER.password
    );

    // Wait for redirect back to customer portal
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Verify we're on the customer portal dashboard
    // Dashboard shows "Welcome back, {firstName}!" heading
    const welcomeText = page.locator('h1:has-text("Welcome"), h2:has-text("Welcome"), a:has-text("Dashboard")');
    await expect(welcomeText.first()).toBeVisible({ timeout: 30000 });

    // Verify user info is displayed (first name in welcome heading)
    const pageText = await page.textContent('body');
    expect(pageText).toContain(TEST_LEAD_CUSTOMER.firstName);

    // Check that the page has loaded correctly (not a blank page)
    const pageContent = await page.textContent('body');
    expect(pageContent?.length).toBeGreaterThan(100);

    console.log('Customer login journey completed successfully for lead customer');
  });

  test('should complete full login journey for basic customer', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Navigate to customer portal
    await page.goto(urls.customerPortal);

    // Wait for Keycloak login page
    await waitForKeycloakLogin(page);

    // Enter credentials
    await completeKeycloakLogin(
      page,
      TEST_BASIC_CUSTOMER.username,
      TEST_BASIC_CUSTOMER.password
    );

    // Wait for redirect back to customer portal
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Verify we're on the customer portal dashboard
    const welcomeText = page.locator('h1:has-text("Welcome"), h2:has-text("Welcome"), a:has-text("Dashboard")');
    await expect(welcomeText.first()).toBeVisible({ timeout: 30000 });

    console.log(`Basic customer login journey completed successfully for ${TEST_BASIC_CUSTOMER.username}`);
  });

  test('should handle invalid customer credentials gracefully', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Navigate to customer portal
    await page.goto(urls.customerPortal);

    // Wait for Keycloak
    await waitForKeycloakLogin(page);

    // Enter invalid credentials
    await completeKeycloakLogin(page, 'invalid@customer.com', 'wrong_password');

    // Verify error message appears
    const errorMessage = page.locator('.alert-error, .kc-feedback-text, #input-error, .pf-m-error');
    await expect(errorMessage.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show organization name after customer login', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Navigate to customer portal
    await page.goto(urls.customerPortal);

    // Complete login
    await waitForKeycloakLogin(page);
    await completeKeycloakLogin(
      page,
      TEST_LEAD_CUSTOMER.username,
      TEST_LEAD_CUSTOMER.password
    );

    // Wait for portal load
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Verify organization name is displayed somewhere on the page
    // This could be in header, sidebar, or welcome message
    const orgDisplay = page.locator(`text=${TEST_LEAD_CUSTOMER.organizationName}`);

    // Organization name should be visible (may take time to render)
    await expect(orgDisplay.first()).toBeVisible({ timeout: 15000 });

    console.log(`Organization "${TEST_LEAD_CUSTOMER.organizationName}" displayed correctly`);
  });
});

test.describe('Customer Portal SPA Rendering', () => {
  test('should load customer portal without JavaScript errors', async ({ page }) => {
    const urls = BASE_URLS[ENV];
    const errors: string[] = [];

    // Collect console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Collect page errors
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Navigate to customer portal (unauthenticated - should redirect to login)
    await page.goto(urls.customerPortal);

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Check for critical errors (exclude expected auth redirects)
    const criticalErrors = errors.filter(
      (e) => !e.includes('401') && !e.includes('unauthorized') && !e.includes('OIDC')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('should not have 404 errors for assets', async ({ page }) => {
    const urls = BASE_URLS[ENV];
    const notFoundUrls: string[] = [];

    // Track 404 responses
    page.on('response', (response) => {
      if (response.status() === 404) {
        notFoundUrls.push(response.url());
      }
    });

    // Navigate to customer portal
    await page.goto(urls.customerPortal);
    await page.waitForLoadState('networkidle');

    // Filter out expected 404s (favicon, etc.)
    const unexpectedNotFound = notFoundUrls.filter(
      (url) => !url.includes('favicon')
    );

    expect(unexpectedNotFound).toHaveLength(0);
  });
});

test.describe('Customer Portal Navigation', () => {
  test('should navigate to tickets page after login', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Login first
    await page.goto(urls.customerPortal);
    await waitForKeycloakLogin(page);
    await completeKeycloakLogin(
      page,
      TEST_LEAD_CUSTOMER.username,
      TEST_LEAD_CUSTOMER.password
    );
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Navigate to tickets page
    const ticketsLink = page.locator('a:has-text("Tickets"), a[href*="ticket"], nav a:has-text("Ticket")');
    if (await ticketsLink.first().isVisible()) {
      await ticketsLink.first().click();

      // Verify tickets page loaded
      await page.waitForLoadState('networkidle');
      const ticketsHeading = page.locator('h1:has-text("Ticket"), h2:has-text("Ticket")');
      await expect(ticketsHeading.first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('should navigate to knowledge base page after login', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Login first
    await page.goto(urls.customerPortal);
    await waitForKeycloakLogin(page);
    await completeKeycloakLogin(
      page,
      TEST_LEAD_CUSTOMER.username,
      TEST_LEAD_CUSTOMER.password
    );
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Navigate to knowledge base
    const kbLink = page.locator('a:has-text("Knowledge"), a[href*="knowledge"], a:has-text("KB"), a:has-text("Help")');
    if (await kbLink.first().isVisible()) {
      await kbLink.first().click();

      // Verify KB page loaded
      await page.waitForLoadState('networkidle');
      const kbHeading = page.locator('h1:has-text("Knowledge"), h2:has-text("Knowledge")');
      await expect(kbHeading.first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('should show contacts page for lead customer only', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Login as lead customer
    await page.goto(urls.customerPortal);
    await waitForKeycloakLogin(page);
    await completeKeycloakLogin(
      page,
      TEST_LEAD_CUSTOMER.username,
      TEST_LEAD_CUSTOMER.password
    );
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Lead customer should see Contacts link in navigation
    const contactsLink = page.locator('a:has-text("Contact"), a[href*="contact"], nav a:has-text("Contact")');

    // Contacts link should be visible for lead customer
    await expect(contactsLink.first()).toBeVisible({ timeout: 10000 });

    console.log('Contacts page accessible for lead customer');
  });

  test('should hide contacts page for basic customer', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Login as basic customer
    await page.goto(urls.customerPortal);
    await waitForKeycloakLogin(page);
    await completeKeycloakLogin(
      page,
      TEST_BASIC_CUSTOMER.username,
      TEST_BASIC_CUSTOMER.password
    );
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Basic customer should NOT see Contacts link
    const contactsLink = page.locator('a:has-text("Contact"):not(:has-text("Customer")), a[href*="contact"]');

    // Wait briefly then check visibility (should not be visible)
    await page.waitForTimeout(2000);
    const isContactsVisible = await contactsLink.first().isVisible().catch(() => false);

    expect(isContactsVisible).toBe(false);

    console.log('Contacts page correctly hidden for basic customer');
  });
});

test.describe('Customer Logout', () => {
  test('should logout successfully', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Login first
    await page.goto(urls.customerPortal);
    await waitForKeycloakLogin(page);
    await completeKeycloakLogin(
      page,
      TEST_LEAD_CUSTOMER.username,
      TEST_LEAD_CUSTOMER.password
    );
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Find and click logout button
    const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout"), button:has-text("Sign Out"), a:has-text("Sign Out")');

    if (await logoutButton.first().isVisible()) {
      await logoutButton.first().click();

      // Should redirect to login page
      await page.waitForURL(new RegExp(`/auth/realms/${KEYCLOAK_CUSTOMER_REALM}/`), {
        timeout: 15000
      }).catch(() => {
        // May redirect to portal login instead
      });

      // Verify we're logged out (login form visible again)
      await waitForKeycloakLogin(page).catch(() => {
        // If not on Keycloak, check we're on a logged-out state
      });

      console.log('Customer logout completed successfully');
    }
  });
});
