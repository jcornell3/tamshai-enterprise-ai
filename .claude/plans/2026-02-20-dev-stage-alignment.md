# Dev/Stage Realm Export Alignment Plan

**Date**: 2026-02-20
**Status**: Phase 2 Complete
**Goal**: Unify dev and stage approaches to use best practices from each

## Target Architecture

| Component | Method | Source of Truth |
|-----------|--------|-----------------|
| Clients | sync-realm.sh | lib/clients.sh |
| Passwords | sync-realm.sh | env vars → lib/users.sh |
| TOTP | Realm export placeholders | Substituted before import |
| Protocol Mappers | sync-realm.sh | lib/mappers.sh |
| Redirect URIs | sync-realm.sh | env vars (ports from GitHub Variables) |

## Current State (After Phase 2)

| Component | Dev | Stage |
|-----------|-----|-------|
| Clients | sync-realm.sh creates all | sync-realm.sh updates all |
| Corporate Passwords | REST API via Terraform | sync-realm.sh (identity-sync) |
| Customer Passwords | REST API via Terraform | REST API via cloud-init |
| TOTP | Placeholder substitution | Placeholder in realm export |

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

## Lessons Learned (Phase 2)

### 6. Script URL Configuration for Container Execution

**Problem**: `sync-customer-realm.sh` used external URLs (`https://www.tamshai.com`) for stage/prod environments, but the script runs inside the Keycloak container via `docker exec`.

**Symptom**: `[ERROR] Failed to authenticate to Keycloak` during customer realm sync.

**Root Cause**: External URL requires TLS and goes through Caddy/Cloudflare, but inside the container, Keycloak is accessible at `http://localhost:8080/auth`.

**Fix**: Updated `sync-customer-realm.sh` to use `http://localhost:8080/auth` for ALL environments (dev, stage, prod) since the script always runs inside the container.

```bash
# Before (wrong for stage/prod)
KEYCLOAK_URL="${KEYCLOAK_URL:-https://www.tamshai.com}"

# After (correct - internal URL)
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080/auth}"
```

**Consistency Check**: The corporate `lib/auth.sh` already used internal URLs correctly - customer script was inconsistent.

### 7. GitHub Secrets Pipeline for VPS

**Problem**: `CUSTOMER_USER_PASSWORD` wasn't being fetched for stage VPS deployments.

**Files Modified**:
- `fetch-github-secrets.ps1` - Added `customer_user_password` to output object
- `main.tf` (VPS) - Added `customer_user_password` to locals and templatefile
- `cloud-init.yaml` - Added `CUSTOMER_USER_PASSWORD` to .env section

**Pattern**: Any new secret from GitHub needs to flow through:
1. `export-test-secrets.yml` workflow (already had CUSTOMER_USER_PASSWORD)
2. `fetch-github-secrets.ps1` PowerShell script
3. `main.tf` locals and templatefile call
4. `cloud-init.yaml` .env section

### 8. REST API Password Setting is More Reliable

**Problem**: Environment variables passed via `docker exec -e VAR=value` don't always reach scripts correctly, especially with special characters.

**Solution**: Use Keycloak REST API directly from cloud-init (outside the container) to set passwords:

```bash
KC_TOKEN=$(curl -s -X POST "http://localhost:8180/auth/realms/master/protocol/openid-connect/token" ...)
curl -s -X PUT ".../users/$USER_ID/reset-password" \
  -H "Authorization: Bearer $KC_TOKEN" \
  -d '{"type":"password","value":"$PASSWORD","temporary":false}'
```

**Benefit**: Passwords are extracted from `.env` file using `grep | cut` which handles special characters better.

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

## Phase 2: Stage Alignment (COMPLETE)

### Task 2.1: Pass port variables to sync-customer-realm.sh ✓

**File**: `infrastructure/terraform/vps/cloud-init.yaml`

Added sync-customer-realm.sh call with port environment variables:

```bash
PORT_WEB_CUSTOMER_SUPPORT=$(grep '^PORT_WEB_CUSTOMER_SUPPORT=' .env | cut -d'=' -f2 || echo "4007")
PORT_CADDY_HTTPS=$(grep '^PORT_CADDY_HTTPS=' .env | cut -d'=' -f2 || echo "443")

docker exec -e KEYCLOAK_ADMIN_PASSWORD="$KC_PASS" \
  -e PORT_WEB_CUSTOMER_SUPPORT="$PORT_WEB_CUSTOMER_SUPPORT" \
  -e PORT_CADDY_HTTPS="$PORT_CADDY_HTTPS" \
  -e CUSTOMER_USER_PASSWORD="$CUSTOMER_PWD" \
  tamshai-dev-keycloak /tmp/keycloak-scripts/sync-customer-realm.sh stage
```

