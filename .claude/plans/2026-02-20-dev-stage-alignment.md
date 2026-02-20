# Dev/Stage Realm Export Alignment Plan

**Date**: 2026-02-20
**Status**: Phase 1 Complete
**Goal**: Unify dev and stage approaches to use best practices from each

## Target Architecture

| Component | Method | Source of Truth |
|-----------|--------|-----------------|
| Clients | sync-realm.sh | lib/clients.sh |
| Passwords | sync-realm.sh | env vars → lib/users.sh |
| TOTP | Realm export placeholders | Substituted before import |
| Protocol Mappers | sync-realm.sh | lib/mappers.sh |
| Redirect URIs | sync-realm.sh | env vars (ports from GitHub Variables) |

## Current State

| Component | Dev | Stage |
|-----------|-----|-------|
| Clients | 6 in export, sync-realm.sh creates all | 8 in export, sync-realm.sh updates |
| Passwords | sync-realm.sh | Placeholders + sync-realm.sh |
| TOTP | Placeholder substitution (Phase 1 complete) | Placeholders in export |

---

## Lessons Learned (Phase 1)

### 1. Terraform Windows Interpreter Issue

**Problem**: On Windows, Terraform `local-exec` defaults to `cmd.exe` instead of bash.

**Symptom**: Scripts fail with "cmd /C docker compose down..." instead of bash.

**Fix**: Add `interpreter = ["bash", "-c"]` to ALL provisioners that use bash scripts.

```hcl
provisioner "local-exec" {
  interpreter = ["bash", "-c"]  # REQUIRED on Windows
  command     = <<-EOT
    # bash script here
  EOT
}
```

### 2. Redirect URI Port Mismatch

**Problem**: `sync-customer-realm.sh` was overwriting redirect URIs from realm export without the Caddy HTTPS port.

**Root Cause**: Hardcoded ports (4007) didn't include Caddy HTTPS port (443/8443).

**Impact**: Customer login failed because OAuth redirect didn't match registered URIs.

**Fix**:
1. Pass `PORT_WEB_CUSTOMER_SUPPORT` and `PORT_CADDY_HTTPS` to sync scripts
2. Build redirect URIs dynamically using environment variables
3. Never hardcode ports - derive from GitHub Variables

### 3. `docker compose down -v` Implications

**Problem**: Using `-v` flag wipes ALL volumes including Keycloak database.

**Impact**: Every Phoenix rebuild starts fresh - sync scripts MUST correctly set all credentials.

**Requirements**:
- All password env vars must be passed correctly
- Customer realm sync must run AFTER employee realm sync
- Verify all credentials are set after rebuild

### 4. Environment Variable Passing

**Problem**: `CUSTOMER_USER_PASSWORD` was passed but not sourced correctly due to .env file syntax errors.

**Fix**: Use `grep ... | cut -d'=' -f2-` to extract specific variables instead of sourcing entire .env file.

### 5. Customer Password Setting via kcadm Fails Silently

**Problem**: `sync-customer-realm.sh` uses `kcadm set-password` inside the container, but the `CUSTOMER_USER_PASSWORD` environment variable doesn't reach the script properly.

**Root Cause**: Docker exec with heredoc and environment variables doesn't reliably pass the password.

**Fix**: Added dedicated `keycloak_set_customer_passwords` Terraform provisioner that uses REST API (same pattern as corporate users).

---

## Phase 1: Dev Alignment (COMPLETE)

### Task 1.1: Add TOTP placeholder to realm-export-dev.json ✓

**File**: `keycloak/realm-export-dev.json`

Added credentials with TOTP placeholder to test-user.journey.

### Task 1.2: Add placeholder substitution to dev bootstrap ✓

**File**: `infrastructure/terraform/dev/main.tf`

Added placeholder substitution BEFORE docker compose build, restoration AFTER build.

**Critical**: Added `interpreter = ["bash", "-c"]` to fix Windows issue.

### Task 1.3: Remove DB insert hack from dev/main.tf ✓

Replaced `keycloak_set_totp` (DB insert) with `keycloak_verify_totp` (verification only).

### Task 1.4: Fix Customer Realm Sync ✓

**File**: `keycloak/scripts/sync-customer-realm.sh`

- Added port configuration via environment variables
- Updated redirect URIs to use `PORT_WEB_CUSTOMER_SUPPORT` and `PORT_CADDY_HTTPS`
- Removed hardcoded port values

**File**: `infrastructure/terraform/dev/main.tf`

- Added `PORT_WEB_CUSTOMER_SUPPORT` and `PORT_CADDY_HTTPS` to keycloak_sync_customer_realm environment

### Task 1.5: Fix Customer Realm Export ✓

**File**: `keycloak/realm-export-customers-dev.json`

- Fixed incorrect ports (4006/4017 → 4007)
- Aligned rootUrl, redirectUris, webOrigins, and post.logout.redirect.uris

### Task 1.6: Phoenix Rebuild Dev ✓

```bash
cd infrastructure/terraform/dev
terraform destroy -auto-approve
terraform apply -auto-approve
```

### Task 1.7: Validate Dev ✓

