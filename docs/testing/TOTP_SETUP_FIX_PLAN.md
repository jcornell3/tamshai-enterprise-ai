# TOTP Setup Fix Plan

> **⚠️ SUPERSEDED**: This plan was created on January 10, 2026 but the actual resolution took a different approach. See [TOTP_FIX_STATUS.md](./TOTP_FIX_STATUS.md) for the final solution.
>
> **Key Differences from Original Plan**:
> 1. Algorithm change (SHA256 → SHA1) was NOT needed - Keycloak uses SHA1 by default
> 2. Password reset was NOT needed - E2E test framework handles TOTP setup automatically
> 3. The actual issue was `secretData` JSON format (only `value` field allowed)
> 4. The actual issue was Keycloak `--import-realm` behavior (only imports on first startup)

---

## Original Problem Statement (January 10, 2026)

Three critical issues preventing E2E tests from working:

1. **Algorithm Mismatch**: Keycloak uses SHA256 for TOTP, but oathtool only supports SHA1
2. **Password Reset**: Realm recreation invalidates test-user.journey password
3. **Secret Extraction**: Playwright test can't extract TOTP secret from Keycloak UI

## Root Causes

### 1. SHA256 vs SHA1 Mismatch

**Evidence**:
- Keycloak TOTP setup page shows: "Algorithm: SHA256"
- oathtool only supports SHA1 algorithm
- Google Authenticator uses SHA1

**Impact**: Generated OTP codes don't match Keycloak's expected codes

### 2. Password Reset on Realm Recreation

**Evidence**:
- `recreate-realm-prod.sh` deletes and reimports realm from `realm-export.json`
- Hashed passwords in realm export don't import correctly
- test-user.journey password becomes invalid after recreation

**Impact**: Tests fail with "Invalid username or password"

### 3. Secret Extraction Logic

**Evidence** (from error-context.md):
- Page already displays secret: "NNBT I52J IM3U 25CJ MZFD ORKX G5XE W4LT"
- Link says "Scan barcode?" (not "Unable to scan?")
- Secret is in paragraph element, not in selectors test expects

**Impact**: `handleTotpSetupIfRequired()` throws "Could not extract TOTP secret"

## Solution Plan

### Phase 1: Fix Keycloak TOTP Algorithm (SHA256 → SHA1)

**File**: `keycloak/realm-export.json` (and `realm-export-dev.json`)

**Changes**:
1. Update OTP Policy to use SHA1:
```json
{
  "otpPolicyAlgorithm": "HmacSHA1",  // Change from HmacSHA256
  "otpPolicyDigits": 6,
  "otpPolicyPeriod": 30,
  "otpPolicyType": "totp"
}
```

2. Update all user TOTP credentials to SHA1:
```json
{
  "type": "otp",
  "algorithm": "HmacSHA1",  // Change from HmacSHA256
  "digits": 6,
  "period": 30
}
```

**Why SHA1**:
- oathtool only supports SHA1
- Google Authenticator uses SHA1 by default
- SHA1 is secure enough for TOTP (30-second validity window)
- Industry standard for TOTP (RFC 6238)

### Phase 2: Add Password Reset After Realm Recreation

**File**: `keycloak/scripts/recreate-realm-prod.sh`

**Add new function** (after `verify_test_user()`):
```bash
# Reset test-user.journey password to known value
reset_test_user_password() {
    log_info "Resetting test-user.journey password..."

    # Get user ID
    USER_ID=$(echo "$USER_RESPONSE" | jq -r '.[0].id')

    # Reset password
    HTTP_CODE=$(/opt/keycloak/curl-static -s -o /dev/null -w "%{http_code}" \
        -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/reset-password" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{
            "type": "password",
            "value": "'"$TEST_PASSWORD"'",
            "temporary": false
        }')

    if [[ "$HTTP_CODE" == "204" ]]; then
        log_success "Password reset successfully"
    else
        log_error "Failed to reset password (HTTP $HTTP_CODE)"
        exit 1
    fi
}
```

**Update `main()` function**:
```bash
main() {
    # ... existing code ...
    import_realm
    verify_test_user
    reset_test_user_password  # ADD THIS LINE
    # ... rest of code ...
}
```

**Why This Works**:
- Realm import creates user with invalid hashed password
- Immediate password reset via Admin API sets known password
- Ensures test-user.journey always has the correct password (from GitHub Secrets)
- Runs automatically during realm recreation

### Phase 3: Fix Playwright Secret Extraction

**File**: `tests/e2e/specs/login-journey.ui.spec.ts`

**Update `handleTotpSetupIfRequired()` function**:

