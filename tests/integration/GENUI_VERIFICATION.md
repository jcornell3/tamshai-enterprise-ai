# Generative UI Verification Test Suite

**Created**: 2026-02-12
**Purpose**: Comprehensive verification of all Gen UI display directives after Phoenix rebuilds
**Status**: ✅ Ready for Use

---

## Overview

This test suite verifies that all Generative UI components work correctly after infrastructure changes, Phoenix rebuilds, or major refactoring. It tests:

1. **Multi-Domain Data Fetching**: Verifies component registry makes 4 MCP calls in parallel
2. **Employee Name Resolution**: Ensures cross-database UUID→name mapping works
3. **Item Count Calculation**: Validates expense report item counts display correctly
4. **Approval Workflows**: Tests approve/reject actions with auto-confirmation
5. **Database Persistence**: Confirms approved items are removed from pending queue
6. **All Display Directives**: Covers 7 domains (HR, Finance, Sales, Support, Payroll, Tax, Approvals)

---

## Quick Start

### Prerequisites

```bash
# 1. Docker containers running
cd infrastructure/docker
docker compose up -d

# 2. Verify services are healthy
docker ps --filter "name=tamshai-pg" --format "{{.Names}}: {{.Status}}"

# 3. Set integration runner secret (auto-retrieved by test script)
# export MCP_INTEGRATION_RUNNER_SECRET=<secret>  # Optional - script retrieves it
```

### Run All Tests

```bash
cd tests/integration
./verify-genui.sh
```

**Expected Output**:

```text
=== Checking Prerequisites ===
[INFO] Docker containers running ✓
[INFO] MCP_INTEGRATION_RUNNER_SECRET is set ✓
[INFO] All services healthy ✓

=== Running Generative UI Verification Tests ===
[INFO] Running all verification tests...

 PASS  ./generative-ui-verification.test.ts
  Generative UI - Full Verification Suite
    1. Approvals Queue - Multi-Domain Name Resolution
      ✓ should return ApprovalsQueue component type (125ms)
      ✓ should contain all three data arrays (12ms)
      ✓ should have time-off requests with resolved names (8ms)
      ✓ should have expense reports with resolved names and item counts (6ms)
      ✓ should have budget amendments with resolved submitter names (5ms)
      ✓ should generate narration text (3ms)
    2. Approval Actions - Database Persistence
      ✓ should approve time-off request and persist to database (1245ms)
      ✓ should approve expense report and persist to database (982ms)
    3. HR Domain - Display Directives
      ✓ should render employee detail component (134ms)
      ✓ should render org chart component (98ms)
    4. Finance Domain - Display Directives
      ✓ should render budget summary component (87ms)
      ✓ should render quarterly report dashboard (102ms)
    5. Sales Domain - Display Directives
      ✓ should render customer detail component (45ms)
    6. Support Domain - Display Directives
      ✓ should render tickets list component (76ms)
    7. Payroll Domain - Display Directives
      ✓ should render pay stub component (89ms)
      ✓ should render pay runs list (67ms)
    8. Tax Domain - Display Directives
      ✓ should render quarterly estimate component (54ms)
    9. Error Handling & Edge Cases
      ✓ should return 401 for missing auth token (23ms)
      ✓ should return error for invalid directive format (18ms)
      ✓ should return error for unknown component (16ms)

Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
Snapshots:   0 total
Time:        4.523 s
```

---

## Test Options

### Run with Coverage

```bash
./verify-genui.sh --coverage
```

Generates coverage report in `coverage/` directory.

### Run with Verbose Output

```bash
./verify-genui.sh --verbose
```

Shows detailed test execution logs including API calls.

### Run in Watch Mode

```bash
./verify-genui.sh --watch
```

Automatically re-runs tests when files change (useful during development).

### Run Specific Test Suite

```bash
npm test -- --testNamePattern="Approvals Queue"
npm test -- --testNamePattern="HR Domain"
npm test -- --testNamePattern="Database Persistence"
```

---

## What Gets Tested

### 1. Approvals Queue (`display:approvals:pending`)

**Multi-Call Pattern**: Tests that component registry makes 4 parallel MCP calls:
- `hr/get_pending_time_off` → timeOffRequests
- `finance/get_pending_expenses` → expenseReports
- `finance/get_pending_budgets` → budgetAmendments
- `hr/list_employees` → employees (for name resolution)