### Task 2.2: Add customer password setting via REST API ✓

**File**: `infrastructure/terraform/vps/cloud-init.yaml`

Added REST API step AFTER sync-customer-realm.sh:

```bash
for email in jane.smith@acme.com bob.developer@acme.com ...; do
  USER_ID=$(curl -s ".../users?username=$email&exact=true" | jq -r '.[0].id // empty')
  if [ -n "$USER_ID" ]; then
    curl -s -X PUT ".../users/$USER_ID/reset-password" \
      -d '{"type":"password","value":"$CUSTOMER_USER_PASSWORD","temporary":false}'
  fi
done
```

### Task 2.3: Fix sync-customer-realm.sh URL for stage/prod ✓

**File**: `keycloak/scripts/sync-customer-realm.sh`

Changed stage/prod KEYCLOAK_URL from external to internal:

```bash
# Before
KEYCLOAK_URL="${KEYCLOAK_URL:-https://www.tamshai.com}"

# After
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080/auth}"
```

### Task 2.4: Add CUSTOMER_USER_PASSWORD to secrets pipeline ✓

**Files Modified**:
- `infrastructure/terraform/vps/scripts/fetch-github-secrets.ps1` - Added to output
- `infrastructure/terraform/vps/main.tf` - Added to locals and templatefile
- `infrastructure/terraform/vps/cloud-init.yaml` - Added to .env section

### Task 2.5: Phoenix Rebuild Stage ✓

```bash
cd infrastructure/terraform/vps
terraform destroy -auto-approve
terraform apply -auto-approve
```

### Task 2.6: Validate Stage ✓

- [x] Cloud-init completes without errors
- [x] All 27 containers healthy
- [x] test-user.journey has password + OTP credentials
- [x] Corporate users have passwords set (via identity-sync)
- [x] **Customer users have passwords set** (verified via E2E tests)
- [x] Customer portal OAuth redirect works (no URI mismatch)
- [x] All clients exist with correct redirect URIs
- [x] E2E tests: 19 employee + 13 customer = 32/32 passed

---

## Phase 3: Documentation Update (IN PROGRESS)

### Task 3.1: Update dev-vs-stage-comparison.md ✓

Added Section 9 documenting Phase 2 customer realm alignment and lessons learned.

### Task 3.2: Update lessons-learned.md ✓

Added three new lessons to docs/development/lessons-learned.md:
- Script URL Configuration for Container Execution
- REST API Password Setting Over Docker Exec Environment Variables
- GitHub Secrets Pipeline for VPS Deployments

### Task 3.3: Re-enable VPS Workflow ✓

Removed `if: false` from deploy-vps.yml pre-deploy job.

### Task 3.4: Update CLAUDE.md

Update "Environment Alignment Goals" section. (Pending)

---

## Key Files Modified

### Phase 1

| File | Change |
|------|--------|
| `keycloak/realm-export-dev.json` | Added TOTP placeholder |
| `keycloak/realm-export-customers-dev.json` | Fixed ports (4007) |
| `keycloak/scripts/sync-customer-realm.sh` | Dynamic ports via env vars |
| `infrastructure/terraform/dev/main.tf` | Interpreter fix, port variables, customer passwords provisioner |

### Phase 2

| File | Change |
|------|--------|
| `infrastructure/terraform/vps/cloud-init.yaml` | Added sync-customer-realm.sh call + REST API password step |
| `infrastructure/terraform/vps/main.tf` | Added customer_user_password to locals and templatefile |
| `infrastructure/terraform/vps/scripts/fetch-github-secrets.ps1` | Added customer_user_password output |
| `keycloak/scripts/sync-customer-realm.sh` | Fixed stage/prod URL to use internal localhost |

---

## Rollback Plan

If issues arise:
- `git revert <commit-hash>` for the Phase 2 commit
- Terraform apply to restore previous state

---

## Success Criteria (ACHIEVED)

After both phases complete:

1. **Both environments use identical approach**: ✓
   - TOTP: Placeholder substitution in realm export
   - Passwords: REST API for customers, identity-sync for corporate
   - Clients: sync-realm.sh creates/updates all
   - Redirect URIs: Built from port env vars

2. **No hardcoded ports**: ✓
   - All ports derived from GitHub Variables
   - Passed via environment variables to sync scripts

3. **sync-realm.sh is authoritative for**: ✓
   - All client configurations
   - All redirect URIs
   - All protocol mappers

4. **Scripts use internal URLs**: ✓
   - All Keycloak scripts use `http://localhost:8080/auth`
   - Works correctly when running inside container via `docker exec`

---

*Created: 2026-02-20*
*Phase 1 Completed: 2026-02-20*
*Phase 2 Completed: 2026-02-21*
