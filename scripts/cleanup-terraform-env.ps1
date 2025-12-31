# =============================================================================
# Terraform Environment Variables Cleanup
# =============================================================================
#
# This script removes all Terraform environment variables set by setup-terraform-env.ps1
#
# Usage:
#   .\scripts\cleanup-terraform-env.ps1
#
# Notes:
#   - Removes variables from Windows User environment
#   - You must restart your terminal after running this script
#   - Useful for troubleshooting or starting fresh
#
# Created: 2025-12-30
# Author: Tamshai QA Team
# =============================================================================

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "  Terraform Environment Variables Cleanup" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "⚠ WARNING: This will remove all TF_VAR_* environment variables" -ForegroundColor Yellow
Write-Host ""

# List current variables
Write-Host "Current Terraform Variables:" -ForegroundColor Cyan
$tfVars = Get-ChildItem Env:TF_VAR_* -ErrorAction SilentlyContinue | Sort-Object Name

if ($tfVars.Count -eq 0) {
    Write-Host "  No Terraform variables found." -ForegroundColor Gray
    Write-Host ""
    Write-Host "Nothing to clean up. Exiting..." -ForegroundColor Green
    exit 0
}

foreach ($var in $tfVars) {
    $displayValue = if ($var.Name -match "password|secret|key") {
        "***"
    } else {
        $var.Value
    }
    Write-Host "  $($var.Name) = $displayValue" -ForegroundColor Gray
}
Write-Host ""

# Confirm cleanup
$confirmation = Read-Host "Are you sure you want to remove these variables? (yes/no)"

if ($confirmation -ne "yes") {
    Write-Host ""
    Write-Host "Cleanup cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Removing Terraform environment variables..." -ForegroundColor Yellow
Write-Host ""

# Remove each variable
$removed = 0
foreach ($var in $tfVars) {
    try {
        [Environment]::SetEnvironmentVariable($var.Name, $null, "User")
        Write-Host "  ✓ Removed: $($var.Name)" -ForegroundColor Green
        $removed++
    } catch {
        Write-Host "  ✗ Failed to remove: $($var.Name)" -ForegroundColor Red
        Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "  Cleanup Complete!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Variables removed: $removed" -ForegroundColor White
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. RESTART YOUR TERMINAL for changes to take effect" -ForegroundColor White
Write-Host "  2. Verify cleanup: Get-ChildItem Env:TF_VAR_*" -ForegroundColor White
Write-Host "  3. To set variables again: .\scripts\setup-terraform-env.ps1" -ForegroundColor White
Write-Host ""

# Pause to let user read the output
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
