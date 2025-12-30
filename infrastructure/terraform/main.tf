# Tamshai Corp Enterprise AI - GCP Production Infrastructure
# Terraform Root Module - Orchestrates all child modules
#
# IMPORTANT: This configuration is for GCP production deployment only.
# - For staging (VPS): See infrastructure/terraform/vps/
# - For development (Docker): See infrastructure/docker/
#
# MODULAR ARCHITECTURE:
# This file calls child modules for networking, security, database, storage, and compute.
# Each module is responsible for a specific domain and can be tested/updated independently.
#
# SECURITY: All secrets are stored in GCP Secret Manager and fetched at runtime.
# No secrets are embedded in Terraform state or startup scripts.
#
# Estimated Monthly Cost: ~$150-200/month (GCP production)

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

  # Terraform Cloud backend for encrypted state storage
  # Provides state locking, encryption, and version history
  # See: docs/deployment/TERRAFORM_CLOUD_SETUP.md for setup instructions
  cloud {
    organization = "tamshai"

    workspaces {
      # Workspace is selected via TF_WORKSPACE environment variable
      # dev: TF_WORKSPACE=tamshai-dev
      # staging: TF_WORKSPACE=tamshai-staging
      # production: TF_WORKSPACE=tamshai-production
      tags = ["tamshai", "enterprise-ai"]
    }
  }
}

# =============================================================================
# PROVIDER CONFIGURATION
# =============================================================================

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# =============================================================================
# LOCAL VARIABLES
# =============================================================================

locals {
  # Derive environment from workspace name
  # E.g., "tamshai-dev" -> "dev"
  environment = coalesce(var.environment, replace(terraform.workspace, "tamshai-", ""))

  # Environment-specific settings
  is_production       = local.environment == "prod" || local.environment == "production"
  enable_backups      = local.is_production
  deletion_protection = local.is_production
  force_destroy       = !local.is_production
  enable_versioning   = local.is_production
  preemptible         = !local.is_production
  automatic_restart   = local.is_production
}

# =============================================================================
# MODULES
# =============================================================================

# Networking Module - VPC, Subnets, NAT, Firewall
module "networking" {
  source = "./modules/networking"

  project_id         = var.project_id
  region             = var.region
  environment        = local.environment
  subnet_cidr        = var.subnet_cidr
  allowed_http_ports = var.allowed_http_ports
  http_source_ranges = var.http_source_ranges
}

# Security Module - Service Accounts, Secret Manager, IAM
module "security" {
  source = "./modules/security"

  project_id  = var.project_id
  environment = local.environment
}

# Database Module - Cloud SQL PostgreSQL
module "database" {
  source = "./modules/database"

  project_id          = var.project_id
  region              = var.region
  environment         = local.environment
  network_id          = module.networking.network_self_link
  database_version    = var.database_version
  database_tier       = var.database_tier
  disk_size_gb        = var.disk_size_gb
  enable_backups      = local.enable_backups
  deletion_protection = local.deletion_protection

  # Sensitive passwords from security module
  keycloak_db_password = module.security.keycloak_db_password
  tamshai_db_password  = module.security.tamshai_db_password

  depends_on = [module.networking]
}

# Storage Module - Cloud Storage Buckets
module "storage" {
  source = "./modules/storage"

  project_id         = var.project_id
  region             = var.region
  environment        = local.environment
  force_destroy      = local.force_destroy
  enable_versioning  = local.enable_versioning
  lifecycle_age_days = var.lifecycle_age_days
}

# Compute Module - GCE Instances
module "compute" {
  source = "./modules/compute"

  project_id                        = var.project_id
  region                            = var.region
  zone                              = var.zone
  environment                       = local.environment
  subnet_id                         = module.networking.subnet_id
  machine_type                      = var.machine_type
  machine_type_medium               = var.machine_type_medium
  boot_disk_size_keycloak           = var.boot_disk_size_keycloak
  boot_disk_size_gateway            = var.boot_disk_size_gateway
  preemptible                       = local.preemptible
  automatic_restart                 = local.automatic_restart
  keycloak_service_account_email    = module.security.keycloak_service_account_email
  mcp_gateway_service_account_email = module.security.mcp_gateway_service_account_email
  postgres_private_ip               = module.database.postgres_private_ip

  depends_on = [module.database, module.security]
}
