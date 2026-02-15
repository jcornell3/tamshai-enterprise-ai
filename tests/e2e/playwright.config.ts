import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from infrastructure .env (ports, secrets)
// then local .env (test-specific overrides). Later calls don't overwrite existing vars.
dotenv.config({ path: path.resolve(__dirname, '../../infrastructure/docker/.env'), quiet: true });
dotenv.config({ quiet: true });

// Determine environment from TEST_ENV
const testEnv = process.env.TEST_ENV || 'dev';

// Port configuration from environment (set by Terraform in .env)
const PORT_CADDY_HTTPS = process.env.PORT_CADDY_HTTPS || '8443';
const PORT_MCP_GATEWAY = process.env.PORT_MCP_GATEWAY || '3100';

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
  timeout: 60000, // 60 seconds per test (login can be slow)
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ...(process.env.CI ? [['github' as const]] : []),
  ],
  use: {
    baseURL: envConfig[testEnv]?.baseURL || `https://www.tamshai.local:${PORT_CADDY_HTTPS}`,
    ignoreHTTPSErrors: envConfig[testEnv]?.ignoreHTTPSErrors ?? true,
    trace: 'on-first-retry',
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

  // Only start web server for dev environment (not for stage/prod/CI)
  webServer: process.env.CI || testEnv !== 'dev' ? undefined : {
    command: 'cd ../../infrastructure/docker && docker compose up -d mcp-gateway',
    url: `http://localhost:${PORT_MCP_GATEWAY}/health`,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
