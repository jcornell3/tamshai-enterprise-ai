/**
 * Authenticated Fixture
 *
 * Provides pre-authenticated Page context for E2E tests.
 * Reuses authentication state across tests for performance.
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * @example
 * ```typescript
 * import { test, expect } from '../fixtures/authenticated';
 *
 * test('should show dashboard', async ({ authenticatedPage }) => {
 *   await authenticatedPage.goto('/app/finance');
 *   await expect(authenticatedPage.locator('h1')).toContainText('Finance');
 * });
 * ```
 */

import { test as base, Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';
const STORAGE_STATE_PATH = path.join(__dirname, '..', '.auth', `${ENV}-storage.json`);

const BASE_URLS: Record<string, { site: string; app: string; keycloak: string }> = {
  dev: {
    site: 'https://www.tamshai-playground.local:8443',
    app: 'https://www.tamshai-playground.local:8443/app',
    keycloak: 'https://www.tamshai-playground.local:8443/auth',
  },
  stage: {
    site: 'https://www.tamshai.com',
    app: 'https://www.tamshai.com/app',
    keycloak: 'https://www.tamshai.com/auth',
  },
  prod: {
    site: 'https://app.tamshai.com',
    app: 'https://app.tamshai.com/app',
    keycloak: 'https://keycloak-fn44nd7wba-uc.a.run.app/auth',
  },
};

// Test user credentials
const TEST_USER = {
  username: process.env.TEST_USERNAME || 'test-user.journey',
  password: process.env.TEST_USER_PASSWORD || '',
  totpSecret: process.env.TEST_USER_TOTP_SECRET || '',
};

// Role-based test users for different access levels
export const TEST_USERS = {
  executive: {
    username: process.env.EXEC_USER || 'eve.thompson',
    password: process.env.EXEC_PASSWORD || '',
  },
  hrManager: {
    username: process.env.HR_USER || 'alice.chen',
    password: process.env.HR_PASSWORD || '',
  },
  financeManager: {
    username: process.env.FINANCE_USER || 'bob.martinez',
    password: process.env.FINANCE_PASSWORD || '',
  },
  salesManager: {
    username: process.env.SALES_USER || 'carol.johnson',
    password: process.env.SALES_PASSWORD || '',
  },
  supportManager: {
    username: process.env.SUPPORT_USER || 'dan.williams',
    password: process.env.SUPPORT_PASSWORD || '',
  },
};

// Type definitions for custom fixtures
type AuthenticatedFixtures = {
  authenticatedPage: Page;
  authenticatedContext: BrowserContext;
};

/**
 * Perform Keycloak login programmatically
 *
 * @param page - Playwright Page instance
 * @param username - User's username
 * @param password - User's password
 * @param totpSecret - Optional TOTP secret for MFA
 */
async function performLogin(
  page: Page,
  username: string,
  password: string,
  totpSecret?: string
): Promise<void> {
  const urls = BASE_URLS[ENV];

  // Navigate to app (will redirect to Keycloak)
  await page.goto(urls.app);

  // Wait for Keycloak login page
  await page.waitForSelector('#username, input[name="username"]', {
    state: 'visible',
    timeout: 30000,
  });

  // Enter credentials
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#kc-login, button[type="submit"]');

  // Handle TOTP if required
  if (totpSecret) {
    try {
      const otpInput = await page.waitForSelector('#otp, input[name="otp"]', {
        state: 'visible',
        timeout: 5000,
      });

      if (otpInput) {
        // Generate TOTP code (simplified - in real impl would use oathtool/otplib)
        const { authenticator } = await import('otplib');
        const code = authenticator.generate(totpSecret);
        await page.fill('#otp, input[name="otp"]', code);
        await page.click('button[type="submit"]');
      }
    } catch {
      // No TOTP required
    }
  }

  // Wait for redirect back to app
  await page.waitForLoadState('networkidle', { timeout: 30000 });
}

/**
 * Check if storage state exists and is still valid
 */
function isStorageStateValid(): boolean {
  try {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      return false;
    }

    const stats = fs.statSync(STORAGE_STATE_PATH);
    const ageMs = Date.now() - stats.mtimeMs;
    const maxAgeMs = 30 * 60 * 1000; // 30 minutes

    return ageMs < maxAgeMs;
  } catch {
    return false;
  }
}

/**
 * Create authenticated test fixture
 *
 * Extends Playwright's base test with pre-authenticated context.
 * Caches authentication state to avoid repeated logins.
 */
export const test = base.extend<AuthenticatedFixtures>({
  authenticatedContext: async ({ browser }, use) => {
    // Try to use cached storage state
    if (isStorageStateValid()) {
      const context = await browser.newContext({
        storageState: STORAGE_STATE_PATH,
        ignoreHTTPSErrors: ENV === 'dev',
      });
      await use(context);
      await context.close();
      return;
    }

    // Create fresh context and authenticate
    const context = await browser.newContext({
      ignoreHTTPSErrors: ENV === 'dev',
    });

    const page = await context.newPage();

    // Perform login
    await performLogin(
      page,
      TEST_USER.username,
      TEST_USER.password,
      TEST_USER.totpSecret
    );

    // Save storage state for reuse
    const authDir = path.dirname(STORAGE_STATE_PATH);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    await context.storageState({ path: STORAGE_STATE_PATH });

    await page.close();
    await use(context);
    await context.close();
  },

  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
export { BASE_URLS, TEST_USER };
