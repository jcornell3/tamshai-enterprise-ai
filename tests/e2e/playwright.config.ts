import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables:
// 1. Local tests/e2e/.env (test secrets — TOTP, passwords, client secrets)
// 2. Infrastructure .env (port variables for Docker Compose services)
// Later calls don't overwrite existing vars, so local .env takes precedence.
dotenv.config({ quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../infrastructure/docker/.env'), quiet: true });

// Validate required test secrets are present.
// These must come from tests/e2e/.env or direct env vars (e.g. CI secrets).
// Missing secrets indicate a configuration bug — hard-fail, don't silently skip.
const REQUIRED_SECRETS = [
  'TEST_USER_PASSWORD',
  'TEST_USER_TOTP_SECRET',
  'CUSTOMER_USER_PASSWORD',
  'MCP_INTEGRATION_RUNNER_SECRET',
];
const missing = REQUIRED_SECRETS.filter(k => !process.env[k]);
if (missing.length > 0) {
  throw new Error(
    `Missing required E2E secrets: ${missing.join(', ')}\n` +
    `Run: eval $(./scripts/secrets/read-github-secrets.sh --all --env)\n` +
    `Or populate tests/e2e/.env (see .env.example)`
  );
}

// Determine environment from TEST_ENV
const testEnv = process.env.TEST_ENV || 'dev';

// Port configuration from environment (set by Terraform in .env)
const PORT_CADDY_HTTPS = process.env.PORT_CADDY_HTTPS;
const PORT_MCP_GATEWAY = process.env.PORT_MCP_GATEWAY;

// Base URLs per environment
const envConfig: Record<string, { baseURL: string; ignoreHTTPSErrors: boolean }> = {
  dev: {
    baseURL: `https://www.tamshai.local:${PORT_CADDY_HTTPS}`,
    ignoreHTTPSErrors: true, // Self-signed certs in dev
  },
  stage: {
    baseURL: 'https://www.tamshai.com',
    ignoreHTTPSErrors: false,
  },
  prod: {
    baseURL: 'https://app.tamshai.com',
    ignoreHTTPSErrors: false,
  },
};

/**
 * Playwright E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 *
 * Worker strategy:
 *   - CI: 3 workers — api, customer, and employee projects run in parallel.
 *     API specs need no browser/TOTP. Customer specs use password-only auth (no TOTP).
 *     Employee specs share a TOTP secret and run sequentially within their worker,
 *     using ensureFreshTotpWindow() to avoid Keycloak code reuse rejections.
 *   - Local: 1 worker — sequential for simpler debugging.
 */
export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './specs',
  fullyParallel: false, // Sequential within each project (worker)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 3 : 1,
  timeout: 120_000, // 120s for SSO + streaming flows
  expect: { timeout: 15_000 },
  maxFailures: process.env.CI ? 5 : 0, // Stop early in CI after 5 failures
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ...(process.env.CI ? [['github' as const]] : []),
  ],
  use: {
    baseURL: envConfig[testEnv]?.baseURL || `https://www.tamshai.local:${PORT_CADDY_HTTPS}`,
    ignoreHTTPSErrors: envConfig[testEnv]?.ignoreHTTPSErrors ?? true,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
      // No browser, no TOTP — fully independent
    },
    {
      name: 'customer',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /customer-.*\.ui\.spec\.ts/,
      // Customer realm uses password-only auth (no TOTP conflict)
    },
    {
      name: 'employee',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /^(?!customer-).*\.ui\.spec\.ts/,
      // Employee specs share TOTP — sequential within this worker
    },
  ],
});
