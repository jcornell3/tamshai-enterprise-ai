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
#   1. GitHub CLI authenticated: gh auth login
#   2. Access to repository secrets: gh secret list
#
# SECURITY: All credentials (passwords, API keys, secrets) are fetched from
# GitHub Secrets via the external data source. No credentials are stored in
# this file or in environment variables.
#
# See: infrastructure/terraform/dev/variables.tf for required GitHub Secrets
#
# Created: 2025-12-30
# Updated: 2026-02-17 (removed all credential variables - now from GitHub Secrets only)
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

auto_start_services = true # Start Docker services on apply
auto_stop_services  = true # Stop Docker services on destroy (Phoenix recovery)
auto_remove_volumes = true # Remove volumes on destroy (full data reset for Phoenix)
