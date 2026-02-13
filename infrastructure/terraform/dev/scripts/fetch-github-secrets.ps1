# =============================================================================
# Fetch GitHub Secrets for Terraform (Environment-Specific)
# =============================================================================
#
# This script is called by Terraform's external data source to fetch
# secrets from GitHub Secrets based on the environment.
#
# Input (JSON from stdin):
#   { "environment": "dev" }   -> fetches DEV_* secrets
#   { "environment": "stage" } -> fetches STAGE_* secrets
#   { "environment": "prod" }  -> fetches PROD_* secrets
#
# Naming Convention:
#   All environment-specific secrets use PREFIX pattern: ${ENV}_SECRET_NAME
#   Examples: DEV_MCP_GATEWAY_CLIENT_SECRET, STAGE_POSTGRES_PASSWORD
#
# Output (JSON to stdout):
#   { "mcp_gateway_client_secret": "value", "postgres_password": "value", ... }
#
# =============================================================================

$ErrorActionPreference = "SilentlyContinue"

# Read JSON input from stdin
$inputJson = [Console]::In.ReadToEnd()
$inputData = $inputJson | ConvertFrom-Json

$environment = $inputData.environment.ToUpper()

# Build output object - defaults to empty
$output = @{
    # User passwords
    "user_password" = ""
    "test_user_password" = ""
    "test_user_totp_secret_raw" = ""
    # API keys
    "gemini_api_key" = ""
    "claude_api_key" = ""
    # Database passwords
    "mongodb_password" = ""
    "postgres_password" = ""
    "tamshai_db_password" = ""
    "keycloak_db_password" = ""
    "redis_password" = ""
    # Keycloak admin
    "keycloak_admin_password" = ""
    # MCP secrets
    "mcp_internal_secret" = ""
    "mcp_gateway_client_secret" = ""
    "mcp_ui_client_secret" = ""
    "mcp_hr_service_client_secret" = ""
    "mcp_integration_runner_secret" = ""
    # Customer portal
    "customer_user_password" = ""
    # Other service secrets
    "e2e_admin_api_key" = ""
    "elastic_password" = ""
    "minio_root_user" = ""
    "minio_root_password" = ""
    "vault_root_token" = ""
}

try {
    # Create temp directory
    $tempDir = Join-Path $env:TEMP "gh-secrets-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    # Trigger workflow that exports all secrets
    gh workflow run export-test-secrets.yml -f "secret_type=all" 2>&1 | Out-Null
    Start-Sleep -Seconds 5

    # Get latest run ID (retry a few times)
    $runId = $null
    for ($i = 0; $i -lt 5; $i++) {
        $runId = gh run list --workflow=export-test-secrets.yml --limit=1 --json databaseId -q '.[0].databaseId' 2>$null
        if ($runId) { break }
        Start-Sleep -Seconds 2
    }

    if (-not $runId) {
        throw "Could not find workflow run ID"
    }

    # Wait for completion (max 120 seconds)
    $completed = $false
    for ($i = 0; $i -lt 40; $i++) {
        $runInfo = gh run view $runId --json status,conclusion 2>$null | ConvertFrom-Json
        if ($runInfo.status -eq "completed") {
            if ($runInfo.conclusion -eq "success") {
                $completed = $true
            }
            break
        }
        Start-Sleep -Seconds 3
    }

    if (-not $completed) {
        throw "Workflow did not complete successfully"
    }

    # Download artifact
    gh run download $runId -n "secrets-export" -D $tempDir 2>&1 | Out-Null

    # Helper function to read secret with environment prefix
    function Get-EnvSecret {
        param([string]$SecretName)
        $file = Join-Path $tempDir "${environment}_${SecretName}"
        if (Test-Path $file) {
            return (Get-Content $file -Raw).Trim()
        }
        return ""
    }

    # Helper function to read global secret (no environment prefix)
    function Get-GlobalSecret {
        param([string]$SecretName)
        $file = Join-Path $tempDir $SecretName
        if (Test-Path $file) {
            return (Get-Content $file -Raw).Trim()
        }
        return ""
    }

    # =========================================================================
    # USER PASSWORDS (environment-specific)
    # =========================================================================
    $output["user_password"] = Get-EnvSecret "USER_PASSWORD"

    # Test user password (same across all environments)
    $output["test_user_password"] = Get-GlobalSecret "TEST_USER_PASSWORD"
    $output["test_user_totp_secret_raw"] = Get-GlobalSecret "TEST_USER_TOTP_SECRET_RAW"

    # =========================================================================
    # API KEYS (environment-specific)
    # =========================================================================
    $output["gemini_api_key"] = Get-EnvSecret "GEMINI_API_KEY"
    $output["claude_api_key"] = Get-EnvSecret "CLAUDE_API_KEY"

    # =========================================================================
    # DATABASE PASSWORDS (environment-specific)
    # =========================================================================
    $output["mongodb_password"] = Get-EnvSecret "MONGODB_PASSWORD"
    $output["postgres_password"] = Get-EnvSecret "POSTGRES_PASSWORD"
    $output["tamshai_db_password"] = Get-EnvSecret "TAMSHAI_DB_PASSWORD"
    $output["keycloak_db_password"] = Get-EnvSecret "KEYCLOAK_DB_PASSWORD"
    $output["redis_password"] = Get-EnvSecret "REDIS_PASSWORD"

    # =========================================================================
    # KEYCLOAK ADMIN (environment-specific)
    # =========================================================================
    $output["keycloak_admin_password"] = Get-EnvSecret "KEYCLOAK_ADMIN_PASSWORD"

    # =========================================================================
    # MCP SECRETS (environment-specific)
    # =========================================================================
    $output["mcp_internal_secret"] = Get-EnvSecret "MCP_INTERNAL_SECRET"
    $output["mcp_gateway_client_secret"] = Get-EnvSecret "MCP_GATEWAY_CLIENT_SECRET"
    $output["mcp_ui_client_secret"] = Get-EnvSecret "MCP_UI_CLIENT_SECRET"
    $output["mcp_hr_service_client_secret"] = Get-EnvSecret "MCP_HR_SERVICE_CLIENT_SECRET"
    $output["mcp_integration_runner_secret"] = Get-EnvSecret "MCP_INTEGRATION_RUNNER_SECRET"

    # =========================================================================
    # CUSTOMER PORTAL (global - same across all environments)
    # =========================================================================
    $output["customer_user_password"] = Get-GlobalSecret "CUSTOMER_USER_PASSWORD"

    # =========================================================================
    # OTHER SERVICE SECRETS (environment-specific)
    # =========================================================================
    $output["e2e_admin_api_key"] = Get-EnvSecret "E2E_ADMIN_API_KEY"
    $output["elastic_password"] = Get-EnvSecret "ELASTIC_PASSWORD"
    $output["minio_root_user"] = Get-EnvSecret "MINIO_ROOT_USER"
    $output["minio_root_password"] = Get-EnvSecret "MINIO_ROOT_PASSWORD"
    $output["vault_root_token"] = Get-EnvSecret "VAULT_ROOT_TOKEN"

    # Cleanup temp directory
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue

    # Delete the workflow run for security (don't fail if this fails)
    gh run delete $runId --yes 2>&1 | Out-Null

} catch {
    # On any error, return empty values (Terraform will use defaults)
    # Cleanup temp directory if it exists
    if ($tempDir -and (Test-Path $tempDir)) {
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    }
}

# Output JSON (must be valid JSON for Terraform external data source)
$output | ConvertTo-Json -Compress
