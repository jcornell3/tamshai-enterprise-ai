# Clear the Electron debug log file
# Run this before testing to get a fresh log

$logPath = "$env:APPDATA\tamshai-ai-desktop\debug\startup.log"

if (Test-Path $logPath) {
    Remove-Item $logPath
    Write-Host "Debug log cleared: $logPath" -ForegroundColor Green
} else {
    Write-Host "Debug log not found (already clear or never created)" -ForegroundColor Yellow
}
