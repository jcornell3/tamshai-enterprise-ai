# Scripts Index

**Repository**: Tamshai Enterprise AI
**Generated**: 2026-01-03
**Total Scripts**: 58 (42 shell, 16 PowerShell)

---

## Summary Statistics

| Category | Count | Location |
|----------|-------|----------|
| Infrastructure (infra) | 8 | `scripts/infra/` |
| Database (db) | 2 | `scripts/db/` |
| MCP Server | 2 | `scripts/mcp/` |
| Vault | 2 | `scripts/vault/`, `scripts/` |
| Test | 2 | `scripts/test/` |
| Keycloak | 3 | `keycloak/scripts/` |
| Desktop Client (Windows) | 8 | `clients/desktop/` |
| Spec Kit (.specify) | 10 | `.specify/scripts/` |
| Terraform/Cloud | 3 | `infrastructure/terraform/` |
| Root Scripts | 8 | `scripts/` |
| CI/CD Workflows | 26 | `.github/workflows/` |
| Sample Data | 4 | `sample-data/` |

---

## Script Inventory

### Infrastructure Scripts (`scripts/infra/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `status.sh` | Check health status of all services | dev, stage | Manual | Yes | Docker, curl, nc |
| `deploy.sh` | Deploy or restart services | dev, stage | Manual | Yes | Docker Compose, SSH (stage) |
| `keycloak.sh` | Manage Keycloak sync, status, clients | dev, stage | Manual | Yes | Docker, kcadm |
| `logs.sh` | View service logs | dev | Manual | Yes | Docker Compose |
| `rollback.sh` | Rollback deployments | dev, stage | Manual | No | Git, Docker |
| `shell.sh` | Interactive shell into containers | dev | Manual | Yes | Docker |
| `teardown.sh` | Stop and optionally remove containers | dev, stage | Manual | No | Docker Compose |
| `backup.sh` | Backup databases (PostgreSQL, MongoDB, Keycloak) | dev | Manual | Yes | Docker |

### Database Scripts (`scripts/db/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `backup.sh` | Backup PostgreSQL, MongoDB, Redis | dev, stage | Manual | Yes | Docker, SSH (stage) |
| `restore.sh` | Restore databases from backup | dev, stage | Manual | No | Docker, SSH (stage) |

### MCP Server Scripts (`scripts/mcp/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `health-check.sh` | Check MCP server health and connectivity | dev, stage | Manual | Yes | curl, jq |
| `restart.sh` | Restart MCP servers | dev, stage | Manual | Yes | Docker Compose |

### Vault Scripts (`scripts/vault/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `vault.sh` | Manage Vault secrets, policies, rotation | dev, stage | Manual | Varies | Docker, vault CLI |

### Test Scripts (`scripts/test/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `login-journey.sh` | Test SSO login flow end-to-end | dev, stage | Manual | Yes | curl |
| `user-validation.sh` | Validate test user configuration | dev | Manual | Yes | curl, jq |

### Keycloak Scripts (`keycloak/scripts/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `sync-realm.sh` | Synchronize Keycloak configuration | dev, stage, prod | Manual | Yes | kcadm CLI (in container) |
| `docker-sync-realm.sh` | Docker wrapper for sync-realm.sh | dev | Manual | Yes | Docker |
| `sync-users.sh` | Sync test users to Keycloak | dev | Manual | Yes | kcadm CLI |

### Root Scripts (`scripts/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `setup-dev.sh` | **DEPRECATED** - Legacy dev environment setup | dev | Manual | Yes | Docker, npm |
| `deploy-vps.sh` | Deploy to VPS via SSH or cloud API | stage | Manual | Yes | Terraform, SSH |
| `discover-mobile-host.sh` | Find mobile device host for testing | dev | Manual | Yes | ip, ifconfig |
| `generate-mtls-certs.sh` | Generate mTLS certificates | prod | Manual | No | openssl |
| `get-keycloak-token.sh` | Acquire Keycloak access token | dev, stage | Manual | Yes | curl, jq |
| `validate-production-config.sh` | Validate production configuration | prod | Manual | Yes | - |
| `vault-install.sh` | Install Vault CLI locally | dev | Manual | Yes | curl |
| `verify-mcp-servers.sh` | Verify MCP server connectivity | dev | Manual | Yes | curl |

### PowerShell Scripts (Windows)

#### Desktop Client (`clients/desktop/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `register-protocol-dev.ps1` | Register tamshai-ai:// protocol handler | dev | Manual | Yes | npm, Electron |
| `register-test-protocol.ps1` | Register test protocol for CI | dev | Manual | Yes | - |
| `unregister-protocol-dev.ps1` | Remove protocol handler registration | dev | Manual | Yes | - |
| `check-protocol-registration.ps1` | Verify protocol is registered | dev | Manual | Yes | - |
| `test-protocol.ps1` | Test protocol handler functionality | dev | Manual | Yes | - |
| `show-registry.ps1` | Display current registry entries | dev | Manual | Yes | - |
| `view-debug-log.ps1` | View Electron debug logs | dev | Manual | Yes | - |
| `clear-debug-log.ps1` | Clear Electron debug logs | dev | Manual | Yes | - |

