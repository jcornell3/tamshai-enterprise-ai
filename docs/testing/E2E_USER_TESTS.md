# E2E User Login Testing

This document describes the end-to-end testing approach for user login flows in Tamshai Enterprise AI, including handling TOTP (Time-based One-Time Password) authentication.

**Last Updated**: February 9, 2026

## Overview

The E2E tests verify the complete SSO authentication flows for both employees and customers:

**Employee Login** (tamshai-corp realm, TOTP required):
1. User navigates to employee login page
2. Auto-redirected to Keycloak for authentication
3. Enters username and password
4. Completes TOTP verification
5. Redirected back to the portal
6. Portal displays user information and available applications

**Customer Login** (tamshai-customers realm, no TOTP):
1. User navigates to customer portal
2. Auto-redirected to Keycloak customer realm
3. Enters email and password
4. Redirected back to customer portal
5. Customer sees organization name and support tools

## TOTP Handling Strategy

### Current Approach: globalSetup Provisioning + Auto-Capture (February 2026)

The E2E test framework uses a two-layer strategy:

**Layer 1 — globalSetup** (`tests/e2e/global-setup.ts`, runs before all tests):
- When `TEST_USER_TOTP_SECRET` + `TEST_USER_PASSWORD` are set, deletes and recreates `test-user.journey` via Keycloak Partial Import API
- Stores the raw secret in Keycloak's `secretData.value`
- Computes a **Base32 bridge value** and writes it to the `.totp-secrets/` cache file
- This bridge ensures otplib's `Base32.decode()` produces the same UTF-8 bytes Keycloak uses as the HMAC key

**Layer 2 — Auto-Capture** (fallback if globalSetup skipped):
- If TOTP setup page appears, clicks "Unable to scan?", extracts secret, completes setup
- Saves captured secret to cache for subsequent runs

**Benefits**:
- No manual intervention required
- Works across all environments (dev, stage, prod)
- Secrets cached for subsequent test runs
- Phoenix-compliant (works after infrastructure rebuild)
- Handles the Keycloak/otplib encoding mismatch transparently

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

1. **Cached file**: `.totp-secrets/test-user.journey-{env}.secret` (written by globalSetup or auto-capture)
2. **Environment variable**: `TEST_USER_TOTP_SECRET` (only if no cached file)
3. **Auto-capture**: If TOTP setup page appears, extract and save

**Note**: When globalSetup runs, it always writes the cache file with the Base32 bridge value. The test spec reads the cache file, NOT the raw env var. This is intentional — the cache file contains the Base32-encoded form that otplib needs.

**⚠️ IMPORTANT (January 2026)**: After a fresh deployment that clears TOTP credentials (like `deploy-vps.yml` on stage), do NOT pass `TEST_USER_TOTP_SECRET` as an environment variable. The cached file will be stale, and the env var will have the old secret. Instead:

1. Delete cached secrets: `rm -rf tests/e2e/.totp-secrets/`
2. Run test WITHOUT `TEST_USER_TOTP_SECRET` env var
3. Test will auto-capture the new secret and cache it
4. Subsequent runs will use the cached secret

### Important: Single Worker Mode

The Playwright config (`playwright.config.ts`) enforces `workers: 1` and `fullyParallel: false`, so you do **not** need to pass `--workers=1` manually. All tests run sequentially by default.

**Why single worker**: Multiple tests authenticating as the same user simultaneously causes:
- Session conflicts in Keycloak
- TOTP code reuse (30-second window)
- "Invalid authenticator code" errors

## Test Users

### test-user.journey (Dedicated E2E Account)

| Field | Value |
|-------|-------|
| Username | `test-user.journey` |
| Password | `[STORED IN GITHUB SECRETS]` (see `TEST_USER_PASSWORD` secret, env var: `TEST_USER_PASSWORD`) |
| TOTP Secret (BASE32) | `[STORED IN GITHUB SECRETS]` (see `TEST_USER_TOTP_SECRET` secret) |
| Roles | None (tests authentication flow only) |

This account exists in all environments (dev, stage, prod) with identical credentials.

### Dev Environment Test Users

These users exist only in development and have data access roles:

| Username | Password | TOTP | Role |
|----------|----------|------|------|
| eve.thompson | From `DEV_USER_PASSWORD` | Enabled | Executive |
| alice.chen | From `DEV_USER_PASSWORD` | Enabled | HR |
| bob.martinez | From `DEV_USER_PASSWORD` | Enabled | Finance |

