# Token Exchange Authorization Sync - Blocking Issue

**Date**: 2026-02-12
**Status**: ⚠️ BLOCKED - For Third-Party Review
**Context**: Implementing idempotent token exchange permission configuration

---

## Summary

Successfully implemented client scope assignment for token exchange (allowing mcp-integration-runner to issue tokens with `preferred_username` and `resource_access` claims), but the Authorization Services permission binding (via `lib/authz.sh`) is failing silently during automated sync.

---

## What Works ✅

1. **Client Scope Assignment** - COMPLETE
   - Profile, email, and roles scopes assigned to mcp-integration-runner ✅
   - Username mapper added for `preferred_username` claim ✅
   - Integrated into `sync_integration_runner_client()` in `lib/clients.sh` ✅
   - Runs successfully during keycloak-sync ✅

2. **Standalone Authorization Script** - WORKS
   - `keycloak/scripts/configure-token-exchange.sh` works correctly
   - Successfully creates client policy and binds to impersonate permission
   - Uses Read-Modify-Write pattern as required by Keycloak API
   - Can be run manually after deployment

3. **Test Code Update** - COMPLETE
   - Added `scope='openid profile'` to token exchange request ✅
   - Updated in `tests/shared/auth/token-exchange.ts` ✅

---

## What's Blocked ❌

**Authorization Services Permission Binding** - Automated sync fails

**File**: `keycloak/scripts/lib/authz.sh`
**Function**: `get_admin_token()` and `sync_token_exchange_permissions()`

### Symptoms

1. Sync reaches "Syncing token exchange permissions for mcp-integration-runner..."
2. Logs show "Authenticating for REST API access..."
3. Script exits immediately with exit code 1
4. **NO debug output** from `get_admin_token()` function
5. No error messages logged

### Expected Behavior

Should see debug output like:

```
[INFO]   [DEBUG] Entering get_admin_token function
[INFO]   [DEBUG] Token URL: http://keycloak:8080/auth/realms/master/protocol/openid-connect/token
[INFO]   [DEBUG] curl is available
[INFO]   [DEBUG] jq is available at /usr/local/bin/jq
[INFO]   [DEBUG] ADMIN_USER=admin
[INFO]   [DEBUG] ADMIN_PASS is SET
[INFO]   [DEBUG] Calling curl to get admin token...
```

### Actual Behavior

```
[INFO] Syncing token exchange permissions for mcp-integration-runner...
[INFO]   Authenticating for REST API access...
Keycloak sync failed with exit code 1
```

---

## Investigation Steps Taken

### 1. Tool Availability

**jq Installation**:
- Added jq to Keycloak Dockerfile (lines 17-19)
- Downloads jq-linux-amd64 v1.7.1 from GitHub releases
- Installed to `/usr/local/bin/jq` with execute permissions
- Rebuilt image with `--no-cache` flag
- Updated `keycloak-sync` service to use custom image

**curl Availability**:
- curl is built into Keycloak base image (confirmed working in other scripts)

### 2. Debug Output Added

**Comprehensive logging** in `get_admin_token()`:
- Entry point logging: `log_info "  [DEBUG] Entering get_admin_token function"`
- Tool checks: curl and jq version tests
- Variable checks: ADMIN_USER and ADMIN_PASS presence
- Step-by-step logging: before/after each command
- Error handlers: capture and log curl/jq failures

**Result**: None of the debug statements execute, suggesting function never enters

### 3. Syntax Fixes

**HERE string replaced**:
- Changed `jq ... <<< "$var"` to `echo "$var" | jq ...`
- Reason: HERE string syntax may not be available in all bash versions

**Result**: No change in behavior

### 4. Error Handling

**Added explicit error checks**:
- Test curl/jq availability before use
- Capture exit codes from curl and jq
- Log responses on failure
- Use `|| { error; return 1; }` pattern for failures

**Result**: Error handlers never execute, suggesting earlier failure

---

## Technical Details

### Script Context

