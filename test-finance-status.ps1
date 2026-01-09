# Test Finance Status Fixes
Write-Host "`n=== Testing MCP Finance Status Fixes ===" -ForegroundColor Cyan

$baseUrl = "http://localhost:3102"
$userContext = @{
    userId = "alice-uuid"
    username = "alice.chen"
    email = "alice.chen@tamshai.com"
    roles = @("finance-read", "finance-write")
}

# Test 1: List all invoices
Write-Host "`n[Test 1] List ALL invoices:" -ForegroundColor Yellow
$allInvoicesBody = @{
    userContext = $userContext
    limit = 20
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/tools/list_invoices" -Method Post -Body $allInvoicesBody -ContentType "application/json"
    $allInvoices = $response.data
    Write-Host "  Total invoices: $($allInvoices.Count)"

    $statusCounts = $allInvoices | Group-Object -Property status
    foreach ($group in $statusCounts) {
        Write-Host "    $($group.Name): $($group.Count) invoices"
    }
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
}

# Test 2: Filter invoices by status=PENDING
Write-Host "`n[Test 2] Filter invoices with status=PENDING:" -ForegroundColor Yellow
$pendingInvoicesBody = @{
    userContext = $userContext
    status = "PENDING"
    limit = 20
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/tools/list_invoices" -Method Post -Body $pendingInvoicesBody -ContentType "application/json"
    $pendingInvoices = $response.data
    Write-Host "  Found: $($pendingInvoices.Count) PENDING invoices"

    if ($pendingInvoices.Count -gt 0) {
        Write-Host "  Sample invoice statuses:"
        $pendingInvoices | Select-Object -First 5 | ForEach-Object {
            Write-Host "    Invoice $($_.invoice_number): status=$($_.status)"
        }
    }
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
}

# Test 3: List budgets and check status field
Write-Host "`n[Test 3] List budgets and check approval status:" -ForegroundColor Yellow
$budgetsBody = @{
    userContext = $userContext
    fiscalYear = 2025
    limit = 20
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/tools/list_budgets" -Method Post -Body $budgetsBody -ContentType "application/json"
    $budgets = $response.data
    Write-Host "  Total budgets: $($budgets.Count)"

    $statusCounts = $budgets | Group-Object -Property status
    foreach ($group in $statusCounts) {
        Write-Host "    $($group.Name): $($group.Count) budgets"
    }

    Write-Host "  Expected: DRAFT, PENDING_APPROVAL, APPROVED, or REJECTED"
    Write-Host "  NOT: OVER_BUDGET, ON_TRACK, etc. (those were the old calculated statuses)"
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
}

Write-Host "`n=== Tests Complete ===" -ForegroundColor Cyan
Write-Host "`nExpected results:"
Write-Host "  - Test 1: Should show PENDING, APPROVED, PAID statuses (uppercase)"
Write-Host "  - Test 2: Should return 3 PENDING invoices (not 0)"
Write-Host "  - Test 3: Should show DRAFT, APPROVED statuses (approval workflow, not utilization)"
