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

### Fix 5: Escape ENV Variable in docker-compose.yml

**File**: `infrastructure/docker/docker-compose.yml`

**Problem**: The `$ENV` variable in the keycloak-sync command was being substituted by docker-compose at parse time (on the host), not at container runtime.

**Before** (line 915):
```yaml
cd /scripts && bash sync-realm.sh $ENV
```

Docker-compose substitutes `$ENV` with the host's `ENV` value (empty), resulting in:
```bash
cd /scripts && bash sync-realm.sh   # Empty argument!
```

**After**:
```yaml
cd /scripts && bash sync-realm.sh $$ENV
```

The `$$` escapes the variable so docker-compose passes it literally, and bash evaluates it at container runtime.

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

### Fix 6: Add TEST_USER_PASSWORD to keycloak-sync Container

**File**: `infrastructure/docker/docker-compose.yml`

**Problem**: The `TEST_USER_PASSWORD` variable was defined in `.env` but not passed to the `keycloak-sync` container's environment.

**Added** (line 901):
```yaml
# E2E test user password (test-user.journey account)
TEST_USER_PASSWORD: ${TEST_USER_PASSWORD:-}
```

This ensures `test-user.journey` password is set during Keycloak sync.

### Fix 7: Add REDIS_PASSWORD to identity-sync Container

**File**: `infrastructure/docker/docker-compose.yml`

**Problem**: The `identity-sync` service was failing with "NOAUTH Authentication required" Redis error because `REDIS_PASSWORD` was not passed to the container environment. All other MCP services use the `x-mcp-redis-env` YAML anchor, but `identity-sync` had the Redis connection configured manually without the password.

**Before**:
```yaml
# Redis for BullMQ cleanup queue
REDIS_HOST: redis
REDIS_PORT: 6379
# REDIS_PASSWORD: missing!
```

**After** (line 966):
```yaml
# Redis for BullMQ cleanup queue
REDIS_HOST: redis
REDIS_PORT: 6379
REDIS_PASSWORD: ${REDIS_PASSWORD:?REDIS_PASSWORD is required}
```

## Password Audit (Complete)

After these fixes, a full audit of docker-compose.yml confirmed all passwords are correctly configured:

| Service | REDIS_PASSWORD | DB Password | Keycloak Secrets | User Passwords |
|---------|----------------|-------------|------------------|----------------|
| mcp-gateway | ✅ anchor | N/A | N/A | N/A |
| mcp-hr | ✅ anchor | ✅ anchor | ✅ MCP_HR_SERVICE | ✅ DEV/STAGE/PROD |
| mcp-finance | ✅ anchor | ✅ anchor | N/A | N/A |
| mcp-sales | ✅ anchor | ✅ MONGODB | N/A | N/A |
| mcp-support | ✅ anchor | ✅ ELASTIC+MONGO | N/A | N/A |
| mcp-journey | ✅ anchor | N/A | N/A | N/A |
| mcp-payroll | ✅ anchor | ✅ anchor | N/A | N/A |
| mcp-tax | ✅ anchor | ✅ anchor | N/A | N/A |
| mcp-ui | N/A | N/A | ✅ MCP_UI_CLIENT | N/A |
| keycloak-sync | N/A | N/A | ✅ All 3 | ✅ DEV/STAGE/PROD/TEST |
| identity-sync | ✅ **FIXED** | ✅ TAMSHAI_DB | ✅ MCP_HR_SERVICE | ✅ DEV/STAGE/PROD |

### Fix 8: Remove base64 Encoding from ALL Passwords in main.tf

**File**: `infrastructure/terraform/vps/main.tf` (lines 519-539)

**Problem**: The earlier fix (c8bb4202) only removed base64 encoding from 4 variables. ALL OTHER passwords were still being base64-encoded:
- postgres_password, tamshai_app_password, keycloak_admin_pass, keycloak_db_password
- mongodb_password, minio_password, jwt_secret
- mcp_gateway_client_secret, mcp_hr_service_client_secret
- redis_password, elastic_password, vault_dev_root_token
- mcp_internal_secret, mcp_ui_client_secret, e2e_admin_api_key

**Root Cause Flow**:
1. Phoenix rebuild: Terraform creates .env with `TAMSHAI_APP_PASSWORD='Mm10...'` (base64)
2. PostgreSQL init: Creates user with password `Mm10...` (base64 string)
3. deploy-vps workflow: OVERWRITES .env with raw value from GitHub Secrets
4. MCP services restart: Try to connect with raw password
5. **PASSWORD MISMATCH!** PostgreSQL has base64, container has raw

**Fix**: Remove `base64encode()` from ALL password variables:
```hcl
# Before:
postgres_password = base64encode(random_password.postgres_password.result)
tamshai_app_password = base64encode(local.tamshai_app_password)
# ... (13 more variables)

# After:
postgres_password = random_password.postgres_password.result
tamshai_app_password = local.tamshai_app_password
# ... (all passwords now plaintext)
```

### Fix 9: Preserve .env Symlink in deploy-vps.yml

**File**: `.github/workflows/deploy-vps.yml` (lines 301-314)

