# Unregister tamshai-ai:// protocol handler from Windows registry
# Run from PowerShell: .\unregister-protocol-dev.ps1

$ErrorActionPreference = "Stop"

Write-Host "Unregistering tamshai-ai:// protocol handler..." -ForegroundColor Cyan

$protocolKey = "HKCU:\Software\Classes\tamshai-ai"

if (Test-Path $protocolKey) {
    Remove-Item -Path $protocolKey -Recurse -Force
    Write-Host "Protocol handler unregistered successfully!" -ForegroundColor Green
    Write-Host "Registry key removed: $protocolKey" -ForegroundColor Gray
} else {
    Write-Host "Protocol handler was not registered." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "To re-register, run: .\register-protocol-dev.ps1" -ForegroundColor Gray