- [x] Bootstrap completes without errors
- [x] All containers healthy
- [x] test-user.journey has OTP credential (verified via `keycloak_verify_totp`)
- [x] test-user.journey can authenticate with TOTP (E2E: login-journey passed)
- [x] Corporate users have passwords set
- [x] Customer portal login works (E2E: customer-login-journey 26/26 passed)
- [x] All redirect URIs correctly include Caddy HTTPS port

### Task 1.8: Fix Customer User Passwords ✓

**Problem**: Customer users created from realm import but passwords not set by sync-customer-realm.sh

**File**: `infrastructure/terraform/dev/main.tf`

- Added `keycloak_set_customer_passwords` provisioner using REST API
- Uses same pattern as corporate user password setting
- Runs after `keycloak_sync_customer_realm`

---

## Phase 2: Stage Alignment (Pending)

**Lessons to Apply from Phase 1:**
- Port variables must be passed to sync-customer-realm.sh
- Customer passwords must be set via REST API (not kcadm inside container)
- Realm exports should NOT have password placeholders (passwords set via API)

### Task 2.1: Pass port variables to sync-customer-realm.sh

**File**: `infrastructure/terraform/vps/cloud-init.yaml`

Update the customer realm sync step to pass port environment variables:

```bash
# Before sync-customer-realm.sh call, export:
export PORT_WEB_CUSTOMER_SUPPORT="${PORT_WEB_CUSTOMER_SUPPORT:-4007}"
export PORT_CADDY_HTTPS="${PORT_CADDY_HTTPS:-443}"
```

### Task 2.2: Add customer password setting via REST API

**File**: `infrastructure/terraform/vps/cloud-init.yaml`

Add a new step AFTER sync-customer-realm.sh to set customer passwords via REST API:

```bash
# Set customer passwords via REST API (same pattern as dev)
KC_TOKEN=$(curl -s -X POST "http://localhost:8080/auth/realms/master/protocol/openid-connect/token" \
  -d "username=admin" --data-urlencode "password=$KEYCLOAK_ADMIN_PASSWORD" \
  -d "grant_type=password" -d "client_id=admin-cli" | jq -r '.access_token')

for email in jane.smith@acme.com bob.developer@acme.com mike.manager@globex.com \
             sara.support@globex.com peter.principal@initech.com tim.tech@initech.com; do
  USER_ID=$(curl -s "http://localhost:8080/auth/admin/realms/tamshai-customers/users?username=$email&exact=true" \
    -H "Authorization: Bearer $KC_TOKEN" | jq -r '.[0].id // empty')
  if [ -n "$USER_ID" ]; then
    curl -s -X PUT "http://localhost:8080/auth/admin/realms/tamshai-customers/users/$USER_ID/reset-password" \
      -H "Authorization: Bearer $KC_TOKEN" -H "Content-Type: application/json" \
      -d "{\"type\":\"password\",\"value\":\"$CUSTOMER_USER_PASSWORD\",\"temporary\":false}"
  fi
done
```

### Task 2.3: Verify stage realm export has correct ports

**File**: `keycloak/realm-export-customers-stage.json` (if exists) or use dev export

Ensure redirect URIs include both standard and Caddy HTTPS ports.

### Task 2.4: Phoenix Rebuild Stage

```bash
cd infrastructure/terraform/vps
terraform destroy -auto-approve
terraform apply -auto-approve
```

### Task 2.5: Validate Stage

- [ ] Cloud-init completes without errors
- [ ] All 27 containers healthy
- [ ] test-user.journey has password + OTP credentials
- [ ] Corporate users have passwords set
- [ ] **Customer users have passwords set** (verify via login)
- [ ] Customer portal OAuth redirect works (no URI mismatch)
- [ ] All clients exist with correct redirect URIs

---

## Phase 3: Documentation Update

### Task 3.1: Update dev-vs-stage-comparison.md

Document unified approach after both phases complete.

### Task 3.2: Update CLAUDE.md

Update "Environment Alignment Goals" section.

---

## Key Files Modified (Phase 1)

| File | Change |
|------|--------|
| `keycloak/realm-export-dev.json` | Added TOTP placeholder |
| `keycloak/realm-export-customers-dev.json` | Fixed ports (4007) |
| `keycloak/scripts/sync-customer-realm.sh` | Dynamic ports via env vars |
| `infrastructure/terraform/dev/main.tf` | Interpreter fix, port variables, customer passwords provisioner |

---

## Rollback Plan

If Phase 2 fails:
- `git checkout HEAD~1 -- keycloak/realm-export-stage.json infrastructure/terraform/vps/cloud-init.yaml`
- Terraform apply to restore working state

---

## Success Criteria

After both phases complete:

1. **Both environments use identical approach**:
   - TOTP: Placeholder substitution in realm export
   - Passwords: sync-realm.sh via Admin API
   - Clients: sync-realm.sh creates all
   - Redirect URIs: Built from port env vars

2. **No hardcoded ports**:
   - All ports derived from GitHub Variables
   - Passed via environment variables to sync scripts

3. **sync-realm.sh is authoritative for**:
   - All client configurations
   - All redirect URIs
   - All password setting
   - All protocol mappers

---

*Created: 2026-02-20*
*Phase 1 Completed: 2026-02-20*
