# Check current protocol handler registration in Windows registry
# Run from PowerShell: .\check-protocol-registration.ps1

$ErrorActionPreference = "Continue"

Write-Host "Checking tamshai-ai:// protocol registration..." -ForegroundColor Cyan
Write-Host ""

$protocolKey = "HKCU:\Software\Classes\tamshai-ai"

if (Test-Path $protocolKey) {
    Write-Host "Protocol IS registered" -ForegroundColor Green
    Write-Host ""

    # Get the default value
    $urlProtocol = Get-ItemProperty -Path $protocolKey -Name "(Default)" -ErrorAction SilentlyContinue
    Write-Host "Protocol Name: $($urlProtocol.'(Default)')" -ForegroundColor Gray

    # Get URL Protocol marker
    $urlMarker = Get-ItemProperty -Path $protocolKey -Name "URL Protocol" -ErrorAction SilentlyContinue
    Write-Host "URL Protocol: [set]" -ForegroundColor Gray

    # Get the command
    $commandKey = "$protocolKey\shell\open\command"
    if (Test-Path $commandKey) {
        $command = Get-ItemProperty -Path $commandKey -Name "(Default)" -ErrorAction SilentlyContinue
        Write-Host ""
        Write-Host "Command registered:" -ForegroundColor Cyan
        Write-Host $command.'(Default)' -ForegroundColor Yellow
        Write-Host ""

        # Parse the command to check if it has the right structure
        $cmdString = $command.'(Default)'
        if ($cmdString -like '*index.js*') {
            Write-Host "✓ Command looks correct (includes index.js)" -ForegroundColor Green
        } else {
            Write-Host "✗ Command might be incorrect (missing index.js?)" -ForegroundColor Red
        }

        # Check if files exist - extract paths manually
        $parts = $cmdString -split '"'
        foreach ($part in $parts) {
            if ($part -like '*electron.exe') {
                if (Test-Path $part) {
                    Write-Host "✓ Electron executable exists: $part" -ForegroundColor Green
                } else {
                    Write-Host "✗ Electron executable NOT found: $part" -ForegroundColor Red
                }
            }
            if ($part -like '*index.js') {
                if (Test-Path $part) {
                    Write-Host "✓ Main entry point exists: $part" -ForegroundColor Green
                } else {
                    Write-Host "✗ Main entry point NOT found: $part" -ForegroundColor Red
                }
            }
        }
    } else {
        Write-Host "✗ Command key not found!" -ForegroundColor Red
    }
} else {
    Write-Host "Protocol is NOT registered" -ForegroundColor Red
    Write-Host ""
    Write-Host 'Run .\register-protocol-dev.ps1 to register it' -ForegroundColor Yellow
}
