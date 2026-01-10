/**
 * E2E Login Journey Test
 *
 * Tests the full employee login flow including:
 * - Navigation to employee login page
 * - SSO redirect to Keycloak
 * - Keycloak authentication (username/password + TOTP)
 * - Redirect back to portal
 * - User info verification
 *
 * TOTP Handling:
 * - Dev: Uses known shared TOTP secret to generate codes
 * - Stage: TOTP secret not retrievable via API - see docs/operations/IDENTITY_SYNC.md
 */

import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';
import { authenticator } from 'otplib';

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';
const BASE_URLS: Record<string, { app: string; keycloak: string }> = {
  dev: {
    app: 'https://www.tamshai.local',
    keycloak: 'https://www.tamshai.local/auth',
  },
  stage: {
    app: 'https://www.tamshai.com',
    keycloak: 'https://www.tamshai.com/auth',
  },
  prod: {
    app: 'https://prod.tamshai.com',
    keycloak: 'https://keycloak-fn44nd7wba-uc.a.run.app/auth',
  },
};

// Test credentials - loaded from environment or defaults for dev
const TEST_USER = {
  username: process.env.TEST_USERNAME || 'eve.thompson',
  password: process.env.TEST_PASSWORD || 'password123',
  // TOTP secret - only available for dev environment
  // For stage/prod, this would need to be retrieved from a secrets manager
  totpSecret: process.env.TEST_TOTP_SECRET || '',
};

/**
 * Check if oathtool is available on the system
 */
