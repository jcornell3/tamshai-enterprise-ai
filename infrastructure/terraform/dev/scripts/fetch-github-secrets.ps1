# =============================================================================
# Fetch GitHub Secrets for Terraform (Environment-Specific)
# =============================================================================
#
# This script is called by Terraform's external data source to fetch
# user passwords from GitHub Secrets based on the environment.
#
# Input (JSON from stdin):
#   { "environment": "dev" }  -> fetches DEV_USER_PASSWORD, TEST_USER_PASSWORD
#   { "environment": "stage" } -> fetches STAGE_USER_PASSWORD, TEST_USER_PASSWORD
#   { "environment": "prod" }  -> fetches PROD_USER_PASSWORD, TEST_USER_PASSWORD
#
# Output (JSON to stdout):
#   { "user_password": "value", "test_user_password": "value" }
#
# =============================================================================

$ErrorActionPreference = "SilentlyContinue"

# Read JSON input from stdin
$inputJson = [Console]::In.ReadToEnd()
$inputData = $inputJson | ConvertFrom-Json

$environment = $inputData.environment.ToUpper()

# Map environment to secret name
$userPasswordSecretName = "${environment}_USER_PASSWORD"
$testUserSecretName = "TEST_USER_PASSWORD"

# Build output object - defaults to empty
$output = @{
    "user_password" = ""
    "test_user_password" = ""
    "test_user_totp_secret_raw" = ""
    "gemini_api_key" = ""
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

    # Read environment-specific user password
    $userPwdFile = Join-Path $tempDir $userPasswordSecretName
    if (Test-Path $userPwdFile) {
        $output["user_password"] = (Get-Content $userPwdFile -Raw).Trim()
    }

    # Read test user password (same across all environments)
    $testPwdFile = Join-Path $tempDir $testUserSecretName
    if (Test-Path $testPwdFile) {
        $output["test_user_password"] = (Get-Content $testPwdFile -Raw).Trim()
    }

    # Read test user TOTP secret (raw format for Keycloak)
    $totpSecretFile = Join-Path $tempDir "TEST_USER_TOTP_SECRET_RAW"
    if (Test-Path $totpSecretFile) {
        $output["test_user_totp_secret_raw"] = (Get-Content $totpSecretFile -Raw).Trim()
    }

    # Read Gemini API key (for mcp-journey)
    $geminiKeyFile = Join-Path $tempDir "GEMINI_API_KEY"
    if (Test-Path $geminiKeyFile) {
        $output["gemini_api_key"] = (Get-Content $geminiKeyFile -Raw).Trim()
    }

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
