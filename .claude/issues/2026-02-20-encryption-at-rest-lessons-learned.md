# Encryption at Rest Deployment - Lessons Learned

**Date**: 2026-02-20
**Issue**: Cloud-init failed with "base64: invalid input" during Phoenix rebuild
**Status**: Resolved

## Summary

After a Phoenix rebuild (terraform destroy + apply), cloud-init failed during the "C2 Security: Encrypting secrets at rest" phase with the error:

```
base64: invalid input
```

This prevented the VPS from completing its bootstrap process, leaving services unstarted.

## Root Cause Analysis

### Issue 1: Base64 Encoding Mismatch

**Problem**: The `main.tf` file was base64-encoding passwords before passing them to the cloud-init template, but then the template was also expected to decode them. When we removed the base64 encoding from `main.tf` to fix password authentication issues, we didn't update the cloud-init script that was still trying to decode.

**Original (buggy) flow**:
```
main.tf: base64encode(password) → cloud-init template → base64 -d → .env file
```

**What happened when we removed encoding in main.tf**:
```
main.tf: raw_password → cloud-init template → base64 -d (FAILS!) → never reaches .env
```

### Issue 2: Variable Name Mismatch

**Problem**: The `.env` file created by cloud-init had `USER_PASSWORD`, but `sync-realm.sh` (via `lib/users.sh`) was looking for the environment-specific variable `STAGE_USER_PASSWORD`.

**Evidence**: Cloud-init logs showed:
```
STAGE_USER_PASSWORD not set
TEST_USER_PASSWORD not set
```

This caused corporate user password provisioning to fail silently.

### Issue 3: Environment Naming Mismatch (staging vs stage)

**Problem**: The Terraform `environment` variable was set to `staging`, but `lib/users.sh` only accepted `stage` as a valid environment value.

**Flow**:
```
terraform.tfvars: environment = "staging"
↓
cloud-init.yaml: ENVIRONMENT=${environment}  →  ENVIRONMENT=staging
↓
docker-compose: ENV: ${ENVIRONMENT:-dev}    →  ENV=staging
↓
lib/users.sh: case "${ENV:-dev}" in stage) ...  →  NO MATCH, falls to default (dev)
↓
Script looks for DEV_USER_PASSWORD (not found) instead of STAGE_USER_PASSWORD
```

**Evidence**: Keycloak-sync logs showed:
```
[WARN] DEV_USER_PASSWORD not set - cannot set corporate user passwords
```

When `ENVIRONMENT=staging` but script only checks for `stage`.

## Resolution

### Fix 1: Remove Base64 Encoding from main.tf

**File**: `infrastructure/terraform/vps/main.tf`

**Before** (lines 526, 529-531):
```hcl
root_password                = base64encode(random_password.root_password.result)
stage_user_password          = base64encode(local.stage_user_password_resolved)
test_user_password           = base64encode(local.test_user_password)
test_user_totp_secret_raw    = base64encode(local.test_user_totp_secret_raw)
```

**After**:
```hcl
root_password                = random_password.root_password.result
stage_user_password          = local.stage_user_password_resolved
test_user_password           = local.test_user_password
test_user_totp_secret_raw    = local.test_user_totp_secret_raw
```

### Fix 2: Remove Base64 Decoding from cloud-init.yaml

**File**: `infrastructure/terraform/vps/cloud-init.yaml`

**Before** (line 403):
```bash
decoded_value=$(echo "$value" | base64 -d)
```

**After**:
```bash
# No longer decoding - passwords are passed as plaintext
echo "$key='$value'" >> "$DECODED_RAM"
```

### Fix 3: Add STAGE_USER_PASSWORD to cloud-init.yaml

**File**: `infrastructure/terraform/vps/cloud-init.yaml` (lines 181-186)

**Added**:
```yaml
# User Password - Fixed password for synced users (from STAGE_USER_PASSWORD secret)
# Both USER_PASSWORD and STAGE_USER_PASSWORD are set for compatibility:
# - USER_PASSWORD: used by identity-sync
# - STAGE_USER_PASSWORD: used by sync-realm.sh lib/users.sh
USER_PASSWORD=${stage_user_password}
STAGE_USER_PASSWORD=${stage_user_password}
```

