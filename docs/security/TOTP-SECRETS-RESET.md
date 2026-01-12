# TOTP Secrets Reset - Technical Analysis

**Document Version**: 1.0
**Date**: January 12, 2026
**Status**: Under Review
**Author**: Tamshai-Dev

## Executive Summary

This document describes the challenges encountered when attempting to programmatically configure TOTP (Time-based One-Time Password) credentials for Keycloak users via the Admin REST API. The goal was to create a script that could reset a user's TOTP credential to a known secret, enabling automated E2E testing with predictable TOTP codes.

**Key Finding**: Keycloak's Admin REST API does not support creating OTP credentials post-user-creation. OTP credentials can only be reliably set during initial realm import or through user self-service.

---

## 1. Intent and Purpose

### 1.1 Business Requirement

For E2E (End-to-End) testing of the Tamshai Enterprise AI portal, we need a test user (`test-user.journey`) that can complete the full authentication flow including:

1. Username/password authentication
2. TOTP (2FA) verification

The E2E test framework uses `oathtool` to generate TOTP codes from a known secret (`JBSWY3DPEHPK3PXP`). For tests to pass, the Keycloak user must have this exact TOTP secret configured.

### 1.2 Script Purpose

The `keycloak/scripts/set-user-totp.sh` script was created to:

1. Authenticate to Keycloak Admin API
2. Find a user by username
3. Delete any existing OTP credentials
4. Create a new OTP credential with a known TOTP secret
5. Verify the credential was created successfully

### 1.3 Target Environments

| Environment | Keycloak URL | Use Case |
|-------------|--------------|----------|
| dev | https://www.tamshai.local/auth | Local development |
| stage | https://www.tamshai.com/auth | VPS staging |
| prod | https://keycloak-fn44nd7wba-uc.a.run.app/auth | GCP Cloud Run |

---

## 2. Technical Implementation

### 2.1 Script Overview

Location: `keycloak/scripts/set-user-totp.sh`

```bash
Usage: ./set-user-totp.sh <environment> <username> [totp_secret]

Arguments:
  environment   - dev, stage, or prod
  username      - Keycloak username (e.g., test-user.journey)
  totp_secret   - Base32-encoded TOTP secret (default: JBSWY3DPEHPK3PXP)
```

### 2.2 API Endpoints Attempted

The script attempts to create OTP credentials using multiple Keycloak Admin API endpoints:

| Endpoint | Method | Result |
|----------|--------|--------|
| `POST /admin/realms/{realm}/users/{userId}/credentials` | Direct credential creation | **404 Not Found** |
| `PUT /admin/realms/{realm}/users/{userId}` with credentials array | User update with credentials | Creates credential but **missing secretData** |
| `POST /admin/realms/{realm}/partialImport` | Partial realm import | **500 Internal Server Error** - "Cannot parse the JSON" |

### 2.3 Credential Format

The OTP credential format matches Keycloak's realm export structure:

```json
{
  "type": "otp",
  "userLabel": "E2E Test Authenticator",
  "secretData": "{\"value\":\"JBSWY3DPEHPK3PXP\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\"}",
  "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\",\"counter\":0}"
}
```

---

## 3. Issues Encountered

### 3.1 Issue #1: Credentials Endpoint Returns 404

**Endpoint**: `POST /admin/realms/{realm}/users/{userId}/credentials`

**Expected Behavior**: Create a new credential for the user.

**Actual Behavior**: Returns `HTTP 404 Not Found`.

**Analysis**: The Keycloak Admin REST API's credentials endpoint only supports:
- `GET` - List credentials
- `DELETE /{credentialId}` - Delete a specific credential
- `PUT /{credentialId}/moveToFirst` - Reorder credentials

There is no `POST` method to create new credentials via this endpoint.

### 3.2 Issue #2: User Update Ignores OTP Credentials

**Endpoint**: `PUT /admin/realms/{realm}/users/{userId}`

**Payload**:
```json
{
  "credentials": [
    {
      "type": "otp",
      "secretData": "{\"value\":\"JBSWY3DPEHPK3PXP\",...}",
      "credentialData": "{\"subType\":\"totp\",...}"
    }
  ]
}
```

**Expected Behavior**: Update user with new OTP credential including secret.

**Actual Behavior**: Credential is created but `secretData` is not stored. The credential appears in the list but TOTP validation fails with "Invalid authenticator code."

**Evidence**:
```json
// Credential returned by API after creation
{
  "id": "totp-1768235998",
  "type": "otp",
  "userLabel": "E2E Test Authenticator",
  "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\",\"counter\":0}"
  // NOTE: secretData is missing!
}
```

### 3.3 Issue #3: Partial Import Fails with JSON Parse Error

**Endpoint**: `POST /admin/realms/{realm}/partialImport`

**Payload** (validated as correct JSON):
```json
{
  "users": [{
    "username": "test-user.journey",
    "credentials": [
      {"type": "password", "value": "***REDACTED_PASSWORD***", "temporary": false},
      {"type": "otp", "secretData": "...", "credentialData": "..."}
    ]
  }]
}
```

**Expected Behavior**: Import user with credentials.

**Actual Behavior**: Returns `HTTP 500` with `{"error":"unknown_error","error_description":"Cannot parse the JSON"}`.

**Key Observation**: The same endpoint works successfully when OTP credentials are omitted:
```json
// This works (HTTP 200)
{
  "users": [{
    "username": "test-user.journey",
    "credentials": [
      {"type": "password", "value": "***REDACTED_PASSWORD***", "temporary": false}
    ]
  }]
}
```

**Conclusion**: The partial import endpoint has a bug or limitation that prevents parsing nested JSON strings in OTP credential `secretData`/`credentialData` fields.

