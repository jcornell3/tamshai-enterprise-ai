# Enable Loopback Exemption for Tamshai AI Windows App
#
# UWP apps are sandboxed and cannot access localhost by default.
# This script adds a loopback exemption to allow the app to connect
# to local development servers (MCP Gateway on port 3100).
#
# Run this script as Administrator after deploying the app.
#
# Usage:
#   1. Open PowerShell as Administrator
#   2. Run: .\enable-loopback.ps1
#
# Note: You may need to re-run this after app updates or reinstalls.

$ErrorActionPreference = "Stop"

Write-Host "Enabling loopback exemption for Tamshai AI..." -ForegroundColor Cyan

# Get the package family name for our app
$packageFamilyName = "TamshaiAiUnified_jcorn"

# First, check if the app is installed
$package = Get-AppxPackage -Name "TamshaiAiUnified" -ErrorAction SilentlyContinue

if ($package) {
    $packageFamilyName = $package.PackageFamilyName
    Write-Host "Found installed app: $packageFamilyName" -ForegroundColor Green
} else {
    Write-Host "App not found in installed packages. Using default name: $packageFamilyName" -ForegroundColor Yellow
    Write-Host "If this doesn't work, find the correct PackageFamilyName with:" -ForegroundColor Yellow
    Write-Host "  Get-AppxPackage | Where-Object { `$_.Name -like '*Tamshai*' }" -ForegroundColor Gray
}

# Add loopback exemption using CheckNetIsolation
Write-Host ""
Write-Host "Adding loopback exemption..." -ForegroundColor Cyan

try {
    $result = CheckNetIsolation.exe LoopbackExempt -a -n="$packageFamilyName" 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully added loopback exemption!" -ForegroundColor Green
    } else {
        Write-Host "CheckNetIsolation returned: $result" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error running CheckNetIsolation: $_" -ForegroundColor Red
    exit 1
}

# Verify the exemption was added
Write-Host ""
Write-Host "Current loopback exemptions:" -ForegroundColor Cyan
CheckNetIsolation.exe LoopbackExempt -s | Select-String -Pattern "Tamshai|tamshai" -Context 0,1

Write-Host ""
Write-Host "Done! You may need to restart the app for changes to take effect." -ForegroundColor Green
Write-Host ""
Write-Host "To test connectivity, the app should now be able to reach:" -ForegroundColor Cyan
Write-Host "  - MCP Gateway: http://localhost:3100" -ForegroundColor Gray
Write-Host "  - Keycloak:    http://localhost:8180" -ForegroundColor Gray
