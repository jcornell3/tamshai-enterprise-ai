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
project_root           = "C:/Users/jcorn/Tamshai-AI-Playground"
docker_compose_dir     = "infrastructure/docker"
docker_compose_project = "tamshai-playground"

# =============================================================================
# AUTOMATION SETTINGS
# =============================================================================

auto_start_services = true # Start Docker services on apply
auto_stop_services  = true # Stop Docker services on destroy (Phoenix recovery)
auto_remove_volumes = true # Remove volumes on destroy (full data reset for Phoenix)

# =============================================================================
# DATABASE CREDENTIALS
# =============================================================================
# All database passwords are fetched from GitHub Secrets (environment-specific):
#
# MONGODB_DEV_PASSWORD      - MongoDB root password
# POSTGRES_DEV_PASSWORD     - PostgreSQL postgres user password
# TAMSHAI_DB_DEV_PASSWORD   - PostgreSQL tamshai user password
# KEYCLOAK_DB_DEV_PASSWORD  - Keycloak database password
# REDIS_DEV_PASSWORD        - Redis password
#
# These are fetched via the export-test-secrets.yml workflow

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
# Note: Fetched from GitHub Secrets (CLAUDE_API_KEY)
#
# This is automatically fetched from GitHub Secrets during terraform apply.
# Only set TF_VAR_claude_api_key if you need to override the GitHub Secret.
#
# GitHub Secret: CLAUDE_API_KEY (this repo's secret, separate from tamshai-dev)
# Format: sk-ant-api03-...

# =============================================================================
# GEMINI API CONFIGURATION (MCP Journey)
# =============================================================================
# Note: OPTIONAL - Set via TF_VAR_gemini_api_key
#
# gemini_api_key - Set via TF_VAR_gemini_api_key (optional)
#
# Used by mcp-journey for semantic search embeddings.
# Get your key from: https://makersuite.google.com/app/apikey
# Format: AIzaSy...

# =============================================================================
# DEFAULTS (Overridden by TF_VAR_* environment variables)
# =============================================================================

# Database passwords - from GitHub Secrets (environment-specific)
# These are fetched via fetch-github-secrets.ps1 workflow:
#   - MONGODB_DEV_PASSWORD
#   - POSTGRES_DEV_PASSWORD
#   - TAMSHAI_DB_DEV_PASSWORD
#   - KEYCLOAK_DB_DEV_PASSWORD
#   - REDIS_DEV_PASSWORD
# NOTE: No hardcoded values - passwords come from GitHub secrets

# Keycloak defaults
# NOTE: Remove default - must be set via TF_VAR_keycloak_admin_password
# keycloak_admin_password = ""  # REQUIRED: Set via TF_VAR_keycloak_admin_password

# User passwords - from GitHub Secrets via TF_VAR_* environment variables
# DEV_USER_PASSWORD: Corporate users (eve.thompson, etc.)
# TEST_USER_PASSWORD: test-user.journey E2E account
# NOTE: Do NOT set values here - use TF_VAR_* environment variables
#       Setting empty values here overrides env vars due to terraform precedence

# MCP Gateway client secret
# NOTE: Remove default - must be set via TF_VAR_mcp_gateway_client_secret
# mcp_gateway_client_secret = ""  # REQUIRED: Set via TF_VAR_mcp_gateway_client_secret

# Storage credentials
# NOTE: Remove defaults - must be set via TF_VAR_minio_root_user and TF_VAR_minio_root_password
# minio_root_user     = ""  # REQUIRED: Set via TF_VAR_minio_root_user
# minio_root_password = ""  # REQUIRED: Set via TF_VAR_minio_root_password
