# Plan: Fix Customer Realm Provisioning (Login UX Flow)

**Status**: CLOSED
**Closed**: 2026-02-13

All 9 items have been implemented and verified in the codebase.

---

## Context

The customer realm (`tamshai-customers`) is imported by Docker's `--import-realm` from `realm-export-customers-dev.json` baked into `keycloak/Dockerfile.dev`. However, the realm's **runtime configuration** (clients, roles, groups, sample users) never gets provisioned because:

1. **`KEYCLOAK_CUSTOMER_REALM` env var is never set** - not in `docker.env.tftpl`, not in `docker-compose.yml`, not anywhere. The integration test (`customer-support.test.ts:27`) reads it as `undefined`, causing all 11 customer tests to skip.
2. **`sync-customer-realm.sh` never runs automatically** - `deploy.sh` only calls `sync-realm.sh` (employee realm). The `docker-sync-realm.sh` wrapper only copies/executes the employee sync script.
3. **`CUSTOMER_USER_PASSWORD` never reaches the `.env` file** - The GitHub secret exists (`export-test-secrets.yml:40`) but `fetch-github-secrets.ps1` doesn't fetch it, `variables.tf` has no variable for it, `main.tf` doesn't pass it to the template, and `docker.env.tftpl` doesn't output it.
4. **`sync-customer-realm.sh:54` hardcodes port `8180`** for dev fallback, violating the naming convention established for all other services.

**Goal**: Customer realm provisioning follows the same patterns as the employee realm - env vars in `.env`, sync runs automatically during deploy, and tests pass.

---

## Changes

### 1. Add `KEYCLOAK_CUSTOMER_REALM` to Terraform `.env` template

**File**: `infrastructure/terraform/dev/templates/docker.env.tftpl`

Add under the `KEYCLOAK CONFIGURATION` section:

```text
KEYCLOAK_CUSTOMER_REALM=tamshai-customers
```

This is a static value (same as `KEYCLOAK_REALM=tamshai-corp` pattern used in jest.config.js). No Terraform variable needed.

### 2. Add `CUSTOMER_USER_PASSWORD` to the full Terraform pipeline

**4 files** must be updated to thread this secret through:

**a. `infrastructure/terraform/dev/scripts/fetch-github-secrets.ps1`**
- Add `"customer_user_password" = ""` to the output defaults (line ~57)
- Add `$output["customer_user_password"] = Get-GlobalSecret "CUSTOMER_USER_PASSWORD"` (global, not env-specific, since it's the same across environments)

**b. `infrastructure/terraform/dev/variables.tf`**
- Add new variable:

  ```hcl
  variable "customer_user_password" {
    description = "Password for customer test users - GitHub secret CUSTOMER_USER_PASSWORD"
    type        = string
    sensitive   = true
    default     = ""
  }
  ```

**c. `infrastructure/terraform/dev/main.tf`**
- In the `local_file.docker_env` resource, add to the templatefile parameters:

  ```hcl
  customer_user_password = try(data.external.github_secrets.result.customer_user_password, "")
  ```

**d. `infrastructure/terraform/dev/templates/docker.env.tftpl`**
- Add under `USER CREDENTIALS` section:

  ```text
  # Password for customer test users - GitHub secret: CUSTOMER_USER_PASSWORD
  CUSTOMER_USER_PASSWORD=${customer_user_password}
  ```

### 3. Add `KEYCLOAK_CUSTOMER_REALM` to `tests/integration/jest.config.js`

**File**: `tests/integration/jest.config.js`

Add after the `KEYCLOAK_REALM` derivation:

```js
process.env.KEYCLOAK_CUSTOMER_REALM = process.env.KEYCLOAK_CUSTOMER_REALM || 'tamshai-customers';
```

### 4. Enhance `docker-sync-realm.sh` to support customer realm

**File**: `keycloak/scripts/docker-sync-realm.sh`

Currently the script only handles the employee realm. Extend it to accept a third argument `customers`:

**Usage**: `./docker-sync-realm.sh dev tamshai-keycloak customers`

Changes:
- Accept optional `$3` parameter (`REALM_TYPE="${3:-corp}"`)
- If `REALM_TYPE=customers`, copy and execute `sync-customer-realm.sh` instead of `sync-realm.sh`
- Also copy the `lib/` directory (both scripts need it)
- Pass `CUSTOMER_USER_PASSWORD` env var for dev environment

### 5. Fix hardcoded port in `sync-customer-realm.sh`

**File**: `keycloak/scripts/sync-customer-realm.sh` (line 54)

Change:

```bash
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
```

To:

```bash
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
```

**Rationale**: This script runs **inside** the Keycloak Docker container (via `docker exec`), where Keycloak listens on internal port `8080`. The employee realm's `sync-realm.sh` uses `http://localhost:8080` for the same reason. The `8180` was a bug (that's the host-mapped port, not the container-internal port).

### 6. Add customer realm sync to `deploy.sh`

**File**: `scripts/infra/deploy.sh`

In `sync_keycloak_dev()` (after line 244), add customer realm sync:

