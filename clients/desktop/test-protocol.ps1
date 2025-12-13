# Test protocol handler by launching a test URL
# This simulates what happens when the browser redirects

$testUrl = "tamshai-ai://oauth/callback?code=test123&state=test"

Write-Host "Testing protocol handler with URL:" -ForegroundColor Cyan
Write-Host $testUrl -ForegroundColor Yellow
Write-Host ""
Write-Host "This should launch Electron and you should see logs in the running app..." -ForegroundColor Gray
Write-Host ""

# Launch the URL (simulates browser redirect)
Start-Process $testUrl
