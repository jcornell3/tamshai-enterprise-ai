# Dev/Stage Realm Export Alignment Plan

**Date**: 2026-02-20
**Status**: Planning
**Goal**: Unify dev and stage approaches to use best practices from each

## Target Architecture

| Component | Method | Source of Truth |
|-----------|--------|-----------------|
| Clients | sync-realm.sh | lib/clients.sh |
| Passwords | sync-realm.sh | env vars → lib/users.sh |
| TOTP | Realm export placeholders | Substituted before import |
| Protocol Mappers | sync-realm.sh | lib/mappers.sh |

## Current State

| Component | Dev | Stage |
|-----------|-----|-------|
| Clients | 6 in export, sync-realm.sh creates all | 8 in export, sync-realm.sh updates |
| Passwords | sync-realm.sh | Placeholders + sync-realm.sh |
| TOTP | DB insert hack in main.tf | Placeholders in export |

---

## Phase 1: Dev Alignment (Do First)

### Task 1.1: Add TOTP placeholder to realm-export-dev.json

**File**: `keycloak/realm-export-dev.json`

Add credentials with TOTP placeholder to test-user.journey:

```json
{
  "username": "test-user.journey",
  ...
  "credentials": [
    {
      "type": "otp",
      "secretData": "{\"value\":\"__TEST_USER_TOTP_SECRET__\"}",
      "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA256\"}"
    }
  ]
}
```

**Note**: Do NOT add password placeholder - sync-realm.sh handles passwords.

### Task 1.2: Add placeholder substitution to dev bootstrap

**File**: `infrastructure/terraform/dev/main.tf`

Add a step to substitute `__TEST_USER_TOTP_SECRET__` in realm-export-dev.json before docker compose up:

```hcl
# In the null_resource that runs docker compose
provisioner "local-exec" {
  command = <<-EOT
    # Substitute TOTP placeholder
    if [ -n "$TEST_USER_TOTP_SECRET_RAW" ]; then
      sed -i "s/__TEST_USER_TOTP_SECRET__/$TEST_USER_TOTP_SECRET_RAW/g" keycloak/realm-export-dev.json
      echo "[OK] TEST_USER_TOTP_SECRET placeholder substituted"
    else
      echo "[WARN] TEST_USER_TOTP_SECRET_RAW not set"
    fi

    # Then run docker compose
    docker compose up -d
  EOT
}
```

### Task 1.3: Remove DB insert hack from dev/main.tf

**File**: `infrastructure/terraform/dev/main.tf`

Remove the entire section that does direct PostgreSQL insert for OTP credentials:

```hcl
# DELETE THIS SECTION:
# docker exec tamshai-dev-postgres psql -U keycloak -d keycloak -qtA -c "
#   INSERT INTO credential ...
# "
```

### Task 1.4: Phoenix Rebuild Dev

```bash
cd infrastructure/terraform/dev
terraform destroy -auto-approve
terraform apply -auto-approve
```

### Task 1.5: Validate Dev

Verify:
- [ ] Cloud-init/bootstrap completes without errors
- [ ] All containers healthy
- [ ] test-user.journey has OTP credential (via Keycloak Admin API)
- [ ] test-user.journey can authenticate with TOTP
- [ ] Corporate users have passwords set (via sync-realm.sh)
- [ ] All clients exist (created by sync-realm.sh)

---

## Phase 2: Stage Alignment (After Dev Validated)

### Task 2.1: Remove redundant clients from realm-export-stage.json

**File**: `keycloak/realm-export-stage.json`

Remove these clients (sync-realm.sh will create them):
- tamshai-flutter-client
- tamshai-website

Keep only the minimal clients that stage needs for initial import.

### Task 2.2: Remove password placeholders from realm-export-stage.json

**File**: `keycloak/realm-export-stage.json`

For all users, change credentials to ONLY have OTP (remove password):

```json
// Before:
"credentials": [
  {"type": "password", "value": "__TEST_USER_PASSWORD__", ...},
  {"type": "otp", "secretData": "{\"value\":\"__TEST_USER_TOTP_SECRET__\"}", ...}
]

// After:
"credentials": [
  {"type": "otp", "secretData": "{\"value\":\"__TEST_USER_TOTP_SECRET__\"}", ...}
]
```

sync-realm.sh will set passwords via Admin API.

### Task 2.3: Update cloud-init.yaml placeholder substitution

**File**: `infrastructure/terraform/vps/cloud-init.yaml`

Remove password placeholder substitution (only keep TOTP):

```bash
# Remove these lines:
# sed -i "s/__TEST_USER_PASSWORD__/$TEST_USER_PASSWORD/g" keycloak/realm-export-stage.json
# sed -i "s/__STAGE_USER_PASSWORD__/$STAGE_USER_PASSWORD/g" keycloak/realm-export-stage.json

# Keep only:
sed -i "s/__TEST_USER_TOTP_SECRET__/$TEST_USER_TOTP_SECRET_RAW/g" keycloak/realm-export-stage.json
```

### Task 2.4: Phoenix Rebuild Stage

```bash
cd infrastructure/terraform/vps
terraform destroy -auto-approve
terraform apply -auto-approve
```

### Task 2.5: Validate Stage

Verify:
- [ ] Cloud-init completes without errors
- [ ] All 27 containers healthy
- [ ] test-user.journey has password + OTP credentials
- [ ] Corporate users have passwords set
- [ ] All clients exist (tamshai-flutter-client, tamshai-website, etc.)
- [ ] Protocol mappers configured correctly

---

## Phase 3: Documentation Update

### Task 3.1: Update dev-vs-stage-comparison.md

Document that dev and stage now use the same approach.

### Task 3.2: Update CLAUDE.md

Update the "Environment Alignment Goals" section to reflect the unified approach.

---

## Rollback Plan

If Phase 1 fails:
- `git checkout HEAD~1 -- keycloak/realm-export-dev.json infrastructure/terraform/dev/main.tf`
- Terraform apply to restore working state

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

2. **Realm exports are minimal**:
   - Users with OTP placeholders only
   - No password placeholders
   - No client definitions (or minimal)

3. **sync-realm.sh is authoritative for**:
   - All client configurations
   - All password setting
   - All protocol mappers

---

## Estimated Effort

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Phase 1 | 5 tasks | Dev Phoenix rebuild + validation |
| Phase 2 | 5 tasks | Stage Phoenix rebuild + validation |
| Phase 3 | 2 tasks | Documentation |

---

*Created: 2026-02-20*
