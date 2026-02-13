# =============================================================================
# Terraform DEV Environment Variables Setup
# =============================================================================
#
# ⚠️ DEV ENVIRONMENT ONLY - DO NOT USE FOR CI/STAGE/PROD ⚠️
#
# This script sets up Windows environment variables for LOCAL DEVELOPMENT ONLY.
# It configures variables for both current Keycloak management and future
# full-stack expansion.
#
# Environment: DEV (Local Docker)
# Usage: .\scripts\setup-terraform-dev-env.ps1
#
# What this sets:
#   - Development-only passwords (hardcoded, insecure)
#   - Your personal Claude API key (for local testing)
#   - Credentials matching infrastructure/docker/.env.example
#
# Other Environments:
#   - CI: Uses GitHub Secrets (set in .github/workflows/ci.yml)
#   - Stage: Uses environment variables on VPS
#   - Prod: Uses GCP Secret Manager (never hardcoded)
#
# Notes:
#   - Variables are stored in Windows User environment (persist across sessions)
#   - You MUST restart your terminal after running this script
#   - Your Claude API key is for DEV testing only
#   - DO NOT commit these values to git
#
# Created: 2025-12-30
# Author: Tamshai QA Team
# =============================================================================

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "  Terraform DEV Environment Setup (Local Development Only)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "WARNING: This sets DEV environment variables only!" -ForegroundColor Yellow
Write-Host "Your Claude API key will be used for local testing." -ForegroundColor Yellow
Write-Host ""

# Function to set environment variable with confirmation
function Set-TerraformVar {
    param(
        [string]$Name,
        [string]$Value,
        [string]$Description,
        [bool]$Required = $true,
        [bool]$Sensitive = $false
    )

    $displayValue = if ($Sensitive) { "***" } else { $Value }

    Write-Host "Setting: $Name" -ForegroundColor Yellow
    Write-Host "  Description: $Description" -ForegroundColor Gray
    Write-Host "  Value: $displayValue" -ForegroundColor Gray

    [Environment]::SetEnvironmentVariable($Name, $Value, "User")

    if ($Required) {
        Write-Host "  Status: Required - Set" -ForegroundColor Green
    } else {
        Write-Host "  Status: Optional - Set" -ForegroundColor Cyan
    }
    Write-Host ""
}

Write-Host "SECTION 1: Keycloak Configuration (Required Now)" -ForegroundColor Magenta
Write-Host "------------------------------------------------------" -ForegroundColor Magenta
Write-Host ""

Set-TerraformVar `
    -Name "TF_VAR_keycloak_admin_password" `
    -Value "admin" `
    -Description "Keycloak admin password (dev only)" `
    -Required $true `
    -Sensitive $true

# test_user_password must be set via TEST_USER_PASSWORD environment variable
# This is used for test-user.journey E2E account
if ($env:TEST_USER_PASSWORD) {
    Set-TerraformVar `
        -Name "TF_VAR_test_user_password" `
        -Value $env:TEST_USER_PASSWORD `
        -Description "Password for test-user.journey E2E account" `
        -Required $true `
        -Sensitive $true
} else {
    Write-Host "WARNING: TEST_USER_PASSWORD not set - TF_VAR_test_user_password will not be configured" -ForegroundColor Yellow
    Write-Host "  E2E tests will fail without this password" -ForegroundColor Gray
}

