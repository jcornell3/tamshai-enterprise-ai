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
import * as fs from 'fs';
import * as path from 'path';

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

// Directory for persisting TOTP secrets per environment
const TOTP_SECRETS_DIR = path.join(__dirname, '..', '.totp-secrets');

// Test credentials - using test-user.journey service account (exists in all environments)
// See docs/testing/TEST_USER_JOURNEY.md for details
const TEST_USER = {
  username: process.env.TEST_USERNAME || 'test-user.journey',
  password: process.env.TEST_PASSWORD || '***REDACTED_PASSWORD***',
  // TOTP secret for test-user.journey (same across all environments)
  totpSecret: process.env.TEST_TOTP_SECRET || 'JBSWY3DPEHPK3PXP',
};

/**
 * Save TOTP secret to file for reuse in subsequent test runs
 */
function saveTotpSecret(username: string, environment: string, secret: string): void {
  try {
    if (!fs.existsSync(TOTP_SECRETS_DIR)) {
      fs.mkdirSync(TOTP_SECRETS_DIR, { recursive: true });
    }

    const secretFile = path.join(TOTP_SECRETS_DIR, `${username}-${environment}.secret`);
    fs.writeFileSync(secretFile, secret, 'utf-8');
    console.log(`Saved TOTP secret to ${secretFile}`);
  } catch (error: any) {
    console.warn(`Failed to save TOTP secret: ${error.message}`);
  }
}

/**
 * Load previously saved TOTP secret from file
 */
