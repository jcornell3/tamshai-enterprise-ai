# Scripts Index

**Repository**: Tamshai Enterprise AI
**Generated**: January 13, 2026
**Total Scripts**: 75 (57 shell, 18 PowerShell)

---

## Summary Statistics

| Category | Count | Location |
|----------|-------|----------|
| Infrastructure (infra) | 9 | `scripts/infra/` |
| Database (db) | 2 | `scripts/db/` |
| MCP Server | 2 | `scripts/mcp/` |
| Vault | 2 | `scripts/vault/`, `scripts/` |
| Test | 4 | `scripts/test/` |
| GCP Production | 7 | `scripts/gcp/` |
| VPS Management | 4 | `scripts/vps/` |
| Keycloak | 5 | `keycloak/scripts/` |
| Desktop Client (Windows) | 8 | `clients/desktop/` |
| Spec Kit (.specify) | 6 | `.specify/scripts/` |
| Secrets | 1 | `scripts/secrets/` |
| Terraform/Cloud | 4 | `infrastructure/terraform/` |
| Root Scripts | 9 | `scripts/`, root level |
| CI/CD Workflows | 26 | `.github/workflows/` |
| Sample Data | 4 | `sample-data/` |
| Flutter | 2 | `clients/unified_flutter/` |
| Archived/Deprecated | 1 | `docs/archived/deprecated-scripts/` |

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
| `rebuild.sh` | Stop and optionally remove containers (NOT infrastructure) | dev, stage | Manual | No | Docker Compose |
| `teardown.sh` | Full Terraform destroy of infrastructure | dev, stage | Manual | No | Terraform |
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
| `e2e-login-with-totp-backup.sh` | E2E login test with TOTP backup/restore | dev, stage | Manual | Yes | oathtool, curl |
| `journey-e2e-automated.sh` | Automated E2E journey test for CI/CD | CI | Automated | Yes | Playwright, oathtool |

### GCP Production Scripts (`scripts/gcp/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `gcp-infra-deploy.sh` | Deploy GCP infrastructure via Terraform | prod | Manual | Yes | Terraform, gcloud |
| `gcp-infra-teardown.sh` | Teardown GCP infrastructure | prod | Manual | No | Terraform, gcloud |
| `load-sample-data.sh` | Load sample data to GCP production (HR, Finance, Sales, Support) | prod | Manual | Yes | psql, mongosh, cloud-sql-proxy |
| `remove-sample-data.sh` | Remove sample data from GCP production | prod | Manual | Yes | psql, mongosh, cloud-sql-proxy |
| `test-data-access.sh` | Test data access for all services in GCP | prod | Manual | Yes | curl, jq |
| `test-sales-support-access.sh` | Test Sales and Support data access (MongoDB-backed) | prod | Manual | Yes | curl, jq |
| `enable-apis.sh` | Enable required GCP APIs for the project | prod | Manual | Yes | gcloud |

### VPS Management Scripts (`scripts/vps/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `manual-reload-finance.sh` | Manually reload Finance sample data on VPS | stage | Manual | Yes | SSH, psql |
| `reload-finance-data.sh` | Reload Finance data (PostgreSQL) | stage | Manual | Yes | Docker, psql |
| `reload-sales-data.sh` | Reload Sales data (MongoDB) | stage | Manual | Yes | Docker, mongosh |
| `reload-support-data.sh` | Reload Support data (Elasticsearch) | stage | Manual | Yes | Docker, curl |

### Keycloak Scripts (`keycloak/scripts/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `sync-realm.sh` | Synchronize Keycloak configuration | dev, stage, prod | Manual | Yes | kcadm CLI (in container) |
| `docker-sync-realm.sh` | Docker wrapper for sync-realm.sh | dev | Manual | Yes | Docker |
| `sync-users.sh` | Sync test users to Keycloak | dev | Manual | Yes | kcadm CLI |
| `recreate-realm-prod.sh` | Recreate production realm from export file | prod | Manual | No | kcadm CLI, Docker |
| `set-user-totp.sh` | Set or update TOTP secret for test users | dev, stage | Manual | Yes | kcadm CLI, Docker |