```bash
# Sync customer realm
docker cp "$PROJECT_ROOT/keycloak/scripts/sync-customer-realm.sh" tamshai-keycloak:/tmp/sync-customer-realm.sh
docker exec -u 0 tamshai-keycloak bash -c 'sed -i "s/\r$//" /tmp/sync-customer-realm.sh && chmod 755 /tmp/sync-customer-realm.sh'
docker exec -e CUSTOMER_USER_PASSWORD="$CUSTOMER_USER_PASSWORD" tamshai-keycloak /tmp/sync-customer-realm.sh dev
```

Similarly update `sync_keycloak_stage()` in the SSH heredoc (after line 280).

### 7. Add customer realm sync to Terraform `main.tf`

**File**: `infrastructure/terraform/dev/main.tf`

Add a new `null_resource` block after `keycloak_set_passwords` that runs the customer realm sync script inside the Keycloak container. This follows the same pattern as `keycloak_set_passwords` and `keycloak_set_totp`:

```hcl
resource "null_resource" "keycloak_sync_customer_realm" {
  count = var.auto_start_services ? 1 : 0
  depends_on = [null_resource.keycloak_set_passwords]
  triggers = { always_run = timestamp() }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command = <<-EOT
      echo "Syncing customer realm..."

      # Copy scripts into container
      docker cp "${var.project_root}/keycloak/scripts/sync-customer-realm.sh" tamshai-keycloak:/tmp/sync-customer-realm.sh
      docker cp "${var.project_root}/keycloak/scripts/lib" tamshai-keycloak:/tmp/lib

      # Fix line endings and permissions
      docker exec -u 0 tamshai-keycloak bash -c '
        sed -i "s/\r$//" /tmp/sync-customer-realm.sh
        find /tmp/lib -name "*.sh" -exec sed -i "s/\r$//" {} \;
        chmod +x /tmp/sync-customer-realm.sh
        find /tmp/lib -name "*.sh" -exec chmod +x {} \;
      '

      # Run customer realm sync
      docker exec -e CUSTOMER_USER_PASSWORD="$CUSTOMER_USER_PASSWORD" \
        tamshai-keycloak /tmp/sync-customer-realm.sh dev

      echo "Customer realm sync complete!"
    EOT

    environment = {
      CUSTOMER_USER_PASSWORD = try(data.external.github_secrets.result.customer_user_password, "")
      MSYS_NO_PATHCONV       = "1"
    }
  }
}
```

### 8. Update `customer-support.test.ts` OpenID configuration URL

**File**: `tests/integration/customer-support.test.ts` (line 44)

The OpenID well-known endpoint uses a hyphen, not an underscore. Line 44 currently has:

```typescript
// WRONG: openid_configuration (underscore)
`.../.well-known/openid_configuration`
```

Fix to:

```typescript
// CORRECT: openid-configuration (hyphen)
`.../.well-known/openid-configuration`
```

This is a confirmed bug - the standard OIDC discovery URL uses a hyphen.

---

## File Change Summary (9 files)

| # | File | Change |
|---|------|--------|
| 1 | `infrastructure/terraform/dev/templates/docker.env.tftpl` | Add `KEYCLOAK_CUSTOMER_REALM` + `CUSTOMER_USER_PASSWORD` |
| 2 | `infrastructure/terraform/dev/scripts/fetch-github-secrets.ps1` | Fetch `CUSTOMER_USER_PASSWORD` from GitHub secrets |
| 3 | `infrastructure/terraform/dev/variables.tf` | Add `customer_user_password` variable |
| 4 | `infrastructure/terraform/dev/main.tf` | Pass `customer_user_password` to template + new `keycloak_sync_customer_realm` resource |
| 5 | `tests/integration/jest.config.js` | Add `KEYCLOAK_CUSTOMER_REALM` derivation |
| 6 | `keycloak/scripts/docker-sync-realm.sh` | Support `customers` argument for customer realm sync |
| 7 | `keycloak/scripts/sync-customer-realm.sh` | Fix port `8180` → `8080` (container-internal) |
| 8 | `scripts/infra/deploy.sh` | Add customer realm sync to dev and stage deploy flows |
| 9 | `tests/integration/customer-support.test.ts` | Fix OpenID URL typo if present |

---

## Verification

1. **Terraform apply**: `cd infrastructure/terraform/dev && terraform apply -var-file=dev.tfvars` - should show customer realm sync in output
2. **Check .env**: Verify `KEYCLOAK_CUSTOMER_REALM=tamshai-customers` and `CUSTOMER_USER_PASSWORD=<value>` appear in `infrastructure/docker/.env`
3. **Manual sync test**: `cd keycloak/scripts && ./docker-sync-realm.sh dev tamshai-keycloak customers` - should complete successfully
4. **Integration tests**: `cd tests/integration && npx jest customer-support.test.ts` - 11 tests should now run (not skip)
5. **Employee realm unaffected**: `cd tests/integration && npx jest rbac.test.ts` - should still pass (136 tests)