#### Infrastructure (`scripts/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `setup-terraform-dev-env.ps1` | Configure Terraform dev environment | dev | Manual | Yes | Terraform |
| `cleanup-terraform-dev-env.ps1` | Clean up Terraform state/resources | dev | Manual | No | Terraform |
| `set-vault-secrets.ps1` | Set secrets in Vault | dev, stage | Manual | Yes | vault CLI |
| `verify-stage-deployment.ps1` | Verify stage VPS deployment status | stage | Manual | Yes | curl |
| `discover-mobile-host.ps1` | Find mobile device host (Windows) | dev | Manual | Yes | ipconfig |

#### Windows Mobile Testing (`scripts/windows/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `setup-mobile-firewall.ps1` | Configure firewall for mobile testing | dev | Manual | Yes | netsh |
| `cleanup-mobile-firewall.ps1` | Remove mobile testing firewall rules | dev | Manual | Yes | netsh |

#### Deprecated Client (`clients/unified/scripts/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `register-protocol-handler.ps1` | **DEPRECATED** - Old protocol handler | dev | Manual | Yes | npm |

### Spec Kit Scripts (`.specify/scripts/`)

#### Root Level

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `check-prerequisites.sh` | Check GitHub Spec Kit prerequisites | any | Manual | Yes | - |
| `common.sh` | Shared utility functions | any | Sourced | N/A | - |
| `create-new-feature.sh` | Create new feature specification | any | Manual | Yes | - |
| `setup-plan.sh` | Initialize implementation plan | any | Manual | Yes | - |
| `update-claude-md.sh` | Update CLAUDE.md documentation | any | Manual | Yes | - |

#### Bash Subdirectory (`.specify/scripts/bash/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `check-prerequisites.sh` | **DUPLICATE** - Enhanced version with JSON output | any | Manual | Yes | - |
| `common.sh` | **DUPLICATE** - Shared utility functions | any | Sourced | N/A | - |
| `create-new-feature.sh` | **DUPLICATE** - Create new feature spec | any | Manual | Yes | - |
| `setup-plan.sh` | **DUPLICATE** - Initialize plan | any | Manual | Yes | - |
| `update-agent-context.sh` | Update AI agent context | any | Manual | Yes | - |

### Terraform/Infrastructure Scripts

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `infrastructure/docker/postgres/init-multiple-databases.sh` | Initialize PostgreSQL databases | dev | Docker Compose | Yes | psql |
| `infrastructure/docker/vault/init-dev.sh` | Initialize Vault for dev | dev | Docker Compose | Yes | vault CLI |
| `infrastructure/terraform/vps/deploy-to-existing-vps.sh` | Deploy to existing VPS | stage | Manual | Yes | SSH |
| `infrastructure/terraform/modules/compute/scripts/keycloak-startup.sh` | Keycloak container startup | stage, prod | cloud-init | Yes | Docker |
| `infrastructure/terraform/modules/compute/scripts/mcp-gateway-startup.sh` | MCP Gateway container startup | stage, prod | cloud-init | Yes | Docker |

### Integration Test Scripts

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `tests/integration/setup-keycloak-realm.sh` | Configure Keycloak for integration tests | CI | CI workflow | Yes | kcadm CLI |

### Flutter Client Scripts

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `clients/unified_flutter/ios/Flutter/flutter_export_environment.sh` | Export Flutter environment (iOS) | dev | Xcode | Yes | Flutter |

### Sample Data Scripts

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `sample-data/finance-data.sql` | PostgreSQL finance sample data | dev, CI | Docker init | Yes | psql |
| `sample-data/hr-data.sql` | PostgreSQL HR sample data | dev, CI | Docker init | Yes | psql |
| `sample-data/sales-data.js` | MongoDB sales CRM sample data | dev, CI | Docker init | Yes | mongosh |
| `sample-data/support-data.ndjson` | Elasticsearch support/KB sample data | dev, CI | Docker init | Yes | curl (bulk API) |

---

## CI/CD Workflows (`.github/workflows/`)