### 3.4 Issue #4: Direct Access Grants Disabled

**Endpoint**: `POST /realms/{realm}/protocol/openid-connect/token`

Attempted to authenticate as the test user to configure OTP via the Account API.

**Result**: `{"error":"unauthorized_client","error_description":"Client not allowed for direct access grants"}`

**Reason**: The `web-portal` client is a public client with direct access grants disabled (correct security configuration).

---

## 4. Root Cause Analysis

### 4.1 Keycloak Architecture Limitation

Keycloak's credential system is designed with the following security principles:

1. **Secrets are write-only**: Once a credential secret is stored, it cannot be read back via API
2. **OTP setup is user-driven**: OTP credentials are intended to be created through the user's account console during MFA enrollment
3. **Admin API is limited**: Admins can delete credentials but cannot create arbitrary OTP secrets

### 4.2 When OTP Credentials CAN Be Set

| Method | Works? | Notes |
|--------|--------|-------|
| Initial realm import (`--import-realm`) | ✅ Yes | Only on first Keycloak startup with empty realm |
| User self-service (Account Console) | ✅ Yes | User scans QR code, secret generated by Keycloak |
| Admin REST API | ❌ No | Cannot create OTP credentials with custom secrets |
| Partial Import API | ❌ No | JSON parsing fails for OTP credentials |
| Database direct insert | ⚠️ Untested | Would bypass Keycloak's security model |

### 4.3 Keycloak Version

- **Version**: Keycloak 25.x (quay.io/keycloak/keycloak:25.0)
- **Deployment**: Cloud Run (GCP), Docker Compose (dev/stage)

---

## 5. Current Workarounds

### 5.1 Workaround A: Fresh Realm Import (Recommended for New Environments)

When creating a new environment from scratch:

1. Include test user with OTP credentials in `realm-export.json`
2. Use `--import-realm` flag on first Keycloak startup
3. Credentials are imported correctly

**Limitation**: Only works on initial realm creation. Cannot update existing realms.

### 5.2 Workaround B: Manual TOTP Configuration

1. Log into Keycloak Admin Console
2. Navigate to Users → test-user.journey → Credentials
3. Click "Configure OTP"
4. Use an authenticator app to scan the QR code
5. Record the secret from the `otpauth://` URL
6. Update E2E test configuration with the actual secret

**Limitation**: Manual process, secret changes with each setup.

### 5.3 Workaround C: Skip TOTP in E2E Tests (Temporary)

Modify E2E tests to skip TOTP verification for prod environment:

```typescript
if (process.env.TEST_ENV === 'prod') {
  test.skip('TOTP test - cannot programmatically set secret in prod');
}
```

**Limitation**: Reduces test coverage for production environment.

### 5.4 Workaround D: Change Authentication Flow (Not Recommended)

Modify the `browser-with-otp` flow to make OTP optional:

1. Change "OTP Form" requirement from `REQUIRED` to `CONDITIONAL`
2. Users without OTP configured would skip the OTP step

**Limitation**: Reduces security for all users, not just test users.

---

## 6. Recommendations

### 6.1 Short-Term (Immediate)

1. **For dev/stage**: Use fresh realm import with test user credentials pre-configured
2. **For prod**: Manually configure TOTP for `test-user.journey` via Admin Console and document the secret securely

### 6.2 Medium-Term

1. **Investigate Keycloak SPI**: A custom Service Provider Interface could potentially allow programmatic OTP creation
2. **Feature request**: Submit issue to Keycloak GitHub for Admin API OTP credential creation support

### 6.3 Long-Term

1. **Separate test identity provider**: Consider a dedicated test IdP for E2E testing that doesn't require MFA
2. **Mock authentication**: For E2E tests, consider mocking the authentication layer entirely

---

## 7. Script Status

### 7.1 What Works

- ✅ Authenticating to Keycloak Admin API
- ✅ Finding users by username
- ✅ Listing existing OTP credentials
- ✅ Deleting existing OTP credentials
- ✅ Creating users via partial import (without OTP)
- ✅ Setting user passwords

### 7.2 What Does Not Work

- ❌ Creating OTP credentials with known secrets via Admin API
- ❌ Partial import with OTP credentials (JSON parse error)
- ❌ User update with OTP credentials (secretData not stored)

---

## 8. Files Referenced

| File | Purpose |
|------|---------|
| `keycloak/scripts/set-user-totp.sh` | TOTP reset script (created, not fully functional) |
| `keycloak/realm-export.json` | Production realm export with test user |
| `keycloak/realm-export-dev.json` | Development realm export |
| `tests/e2e/specs/login-journey.ui.spec.ts` | E2E test requiring TOTP |

---

## 9. Open Questions for Third-Party Review

1. **Is there an undocumented Admin API endpoint** for creating OTP credentials that we haven't discovered?

2. **Has anyone successfully used the partial import endpoint** with OTP credentials? If so, what JSON format was used?

3. **Are there Keycloak extensions or SPIs** that enable programmatic OTP credential creation?

4. **Is direct database manipulation** a viable option, and what are the security implications?

5. **Do other identity providers** (Auth0, Okta, Azure AD) have similar limitations, or is this Keycloak-specific?

---

## 10. References

- [Keycloak Admin REST API Documentation](https://www.keycloak.org/docs-api/25.0.0/rest-api/index.html)
- [Keycloak User Credentials API](https://www.keycloak.org/docs-api/25.0.0/rest-api/index.html#_users)
- [Keycloak Partial Import](https://www.keycloak.org/docs/latest/server_admin/#_partial_import)
- [RFC 6238 - TOTP Algorithm](https://datatracker.ietf.org/doc/html/rfc6238)

---

*Document prepared for third-party security review. Please direct questions to the Tamshai development team.*
