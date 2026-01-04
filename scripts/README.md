# Scripts Directory

Utility scripts for Tamshai Enterprise AI development and deployment.

## Full Scripts Catalog

For the complete inventory of all 58+ scripts with metadata (purpose, environment, dependencies, idempotency), see **[SCRIPTS_INDEX.md](../SCRIPTS_INDEX.md)**.

## Directory Structure

```
scripts/
├── db/              # Database backup and restore
├── infra/           # Infrastructure management (deploy, status, teardown, rebuild)
├── mcp/             # MCP server health and restart
├── secrets/         # Secret management (GitHub, Vault)
├── test/            # Integration and login testing
├── vault/           # HashiCorp Vault operations
├── windows/         # Windows-specific firewall scripts
└── *.sh / *.ps1     # Root-level utility scripts
```

## Quick Reference

| Task | Command |
|------|---------|
| Check service status | `./scripts/infra/status.sh dev` |
| Deploy services | `./scripts/infra/deploy.sh dev` |
| Rebuild (stop containers) | `./scripts/infra/rebuild.sh dev` |
| Teardown (destroy infra) | `./scripts/infra/teardown.sh stage` |
| Backup databases | `./scripts/db/backup.sh dev` |
| Check MCP health | `./scripts/mcp/health-check.sh dev` |
| Update GitHub secrets | `./scripts/secrets/update-github-secrets.sh stage` |

---

## Terraform Environment Setup

### setup-terraform-dev-env.ps1

⚠️ **DEV ENVIRONMENT ONLY** - Sets up Windows environment variables for local development.

**Usage**:
```powershell
.\scripts\setup-terraform-dev-env.ps1
```

**What it does**:
- Sets `TF_VAR_*` environment variables for Terraform DEV environment
- Prompts for your personal Claude API key (secure input, for local testing)
- Configures dev-only credentials matching `infrastructure/docker/.env.example`
- Stores variables in Windows User environment (persists across sessions)

**Environment**: DEV (Local Docker) - Your personal Claude API key is for local testing only

**Variables Set**:

**Current (Keycloak Terraform)**:
- `TF_VAR_keycloak_admin_password` - Keycloak admin password
- `TF_VAR_test_user_password` - Test user passwords
- `TF_VAR_mcp_gateway_client_secret` - OAuth client secret
- `TF_VAR_claude_api_key` - Claude API key (required)

**Future (Full-Stack Expansion)**:
- `TF_VAR_postgres_password` - PostgreSQL superuser password
- `TF_VAR_tamshai_db_password` - Application database password
- `TF_VAR_mongodb_root_password` - MongoDB root password
- `TF_VAR_minio_root_user` - MinIO username
- `TF_VAR_minio_root_password` - MinIO password
- `TF_VAR_redis_password` - Redis AUTH password

**After running**:
1. **Restart your terminal** for changes to take effect
2. Verify: `Get-ChildItem Env:TF_VAR_*`
3. Test Terraform: `cd infrastructure/terraform/keycloak && terraform plan -var-file=environments/dev.tfvars`

### cleanup-terraform-dev-env.ps1

Removes all Terraform DEV environment variables.

**Usage**:
```powershell
.\scripts\cleanup-terraform-dev-env.ps1
```

**What it does**:
- Lists all current `TF_VAR_*` variables
- Prompts for confirmation
- Removes variables from Windows User environment
- Useful for troubleshooting or starting fresh

**After running**:
1. **Restart your terminal** for changes to take effect
2. Verify: `Get-ChildItem Env:TF_VAR_*` (should be empty)

## Security Notes

**Development Credentials**:
- Scripts use development-only passwords (documented in `.env.example`)
- **DO NOT use these credentials in production**
- Values match `infrastructure/docker/.env.example` for consistency

**Production/Stage**:
- Do NOT use these scripts for production
- Use GCP Secret Manager or similar:
  ```powershell
  $env:TF_VAR_keycloak_admin_password = (gcloud secrets versions access latest --secret=keycloak-admin-password)
  ```

**API Keys**:
- Claude API key is prompted securely (not echoed to screen)
- Get your key from: https://console.anthropic.com/settings/keys
- Format: `sk-ant-api03-...`

## Troubleshooting

### Variables not taking effect
**Problem**: Variables set but Terraform doesn't see them

**Solution**: Restart your terminal completely (close and reopen)

### Permission denied
**Problem**: Script fails to set variables

**Solution**: Run PowerShell as regular user (not Administrator needed)

### Wrong variable values
**Problem**: Variables have incorrect values

**Solution**:
1. Run cleanup script: `.\scripts\cleanup-terraform-dev-env.ps1`
2. Restart terminal
3. Run setup script again: `.\scripts\setup-terraform-dev-env.ps1`

### Verify variables are set
```powershell
# List all Terraform variables
Get-ChildItem Env:TF_VAR_*

# Check specific variable
echo $env:TF_VAR_keycloak_admin_password

# Test Terraform picks them up
cd infrastructure/terraform/keycloak
terraform plan -var-file=environments/dev.tfvars
# Should NOT prompt for passwords if variables are set correctly
```

## Related Documentation

- **Terraform Keycloak Guide**: `infrastructure/terraform/keycloak/TERRAFORM_KEYCLOAK_DEPLOYMENT.md`
- **Full-Stack Expansion Plan**: `docs/action-items/terraform-dev-full-stack.md`
- **Environment Variables**: `infrastructure/docker/.env.example`
- **Keycloak Findings**: `docs/keycloak-findings/2025-12-30-terraform-deployment-success.md`

## Examples

### First-time setup
```powershell
# 1. Run setup script
.\scripts\setup-terraform-dev-env.ps1

# 2. Enter your Claude API key when prompted (for local dev testing)
# sk-ant-api03-your-key-here

# 3. Restart terminal
# (Close and reopen PowerShell or Terminal)

# 4. Verify variables
Get-ChildItem Env:TF_VAR_*

# 5. Test Terraform
cd infrastructure\terraform\keycloak
terraform init
terraform plan -var-file=environments\dev.tfvars
```

### Update single variable
```powershell
# Set/update a specific variable
setx TF_VAR_claude_api_key "sk-ant-api03-new-key-here"

# Restart terminal for change to take effect
```

### Start fresh
```powershell
# 1. Remove all variables
.\scripts\cleanup-terraform-dev-env.ps1
# Type "yes" to confirm

# 2. Restart terminal

# 3. Verify cleanup
Get-ChildItem Env:TF_VAR_*
# Should show nothing

# 4. Set up again
.\scripts\setup-terraform-dev-env.ps1
```

## Script Maintenance

**Adding new variables**:
1. Edit `setup-terraform-dev-env.ps1`
2. Add new `Set-TerraformVar` call in appropriate section
3. Update this README with the new variable
4. Test the script
5. Commit changes

**Removing variables**:
- Variables are automatically cleaned up by `cleanup-terraform-dev-env.ps1`
- No manual maintenance needed

---

**Created**: 2025-12-30
**Last Updated**: 2025-12-30
**Maintained By**: Tamshai QA Team
