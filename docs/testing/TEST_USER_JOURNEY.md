# Test User for Automated Journey Testing

## Overview

This document describes the **test-user.journey** account, a dedicated test account for automated end-to-end (E2E) user journey testing across all environments.

## Test User Credentials

| Field | Value | Notes |
|-------|-------|-------|
| **Username** | `test-user.journey` | Unique identifier |
| **Password** | `***REDACTED_PASSWORD***` | Strong password for security |
| **Email** | `test-user@tamshai.local` | Test email address |
| **TOTP Secret** | `JBSWY3DPEHPK3PXP` | Base32 encoded for automated TOTP generation |
| **Employee ID** | `TEST001` | Attribute for tracking |
| **Department** | `Testing` | Attribute for identification |
| **Title** | `Journey Test Account` | Descriptive title |

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
- **Base URL**: `https://prod.tamshai.com`
- **Keycloak URL**: `https://keycloak-fn44nd7wba-uc.a.run.app`
- **Client ID**: `tamshai-web-portal`

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
  // Navigate to login
  await page.goto('https://prod.tamshai.com');

  // Click login button
  await page.click('[data-testid="login-button"]');

  // Enter credentials
  await page.fill('input[name="username"]', 'test-user.journey');
  await page.fill('input[name="password"]', '***REDACTED_PASSWORD***');
  await page.click('input[type="submit"]');

  // Generate and enter TOTP
  const totp = generateTOTP('JBSWY3DPEHPK3PXP');
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

Use `oathtool` to generate TOTP codes manually:

```bash
oathtool --totp --base32 JBSWY3DPEHPK3PXP
```

**Output**: 6-digit code (e.g., `123456`) valid for 30 seconds

### Automated Generation (in scripts)

**Bash**:
```bash
TOTP_SECRET="JBSWY3DPEHPK3PXP"
TOTP_CODE=$(oathtool --totp --base32 "$TOTP_SECRET")
echo "Current TOTP: $TOTP_CODE"
```

**Node.js/TypeScript**:
```typescript
import * as OTPAuth from 'otpauth';

const totp = new OTPAuth.TOTP({
  secret: 'JBSWY3DPEHPK3PXP',
  algorithm: 'SHA256',
  digits: 6,
  period: 30
});

const code = totp.generate();
console.log('Current TOTP:', code);
```

**Python**:
```python
import pyotp

totp = pyotp.TOTP('JBSWY3DPEHPK3PXP')
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

1. **Password Strength**: Uses a strong password (`***REDACTED_PASSWORD***`)
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
          TOTP_SECRET: ${{ secrets.TEST_USER_TOTP_SECRET }}
```

**GitHub Secrets to Add**:
- `TEST_USER_PASSWORD`: `***REDACTED_PASSWORD***`
- `TEST_USER_TOTP_SECRET`: `JBSWY3DPEHPK3PXP`

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
  -d "password=***REDACTED_PASSWORD***" \
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

**Cause**: Time drift or incorrect secret

**Fix**:
```bash
# Verify system time is correct
date

# Generate code manually to test
oathtool --totp --base32 JBSWY3DPEHPK3PXP

# Try the generated code in the browser
```

### Issue: "Access denied to MCP endpoints"

**Expected Behavior**: This test user **should** be denied access to MCP endpoints (HR, Finance, Sales, Support) because it has no data access roles. This validates that RBAC is working correctly.

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

**Last Updated**: January 9, 2026
**Maintainer**: QA Team
**Status**: ✅ Active - Ready for use in automated testing
