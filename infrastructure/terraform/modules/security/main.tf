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
