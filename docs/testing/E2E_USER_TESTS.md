# E2E User Login Testing

This document describes the end-to-end testing approach for user login flows in Tamshai Enterprise AI, including handling TOTP (Time-based One-Time Password) authentication.

**Last Updated**: January 14, 2026

## Overview

The E2E login tests verify the complete SSO authentication flow:
1. User navigates to employee login page
2. Clicks "Sign in with SSO" button
3. Redirected to Keycloak for authentication
4. Enters username and password
5. Completes TOTP verification (or TOTP setup if not configured)
6. Redirected back to the portal
7. Portal displays user information and available applications

## TOTP Handling Strategy

### Current Approach: Auto-Capture (January 2026)

The E2E test framework automatically handles TOTP authentication:

1. **If TOTP is configured**: Uses secret from environment variable or cached file
2. **If TOTP setup page appears**: Auto-captures secret and completes setup

**Benefits**:
- No manual intervention required
- Works across all environments (dev, stage, prod)
- Secrets cached for subsequent test runs
- Phoenix-compliant (works after infrastructure rebuild)

### How Auto-Capture Works

```typescript
// Simplified flow in login-journey.ui.spec.ts
async function handleTotpSetupIfRequired(page: Page): Promise<string | null> {
  // 1. Check if we're on the TOTP setup page
  const isSetupPage = await page.locator('h1:has-text("Mobile Authenticator")').isVisible();

  if (isSetupPage) {
    // 2. Click "Unable to scan?" to reveal text secret
    await page.click('a:has-text("Unable to scan?")');

    // 3. Extract BASE32 secret from page content
    const pageContent = await page.textContent('body');
    const match = pageContent.match(/[A-Z2-7]{32}/);
    const totpSecret = match[0];

    // 4. Generate TOTP code using oathtool
    const totpCode = execSync(`oathtool --totp --base32 "${totpSecret}"`).trim();

    // 5. Submit code to complete setup
    await page.fill('input[name="totp"]', totpCode);
    await page.click('button[type="submit"]');

    // 6. Save secret for future runs
    fs.writeFileSync(`.totp-secrets/test-user-${env}.secret`, totpSecret);

    return totpSecret;
  }

  return null;
}
```

### Secret Loading Priority

The test framework looks for TOTP secrets in this order:

1. **Cached file**: `.totp-secrets/test-user.journey-{env}.secret`
2. **Environment variable**: `TEST_TOTP_SECRET`
3. **Auto-capture**: If setup page appears, extract and save

### Important: Single Worker Mode

**Always run login tests with `--workers=1`** to avoid session conflicts:

```bash
# CORRECT - single worker
npx playwright test login-journey.ui.spec.ts --workers=1

# WRONG - parallel workers cause authentication conflicts
npx playwright test login-journey.ui.spec.ts  # Uses default workers
```

**Why**: Multiple tests authenticating as the same user simultaneously causes:
- Session conflicts in Keycloak
- TOTP code reuse (30-second window)
- "Invalid authenticator code" errors

## Test Users

### test-user.journey (Dedicated E2E Account)

| Field | Value |
|-------|-------|
| Username | `test-user.journey` |
| Password | `***REDACTED_PASSWORD***` |
| TOTP Secret (BASE32) | `***REDACTED_TOTP_SECRET***` |
| Roles | None (tests authentication flow only) |

This account exists in all environments (dev, stage, prod) with identical credentials.

### Dev Environment Test Users

These users exist only in development and have data access roles:

| Username | Password | TOTP | Role |
|----------|----------|------|------|
| eve.thompson | [dev-password] | Enabled | Executive |
| alice.chen | [dev-password] | Enabled | HR |
| bob.martinez | [dev-password] | Enabled | Finance |

## Running E2E Tests

### Quick Start

```bash
cd tests/e2e

# Install dependencies (first time)
npm install
npx playwright install chromium

# Run login tests on dev
TEST_ENV=dev npm run test:login:dev

# Run login tests on prod (single worker required)
TEST_ENV=prod npx playwright test login-journey.ui.spec.ts --workers=1
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TEST_ENV` | Yes | Environment: `dev`, `stage`, or `prod` |
| `TEST_TOTP_SECRET` | No | BASE32 TOTP secret (auto-captured if not set) |
| `TEST_USERNAME` | No | Override username (default: `test-user.journey`) |
| `TEST_PASSWORD` | No | Override password (default: `***REDACTED_PASSWORD***`) |

