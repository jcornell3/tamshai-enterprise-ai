# Security Module
# Manages service accounts, Secret Manager, and IAM

# =============================================================================
# SERVICE ACCOUNTS (Principle of Least Privilege)
# =============================================================================

# Service account for Keycloak
resource "google_service_account" "keycloak" {
  account_id   = "tamshai-${var.environment}-keycloak"
  display_name = "Tamshai Keycloak Service Account"
  description  = "Service account for Keycloak identity provider"
  project      = var.project_id
}

# Service account for MCP Gateway
resource "google_service_account" "mcp_gateway" {
  account_id   = "tamshai-${var.environment}-mcp-gateway"
  display_name = "Tamshai MCP Gateway Service Account"
  description  = "Service account for MCP Gateway AI orchestration"
  project      = var.project_id
}

# Service account for MCP Servers
resource "google_service_account" "mcp_servers" {
  account_id   = "tamshai-${var.environment}-mcp-servers"
  display_name = "Tamshai MCP Servers Service Account"
  description  = "Service account for domain MCP servers (HR, Finance, Sales, Support)"
  project      = var.project_id
}

# Service account for CI/CD (GitHub Actions)
resource "google_service_account" "cicd" {
  account_id   = "tamshai-${var.environment}-cicd"
  display_name = "Tamshai CI/CD Service Account"
  description  = "Service account for GitHub Actions CI/CD pipeline"
  project      = var.project_id
}

# =============================================================================
# SECRET MANAGER
# =============================================================================

# Enable Secret Manager API
resource "google_project_service" "secretmanager" {
  project            = var.project_id
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

# --- Keycloak Secrets ---

resource "google_secret_manager_secret" "keycloak_admin_password" {
  secret_id = "tamshai-${var.environment}-keycloak-admin-password"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "keycloak"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "keycloak_admin_password" {
  secret      = google_secret_manager_secret.keycloak_admin_password.id
  secret_data = random_password.keycloak_admin_password.result
}

resource "google_secret_manager_secret" "keycloak_db_password" {
  secret_id = "tamshai-${var.environment}-keycloak-db-password"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "keycloak"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "keycloak_db_password" {
  secret      = google_secret_manager_secret.keycloak_db_password.id
  secret_data = random_password.keycloak_db_password.result
}

# --- Database Secrets ---

resource "google_secret_manager_secret" "tamshai_db_password" {
  secret_id = "tamshai-${var.environment}-db-password"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "database"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "tamshai_db_password" {
  secret      = google_secret_manager_secret.tamshai_db_password.id
  secret_data = random_password.tamshai_db_password.result
}

# --- MCP Gateway Secrets ---

resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "tamshai-${var.environment}-anthropic-api-key"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "mcp-gateway"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "anthropic_api_key" {
  secret      = google_secret_manager_secret.anthropic_api_key.id
  secret_data = var.claude_api_key
}

resource "google_secret_manager_secret" "mcp_gateway_client_secret" {
  secret_id = "tamshai-${var.environment}-mcp-gateway-client-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "mcp-gateway"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "mcp_gateway_client_secret" {
  secret      = google_secret_manager_secret.mcp_gateway_client_secret.id
  secret_data = random_password.mcp_gateway_client_secret.result
}

# --- JWT Signing Key ---

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "tamshai-${var.environment}-jwt-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "auth"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

# =============================================================================
# SECRET MANAGER IAM - Grant access to service accounts
# =============================================================================

# Keycloak can access its own secrets
resource "google_secret_manager_secret_iam_member" "keycloak_admin_access" {
  secret_id = google_secret_manager_secret.keycloak_admin_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.keycloak.email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "keycloak_db_access" {
  secret_id = google_secret_manager_secret.keycloak_db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.keycloak.email}"
  project   = var.project_id
}

# MCP Gateway can access its secrets
resource "google_secret_manager_secret_iam_member" "mcp_gateway_anthropic_access" {
  secret_id = google_secret_manager_secret.anthropic_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_gateway.email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "mcp_gateway_client_secret_access" {
  secret_id = google_secret_manager_secret.mcp_gateway_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_gateway.email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "mcp_gateway_jwt_access" {
  secret_id = google_secret_manager_secret.jwt_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_gateway.email}"
  project   = var.project_id
}

# MCP Servers can access database password
resource "google_secret_manager_secret_iam_member" "mcp_servers_db_access" {
  secret_id = google_secret_manager_secret.tamshai_db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_servers.email}"
  project   = var.project_id
}

# =============================================================================
# GAP #43: MCP Servers MongoDB URI Access
# =============================================================================
# The mongodb-uri secret is created externally (e.g., manually or by a separate
# process that provisions MongoDB Atlas). MCP servers need read access to it.
# This binding grants the MCP servers service account access to the external secret.

data "google_secret_manager_secret" "mongodb_uri" {
  count     = var.enable_mongodb_uri_access ? 1 : 0
  secret_id = "tamshai-${var.environment}-mongodb-uri"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "mcp_servers_mongodb_uri_access" {
  count     = var.enable_mongodb_uri_access ? 1 : 0
  secret_id = data.google_secret_manager_secret.mongodb_uri[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_servers.email}"
  project   = var.project_id
}

# Gap #47: MCP Gateway also needs MongoDB URI access for token storage
resource "google_secret_manager_secret_iam_member" "mcp_gateway_mongodb_uri_access" {
  count     = var.enable_mongodb_uri_access ? 1 : 0
  secret_id = data.google_secret_manager_secret.mongodb_uri[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_gateway.email}"
  project   = var.project_id
}

# =============================================================================
# IAM ROLES FOR CLOUD RUN
# =============================================================================

# Grant Keycloak service account Cloud SQL Client role
resource "google_project_iam_member" "keycloak_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.keycloak.email}"
}

# Grant Keycloak service account Cloud Run Invoker role (for internal service-to-service calls)
resource "google_cloud_run_service_iam_member" "keycloak_invoker" {
  count = var.enable_cloud_run_iam ? 1 : 0

  service  = "keycloak"
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.keycloak.email}"
}

# Grant MCP Gateway service account Cloud SQL Client role
resource "google_project_iam_member" "mcp_gateway_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.mcp_gateway.email}"
}

# Grant MCP Gateway permission to invoke MCP Suite services
resource "google_project_iam_member" "mcp_gateway_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.mcp_gateway.email}"
}

# Grant MCP Servers service account Cloud SQL Client role
resource "google_project_iam_member" "mcp_servers_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.mcp_servers.email}"
}

