# Keycloak Dev vs Prod Configuration Differences

## Overview

This document catalogs all configuration differences between:
- **Dev/Stage**: `keycloak/realm-export-dev.json` (used for local dev and VPS stage)
- **Production**: `keycloak/realm-export.json` (used for GCP Cloud Run)

## Critical Configuration Differences

### 1. TOTP Algorithm (FIXED)

**Status**: ✅ Now consistent (both use SHA1)

| Environment | Algorithm | Status |
|-------------|-----------|--------|
| Dev/Stage | `HmacSHA1` | ✅ Correct (matches Google Authenticator) |
| Production | `HmacSHA1` | ✅ Fixed (was `HmacSHA256` - incompatible with oathtool) |

**History**:
- Original config (Dec 2025): Both used `HmacSHA1`
- Commit `ec43ddc` (Dec 26, 2025): Changed prod to `HmacSHA256` for "security upgrade"
- **Problem**: SHA256 broke oathtool compatibility, offered no real security benefit
- **Fix**: Reverted prod to `HmacSHA1` (Jan 10, 2026)

**Why SHA1 is Correct**:
- RFC 6238 standard for TOTP
- Compatible with oathtool and Google Authenticator
- Secure enough (30-second validity window)
- SHA256 offers no meaningful security advantage for TOTP

### 2. Required Actions (MINOR DIFFERENCE)

**Status**: ✅ No practical impact

| Setting | Dev/Stage | Production |
|---------|-----------|------------|
| CONFIGURE_TOTP defaultAction | `false` | `true` |
| CONFIGURE_RECOVERY_AUTHN_CODES defaultAction | `false` | `false` |

**Important**: This setting is **irrelevant** because TOTP enforcement is controlled by the authentication flow, not defaultAction.

**Actual TOTP Enforcement**:
Both dev and prod use the `browser-with-otp` authentication flow with `auth-otp-form` as **REQUIRED**:

```json
{
  "browserFlow": "browser-with-otp",
  "authenticationExecutions": [
    {
      "authenticator": "auth-username-password-form",
      "requirement": "REQUIRED"
    },
    {
      "authenticator": "auth-otp-form",
      "requirement": "REQUIRED"  // ← This enforces TOTP
    }
  ]
}
```

**Impact**:
- **All environments (dev/stage/prod)**: TOTP setup is **required and non-skippable** on first login
- **User experience**: After entering username/password, users MUST configure TOTP before accessing the app
- **No difference** between dev and prod in actual behavior

## Environment-Specific Differences

### 3. Test Users

**Dev/Stage** (10 users):
- alice.chen (VP of HR)
- bob.martinez (Finance Director)
- carol.johnson (VP of Sales)
- dan.williams (Support Director)
- eve.thompson (CEO)
- frank.davis (Intern)
- ryan.garcia
- nina.patel (Manager)
- marcus.johnson (Software Engineer)
- test-user.journey (E2E test account)

**Production** (1 user):
- test-user.journey (E2E test account only)

**Why**: Security best practice - production should not have hardcoded test users with known passwords.

### 4. Client Redirect URIs

Production includes additional redirect URIs for stage and prod domains:

**hr-app, finance-app, sales-app, support-app**:
- Dev: `http://localhost:400[1-4]/*` only
- Prod: `http://localhost:400[1-4]/*` + `https://www.tamshai.com/*` + `https://prod.tamshai.com/*`

**tamshai-website**:
- Dev: localhost, tamshai.local, www.tamshai.local, vps.tamshai.com, tamshai.com, www.tamshai.com
- Prod: Same as dev + `https://prod.tamshai.com/*`

**Why**: Allows OAuth redirects from production and staging environments.

### 5. Client Web Origins (CORS)

Production includes additional CORS origins:

**hr-app, finance-app, sales-app, support-app**:
- Dev: `http://localhost:400[1-4]` only
- Prod: `http://localhost:400[1-4]` + `https://www.tamshai.com` + `https://prod.tamshai.com`

**tamshai-website**:
- Dev: localhost, tamshai.local, www.tamshai.local, vps.tamshai.com, tamshai.com, www.tamshai.com
- Prod: Same as dev + `https://prod.tamshai.com`

**Why**: Allows CORS requests from production and staging web apps.

## Configuration Consistency Matrix

| Configuration | Dev/Stage | Production | Status |
|--------------|-----------|------------|--------|
| TOTP Algorithm | `HmacSHA1` | `HmacSHA1` | ✅ Consistent |
| TOTP Default Action | `false` | `true` | ⚠️ Different |
| Test Users | 10 users | 1 user | ✅ Intentional |
| Redirect URIs | Dev only | Dev + Prod | ✅ Intentional |
| Web Origins | Dev only | Dev + Prod | ✅ Intentional |

## Recommendations

### Short-term (Immediate)
1. ✅ **DONE**: Revert TOTP algorithm to SHA1 in production
2. ⚠️ **CONSIDER**: Change `CONFIGURE_TOTP` defaultAction to `false` in production for consistency

### Long-term (Next Sprint)
1. **Use Terraform/IaC** to manage Keycloak configuration instead of manual JSON exports
2. **Automate TOTP enforcement** via Keycloak groups/policies instead of defaultAction
3. **Add CI tests** to verify dev/prod config consistency for critical settings
4. **Document** why each difference exists (this file is a start)

## How to Verify Current Configuration

### Check Running Dev Keycloak
```bash
curl -s http://localhost:8180/auth/realms/tamshai-corp | jq '.otpPolicyAlgorithm'
# Should output: "HmacSHA1"
```

### Check Running Prod Keycloak
```bash
curl -s https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp | jq '.otpPolicyAlgorithm'
# Should output: "HmacSHA1" (after realm recreation)
```

## Related Issues

- **TOTP Not Working in Prod**: Root cause was SHA256 vs SHA1 mismatch
- **oathtool Compatibility**: Only supports SHA1, not SHA256
- **Dev/Stage Never Updated**: Still running original SHA1 config from before Dec 26, 2025

## References

- [RFC 6238 - TOTP](https://tools.ietf.org/html/rfc6238): Specifies SHA1 as default
- [Keycloak OTP Policy](https://www.keycloak.org/docs/latest/server_admin/#_otp_policies)
- Commit `ec43ddc`: Security remediation that introduced SHA256
- Commit `5716ba0`: Original dev/prod realm separation

---

*Last Updated: 2026-01-10*
*Author: Tamshai-QA*