function isOathtoolAvailable(): boolean {
  try {
    execSync('oathtool --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a TOTP code from the secret
 *
 * Prefers system oathtool command (more reliable, matches authenticator apps)
 * but falls back to otplib for CI/CD environments where oathtool isn't installed.
 *
 * @param secret - Base32-encoded TOTP secret
 * @returns 6-digit TOTP code
 */
function generateTotpCode(secret: string): string {
  if (!secret) {
    throw new Error('TOTP secret is required but not provided');
  }

  // Try oathtool first (local development)
  if (isOathtoolAvailable()) {
    try {
      // Use oathtool to generate TOTP code
      // --totp: Generate TOTP (time-based one-time password)
      // --base32: Secret is base32-encoded (standard for TOTP)
      const totpCode = execSync(`oathtool --totp --base32 "${secret}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!/^\d{6}$/.test(totpCode)) {
        throw new Error(`Invalid TOTP code generated: ${totpCode}`);
      }

      console.log('Generated TOTP code using oathtool');
      return totpCode;
    } catch (error: any) {
      console.warn(`oathtool failed, falling back to otplib: ${error.message}`);
    }
  }

  // Fallback to otplib (CI/CD environments)
  try {
    const algorithm = process.env.TEST_TOTP_ALGORITHM || 'sha1';
    authenticator.options = {
      digits: 6,
      step: 30,
      algorithm: algorithm,
    };
    const totpCode = authenticator.generate(secret);
    console.log('Generated TOTP code using otplib (fallback)');
    return totpCode;
  } catch (error: any) {
    throw new Error(
      `Failed to generate TOTP code: ${error.message}\n` +
      `Tried both oathtool and otplib. Secret provided: ${secret.substring(0, 4)}...`
    );
  }
}

/**
 * Wait for Keycloak login page to load
 */
async function waitForKeycloakLogin(page: Page): Promise<void> {
  await page.waitForSelector('#username', { state: 'visible', timeout: 30000 });
  await page.waitForSelector('#password', { state: 'visible', timeout: 5000 });
}

/**
 * Complete Keycloak login form
 */
async function completeKeycloakLogin(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#kc-login');
}

/**
 * Handle TOTP if required
 */
async function handleTotpIfRequired(
  page: Page,
  totpSecret: string
): Promise<boolean> {
  // Check if TOTP page appears (wait briefly)
  try {
    const otpInput = await page.waitForSelector('#otp', {
      state: 'visible',
      timeout: 5000,
    });

    if (otpInput) {
      if (!totpSecret) {
        throw new Error(
          'TOTP is required but no secret provided. Set TEST_TOTP_SECRET environment variable.'
        );
      }

      const totpCode = generateTotpCode(totpSecret);
      await page.fill('#otp', totpCode);
      await page.click('#kc-login');
      return true;
    }
  } catch {
    // No TOTP required - continue
  }
  return false;
}

test.describe('Employee Login Journey', () => {
  test.beforeEach(async ({ context }) => {
    // Ignore HTTPS errors for local development with self-signed certs
    if (ENV === 'dev') {
      await context.clearCookies();
    }
  });

  test('should display employee login page with SSO button', async ({
    page,
  }) => {
    const urls = BASE_URLS[ENV];

    // Navigate to employee login page
    await page.goto(`${urls.app}/employee-login.html`);

    // Verify page loaded
    await expect(page).toHaveTitle(/Tamshai/i);

    // Verify SSO button exists (button text is "Sign in with SSO")
    const ssoButton = page.locator('a.sso-btn, a:has-text("Sign in with SSO")');
    await expect(ssoButton.first()).toBeVisible();
  });

  test('should redirect to Keycloak when clicking SSO', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Navigate to employee login
    await page.goto(`${urls.app}/employee-login.html`);

    // Click SSO button (goes to /app/ which redirects to Keycloak)
    const ssoButton = page.locator('a.sso-btn, a:has-text("Sign in with SSO")');
    await ssoButton.first().click();

    // Wait for redirect to Keycloak (portal redirects to Keycloak for auth)
    await page.waitForURL(/\/auth\/realms\/tamshai-corp\/protocol\/openid-connect\/auth/, { timeout: 30000 });

    // Verify Keycloak login form appears
    await waitForKeycloakLogin(page);
    await expect(page.locator('#username')).toBeVisible();
  });

  test('should complete full login journey with credentials', async ({
    page,
  }) => {
    const urls = BASE_URLS[ENV];

    // Skip if no credentials configured
    if (!TEST_USER.password) {
      test.skip(true, 'No test credentials configured');
    }

    // Start at employee login page
    await page.goto(`${urls.app}/employee-login.html`);

    // Click SSO button to go to Keycloak
    const ssoButton = page.locator('a.sso-btn, a:has-text("Sign in with SSO")');
    await ssoButton.first().click();

    // Wait for Keycloak login page
    await waitForKeycloakLogin(page);

    // Enter credentials
    await completeKeycloakLogin(page, TEST_USER.username, TEST_USER.password);

    // Handle TOTP if required
    const totpHandled = await handleTotpIfRequired(page, TEST_USER.totpSecret);
    if (totpHandled) {
      console.log('TOTP authentication completed');
    }

    // Wait for redirect back to portal - check for portal content instead of strict URL
    // The portal may take time to fully load after OAuth redirect
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Verify we're on the portal by checking for portal-specific content
    // The portal shows "Available Applications" heading when logged in
    const portalHeading = page.locator('h2:has-text("Available Applications")');
    await expect(portalHeading).toBeVisible({ timeout: 30000 });

    // Verify user info is displayed
    const userDisplay = page.locator(`text=${TEST_USER.username}`);
    await expect(userDisplay).toBeVisible({ timeout: 10000 });

    // Check that the page has loaded correctly (not a blank page)
    const pageContent = await page.textContent('body');
    expect(pageContent?.length).toBeGreaterThan(100);

    console.log(`Login journey completed successfully for ${TEST_USER.username}`);
  });

  test('should handle invalid credentials gracefully', async ({ page }) => {
    const urls = BASE_URLS[ENV];

    // Navigate to login
    await page.goto(`${urls.app}/employee-login.html`);

    // Click SSO
    const ssoButton = page.locator('a.sso-btn, a:has-text("Sign in with SSO")');
    await ssoButton.first().click();

    // Wait for Keycloak
    await waitForKeycloakLogin(page);

    // Enter invalid credentials
    await completeKeycloakLogin(page, 'invalid_user', 'wrong_password');

    // Verify error message appears
    const errorMessage = page.locator('.alert-error, .kc-feedback-text, #input-error');
    await expect(errorMessage.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Portal SPA Rendering', () => {
  test('should load portal without JavaScript errors', async ({ page }) => {
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

    // Navigate to portal (unauthenticated - should redirect to login)
    await page.goto(`${urls.app}/app/`);

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Check for critical errors (exclude expected auth redirects)
    const criticalErrors = errors.filter(
      (e) => !e.includes('401') && !e.includes('unauthorized')
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

    // Navigate to portal
    await page.goto(`${urls.app}/app/`);
    await page.waitForLoadState('networkidle');

    // No assets should 404
    expect(notFoundUrls).toHaveLength(0);
  });
});
