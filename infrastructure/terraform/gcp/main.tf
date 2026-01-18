# Tamshai Corp Enterprise AI - GCP Phase 1 Production (Cost-Optimized)
# Terraform Configuration for Cloud Run Serverless Deployment
#
# Phase 1 Architecture:
# - Cloud Run for all services (scale to zero)
# - Cloud SQL PostgreSQL (db-f1-micro, zonal)
# - MongoDB Atlas M0 (Free Tier)
# - Utility VM (e2-micro) for Redis/Bastion
# - Estimated Cost: ~$50-80/month
#
# See: docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.14"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  # GCS backend for encrypted state storage
  backend "gcs" {
    bucket = "tamshai-terraform-state-prod"
    prefix = "gcp/phase1"
  }
}

# =============================================================================
# PROVIDER CONFIGURATION
# =============================================================================

provider "google" {
  project = var.project_id
  region  = var.region
}

# =============================================================================
# LOCAL VARIABLES
# =============================================================================

locals {
  environment = "prod"
  common_labels = {
    environment = local.environment
    managed-by  = "terraform"
    project     = "tamshai-enterprise-ai"
    phase       = "phase1"
  }
}

# =============================================================================
# NETWORKING MODULE
# =============================================================================

module "networking" {
  source = "../modules/networking"

  project_id                  = var.project_id
  region                      = var.region
  environment                 = local.environment
  subnet_cidr                 = var.subnet_cidr
  enable_serverless_connector = true
  serverless_connector_cidr   = var.serverless_connector_cidr
  allowed_http_ports          = ["80", "443"]
  http_source_ranges          = ["0.0.0.0/0"]
}

# =============================================================================
# SECURITY MODULE
# =============================================================================

module "security" {
  source = "../modules/security"

  project_id           = var.project_id
  region               = var.region
  environment          = local.environment
  enable_cloud_run_iam = false # Service-specific IAM is handled in cloudrun module
  claude_api_key       = var.claude_api_key

  # User Provisioning Job configuration
  # Note: These use variables/constructed values to avoid circular dependencies
  vpc_connector_id          = module.networking.serverless_connector_id
  cloud_sql_connection_name = "${var.project_id}:${var.region}:tamshai-${local.environment}-postgres"
  keycloak_url              = var.keycloak_provisioning_url
  prod_user_password        = var.prod_user_password

  # GitHub Integration (Phoenix Architecture)
  github_repo                = var.github_repo
  auto_update_github_secrets = var.auto_update_github_secrets

  depends_on = [module.networking]
}

# =============================================================================
# DATABASE MODULE
# =============================================================================

module "database" {
  source = "../modules/database"

  project_id          = var.project_id
  region              = var.region
  environment         = local.environment
  network_id          = module.networking.network_self_link
  database_version    = "POSTGRES_16"
  database_tier       = var.database_tier
  disk_size_gb        = 10
  enable_backups      = true
  deletion_protection = true

  keycloak_db_password = module.security.keycloak_db_password
  tamshai_db_password  = module.security.tamshai_db_password

  depends_on = [module.networking]
}

# =============================================================================
# STORAGE MODULE
# =============================================================================

module "storage" {
  source = "../modules/storage"

  project_id                 = var.project_id
  region                     = var.region
  environment                = local.environment
  force_destroy              = false # Production: prevent accidental deletion
  enable_versioning          = true
  lifecycle_age_days         = 365
  enable_static_website      = var.static_website_domain != "" # Only enable if domain is set
  static_website_domain      = var.static_website_domain
  cicd_service_account_email = module.security.cicd_service_account_email

  depends_on = [module.security]
}

# =============================================================================
# UTILITY VM MODULE (Redis + Bastion)
# =============================================================================

# For Phase 1, we use a small VM for Redis since Memorystore is too expensive
# This also serves as a bastion host for SSH access to private resources
module "utility_vm" {
  source = "../modules/compute"

  count = var.enable_utility_vm ? 1 : 0

  project_id              = var.project_id
  region                  = var.region
  zone                    = var.zone
  environment             = local.environment
  subnet_id               = module.networking.subnet_id
  machine_type            = "e2-micro" # Free tier eligible
  machine_type_medium     = "e2-micro"
  boot_disk_size_keycloak = 10
  boot_disk_size_gateway  = 10
  preemptible             = false
  automatic_restart       = true
  postgres_private_ip     = module.database.postgres_private_ip

  # Utility VM uses a dedicated service account
  keycloak_service_account_email    = module.security.keycloak_service_account_email
  mcp_gateway_service_account_email = module.security.mcp_gateway_service_account_email

  depends_on = [module.database, module.security]
}

# =============================================================================
# CLOUD RUN MODULE
# =============================================================================

module "cloudrun" {
  source = "../modules/cloudrun"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment

  # Scaling configuration (Phase 1: scale to zero for cost savings)
  cloud_run_min_instances = "0"
  cloud_run_max_instances = "2"
  keycloak_min_instances  = var.keycloak_min_instances

  # Networking
  vpc_connector_name = module.networking.serverless_connector_name
  cloud_run_hash     = "xxxxx" # DEPRECATED: Now using dynamic service URLs

  # Service accounts
  mcp_gateway_service_account = module.security.mcp_gateway_service_account_email
  mcp_suite_service_account   = module.security.mcp_gateway_service_account_email
  keycloak_service_account    = module.security.keycloak_service_account_email

  # Secrets (use actual Secret Manager names with tamshai-prod- prefix)
  claude_api_key_secret          = "tamshai-prod-anthropic-api-key"
  keycloak_admin_user_secret     = "keycloak-admin-user" # Not used - admin username is env var
  keycloak_admin_password_secret = "tamshai-prod-keycloak-admin-password"
  keycloak_db_password_secret    = "tamshai-prod-keycloak-db-password"

  # Database configuration
  postgres_connection_name = module.database.postgres_connection_name
  keycloak_db_name         = "keycloak"
  keycloak_db_user         = "keycloak"
  tamshai_db_name          = "tamshai"
  tamshai_db_user          = "tamshai"
  tamshai_db_password      = module.security.tamshai_db_password

  # MongoDB Atlas - use Secret Manager in production
  mongodb_uri        = "" # Not used when mongodb_uri_secret is set
  mongodb_uri_secret = "tamshai-prod-mongodb-uri"

  # Redis (Utility VM internal IP)
  redis_host = var.enable_utility_vm ? module.utility_vm[0].mcp_gateway_internal_ip : "10.0.0.10"

  # Domain configuration
  keycloak_domain = var.keycloak_domain

  # Web Portal configuration
  enable_web_portal          = true
  web_portal_service_account = module.security.mcp_gateway_service_account_email

  depends_on = [module.database, module.security, module.networking]
}
