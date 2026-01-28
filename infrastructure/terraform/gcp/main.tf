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

  # Regional Evacuation: env_id-based naming for resource isolation
  # - "primary" uses standard names (backwards compatible)
  # - "recovery-*" uses suffixed names to avoid global collisions
  is_recovery = var.env_id != "primary"
  name_suffix = local.is_recovery ? "-${var.env_id}" : ""
  name_prefix = "tamshai-${local.environment}${local.name_suffix}"

  # Resource naming for regional evacuation
  # These ensure recovery deployments don't conflict with primary
  postgres_instance_name = "tamshai-${local.environment}-postgres${local.name_suffix}"

  common_labels = {
    environment = local.environment
    managed-by  = "terraform"
    project     = "tamshai-enterprise-ai"
    phase       = "phase1"
    env-id      = var.env_id
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

  # Regional evacuation support: suffix for resource naming
  name_suffix = local.name_suffix
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

  # Regional evacuation support: suffix for resource naming
  name_suffix = local.name_suffix

  # Bug #29 fix: Don't create new secret versions in DR mode (would overwrite production secrets)
  manage_secret_versions = !var.recovery_mode

  # MongoDB URI access - disabled in DR mode (secret doesn't exist in recovery state)
  enable_mongodb_uri_access = var.enable_mongodb_uri_access

  # User Provisioning Job configuration
  # Gap #49 Fix: Use enable_provision_job boolean (known at plan time) instead of
  # checking vpc_connector_id (unknown until apply) to avoid count dependency errors
  # Disabled in recovery mode: the provision job image only exists in the primary region's
  # Artifact Registry, and user provisioning is not critical for core DR functionality.
  enable_provision_job      = !var.recovery_mode
  vpc_connector_id          = module.networking.serverless_connector_id
  cloud_sql_connection_name = "${var.project_id}:${var.region}:${local.postgres_instance_name}"
  keycloak_url              = var.keycloak_provisioning_url
  prod_user_password        = var.prod_user_password

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

  # Regional evacuation support: suffix for resource naming
  name_suffix = local.name_suffix

  keycloak_db_password = module.security.keycloak_db_password
  tamshai_db_password  = module.security.tamshai_db_password

  depends_on = [module.networking]
}

# =============================================================================
# STORAGE MODULE
# =============================================================================

module "storage" {
  source = "../modules/storage"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  # Storage buckets are GLOBAL resources (bucket names are globally unique)
  # They should be SHARED between primary and recovery deployments:
  # - Avoids 63-char bucket name limit issues with long env_id suffixes
  # - Multi-regional backups bucket survives regional outages (no need to recreate)
  # - Static website bucket is domain-based (can't have suffix)
  # - Regional buckets (logs, finance, public) can be reused across regions
  name_suffix = ""
  # Gap #39: Phoenix mode allows force_destroy for complete environment rebuilds
  force_destroy              = var.phoenix_mode # Production: normally false, true during Phoenix rebuild
  enable_versioning          = true
  lifecycle_age_days         = 365
  enable_static_website      = var.static_website_domain != "" # Only enable if domain is set
  static_website_domain      = var.static_website_domain
  cicd_service_account_email = module.security.cicd_service_account_email
  enable_cicd_iam_bindings   = true # Boolean for plan-time evaluation (avoids count dependency errors)

  # Regional evacuation support: multi-regional backup bucket for disaster recovery
  enable_backup_bucket  = true
  backup_retention_days = 90

  # Issue #102: Cloud SQL service agent IAM binding
  # The service agent (service-PROJECT_NUM@gcp-sa-cloud-sql.iam.gserviceaccount.com)
  # doesn't exist until Cloud SQL is created. In recovery mode, Cloud SQL may be
  # created for the first time, so disable this IAM binding to avoid errors.
  # The backup bucket already exists (multi-regional) and has permissions from primary.
  enable_cloudsql_backup_iam = !var.recovery_mode

  # Dependencies:
  # - security: provides cicd_service_account_email for bucket IAM
  # - database: ensures Cloud SQL service agent exists for backups bucket IAM
  #   (the service agent is auto-created when first Cloud SQL instance is created)
  depends_on = [module.security, module.database]
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
  # Bug #30: DB password secrets use name_suffix for DR isolation
  claude_api_key_secret          = "tamshai-prod-claude-api-key"
  keycloak_admin_user_secret     = "keycloak-admin-user" # Not used - admin username is env var
  keycloak_admin_password_secret = "tamshai-prod-keycloak-admin-password"
  keycloak_db_password_secret    = "tamshai-prod-keycloak-db-password${local.name_suffix}"

  # Database configuration
  postgres_connection_name = module.database.postgres_connection_name
  postgres_private_ip      = module.database.postgres_private_ip
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

  # Domain configuration (all use Cloud Run domain mappings via ghs.googlehosted.com)
  keycloak_domain = var.keycloak_domain
  api_domain      = var.api_domain
  app_domain      = var.app_domain

  # Web Portal configuration
  enable_web_portal          = true
  web_portal_service_account = module.security.mcp_gateway_service_account_email

  depends_on = [module.database, module.security, module.networking]
}

# =============================================================================
# AUTO-RESTORE FOR REGIONAL EVACUATION
# =============================================================================
# This resource triggers automatic data restoration when deploying to a
# recovery region. Only runs when:
#   1. env_id != "primary" (this is a recovery deployment)
#   2. source_backup_bucket is set (backup location specified)
#   3. recovery_mode is true (explicitly in recovery mode)
#
# The restore script imports Cloud SQL data from the multi-regional backup bucket.

resource "null_resource" "auto_restore_on_recovery" {
  count = local.is_recovery && var.source_backup_bucket != "" && var.recovery_mode ? 1 : 0

  # Re-run if backup bucket changes
  triggers = {
    backup_bucket = var.source_backup_bucket
    instance_name = local.postgres_instance_name
  }

  provisioner "local-exec" {
    command     = <<-EOT
      echo "=============================================="
      echo "AUTO-RESTORE: Regional Evacuation Data Restore"
      echo "=============================================="
      echo "Instance: ${local.postgres_instance_name}"
      echo "Backup Bucket: ${var.source_backup_bucket}"
      echo ""
      echo "Checking for restore script..."

      if [ -f "${path.root}/../../scripts/db/restore-from-gcs.sh" ]; then
        echo "Running restore script..."
        "${path.root}/../../scripts/db/restore-from-gcs.sh" \
          --instance="${local.postgres_instance_name}" \
          --bucket="${var.source_backup_bucket}" \
          --project="${var.project_id}"
      else
        echo "WARNING: Restore script not found."
        echo "Manual restore required from: gs://${var.source_backup_bucket}"
        echo ""
        echo "To restore manually:"
        echo "  gcloud sql import sql ${local.postgres_instance_name} \\"
        echo "    gs://${var.source_backup_bucket}/latest/tamshai_hr.sql \\"
        echo "    --database=tamshai_hr"
      fi
    EOT
    interpreter = ["bash", "-c"]
  }

  depends_on = [module.database, module.cloudrun]
}
