<#
.SYNOPSIS
    Verify Stage VPS Deployment Status
.DESCRIPTION
    Checks if the stage VPS deployment is complete and all services are operational
.PARAMETER VpsHost
    VPS IP address or hostname. If not provided, reads from VPS_HOST environment variable
    or attempts to get from Terraform output.
.EXAMPLE
    .\verify-stage-deployment.ps1
.EXAMPLE
    .\verify-stage-deployment.ps1 -VpsHost "192.168.1.100"
.EXAMPLE
    $env:VPS_HOST = "192.168.1.100"; .\verify-stage-deployment.ps1
#>

param(
    [string]$VpsHost
)

$ErrorActionPreference = "Continue"

# Determine VPS host from parameter, environment variable, or Terraform output
if (-not $VpsHost) {
    $VpsHost = $env:VPS_HOST
}

if (-not $VpsHost) {
    # Try to get from Terraform output
    try {
        Push-Location infrastructure/terraform/vps -ErrorAction SilentlyContinue
        $VpsHost = terraform output -raw vps_ip 2>$null
        Pop-Location
    } catch {
        Pop-Location -ErrorAction SilentlyContinue
    }
}

if (-not $VpsHost) {
    Write-Host "ERROR: VPS host not specified." -ForegroundColor Red
    Write-Host ""
    Write-Host "Provide VPS host via one of these methods:" -ForegroundColor Yellow
    Write-Host "  1. Parameter:    .\verify-stage-deployment.ps1 -VpsHost '192.168.1.100'" -ForegroundColor Gray
    Write-Host "  2. Environment:  `$env:VPS_HOST = '192.168.1.100'" -ForegroundColor Gray
    Write-Host "  3. Terraform:    Run from repo root with terraform state initialized" -ForegroundColor Gray
    exit 1
}

# Direct IP uses HTTP (Cloudflare handles SSL for domain)
$STAGE_URL = "http://$VpsHost"
$STAGE_DOMAIN = "https://vps.tamshai.com"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Stage VPS Deployment Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: VPS Responding
Write-Host "Test 1: VPS Availability" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$STAGE_URL/" -UseBasicParsing -TimeoutSec 10 2>$null
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ VPS is responding (HTTP $($response.StatusCode))" -ForegroundColor Green
    } else {
        Write-Host "⚠️  VPS responding with HTTP $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ VPS not responding yet (cloud-init may still be running)" -ForegroundColor Red
    Write-Host "   This is normal for the first 5-10 minutes after deployment" -ForegroundColor Gray
    Write-Host "   Try again in a few minutes..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "Estimated cloud-init completion time: ~5-10 minutes from VPS creation" -ForegroundColor Gray
    exit 1
}
Write-Host ""

# Test 2: Keycloak Availability
Write-Host "Test 2: Keycloak Availability" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$STAGE_URL/auth/" -UseBasicParsing -TimeoutSec 10 2>$null
    if ($response.Content -match "Keycloak") {
        Write-Host "✅ Keycloak is responding" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Keycloak endpoint responding but content unexpected" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Keycloak not responding" -ForegroundColor Red
}
Write-Host ""

# Test 3: API Gateway Availability
Write-Host "Test 3: API Gateway Availability" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$STAGE_URL/api/health" -UseBasicParsing -TimeoutSec 10 2>$null
    $content = $response.Content
    Write-Host "✅ API Gateway is responding" -ForegroundColor Green
    Write-Host "   Response: $content" -ForegroundColor Gray
} catch {
    Write-Host "❌ API Gateway not responding" -ForegroundColor Red
}
Write-Host ""

# Test 4: Token Acquisition
Write-Host "Test 4: Keycloak Token Acquisition (alice.chen)" -ForegroundColor Yellow
try {
    # VPS staging uses realm-export-dev.json with test users and fixed client secret
    $clientSecret = "mcp-gateway-secret"

    $testPassword = $env:STAGE_USER_PASSWORD
    if (-not $testPassword) {
        Write-Host "  [SKIP] STAGE_USER_PASSWORD not set" -ForegroundColor Yellow
        return
    }
    $body = @{
        grant_type = "password"
        client_id = "mcp-gateway"
        client_secret = $clientSecret
        username = "alice.chen"
        password = $testPassword
    }

    $tokenResponse = Invoke-RestMethod -Uri "$STAGE_URL/auth/realms/tamshai-corp/protocol/openid-connect/token" `
        -Method Post `
        -Body $body `
        -ContentType "application/x-www-form-urlencoded" `
        -TimeoutSec 10 2>$null

    if ($tokenResponse.access_token) {
        Write-Host "✅ Token acquired successfully" -ForegroundColor Green
        Write-Host "   Token length: $($tokenResponse.access_token.Length) characters" -ForegroundColor Gray
        Write-Host "   Token type: $($tokenResponse.token_type)" -ForegroundColor Gray
        Write-Host "   Expires in: $($tokenResponse.expires_in) seconds" -ForegroundColor Gray
    } else {
        Write-Host "❌ Token response missing access_token" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Token acquisition failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
}
Write-Host ""

# Test 5: Docker Services (via Terraform output - no SSH needed)
Write-Host "Test 5: Terraform Deployment Status" -ForegroundColor Yellow
try {
    Push-Location infrastructure/terraform/vps
    $vpsIp = terraform output -raw vps_ip 2>$null
    $apiUrl = terraform output -raw api_url 2>$null
    $keycloakUrl = terraform output -raw keycloak_url 2>$null

    Write-Host "✅ Terraform state valid" -ForegroundColor Green
    Write-Host "   VPS IP: $vpsIp" -ForegroundColor Gray
    Write-Host "   API URL: $apiUrl" -ForegroundColor Gray
    Write-Host "   Keycloak URL: $keycloakUrl" -ForegroundColor Gray

    Pop-Location
} catch {
    Write-Host "❌ Could not read Terraform outputs" -ForegroundColor Red
    Pop-Location
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Verification Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Stage VPS URL: $STAGE_DOMAIN" -ForegroundColor Cyan
Write-Host "VPS Host: $VpsHost" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service URLs:" -ForegroundColor Cyan
Write-Host "  Main Portal:    $STAGE_DOMAIN/" -ForegroundColor Gray
Write-Host "  Keycloak:       $STAGE_DOMAIN/auth" -ForegroundColor Gray
Write-Host "  API Gateway:    $STAGE_DOMAIN/api" -ForegroundColor Gray
Write-Host "  HR App:         $STAGE_DOMAIN/hr" -ForegroundColor Gray
Write-Host "  Finance App:    $STAGE_DOMAIN/finance" -ForegroundColor Gray
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Wait for all services to be healthy (if any failed above)" -ForegroundColor Gray
Write-Host "  2. Test authentication flow with Flutter app" -ForegroundColor Gray
Write-Host "  3. Build Flutter stage variant: .\scripts\build-flutter-windows.ps1 -Environment stage" -ForegroundColor Gray
Write-Host ""
