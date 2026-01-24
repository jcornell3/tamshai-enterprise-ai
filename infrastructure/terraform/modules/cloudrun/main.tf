# Cloud Run Module
# Deploys serverless containers for MCP Gateway, MCP Suite, and Keycloak
#
# Phase 1 Configuration:
# - Min instances = 0 (scale to zero for cost savings)
# - Max instances = 2 (low traffic, cost-optimized)
# - Request timeout = 300s (supports Claude API streaming)
# - Memory: 1GiB for gateway/Keycloak, 512MiB for MCP Suite

# =============================================================================
# ARTIFACT REGISTRY REPOSITORY
# =============================================================================

#checkov:skip=CKV_GCP_84:Google-managed encryption sufficient for container images. CSEK adds operational complexity without significant security benefit.
resource "google_artifact_registry_repository" "tamshai" {
  location      = var.region
  repository_id = "tamshai"
  description   = "Docker container images for Tamshai Enterprise AI"
  format        = "DOCKER"
  project       = var.project_id

  labels = {
    environment = var.environment
    managed-by  = "terraform"
  }

  # Issue #102: Handle pre-existing repositories during DR evacuation
  # The evacuate-region.sh pre-imports existing resources, but Terraform may still
  # try to create. This lifecycle block prevents errors when the repository already exists.
  lifecycle {
    # Prevent destruction of shared Artifact Registry (images are used by both primary and DR)
    prevent_destroy = false
    # Ignore changes that could trigger recreation
    ignore_changes = [
      location,
      repository_id,
      description,
    ]
  }
}

# =============================================================================
# MCP GATEWAY (AI Orchestration Service)
# =============================================================================

