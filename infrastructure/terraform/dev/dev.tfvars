# =============================================================================
# Terraform Dev Environment - Development Configuration
# =============================================================================
#
# ⚠️ DEV ENVIRONMENT ONLY - DO NOT USE FOR CI/STAGE/PROD ⚠️
#
# Usage:
#   terraform plan -var-file=dev.tfvars
#   terraform apply -var-file=dev.tfvars
#
# Prerequisites:
#   1. Run setup script: ../../scripts/setup-terraform-dev-env.ps1
#   2. Verify variables: Get-ChildItem Env:TF_VAR_*
#   3. Restart terminal after running setup script
#
# Note: Most sensitive values come from TF_VAR_* environment variables
#       (Set by setup-terraform-dev-env.ps1)
#
# Created: 2025-12-30
# =============================================================================

# =============================================================================
# PROJECT CONFIGURATION
# =============================================================================

environment            = "dev"
project_root           = "C:/Users/jcorn/tamshai-enterprise-ai"
docker_compose_dir     = "infrastructure/docker"
docker_compose_project = "tamshai-dev"

# =============================================================================
# AUTOMATION SETTINGS
# =============================================================================

auto_start_services = true  # Start Docker services on apply
auto_stop_services  = true  # Stop Docker services on destroy (Phoenix recovery)

# =============================================================================
# DATABASE CREDENTIALS
# =============================================================================
# Note: Set these via TF_VAR_* environment variables (see setup-terraform-dev-env.ps1)
#
# postgres_password     - Set via TF_VAR_postgres_password
# tamshai_db_password   - Set via TF_VAR_tamshai_db_password
# keycloak_db_password  - Set via TF_VAR_keycloak_db_password (REQUIRED NOW)
# mongodb_root_password - Set via TF_VAR_mongodb_root_password

# =============================================================================
# KEYCLOAK CONFIGURATION
# =============================================================================
# Note: Set these via TF_VAR_* environment variables
#
# keycloak_admin_password   - Set via TF_VAR_keycloak_admin_password (REQUIRED NOW)
# dev_user_password         - Set via TF_VAR_dev_user_password or DEV_USER_PASSWORD GitHub secret
# mcp_gateway_client_secret - Set via TF_VAR_mcp_gateway_client_secret (REQUIRED NOW)

# =============================================================================
# STORAGE CREDENTIALS
# =============================================================================
# Note: Set these via TF_VAR_* environment variables
#
# minio_root_user     - Set via TF_VAR_minio_root_user
# minio_root_password - Set via TF_VAR_minio_root_password

# =============================================================================
# REDIS CONFIGURATION
# =============================================================================
# Note: Redis password is optional for dev
#
# redis_password - Set via TF_VAR_redis_password (optional)

redis_password = "" # No password for dev

# =============================================================================
# CLAUDE API CONFIGURATION
# =============================================================================
# Note: REQUIRED - Set via TF_VAR_claude_api_key
#
# claude_api_key - Set via TF_VAR_claude_api_key (REQUIRED)
#
# Get your key from: https://console.anthropic.com/settings/keys
# Format: sk-ant-api03-...

# =============================================================================
# DEFAULTS (Overridden by TF_VAR_* environment variables)
# =============================================================================

# Database defaults (dev-only credentials - match docker-compose.yml defaults)
postgres_password     = "postgres_password"
tamshai_db_password   = "tamshai_password"
keycloak_db_password  = "keycloak_password"
mongodb_root_password = "tamshai_password"

# Keycloak defaults
keycloak_admin_password = "admin"
# dev_user_password - Set via TF_VAR_dev_user_password environment variable
# Leave empty to skip (E2E tests will warn about missing password)
dev_user_password         = ""
mcp_gateway_client_secret = "test-client-secret"

# Storage defaults (match docker-compose.yml defaults)
minio_root_user     = "minioadmin"
minio_root_password = "minioadmin"
