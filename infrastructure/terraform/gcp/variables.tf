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

variable "keycloak_domain" {
  description = "Keycloak domain (e.g., auth.tamshai.com)"
  type        = string
  default     = "auth.tamshai.com"
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
  description = "Keycloak URL for user provisioning job (with /auth suffix, e.g., https://keycloak-xxx-uc.a.run.app/auth)"
  type        = string
  default     = "https://keycloak-fn44nd7wba-uc.a.run.app/auth"
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