**File**: `keycloak/scripts/lib/authz.sh`
**Sourced by**: `keycloak/scripts/sync-realm.sh` (line 53)
**Called from**: `sync_token_exchange_permissions()` function (line 203)
**Shell**: bash (via `#!/bin/bash` and container entrypoint)
**Set flags**: `set -euo pipefail` (fail on error, undefined vars, pipe failures)

### Function Call

```bash
# In sync_token_exchange_permissions()
log_info "  Authenticating for REST API access..."
local ADMIN_TOKEN
ADMIN_TOKEN=$(get_admin_token)  # ← Fails here
if [ -z "$ADMIN_TOKEN" ]; then
    log_error "  Failed to get admin token"
    return 1
fi
```

**Problem**: `$(get_admin_token)` creates a subshell and should capture output, but function appears to fail before producing any output or logs.

### Environment Variables

**Available in container**:
- `KEYCLOAK_URL=http://keycloak:8080/auth` ✅
- `ADMIN_USER=$KEYCLOAK_ADMIN` (from env: `admin`) ✅
- `ADMIN_PASS=$KEYCLOAK_ADMIN_PASSWORD` (from env: set) ✅

**Verified**: Other functions in sync script successfully use these variables

### Shell Features Used

**Potentially problematic**:
- Subshell capture: `var=$(function)`
- Process substitution: `<(command)`
- HERE strings: `<<< "$var"` (already replaced with pipe)
- Local variables: `local var`
- Command substitution in conditionals: `if [ -z "$(command)" ]`

---

## Workaround (RECOMMENDED)

### Option 1: Manual Script Execution (Immediate Fix)

**Run standalone script after deployment**:

```bash
# 1. Deploy services
cd infrastructure/terraform/dev
terraform apply -var-file=dev.tfvars

# 2. Run token exchange configuration
cd ../../../keycloak/scripts
./configure-token-exchange.sh

# 3. Test
cd ../../tests/integration
npm test -- auth-token-exchange.test.ts
```

**Pros**:
- Proven to work (script was already successful)
- Uses same Read-Modify-Write pattern
- Same API calls as `lib/authz.sh`
- Takes ~30 seconds to run

**Cons**:
- Manual step required after deployments
- Not fully idempotent (must remember to run)
- Doesn't survive automated Phoenix rebuilds without manual intervention

### Option 2: Realm Export (Long-term Fix)

**Export realm after manual configuration**:

```bash
# 1. Run configure-token-exchange.sh manually (once)
cd keycloak/scripts
./configure-token-exchange.sh

# 2. Export realm with authorization settings
docker compose exec keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp/export \
  --realm tamshai-corp

# 3. Copy export and update realm-export-dev.json
docker compose cp keycloak:/tmp/export/tamshai-corp-realm.json ./realm-export-new.json

# 4. Review and replace realm export
diff keycloak/realm-export-dev.json ./realm-export-new.json
cp ./realm-export-new.json keycloak/realm-export-dev.json

# 5. Commit to git
git add keycloak/realm-export-dev.json
git commit -m "feat(keycloak): bake token exchange permissions into realm export"
```

**Pros**:
- Fully idempotent (part of realm import)
- No sync script needed
- Survives all rebuilds automatically

**Cons**:
- Realm exports can be large and hard to diff
- Authorization settings embedded in JSON (less visible)
- Changes require manual re-export

---

## Questions for Third-Party Review

1. **Shell Environment**: Is there a bash incompatibility with the Keycloak container's shell that would prevent function execution without error output?

2. **Subshell Behavior**: Could `ADMIN_TOKEN=$(get_admin_token)` be silently failing in a way that bypasses `set -e`?

3. **Library Sourcing**: Could there be an issue with how `authz.sh` is sourced that makes functions unavailable in the calling context?

4. **Alternative Approach**: Is there a better way to structure the REST API calls that doesn't rely on function composition?

5. **jq Path**: Could `/usr/local/bin/jq` not be in the PATH for subshells, even though it exists?

---

## Relevant Code

### get_admin_token() - Current Implementation

