# =============================================================================
# Fetch GitHub Secrets for Terraform (Environment-Specific)
# =============================================================================
#
# This script is called by Terraform's external data source to fetch
# secrets from GitHub via the export-test-secrets.yml workflow.
#
# Input (JSON from stdin):
#   { "environment": "dev" }  -> fetches DEV_USER_PASSWORD, TEST_USER_PASSWORD, etc.
#   { "environment": "stage" } -> fetches STAGE_USER_PASSWORD, TEST_USER_PASSWORD, etc.
#   { "environment": "prod" }  -> fetches PROD_USER_PASSWORD, TEST_USER_PASSWORD, etc.
#
# Output (JSON to stdout):
#   { "user_password": "...", "test_user_password": "...", "gemini_api_key": "...", ... }
#
# On failure: exits non-zero with diagnostics on stderr. Terraform will abort.
# =============================================================================

$ErrorActionPreference = "Stop"

# Read JSON input from stdin
$inputJson = [Console]::In.ReadToEnd()
$inputData = $inputJson | ConvertFrom-Json

$environment = $inputData.environment.ToUpper()

# Map environment to secret name
$userPasswordSecretName = "${environment}_USER_PASSWORD"

# Required secrets that must be present in the downloaded artifact
$requiredSecrets = @(
    $userPasswordSecretName,
    "TEST_USER_PASSWORD",
    "TEST_USER_TOTP_SECRET_RAW",
    "GEMINI_API_KEY"
)

$tempDir = $null