**Note**: Corporate user passwords come from environment-specific GitHub Secrets:
- Dev: `DEV_USER_PASSWORD`
- Stage: `STAGE_USER_PASSWORD`
- Prod: `PROD_USER_PASSWORD`

## Running E2E Tests

### Quick Start

```bash
cd tests/e2e

# Install dependencies (first time)
npm install
npx playwright install chromium

# Load all credentials
eval $(../../scripts/secrets/read-github-secrets.sh --e2e --env)
export DEV_USER_PASSWORD=$(grep '^DEV_USER_PASSWORD=' ../../infrastructure/docker/.env | cut -d= -f2)
export CUSTOMER_USER_PASSWORD=$(grep '^CUSTOMER_USER_PASSWORD=' ../../infrastructure/docker/.env | cut -d= -f2)

# Run employee login tests (6 tests, ~13s)
npx playwright test specs/login-journey.ui.spec.ts --reporter=list

# Run customer login tests (13 tests, ~16s)
npx playwright test specs/customer-login-journey.ui.spec.ts --reporter=list

# Run API gateway tests (21 tests)
npx playwright test specs/gateway.api.spec.ts --reporter=list

# Run all core tests together
npx playwright test specs/login-journey.ui.spec.ts specs/customer-login-journey.ui.spec.ts specs/gateway.api.spec.ts --reporter=list
```

**Note**: The Playwright config enforces `workers: 1` and `fullyParallel: false`, so you do NOT need `--workers=1` manually.

### Windows Git Bash

On Windows with Git Bash, `export VAR=value` works correctly (unlike `set` in cmd.exe). The commands above work as-is in Git Bash.

**Alternative: Use .env file** — Create `tests/e2e/.env` with credentials. The Playwright config loads it via `dotenv`:

```bash
TEST_USER_PASSWORD=<from-github-secrets>
TEST_USER_TOTP_SECRET=<from-github-secrets>
DEV_USER_PASSWORD=<from-infrastructure-docker-env>
CUSTOMER_USER_PASSWORD=<from-infrastructure-docker-env>
```

**Note**: The `.env` file is gitignored - never commit credentials to version control.

### Windows Insight: oathtool Fallback