### Fix 4: Accept Both "stage" and "staging" Environment Values

**File**: `keycloak/scripts/lib/users.sh`

**Before** (line 213):
```bash
case "${ENV:-dev}" in
    prod)
        echo "${PROD_USER_PASSWORD:-}"
        ;;
    stage)
        echo "${STAGE_USER_PASSWORD:-}"
        ;;
    *)
        echo "${DEV_USER_PASSWORD:-}"
        ;;
esac
```

**After**:
```bash
case "${ENV:-dev}" in
    prod|production)
        echo "${PROD_USER_PASSWORD:-}"
        ;;
    stage|staging)
        echo "${STAGE_USER_PASSWORD:-}"
        ;;
    *)
        echo "${DEV_USER_PASSWORD:-}"
        ;;
esac
```

Now both `ENVIRONMENT=stage` and `ENVIRONMENT=staging` will correctly use `STAGE_USER_PASSWORD`.

## Current Encryption Flow (After Fix)

1. **Terraform generates passwords** using `random_password` resources
2. **Passwords are passed as plaintext** to cloud-init template (no base64)
3. **Cloud-init writes to RAM** at `/dev/shm/tamshai-secrets.env`
4. **Password values are single-quoted** to preserve special characters like `()[]#|&!`
5. **Encryption at rest**: AES-256-CBC encryption using instance ID + salt
6. **Encrypted blob stored** at `/opt/tamshai/.env.enc`
7. **At runtime**: Decrypted to `/dev/shm/.tamshai.env` (RAM) and symlinked

## Security Considerations

### Why Passwords Needed Special Handling

Random passwords from Terraform can contain special shell characters:
- Parentheses: `(`, `)`
- Brackets: `[`, `]`
- Pipe: `|`
- Ampersand: `&`
- Hash: `#`

These cause shell interpretation issues in `.env` files unless single-quoted.

### Current Protection Layers

1. **In-Transit**: Passwords passed via Hetzner cloud-init (encrypted API)
2. **At-Rest**: AES-256-CBC encrypted, key derived from instance ID + random salt
3. **Runtime**: Decrypted only in RAM (`/dev/shm`), never written plaintext to disk
4. **Access Control**: Files chmod 600, owned by tamshai:tamshai

## Testing Verification

After Phoenix rebuild with fixes:

```bash
# SSH works immediately (key authentication)
ssh -i .keys/deploy_key root@5.78.159.29

# Cloud-init completes without errors
cloud-init status --long
# status: done
# errors: []

# Services are healthy
docker ps --format "table {{.Names}}\t{{.Status}}"
# All containers: Up X minutes (healthy)

# Root password works (not base64 encoded)
# Login via Hetzner console with actual password

# Corporate users can log in
# eve.thompson at https://www.tamshai.com with STAGE_USER_PASSWORD
```

## Commits

1. **c8bb4202** - Remove base64 encoding from main.tf, add STAGE_USER_PASSWORD
2. **a3fa1501** - Remove base64 decoding from cloud-init.yaml
3. **TBD** - Accept both "stage" and "staging" environment values in lib/users.sh

## Lessons for Future

1. **End-to-end testing**: When changing encoding/decoding, test the entire flow
2. **Variable naming**: Use consistent naming across scripts (consider environment-agnostic names)
3. **Single-quoting passwords**: Always quote values that may contain special characters
4. **Phoenix rebuild**: Essential for validating cloud-init changes - don't assume incremental deploys catch everything

## Related Files

- `infrastructure/terraform/vps/main.tf` - Terraform VPS configuration
- `infrastructure/terraform/vps/cloud-init.yaml` - Cloud-init bootstrap script
- `keycloak/scripts/lib/users.sh` - User provisioning (expects STAGE_USER_PASSWORD)
- `.claude/vps-access-and-phoenix.md` - VPS access and Phoenix rebuild procedures