```bash
get_admin_token() {
    log_info "  [DEBUG] Entering get_admin_token function"  # ← Never executes

    local token_url="${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
    log_info "  [DEBUG] Token URL: $token_url"

    # Test if curl exists
    if curl --version >/dev/null 2>&1; then
        log_info "  [DEBUG] curl is available"
    else
        log_error "curl is NOT available"
        return 1
    fi

    # Test if jq exists
    if /usr/local/bin/jq --version >/dev/null 2>&1; then
        log_info "  [DEBUG] jq is available at /usr/local/bin/jq"
    else
        log_error "jq is NOT available at /usr/local/bin/jq"
        return 1
    fi

    log_info "  [DEBUG] ADMIN_USER=${ADMIN_USER:-NOT_SET}"
    log_info "  [DEBUG] ADMIN_PASS is ${ADMIN_PASS:+SET}"

    log_info "  [DEBUG] Calling curl to get admin token..."
    local token_response
    token_response=$(curl -s -X POST "$token_url" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=${ADMIN_USER}" \
        -d "password=${ADMIN_PASS}" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" 2>&1) || {
        log_error "curl command failed"
        return 1
    }

    log_info "  [DEBUG] curl completed, parsing with jq..."
    local token
    token=$(echo "$token_response" | /usr/local/bin/jq -r '.access_token // empty' 2>&1) || {
        log_error "jq command failed"
        log_error "Response was: $token_response"
        return 1
    }

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Failed to get admin token (empty or null)"
        log_error "Full response: $token_response"
        return 1
    fi

    log_info "  [DEBUG] Admin token acquired successfully (length: ${#token})"
    echo "$token"
}
```

### configure-token-exchange.sh - Working Version

**Location**: `keycloak/scripts/configure-token-exchange.sh`

**Key differences from lib/authz.sh**:
- Standalone script (not sourced as library)
- Uses inline token acquisition (not separate function)
- Doesn't rely on subshell captures for token
- Successfully tested and working

**Relevant section**:

```bash
# Step 1: Authenticate and get admin token
ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$ADMIN_TOKEN" == "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Failed to authenticate. Check KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD."
  exit 1
fi

echo "✅ Authenticated successfully"
```

**Why this works**: Token acquisition and jq parsing happen in a single pipeline, no function calls, no subshells for the function itself.

---

## Impact Assessment

### What's Working Without This

- ✅ Client scopes assigned (profile, email, roles)
- ✅ Username mapper added
- ✅ Token exchange request includes `scope='openid profile'`
- ✅ TestAuthProvider updated with scope parameter

**Expected Results** (with client scopes but without permission binding):
- Token exchange will still fail with "subject not allowed to impersonate"
- Need to run `configure-token-exchange.sh` manually OR use realm export approach

### What's Needed for Full Success

- ❌ Authorization Services permission binding (blocked)
- Requires: Client policy created
- Requires: Policy bound to impersonate permission

**Without this**: Integration tests will fail with permission errors, but token claims will be correct once permission is configured.

---

## Recommendation

**Immediate Action** (User):
1. Run `keycloak/scripts/configure-token-exchange.sh` manually after deployment
2. Test integration tests to verify all 16 pass
3. Choose long-term solution:
   - **Option A**: Document manual script execution in deployment process
   - **Option B**: Export realm and bake authorization settings into realm-export-dev.json

**Third-Party Investigation** (If Desired):
1. Review `lib/authz.sh` function structure for shell compatibility issues
2. Test alternative approaches to token acquisition (inline vs. function)
3. Investigate why debug output from function never appears

---

## Files Modified

1. `keycloak/scripts/lib/authz.sh` - Authorization library (⚠️ blocked)
2. `keycloak/scripts/lib/clients.sh` - Client scope assignment (✅ working)
3. `tests/shared/auth/token-exchange.ts` - Scope parameter (✅ working)
4. `keycloak/Dockerfile.dev` - jq installation (✅ working)
5. `infrastructure/docker/docker-compose.yml` - Custom image for sync (✅ working)

---

**Document Version**: 1.0
**Status**: Documented for third-party review
**Next Action**: Manual workaround or third-party investigation