On Windows Git Bash, `oathtool` is not available (it's a Linux/macOS tool). The test framework automatically falls back to **otplib** (JavaScript) for TOTP code generation. You'll see this in the test output:

```text
oathtool failed, falling back to otplib: spawnSync /bin/bash ENOENT
Generated TOTP code using otplib (SHA1 fallback)
```

This is normal and expected on Windows.

### Environment Variables

| Variable | Required | Source | Description |
|----------|----------|--------|-------------|
| `TEST_ENV` | No | N/A | Environment: `dev` (default), `stage`, or `prod` |
| `TEST_USER_PASSWORD` | Yes* | GitHub Secret: `TEST_USER_PASSWORD` | Password for test-user.journey |
| `TEST_USER_TOTP_SECRET` | Yes* | GitHub Secret: `TEST_USER_TOTP_SECRET` | TOTP secret for globalSetup provisioning |
| `MCP_INTEGRATION_RUNNER_SECRET` | For integration tests | GitHub Secret: `MCP_INTEGRATION_RUNNER_SECRET` | Service account secret (token exchange, integration tests only) |
| `DEV_USER_PASSWORD` | For API tests | `.env` file | Password for corporate users (eve.thompson, etc.) |
| `CUSTOMER_USER_PASSWORD` | For customer tests | `.env` file / GitHub Secret | Password for customer realm users |
| `TEST_USERNAME` | No | N/A | Override username (default: `test-user.journey`) |

<!-- Note: TEST_USER_PASSWORD and TEST_USER_TOTP_SECRET are GitHub Secrets - pragma: allowlist secret -->

*Required for full employee login journey test. Without `TEST_USER_PASSWORD`, the TOTP login test is skipped. Without `TEST_USER_TOTP_SECRET`, globalSetup is skipped (tests fall back to auto-capture).

**Note on MCP_INTEGRATION_RUNNER_SECRET**: This secret is used by **integration tests** (tests/integration/), not E2E tests. E2E tests authenticate as real users (test-user.journey) using ROPC for browser-based login flows. Integration tests use token exchange to impersonate users when calling MCP server APIs directly. See [Integration Test README](../../tests/integration/README.md) for details.

**Loading secrets from .env** (Terraform-generated, contains all passwords):

```bash
export DEV_USER_PASSWORD=$(grep '^DEV_USER_PASSWORD=' ../../infrastructure/docker/.env | cut -d= -f2)
export CUSTOMER_USER_PASSWORD=$(grep '^CUSTOMER_USER_PASSWORD=' ../../infrastructure/docker/.env | cut -d= -f2)
```

### npm Scripts

```bash
# Employee login tests by environment
npm run test:login:dev    # https://www.tamshai-playground.local
npm run test:login:stage  # https://www.tamshai.com
npm run test:login:prod   # https://app.tamshai.com

# Customer login tests by environment
npm run test:customer-login:dev    # Customer portal (dev)
npm run test:customer-login:stage  # Customer portal (stage)

# All E2E tests by environment
npm run test:dev
npm run test:stage
npm run test:prod

# Debug mode (step through tests)
npm run test:debug

# UI mode (interactive)
npm run test:ui

# Install Playwright browsers (first time)
npm run install:browsers
```

## TOTP Code Generation

### Using oathtool (Recommended)

```bash
# Install oathtool
# Ubuntu/Debian: sudo apt-get install oathtool
# macOS: brew install oath-toolkit
# Windows: Available in WSL or via Chocolatey

# Generate TOTP code (secret from GitHub Secrets)
oathtool --totp --base32 "$TEST_USER_TOTP_SECRET"
# Output: 6-digit code (e.g., 123456)
```

### Manual Testing

```bash
# Get current TOTP code
oathtool --totp --base32 "$TEST_USER_TOTP_SECRET"

# Copy to clipboard (macOS)
oathtool --totp --base32 "$TEST_USER_TOTP_SECRET" | pbcopy

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

**Cause**: Usually timing, parallel worker issues, or **TOTP secret mismatch after deployment**

**Solutions**:
1. Config enforces `workers: 1` — verify you haven't overridden it
2. Verify system clock is synchronized
3. Wait for new 30-second window before retrying
4. **After fresh deployment**: Delete cached secrets and run WITHOUT `TEST_USER_TOTP_SECRET` env var:

   ```bash
   rm -rf tests/e2e/.totp-secrets/
   cd tests/e2e
   export TEST_ENV=stage
   export TEST_USER_PASSWORD="<from-github-secrets>"
   npx playwright test specs/login-journey.ui.spec.ts --reporter=list
   ```

   The test will auto-capture the new secret.

**Common Cause (Stage)**: The `deploy-vps.yml` workflow clears TOTP credentials on each deployment. If you pass an old `TEST_USER_TOTP_SECRET` from GitHub Secrets, it won't match the newly captured TOTP in Keycloak.

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

### Special Characters in Passwords

**⚠️ IMPORTANT: Avoid using `!` in passwords**

The exclamation mark (`!`) character causes issues across multiple layers:

| Layer | Issue |
|-------|-------|
| **Bash** | `!` triggers history expansion (e.g., `!$` expands to last argument) |
| **Git Bash (Windows)** | Escapes `!` to `\!` even in quoted strings |
| **cross-env** | May not properly escape `!` when passing to child processes |
| **kcadm.sh** | Shell expansion can corrupt password when setting via CLI |

**Safe special characters for passwords:**
- `@` - Safe across all shells and environments
- `#` - Generally safe in quoted strings
- `%` - Safe
- `^` - Safe
- `_` - Safe
- `-` - Safe
- `+` - Safe
- `=` - Safe

**Problematic characters to avoid:**
- `!` - History expansion in bash
- `$` - Variable expansion
- `` ` `` - Command substitution
- `&` - Background process operator
- `*` - Glob pattern
- `\` - Escape character

**Example:**

```bash
# BAD - ! will cause issues
TEST_USER_PASSWORD="MyPass!123"

# GOOD - @ is safe
TEST_USER_PASSWORD="MyPass@123"
```

**If you must use `!`:**
1. Use a `.env` file (dotenv handles it correctly)
2. Never pass via command line environment variables
3. Use single quotes in shell scripts: `'password!here'`

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
          npx playwright test specs/login-journey.ui.spec.ts --reporter=list
        env:
          TEST_ENV: prod
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
          TEST_USER_TOTP_SECRET: ${{ secrets.TEST_USER_TOTP_SECRET }}
```

## File Structure

```text
tests/e2e/
├── specs/
│   ├── login-journey.ui.spec.ts           # Employee login journey (6 tests)
│   ├── customer-login-journey.ui.spec.ts  # Customer login journey (13 tests)
│   ├── gateway.api.spec.ts                # API gateway tests (21 tests)
│   ├── sample-apps.ui.spec.ts             # Sample app UI tests
│   ├── payroll-app.ui.spec.ts             # Payroll app UI tests
│   └── ...                                # Other UI/wizard specs
├── global-setup.ts                  # TOTP provisioning (runs before all tests)
├── playwright.config.ts             # Playwright configuration (workers: 1)
├── package.json                     # Dependencies and scripts
├── .env                             # Local credentials (gitignored)
├── .gitignore                       # Ignore .totp-secrets/, .env
└── .totp-secrets/                   # Cached TOTP secrets (gitignored)
    ├── test-user.journey-dev.secret
    ├── test-user.journey-stage.secret
    └── test-user.journey-prod.secret
```

## Related Documentation

- [TEST_USER_JOURNEY.md](./TEST_USER_JOURNEY.md) - Complete test user documentation
- [TOTP_FIX_STATUS.md](./TOTP_FIX_STATUS.md) - TOTP issue resolution
- [PROD_TESTING_METHODOLOGY.md](./PROD_TESTING_METHODOLOGY.md) - Production debugging

### Stage Environment: TOTP Cleared on Each Deployment

**Status**: ✅ **Verified** (January 2026)

The `deploy-vps.yml` workflow clears TOTP credentials for test-user.journey on each deployment:

```yaml
# From deploy-vps.yml - removes OTP credentials
for CRED_ID in $(echo $EXISTING_CREDS | jq -r '.[] | select(.type=="otp") | .id'); do
  curl -sf -X DELETE ".../users/${USER_ID}/credentials/${CRED_ID}" ...
done
```

**Consequence**: After each stage deployment:
1. test-user.journey has password authentication only (no TOTP configured)
2. First E2E test run will see TOTP setup page
3. Test auto-captures new TOTP secret and saves to cache
4. Subsequent tests use cached secret

**Verified Working Command** (January 16, 2026):

```bash
# After fresh deployment - let test auto-capture TOTP
cd tests/e2e
rm -rf .totp-secrets/test-user.journey-stage.secret
export TEST_ENV=stage
export TEST_USER_PASSWORD="<from-github-secrets>"
npx playwright test specs/login-journey.ui.spec.ts --reporter=list
```

### Prod Environment: E2E Verified

**Status**: ✅ **Verified** (January 16, 2026)

E2E tests verified working on prod with all 6 tests passing:
- Employee login page displays correctly
- Keycloak redirect works
- Full login journey with TOTP auto-capture
- Invalid credentials handled gracefully
- Portal SPA loads without JS errors
- No 404 errors for assets

**Verified Working Command** (January 16, 2026):

```bash
cd tests/e2e
export TEST_ENV=prod
export TEST_USER_PASSWORD="<from-github-secrets>"
export TEST_USER_TOTP_SECRET="<from-github-secrets>"
npx playwright test specs/login-journey.ui.spec.ts --reporter=list
```

### Dev Environment: Full E2E Verified (Phoenix Rebuild)

**Status**: ✅ **Verified** (February 9, 2026) — After Phoenix Rebuild (terraform destroy + apply)

All tests verified working after full infrastructure rebuild:
- Employee login: 6/6 passed (~13s)
- Customer login: 13/13 passed (~16s)

**Verified Working Commands** (February 9, 2026):

```bash
cd tests/e2e

# Load all credentials
eval $(../../scripts/secrets/read-github-secrets.sh --e2e --env)
export DEV_USER_PASSWORD=$(grep '^DEV_USER_PASSWORD=' ../../infrastructure/docker/.env | cut -d= -f2)
export CUSTOMER_USER_PASSWORD=$(grep '^CUSTOMER_USER_PASSWORD=' ../../infrastructure/docker/.env | cut -d= -f2)

# Employee login (6 tests)
npx playwright test specs/login-journey.ui.spec.ts --reporter=list

# Customer login (13 tests)
npx playwright test specs/customer-login-journey.ui.spec.ts --reporter=list
```

---

*Last Updated: February 9, 2026*
*Status: ✅ Active - Verified on dev (Phoenix rebuild), stage, and prod*