resource "google_cloud_run_service" "mcp_gateway" {
  name     = "mcp-gateway"
  location = var.region
  project  = var.project_id

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tamshai/mcp-gateway:latest"

        ports {
          container_port = 8080
        }

        resources {
          limits = {
            cpu    = "1000m"
            memory = "1Gi"
          }
        }

        env {
          name = "CLAUDE_API_KEY"
          value_from {
            secret_key_ref {
              name = var.claude_api_key_secret
              key  = "latest"
            }
          }
        }

        env {
          name = "KEYCLOAK_ISSUER"
          # Use custom domain if configured, otherwise fall back to Cloud Run URL
          value = var.keycloak_domain != "" ? "https://${var.keycloak_domain}/auth/realms/tamshai-corp" : "${google_cloud_run_service.keycloak.status[0].url}/auth/realms/tamshai-corp"
        }

        env {
          name = "JWKS_URI"
          # Use custom domain if configured, otherwise fall back to Cloud Run URL
          value = var.keycloak_domain != "" ? "https://${var.keycloak_domain}/auth/realms/tamshai-corp/protocol/openid-connect/certs" : "${google_cloud_run_service.keycloak.status[0].url}/auth/realms/tamshai-corp/protocol/openid-connect/certs"
        }

        env {
          name  = "REDIS_HOST"
          value = var.redis_host
        }

        env {
          name  = "REDIS_PORT"
          value = "6379"
        }

        env {
          name  = "TOKEN_REVOCATION_FAIL_OPEN"
          value = "true"
        }

        env {
          name  = "MONGODB_URI"
          value = var.mongodb_uri
        }

        env {
          name  = "MCP_HR_URL"
          value = google_cloud_run_service.mcp_suite["hr"].status[0].url
        }

        env {
          name  = "MCP_FINANCE_URL"
          value = google_cloud_run_service.mcp_suite["finance"].status[0].url
        }

        env {
          name  = "MCP_SALES_URL"
          value = google_cloud_run_service.mcp_suite["sales"].status[0].url
        }

        env {
          name  = "MCP_SUPPORT_URL"
          value = google_cloud_run_service.mcp_suite["support"].status[0].url
        }

        env {
          name  = "NODE_ENV"
          value = var.environment == "prod" ? "production" : "development"
        }

        env {
          name  = "KEYCLOAK_VALIDATION_RETRIES"
          value = "10"
        }

        startup_probe {
          http_get {
            path = "/health"
            port = 8080
          }
          initial_delay_seconds = 10
          timeout_seconds       = 5
          period_seconds        = 5
          failure_threshold     = 12 # 10s + (5s × 12) = 70s (~1 minute total)
        }
      }

      service_account_name = var.mcp_gateway_service_account
      timeout_seconds      = 600 # Increased from 300s to allow for Keycloak startup + retries
    }

    metadata {
      annotations = merge(
        {
          "autoscaling.knative.dev/minScale"         = var.cloud_run_min_instances
          "autoscaling.knative.dev/maxScale"         = var.cloud_run_max_instances
          "run.googleapis.com/vpc-access-egress"     = "private-ranges-only"
          "run.googleapis.com/execution-environment" = "gen2"
        },
        var.vpc_connector_name != "" ? {
          "run.googleapis.com/vpc-access-connector" = var.vpc_connector_name
        } : {}
      )

      labels = {
        environment = var.environment
        service     = "mcp-gateway"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true

  lifecycle {
    ignore_changes = [
      template[0].metadata[0].annotations["run.googleapis.com/client-name"],
      template[0].metadata[0].annotations["run.googleapis.com/client-version"],
    ]
  }

  # Issue #11 Fix: Increase timeouts for long-running operations
  # Cloud Run service creation can take 20+ minutes during cold starts
  timeouts {
    create = "30m"
    update = "20m"
  }
}

# Make MCP Gateway publicly accessible
#checkov:skip=CKV_GCP_102:MCP Gateway API must be publicly accessible for client applications. Auth handled by Keycloak JWT validation.
resource "google_cloud_run_service_iam_member" "mcp_gateway_public" {
  service  = google_cloud_run_service.mcp_gateway.name
  location = google_cloud_run_service.mcp_gateway.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# =============================================================================
# MCP SUITE SERVICES (HR, Finance, Sales, Support)
# =============================================================================

locals {
  mcp_services = {
    hr = {
      port              = 3101
      cloudsql_instance = var.postgres_connection_name
      db_name           = "tamshai_hr"
    }
    finance = {
      port              = 3102
      cloudsql_instance = var.postgres_connection_name
      db_name           = "tamshai_finance"
    }
    sales = {
      port              = 3103
      cloudsql_instance = var.postgres_connection_name
      db_name           = "tamshai_sales" # Uses MongoDB primarily, but needs PostgreSQL for some data
    }
    support = {
      port              = 3104
      cloudsql_instance = var.postgres_connection_name
      db_name           = "tamshai_support" # Uses Elasticsearch primarily, but needs PostgreSQL for tickets
    }
  }
}

resource "google_cloud_run_service" "mcp_suite" {
  for_each = local.mcp_services

  name     = "mcp-${each.key}"
  location = var.region
  project  = var.project_id

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tamshai/mcp-${each.key}:latest"

        ports {
          container_port = each.value.port
        }

        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
        }

        # PostgreSQL connection via Cloud SQL Unix socket
        # MCP services expect individual POSTGRES_* env vars, not DATABASE_URL
        env {
          name  = "POSTGRES_HOST"
          value = "/cloudsql/${each.value.cloudsql_instance}"
        }

        env {
          name  = "POSTGRES_DB"
          value = each.value.db_name
        }

        env {
          name  = "POSTGRES_USER"
          value = var.tamshai_db_user
        }

        env {
          name  = "POSTGRES_PASSWORD"
          value = var.tamshai_db_password
        }

        env {
          name  = "POSTGRES_PORT"
          value = "5432" # Standard port (ignored for Unix socket, but required by pg library)
        }

        # Note: PGSSLMODE is NOT set when using Unix socket via Cloud SQL connector
        # Unix socket connections are secured by the Cloud SQL Auth Proxy at the transport layer
        # Setting PGSSLMODE=require with Unix socket causes "server does not support SSL" error

        # MongoDB URI - use Secret Manager if configured, otherwise fall back to plain value
        dynamic "env" {
          for_each = var.mongodb_uri_secret != "" ? [1] : []
          content {
            name = "MONGODB_URI"
            value_from {
              secret_key_ref {
                name = var.mongodb_uri_secret
                key  = "latest"
              }
            }
          }
        }

        dynamic "env" {
          for_each = var.mongodb_uri_secret == "" && var.mongodb_uri != "" ? [1] : []
          content {
            name  = "MONGODB_URI"
            value = var.mongodb_uri
          }
        }

        # Support-specific: Backend selection (MongoDB for GCP Prod Phase 1)
        dynamic "env" {
          for_each = each.key == "support" ? [1] : []
          content {
            name  = "SUPPORT_DATA_BACKEND"
            value = "mongodb"
          }
        }

        # Support-specific: MongoDB database name
        dynamic "env" {
          for_each = each.key == "support" ? [1] : []
          content {
            name  = "MONGODB_DB"
            value = "tamshai_support"
          }
        }

        # PORT is automatically set by Cloud Run (cannot be overridden)
        # Cloud Run always listens on $PORT environment variable (default: 8080)

        env {
          name  = "NODE_ENV"
          value = var.environment == "prod" ? "production" : "development"
        }
      }

      service_account_name = var.mcp_suite_service_account
      timeout_seconds      = 300
    }

    metadata {
      annotations = merge(
        {
          "autoscaling.knative.dev/minScale"         = var.cloud_run_min_instances
          "autoscaling.knative.dev/maxScale"         = var.cloud_run_max_instances
          "run.googleapis.com/vpc-access-egress"     = "private-ranges-only"
          "run.googleapis.com/execution-environment" = "gen2"
          "run.googleapis.com/cloudsql-instances"    = each.value.cloudsql_instance
        },
        var.vpc_connector_name != "" ? {
          "run.googleapis.com/vpc-access-connector" = var.vpc_connector_name
        } : {}
      )

      labels = {
        environment = var.environment
        service     = "mcp-${each.key}"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true

  lifecycle {
    ignore_changes = [
      template[0].metadata[0].annotations["run.googleapis.com/client-name"],
      template[0].metadata[0].annotations["run.googleapis.com/client-version"],
    ]
  }

  # Issue #11 Fix: Increase timeouts for long-running operations
  timeouts {
    create = "20m"
    update = "15m"
  }
}

# MCP Suite services are NOT publicly accessible (only via MCP Gateway)
resource "google_cloud_run_service_iam_member" "mcp_suite_gateway_access" {
  for_each = local.mcp_services

  service  = google_cloud_run_service.mcp_suite[each.key].name
  location = google_cloud_run_service.mcp_suite[each.key].location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.mcp_gateway_service_account}"
}