try {
    # -------------------------------------------------------------------------
    # Step 1: Configure gh CLI authentication
    # -------------------------------------------------------------------------
    # Use JCORNELL_GH_TOKEN (repo owner) if available, as the default gh auth
    # may be a different account without admin rights to trigger workflows.
    if ($env:JCORNELL_GH_TOKEN) {
        $env:GH_TOKEN = $env:JCORNELL_GH_TOKEN
    }

    $ghStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        [Console]::Error.WriteLine("ERROR: gh CLI is not authenticated.")
        [Console]::Error.WriteLine($ghStatus)
        [Console]::Error.WriteLine("")
        [Console]::Error.WriteLine("Set JCORNELL_GH_TOKEN environment variable or run: gh auth login")
        exit 1
    }

    # -------------------------------------------------------------------------
    # Step 2: Trigger the export-test-secrets workflow
    # -------------------------------------------------------------------------
    $triggerOutput = gh workflow run export-test-secrets.yml -f "secret_type=all" 2>&1
    if ($LASTEXITCODE -ne 0) {
        [Console]::Error.WriteLine("ERROR: Failed to trigger export-test-secrets.yml workflow.")
        [Console]::Error.WriteLine("gh workflow run output: $triggerOutput")
        [Console]::Error.WriteLine("")
        [Console]::Error.WriteLine("Possible causes:")
        [Console]::Error.WriteLine("  - gh CLI account lacks admin/write access to the repository")
        [Console]::Error.WriteLine("  - The workflow file does not exist on the default branch")
        [Console]::Error.WriteLine("")
        [Console]::Error.WriteLine("Current gh account:")
        gh auth status 2>&1 | ForEach-Object { [Console]::Error.WriteLine("  $_") }
        exit 1
    }

    Start-Sleep -Seconds 5

    # -------------------------------------------------------------------------
    # Step 3: Get the run ID of the workflow we just triggered
    # -------------------------------------------------------------------------
    $runId = $null
    for ($i = 0; $i -lt 10; $i++) {
        $runId = gh run list --workflow=export-test-secrets.yml --limit=1 --json databaseId -q '.[0].databaseId' 2>&1
        if ($runId -and $LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 2
    }

    if (-not $runId) {
        [Console]::Error.WriteLine("ERROR: Could not find workflow run ID after triggering export-test-secrets.yml.")
        [Console]::Error.WriteLine("The workflow may not have been created. Check GitHub Actions manually.")
        exit 1
    }

    # -------------------------------------------------------------------------
    # Step 4: Wait for the workflow to complete (max ~120 seconds)
    # -------------------------------------------------------------------------
    $completed = $false
    for ($i = 0; $i -lt 40; $i++) {
        $runInfoRaw = gh run view $runId --json status,conclusion 2>&1
        if ($LASTEXITCODE -ne 0) {
            [Console]::Error.WriteLine("ERROR: Failed to check workflow run status (run ID: $runId).")
            [Console]::Error.WriteLine("Output: $runInfoRaw")
            exit 1
        }
        $runInfo = $runInfoRaw | ConvertFrom-Json
        if ($runInfo.status -eq "completed") {
            if ($runInfo.conclusion -eq "success") {
                $completed = $true
            } else {
                [Console]::Error.WriteLine("ERROR: Workflow run $runId completed with conclusion: $($runInfo.conclusion)")
                [Console]::Error.WriteLine("Check the workflow logs: gh run view $runId --log")
                exit 1
            }
            break
        }
        Start-Sleep -Seconds 3
    }

    if (-not $completed) {
        [Console]::Error.WriteLine("ERROR: Workflow run $runId did not complete within 120 seconds.")
        [Console]::Error.WriteLine("Check status: gh run view $runId")
        exit 1
    }

    # -------------------------------------------------------------------------
    # Step 5: Download the artifact
    # -------------------------------------------------------------------------
    $tempDir = Join-Path $env:TEMP "gh-secrets-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    $dlOutput = gh run download $runId -n "secrets-export" -D $tempDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        [Console]::Error.WriteLine("ERROR: Failed to download secrets-export artifact from run $runId.")
        [Console]::Error.WriteLine("Download output: $dlOutput")
        [Console]::Error.WriteLine("")
        [Console]::Error.WriteLine("Possible causes:")
        [Console]::Error.WriteLine("  - Artifact expired (1-day retention)")
        [Console]::Error.WriteLine("  - Workflow produced no artifact")
        [Console]::Error.WriteLine("  - Picked up a stale (old) run ID instead of the one we triggered")
        exit 1
    }

    # -------------------------------------------------------------------------
    # Step 6: Validate required secrets are present
    # -------------------------------------------------------------------------
    $missingSecrets = @()
    foreach ($secretName in $requiredSecrets) {
        $secretFile = Join-Path $tempDir $secretName
        if (-not (Test-Path $secretFile)) {
            $missingSecrets += $secretName
        } else {
            $content = (Get-Content $secretFile -Raw).Trim()
            if ([string]::IsNullOrWhiteSpace($content)) {
                $missingSecrets += "$secretName (file exists but empty)"
            }
        }
    }

    if ($missingSecrets.Count -gt 0) {
        [Console]::Error.WriteLine("ERROR: Required GitHub secrets are missing or empty:")
        foreach ($s in $missingSecrets) {
            [Console]::Error.WriteLine("  - $s")
        }
        [Console]::Error.WriteLine("")
        [Console]::Error.WriteLine("Ensure these secrets are configured in GitHub:")
        [Console]::Error.WriteLine("  https://github.com/jcornell3/tamshai-enterprise-ai/settings/secrets/actions")
        [Console]::Error.WriteLine("")
        [Console]::Error.WriteLine("Files found in artifact:")
        Get-ChildItem $tempDir | ForEach-Object { [Console]::Error.WriteLine("  - $($_.Name)") }
        exit 1
    }

    # -------------------------------------------------------------------------
    # Step 7: Build output JSON
    # -------------------------------------------------------------------------
    $output = @{
        "user_password"             = ""
        "test_user_password"        = ""
        "test_user_totp_secret_raw" = ""
        "gemini_api_key"            = ""
    }

    # Read environment-specific user password
    $userPwdFile = Join-Path $tempDir $userPasswordSecretName
    if (Test-Path $userPwdFile) {
        $output["user_password"] = (Get-Content $userPwdFile -Raw).Trim()
    }

    # Read test user password
    $testPwdFile = Join-Path $tempDir "TEST_USER_PASSWORD"
    if (Test-Path $testPwdFile) {
        $output["test_user_password"] = (Get-Content $testPwdFile -Raw).Trim()
    }

    # Read test user TOTP secret (raw format for Keycloak)
    $totpSecretFile = Join-Path $tempDir "TEST_USER_TOTP_SECRET_RAW"
    if (Test-Path $totpSecretFile) {
        $output["test_user_totp_secret_raw"] = (Get-Content $totpSecretFile -Raw).Trim()
    }

    # Read Gemini API key
    $geminiKeyFile = Join-Path $tempDir "GEMINI_API_KEY"
    if (Test-Path $geminiKeyFile) {
        $output["gemini_api_key"] = (Get-Content $geminiKeyFile -Raw).Trim()
    }

    # -------------------------------------------------------------------------
    # Step 8: Cleanup
    # -------------------------------------------------------------------------
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    $tempDir = $null

    # Delete the workflow run for security (best-effort, don't fail on error)
    try { gh run delete $runId 2>&1 | Out-Null } catch {}

    # -------------------------------------------------------------------------
    # Output JSON for Terraform
    # -------------------------------------------------------------------------
    $output | ConvertTo-Json -Compress

} catch {
    # Cleanup temp directory if it exists
    if ($tempDir -and (Test-Path $tempDir)) {
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    }

    [Console]::Error.WriteLine("ERROR: Unhandled exception in fetch-github-secrets.ps1")
    [Console]::Error.WriteLine("  Exception: $($_.Exception.Message)")
    [Console]::Error.WriteLine("  Location:  $($_.InvocationInfo.PositionMessage)")
    exit 1
}