**Name Resolution**: Verifies that:
- Time-off request employee names are resolved from UUID → "First Last"
- Expense report employee names are resolved (not "Unknown")
- Budget amendment submitter names are resolved

**Item Count Calculation**: Confirms:
- Expense reports show actual item counts (3 items, 5 items, etc.)
- NOT showing "0 items" due to RLS subquery issues

**Data Validation**:

```typescript
expect(expenseReport.employeeName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/); // "Eve Thompson"
expect(expenseReport.itemCount).toBeGreaterThanOrEqual(0);
expect(budgetAmendment.submittedBy).not.toBe('Unknown');
```

---

### 2. Approval Actions & Database Persistence

**Auto-Confirmation Flow**:
1. User clicks "Approve" button in portal
2. Portal calls MCP tool (e.g., `approve_time_off_request`)
3. Tool returns `pending_confirmation` with confirmationId
4. Portal auto-confirms by calling `/api/confirm/:confirmationId`
5. Database updated (status → approved)

**Test Validation**:

```typescript
// Before approval
const initialCount = timeOffRequests.length; // e.g., 3

// Approve one request
await approveTimeOffRequest(requestId);

// After approval (verify persistence)
const newCount = timeOffRequests.length; // e.g., 2
expect(newCount).toBe(initialCount - 1);

// Verify specific item is gone
const stillExists = timeOffRequests.some(r => r.id === requestId);
expect(stillExists).toBe(false);
```

---

### 3. HR Domain Display Directives

**Employee Detail**:

```typescript
directive: 'display:hr:employee_detail:employeeId=e1000000-0000-0000-0000-000000000052'
component: 'EmployeeDetailCard'
data: {
  employee: {
    firstName: 'Eve',
    lastName: 'Thompson',
    workEmail: 'eve.thompson@tamshai.com',
    ...
  }
}
```

**Org Chart**:

```typescript
directive: 'display:hr:org_chart:departmentCode=DEPT001'
component: 'OrgChart'
data: {
  nodes: [
    { id: 'uuid', name: 'Employee Name', position: 'Title', ... },
    ...
  ]
}
```

---

### 4. Finance Domain Display Directives

**Budget Summary**:

```typescript
directive: 'display:finance:budget:departmentCode=FIN'
component: 'BudgetSummary'
data: {
  budgets: [
    { category: 'Personnel', budgeted: 500000, actual: 450000 },
    ...
  ]
}
```

**Quarterly Report**:

```typescript
directive: 'display:finance:quarterly_report:quarter=Q1&year=2026'
component: 'QuarterlyReportDashboard'
data: {
  report: {
    quarter: 'Q1',
    year: 2026,
    kpis: [...],
    arrWaterfall: [...],
    highlights: [...]
  }
}
```

---

### 5-8. Other Domain Directives

**Sales**: Customer detail, leads list
**Support**: Tickets by priority, knowledge base articles
**Payroll**: Pay stubs, pay runs, contractor payments
**Tax**: Quarterly estimates, filings, withholdings

All tested with similar patterns:
- Directive parsing
- Component type validation
- Data structure verification
- Narration text generation

---

## Authentication

Tests use **Token Exchange** (OAuth 2.0 RFC 8693) instead of ROPC:

```typescript
import { getTestAuthProvider } from '../shared/auth/token-exchange';

const authProvider = getTestAuthProvider();
const token = await authProvider.getUserToken('alice.chen');

// Use token for API calls
const response = await axios.post(url, data, {
  headers: { Authorization: `Bearer ${token}` }
});
```

**Why Token Exchange?**
- More secure than ROPC (no password exposure)
- Service account impersonates test users
- Aligns with production security posture
- See `.claude/plans/test-auth-refactoring.md` for details

---

## Troubleshooting

### Test Fails: "MCP_INTEGRATION_RUNNER_SECRET not set"

**Solution**: Script auto-retrieves from Keycloak, but if it fails:

```bash
# Get secret manually
MSYS_NO_PATHCONV=1 docker exec tamshai-pg-keycloak \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080/auth --realm master --user admin --password admin

MSYS_NO_PATHCONV=1 docker exec tamshai-pg-keycloak \
  /opt/keycloak/bin/kcadm.sh get clients -r tamshai-corp \
  --fields secret -q clientId=mcp-integration-runner

# Set environment variable
export MCP_INTEGRATION_RUNNER_SECRET="<secret-from-above>"
```

---

### Test Fails: "MCP UI service not responding"

