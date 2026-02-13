# Credential Rotation Runbook

**Date**: 2026-02-09
**Status**: Active
**Context**: Security Audit Remediation (D2)
**Schedule**: Quarterly (or immediately upon suspected compromise)

## Overview

This runbook documents the procedures for rotating all service credentials in the Tamshai Enterprise AI platform. Each section covers a specific credential, its scope, and step-by-step rotation instructions.

---

## 1. MCP_GATEWAY_CLIENT_SECRET

**Scope**: Keycloak confidential client secret for `mcp-gateway`
**Used by**: MCP Gateway service, integration tests, E2E tests
**Environments**: dev, stage, prod

### How to Rotate MCP Gateway Secret

1. **Generate new secret**:

   ```bash
   NEW_SECRET=$(openssl rand -hex 32)
   ```

2. **Update Keycloak** (via Admin UI or API):

   ```bash
   # Via kcadm
   kcadm.sh update clients/<uuid> -r tamshai-corp -s "secret=$NEW_SECRET"

   # Or via Admin UI: Clients > mcp-gateway > Credentials > Regenerate
   ```

3. **Update GitHub Secret**:

   ```bash
   gh secret set DEV_MCP_GATEWAY_CLIENT_SECRET --body "$NEW_SECRET"
   # Repeat for STAGE_ and PROD_ prefixes as needed
   ```

4. **Redeploy**:

   ```bash
   cd infrastructure/terraform/dev
   terraform apply -var-file=dev.tfvars
   ```

5. **Verify**: Run health check and one authenticated API call:

   ```bash
   curl http://localhost:3100/health
   # Run E2E gateway tests
   cd tests/e2e && npx playwright test specs/gateway.api.spec.ts
   ```

---

## 2. MCP_INTEGRATION_RUNNER_SECRET

**Scope**: Keycloak confidential client secret for `mcp-integration-runner` (dev only)
**Used by**: Integration tests, E2E API tests
**Environments**: dev only

### How to Rotate Integration Runner Secret

1. **Generate new secret**:

   ```bash
   NEW_SECRET=$(openssl rand -hex 32)
   ```

2. **Update Keycloak** (via kcadm or sync-realm.sh):

   ```bash
   export MCP_INTEGRATION_RUNNER_SECRET="$NEW_SECRET"
   ./keycloak/scripts/docker-sync-realm.sh dev
   ```

3. **Update GitHub Secret**:

   ```bash
   gh secret set DEV_MCP_INTEGRATION_RUNNER_SECRET --body "$NEW_SECRET"
   ```

4. **Redeploy**: `terraform apply -var-file=dev.tfvars`

5. **Verify**: Run integration tests:

   ```bash
   cd services/mcp-gateway && npm run test:integration
   ```

---

## 3. KEYCLOAK_ADMIN_PASSWORD

**Scope**: Keycloak admin console access
**Used by**: Terraform provisioning, sync-realm.sh, integration test setup
**Environments**: dev, stage, prod

### How to Rotate Keycloak Admin Password

1. **Generate new password**:

   ```bash
   NEW_PASSWORD=$(openssl rand -base64 24)  # pragma: allowlist secret
   ```

2. **Update in Keycloak Admin UI**:
   - Login to Admin Console > Users > admin > Credentials > Reset Password

3. **Update GitHub Secret**:

   ```bash
   gh secret set DEV_KEYCLOAK_ADMIN_PASSWORD --body "$NEW_PASSWORD"
   ```

4. **Redeploy**: `terraform apply -var-file=dev.tfvars`

5. **Verify**: Login to Keycloak Admin Console with new password

### Keycloak Recreate Warning

If Keycloak is destroyed and recreated via Terraform, the admin password from `KEYCLOAK_ADMIN_PASSWORD` env var is used for initial setup. Ensure the GitHub Secret matches what Terraform will use.

---

## 4. TAMSHAI_DB_PASSWORD  <!-- pragma: allowlist secret -->

**Scope**: PostgreSQL superuser (`tamshai`) and application user (`tamshai_app`)
**Used by**: All MCP servers, integration tests
**Environments**: dev, stage, prod

### How to Rotate Database Passwords  <!-- pragma: allowlist secret -->

1. **Generate new passwords**:

   ```bash
   NEW_DB_PASSWORD=$(openssl rand -hex 24)
   NEW_APP_PASSWORD=$(openssl rand -hex 24)  # pragma: allowlist secret
   ```

2. **Update in PostgreSQL**:

   ```sql
   ALTER USER tamshai PASSWORD 'new_value_here';  -- pragma: allowlist secret
   ALTER USER tamshai_app PASSWORD 'new_value_here';  -- pragma: allowlist secret
   ```

3. **Update GitHub Secrets**:

   ```bash
   gh secret set DEV_TAMSHAI_DB_PASSWORD --body "$NEW_DB_PASSWORD"
   ```

4. **Redeploy**: `terraform apply -var-file=dev.tfvars`

5. **Verify**: Run a database query through MCP:

   ```bash
   curl http://localhost:3101/health  # MCP HR
   ```

### Note on tamshai_app User

The `tamshai_app` user password is set in `sample-data/hr-data.sql`. If rotating, update the SQL file and redeploy with `--reseed`.

---

## 5. MCP_INTERNAL_SECRET

