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
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tamshai/mcp-gateway:v1.0.3"

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
          name  = "KEYCLOAK_ISSUER"
          value = "${google_cloud_run_service.keycloak.status[0].url}/auth/realms/tamshai-corp"
        }

        env {
          name  = "JWKS_URI"
          value = "${google_cloud_run_service.keycloak.status[0].url}/auth/realms/tamshai-corp/protocol/openid-connect/certs"
        }

        env {
          name  = "REDIS_HOST"
          value = "127.0.0.1"
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
}

# Make MCP Gateway publicly accessible
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
      port     = 3101
      database = var.postgres_connection_name
    }
    finance = {
      port     = 3102
      database = var.postgres_connection_name
    }
    sales = {
      port     = 3103
      database = var.postgres_connection_name
    }
    support = {
      port     = 3104
      database = var.postgres_connection_name
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

        env {
          name  = "DATABASE_URL"
          value = "postgresql://${var.tamshai_db_user}:${var.tamshai_db_password}@/${var.tamshai_db_name}?host=/cloudsql/${each.value.database}"
        }

        env {
          name  = "MONGODB_URI"
          value = var.mongodb_uri
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
          "run.googleapis.com/cloudsql-instances"    = each.value.database
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
          # VPC Connector routes traffic through private network (10.180.0.3)
          value = "jdbc:postgresql://10.180.0.3:5432/keycloak"
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

        # Use TCP probe instead of HTTP - Cloud Run will check if port 8080 is listening
        startup_probe {
          tcp_socket {
            port = 8080
          }
          initial_delay_seconds = 30
          timeout_seconds       = 5
          period_seconds        = 10
          failure_threshold     = 12 # 30s + (12 × 10s) = 150s total (2.5 minutes) - extra time for PostgreSQL schema creation
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
}

# Make Keycloak publicly accessible
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
}