### Root Scripts (`scripts/` and root level)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `deploy-vps.sh` | Deploy to VPS via SSH or cloud API | stage | Manual | Yes | Terraform, SSH |
| `discover-mobile-host.sh` | Find mobile device host for testing | dev | Manual | Yes | ip, ifconfig |
| `generate-mtls-certs.sh` | Generate mTLS certificates | prod | Manual | No | openssl |
| `get-keycloak-token.sh` | Acquire Keycloak access token | dev, stage | Manual | Yes | curl, jq |
| `validate-production-config.sh` | Validate production configuration | prod | Manual | Yes | - |
| `vault-install.sh` | Install Vault CLI locally | dev | Manual | Yes | curl |
| `verify-mcp-servers.sh` | Verify MCP server connectivity | dev | Manual | Yes | curl |
| `test-dashboard-sequence.sh` (root) | Test dashboard sequence for Sales app | dev, stage | Manual | Yes | curl, jq |
| `test-finance-status.ps1` (root) | Test Finance app status and health | dev, stage | Manual | Yes | PowerShell, Invoke-WebRequest |

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

### Spec Kit Scripts (`.specify/scripts/`)

#### Root Level

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `update-claude-md.sh` | Update CLAUDE.md documentation | any | Manual | Yes | - |

#### Bash Subdirectory (`.specify/scripts/bash/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `check-prerequisites.sh` | Check Spec Kit prerequisites (JSON output supported) | any | Manual | Yes | - |
| `common.sh` | Shared utility functions | any | Sourced | N/A | - |
| `create-new-feature.sh` | Create new feature specification | any | Manual | Yes | - |
| `setup-plan.sh` | Initialize implementation plan | any | Manual | Yes | - |
| `update-agent-context.sh` | Update AI agent context | any | Manual | Yes | - |

### Secrets Scripts (`scripts/secrets/`)

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `update-github-secrets.sh` | Update GitHub secrets from Terraform output | stage | Manual | Yes | gh CLI, terraform |

### Terraform/Infrastructure Scripts

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `infrastructure/docker/postgres/init-multiple-databases.sh` | Initialize PostgreSQL databases | dev | Docker Compose | Yes | psql |
| `infrastructure/docker/vault/init-dev.sh` | Initialize Vault for dev | dev | Docker Compose | Yes | vault CLI |
| `infrastructure/terraform/vps/deploy-to-existing-vps.sh` | Deploy to existing VPS | stage | Manual | Yes | SSH |
| `infrastructure/terraform/gcp/configure-tfvars.ps1` | Configure GCP Terraform variables interactively | prod | Manual | Yes | PowerShell |
| `infrastructure/terraform/modules/compute/scripts/keycloak-startup.sh` | Keycloak container startup | stage, prod | cloud-init | Yes | Docker |
| `infrastructure/terraform/modules/compute/scripts/mcp-gateway-startup.sh` | MCP Gateway container startup | stage, prod | cloud-init | Yes | Docker |

### Flutter Client Scripts

| Script | Purpose | Environment | Trigger | Idempotent | Dependencies |
|--------|---------|-------------|---------|------------|--------------|
| `clients/unified_flutter/ios/Flutter/flutter_export_environment.sh` | Export Flutter environment for iOS builds | dev | Xcode build | Yes | Flutter SDK |
| `clients/unified_flutter/macos/Flutter/ephemeral/flutter_export_environment.sh` | Export Flutter environment for macOS builds | dev | Flutter build | Yes | Flutter SDK |

### Archived/Deprecated Scripts

