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
# All domains use Cloud Run domain mappings (CNAME to ghs.googlehosted.com).
# GCP provisions SSL certificates automatically (takes 10-15 minutes).
# =============================================================================

keycloak_domain       = "auth.tamshai.com"
api_domain            = "api.tamshai.com"
app_domain            = "app.tamshai.com"
static_website_domain = "prod.tamshai.com"

# =============================================================================
# USER PROVISIONING
# =============================================================================

keycloak_provisioning_url = "https://auth.tamshai.com/auth"

# =============================================================================
# BACKUP/RESTORE (Not used in primary)
# =============================================================================

source_backup_bucket = ""