# dev_user_password must be set via DEV_USER_PASSWORD environment variable
# This is used for corporate users (eve.thompson, alice.chen, etc.)
if ($env:DEV_USER_PASSWORD) {
    Set-TerraformVar `
        -Name "TF_VAR_dev_user_password" `
        -Value $env:DEV_USER_PASSWORD `
        -Description "Password for corporate users (eve.thompson, etc.)" `
        -Required $true `
        -Sensitive $true
} else {
    Write-Host "WARNING: DEV_USER_PASSWORD not set - TF_VAR_dev_user_password will not be configured" -ForegroundColor Yellow
    Write-Host "  Corporate users will have placeholder passwords" -ForegroundColor Gray
}

Set-TerraformVar `
    -Name "TF_VAR_mcp_gateway_client_secret" `
    -Value "test-client-secret" `
    -Description "MCP Gateway OAuth client secret" `
    -Required $true `
    -Sensitive $true

Write-Host "SECTION 2: Database Credentials (For Future Full-Stack)" -ForegroundColor Magenta
Write-Host "------------------------------------------------------" -ForegroundColor Magenta
Write-Host ""

Set-TerraformVar `
    -Name "TF_VAR_postgres_password" `
    -Value "postgres_password" `
    -Description "PostgreSQL superuser password" `
    -Required $false `
    -Sensitive $true

Set-TerraformVar `
    -Name "TF_VAR_tamshai_db_password" `
    -Value "tamshai_password" `
    -Description "Tamshai application database user password" `
    -Required $false `
    -Sensitive $true

Set-TerraformVar `
    -Name "TF_VAR_mongodb_root_password" `
    -Value "tamshai_password" `
    -Description "MongoDB root password" `
    -Required $false `
    -Sensitive $true

Write-Host "SECTION 3: Storage and Cache Credentials (For Future Full-Stack)" -ForegroundColor Magenta
Write-Host "------------------------------------------------------" -ForegroundColor Magenta
Write-Host ""

Set-TerraformVar `
    -Name "TF_VAR_minio_root_user" `
    -Value "minioadmin" `
    -Description "MinIO root username (S3-compatible storage)" `
    -Required $false `
    -Sensitive $false

Set-TerraformVar `
    -Name "TF_VAR_minio_root_password" `
    -Value "minioadmin" `
    -Description "MinIO root password" `
    -Required $false `
    -Sensitive $true

Set-TerraformVar `
    -Name "TF_VAR_redis_password" `
    -Value "redis_password" `
    -Description "Redis AUTH password (token cache)" `
    -Required $false `
    -Sensitive $true

Write-Host "SECTION 4: Claude API Key (Required)" -ForegroundColor Magenta
Write-Host "------------------------------------------------------" -ForegroundColor Magenta
Write-Host ""

# Prompt for Claude API key
Write-Host "Enter your Claude API Key from https://console.anthropic.com/settings/keys" -ForegroundColor Yellow
Write-Host "Format: sk-ant-api03-..." -ForegroundColor Gray
Write-Host "(Press Enter to skip - you can set this manually later)" -ForegroundColor Gray
Write-Host ""

$claudeKey = Read-Host "Claude API Key" -AsSecureString
$claudeKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($claudeKey)
)

if ($claudeKeyPlain -and $claudeKeyPlain.Length -gt 0) {
    Set-TerraformVar `
        -Name "TF_VAR_claude_api_key" `
        -Value $claudeKeyPlain `
        -Description "Claude API key for MCP Gateway" `
        -Required $true `
        -Sensitive $true
} else {
    Write-Host "Skipped: TF_VAR_claude_api_key" -ForegroundColor Yellow
    Write-Host "  You can set this later with:" -ForegroundColor Gray
    Write-Host '  setx TF_VAR_claude_api_key "sk-ant-api03-..."' -ForegroundColor Gray
    Write-Host ""
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. RESTART YOUR TERMINAL for changes to take effect" -ForegroundColor White
Write-Host "  2. Verify variables: Get-ChildItem Env:TF_VAR_*" -ForegroundColor White
Write-Host "  3. Run Terraform: cd infrastructure/terraform/keycloak" -ForegroundColor White
Write-Host "  4. Test deployment: terraform plan -var-file=environments\dev.tfvars" -ForegroundColor White
Write-Host ""

Write-Host "Current Terraform Variables:" -ForegroundColor Cyan
Write-Host "-----------------------------------------------------" -ForegroundColor Cyan

# Verify and display (mask sensitive values)
$tfVars = Get-ChildItem Env:TF_VAR_* | Sort-Object Name

foreach ($var in $tfVars) {
    $displayValue = if ($var.Name -match "password|secret|key") {
        "***" + $var.Value.Substring([Math]::Max(0, $var.Value.Length - 4))
    } else {
        $var.Value
    }

    Write-Host "  $($var.Name) = $displayValue" -ForegroundColor Gray
}

Write-Host ""
Write-Host "SECURITY REMINDER:" -ForegroundColor Red
Write-Host "  - These are DEVELOPMENT ONLY credentials" -ForegroundColor Yellow
Write-Host "  - DO NOT use these passwords in production" -ForegroundColor Yellow
Write-Host "  - For production, use GCP Secret Manager" -ForegroundColor Yellow
Write-Host ""

Write-Host "Documentation:" -ForegroundColor Cyan
Write-Host "  - Terraform Guide: infrastructure/terraform/keycloak/TERRAFORM_KEYCLOAK_DEPLOYMENT.md" -ForegroundColor Gray
Write-Host "  - Full-Stack Plan: docs/action-items/terraform-dev-full-stack.md" -ForegroundColor Gray
Write-Host "  - Environment Vars: infrastructure/docker/.env.example" -ForegroundColor Gray
Write-Host ""

# Pause to let user read the output
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