# =============================================================================
# IAM ROLES FOR CI/CD (GitHub Actions)
# =============================================================================

# Grant CI/CD service account Cloud Run Admin role (to deploy services)
resource "google_project_iam_member" "cicd_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

# Grant CI/CD service account Artifact Registry Writer role (to push images)
resource "google_project_iam_member" "cicd_artifact_registry_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

# Allow CI/CD to query Cloud SQL instance details (for dynamic PostgreSQL IP discovery)
resource "google_project_iam_member" "cicd_cloudsql_viewer" {
  project = var.project_id
  role    = "roles/cloudsql.viewer"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

# =============================================================================
# CI/CD Service Account Impersonation - RESOURCE SCOPED (SECURE)
# =============================================================================
# Principle of Least Privilege: Grant CI/CD access ONLY to specific service
# accounts needed for Cloud Run deployments, not project-wide access.
#
# Security: Fixes CKV_GCP_41 and CKV_GCP_49 (High severity)
# Previously: Project-level roles/iam.serviceAccountUser allowed impersonation
#             of ANY service account in the project (privilege escalation risk)
# Now: Resource-scoped bindings limit CI/CD to only required service accounts

# Allow CI/CD to impersonate Keycloak service account (for Cloud Run deployments)
resource "google_service_account_iam_member" "cicd_can_use_keycloak_sa" {
  service_account_id = google_service_account.keycloak.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cicd.email}"
}

# Allow CI/CD to impersonate MCP Gateway service account (for Cloud Run deployments)
resource "google_service_account_iam_member" "cicd_can_use_mcp_gateway_sa" {
  service_account_id = google_service_account.mcp_gateway.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cicd.email}"
}

# Allow CI/CD to impersonate MCP Servers service account (for Cloud Run deployments)
resource "google_service_account_iam_member" "cicd_can_use_mcp_servers_sa" {
  service_account_id = google_service_account.mcp_servers.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cicd.email}"
}

