import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load environment variables from .env file (for local development)
// quiet: true suppresses the verbose dotenv log messages
dotenv.config({ quiet: true });

// Determine environment from TEST_ENV
const testEnv = process.env.TEST_ENV || 'dev';

// Base URLs per environment
const envConfig: Record<string, { baseURL: string; ignoreHTTPSErrors: boolean }> = {
  dev: {
    baseURL: 'https://www.tamshai.local',
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
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60000, // 60 seconds per test (login can be slow)
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ...(process.env.CI ? [['github' as const]] : []),
  ],
  use: {
    baseURL: envConfig[testEnv]?.baseURL || 'https://www.tamshai.local',
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
    url: 'http://localhost:3100/health',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
