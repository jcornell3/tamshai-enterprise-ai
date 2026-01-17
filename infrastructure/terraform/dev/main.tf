# =============================================================================
# Terraform Dev Environment - Main Configuration
# =============================================================================
#
# Full-stack Terraform for local Docker Compose development
# Mimics VPS/production structure but targets Docker Desktop
#
# Services Managed (19 total):
#   - Infrastructure: PostgreSQL, MongoDB, Redis, Elasticsearch, MinIO
#   - Identity: Keycloak (via keycloak module)
#   - API Gateway: Kong
#   - MCP Servers: Gateway, HR, Finance, Sales, Support (5)
#   - Web Apps: Portal, HR, Finance, Sales, Support, Website (6)
#
# Usage:
#   cd infrastructure/terraform/dev
#   terraform init
#   terraform plan -var-file=dev.tfvars
#   terraform apply -var-file=dev.tfvars
#
# Created: 2025-12-30
# =============================================================================

# =============================================================================
# LOCALS
# =============================================================================

locals {
  compose_path = "${var.project_root}/${var.docker_compose_dir}"
  env_file     = "${local.compose_path}/.env"

  # Service URLs for outputs
  services = {
    keycloak = {
      url  = "http://localhost:8180/auth"
      port = 8180
    }
    kong_proxy = {
      url  = "http://localhost:8100"
      port = 8100
    }
    kong_admin = {
      url  = "http://localhost:8101"
      port = 8101
    }
    mcp_gateway = {
      url  = "http://localhost:3100"
      port = 3100
    }
    mcp_hr = {
      url  = "http://localhost:3101"
      port = 3101
    }
    mcp_finance = {
      url  = "http://localhost:3102"
      port = 3102
    }
    mcp_sales = {
      url  = "http://localhost:3103"
      port = 3103
    }
    mcp_support = {
      url  = "http://localhost:3104"
      port = 3104
    }
    web_portal = {
      url  = "http://localhost:4000"
      port = 4000
    }
    web_hr = {
      url  = "http://localhost:4001"
      port = 4001
    }
    web_finance = {
      url  = "http://localhost:4002"
      port = 4002
    }
    web_sales = {
      url  = "http://localhost:4003"
      port = 4003
    }
    web_support = {
      url  = "http://localhost:4004"
      port = 4004
    }
    website = {
      url  = "http://localhost:8080"
      port = 8080
    }
    postgres = {
      url  = "postgresql://localhost:5433"
      port = 5433
    }
    mongodb = {
      url  = "mongodb://localhost:27018"
      port = 27018
    }
    redis = {
      url  = "redis://localhost:6380"
      port = 6380
    }
    elasticsearch = {
      url  = "http://localhost:9201"
      port = 9201
    }
    minio = {
      url  = "http://localhost:9100"
      port = 9100
    }
    caddy = {
      url  = "https://www.tamshai.local"
      port = 443
    }
  }
}

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

# Verify hosts file contains tamshai.local entry
resource "null_resource" "hosts_file_check" {
  provisioner "local-exec" {
    interpreter = ["powershell", "-Command"]
    command     = <<-EOT
      $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
      if (Test-Path $hostsPath) {
        $hosts = Get-Content $hostsPath -Raw
        if ($hosts -match "tamshai\.local") {
          Write-Host "✓ tamshai.local found in hosts file" -ForegroundColor Green
        } else {
          Write-Host "ERROR: tamshai.local not found in hosts file" -ForegroundColor Red
          Write-Host ""
          Write-Host "Please add the following entry to your hosts file:" -ForegroundColor Yellow
          Write-Host "  127.0.0.1  tamshai.local www.tamshai.local" -ForegroundColor Cyan
          Write-Host ""
          Write-Host "Run this command as Administrator:" -ForegroundColor Yellow
          Write-Host "  Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value '127.0.0.1  tamshai.local www.tamshai.local'" -ForegroundColor Cyan
          exit 1
        }
      } else {
        Write-Host "WARNING: Could not find hosts file at $hostsPath" -ForegroundColor Yellow
      }
    EOT
  }
}

# =============================================================================
# ENVIRONMENT FILE GENERATION
# =============================================================================

