# =============================================================================
# DISASTER RECOVERY Environment - Terraform Variables
# =============================================================================
#
# DR/Recovery environment configuration for regional evacuation.
# Use with: terraform apply -var-file=environments/dr.tfvars
#
# NOTE: Sensitive values (API keys, passwords, connection strings) are NOT in
# this file. They are managed via GCP Secret Manager and injected at runtime.
#
# USAGE:
#   For regional evacuation, use evacuate-region.sh which:
#   1. Uses a separate state path: gcp/recovery/<env_id>
#   2. Passes these variables plus env_id override
#   3. Handles image replication and resource cleanup
#
#   Manual usage (for testing):
#   terraform init -reconfigure \
#     -backend-config="bucket=tamshai-terraform-state-prod" \
#     -backend-config="prefix=gcp/recovery/test-dr"
#   terraform apply -var-file=environments/dr.tfvars -var="env_id=test-dr"
# =============================================================================

# =============================================================================
# ENVIRONMENT IDENTIFICATION
# =============================================================================

env_id        = "recovery"
recovery_mode = true
phoenix_mode  = true  # Required for DR to skip deletion protection

# =============================================================================
# REGION CONFIGURATION
# =============================================================================
# DR region: us-west1 (Oregon)
# Priority regions (same cost as us-central1):
#   1. us-west1 (Oregon)     - Recommended: No hurricane risk, closest to CA team
#   2. us-east1 (S. Carolina) - Hurricane zone (June-Nov)
#   3. us-east5 (Ohio)        - Newer region
# =============================================================================

region = "us-west1"
zone   = "us-west1-b"

# =============================================================================
# NETWORKING
# =============================================================================
# Same CIDR ranges as prod - no conflict because different VPC in different region

subnet_cidr               = "10.0.0.0/24"
serverless_connector_cidr = "10.8.0.0/28"

# =============================================================================
# DATABASE
# =============================================================================

database_tier = "db-f1-micro"

# =============================================================================
# COMPUTE
# =============================================================================
# Utility VM disabled in DR - Redis not needed for basic operations

enable_utility_vm      = false
keycloak_min_instances = "1"  # Keep warm during DR

# =============================================================================
# DOMAIN CONFIGURATION
# =============================================================================
# DR uses separate domains to avoid conflict with primary (which may still
# be partially accessible or recovering).
#
# IMPORTANT: auth.tamshai.com CANNOT be remapped during regional outage!
# The domain mapping is bound to the dead region. Use auth-dr.tamshai.com.
#
# DNS setup required in Cloudflare for DR domains:
#   auth-dr.tamshai.com   -> ghs.googlehosted.com (Cloud Run domain mapping)
#   api-dr.tamshai.com    -> CNAME to mcp-gateway URL (after evacuation)
#   app-dr.tamshai.com    -> CNAME to web-portal URL (after evacuation)
#   prod-dr.tamshai.com   -> GCS static website (if needed)
# =============================================================================

keycloak_domain       = "auth-dr.tamshai.com"
static_website_domain = ""  # Not needed during DR - use primary bucket

# API Gateway domain (DNS CNAME - update after evacuation)
# api_domain = "api-dr.tamshai.com"

# Web Portal domain (DNS CNAME - update after evacuation)
# app_domain = "app-dr.tamshai.com"

# Marketing site domain (optional for DR)
# prod_domain = "prod-dr.tamshai.com"

# =============================================================================
# USER PROVISIONING
# =============================================================================
# In DR mode, user provisioning is disabled (enable_provision_job = !recovery_mode)
# Users must be provisioned manually or via identity-sync after evacuation

keycloak_provisioning_url = "https://auth-dr.tamshai.com/auth"

# =============================================================================
# BACKUP/RESTORE
# =============================================================================
# Multi-regional backup bucket containing latest database exports

source_backup_bucket = "tamshai-prod-backups-gen-lang-client-0553641830"
