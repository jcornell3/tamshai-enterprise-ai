# Dev vs Stage Environment Comparison

**Date**: 2026-02-20
**Purpose**: Document differences between dev and stage Phoenix build configurations

## Summary

| Aspect | Dev | Stage | Notes |
|--------|-----|-------|-------|
| Realm Export | realm-export-dev.json (862 lines) | realm-export-stage.json (1027 lines) | Stage is larger |
| Users | 9 users, NO credentials | 9 users, ALL have credentials | Critical difference |
| Clients | 6 clients | 8 clients (+flutter, +website) | Stage has more |
| Protocol Mappers | 0 total | 2 (on flutter/website) | mcp-gateway-audience |
| Credential Placeholders | None | `__TEST_USER_PASSWORD__`, `__TEST_USER_TOTP_SECRET__`, `__STAGE_USER_PASSWORD__` | Stage uses substitution |

---

## 1. User Credentials

### Dev (realm-export-dev.json)
- **NO users have credentials** in the realm export
- Passwords are set via:
  - sync-realm.sh (post-import)
  - identity-sync service
  - Environment variable `DEV_USER_PASSWORD`

### Stage (realm-export-stage.json)
- **ALL users have 2 credentials each** (password + OTP)
- Uses placeholder substitution BEFORE docker build:
  - `__TEST_USER_PASSWORD__` → `TEST_USER_PASSWORD` env var
  - `__TEST_USER_TOTP_SECRET__` → `TEST_USER_TOTP_SECRET_RAW` env var
  - `__STAGE_USER_PASSWORD__` → `STAGE_USER_PASSWORD` env var

**Impact**: Dev relies on post-import scripts; Stage bakes credentials into realm import.

---

## 2. Clients

### Dev Only
```
ai-desktop
ai-mobile
hr-app
finance-app
sales-app
support-app
```

### Stage Additional Clients
```
tamshai-flutter-client  (with mcp-gateway-audience mapper)
tamshai-website         (with mcp-gateway-audience mapper)
```

**Missing in Dev**:
- `tamshai-flutter-client` - Cross-platform Flutter app
- `tamshai-website` - Main web portal

---

## 3. Redirect URIs

### Dev
- Only localhost URLs (`http://localhost:400X/*`)

### Stage
- Localhost URLs PLUS production URLs:
  - `https://www.tamshai.com/*`
  - `https://prod.tamshai.com/*`

---

## 4. Protocol Mappers

### Dev
- No protocol mappers on any client

### Stage
- `tamshai-flutter-client`: `mcp-gateway-audience` mapper
- `tamshai-website`: `mcp-gateway-audience` mapper

**Purpose**: Adds `mcp-gateway` to the token audience claim for API access.

---

## 5. Cloud-Init Differences

### Dev (terraform/dev/)
- Uses local docker-compose
- No cloud-init script
- No placeholder substitution
- Credentials set via identity-sync

### Stage (terraform/vps/cloud-init.yaml)
- Full cloud-init bootstrap
- Placeholder substitution in realm-export-stage.json:
  ```bash
  sed -i "s/__TEST_USER_PASSWORD__/$TEST_USER_PASSWORD/g" keycloak/realm-export-stage.json
  sed -i "s/__TEST_USER_TOTP_SECRET__/$TEST_USER_TOTP_SECRET_RAW/g" keycloak/realm-export-stage.json
  sed -i "s/__STAGE_USER_PASSWORD__/$STAGE_USER_PASSWORD/g" keycloak/realm-export-stage.json
  ```
- Post-import credential verification (not creation)

---

## 6. Environment Variable Differences

### Dev (.env)
```
REALM_EXPORT_FILE=realm-export-dev.json
DEV_USER_PASSWORD=<set locally>
```

### Stage (.env via cloud-init)
```
REALM_EXPORT_FILE=realm-export-stage.json
STAGE_USER_PASSWORD=<from GitHub Secret>
TEST_USER_PASSWORD=<from GitHub Secret>
TEST_USER_TOTP_SECRET_RAW=<from GitHub Secret>
```

---

## 7. Credential Flow Comparison

### Dev Flow
```
1. Keycloak imports realm-export-dev.json (no credentials)
2. sync-realm.sh runs and creates roles/groups
3. identity-sync provisions users from HR database
4. Passwords set via DEV_USER_PASSWORD env var
5. TOTP: Not pre-configured (auto-captured on first login)
```

### Stage Flow
```
1. Cloud-init substitutes placeholders in realm-export-stage.json
2. Docker builds Keycloak with substituted realm
3. Keycloak imports realm WITH credentials (password + TOTP)
4. sync-realm.sh runs for additional config
5. Cloud-init verifies TOTP exists (doesn't recreate)
```

---

## 8. Issues Caused by Differences

### Issue: OTP Credential Deleted
**Symptom**: test-user.journey lost TOTP after Phoenix rebuild
**Cause**: Cloud-init was deleting the OTP credential that was correctly imported from realm export
**Fix**: Changed to verify-only mode (don't delete imported credentials)

### Issue: Dev Missing Clients
**Symptom**: Flutter app and website won't work in dev
**Cause**: realm-export-dev.json missing `tamshai-flutter-client` and `tamshai-website`
**Fix**: Need to add these clients to dev realm export

---

## 9. Recommendations

### Align Dev with Stage
1. Add `tamshai-flutter-client` and `tamshai-website` to realm-export-dev.json
2. Add protocol mappers (mcp-gateway-audience) to dev clients
3. Consider using credential placeholders in dev (optional)

### Keep Intentionally Different
1. Redirect URIs (localhost vs production)
2. Environment-specific passwords (DEV vs STAGE)
3. TOTP auto-capture in dev (simpler for local testing)

---

## 10. File Checksums

```bash
# Current state
md5sum keycloak/realm-export-dev.json    # <hash>
md5sum keycloak/realm-export-stage.json  # <hash>
```

---

*Generated: 2026-02-20*
