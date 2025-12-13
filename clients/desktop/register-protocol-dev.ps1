# Register tamshai-ai:// protocol handler for Windows development
# This script must be run from PowerShell (NOT from WSL)
# Run from clients/desktop directory: .\register-protocol-dev.ps1

$ErrorActionPreference = "Stop"

Write-Host "Registering tamshai-ai:// protocol handler for Windows..." -ForegroundColor Cyan
Write-Host ""

# Check if running in development mode
$devServerPath = Join-Path $PSScriptRoot "node_modules\.bin\electron.cmd"

if (-not (Test-Path $devServerPath)) {
    Write-Host "Error: Electron not found. Run 'npm install' first" -ForegroundColor Red
    exit 1
}

# Find the Electron executable
$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"

if (-not (Test-Path $electronExe)) {
    Write-Host "Error: Electron executable not found at $electronExe" -ForegroundColor Red
    exit 1
}

Write-Host "Found Electron at: $electronExe" -ForegroundColor Gray

# Create registry entries
Write-Host "Creating registry entries..." -ForegroundColor Yellow

# HKCU:\Software\Classes\tamshai-ai
$protocolKey = "HKCU:\Software\Classes\tamshai-ai"
New-Item -Path $protocolKey -Force | Out-Null
Set-ItemProperty -Path $protocolKey -Name "(Default)" -Value "URL:Tamshai AI Protocol"
Set-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value ""

# HKCU:\Software\Classes\tamshai-ai\DefaultIcon
$iconKey = "$protocolKey\DefaultIcon"
New-Item -Path $iconKey -Force | Out-Null
Set-ItemProperty -Path $iconKey -Name "(Default)" -Value "`"$electronExe,1`""

# HKCU:\Software\Classes\tamshai-ai\shell\open\command
$commandKey = "$protocolKey\shell\open\command"
New-Item -Path $commandKey -Force | Out-Null

# Point to the Electron executable with the main process entry point and %1 for the URL argument
$mainEntry = Join-Path $PSScriptRoot "dist\main\index.js"

if (-not (Test-Path $mainEntry)) {
    Write-Host "Warning: Main entry point not found at $mainEntry" -ForegroundColor Yellow
    Write-Host "Building the main process first..." -ForegroundColor Yellow

    # Try to build
    npm run build 2>&1 | Out-Null

    if (-not (Test-Path $mainEntry)) {
        Write-Host "Error: Failed to build. Run 'npm run build' manually." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Found main entry: $mainEntry" -ForegroundColor Gray

# Use -- separator to ensure %1 is treated as an argument, not a file path
$command = "`"$electronExe`" `"$mainEntry`" -- `"%1`""
Set-ItemProperty -Path $commandKey -Name "(Default)" -Value $command

Write-Host ""
Write-Host "Protocol handler registered successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Registry entries:" -ForegroundColor Cyan
Write-Host "  Key: $protocolKey" -ForegroundColor Gray
Write-Host "  Command: $command" -ForegroundColor Gray
Write-Host ""
Write-Host "IMPORTANT: Testing Instructions" -ForegroundColor Yellow
Write-Host "  1. Start the dev server: npm run dev" -ForegroundColor White
Write-Host "  2. When the Electron app opens, click 'Sign in with SSO'" -ForegroundColor White
Write-Host "  3. Login in browser, complete TOTP" -ForegroundColor White
Write-Host "  4. The callback will trigger a NEW Electron instance" -ForegroundColor White
Write-Host "  5. The NEW instance passes the URL to the RUNNING instance via 'second-instance' event" -ForegroundColor White
Write-Host ""
Write-Host "To unregister: Remove-Item -Path '$protocolKey' -Recurse" -ForegroundColor Gray