```typescript
async function handleTotpSetupIfRequired(page: Page): Promise<string | null> {
  try {
    // Check if we're on the OTP setup page
    const setupHeading = await page.waitForSelector(
      'h1:has-text("Mobile Authenticator Setup"), heading:has-text("Mobile Authenticator")',
      {
        state: 'visible',
        timeout: 5000,
      }
    );

    if (!setupHeading) {
      return null;
    }

    console.log('*** TOTP SETUP PAGE DETECTED - CONFIGURING TOTP ***');

    // Take screenshot before extraction
    await page.screenshot({ path: 'test-results/totp-setup-page.png' });

    // CRITICAL: Check if we're already in text mode or QR mode
    const scanBarcodeLink = await page.locator('a:has-text("Scan barcode?")').count();
    const unableToScanLink = await page.locator('a:has-text("Unable to scan?")').count();

    if (unableToScanLink > 0) {
      // We're in QR mode - click to reveal text
      console.log('Clicking "Unable to scan?" to reveal text secret');
      await page.locator('a:has-text("Unable to scan?")').first().click();
      await page.waitForTimeout(2000);
    } else if (scanBarcodeLink > 0) {
      // We're already in text mode - secret is visible
      console.log('Already in text mode - secret is visible');
    }

    // Extract TOTP secret from page content
    // The secret appears as space-separated groups: "NNBT I52J IM3U 25CJ MZFD ORKX G5XE W4LT"
    const pageContent = await page.textContent('body');

    // Look for base32 pattern with optional spaces
    const match = pageContent?.match(/([A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4}\s+[A-Z2-7]{4})|([A-Z2-7]{32})/);

    if (!match) {
      await page.screenshot({ path: 'test-results/totp-extraction-failed.png' });
      throw new Error('Could not extract TOTP secret from setup page');
    }

    // Clean up the secret (remove spaces)
    const totpSecret = match[0].replace(/\s+/g, '');

    if (!/^[A-Z2-7]{32}$/.test(totpSecret)) {
      throw new Error(`Invalid TOTP secret format: ${totpSecret}`);
    }

    console.log(`Captured TOTP secret: ${totpSecret.substring(0, 4)}...${totpSecret.substring(28)}`);

    // Generate OTP code using SHA1 (oathtool only supports SHA1)
    const totpCode = generateTotpCode(totpSecret);
    console.log(`Generated setup code: ${totpCode.substring(0, 2)}****`);

    // Enter the OTP code to complete setup
    const otpInput = page.locator('#totp, input[name="totp"], input[type="text"]').first();
    await otpInput.fill(totpCode);

    // Click submit to complete setup
    const submitButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit")');
    await submitButton.first().click();

    // Wait for navigation after submit
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    console.log('TOTP setup completed successfully');
    return totpSecret;
  } catch (error: any) {
    if (error.message?.includes('Timeout') || error.message?.includes('waiting for')) {
      return null;
    }
    console.error(`TOTP setup failed: ${error.message}`);
    throw error;
  }
}
```

**Update `generateTotpCode()` function** to enforce SHA1:

```typescript
function generateTotpCode(secret: string): string {
  if (!secret) {
    throw new Error('TOTP secret is required but not provided');
  }

  // Try oathtool first (local development)
  // CRITICAL: oathtool only supports SHA1, so don't specify algorithm (defaults to SHA1)
  if (isOathtoolAvailable()) {
    try {
      const totpCode = execSync(`oathtool --totp --base32 "${secret}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!/^\d{6}$/.test(totpCode)) {
        throw new Error(`Invalid TOTP code generated: ${totpCode}`);
      }

      console.log('Generated TOTP code using oathtool (SHA1)');
      return totpCode;
    } catch (error: any) {
      console.warn(`oathtool failed, falling back to otplib: ${error.message}`);
    }
  }

  // Fallback to otplib (CI/CD environments)
  try {
    // CRITICAL: Force SHA1 algorithm (oathtool only supports SHA1)
    authenticator.options = {
      digits: 6,
      step: 30,
      algorithm: 'sha1',  // ALWAYS use SHA1 for compatibility with oathtool
    };
    const totpCode = authenticator.generate(secret);
    console.log('Generated TOTP code using otplib (SHA1 fallback)');
    return totpCode;
  } catch (error: any) {
    throw new Error(
      `Failed to generate TOTP code: ${error.message}\n` +
      `Tried both oathtool and otplib. Secret provided: ${secret.substring(0, 4)}...`
    );
  }
}
```

## Implementation Steps

### Step 1: Update Keycloak Configuration

1. Edit `keycloak/realm-export.json`:
   - Change `otpPolicyAlgorithm` from `HmacSHA256` to `HmacSHA1`
   - Update all user TOTP credentials to use `HmacSHA1`

2. Edit `keycloak/realm-export-dev.json` (same changes)

3. Commit changes:
```bash
git add keycloak/realm-export*.json
git commit -m "fix(keycloak): Change TOTP algorithm from SHA256 to SHA1 for oathtool compatibility"
git push
```

### Step 2: Update Realm Recreation Script

1. Edit `keycloak/scripts/recreate-realm-prod.sh`:
   - Add `reset_test_user_password()` function
   - Call it in `main()` after `verify_test_user`

2. Test locally:
```bash
cd keycloak/scripts
./docker-sync-realm.sh dev tamshai-keycloak
```

3. Commit changes:
```bash
git add keycloak/scripts/recreate-realm-prod.sh
git commit -m "fix(keycloak): Add password reset after realm recreation for test-user.journey"
git push
```

### Step 3: Update Playwright Test

1. Edit `tests/e2e/specs/login-journey.ui.spec.ts`:
   - Update `handleTotpSetupIfRequired()` to handle both QR and text modes
   - Update regex to match space-separated secret format
   - Update `generateTotpCode()` to enforce SHA1

2. Test locally:
```bash
cd tests/e2e
npm run test:login:dev
```

3. Commit changes:
```bash
git add tests/e2e/specs/login-journey.ui.spec.ts
git commit -m "fix(e2e): Update TOTP setup handler to extract space-separated secrets and use SHA1"
git push
```

### Step 4: Test End-to-End

1. Trigger realm recreation:
```bash
gh workflow run recreate-realm.yml --ref main
```

2. Run E2E tests:
```bash
cd tests/e2e
npm run test:login:prod
```

3. Verify:
   - test-user.journey can authenticate with the configured password
   - TOTP setup captures secret correctly
   - OTP codes generated with SHA1 match Keycloak's expectations
   - Test completes successfully

## Success Criteria

- ✅ Keycloak TOTP uses SHA1 (shown in setup page: "Algorithm: SHA1")
- ✅ test-user.journey password is configured correctly after realm recreation
- ✅ Playwright extracts TOTP secret from space-separated format
- ✅ oathtool generates valid OTP codes with SHA1
- ✅ E2E test completes full login journey successfully

## Rollback Plan

If issues occur:

1. **Revert Keycloak algorithm change**:
```bash
git revert <commit-hash>
git push
```

2. **Manual password reset**:
```bash
python reset-test-user-password.py <admin-password> "$TEST_PASSWORD"
```

3. **Manual TOTP setup**:
```bash
python set-totp-required.py <admin-password>
# Then use Google Authenticator to scan QR code
```

## References

- [RFC 6238 - TOTP](https://tools.ietf.org/html/rfc6238): Specifies SHA1 as default
- [oathtool documentation](https://www.nongnu.org/oath-toolkit/oathtool.1.html): Only supports SHA1
- [Google Authenticator](https://github.com/google/google-authenticator): Uses SHA1
- [Keycloak OTP Policy](https://www.keycloak.org/docs/latest/server_admin/#_otp_policies): Supports SHA1, SHA256, SHA512

---

## Actual Resolution (January 14, 2026)

The actual fix was simpler than originally planned:

### Root Cause

The `secretData` JSON field in realm-export.json had extra fields that Keycloak's `OTPSecretData` class doesn't recognize:

```json
// WRONG - causes NullPointerException
"secretData": "{\"value\":\"...\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\"}"

// CORRECT - only value field allowed
"secretData": "{\"value\":\"...\"}"
```

### Solution

1. Fixed `secretData` format in `keycloak/realm-export.json`
2. Added GitHub Secrets for TOTP values (`TEST_USER_TOTP_SECRET_RAW`, `TEST_USER_TOTP_SECRET`)
3. Updated E2E test framework to auto-capture TOTP secrets from setup page

### Why Original Plan Was Wrong

1. **Algorithm**: Keycloak already uses SHA1 (HmacSHA1) by default - no change needed
2. **Password**: E2E framework handles credentials correctly
3. **Secret Extraction**: E2E framework now auto-captures secrets from setup page

See [TOTP_FIX_STATUS.md](./TOTP_FIX_STATUS.md) for complete details.

---

*Created: 2026-01-10*
*Updated: 2026-01-14*
*Status: ⚠️ SUPERSEDED - See TOTP_FIX_STATUS.md*
*Author: Tamshai-QA*