| Script | Purpose | Status | Notes |
|--------|---------|--------|-------|
| `docs/archived/deprecated-scripts/setup-dev.sh` | Legacy dev environment setup | **DEPRECATED** | Replaced by Terraform workflow (`infrastructure/terraform/dev/`) |

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
- `docs/archived/deprecated-scripts/setup-dev.sh` - **DEPRECATED**, use Terraform workflow (`infrastructure/terraform/dev/`)
- `clients/unified/scripts/register-protocol-handler.ps1` - **DEPRECATED**, clients/unified is deprecated

### New Scripts (January 13, 2026)
Added 16 new scripts for GCP production, VPS management, E2E testing, and Keycloak operations:

**GCP Production Management (7 scripts)**:
- `scripts/gcp/gcp-infra-deploy.sh`
- `scripts/gcp/gcp-infra-teardown.sh`
- `scripts/gcp/load-sample-data.sh`
- `scripts/gcp/remove-sample-data.sh`
- `scripts/gcp/test-data-access.sh`
- `scripts/gcp/test-sales-support-access.sh`
- `scripts/gcp/enable-apis.sh`

**VPS Management (4 scripts)**:
- `scripts/vps/manual-reload-finance.sh`
- `scripts/vps/reload-finance-data.sh`
- `scripts/vps/reload-sales-data.sh`
- `scripts/vps/reload-support-data.sh`

**Testing (2 scripts)**:
- `scripts/test/e2e-login-with-totp-backup.sh`
- `scripts/test/journey-e2e-automated.sh`

**Keycloak (2 scripts)**:
- `keycloak/scripts/recreate-realm-prod.sh`
- `keycloak/scripts/set-user-totp.sh`

**Other (3 scripts)**:
- `infrastructure/terraform/gcp/configure-tfvars.ps1`
- `test-dashboard-sequence.sh` (root level)
- `test-finance-status.ps1` (root level)
- `clients/unified_flutter/macos/Flutter/ephemeral/flutter_export_environment.sh`

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
| `./scripts/infra/rebuild.sh` | `scripts/infra/rebuild.sh` | Exists |
| `./scripts/infra/teardown.sh` | `scripts/infra/teardown.sh` | Exists |
| `./scripts/infra/backup.sh` | `scripts/infra/backup.sh` | Exists |

---

## Notes

### Environment Variables Used

Scripts commonly expect these environment variables:

| Variable | Used By | Purpose |
|----------|---------|---------|
| `VPS_HOST` | stage scripts | VPS IP address (get from Terraform output: `terraform output -raw vps_ip`) |
| `VPS_SSH_USER` | stage scripts | SSH user (default: root) |
| `KEYCLOAK_ADMIN_PASSWORD` | keycloak scripts | Keycloak admin password |
| `VAULT_TOKEN` | vault scripts | Vault authentication token |
| `VAULT_DEV_ROOT_TOKEN` | vault scripts | Dev Vault root token |

### Hardcoded Values

The following values are hardcoded across multiple scripts:
- VPS IP: Get from Terraform: `cd infrastructure/terraform/vps && terraform output -raw vps_ip`
- Default ports: 3100 (MCP Gateway), 8180 (Keycloak), 8100 (Kong)
- Container names: `tamshai-postgres`, `tamshai-mongodb`, `tamshai-keycloak`, etc.

---

## Recent Changes

### January 13, 2026
- Updated total script count from 59 to 75 (16 new scripts)
- Added GCP Production scripts section (7 scripts for production deployment and data management)
- Added VPS Management scripts section (4 scripts for stage data reloading)
- Added 2 new E2E testing scripts with TOTP support
- Added 2 new Keycloak management scripts (realm recreation, TOTP configuration)
- Added Flutter export environment scripts for iOS and macOS
- Added GCP Terraform configuration script (PowerShell)
- Moved deprecated setup-dev.sh to archived location
- Updated documentation with comprehensive script descriptions

---

*Generated January 13, 2026*