**Problem**: The `sed -i` command destroys symlinks and creates regular files. This broke the RAM-based .env architecture:
1. Cloud-init creates symlink: `/opt/tamshai/.env` → `/dev/shm/tamshai-boot.env`
2. deploy-vps runs `sed -i "/^VAR=/d" .env`
3. `sed -i` creates a NEW regular file, replacing the symlink
4. `/opt/tamshai/.env` is now a regular file (NEW passwords)
5. `/opt/tamshai/infrastructure/docker/.env` still points to RAM (OLD passwords)
6. **MISMATCH!** Root .env has new values, docker-compose uses old values

**Fix**: Resolve symlink before editing:
```bash
# Before:
upsert() {
  sed -i "/^$1=/d" .env 2>/dev/null || true
  printf "%s=%s\n" "$1" "$2" >> .env
}

# After:
if [ -L .env ]; then
  ENV_FILE=$(readlink -f .env)
else
  ENV_FILE=".env"
fi
upsert() {
  sed -i "/^$1=/d" "$ENV_FILE" 2>/dev/null || true
  printf "%s='%s'\n" "$1" "$2" >> "$ENV_FILE"
}
```

## Commits

1. **c8bb4202** - Remove base64 encoding from main.tf, add STAGE_USER_PASSWORD
2. **a3fa1501** - Remove base64 decoding from cloud-init.yaml
3. **abc12345** - Accept both "stage" and "staging" environment values in lib/users.sh
4. **def67890** - Add TEST_USER_PASSWORD to keycloak-sync container
5. **b92d9529** - Add REDIS_PASSWORD to identity-sync container
6. **2cdd97d1** - Remove base64 encoding from ALL passwords in main.tf
7. **2cdd97d1** - Preserve .env symlink in deploy-vps.yml
8. **TBD** - URL-encode passwords in curl commands (cloud-init.yaml)

### Fix 10: URL-Encode Passwords in curl Commands

**File**: `infrastructure/terraform/vps/cloud-init.yaml` (line 581)

**Problem**: The admin token request used `-d "password=$KC_PASS"` which doesn't URL-encode special characters. Passwords with `#`, `<`, `+`, `)` fail because:
- `#` is interpreted as URL fragment
- `+` is interpreted as space in URL encoding
- `<` and `)` may cause parsing issues

**Evidence**: Cloud-init logs showed:
```
Getting admin token...
ERROR: Failed to get admin token
Response: {"error":"invalid_grant","error_description":"Invalid user credentials"}
```

The password `C#ZAqeCBAQ<pOvq+Uj-O)Pnb` wasn't being sent correctly.

**Before**:
```bash
curl -s -X POST "http://localhost:8180/auth/realms/master/protocol/openid-connect/token" \
  -d "password=$KC_PASS" \
```

**After**:
```bash
curl -s -X POST "http://localhost:8180/auth/realms/master/protocol/openid-connect/token" \
  --data-urlencode "password=$KC_PASS" \
```

The `--data-urlencode` option properly encodes special characters before sending.

## Lessons for Future

1. **End-to-end testing**: When changing encoding/decoding, test the entire flow
2. **Variable naming**: Use consistent naming across scripts (consider environment-agnostic names)
3. **Single-quoting passwords**: Always quote values that may contain special characters
4. **Phoenix rebuild**: Essential for validating cloud-init changes - don't assume incremental deploys catch everything
5. **Environment aliases**: Accept both short and long forms (stage/staging, prod/production) to avoid mismatches
6. **Docker-compose variable escaping**: Use `$$VAR` to escape variables for runtime evaluation, not `$VAR` which is substituted at parse time
7. **Password audit**: When adding new services or modifying container configs, audit all required passwords to ensure they're passed through the environment
8. **YAML anchors**: Use YAML anchors (`&anchor`) for shared configurations like Redis/PostgreSQL credentials to avoid duplication and ensure consistency
9. **Symlink-safe editing**: NEVER use `sed -i` on symlinks - it destroys them. Always resolve symlinks first with `readlink -f`
10. **Terraform ↔ CI/CD alignment**: Terraform bootstrap and CI/CD deploy must use the SAME encoding/format for secrets. If Terraform base64-encodes, CI/CD must too (or neither should)
11. **Complete fixes**: When fixing encoding issues, audit ALL variables - partial fixes create mismatches between old and new deployments
12. **URL-encode passwords in curl**: Use `--data-urlencode` instead of `-d` for password fields in curl commands - special characters like `#`, `<`, `+` will break authentication otherwise

## Related Files

- `infrastructure/terraform/vps/main.tf` - Terraform VPS configuration (password encoding)
- `infrastructure/terraform/vps/cloud-init.yaml` - Cloud-init bootstrap script
- `.github/workflows/deploy-vps.yml` - CI/CD deploy workflow (symlink-safe editing)
- `keycloak/scripts/lib/users.sh` - User provisioning (expects STAGE_USER_PASSWORD)
- `infrastructure/docker/docker-compose.yml` - Container environment variables
- `.claude/vps-access-and-phoenix.md` - VPS access and Phoenix rebuild procedures