resource "local_file" "docker_env" {
  filename = local.env_file
  content = templatefile("${path.module}/templates/docker.env.tftpl", {
    # Database credentials
    postgres_password    = var.postgres_password
    tamshai_db_password  = var.tamshai_db_password
    keycloak_db_password = var.keycloak_db_password
    mongodb_password     = var.mongodb_root_password

    # Keycloak
    keycloak_admin          = "admin"
    keycloak_admin_password = var.keycloak_admin_password

    # MinIO
    minio_root_user     = var.minio_root_user
    minio_root_password = var.minio_root_password

    # Redis
    redis_password = var.redis_password

    # MCP Gateway
    claude_api_key = var.claude_api_key

    # Environment
    environment = var.environment

    # User passwords (from GitHub Secrets via TF_VAR_*)
    dev_user_password  = var.dev_user_password
    test_user_password = var.test_user_password
  })

  file_permission = "0600"
}

# =============================================================================
# DOCKER COMPOSE INFRASTRUCTURE
# =============================================================================

# Start Docker Compose services
resource "null_resource" "docker_compose_up" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [local_file.docker_env, null_resource.hosts_file_check]

  triggers = {
    env_file_hash = local_file.docker_env.content
    compose_dir   = local.compose_path
    project_name  = var.docker_compose_project
    always_run    = timestamp() # Always run on apply
  }

  provisioner "local-exec" {
    command     = "docker compose up -d"
    working_dir = local.compose_path
    environment = {
      COMPOSE_PROJECT_NAME = var.docker_compose_project
    }
  }
}

# Wait for services to be healthy
resource "null_resource" "wait_for_services" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [null_resource.docker_compose_up]

  provisioner "local-exec" {
    command = <<-EOT
      echo "Waiting for services to be healthy..."

      # Wait for PostgreSQL
      for i in {1..30}; do
        if docker exec tamshai-postgres pg_isready -U postgres > /dev/null 2>&1; then
          echo "PostgreSQL ready!"
          break
        fi
        echo "Waiting for PostgreSQL... ($i/30)"
        sleep 2
      done

      # Wait for Keycloak
      for i in {1..60}; do
        if curl -sf http://localhost:8180/health/ready > /dev/null 2>&1; then
          echo "Keycloak ready!"
          break
        fi
        echo "Waiting for Keycloak... ($i/60)"
        sleep 2
      done

      # Wait for Kong
      for i in {1..30}; do
        if curl -sf http://localhost:8100 > /dev/null 2>&1; then
          echo "Kong ready!"
          break
        fi
        echo "Waiting for Kong... ($i/30)"
        sleep 2
      done

      # Wait for MCP Gateway
      for i in {1..30}; do
        if curl -sf http://localhost:3100/health > /dev/null 2>&1; then
          echo "MCP Gateway ready!"
          break
        fi
        echo "Waiting for MCP Gateway... ($i/30)"
        sleep 2
      done

      # Wait for Caddy (HTTPS proxy)
      for i in {1..30}; do
        if curl -sf -k https://localhost > /dev/null 2>&1; then
          echo "Caddy HTTPS ready!"
          break
        fi
        echo "Waiting for Caddy... ($i/30)"
        sleep 2
      done

      echo "All critical services are healthy!"
      echo ""
      echo "Access your dev environment at: https://www.tamshai.local"
      echo "(Accept the self-signed certificate warning in your browser)"
    EOT
  }
}

# =============================================================================
# KEYCLOAK REALM MANAGEMENT
# =============================================================================
#
# REMOVED: Terraform keycloak provider and module
#
# Keycloak realm is now managed via Docker's --import-realm flag for consistency
# across all environments (dev, stage, prod). The realm is loaded from:
#   - Dev/Stage: keycloak/realm-export-dev.json (includes test users)
#   - Production: keycloak/realm-export.json (no test users)
#
# This approach:
#   1. Ensures identical realm setup across all environments
#   2. Removes dependency on Terraform keycloak provider
#   3. Eliminates timing issues with provider initialization
#   4. Aligns with VPS deployment pattern
#
# To modify the realm:
#   1. Make changes in Keycloak admin UI
#   2. Export realm: Realm Settings > Action > Partial Export
#   3. Update keycloak/realm-export-dev.json or realm-export.json
#
# =============================================================================

# =============================================================================
# CLEANUP ON DESTROY
# =============================================================================

resource "null_resource" "docker_compose_down" {
  count = var.auto_stop_services ? 1 : 0

  triggers = {
    compose_dir    = local.compose_path
    project_name   = var.docker_compose_project
    remove_volumes = var.auto_remove_volumes
  }

  provisioner "local-exec" {
    when        = destroy
    command     = try(self.triggers.remove_volumes, "true") == "true" ? "docker compose down -v" : "docker compose down"
    working_dir = self.triggers.compose_dir
    environment = {
      COMPOSE_PROJECT_NAME = self.triggers.project_name
    }
  }
}
