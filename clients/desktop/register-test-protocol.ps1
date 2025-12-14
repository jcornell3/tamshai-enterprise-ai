# Temporarily register a test batch file as the protocol handler
# This helps us see exactly what arguments Windows passes

$testBat = Join-Path $PSScriptRoot "test-args.cmd"

if (-not (Test-Path $testBat)) {
    Write-Host "Error: test-args.cmd not found" -ForegroundColor Red
    exit 1
}

$regPath = "HKCU:\Software\Classes\tamshai-ai"

# Backup current command
$currentCmd = $null
$cmdPath = "$regPath\shell\open\command"
if (Test-Path $cmdPath) {
    $currentCmd = (Get-ItemProperty -Path $cmdPath).'(Default)'
    Write-Host "Backing up current command:" -ForegroundColor Yellow
    Write-Host $currentCmd
    Write-Host ""
}

# Set test batch file as handler
$testCmd = "`"$testBat`" `"%1`""
Set-ItemProperty -Path $cmdPath -Name "(Default)" -Value $testCmd

Write-Host "Temporarily registered test handler:" -ForegroundColor Green
Write-Host $testCmd
Write-Host ""
Write-Host "Now run: .\test-protocol.ps1" -ForegroundColor Cyan
Write-Host "A command window will pop up showing the arguments received."
Write-Host ""
Write-Host "To restore Electron handler, run: .\register-protocol-dev.ps1" -ForegroundColor Yellow