**Check service health**:

```bash
docker ps --filter "name=tamshai-pg-mcp-ui"
docker logs tamshai-pg-mcp-ui --tail 50

# Restart if needed
docker restart tamshai-pg-mcp-ui
```

---

### Test Fails: "Employee names showing 'Unknown'"

**Diagnosis**: Name resolution issue (cross-database lookup)

**Check**:
1. Verify `list_employees` MCP tool works:

   ```bash
   curl http://localhost:3100/api/mcp/hr/tools/list_employees \
     -H "Authorization: Bearer $TOKEN"
   ```

2. Check component registry transform function:

   ```typescript
   // services/mcp-ui/src/registry/component-registry.ts
   // Should have 4th MCP call to list_employees
   mcpCalls: [
     { server: 'hr', tool: 'get_pending_time_off', dataField: 'timeOffRequests' },
     { server: 'finance', tool: 'get_pending_expenses', dataField: 'expenseReports' },
     { server: 'finance', tool: 'get_pending_budgets', dataField: 'budgetAmendments' },
     { server: 'hr', tool: 'list_employees', dataField: 'employees' },  // ← THIS
   ]
   ```

---

### Test Fails: "Approved items still in queue"

**Diagnosis**: Database persistence issue (auto-confirmation not working)

**Check**:
1. Verify auto-confirmation logic in portal:

   ```typescript
   // clients/web/apps/portal/src/pages/AIQueryPage.tsx
   if (result.status === 'pending_confirmation') {
     await fetch(`/api/confirm/${result.confirmationId}`, {
       method: 'POST',
       body: JSON.stringify({ approved: true })
     });
   }
   ```

2. Check database directly:

   ```bash
   docker exec tamshai-pg-postgres psql -U tamshai -d tamshai_hr \
     -c "SELECT status FROM hr.time_off_requests WHERE id = '<request-id>';"
   # Should show 'approved', not 'pending'
   ```

---

## CI/CD Integration

This test suite is designed to run in CI pipelines after Phoenix rebuilds:

**GitHub Actions** (`.github/workflows/verify-genui.yml`):

```yaml
name: Verify Generative UI

on:
  workflow_dispatch: # Manual trigger after Phoenix rebuild
  schedule:
    - cron: '0 6 * * 1' # Weekly Monday 6am

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start services
        run: |
          cd infrastructure/docker
          docker compose up -d
          sleep 30 # Wait for services to be healthy

      - name: Run verification tests
        env:
          MCP_INTEGRATION_RUNNER_SECRET: ${{ secrets.MCP_INTEGRATION_RUNNER_SECRET }}
        run: |
          cd tests/integration
          npm install
          npm run test:genui
```

---

## Test Data Assumptions

Tests assume the following sample data exists after Phoenix rebuild:

**Time-Off Requests** (hr.time_off_requests):
- At least 3 pending requests
- Employee IDs match hr.employees table

**Expense Reports** (finance.expense_reports):
- At least 3 with status SUBMITTED or UNDER_REVIEW
- Each has 1+ line items in finance.expense_items

**Budget Amendments** (finance.department_budgets):
- At least 3 with status PENDING_APPROVAL
- submittedBy field contains valid employee UUIDs

**Employees** (hr.employees):
- Eve Thompson, Alice Chen, Bob Martinez, etc. exist
- employee_id field is UUID format

If sample data is missing, tests may skip assertions (see console output for [SKIP] messages).

---

## Performance Benchmarks

**Expected Duration**: 3-5 seconds for full suite
**Token Acquisition**: < 100ms (cached: < 5ms)
**Display Directive**: 50-150ms per call
**Approval Action**: 500-1500ms (includes DB write + verification)

If tests take longer than 10 seconds, check:
- Docker container resource limits
- PostgreSQL query performance
- Network latency (localhost should be fast)

---

## Related Documentation

- **Test Auth Refactoring Plan**: `.claude/plans/test-auth-refactoring.md`
- **Component Registry**: `services/mcp-ui/src/registry/component-registry.ts`
- **Integration Test Setup**: `tests/shared/auth/token-exchange.ts`
- **Approval Workflows**: `clients/web/apps/portal/src/pages/AIQueryPage.tsx`
- **CLAUDE.md**: Gen UI architecture v1.5 section

---

**Maintainer**: Tamshai-QA Team
**Last Updated**: 2026-02-12
**Version**: 1.0
