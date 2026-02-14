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
 */
export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './specs',
  // IMPORTANT: E2E tests must run sequentially due to TOTP authentication
  // TOTP codes are time-based and auth sessions can conflict in parallel
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Always sequential for TOTP-based authentication
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
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.ui\.spec\.ts/,
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