**Scope**: Shared secret for internal MCP service-to-service communication
**Used by**: MCP Gateway to MCP servers (HR, Finance, Sales, Support, Payroll)
**Environments**: dev, stage, prod

### How to Rotate MCP Internal Secret

1. **Generate new secret**:

   ```bash
   NEW_SECRET=$(openssl rand -hex 32)
   ```

2. **Update GitHub Secret**:

   ```bash
   gh secret set DEV_MCP_INTERNAL_SECRET --body "$NEW_SECRET"
   ```

3. **Redeploy** (all MCP services must restart simultaneously):

   ```bash
   terraform apply -var-file=dev.tfvars
   # Or: docker compose restart mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support mcp-payroll
   ```

4. **Verify**: Run health checks on all MCP servers:

   ```bash
   ./scripts/mcp/health-check.sh dev
   ```

### MCP Internal Secret Consistency Warning

All MCP services must use the same `MCP_INTERNAL_SECRET`. If only some services are restarted, inter-service calls will fail with 401.

---

## 6. VAULT_DEV_ROOT_TOKEN

**Scope**: HashiCorp Vault dev mode root token
**Used by**: Vault UI, secrets management
**Environments**: dev only (prod uses proper Vault auth)

### How to Rotate Vault Token

1. **Generate new token**:

   ```bash
   NEW_TOKEN=$(openssl rand -hex 16)
   ```

2. **Update GitHub Secret**:

   ```bash
   gh secret set DEV_VAULT_ROOT_TOKEN --body "$NEW_TOKEN"
   ```

3. **Restart Vault**: Vault dev mode requires restart to apply new token:

   ```bash
   docker compose restart vault
   ```

4. **Verify**: Access Vault UI at `http://localhost:8200`

---

## 7. TEST_USER_PASSWORD

**Scope**: E2E test service account (`test-user.journey`)
**Used by**: E2E browser tests, login journey tests
**Environments**: dev, stage, prod (same credentials across all)

### How to Rotate Test User Credentials

1. **Generate new password**:

   ```bash
   NEW_PASSWORD=$(openssl rand -base64 16)  # pragma: allowlist secret
   ```

2. **Update in Keycloak** (all environments):
   - Dev: `./keycloak/scripts/docker-sync-realm.sh dev` (uses `TEST_USER_PASSWORD` env var)
   - Stage/Prod: Update via Keycloak Admin UI

3. **Update GitHub Secret**:

   ```bash
   gh secret set TEST_USER_PASSWORD --body "$NEW_PASSWORD"
   ```

4. **For TOTP rotation** (rarely needed):

   ```bash
   # Generate new TOTP secret
   NEW_TOTP=$(openssl rand -hex 16 | base32)
   gh secret set TEST_USER_TOTP_SECRET_RAW --body "$NEW_TOTP"
   # Re-enroll TOTP in Keycloak for test-user.journey
   ```

5. **Verify**: Run E2E login tests:

   ```bash
   cd tests/e2e && npx playwright test specs/login-journey.ui.spec.ts
   ```

---

## 8. MCP_HR_SERVICE_CLIENT_SECRET

**Scope**: Keycloak confidential client for identity sync service
**Used by**: `identity-sync` service (creates Keycloak users from HR database)
**Environments**: dev, stage (disabled in prod — see P3 security policy)

### How to Rotate HR Service Secret

1. **Generate new secret**:

   ```bash
   NEW_SECRET=$(openssl rand -hex 32)
   ```

2. **Update Keycloak**: Via sync-realm.sh:

   ```bash
   export MCP_HR_SERVICE_CLIENT_SECRET="$NEW_SECRET"
   ./keycloak/scripts/docker-sync-realm.sh dev
   ```

3. **Update GitHub Secret**:

   ```bash
   gh secret set DEV_MCP_HR_SERVICE_CLIENT_SECRET --body "$NEW_SECRET"
   ```

4. **Redeploy**: `terraform apply -var-file=dev.tfvars`

5. **Verify**: Run identity sync manually and check for errors

---

## Rotation Schedule

| Credential | Frequency | Last Rotated | Next Due |
|-----------|-----------|-------------|----------|
| MCP_GATEWAY_CLIENT_SECRET | Quarterly | - | - |
| MCP_INTEGRATION_RUNNER_SECRET | Quarterly | 2026-02-09 (created) | 2026-05-09 |
| KEYCLOAK_ADMIN_PASSWORD | Quarterly | - | - |
| TAMSHAI_DB_PASSWORD | Quarterly | - | - |
| MCP_INTERNAL_SECRET | Quarterly | - | - |
| VAULT_DEV_ROOT_TOKEN | Quarterly | - | - |
| TEST_USER_PASSWORD | Quarterly | - | - |
| MCP_HR_SERVICE_CLIENT_SECRET | Quarterly | - | - |

## Emergency Rotation

If a credential is suspected compromised:

1. **Rotate immediately** using the steps above
2. **Check audit logs** for unauthorized access:

   ```bash
   docker compose logs keycloak | grep "LOGIN_ERROR\|INVALID_TOKEN"
   docker compose logs mcp-gateway | grep "401\|403"
   ```

3. **Document the incident** in `docs/security/` following `SECURITY_INCIDENT_*.md` format
4. **Notify the team** via the incident response process (see `docs/security/incident-response.md`)

---

*Last Updated: 2026-02-09*
*Security Audit: Feb 2026 Three-Pass Review*