# =============================================================================
# KEYCLOAK (Identity & Access Management)
# =============================================================================

resource "google_cloud_run_service" "keycloak" {
  name     = "keycloak"
  location = var.region
  project  = var.project_id

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tamshai/keycloak:v2.0.0-postgres"

        ports {
          container_port = 8080
        }

        resources {
          limits = {
            cpu    = "1000m"
            memory = "1Gi"
          }
        }

        env {
          name  = "KEYCLOAK_ADMIN"
          value = "admin"
        }

        env {
          name = "KEYCLOAK_ADMIN_PASSWORD"
          value_from {
            secret_key_ref {
              name = var.keycloak_admin_password_secret
              key  = "latest"
            }
          }
        }

        env {
          name  = "KC_DB"
          value = "postgres"
        }

        env {
          name = "KC_DB_URL"
          # Standard TCP connection via VPC Connector to Cloud SQL private IP
          # VPC Connector routes traffic through private network
          value = "jdbc:postgresql://${var.postgres_private_ip}:5432/keycloak"
        }

        env {
          name  = "KC_DB_USERNAME"
          value = var.keycloak_db_user
        }

        env {
          name = "KC_DB_PASSWORD"
          value_from {
            secret_key_ref {
              name = var.keycloak_db_password_secret
              key  = "latest"
            }
          }
        }

        env {
          name  = "KC_HOSTNAME"
          value = var.keycloak_domain
        }

        env {
          name  = "KC_HOSTNAME_STRICT"
          value = "false"
        }

        # KC_HTTP_ENABLED, KC_HTTP_RELATIVE_PATH, KC_METRICS_ENABLED are build-time options
        # Already set in Docker image during kc.sh build - do not override at runtime

        env {
          name  = "KC_HTTP_PORT"
          value = "8080"
        }

        env {
          name  = "KC_PROXY"
          value = "edge"
        }

        env {
          name  = "KC_PROXY_HEADERS"
          value = "xforwarded"
        }

        # Use TCP probe instead of HTTP - Cloud Run will check if port 8080 is listening
        # Issue #102 fix: Increased timeouts for DR deployments where full database
        # migrations (148+ change sets) need to run on fresh Cloud SQL instances.
        # Fresh migrations take ~3-4 minutes, existing instances take ~30 seconds.
        startup_probe {
          tcp_socket {
            port = 8080
          }
          initial_delay_seconds = 30
          timeout_seconds       = 10
          period_seconds        = 15
          failure_threshold     = 20 # 30s + (20 × 15s) = 330s total (5.5 minutes) - for fresh DB migrations
        }
      }

      service_account_name = var.keycloak_service_account
      timeout_seconds      = 600
    }

    metadata {
      annotations = merge(
        {
          "autoscaling.knative.dev/minScale"         = var.keycloak_min_instances
          "autoscaling.knative.dev/maxScale"         = "4"
          "run.googleapis.com/vpc-access-egress"     = "private-ranges-only"
          "run.googleapis.com/execution-environment" = "gen2"
          "run.googleapis.com/startup-cpu-boost"     = "true"
        },
        var.vpc_connector_name != "" ? {
          "run.googleapis.com/vpc-access-connector" = var.vpc_connector_name
        } : {}
      )

      labels = {
        environment = var.environment
        service     = "keycloak"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true

  lifecycle {
    ignore_changes = [
      template[0].metadata[0].annotations["run.googleapis.com/client-name"],
      template[0].metadata[0].annotations["run.googleapis.com/client-version"],
    ]
  }

  # Issue #11 Fix: Increase timeouts for long-running operations
  # Keycloak can take longer to start due to DB initialization
  timeouts {
    create = "30m"
    update = "20m"
  }
}

# Make Keycloak publicly accessible
#checkov:skip=CKV_GCP_102:Keycloak IdP must be publicly accessible for SSO authentication. Protected by its own auth mechanisms.
resource "google_cloud_run_service_iam_member" "keycloak_public" {
  service  = google_cloud_run_service.keycloak.name
  location = google_cloud_run_service.keycloak.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# =============================================================================
# CLOUD RUN DOMAIN MAPPING (Custom Domain Support)
# =============================================================================

# Map custom domain to Keycloak service
# Prerequisites:
# 1. Domain DNS must point to Cloud Run (CNAME to ghs.googlehosted.com or Cloud Run service URL)
# 2. Domain ownership verified in Google Search Console
# 3. SSL certificate automatically provisioned by Google Cloud
resource "google_cloud_run_domain_mapping" "keycloak" {
  count = var.keycloak_domain != "" ? 1 : 0

  name     = var.keycloak_domain
  location = var.region
  project  = var.project_id

  metadata {
    namespace = var.project_id

    labels = {
      environment = var.environment
      service     = "keycloak"
    }
  }

  spec {
    route_name = google_cloud_run_service.keycloak.name
  }

  # Issue #11 Fix: Certificate provisioning can take 15-20 minutes
  timeouts {
    create = "30m"
  }

  # Issue #102: Prevent replacement on import
  # - metadata: terraform_labels forces replacement
  # - spec: certificate_mode forces replacement when not in state
  lifecycle {
    ignore_changes = [metadata, spec]
  }
}

# Map custom domain to MCP Gateway service
resource "google_cloud_run_domain_mapping" "mcp_gateway" {
  count = var.api_domain != "" ? 1 : 0

  name     = var.api_domain
  location = var.region
  project  = var.project_id

  metadata {
    namespace = var.project_id

    labels = {
      environment = var.environment
      service     = "mcp-gateway"
    }
  }

  spec {
    route_name = google_cloud_run_service.mcp_gateway.name
  }

  timeouts {
    create = "30m"
  }

  # Issue #102: Prevent replacement on import
  # - metadata: terraform_labels forces replacement
  # - spec: certificate_mode forces replacement when not in state
  lifecycle {
    ignore_changes = [metadata, spec]
  }
}

# Map custom domain to Web Portal service
resource "google_cloud_run_domain_mapping" "web_portal" {
  count = var.app_domain != "" && var.enable_web_portal ? 1 : 0

  name     = var.app_domain
  location = var.region
  project  = var.project_id

  metadata {
    namespace = var.project_id

    labels = {
      environment = var.environment
      service     = "web-portal"
    }
  }

  spec {
    route_name = google_cloud_run_service.web_portal[0].name
  }

  timeouts {
    create = "30m"
  }

  # Issue #102: Prevent replacement on import
  # - metadata: terraform_labels forces replacement
  # - spec: certificate_mode forces replacement when not in state
  lifecycle {
    ignore_changes = [metadata, spec]
  }
}

# =============================================================================
# WEB PORTAL (Static SPA with Caddy)
# =============================================================================
# Serves the React portal application with proper SPA routing.
# Uses Caddy for consistency with dev/stage environments.
# Handles /app/* routes and OAuth callback.

resource "google_cloud_run_service" "web_portal" {
  count = var.enable_web_portal ? 1 : 0

  name     = "web-portal"
  location = var.region
  project  = var.project_id

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tamshai/web-portal:latest"

        ports {
          container_port = 80
        }

        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi" # gen2 requires minimum 512Mi
          }
        }

        # Caddy serves static files - no env vars needed
        # OAuth config is baked into the built React app
      }

      service_account_name = var.web_portal_service_account
      timeout_seconds      = 60
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale"         = "0"
        "autoscaling.knative.dev/maxScale"         = "2"
        "run.googleapis.com/execution-environment" = "gen2"
      }

      labels = {
        environment = var.environment
        service     = "web-portal"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true

  lifecycle {
    ignore_changes = [
      template[0].metadata[0].annotations["run.googleapis.com/client-name"],
      template[0].metadata[0].annotations["run.googleapis.com/client-version"],
    ]
  }

  # Issue #11 Fix: Increase timeouts for long-running operations
  timeouts {
    create = "20m"
    update = "15m"
  }
}

# Make Web Portal publicly accessible
#checkov:skip=CKV_GCP_102:Web Portal must be publicly accessible for end users. Static SPA with client-side auth.
resource "google_cloud_run_service_iam_member" "web_portal_public" {
  count = var.enable_web_portal ? 1 : 0

  service  = google_cloud_run_service.web_portal[0].name
  location = google_cloud_run_service.web_portal[0].location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
