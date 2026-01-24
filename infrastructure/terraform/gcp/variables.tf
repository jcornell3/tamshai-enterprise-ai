# GCP Phase 1 Variables

# =============================================================================
# PROJECT CONFIGURATION
# =============================================================================

variable "project_id" {
  description = "GCP Project ID for production deployment"
  type        = string
}

variable "region" {
  description = "GCP Region (e.g., us-central1)"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP Zone for zonal resources (e.g., us-central1-a)"
  type        = string
  default     = "us-central1-a"
}

variable "fallback_zones" {
  description = <<-EOT
    List of fallback zones to try if the primary zone has capacity issues.
    Used during DR evacuation when a zone may be temporarily unavailable.
    Zones are tried in order until one succeeds.

    Example: ["us-west1-a", "us-west1-c"] for us-west1 region
    Leave empty to use only the primary zone (default behavior).

    Configure via tfvars or GitHub Actions variables for DR scenarios.
  EOT
  type        = list(string)
  default     = []
}

# =============================================================================
# NETWORKING
# =============================================================================

variable "subnet_cidr" {
  description = "CIDR range for VPC subnet"
  type        = string
  default     = "10.0.0.0/24"
}

variable "serverless_connector_cidr" {
  description = "CIDR range for Serverless VPC Connector (must be /28)"
  type        = string
  default     = "10.8.0.0/28"
}

# =============================================================================
# DATABASE
# =============================================================================

variable "database_tier" {
  description = "Cloud SQL tier (db-f1-micro for Phase 1)"
  type        = string
  default     = "db-f1-micro"
}

variable "mongodb_atlas_uri" {
  description = "MongoDB Atlas connection URI (M0 free tier)"
  type        = string
  sensitive   = true
}

variable "claude_api_key" {
  description = "Anthropic Claude API key"
  type        = string
  sensitive   = true
}

# =============================================================================
# COMPUTE
# =============================================================================

variable "enable_utility_vm" {
  description = "Enable Utility VM for Redis and Bastion (Phase 1 only)"
  type        = bool
  default     = true
}

variable "keycloak_min_instances" {
  description = "Minimum Keycloak instances (0 = cold start, 1 = always warm)"
  type        = string
  default     = "0"
}

# =============================================================================
# DOMAIN CONFIGURATION
# =============================================================================
# All domains use Cloud Run domain mappings (CNAME to ghs.googlehosted.com).
# GCP provisions SSL certificates automatically (takes 10-15 minutes).
# =============================================================================

variable "keycloak_domain" {
  description = "Keycloak domain (e.g., auth.tamshai.com, auth-dr.tamshai.com)"
  type        = string
  default     = "auth.tamshai.com"
}

variable "api_domain" {
  description = "MCP Gateway API domain (e.g., api.tamshai.com, api-dr.tamshai.com). Empty = no domain mapping."
  type        = string
  default     = ""
}

variable "app_domain" {
  description = "Web Portal app domain (e.g., app.tamshai.com, app-dr.tamshai.com). Empty = no domain mapping."
  type        = string
  default     = ""
}

variable "static_website_domain" {
  description = "Static website domain (must match GCS bucket name) - Leave empty to skip domain bucket"
  type        = string
  default     = "" # Temporarily disabled - requires domain ownership verification
}

# =============================================================================
# USER PROVISIONING
# =============================================================================

variable "keycloak_provisioning_url" {
  description = <<-EOT
    Keycloak URL for user provisioning job (with /auth suffix).

    Options:
    - auth.tamshai.com/auth (default): Use domain mapping URL. Works once SSL cert is ready.
    - Cloud Run URL: Use `gcloud run services describe keycloak --region=us-central1 --format="value(status.url)"`
      to get the dynamic URL, then append /auth.

    During Phoenix rebuild, the SSL certificate for auth.tamshai.com may take time to provision.
    If immediate provisioning is needed, use the Cloud Run URL temporarily.
  EOT
  type        = string
  default     = "https://auth.tamshai.com/auth"
}

variable "prod_user_password" {
  description = "Password for production users (used in user provisioning). If not set, a random password will be generated and stored in Secret Manager."
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# NOTE: PROD_USER_PASSWORD FLOW
# =============================================================================
# The PROD_USER_PASSWORD GitHub Secret is the source of truth for corporate
# user passwords. It flows as follows:
#
# 1. PROD_USER_PASSWORD set in GitHub Secrets (one-time manual setup)
# 2. provision-prod-users.yml passes it to identity-sync
# 3. identity-sync sets this password for all provisioned corporate users
#
# This variable (prod_user_password) is optional - if provided, it will be
# stored in GCP Secret Manager as a backup. The GitHub Secret is authoritative.

# =============================================================================
# PHOENIX REBUILD MODE (Gap #39)
# =============================================================================

variable "phoenix_mode" {
  description = "Enable Phoenix rebuild mode: sets force_destroy=true on storage buckets and disables deletion protection. WARNING: Only use during full environment rebuilds."
  type        = bool
  default     = false
}

# =============================================================================
# REGIONAL EVACUATION (GCP Region Failure Scenario)
# =============================================================================
# These variables enable deploying to an alternate region during a regional
# outage without conflicting with the primary deployment's Terraform state
# or global resource names.
#
# Usage: ./scripts/gcp/evacuate-region.sh us-west1 us-west1-b recovery-01
# =============================================================================

variable "env_id" {
  description = <<-EOT
    Unique identifier for this deployment environment.

    - "primary": Normal production deployment (default)
    - "recovery-*": Regional evacuation deployment (e.g., "recovery-20260122")

    Used for:
    - Terraform state isolation (different backend prefix)
    - Resource naming to avoid global name collisions
    - Identifying recovery vs primary stacks
  EOT
  type        = string
  default     = "primary"
}

variable "source_backup_bucket" {
  description = <<-EOT
    GCS bucket containing database backups for restoration during regional recovery.

    Leave empty for primary deployments.
    Set to the multi-regional backup bucket name during recovery (e.g., "tamshai-backups-us").

    When set and env_id != "primary", triggers automatic data restoration.
  EOT
  type        = string
  default     = ""
}

variable "recovery_mode" {
  description = <<-EOT
    Enable recovery mode for regional evacuation scenarios.

    When true:
    - Skips operations that would fail against unreachable resources
    - Enables automatic data restoration from source_backup_bucket
    - Uses recovery-specific naming for resources

    Should only be true when env_id != "primary".
  EOT
  type        = bool
  default     = false
}

variable "enable_mongodb_uri_access" {
  description = "Enable IAM binding for MCP servers to access external mongodb-uri secret. Set to false in DR mode where the secret doesn't exist."
  type        = bool
  default     = true
}
