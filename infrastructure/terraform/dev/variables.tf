# =============================================================================
# Terraform Dev Environment - Variables
# =============================================================================
#
# SECURITY: All sensitive values (passwords, secrets, API keys) are fetched
# from GitHub Secrets via the external data source (fetch-github-secrets.ps1).
#
# This file only contains non-sensitive configuration variables.
# DO NOT add default passwords or secrets here.
#
# =============================================================================

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "project_root" {
  description = "Absolute path to project root"
  type        = string
  default     = "C:/Users/jcorn/tamshai-enterprise-ai"
}

variable "docker_compose_dir" {
  description = "Path to docker-compose directory (relative to project root)"
  type        = string
  default     = "infrastructure/docker"
}

# =============================================================================
# Docker Compose Configuration
# =============================================================================

variable "docker_compose_project" {
  description = "Docker Compose project name"
  type        = string
  default     = "tamshai-dev"
}

variable "auto_start_services" {
  description = "Automatically start Docker services on apply"
  type        = bool
  default     = true
}

variable "auto_stop_services" {
  description = "Automatically stop Docker services on destroy"
  type        = bool
  default     = true
}

variable "auto_remove_volumes" {
  description = "Remove Docker volumes on destroy (Phoenix recovery - full data reset)"
  type        = bool
  default     = true
}

# =============================================================================
# NOTE: All credentials come from GitHub Secrets via external data source
# =============================================================================
#
# Required GitHub Secrets (environment-prefixed with DEV_):
#   - POSTGRES_DEV_PASSWORD
#   - TAMSHAI_DB_DEV_PASSWORD
#   - KEYCLOAK_DB_DEV_PASSWORD
#   - MONGODB_DEV_PASSWORD
#   - DEV_KEYCLOAK_ADMIN_PASSWORD
#   - DEV_MCP_GATEWAY_CLIENT_SECRET
#   - DEV_MINIO_ROOT_USER
#   - DEV_MINIO_ROOT_PASSWORD
#   - CLAUDE_API_KEY (global, not prefixed)
#
# Optional GitHub Secrets:
#   - DEV_USER_PASSWORD (for corporate test users)
#   - TEST_USER_PASSWORD (for test-user.journey)
#   - CUSTOMER_USER_PASSWORD (for customer portal tests)
#   - DEV_GEMINI_API_KEY (for MCP Journey)
#   - REDIS_DEV_PASSWORD (Redis can run without password in dev)
#
# See: infrastructure/terraform/dev/scripts/fetch-github-secrets.ps1
# =============================================================================