### npm Scripts

```bash
# Login tests by environment
npm run test:login:dev    # https://www.tamshai.local
npm run test:login:stage  # https://www.tamshai.com
npm run test:login:prod   # https://app.tamshai.com

# All E2E tests
npm run test:dev
npm run test:stage
npm run test:prod

# Debug mode (step through tests)
npm run test:debug

# UI mode (interactive)
npm run test:ui
```

## TOTP Code Generation

### Using oathtool (Recommended)

```bash
# Install oathtool
# Ubuntu/Debian: sudo apt-get install oathtool
# macOS: brew install oath-toolkit
# Windows: Available in WSL or via Chocolatey

# Generate TOTP code
oathtool --totp --base32 "***REDACTED_TOTP_SECRET***"
# Output: 6-digit code (e.g., 123456)
```

### Manual Testing

```bash
# Get current TOTP code
oathtool --totp --base32 "$TEST_TOTP_SECRET"

# Copy to clipboard (macOS)
oathtool --totp --base32 "$TEST_TOTP_SECRET" | pbcopy

# Use in browser login
```

## Keycloak Database Schema

### credential Table

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) | Credential UUID |
| type | varchar(255) | Credential type: `password`, `otp` |
| user_id | varchar(36) | Foreign key to user_entity |
| secret_data | text | JSON: `{"value":"..."}` (only value field allowed) |
| credential_data | text | JSON: `{"subType":"totp","period":30,"digits":6,"algorithm":"HmacSHA1"}` |

**Important**: The `secret_data` field ONLY accepts the `value` field. Other TOTP parameters go in `credential_data`.

### Authentication Flows

Tamshai uses browser authentication with OTP:
- `browser-with-otp`: Username/password + TOTP (production)
- `browser`: Username/password only (development option)

## Troubleshooting

### "Invalid authenticator code"

**Cause**: Usually timing or parallel worker issues

**Solutions**:
1. Run with `--workers=1`
2. Verify system clock is synchronized
3. Wait for new 30-second window before retrying

### TOTP Setup Page Appears Unexpectedly

**Cause**: User doesn't have TOTP configured

**Solution**: The test framework auto-handles this. Let it capture and save the secret.

### "Mobile Authenticator Setup" on Every Test

**Cause**: Cached secret file doesn't exist or doesn't match

**Solution**: Delete `.totp-secrets/` directory and let test re-capture:
```bash
rm -rf tests/e2e/.totp-secrets/
```

### Authentication Timeout

**Cause**: Keycloak session expired or network issue

**Solution**:
1. Verify Keycloak is healthy: `curl https://auth.tamshai.com/auth/health/ready`
2. Check network connectivity
3. Increase test timeout if needed

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Login Tests

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  e2e-login:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd tests/e2e
          npm ci
          npx playwright install chromium

      - name: Install oathtool
        run: sudo apt-get update && sudo apt-get install -y oathtool

      - name: Run E2E login tests
        run: |
          cd tests/e2e
          npx playwright test login-journey.ui.spec.ts --workers=1
        env:
          TEST_ENV: prod
          TEST_TOTP_SECRET: ${{ secrets.TEST_USER_TOTP_SECRET }}
```

## File Structure

```
tests/e2e/
├── specs/
│   └── login-journey.ui.spec.ts    # Login journey tests
├── playwright.config.ts             # Playwright configuration
├── package.json                     # Dependencies and scripts
├── .gitignore                       # Ignore .totp-secrets/
└── .totp-secrets/                   # Cached TOTP secrets (gitignored)
    ├── test-user.journey-dev.secret
    ├── test-user.journey-stage.secret
    └── test-user.journey-prod.secret
```

## Related Documentation

- [TEST_USER_JOURNEY.md](./TEST_USER_JOURNEY.md) - Complete test user documentation
- [TOTP_FIX_STATUS.md](./TOTP_FIX_STATUS.md) - TOTP issue resolution
- [PROD_TESTING_METHODOLOGY.md](./PROD_TESTING_METHODOLOGY.md) - Production debugging

---

*Last Updated: January 14, 2026*
*Status: ✅ Active*
