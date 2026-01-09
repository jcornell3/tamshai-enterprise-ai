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
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tamshai/mcp-gateway:latest"

        ports {
          container_port = 3100
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
          value = "https://${var.keycloak_domain}/realms/tamshai"
        }

        env {
          name = "JWKS_URI"
          value = "https://${var.keycloak_domain}/realms/tamshai/protocol/openid-connect/certs"
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
          name  = "MCP_HR_URL"
          value = "https://mcp-hr-${var.cloud_run_hash}.${var.region}.run.app"
        }

        env {
          name  = "MCP_FINANCE_URL"
          value = "https://mcp-finance-${var.cloud_run_hash}.${var.region}.run.app"
        }

        env {
          name  = "MCP_SALES_URL"
          value = "https://mcp-sales-${var.cloud_run_hash}.${var.region}.run.app"
        }

        env {
          name  = "MCP_SUPPORT_URL"
          value = "https://mcp-support-${var.cloud_run_hash}.${var.region}.run.app"
        }

        env {
          name  = "NODE_ENV"
          value = var.environment == "prod" ? "production" : "development"
        }
      }

      service_account_name = var.mcp_gateway_service_account
      timeout_seconds      = 300
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
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tamshai/keycloak:latest"

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
          name = "KEYCLOAK_ADMIN"
          value_from {
            secret_key_ref {
              name = var.keycloak_admin_user_secret
              key  = "latest"
            }
          }
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
          name  = "KC_DB_URL"
          value = "jdbc:postgresql:///${var.keycloak_db_name}?cloudSqlInstance=${var.postgres_connection_name}&socketFactory=com.google.cloud.sql.postgres.SocketFactory"
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

        env {
          name  = "KC_HTTP_ENABLED"
          value = "true"
        }

        env {
          name  = "KC_PROXY"
          value = "edge"
        }

        env {
          name  = "KC_HEALTH_ENABLED"
          value = "true"
        }

        startup_probe {
          tcp_socket {
            port = 8080
          }
          initial_delay_seconds = 30
          timeout_seconds       = 5
          period_seconds        = 10
          failure_threshold     = 10
        }

        liveness_probe {
          http_get {
            path = "/health/live"
            port = 8080
          }
          initial_delay_seconds = 60
          timeout_seconds       = 5
          period_seconds        = 30
        }
      }

      service_account_name = var.keycloak_service_account
      timeout_seconds      = 300
    }

    metadata {
      annotations = merge(
        {
          "autoscaling.knative.dev/minScale"         = var.keycloak_min_instances
          "autoscaling.knative.dev/maxScale"         = "4"
          "run.googleapis.com/vpc-access-egress"     = "private-ranges-only"
          "run.googleapis.com/execution-environment" = "gen2"
          "run.googleapis.com/cloudsql-instances"    = var.postgres_connection_name
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