| Workflow | Purpose | Trigger | Environment |
|----------|---------|---------|-------------|
| `ci.yml` | Main CI pipeline (lint, test, build) | Push, PR | CI |
| `deploy.yml` | Main deployment workflow | Manual, Push to main | stage, prod |
| `deploy-vps.yml` | Deploy to VPS | Manual | stage |
| `bootstrap-vps.yml` | Initial VPS setup | Manual | stage |
| `codeql.yml` | CodeQL security analysis | Push, PR, Schedule | CI |
| `security.yml` | Security scanning (npm audit, gitleaks, tfsec) | Push, PR | CI |
| `build-flutter-native.yml` | Build Flutter desktop apps | Push, PR | CI |
| `deploy-mcp-gateway.yml` | Deploy MCP Gateway service | Manual | stage, prod |
| `deploy-mcp-hr.yml` | Deploy MCP HR service | Manual | stage, prod |
| `deploy-mcp-finance.yml` | Deploy MCP Finance service | Manual | stage, prod |
| `deploy-mcp-sales.yml` | Deploy MCP Sales service | Manual | stage, prod |
| `deploy-mcp-support.yml` | Deploy MCP Support service | Manual | stage, prod |
| `deploy-kong.yml` | Deploy Kong API Gateway | Manual | stage, prod |
| `deploy-keycloak.yml` | Deploy Keycloak | Manual | stage, prod |
| `deploy-frontend-desktop.yml` | Deploy desktop client | Manual | stage |
| `deploy-frontend-web.yml` | Deploy web frontend | Manual | stage |
| `deploy-migrations-hr.yml` | Run HR database migrations | Manual | stage, prod |
| `deploy-migrations-finance.yml` | Run Finance database migrations | Manual | stage, prod |
| `setup-vault.yml` | Initialize Vault | Manual | stage |
| `populate-vault-secrets.yml` | Populate Vault secrets | Manual | dev, stage |
| `get-vault-credentials.yml` | Retrieve Vault credentials | Manual | dev, stage |
| `open-vault-port.yml` | Open Vault port on firewall | Manual | stage |
| `diagnose-vault-ssh.yml` | Diagnose Vault SSH issues | Manual | stage |
| `fix-vault-roles.yml` | Fix Vault role configuration | Manual | stage |
| `promote-dev-to-staging.yml` | Promote dev to staging | Manual | dev → stage |
| `promote-staging-to-production.yml` | Promote staging to production | Manual | stage → prod |

---

## Script Documentation Quality

### Well-Documented Scripts (Header with usage, examples, description)
- `scripts/infra/*.sh` - All 8 scripts
- `scripts/db/*.sh` - Both scripts
- `scripts/mcp/*.sh` - Both scripts
- `scripts/vault/vault.sh`
- `keycloak/scripts/sync-realm.sh`

### Needs Documentation Improvement
- `.specify/scripts/*.sh` - Missing usage examples in root-level scripts
- `scripts/discover-mobile-host.sh` - Minimal documentation
- `clients/desktop/*.ps1` - Inconsistent header format

### Deprecated Scripts
- `scripts/setup-dev.sh` - **DEPRECATED**, use Terraform workflow
- `clients/unified/scripts/register-protocol-handler.ps1` - **DEPRECATED**, clients/unified is deprecated

---

## Cross-Reference: CLAUDE.md Service Management Scripts

The following scripts are documented in `CLAUDE.md` under "Service Management Scripts":

| Documented Command | Script Location | Status |
|--------------------|-----------------|--------|
| `./scripts/infra/status.sh` | `scripts/infra/status.sh` | Exists |
| `./scripts/infra/deploy.sh` | `scripts/infra/deploy.sh` | Exists |
| `./scripts/infra/keycloak.sh` | `scripts/infra/keycloak.sh` | Exists |
| `./scripts/mcp/health-check.sh` | `scripts/mcp/health-check.sh` | Exists |
| `./scripts/mcp/restart.sh` | `scripts/mcp/restart.sh` | Exists |
| `./scripts/db/backup.sh` | `scripts/db/backup.sh` | Exists |
| `./scripts/db/restore.sh` | `scripts/db/restore.sh` | Exists |
| `./scripts/infra/rollback.sh` | `scripts/infra/rollback.sh` | Exists |
| `./scripts/vault/vault.sh` | `scripts/vault/vault.sh` | Exists |
| `./scripts/test/login-journey.sh` | `scripts/test/login-journey.sh` | Exists |
| `./scripts/infra/logs.sh` | `scripts/infra/logs.sh` | Exists |
| `./scripts/infra/shell.sh` | `scripts/infra/shell.sh` | Exists |
| `./scripts/infra/teardown.sh` | `scripts/infra/teardown.sh` | Exists |
| `./scripts/infra/backup.sh` | `scripts/infra/backup.sh` | Exists |

---

## Notes

### Environment Variables Used

Scripts commonly expect these environment variables:

| Variable | Used By | Purpose |
|----------|---------|---------|
| `VPS_HOST` | stage scripts | VPS IP address (default: 5.78.159.29) |
| `VPS_SSH_USER` | stage scripts | SSH user (default: root) |
| `KEYCLOAK_ADMIN_PASSWORD` | keycloak scripts | Keycloak admin password |
| `VAULT_TOKEN` | vault scripts | Vault authentication token |
| `VAULT_DEV_ROOT_TOKEN` | vault scripts | Dev Vault root token |

### Hardcoded Values

The following values are hardcoded across multiple scripts:
- VPS IP: `5.78.159.29`
- Default ports: 3100 (MCP Gateway), 8180 (Keycloak), 8100 (Kong)
- Container names: `tamshai-postgres`, `tamshai-mongodb`, `tamshai-keycloak`, etc.

---

*Generated 2026-01-03*
