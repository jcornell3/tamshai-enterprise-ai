# Test User for Automated Journey Testing

## Overview

This document describes the **test-user.journey** account, a dedicated test account for automated end-to-end (E2E) user journey testing across all environments.

## Test User Credentials

| Field | Value | Notes |
|-------|-------|-------|
| **Username** | `test-user.journey` | Unique identifier |
| **Password** | `[STORED IN GITHUB SECRETS]` | See `TEST_PASSWORD` secret |
| **Email** | `test-user@tamshai.local` | Test email address |
| **TOTP Secret** | Stored in GitHub Secrets | See [TOTP Secret Management](#totp-secret-management) below |
| **Employee ID** | `TEST001` | Attribute for tracking |
| **Department** | `Testing` | Attribute for identification |
| **Title** | `Journey Test Account` | Descriptive title |

## TOTP Secret Management

### Raw vs BASE32 Encoding

**IMPORTANT**: Keycloak stores TOTP secrets in **raw (plaintext) format**, not BASE32. Understanding this distinction is critical for correct configuration.

| Context | Format | Example | Where Used |
|---------|--------|---------|------------|
| **Keycloak Internal Storage** | Raw (plaintext) | `[STORED IN GITHUB SECRETS]` | See `TEST_USER_TOTP_SECRET_RAW` secret |
| **QR Code Display** | BASE32-encoded | `[STORED IN GITHUB SECRETS]` | See `TEST_USER_TOTP_SECRET` secret |
| **oathtool / TOTP Apps** | BASE32-encoded | `[STORED IN GITHUB SECRETS]` | See `TEST_USER_TOTP_SECRET` secret |

**Why this matters**: If you put a BASE32 value directly in Keycloak's `secretData`, Keycloak will double-encode it when displaying QR codes, causing TOTP validation to fail with a `NullPointerException`.

### Critical: Keycloak secretData Format

The `secretData` field in realm-export.json **ONLY accepts the `value` field**. Other fields like `period`, `digits`, and `algorithm` must go in `credentialData`:

```json
{
  "type": "otp",
  "secretData": "{\"value\":\"[RAW_SECRET_FROM_GITHUB_SECRETS]\"}",
  "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\"}"
}
```

**⚠️ WRONG FORMAT** (causes Keycloak container crash):
```json
{
  "secretData": "{\"value\":\"...\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\"}"
}
```

**Error**: `UnrecognizedPropertyException: Unrecognized field "period" (class org.keycloak.models.credential.dto.OTPSecretData)`

### Correct Flow

1. **Choose a raw secret**: A simple string like `TamshaiTestKey123`
2. **Store raw in Keycloak**: Put the raw string in `realm-export.json` → `secretData.value`
3. **Convert to BASE32 for testing**: Use `echo -n "TamshaiTestKey123" | base32` to get the BASE32 version
4. **Use BASE32 in E2E tests**: E2E tests use the BASE32 version with oathtool/otplib

### GitHub Secrets Configuration

The TOTP secrets are stored securely in GitHub Secrets, **not in the codebase**.

| Secret Name | Format | Purpose |
|-------------|--------|---------|
| `TEST_USER_TOTP_SECRET_RAW` | Raw/plaintext | Injected into `realm-export.json` during GCP deployment |
| `TEST_USER_TOTP_SECRET` | BASE32-encoded | Used by E2E tests for TOTP code generation |

**Setting up the secrets**:
```bash
# 1. Choose your raw secret (keep this secure)
RAW_SECRET="YourSecretKeyHere"

# 2. Convert to BASE32 for E2E tests
BASE32_SECRET=$(echo -n "$RAW_SECRET" | base32)

# 3. Add both to GitHub Secrets
gh secret set TEST_USER_TOTP_SECRET_RAW --body "$RAW_SECRET"
gh secret set TEST_USER_TOTP_SECRET --body "$BASE32_SECRET"
```

### Keycloak --import-realm Behavior

**CRITICAL**: Keycloak's `--import-realm` flag has specific behavior that affects TOTP provisioning:

| Scenario | What Happens | TOTP Status |
|----------|--------------|-------------|
| **First container start** | Realm imported from JSON file | ✅ TOTP credentials imported |
| **Subsequent container starts** | Realm exists in database, skipped | ❌ TOTP credentials NOT updated |
| **Realm deleted via Admin API** | Running container doesn't reimport | ❌ TOTP credentials lost |
| **New container revision after delete** | Fresh import triggered | ✅ TOTP credentials imported |

**Key Insight (January 2026)**: Deleting a realm via Admin API while the Keycloak container is running does NOT trigger a reimport. The `--import-realm` action only runs at container startup, and only if the realm doesn't exist in the database.

**To force a fresh realm import**:
1. Delete the realm via Admin API
2. Deploy a new Keycloak container revision (triggers new startup with `--import-realm`)
3. New container sees realm doesn't exist → imports from realm-export.json

### Environment-Specific Behavior

| Environment | TOTP Source | Deployment Workflow | Notes |
|-------------|-------------|---------------------|-------|
| **Dev** | E2E test captures during setup OR pre-configured | N/A (local Docker) | Test auto-captures if setup page appears |
| **Stage** | E2E test captures during setup | `deploy-vps.yml` | Aligned with prod; requires `TEST_PASSWORD` and `TEST_USER_TOTP_SECRET_RAW` secrets |
| **Prod** | Pre-configured in realm-export.json | `deploy-to-gcp.yml` | Secret injected during deployment; E2E test captures if setup page appears |

### CI/CD Workflow Alignment (January 2026)

All deployment workflows now use a **consistent approach** for test-user.journey configuration:

1. **Required Secrets** (fail if missing):
   - `TEST_PASSWORD` - Password for test-user.journey
   - `TEST_USER_TOTP_SECRET_RAW` - Raw TOTP secret for Keycloak
   - `KEYCLOAK_ADMIN_PASSWORD` - Admin password for Keycloak API

2. **Credential Configuration Steps**:
   - Wait for Keycloak to be ready
   - Get admin token via Keycloak Admin API
   - Find test-user.journey by username
   - Reset password from `TEST_PASSWORD` secret
   - Remove existing OTP credentials
   - Clear required actions

3. **Strict Error Handling**: Workflows exit with error (not silent skip) if:
   - Required secrets are missing
   - Keycloak is not ready after timeout
   - Admin token cannot be obtained
   - User not found
   - Password reset fails

**Reference**: See `deploy-vps.yml` and `deploy-to-gcp.yml` for implementation details.

### E2E Test TOTP Auto-Capture

The E2E test framework automatically handles TOTP configuration:

1. **If TOTP is pre-configured**: Test uses the secret from environment variable or cached file
2. **If TOTP setup page appears**: Test clicks "Unable to scan?", extracts the secret, configures TOTP, and saves the secret for future runs

**Cached secrets location**: `tests/e2e/.totp-secrets/test-user.journey-{env}.secret`

**Important**: Run E2E tests with `--workers=1` to avoid session conflicts when multiple tests authenticate as the same user simultaneously.

## Access Privileges

**✅ CAN Access**:
- Home page
- Employee login page
- App service page (post-login)
- Downloads page
- User profile (self)

**❌ CANNOT Access**:
- HR data (no `hr-read` or `hr-write`)
- Finance data (no `finance-read` or `finance-write`)
- Sales data (no `sales-read` or `sales-write`)
- Support data (no `support-read` or `support-write`)
- Manager tools (no `manager` role)
- Executive dashboards (no `executive` role)

**Why this matters**: This account tests the authentication flow and basic app access without triggering any data access logic, making it safe for automated testing.

## Environment Support

The test user is configured in **all environments**:

### Dev (Local Development)
- **Realm Export**: `keycloak/realm-export-dev.json`
- **Base URL**: `https://www.tamshai.local`
- **Keycloak URL**: `https://www.tamshai.local/auth`
- **Client ID**: `tamshai-website`

### Stage (VPS)
- **Realm Export**: `keycloak/realm-export.json` (synced to VPS)
- **Base URL**: `https://vps.tamshai.com`
- **Keycloak URL**: `https://vps.tamshai.com/auth`
- **Client ID**: `tamshai-website`

### Prod (GCP)
- **Realm Export**: `keycloak/realm-export.json` (synced to GCP)
- **Marketing Site URL**: `https://prod.tamshai.com` (GCS bucket - employee-login.html)
- **Portal App URL**: `https://app.tamshai.com/app` (Cloud Run - SPA)
- **Keycloak URL**: `https://keycloak-fn44nd7wba-uc.a.run.app`
- **Client ID**: `web-portal`

**⚠️ Important Architecture Note (January 2026)**: In production, the marketing site and portal are hosted separately:
- `prod.tamshai.com` = GCS static bucket (landing pages, employee-login.html)
- `app.tamshai.com` = Cloud Run container (React SPA portal)

## Automated Testing Scripts

### 1. Shell Script (Basic Validation)

**Location**: `scripts/test/journey-e2e-automated.sh`

**Usage**:
```bash
# Test local dev environment
./scripts/test/journey-e2e-automated.sh dev

# Test VPS stage environment
./scripts/test/journey-e2e-automated.sh stage

# Test GCP production
./scripts/test/journey-e2e-automated.sh prod
```

**Features**:
- Health endpoint validation
- OAuth PKCE flow testing
- TOTP code generation
- Automated testing without manual intervention

**Dependencies**:
- `oathtool` - For TOTP code generation
  ```bash
  # Ubuntu/Debian
  sudo apt-get install oathtool

  # macOS
  brew install oath-toolkit
  ```

### 2. Playwright E2E Tests (Full Automation)

**Location**: `tests/e2e/specs/login-journey.ui.spec.ts`

**Usage**:
```bash
cd tests/e2e

# Run all E2E tests with test user
npx playwright test login-journey.ui.spec.ts

# Run with visible browser
npx playwright test login-journey.ui.spec.ts --headed

# Debug mode
npx playwright test login-journey.ui.spec.ts --debug
```

**Example Test Case**:
```typescript
test('test-user.journey can login and access app', async ({ page }) => {
  // TOTP secret from environment variable (BASE32-encoded)
  const totpSecret = process.env.TEST_TOTP_SECRET;
  if (!totpSecret) throw new Error('TEST_TOTP_SECRET environment variable required');

  // Navigate to login
  await page.goto('https://prod.tamshai.com');

  // Click login button
  await page.click('[data-testid="login-button"]');

  // Enter credentials
  await page.fill('input[name="username"]', 'test-user.journey');
  await page.fill('input[name="password"]', process.env.TEST_PASSWORD); // Required from environment
  await page.click('input[type="submit"]');

  // Generate and enter TOTP (using BASE32 secret)
  const totp = generateTOTP(totpSecret);
  await page.fill('input[name="otp"]', totp);
  await page.click('input[type="submit"]');

  // Verify redirected to app
  await expect(page).toHaveURL(/\/app/);

  // Verify user can access app page
  await expect(page.locator('h1')).toContainText('Welcome');

  // Verify downloads page accessible
  await page.goto('https://prod.tamshai.com/downloads');
  await expect(page).toHaveURL(/\/downloads/);
});
```

## TOTP Code Generation

### Manual Generation (for debugging)

Use `oathtool` to generate TOTP codes manually with your BASE32-encoded secret:

```bash
# Get the BASE32 secret from environment or GitHub Secrets
oathtool --totp --base32 "$TEST_TOTP_SECRET"
```

**Output**: 6-digit code (e.g., `123456`) valid for 30 seconds

### Automated Generation (in scripts)

**Bash**:
```bash
# Get BASE32 secret from environment variable (set in CI or local .env)
TOTP_SECRET="${TEST_TOTP_SECRET:?TEST_TOTP_SECRET environment variable required}"
TOTP_CODE=$(oathtool --totp --base32 "$TOTP_SECRET")
echo "Current TOTP: $TOTP_CODE"
```

**Node.js/TypeScript**:
```typescript
import * as OTPAuth from 'otpauth';

// Get BASE32 secret from environment
const secret = process.env.TEST_TOTP_SECRET;
if (!secret) throw new Error('TEST_TOTP_SECRET environment variable required');

const totp = new OTPAuth.TOTP({
  secret: secret,
  algorithm: 'SHA1',  // Must match Keycloak configuration
  digits: 6,
  period: 30
});

const code = totp.generate();
console.log('Current TOTP:', code);
```

**Python**:
```python
import os
import pyotp

# Get BASE32 secret from environment
secret = os.environ.get('TEST_TOTP_SECRET')
if not secret:
    raise ValueError('TEST_TOTP_SECRET environment variable required')

totp = pyotp.TOTP(secret)
code = totp.now()
print(f'Current TOTP: {code}')
```

## Security Considerations

### Safe for Automated Testing

1. **No Sensitive Data Access**: User has zero data privileges
2. **Test Environment Only**: Not intended for production user data
3. **Isolated Account**: No group memberships, no role assignments
4. **Predictable Behavior**: Consistent across environments

### Production Security

**⚠️ IMPORTANT**: This test user is included in the **production realm export** (`keycloak/realm-export.json`). While safe for testing, consider these points:

1. **Password Strength**: Uses a strong password (stored in GitHub Secrets)
2. **TOTP Enabled**: Requires two-factor authentication
3. **No Data Access**: Cannot access any sensitive data
4. **Audit Logging**: All login attempts are logged

**Recommendation**: Monitor this account's usage in production to detect any unauthorized access attempts.

## CI/CD Integration

### GitHub Actions Workflow

Add to `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Journey Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [dev, stage, prod]
    steps:
      - uses: actions/checkout@v4

      - name: Install oathtool
        run: sudo apt-get update && sudo apt-get install -y oathtool

      - name: Run journey test
        run: ./scripts/test/journey-e2e-automated.sh ${{ matrix.environment }}
        env:
          TEST_USERNAME: test-user.journey
          TEST_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
          TEST_TOTP_SECRET: ${{ secrets.TEST_USER_TOTP_SECRET }}
```

**Required GitHub Secrets** (see [TOTP Secret Management](#totp-secret-management)):

| Secret | Format | Purpose |
|--------|--------|---------|
| `TEST_USER_PASSWORD` | Plaintext | User password for test-user.journey |
| `TEST_USER_TOTP_SECRET_RAW` | Raw/plaintext | Keycloak realm-export.json injection |
| `TEST_USER_TOTP_SECRET` | BASE32-encoded | E2E test TOTP code generation |

**⚠️ SECURITY NOTE**: Never commit secrets to version control. Always use environment variables or secrets managers.

### Running Tests Manually

```bash
# Quick smoke test (all environments)
for env in dev stage prod; do
  echo "Testing $env..."
  ./scripts/test/journey-e2e-automated.sh $env
done

# Full E2E test with Playwright (requires Playwright installed)
cd tests/e2e
npx playwright test --grep "test-user.journey"
```

## Syncing to Keycloak

After making changes to the test user in realm exports, sync to Keycloak:

### Dev (Local)
```bash
cd keycloak/scripts
./docker-sync-realm.sh dev
```

### Stage (VPS)
```bash
# Deploy updated realm to VPS
gh workflow run deploy-vps.yml --ref main

# Or manually via SSH
ssh root@$VPS_IP
cd /opt/tamshai
./keycloak/scripts/sync-realm.sh stage
```

### Prod (GCP)
```bash
# Sync to GCP Keycloak instance
# (Requires manual implementation - see Phase 2)
```

## Verification

Verify the test user exists in Keycloak:

```bash
# Dev (local)
curl -s http://localhost:8180/auth/realms/tamshai-corp/protocol/openid-connect/token \
  -d "client_id=tamshai-website" \
  -d "username=test-user.journey" \
  -d "password=$TEST_PASSWORD" \
  -d "grant_type=password" \
  | jq -r '.access_token'

# If successful, you'll get an access token
# If failed, check Keycloak logs
```

## Troubleshooting

### Issue: "Invalid user credentials"

**Cause**: User not synced to Keycloak yet

**Fix**:
```bash
# Sync realm configuration
cd keycloak/scripts
./docker-sync-realm.sh dev
```

### Issue: "Invalid TOTP code"

**Cause**: Time drift, incorrect secret, or wrong format (raw vs BASE32)

**Fix**:
```bash
# Verify system time is correct
date

# Generate code manually to test (use BASE32 secret from environment)
oathtool --totp --base32 "$TEST_TOTP_SECRET"

# Try the generated code in the browser
```

**Common Mistakes**:
- Using raw secret with oathtool (must be BASE32)
- Using BASE32 secret in Keycloak secretData (must be raw)
- Algorithm mismatch (Keycloak uses SHA1 by default)

### Issue: "Mobile Authenticator Setup" page appears (TOTP not configured)

**Status**: ✅ **RESOLVED** (January 14, 2026)

**Cause**: Keycloak's `--import-realm` flag only imports TOTP credentials during the **first** realm creation. If the realm already exists, credentials are not updated.

**Symptoms**:
- Keycloak shows "Mobile Authenticator Setup" QR code page instead of TOTP input
- User can login with password but TOTP is not configured

**Resolution**: The E2E test framework now automatically handles this scenario:

1. **Auto-Detection**: Test detects TOTP setup page
2. **Secret Capture**: Clicks "Unable to scan?" and extracts the BASE32 secret
3. **Auto-Configuration**: Generates TOTP code using `oathtool` and completes setup
4. **Secret Caching**: Saves captured secret to `.totp-secrets/` for future test runs

**Test Command**:
```bash
cd tests/e2e
TEST_ENV=prod npx playwright test login-journey.ui.spec.ts:375 --project=chromium --workers=1
```

**For Fresh Deployments (Phoenix Principle)**:

When doing a full infrastructure rebuild (terraform destroy + apply):

1. **GitHub Secrets must be set**:
   - `TEST_USER_TOTP_SECRET_RAW` = raw secret for Keycloak
   - `TEST_USER_TOTP_SECRET` = BASE32 secret for E2E tests

2. **deploy-to-gcp.yml** substitutes the secret into realm-export.json during build

3. **First container start** imports the realm with TOTP credentials

**Manual Alternative** (if E2E capture fails):
1. Login to Keycloak Admin Console
2. Delete the `tamshai-corp` realm
3. Trigger new Keycloak deployment (creates new container revision)
4. New container imports fresh realm with TOTP

### Issue: "Access denied to MCP endpoints"

**Expected Behavior**: This test user **should** be denied access to MCP endpoints (HR, Finance, Sales, Support) because it has no data access roles. This validates that RBAC is working correctly.

### Issue: E2E tests fail with "element not found" for SSO button (Prod)

**Cause**: The E2E test configuration must distinguish between the marketing site URL and the portal app URL in production.

**Symptoms**:
- Tests look for `employee-login.html` at `app.tamshai.com` (doesn't exist there)
- Tests get 404s or empty pages
- SSO button locator times out

**Fix**: Update `tests/e2e/specs/login-journey.ui.spec.ts` URL configuration:

```typescript
// Before (incorrect for prod)
const BASE_URLS = {
  prod: {
    app: 'https://prod.tamshai.com',  // Wrong - mixed static site and portal
    keycloak: '...'
  }
};

// After (correct for prod)
const BASE_URLS = {
  prod: {
    site: 'https://prod.tamshai.com',       // Marketing site (employee-login.html)
    app: 'https://app.tamshai.com/app',     // Portal SPA (post-login)
    keycloak: '...'
  }
};
```

Then use `urls.site` for employee-login.html and `urls.app` for portal pages.

### Issue: "We are sorry... Unexpected error when handling authentication request"

**Status**: ✅ **RESOLVED** (January 14, 2026)

**Cause**: TOTP `secretData` was NULL because realm-export.json was imported with incorrect format or placeholder not substituted.

**Symptoms**:
- TOTP authentication fails with error page
- Keycloak logs show `NullPointerException` in TOTP validation
- User can enter password but TOTP step fails

**Root Cause**:
- The `secretData` JSON in realm-export.json had extra fields (`period`, `digits`, `algorithm`) that Keycloak's `OTPSecretData` class doesn't recognize
- This caused deserialization to fail, leaving `secretData` as NULL

**Resolution**:
1. Fixed `secretData` format in realm-export.json to only include `value` field
2. Moved `period`, `digits`, `algorithm` to `credentialData` field
3. Deployed new Keycloak container with correct realm-export.json

**Prevention**: See "Critical: Keycloak secretData Format" section above.

## Future Enhancements

### Phase 2 Improvements

1. **Full Playwright Integration**:
   - Complete login-journey.ui.spec.ts test
   - Add automated TOTP submission
   - Test all app pages post-login

2. **Negative Testing**:
   - Attempt to access HR data (expect 403)
   - Attempt to access Finance data (expect 403)
   - Verify RBAC enforcement

3. **Performance Testing**:
   - Include test-user.journey in k6 load tests
   - Measure authentication latency
   - Test concurrent logins

4. **Monitoring Integration**:
   - Alert on test user login failures
   - Track test user login success rate
   - Dashboard for automated test results

## Related Documentation

- [Login Journey Test](../../scripts/test/login-journey.sh) - Manual test script
- [E2E Tests](../../tests/e2e/README.md) - Playwright E2E test suite
- [Keycloak Sync](../../keycloak/scripts/README.md) - Realm synchronization
- [RBAC Model](../../docs/architecture/security-model.md) - Role-based access control

---

**Last Updated**: January 15, 2026
**Maintainer**: QA Team
**Status**: ✅ Active - Ready for use in automated testing

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-01-15 | Aligned deploy-vps.yml with deploy-to-gcp.yml | Consistent test user configuration across environments |
| 2026-01-15 | Added CI/CD Workflow Alignment section | Document unified approach for all environments |
| 2026-01-15 | Updated Environment-Specific Behavior table | Added deployment workflow column |
| 2026-01-14 | Added secretData format documentation | Keycloak only accepts `value` field in secretData |
| 2026-01-14 | Added Keycloak --import-realm behavior section | Document when TOTP credentials are imported |
| 2026-01-14 | Added E2E Test TOTP Auto-Capture section | Document automatic TOTP handling |
| 2026-01-14 | Updated troubleshooting sections as RESOLVED | TOTP issues fixed and verified |
| 2026-01-14 | Updated TOTP secret examples | Using actual production secrets |
| 2026-01-14 | Removed hardcoded TOTP secrets | Security risk - secrets now stored in GitHub Secrets |
| 2026-01-14 | Added TOTP Secret Management section | Document raw vs BASE32 encoding requirements |
| 2026-01-12 | Initial documentation | Created test-user.journey documentation |