# Grant CI/CD service account Secret Manager Accessor role (to access secrets during deployment)
resource "google_project_iam_member" "cicd_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

# =============================================================================
# RANDOM PASSWORD GENERATION
# =============================================================================

resource "random_password" "keycloak_admin_password" {
  length           = 24
  special          = true
  override_special = "!@#$%^&*"
}

resource "random_password" "keycloak_db_password" {
  length  = 24
  special = false # Avoid special chars in JDBC URLs
}

resource "random_password" "tamshai_db_password" {
  length  = 24
  special = false
}

resource "random_password" "mcp_gateway_client_secret" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

# =============================================================================
# CLOUD BUILD CONFIGURATION (User Provisioning)
# =============================================================================
# Required for running user provisioning via Cloud Build which can access
# private IP Cloud SQL instances from within GCP's network.

# Enable Cloud Build API
resource "google_project_service" "cloudbuild" {
  project            = var.project_id
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

# --- User Provisioning Secrets ---
# These secrets are used by Cloud Build to provision users

resource "google_secret_manager_secret" "mcp_hr_service_client_secret" {
  secret_id = "mcp-hr-service-client-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "mcp-hr"
    purpose     = "user-provisioning"
  }

  depends_on = [google_project_service.secretmanager]
}

# Gap #41 FIX: Add default version to mcp-hr-service-client-secret
# This ensures the secret has a version BEFORE Cloud Run services are created,
# preventing "secret version not found" errors during Phoenix rebuild.
# The value can be updated later after Keycloak is configured with the actual client secret.
resource "google_secret_manager_secret_version" "mcp_hr_service_client_secret" {
  secret      = google_secret_manager_secret.mcp_hr_service_client_secret.id
  secret_data = random_password.mcp_hr_service_client_secret.result

  lifecycle {
    # Allow manual updates to the secret value without Terraform overwriting it
    ignore_changes = [secret_data]
  }
}

resource "random_password" "mcp_hr_service_client_secret" {
  length  = 32
  special = false
}

resource "google_secret_manager_secret" "prod_user_password" {
  secret_id = "prod-user-password"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    purpose     = "user-provisioning"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "prod_user_password" {
  secret      = google_secret_manager_secret.prod_user_password.id
  secret_data = var.prod_user_password != "" ? var.prod_user_password : random_password.prod_user_password.result

  lifecycle {
    # Prevent Terraform from overwriting manually updated secrets
    ignore_changes = [secret_data]
  }
}

resource "random_password" "prod_user_password" {
  length           = 16
  special          = true
  override_special = "!@#$%^&*"

  # Only used if var.prod_user_password is not set
  lifecycle {
    ignore_changes = all
  }
}

# --- Cloud Build IAM for User Provisioning ---
# Cloud Build uses the Compute Engine default service account by default.
# Grant it access to the secrets needed for user provisioning.

data "google_project" "current" {
  project_id = var.project_id
}

locals {
  cloudbuild_sa = "${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
  compute_sa    = "${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

# Cloud Build SA - Database password access
resource "google_secret_manager_secret_iam_member" "cloudbuild_db_password" {
  secret_id = google_secret_manager_secret.tamshai_db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.compute_sa}"
  project   = var.project_id
}

# Cloud Build SA - Keycloak admin password access
resource "google_secret_manager_secret_iam_member" "cloudbuild_keycloak_admin" {
  secret_id = google_secret_manager_secret.keycloak_admin_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.compute_sa}"
  project   = var.project_id
}

# Cloud Build SA - MCP HR service client secret access
resource "google_secret_manager_secret_iam_member" "cloudbuild_mcp_hr_client" {
  secret_id = google_secret_manager_secret.mcp_hr_service_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.compute_sa}"
  project   = var.project_id
}

# Cloud Build SA - Prod user password access
resource "google_secret_manager_secret_iam_member" "cloudbuild_prod_user_password" {
  secret_id = google_secret_manager_secret.prod_user_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.compute_sa}"
  project   = var.project_id
}

# Grant Cloud Build SA the Cloud SQL Client role (for proxy connections)
resource "google_project_iam_member" "cloudbuild_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${local.compute_sa}"
}

