# View the Electron debug log file
# This shows logs from protocol handler launches

$logPath = "$env:APPDATA\tamshai-ai-desktop\debug\startup.log"

if (Test-Path $logPath) {
    Write-Host "Debug log file: $logPath" -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor Gray
    Get-Content $logPath
    Write-Host "=============================================" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To clear the log, run: Remove-Item '$logPath'" -ForegroundColor Yellow
} else {
    Write-Host "Debug log not found at: $logPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "The log file is created when Electron starts." -ForegroundColor Gray
    Write-Host "Make sure you have:" -ForegroundColor Gray
    Write-Host "  1. Run 'npm run build' in the desktop client" -ForegroundColor Gray
    Write-Host "  2. Run 'npm run dev' to start Electron" -ForegroundColor Gray
    Write-Host "  3. Run '.\test-protocol.ps1' to test the protocol handler" -ForegroundColor Gray
}
