# =============================================================================
# Terraform Dev Environment - Main Configuration
# =============================================================================
#
# Full-stack Terraform for local Docker Compose development
# Mimics VPS/production structure but targets Docker Desktop
#
# Services Managed (23 total):
#   - Infrastructure: PostgreSQL, MongoDB, Redis, Elasticsearch, MinIO
#   - Identity: Keycloak (via keycloak module)
#   - API Gateway: Kong, Caddy
#   - MCP Servers: Gateway, HR, Finance, Sales, Support, Journey, Payroll, Tax (8)
#   - Web Apps: Portal, HR, Finance, Sales, Support, Payroll, Tax, Website (8)
#
# Usage:
#   cd infrastructure/terraform/dev
#   terraform init
#   terraform plan -var-file=dev.tfvars
#   terraform apply -var-file=dev.tfvars
#
# Created: 2025-12-30
# Updated: 2026-02-02 - Added Payroll and Tax modules
# =============================================================================

# =============================================================================
# LOCALS
# =============================================================================

locals {
  compose_path = "${var.project_root}/${var.docker_compose_dir}"
  env_file     = "${local.compose_path}/.env"

  # Port configuration from GitHub Variables (with defaults)
  ports = {
    # Infrastructure
    caddy_http  = tonumber(data.external.github_variables.result.port_caddy_http)
    caddy_https = tonumber(data.external.github_variables.result.port_caddy_https)
    keycloak    = tonumber(data.external.github_variables.result.port_keycloak)
    kong_proxy  = tonumber(data.external.github_variables.result.port_kong_proxy)
    kong_admin  = tonumber(data.external.github_variables.result.port_kong_admin)
    vault       = tonumber(data.external.github_variables.result.port_vault)

    # Databases
    postgres      = tonumber(data.external.github_variables.result.port_postgres)
    mongodb       = tonumber(data.external.github_variables.result.port_mongodb)
    redis         = tonumber(data.external.github_variables.result.port_redis)
    elasticsearch = tonumber(data.external.github_variables.result.port_elasticsearch)
    minio_api     = tonumber(data.external.github_variables.result.port_minio_api)
    minio_console = tonumber(data.external.github_variables.result.port_minio_console)

    # MCP Services
    mcp_gateway = tonumber(data.external.github_variables.result.port_mcp_gateway)
    mcp_hr      = tonumber(data.external.github_variables.result.port_mcp_hr)
    mcp_finance = tonumber(data.external.github_variables.result.port_mcp_finance)
    mcp_sales   = tonumber(data.external.github_variables.result.port_mcp_sales)
    mcp_support = tonumber(data.external.github_variables.result.port_mcp_support)
    mcp_journey = tonumber(data.external.github_variables.result.port_mcp_journey)
    mcp_payroll = tonumber(data.external.github_variables.result.port_mcp_payroll)
    mcp_tax     = tonumber(data.external.github_variables.result.port_mcp_tax)
    mcp_ui      = tonumber(data.external.github_variables.result.port_mcp_ui)

    # Web Apps
    web_portal           = tonumber(data.external.github_variables.result.port_web_portal)
    web_hr               = tonumber(data.external.github_variables.result.port_web_hr)
    web_finance          = tonumber(data.external.github_variables.result.port_web_finance)
    web_sales            = tonumber(data.external.github_variables.result.port_web_sales)
    web_support          = tonumber(data.external.github_variables.result.port_web_support)
    web_payroll          = tonumber(data.external.github_variables.result.port_web_payroll)
    web_tax              = tonumber(data.external.github_variables.result.port_web_tax)
    web_customer_support = tonumber(data.external.github_variables.result.port_web_customer_support)
    website              = tonumber(data.external.github_variables.result.port_website)
  }

  # Keycloak admin password (from GitHub secrets, fallback to variable)
  keycloak_admin_password = coalesce(
    try(data.external.github_secrets.result.keycloak_admin_password, ""),
    var.keycloak_admin_password
  )

  # Service URLs for outputs (dynamically built from ports)
  services = {
    keycloak = {
      url  = "http://localhost:${local.ports.keycloak}/auth"
      port = local.ports.keycloak
    }
    kong_proxy = {
      url  = "http://localhost:${local.ports.kong_proxy}"
      port = local.ports.kong_proxy
    }
    kong_admin = {
      url  = "http://localhost:${local.ports.kong_admin}"
      port = local.ports.kong_admin
    }
    mcp_gateway = {
      url  = "http://localhost:${local.ports.mcp_gateway}"
      port = local.ports.mcp_gateway
    }
    mcp_hr = {
      url  = "http://localhost:${local.ports.mcp_hr}"
      port = local.ports.mcp_hr
    }
    mcp_finance = {
      url  = "http://localhost:${local.ports.mcp_finance}"
      port = local.ports.mcp_finance
    }
    mcp_sales = {
      url  = "http://localhost:${local.ports.mcp_sales}"
      port = local.ports.mcp_sales
    }
    mcp_support = {
      url  = "http://localhost:${local.ports.mcp_support}"
      port = local.ports.mcp_support
    }
    mcp_journey = {
      url  = "http://localhost:${local.ports.mcp_journey}"
      port = local.ports.mcp_journey
    }
    mcp_payroll = {
      url  = "http://localhost:${local.ports.mcp_payroll}"
      port = local.ports.mcp_payroll
    }
    mcp_tax = {
      url  = "http://localhost:${local.ports.mcp_tax}"
      port = local.ports.mcp_tax
    }
    web_portal = {
      url  = "http://localhost:${local.ports.web_portal}"
      port = local.ports.web_portal
    }
    web_hr = {
      url  = "http://localhost:${local.ports.web_hr}"
      port = local.ports.web_hr
    }
    web_finance = {
      url  = "http://localhost:${local.ports.web_finance}"
      port = local.ports.web_finance
    }
    web_sales = {
      url  = "http://localhost:${local.ports.web_sales}"
      port = local.ports.web_sales
    }
    web_support = {
      url  = "http://localhost:${local.ports.web_support}"
      port = local.ports.web_support
    }
    web_payroll = {
      url  = "http://localhost:${local.ports.web_payroll}"
      port = local.ports.web_payroll
    }
    web_tax = {
      url  = "http://localhost:${local.ports.web_tax}"
      port = local.ports.web_tax
    }
    website = {
      url  = "http://localhost:${local.ports.website}"
      port = local.ports.website
    }
    postgres = {
      url  = "postgresql://localhost:${local.ports.postgres}"
      port = local.ports.postgres
    }
    mongodb = {
      url  = "mongodb://localhost:${local.ports.mongodb}"
      port = local.ports.mongodb
    }
    redis = {
      url  = "redis://localhost:${local.ports.redis}"
      port = local.ports.redis
    }
    elasticsearch = {
      url  = "http://localhost:${local.ports.elasticsearch}"
      port = local.ports.elasticsearch
    }
    minio = {
      url  = "http://localhost:${local.ports.minio_api}"
      port = local.ports.minio_api
    }
    caddy = {
      url  = "https://localhost:${local.ports.caddy_https}"
      port = local.ports.caddy_https
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
# GITHUB SECRETS FETCH (Environment-Specific)
# =============================================================================
#
# Fetches user passwords from GitHub Secrets based on environment:
#   - dev   -> DEV_USER_PASSWORD, TEST_USER_PASSWORD
#   - stage -> STAGE_USER_PASSWORD, TEST_USER_PASSWORD
#   - prod  -> PROD_USER_PASSWORD, TEST_USER_PASSWORD
#
# =============================================================================

data "external" "github_secrets" {
  program = ["powershell", "-ExecutionPolicy", "Bypass", "-File", "${path.module}/scripts/fetch-github-secrets.ps1"]

  query = {
    environment = var.environment
  }
}

# =============================================================================
# GITHUB VARIABLES FETCH (Port Configuration)
# =============================================================================
#
# Fetches port configuration from GitHub Variables:
#   - DEV_KEYCLOAK, DEV_MCP_GATEWAY, etc.
#
# These are non-sensitive configuration values that can be changed without
# modifying Terraform code.
# =============================================================================

data "external" "github_variables" {
  program = ["powershell", "-ExecutionPolicy", "Bypass", "-File", "${path.module}/scripts/fetch-github-variables.ps1"]

  query = {
    environment = var.environment
  }
}

# =============================================================================
# GITHUB SECRETS VALIDATION
# =============================================================================
# All GitHub secrets are REQUIRED. Terraform will fail if any are missing.
# This ensures the environment is fully configured before deployment.
#
# Required secrets:
#   - DEV_USER_PASSWORD (or STAGE_USER_PASSWORD/PROD_USER_PASSWORD)
#   - TEST_USER_PASSWORD
#   - CLAUDE_API_KEY_DEV (or CLAUDE_API_KEY_STAGE/CLAUDE_API_KEY_PROD)
# =============================================================================

resource "null_resource" "validate_github_secrets" {
  lifecycle {
    precondition {
      condition     = length(data.external.github_secrets.result.user_password) > 0
      error_message = "GitHub secret ${upper(var.environment)}_USER_PASSWORD is required but not set. Run: gh secret set ${upper(var.environment)}_USER_PASSWORD --body '<password>'"
    }
    precondition {
      condition     = length(data.external.github_secrets.result.test_user_password) > 0
      error_message = "GitHub secret TEST_USER_PASSWORD is required but not set. Run: gh secret set TEST_USER_PASSWORD --body '<password>'"
    }
    precondition {
      condition     = length(data.external.github_secrets.result.claude_api_key) > 0
      error_message = "GitHub secret CLAUDE_API_KEY_${upper(var.environment)} is required but not set. Run: gh secret set CLAUDE_API_KEY_${upper(var.environment)} --body '<api-key>'"
    }
    # Database passwords (environment-specific)
    precondition {
      condition     = length(data.external.github_secrets.result.mongodb_password) > 0
      error_message = "GitHub secret MONGODB_${upper(var.environment)}_PASSWORD is required but not set. Run: gh secret set MONGODB_${upper(var.environment)}_PASSWORD --body '<password>'"
    }
    precondition {
      condition     = length(data.external.github_secrets.result.postgres_password) > 0
      error_message = "GitHub secret POSTGRES_${upper(var.environment)}_PASSWORD is required but not set. Run: gh secret set POSTGRES_${upper(var.environment)}_PASSWORD --body '<password>'"
    }
    precondition {
      condition     = length(data.external.github_secrets.result.tamshai_db_password) > 0
      error_message = "GitHub secret TAMSHAI_DB_${upper(var.environment)}_PASSWORD is required but not set. Run: gh secret set TAMSHAI_DB_${upper(var.environment)}_PASSWORD --body '<password>'"
    }
    precondition {
      condition     = length(data.external.github_secrets.result.keycloak_db_password) > 0
      error_message = "GitHub secret KEYCLOAK_DB_${upper(var.environment)}_PASSWORD is required but not set. Run: gh secret set KEYCLOAK_DB_${upper(var.environment)}_PASSWORD --body '<password>'"
    }
    precondition {
      condition     = length(data.external.github_secrets.result.redis_password) > 0
      error_message = "GitHub secret REDIS_${upper(var.environment)}_PASSWORD is required but not set. Run: gh secret set REDIS_${upper(var.environment)}_PASSWORD --body '<password>'"
    }
  }
}

# =============================================================================
# ENVIRONMENT FILE GENERATION
# =============================================================================

resource "local_file" "docker_env" {
  depends_on = [null_resource.validate_github_secrets]

  filename = local.env_file
  content = templatefile("${path.module}/templates/docker.env.tftpl", {
    # Database credentials (from GitHub secrets, environment-specific)
    postgres_password    = data.external.github_secrets.result.postgres_password
    tamshai_db_password  = data.external.github_secrets.result.tamshai_db_password
    keycloak_db_password = data.external.github_secrets.result.keycloak_db_password
    mongodb_password     = data.external.github_secrets.result.mongodb_password

    # Keycloak (from GitHub secrets, fallback to variable)
    keycloak_admin = "admin"
    keycloak_admin_password = coalesce(
      try(data.external.github_secrets.result.keycloak_admin_password, ""),
      var.keycloak_admin_password
    )

    # MinIO (from GitHub secrets, fallback to variable)
    minio_root_user = coalesce(
      try(data.external.github_secrets.result.minio_root_user, ""),
      var.minio_root_user
    )
    minio_root_password = coalesce(
      try(data.external.github_secrets.result.minio_root_password, ""),
      var.minio_root_password
    )

    # Redis
    redis_password = data.external.github_secrets.result.redis_password

    # Vault (from GitHub secrets, fallback to dev token)
    vault_dev_root_token = coalesce(
      try(data.external.github_secrets.result.vault_root_token, ""),
      "dev-root-token"
    )

    # MCP Gateway
    # Use fetched key from GitHub secrets (CLAUDE_API_KEY_DEV), fallback to variable
    # Note: coalesce fails on all-empty, so we provide "not-set" as final fallback
    claude_api_key = coalesce(
      data.external.github_secrets.result.claude_api_key,
      var.claude_api_key,
      "not-set"
    )

    # MCP Gateway additional secrets (use try to handle empty values)
    mcp_internal_secret           = try(data.external.github_secrets.result.mcp_internal_secret, "")
    mcp_gateway_client_secret     = try(data.external.github_secrets.result.mcp_gateway_client_secret, "")
    e2e_admin_api_key             = try(data.external.github_secrets.result.e2e_admin_api_key, "")
    elastic_password              = try(data.external.github_secrets.result.elastic_password, "")
    mcp_ui_client_secret          = try(data.external.github_secrets.result.mcp_ui_client_secret, "")
    mcp_hr_service_client_secret  = try(data.external.github_secrets.result.mcp_hr_service_client_secret, "")
    mcp_integration_runner_secret = try(data.external.github_secrets.result.mcp_integration_runner_secret, "")

    # MCP Journey (Project History Agent)
    # Use fetched key from GitHub secrets, fallback to variable
    # Empty string is valid (disables Gemini features)
    gemini_api_key = try(
      coalesce(data.external.github_secrets.result.gemini_api_key, var.gemini_api_key),
      ""
    )

    # Environment
    environment = var.environment

    # User passwords (from GitHub Secrets - environment-specific)
    dev_user_password      = data.external.github_secrets.result.user_password
    test_user_password     = data.external.github_secrets.result.test_user_password
    customer_user_password = try(data.external.github_secrets.result.customer_user_password, "")

    # Port configuration (from GitHub Variables)
    ports = local.ports
  })

  file_permission = "0600"
}

# =============================================================================
# DOCKER COMPOSE INFRASTRUCTURE
# =============================================================================

# Start Docker Compose services
resource "null_resource" "docker_compose_up" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [local_file.docker_env, null_resource.hosts_file_check, null_resource.validate_github_secrets]

  triggers = {
    env_file_hash = local_file.docker_env.content
    compose_dir   = local.compose_path
    project_name  = var.docker_compose_project
    always_run    = timestamp() # Always run on apply
  }

  provisioner "local-exec" {
    # First stop any existing containers and remove volumes to ensure clean state
    # Then rebuild all images (--no-cache ensures latest source files are used)
    # Finally start all services
    # This prevents race conditions and ensures Keycloak imports fresh realm config
    command     = "docker compose down -v --remove-orphans 2>/dev/null || true && docker compose build --no-cache && docker compose up -d"
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
        if docker exec tamshai-dev-postgres pg_isready -U postgres > /dev/null 2>&1; then
          echo "PostgreSQL ready!"
          break
        fi
        echo "Waiting for PostgreSQL... ($i/30)"
        sleep 2
      done

      # Wait for Keycloak (port ${local.ports.keycloak} for playground)
      for i in {1..60}; do
        if curl -sf http://localhost:${local.ports.keycloak}/health/ready > /dev/null 2>&1; then
          echo "Keycloak ready!"
          break
        fi
        echo "Waiting for Keycloak... ($i/60)"
        sleep 2
      done

      # Wait for Kong (port ${local.ports.kong_proxy} for playground)
      for i in {1..30}; do
        if curl -sf http://localhost:${local.ports.kong_proxy} > /dev/null 2>&1; then
          echo "Kong ready!"
          break
        fi
        echo "Waiting for Kong... ($i/30)"
        sleep 2
      done

      # Wait for MCP Gateway (port ${local.ports.mcp_gateway} for playground)
      for i in {1..30}; do
        if curl -sf http://localhost:${local.ports.mcp_gateway}/health > /dev/null 2>&1; then
          echo "MCP Gateway ready!"
          break
        fi
        echo "Waiting for MCP Gateway... ($i/30)"
        sleep 2
      done

      # Wait for Caddy (HTTPS proxy on port ${local.ports.caddy_https} for playground)
      for i in {1..30}; do
        if curl -sf -k https://localhost:${local.ports.caddy_https} > /dev/null 2>&1; then
          echo "Caddy HTTPS ready!"
          break
        fi
        echo "Waiting for Caddy... ($i/30)"
        sleep 2
      done

      echo "All critical services are healthy!"
      echo ""
      echo "Access your dev environment at: https://www.tamshai.local:${local.ports.caddy_https}"
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
# KEYCLOAK USER PASSWORD CONFIGURATION
# =============================================================================
#
# After Keycloak imports the realm from realm-export-dev.json, user passwords
# are placeholders. This resource sets actual passwords from GitHub Secrets.
#
# =============================================================================

resource "null_resource" "keycloak_set_passwords" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [null_resource.wait_for_services]

  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      echo "Setting Keycloak user passwords via REST API..."

      # Get admin token
      echo "Authenticating with Keycloak Admin API..."
      TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:${local.ports.keycloak}/auth/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin" \
        -d "password=${local.keycloak_admin_password}" \
        -d "grant_type=password" \
        -d "client_id=admin-cli")

      TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

      if [ -z "$TOKEN" ]; then
        echo "ERROR: Failed to get admin token"
        echo "Response: $TOKEN_RESPONSE"
        exit 1
      fi
      echo "✓ Admin token obtained"

      # Set test-user.journey password from TEST_USER_PASSWORD
      if [ -n "$TEST_USER_PASSWORD" ]; then
        echo "Setting test-user.journey password..."

        # Get user ID via REST API
        USER_ID=$(curl -s "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/users?username=test-user.journey&exact=true" \
          -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id // empty')

        if [ -n "$USER_ID" ]; then
          # Set password via REST API with jq for proper JSON encoding (handles special chars like @)
          PASSWORD_JSON=$(jq -n --arg pass "$TEST_USER_PASSWORD" '{"type":"password","value":$pass,"temporary":false}')
          HTTP_CODE=$(curl -s -o /dev/null -w "%%{http_code}" -X PUT \
            "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/users/$USER_ID/reset-password" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$PASSWORD_JSON")

          if [ "$HTTP_CODE" = "204" ]; then
            echo "✓ test-user.journey password set successfully"
          else
            echo "ERROR: Failed to set test-user.journey password (HTTP $HTTP_CODE)"
            exit 1
          fi
        else
          echo "WARNING: test-user.journey not found in Keycloak"
        fi
      else
        echo "WARNING: TEST_USER_PASSWORD not set - E2E tests will fail"
      fi

      # Set corporate user passwords from DEV_USER_PASSWORD
      if [ -n "$DEV_USER_PASSWORD" ]; then
        echo "Setting corporate user passwords..."

        # Get all users via REST API
        ALL_USERS=$(curl -s "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/users?max=500" \
          -H "Authorization: Bearer $TOKEN")

        # Build password JSON once (same for all corporate users)
        CORP_PASSWORD_JSON=$(jq -n --arg pass "$DEV_USER_PASSWORD" '{"type":"password","value":$pass,"temporary":false}')

        CORP_COUNT=0
        for row in $(echo "$ALL_USERS" | jq -r '.[] | @base64'); do
          USERNAME=$(echo "$row" | base64 -d | jq -r '.username')
          USERID=$(echo "$row" | base64 -d | jq -r '.id')

          # Skip test-user.journey (uses TEST_USER_PASSWORD)
          if [ "$USERNAME" != "test-user.journey" ] && [ -n "$USERID" ]; then
            HTTP_CODE=$(curl -s -o /dev/null -w "%%{http_code}" -X PUT \
              "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/users/$USERID/reset-password" \
              -H "Authorization: Bearer $TOKEN" \
              -H "Content-Type: application/json" \
              -d "$CORP_PASSWORD_JSON")

            if [ "$HTTP_CODE" = "204" ]; then
              CORP_COUNT=$((CORP_COUNT + 1))
            fi
          fi
        done

        echo "✓ $CORP_COUNT corporate user passwords set successfully"
      else
        echo "WARNING: DEV_USER_PASSWORD not set - corporate users will have placeholder passwords"
      fi

      echo "Keycloak password configuration complete!"
    EOT

    environment = {
      TEST_USER_PASSWORD = data.external.github_secrets.result.test_user_password
      DEV_USER_PASSWORD  = data.external.github_secrets.result.user_password
      MSYS_NO_PATHCONV   = "1" # Prevent Git Bash from converting Unix paths to Windows paths
    }
  }
}

# =============================================================================
# KEYCLOAK TOTP CONFIGURATION
# =============================================================================
#
# Sets up TOTP for test-user.journey using the raw secret from GitHub Secrets.
# This ensures the TOTP matches the GitHub secret (TEST_USER_TOTP_SECRET_RAW)
# and E2E tests can use the corresponding BASE32 secret (TEST_USER_TOTP_SECRET).
#
# Keycloak's --import-realm doesn't reliably import OTP credentials, so we
# provision TOTP via the Admin API after Keycloak starts.
#
# =============================================================================

resource "null_resource" "keycloak_set_totp" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [null_resource.keycloak_set_passwords]

  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      echo "Configuring TOTP for test-user.journey..."

      if [ -z "$TEST_USER_TOTP_SECRET_RAW" ]; then
        echo "WARNING: TEST_USER_TOTP_SECRET_RAW not set - TOTP will be auto-captured by E2E tests"
        exit 0
      fi

      # Get admin token
      echo "Getting admin token..."
      TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:${local.ports.keycloak}/auth/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin" \
        -d "password=${local.keycloak_admin_password}" \
        -d "grant_type=password" \
        -d "client_id=admin-cli")

      TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

      if [ -z "$TOKEN" ]; then
        echo "ERROR: Failed to get admin token"
        echo "Response: $TOKEN_RESPONSE"
        exit 1
      fi

      # Get test-user.journey user ID
      echo "Finding test-user.journey..."
      USER_RESPONSE=$(curl -s "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/users?username=test-user.journey&exact=true" \
        -H "Authorization: Bearer $TOKEN")

      USER_ID=$(echo "$USER_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

      if [ -z "$USER_ID" ]; then
        echo "WARNING: test-user.journey not found in Keycloak"
        exit 0
      fi

      echo "User ID: $USER_ID"

      # Delete existing OTP credentials
      echo "Checking existing OTP credentials..."
      EXISTING_CREDS=$(curl -s "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/users/$USER_ID/credentials" \
        -H "Authorization: Bearer $TOKEN")

      for CRED_ID in $(echo "$EXISTING_CREDS" | grep -o '"id":"[^"]*"[^}]*"type":"otp"' | grep -o '"id":"[^"]*' | cut -d'"' -f4); do
        echo "Deleting existing OTP credential: $CRED_ID"
        curl -s -X DELETE "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/users/$USER_ID/credentials/$CRED_ID" \
          -H "Authorization: Bearer $TOKEN"
      done

      # Create new OTP credential with the known secret
      echo "Creating OTP credential with secret: $${TEST_USER_TOTP_SECRET_RAW:0:4}****"

      CREDENTIAL_JSON=$(cat <<EOF
{
  "type": "otp",
  "userLabel": "Terraform Provisioned",
  "secretData": "{\"value\":\"$TEST_USER_TOTP_SECRET_RAW\"}",
  "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\",\"counter\":0}"
}
EOF
)

      HTTP_CODE=$(curl -s -o /dev/null -w "%%{http_code}" -X POST \
        "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/users/$USER_ID/credentials" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$CREDENTIAL_JSON")

      if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
        echo "✓ OTP credential created successfully (HTTP $HTTP_CODE)"
      else
        echo "WARNING: Direct credential creation returned HTTP $HTTP_CODE"
        echo "TOTP may need to be auto-captured by E2E tests"
      fi

      # Clear required actions to prevent TOTP setup prompt
      echo "Clearing required actions..."
      curl -s -X PUT \
        "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/users/$USER_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"requiredActions":[]}' > /dev/null

      echo "TOTP configuration complete!"
    EOT

    environment = {
      TEST_USER_TOTP_SECRET_RAW = data.external.github_secrets.result.test_user_totp_secret_raw
      MSYS_NO_PATHCONV          = "1"
    }
  }
}

# =============================================================================
# KEYCLOAK CUSTOMER REALM SYNC
# =============================================================================
#
# Syncs the tamshai-customers realm (roles, clients, groups, sample users)
# after Keycloak imports the realm from realm-export-customers-dev.json.
#
# =============================================================================

resource "null_resource" "keycloak_sync_customer_realm" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [null_resource.keycloak_set_passwords]

  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      echo "Syncing customer realm..."

      # Copy scripts into container
      docker cp "${var.project_root}/keycloak/scripts/sync-customer-realm.sh" tamshai-dev-keycloak:/tmp/sync-customer-realm.sh
      docker cp "${var.project_root}/keycloak/scripts/lib" tamshai-dev-keycloak:/tmp/lib

      # Fix line endings and permissions
      docker exec -u 0 tamshai-dev-keycloak bash -c '
        sed -i "s/\r$//" /tmp/sync-customer-realm.sh
        find /tmp/lib -name "*.sh" -exec sed -i "s/\r$//" {} \;
        chmod +x /tmp/sync-customer-realm.sh
        find /tmp/lib -name "*.sh" -exec chmod +x {} \;
      '

      # Run customer realm sync
      docker exec -e CUSTOMER_USER_PASSWORD="$CUSTOMER_USER_PASSWORD" \
        tamshai-dev-keycloak /tmp/sync-customer-realm.sh dev

      echo "Customer realm sync complete!"
    EOT

    environment = {
      CUSTOMER_USER_PASSWORD = try(data.external.github_secrets.result.customer_user_password, "")
      MSYS_NO_PATHCONV       = "1"
    }
  }
}

# =============================================================================
# KEYCLOAK CLIENT SECRET CONFIGURATION
# =============================================================================
#
# Updates Keycloak client secrets from GitHub Secrets after realm import.
# The realm-export-dev.json contains placeholder secrets that need to be
# replaced with actual values from GitHub Secrets.
#
# =============================================================================

resource "null_resource" "keycloak_set_client_secrets" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [null_resource.keycloak_set_totp]

  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      echo "Configuring Keycloak client secrets from GitHub Secrets..."

      # Get admin token
      echo "Getting admin token..."
      TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:${local.ports.keycloak}/auth/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin" \
        -d "password=${local.keycloak_admin_password}" \
        -d "grant_type=password" \
        -d "client_id=admin-cli")

      TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

      if [ -z "$TOKEN" ]; then
        echo "ERROR: Failed to get admin token"
        echo "Response: $TOKEN_RESPONSE"
        exit 1
      fi
      echo "✓ Admin token obtained"

      # Update mcp-ui client secret
      if [ -n "$MCP_UI_CLIENT_SECRET" ]; then
        echo "Updating mcp-ui client secret..."

        # Get client ID (internal UUID, not clientId)
        CLIENT_UUID=$(curl -s "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/clients?clientId=mcp-ui" \
          -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id // empty')

        if [ -n "$CLIENT_UUID" ]; then
          # Update client secret via REST API
          HTTP_CODE=$(curl -s -o /dev/null -w "%%{http_code}" -X POST \
            "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/clients/$CLIENT_UUID/client-secret" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json")

          if [ "$HTTP_CODE" = "200" ]; then
            # Now set the specific secret value
            SECRET_JSON=$(jq -n --arg secret "$MCP_UI_CLIENT_SECRET" '{"secret": $secret}')
            HTTP_CODE=$(curl -s -o /dev/null -w "%%{http_code}" -X PUT \
              "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/clients/$CLIENT_UUID" \
              -H "Authorization: Bearer $TOKEN" \
              -H "Content-Type: application/json" \
              -d "$SECRET_JSON")

            if [ "$HTTP_CODE" = "204" ]; then
              echo "✓ mcp-ui client secret updated successfully"
            else
              echo "WARNING: Failed to update mcp-ui client secret (HTTP $HTTP_CODE)"
            fi
          else
            echo "WARNING: Failed to regenerate mcp-ui client secret (HTTP $HTTP_CODE)"
          fi
        else
          echo "WARNING: mcp-ui client not found in Keycloak"
        fi
      else
        echo "WARNING: MCP_UI_CLIENT_SECRET not set - mcp-ui service auth will fail"
      fi

      # Update mcp-gateway client secret (if needed)
      if [ -n "$MCP_GATEWAY_CLIENT_SECRET" ]; then
        echo "Updating mcp-gateway client secret..."

        CLIENT_UUID=$(curl -s "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/clients?clientId=mcp-gateway" \
          -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id // empty')

        if [ -n "$CLIENT_UUID" ]; then
          SECRET_JSON=$(jq -n --arg secret "$MCP_GATEWAY_CLIENT_SECRET" '{"secret": $secret}')
          HTTP_CODE=$(curl -s -o /dev/null -w "%%{http_code}" -X PUT \
            "http://localhost:${local.ports.keycloak}/auth/admin/realms/tamshai-corp/clients/$CLIENT_UUID" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$SECRET_JSON")

          if [ "$HTTP_CODE" = "204" ]; then
            echo "✓ mcp-gateway client secret updated successfully"
          else
            echo "WARNING: Failed to update mcp-gateway client secret (HTTP $HTTP_CODE)"
          fi
        else
          echo "WARNING: mcp-gateway client not found in Keycloak"
        fi
      fi

      echo "Keycloak client secret configuration complete!"
    EOT

    environment = {
      MCP_UI_CLIENT_SECRET      = data.external.github_secrets.result.mcp_ui_client_secret
      MCP_GATEWAY_CLIENT_SECRET = data.external.github_secrets.result.mcp_gateway_client_secret
      MSYS_NO_PATHCONV          = "1"
    }
  }
}

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