# =============================================================================
# CLOUD RUN JOB FOR USER PROVISIONING
# =============================================================================
# Runs as a Cloud Run Job with VPC connector for private IP Cloud SQL access.
# This is the Phoenix-compliant solution for user provisioning.

# Enable Cloud Run API (may already be enabled by cloudrun module)
resource "google_project_service" "cloudrun" {
  project            = var.project_id
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

# Service account for the provisioning job
resource "google_service_account" "provision_job" {
  account_id   = "tamshai-${var.environment}-provision"
  display_name = "Tamshai Provisioning Job Service Account"
  description  = "Service account for user provisioning Cloud Run job"
  project      = var.project_id
}

# Grant provisioning job access to secrets
resource "google_secret_manager_secret_iam_member" "provision_job_db_password" {
  secret_id = google_secret_manager_secret.tamshai_db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.provision_job.email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "provision_job_keycloak_admin" {
  secret_id = google_secret_manager_secret.keycloak_admin_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.provision_job.email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "provision_job_mcp_hr_client" {
  secret_id = google_secret_manager_secret.mcp_hr_service_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.provision_job.email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "provision_job_prod_user_password" {
  secret_id = google_secret_manager_secret.prod_user_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.provision_job.email}"
  project   = var.project_id
}

# Grant Cloud SQL Client role
resource "google_project_iam_member" "provision_job_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.provision_job.email}"
}

# The Cloud Run Job resource
# Note: The image must be built and pushed before terraform apply
# Only created if enable_provision_job is true (GCP environment)
# Gap #49 Fix: Use boolean instead of runtime vpc_connector_id to avoid count dependency on unknown values
resource "google_cloud_run_v2_job" "provision_users" {
  count = var.enable_provision_job ? 1 : 0

  name     = "provision-users"
  location = var.region
  project  = var.project_id

  # Gap #42: Disable deletion protection to allow terraform to manage job lifecycle
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.provision_job.email
      timeout         = "1200s" # 20 minutes max

      vpc_access {
        connector = var.vpc_connector_id
        egress    = "ALL_TRAFFIC"
      }

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tamshai/provision-job:latest"

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        env {
          name  = "CLOUD_SQL_INSTANCE"
          value = var.cloud_sql_connection_name
        }

        env {
          name  = "KEYCLOAK_URL"
          value = var.keycloak_url
        }

        env {
          name  = "KEYCLOAK_REALM"
          value = "tamshai-corp"
        }

        env {
          name = "DB_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.tamshai_db_password.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "KC_ADMIN_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.keycloak_admin_password.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "KC_CLIENT_SECRET"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.mcp_hr_service_client_secret.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "PROD_USER_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.prod_user_password.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  # Issue #9 Fix: Ensure IAM bindings exist before job is created
  # This prevents "Permission denied on secret" errors during first execution
  depends_on = [
    google_project_service.cloudrun,
    google_secret_manager_secret_version.tamshai_db_password,
    google_secret_manager_secret_version.keycloak_admin_password,
    google_secret_manager_secret_version.prod_user_password,
    # Issue #9: IAM bindings must exist before job can access secrets
    google_secret_manager_secret_iam_member.provision_job_db_password,
    google_secret_manager_secret_iam_member.provision_job_keycloak_admin,
    google_secret_manager_secret_iam_member.provision_job_mcp_hr_client,
    google_secret_manager_secret_iam_member.provision_job_prod_user_password,
    google_project_iam_member.provision_job_cloudsql_client,
  ]

  lifecycle {
    # Ignore image changes - image is updated via CI/CD
    ignore_changes = [
      template[0].template[0].containers[0].image
    ]
  }
}

# =============================================================================
# NOTE: PROD_USER_PASSWORD FLOW
# =============================================================================
# The PROD_USER_PASSWORD GitHub Secret is the source of truth for corporate
# user passwords. It is used by provision-prod-users.yml to set passwords
# when running identity-sync.
#
# Flow:
# 1. PROD_USER_PASSWORD is set in GitHub Secrets (manual, one-time setup)
# 2. provision-prod-users.yml passes it to identity-sync
# 3. identity-sync sets this password for all provisioned corporate users
#
# The GCP Secret Manager prod-user-password secret is a backup/fallback
# and can be synced manually if needed, but GitHub Secrets is authoritative.