function loadTotpSecret(username: string, environment: string): string | null {
  try {
    const secretFile = path.join(TOTP_SECRETS_DIR, `${username}-${environment}.secret`);
    if (fs.existsSync(secretFile)) {
      const secret = fs.readFileSync(secretFile, 'utf-8').trim();
      console.log(`Loaded TOTP secret from ${secretFile}: ${secret.substring(0, 4)}****`);
      return secret;
    }
  } catch (error: any) {
    console.warn(`Failed to load TOTP secret: ${error.message}`);
  }
  return null;
}

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
 * IMPORTANT: Always uses SHA1 algorithm (RFC 6238 standard)
 * - oathtool only supports SHA1 (not SHA256 or SHA512)
 * - Google Authenticator uses SHA1 by default
 * - Keycloak is configured to use SHA1 for TOTP (see keycloak/realm-export.json)
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
  // NOTE: oathtool ONLY supports SHA1 algorithm - cannot specify other algorithms
  if (isOathtoolAvailable()) {
    try {
      // Use oathtool to generate TOTP code
      // oathtool takes the base32 secret as a positional argument
      // No flags needed - it defaults to TOTP with SHA1 algorithm
      const totpCode = execSync(`oathtool "${secret}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!/^\d{6}$/.test(totpCode)) {
        throw new Error(`Invalid TOTP code generated: ${totpCode}`);
      }

      console.log('Generated TOTP code using oathtool (SHA1)');
      return totpCode;
    } catch (error: any) {
      console.warn(`oathtool failed, falling back to otplib: ${error.message}`);
    }
  }

  // Fallback to otplib (CI/CD environments)
  try {
    // CRITICAL: Force SHA1 algorithm to match oathtool and Keycloak configuration
    authenticator.options = {
      digits: 6,
      step: 30,
      algorithm: 'sha1',  // Must be 'sha1' to match oathtool and Keycloak
    };
    const totpCode = authenticator.generate(secret);
    console.log('Generated TOTP code using otplib (SHA1 fallback)');
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
 * Uses flexible selectors that work across different Keycloak versions
 */
async function waitForKeycloakLogin(page: Page): Promise<void> {
  // Wait for either the ID-based selector (#username) or the label-based selector
  await page.waitForSelector('#username, input[name="username"], [placeholder*="sername" i], [aria-label*="sername" i]', {
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
 * Uses flexible selectors that work across different Keycloak versions
 */
async function completeKeycloakLogin(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  // Try multiple selectors for username field
  const usernameSelector = '#username, input[name="username"], [placeholder*="sername" i]';
  await page.fill(usernameSelector, username);

  // Try multiple selectors for password field
  const passwordSelector = '#password, input[name="password"], input[type="password"]';
  await page.fill(passwordSelector, password);

  // Click login button - try multiple selectors
  const loginButtonSelector = '#kc-login, button[type="submit"], button:has-text("Sign In")';
  await page.click(loginButtonSelector);
}

/**
 * Handle TOTP setup if required
 * Captures the TOTP secret from Keycloak's setup page
 */
async function handleTotpSetupIfRequired(page: Page): Promise<string | null> {
  try {
    // Check if we're on the OTP setup page (Mobile Authenticator Setup heading)
    const setupHeading = await page.waitForSelector('h1:has-text("Mobile Authenticator Setup"), heading:has-text("Mobile Authenticator")', {
      state: 'visible',
      timeout: 5000,
    });

    if (!setupHeading) {
      return null;
    }

    console.log('*** TOTP SETUP PAGE DETECTED - CONFIGURING TOTP ***');

    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/totp-setup-before-extraction.png' });

    // Check if we're in QR mode or text mode
    const scanBarcodeLink = await page.locator('a:has-text("Scan barcode?")').count();
    const unableToScanLink = await page.locator('a:has-text("Unable to scan?")').count();

    if (unableToScanLink > 0) {
      // We're in QR mode - click to reveal text
      console.log('Clicking "Unable to scan?" to reveal text secret');
      await page.locator('a:has-text("Unable to scan?")').first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/totp-setup-after-click.png' });
    } else if (scanBarcodeLink > 0) {
      // We're already in text mode - secret is visible
      console.log('Already in text mode - secret is visible');
    }

    // Extract TOTP secret from page content
    // The secret appears as space-separated groups: "NNBT I52J IM3U 25CJ MZFD ORKX G5XE W4LT"
    const pageContent = await page.textContent('body');

    // Look for base32 pattern with optional spaces (8 groups of 4 characters)
    const spacedMatch = pageContent?.match(/([A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4})/);
    // Also try without spaces
    const compactMatch = pageContent?.match(/([A-Z2-7]{32})/);

    let totpSecret = '';
    if (spacedMatch) {
      // Remove spaces from the matched secret
      totpSecret = spacedMatch[0].replace(/\s+/g, '');
      console.log('Found space-separated secret in page content');
    } else if (compactMatch) {
      totpSecret = compactMatch[0];
      console.log('Found compact secret in page content');
    }

    if (!totpSecret || !/^[A-Z2-7]{32}$/.test(totpSecret)) {
      await page.screenshot({ path: 'test-results/totp-extraction-failed.png' });
      throw new Error('Could not extract TOTP secret from setup page');
    }

    console.log(`Captured TOTP secret: ${totpSecret.substring(0, 4)}...${totpSecret.substring(28)}`);

    // Generate OTP code using the secret
    const totpCode = generateTotpCode(totpSecret);
    console.log(`Generated setup code: ${totpCode.substring(0, 2)}****`);

    // Enter the OTP code to complete setup
    const otpInput = page.locator('#totp, input[name="totp"], input[type="text"]').first();
    await otpInput.fill(totpCode);

    // Click submit to complete setup
    const submitButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit")');
    await submitButton.first().click();

    // Wait for navigation after submit
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    console.log('TOTP setup completed successfully');
    return totpSecret;
  } catch (error: any) {
    // Not on setup page or setup not required
    if (error.message?.includes('Timeout') || error.message?.includes('waiting for')) {
      return null;
    }
    console.error(`TOTP setup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Handle TOTP if required
 * Uses flexible selectors that work across different Keycloak versions
 */
async function handleTotpIfRequired(
  page: Page,
  totpSecret: string
): Promise<boolean> {
  // Check if TOTP page appears (wait briefly)
  try {
    // Try multiple selectors for OTP field
    const otpSelector = '#otp, input[name="otp"], input[name="totp"], input[autocomplete="one-time-code"]';
    const otpInput = await page.waitForSelector(otpSelector, {
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
      console.log(`Filling TOTP code: ${totpCode.substring(0, 2)}****`);
      await page.fill(otpSelector, totpCode);

      // Click submit button
      const submitSelector = '#kc-login, button[type="submit"], button:has-text("Sign In"), button:has-text("Submit")';
      await page.click(submitSelector);
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

    // Wait briefly for potential authentication errors
    // If credentials are invalid, the test will fail at the next assertion with a clear error
    await page.waitForTimeout(1000);

    // Try to load previously saved TOTP secret from file
    // This enables test resilience: if TOTP was configured in a previous run,
    // we use that secret instead of the default TEST_TOTP_SECRET
    let effectiveTotpSecret = loadTotpSecret(TEST_USER.username, ENV) || TEST_USER.totpSecret;
    console.log(`Using TOTP secret: ${effectiveTotpSecret.substring(0, 4)}****`);

    // Check if TOTP setup is required (first time login or forced reconfiguration)
    const capturedSecret = await handleTotpSetupIfRequired(page);

    if (capturedSecret) {
      console.log('TOTP setup completed, captured new secret');
      effectiveTotpSecret = capturedSecret;
      // Save the captured secret for use in subsequent test runs
      saveTotpSecret(TEST_USER.username, ENV, capturedSecret);
    }

    // Handle TOTP if required (subsequent logins after setup)
    const totpHandled = await handleTotpIfRequired(page, effectiveTotpSecret);
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
