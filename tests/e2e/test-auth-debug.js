/**
 * Debug script to test authentication flow
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../../infrastructure/docker/.env') });

const testUsername = process.env.TEST_USERNAME || 'test-user.journey';
const testPassword = process.env.TEST_USER_PASSWORD || '';

const BASE_URL = 'https://www.tamshai.local';

async function testAuth() {
  console.log(`Testing authentication for ${testUsername}...`);
  console.log(`Password available: ${testPassword ? 'YES' : 'NO'}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    // Navigate to portal
    console.log('Navigating to portal...');
    await page.goto(`${BASE_URL}/app/`, { timeout: 30000 });

    // Wait for login form
    console.log('Waiting for login form...');
    await page.waitForSelector('#username, input[name="username"]', { timeout: 10000 });

    console.log('Filling credentials...');
    await page.fill('#username, input[name="username"]', testUsername);
    await page.fill('#password, input[name="password"]', testPassword);

    console.log('Clicking login...');
    await page.click('#kc-login, button[type="submit"]');

    // Check for TOTP
    console.log('Checking for TOTP requirement...');
    try {
      const otpInput = await page.waitForSelector('#otp, input[name="otp"]', { timeout: 5000 });

      if (otpInput) {
        console.log('TOTP required - checking for secret...');

        // Load secret from cache
        const secretFile = path.join(__dirname, '.totp-secrets', `${testUsername}-dev.secret`);
        if (fs.existsSync(secretFile)) {
          const secret = fs.readFileSync(secretFile, 'utf-8').trim();
          console.log(`Secret loaded from cache: ${secret.substring(0, 10)}...`);

          // Generate TOTP code using otplib
          const { authenticator } = require('otplib');
          authenticator.options = { digits: 6, step: 30, algorithm: 'sha1' };
          const code = authenticator.generate(secret);
          console.log(`Generated TOTP code: ${code}`);

          await page.fill('#otp, input[name="otp"]', code);
          await page.click('#kc-login, button[type="submit"]');
        } else {
          console.log('ERROR: No TOTP secret cached');
          return;
        }
      }
    } catch (e) {
      console.log('No TOTP required or already authenticated');
    }

    // Wait for redirect
    console.log('Waiting for authentication to complete...');
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const currentUrl = page.url();
    const title = await page.title();

    console.log(`\nAuthentication result:`);
    console.log(`Current URL: ${currentUrl}`);
    console.log(`Page title: ${title}`);

    if (currentUrl.includes('/app/') && !currentUrl.includes('auth')) {
      console.log('✅ SUCCESS: Authentication completed');
    } else {
      console.log('❌ FAILED: Still on Keycloak login page');

      // Take screenshot for debugging
      await page.screenshot({ path: 'auth-failed.png' });
      console.log('Screenshot saved to auth-failed.png');
    }

    // Keep browser open for inspection
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('Error during authentication:', error.message);
    await page.screenshot({ path: 'auth-error.png' });
  } finally {
    await browser.close();
  }
}

testAuth().catch(console.error);
