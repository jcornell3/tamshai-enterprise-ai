# =============================================================================
# PRODUCTION Environment - Terraform Variables
# =============================================================================
#
# Primary production environment configuration.
# Use with: terraform apply -var-file=environments/prod.tfvars
#
# NOTE: Sensitive values (API keys, passwords, connection strings) are NOT in
# this file. They are managed via GCP Secret Manager and injected at runtime.
# =============================================================================

# =============================================================================
# ENVIRONMENT IDENTIFICATION
# =============================================================================

env_id        = "primary"
recovery_mode = false
phoenix_mode  = false

# =============================================================================
# REGION CONFIGURATION
# =============================================================================

region = "us-central1"
zone   = "us-central1-c"

# =============================================================================
# NETWORKING
# =============================================================================

subnet_cidr               = "10.0.0.0/24"
serverless_connector_cidr = "10.8.0.0/28"

# =============================================================================
# DATABASE
# =============================================================================

database_tier = "db-f1-micro"

# =============================================================================
# COMPUTE
# =============================================================================

enable_utility_vm      = true
keycloak_min_instances = "0"

# =============================================================================
# DOMAIN CONFIGURATION
# =============================================================================
# These domains are configured in Cloudflare DNS and mapped to Cloud Run services.
#
# Domain mapping hierarchy:
#   keycloak_domain       -> Cloud Run domain mapping (terraform-managed)
#   static_website_domain -> GCS website bucket (terraform-managed)
#   api_domain            -> Cloudflare CNAME to mcp-gateway (DNS-only)
#   app_domain            -> Cloudflare CNAME to web-portal (DNS-only)
# =============================================================================

keycloak_domain       = "auth.tamshai.com"
static_website_domain = "prod.tamshai.com"

# API Gateway domain (DNS CNAME - not terraform-managed yet)
# api_domain = "api.tamshai.com"

# Web Portal domain (DNS CNAME - not terraform-managed yet)
# app_domain = "app.tamshai.com"

# =============================================================================
# USER PROVISIONING
# =============================================================================

keycloak_provisioning_url = "https://auth.tamshai.com/auth"

# =============================================================================
# BACKUP/RESTORE (Not used in primary)
# =============================================================================

source_backup_bucket = ""
