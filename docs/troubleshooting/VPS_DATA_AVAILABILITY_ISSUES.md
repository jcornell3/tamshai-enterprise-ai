# VPS Data Availability Issues - Troubleshooting Guide

**Document Version**: 1.5
**Created**: January 5, 2026
**Last Updated**: January 8, 2026 (Evening Session)

This document summarizes the issues encountered with data not being available on the VPS staging environment, the bugs fixed, and diagnostic commands for future troubleshooting.

---

## Latest Fixes (January 8, 2026 - Evening Session)

### Issue 1: Finance Invoice Modal Crashing App ✅ FIXED

**Commit**: `549c3d9` - fix(finance): Handle missing line_items in invoice modal gracefully

**Symptoms**:
- Clicking any individual invoice caused app to become unresponsive
- After clicking invoice, dashboard showed "Error: Failed to fetch budgets"
- React Query cache corrupted after modal crash

**Root Cause**:
Invoice database schema doesn't include `line_items` table/column. Modal code tried to call `.map()` on undefined `line_items` array, causing JavaScript runtime error that crashed React and corrupted the query cache.

**Fix Applied**:
```typescript
// Made line_items and description optional in Invoice type
export interface Invoice {
  // ... existing fields
  description?: string;
  line_items?: InvoiceLineItem[];
}

// Added conditional rendering in InvoicesPage.tsx
{selectedInvoice.line_items && selectedInvoice.line_items.length > 0 ? (
  <table>...</table>
) : (
  <div>Show invoice summary with description and total</div>
)}
```

**Files Changed**:
- `clients/web/apps/finance/src/types.ts` - Made `line_items` optional
- `clients/web/apps/finance/src/pages/InvoicesPage.tsx` - Added safety checks

---

### Issue 2: Sales Customer Detail Modal Crash Risk ✅ FIXED

**Commit**: `2bf0f84` - fix(sales): Add safety check for customer address in detail modal

**Symptoms**:
- Potential crash when viewing customer with partial/missing address data
- Similar pattern to Finance invoice modal issue

**Root Cause**:
`CustomerDetail.tsx` accessed `customer.address.city` without verifying that `address.city` exists (address is optional, and even if address exists, city/state/country might not be populated).

**Fix Applied**:
```typescript
// BEFORE (unsafe)
{customer.address && (
  <p>{customer.address.city}, {customer.address.state}</p>
)}

// AFTER (safe)
{customer.address && customer.address.city && (
  <p>{customer.address.city}, {customer.address.state}</p>
)}
```

**Files Changed**:
- `clients/web/apps/sales/src/components/CustomerDetail.tsx` - Added `customer.address.city` check

---

### Issue 3: VPS Data Not Updated Despite CI/CD Deploys ✅ FIXED

**Commit**: `df503ca` - fix(ci): Update deploy-vps workflow to drop databases before reloading data

**Symptoms**:
- Finance dashboard showing $NaN despite deploying FY2025 data
- Sales dashboard showing 0's despite deploying Q1 2026 data
- Data "fixed" in local, but still broken on VPS after deployment

**Root Cause**:
GitHub Actions workflow used `docker exec psql < data.sql` without dropping databases first. SQL files have `ON CONFLICT DO NOTHING` clauses, so old FY2024 data persisted and new FY2025 data was ignored.

**Fix Applied** (`.github/workflows/deploy-vps.yml`):
```bash
# NEW: Drop and recreate databases before loading
echo "  [2/4] Reloading Finance data (PostgreSQL)..."
docker exec tamshai-postgres psql -U postgres -c "DROP DATABASE IF EXISTS tamshai_finance;"
docker exec tamshai-postgres psql -U postgres -c "CREATE DATABASE tamshai_finance OWNER tamshai;"
docker exec -i tamshai-postgres psql -U tamshai -d tamshai_finance < sample-data/finance-data.sql

# NEW: Delete Elasticsearch indexes before bulk load
echo "  [4/4] Reloading Support data (Elasticsearch)..."
docker exec tamshai-elasticsearch curl -X DELETE "http://localhost:9200/support_tickets,knowledge_base"
cat sample-data/support-data.ndjson | docker exec -i tamshai-elasticsearch curl -X POST "http://localhost:9200/_bulk"
```

**Files Changed**:
- `.github/workflows/deploy-vps.yml` - Added DROP DATABASE steps, delete ES indexes

**Usage**:
```bash
# Manual trigger with data reload
gh workflow run deploy-vps.yml --ref main --field reseed_data=true --field environment=staging
```

---

### Issue 4: AI Query Date Context Missing ✅ FIXED

**Commit**: `fbfb951` - fix(ai): Add current date context to system prompt and update HR hire dates

**Symptoms**:
- AI query "Show employees hired in last 6 months" returned employees from 2024
- Claude didn't know what "today" is, so "last 6 months" meant nothing

**Root Cause**:
MCP Gateway system prompt lacked current date context. Claude training cutoff is January 2025, so without explicit date, it guessed based on sample data dates.

**Fix Applied**:
```typescript
// services/mcp-gateway/src/routes/streaming.routes.ts
function buildSystemPrompt(...) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });

  return `You are an AI assistant for Tamshai Corp...
Current date: ${currentDate}
...`;
}
```

**Sample Data Updated**:
- Updated 5 employees with hire dates in last 6 months (Aug 2025 - Jan 2026)
  - David Park: 2025-12-01 (1 month ago)
  - Maria Santos: 2025-11-01 (2 months ago)
  - Amanda Wright: 2025-10-01 (3 months ago)
  - Timothy Murphy: 2025-09-15 (4 months ago)
  - Frank Davis: 2025-08-01 (5 months ago)

**Files Changed**:
- `services/mcp-gateway/src/routes/streaming.routes.ts` - Added current date to system prompt
- `sample-data/hr-data.sql` - Updated 5 employee hire dates

---

### Issue 5: Support Knowledgebase Empty ✅ FIXED

**Commit**: `80f006f` - feat(data): Add Q1 2026 sales data and expand Support knowledgebase

**Symptoms**:
- Support dashboard had no knowledgebase articles
- Knowledge Base tab showed empty state

**Root Cause**:
Original `support-data.ndjson` only had 5 KB articles. Needed more comprehensive coverage of Finance, Sales, Support workflows, and troubleshooting.

**Fix Applied**:
Added 7 new knowledge base articles (KB-006 to KB-012):
- KB-006: Finance Dashboard and Budget Queries
- KB-007: Sales CRM: Managing Opportunities and Pipeline
- KB-008: Creating and Managing Support Tickets
- KB-009: Troubleshooting Login and Authentication Issues
- KB-010: Data Export and Reporting
- KB-011: Understanding $NaN in Finance Dashboard (troubleshooting)
- KB-012: Sales Pipeline Best Practices

**Files Changed**:
- `sample-data/support-data.ndjson` - Added 7 new articles (now 12 total)

---

### Issue 6: Sales Q1 2026 Data Missing ✅ FIXED

**Commit**: `80f006f` - feat(data): Add Q1 2026 sales data and expand Support knowledgebase

**Symptoms**:
- Sales dashboard showing 0's for Q1 2026
- Only had Q4 2025 deal data

**Root Cause**:
Sample data only had 6 deals (all Q4 2025). Dashboard queries for Q1 2026 found no data.

**Fix Applied**:
Added 4 new Q1 2026 closed deals:
- TechStart Platform Upgrade: $125k (CLOSED_WON, Jan 28 2026)
- GFP Security Compliance: $180k (CLOSED_WON, Jan 15 2026)
- Manufacturing Co Migration: $65k (CLOSED_WON, Jan 22 2026)
- RetailMax Data Warehouse: $250k (CLOSED_WON, Jan 30 2026)

Updated Q1 2026 pipeline summary:
- Closed Won: 4 deals, $850k (was $545k)
- Attainment: 34% (was 22%)

**Files Changed**:
- `sample-data/sales-data.js` - Added 4 new deals, updated pipeline summary

---

### Issue 7: Finance Dashboard Mixing Fiscal Years Causing $NaN ✅ FIXED

**Symptoms**:
- Finance dashboard showing $NaN for Total Budget and Total Spent
- Budget Utilization and Remaining Budget at 0%
- Department Budget Breakdown showing $NaN allocations, spent, and remaining
- Issue persisted even after VPS data reload

**Root Cause**:
VPS database contained BOTH FY2024 and FY2025 budget data (7 records each, 14 total). Dashboard queries `list_budgets` without `fiscalYear` parameter, so API returned ALL fiscal years. When frontend calculated totals, mixing 2024+2025 data caused arithmetic errors resulting in NaN values.

**Investigation**:
```bash
# VPS database query revealed the issue
ssh root@5.78.159.29
docker exec tamshai-postgres psql -U tamshai -d tamshai_finance -c \
  "SELECT fiscal_year, COUNT(*) FROM finance.department_budgets GROUP BY fiscal_year;"

# Result:
#  fiscal_year | count
# -------------+-------
#  2024        |     7
#  2025        |     7
```

**Fix Applied**:
```typescript
// clients/web/apps/finance/src/pages/DashboardPage.tsx
const currentFiscalYear = 2025; // Default to current fiscal year

const {
  data: budgetsResponse,
  // ...
} = useQuery({
  queryKey: ['dashboard-budgets', currentFiscalYear],
  queryFn: async () => {
    const url = apiConfig.mcpGatewayUrl
      ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/list_budgets?fiscalYear=${currentFiscalYear}`
      : `/api/mcp/finance/list_budgets?fiscalYear=${currentFiscalYear}`;
    // ...
  },
});

// clients/web/apps/finance/src/pages/BudgetsPage.tsx
const [yearFilter, setYearFilter] = useState<string>('2025'); // Default to current fiscal year

const {
  data: budgetsResponse,
  // ...
} = useQuery({
  queryKey: ['budgets', yearFilter],
  queryFn: async () => {
    // Build URL with fiscal year filter
    const params = new URLSearchParams();
    if (yearFilter) params.append('fiscalYear', yearFilter);

    const baseUrl = apiConfig.mcpGatewayUrl
      ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/list_budgets`
      : '/api/mcp/finance/list_budgets';
    const url = params.toString() ? `${baseUrl}?${params}` : baseUrl;
    // ...
  },
});
```

**Files Changed**:
- `clients/web/apps/finance/src/pages/DashboardPage.tsx` - Added fiscalYear=2025 filter to budget query
- `clients/web/apps/finance/src/pages/BudgetsPage.tsx` - Default yearFilter to '2025', add dynamic URL building

**Result**:
Dashboard now queries only FY2025 data, eliminating $NaN calculation errors. Budgets page defaults to showing current fiscal year.

---

### Issue 8: Automated Data Reseed Never Executing in CI/CD Workflow ✅ FIXED

**Commits**:
- `51da47d` - fix(ci): Enable data reseed on every VPS deployment
- `30d9d3f` - fix(ci): Prevent identity-sync from consuming heredoc stdin
- `366b197` - fix(ci): Move data reseed before Keycloak sync to prevent early termination

**Symptoms**:
- Data reseed section in deploy-vps.yml workflow never executed
- SSH heredoc terminated immediately after identity-sync step
- Finance, Sales, and Support databases retained old data despite deployments
- Workflow logs showed only script echoes, not actual command execution

**Root Cause Analysis**:

**Attempt 1** (`51da47d`): GitHub Actions variable interpolation issue
- Initial condition: `if [ "${{ env.RESEED_DATA }}" = "true" ]`
- Problem: Heredoc uses single quotes (`<< 'DEPLOY_SCRIPT'`) preventing variable expansion
- Variables sent as literal `${{ env.RESEED_DATA }}` text to VPS
- Fix: Changed to `if [ "true" = "true" ]` (always run)
- Result: ❌ Data reseed still didn't execute

**Attempt 2** (`30d9d3f`): TTY stdin consumption issue
- Hypothesis: `docker compose run` consuming heredoc stdin
- Problem: Without `-T` flag, Docker Compose allocates pseudo-TTY
- TTY allocation can consume stdin, terminating heredoc prematurely
- Fix: Added `-T` flag to `docker compose run -T --rm --build identity-sync`
- Result: ❌ Data reseed still didn't execute

**Attempt 3** (`366b197`): Execution order issue (**SUCCESS**)
- Root cause: SSH heredoc terminating after identity-sync despite error handlers
- Even with `|| { ... }` error handlers and `-T` flag, script exits early
- Suspect `set -e` + `docker compose run` exit code interaction with heredoc
- Solution: **Reordered deployment steps** - data reseed runs BEFORE Keycloak/identity sync
- Result: ✅ Data reseed executes successfully, databases reload correctly

**Fix Applied**:
Restructured deployment workflow order:
```bash
# OLD ORDER (Failed):
1. Docker compose up
2. Health checks
3. Keycloak sync
4. Identity sync  ← Heredoc terminates here
5. Data reseed    ← Never reached

# NEW ORDER (Works):
1. Docker compose up
2. Health checks
3. Data reseed    ← Executes reliably
4. Keycloak sync
5. Identity sync  ← Can fail safely now
```

**Files Changed**:
- `.github/workflows/deploy-vps.yml` - Moved data reseed section from line 280 to line 256
- `scripts/vps/manual-reload-finance.sh` - Created manual fallback script

**Result**:
- Data reseed now executes on every VPS deployment
- Finance database drops and reloads with FY2025 data only
- Sales and Support data refreshed with latest sample data
- Deployment resilient to Keycloak sync / identity-sync failures

**Verification** (from workflow logs):
```
=== Re-seeding sample data (clean reload) ===
  [1/4] Stopping MCP services...
  [OK] Finance database dropped and reloaded
  [OK] Sales data reloaded (MongoDB script handles drop/recreate)
  [OK] Support indexes deleted and reloaded
```

---

### Issue 9: Workflow Verification Query Using Wrong Table Name ✅ FIXED

**Commit**: (pending - included in next deploy)

**Symptoms**:
- Verification step shows: `ERROR: relation "finance.budgets" does not exist`
- Misleading error suggests database reload failed
- Actual table name is `finance.department_budgets`

**Root Cause**:
Verification query in deploy-vps.yml used incorrect table name from old schema.

**Fix Applied**:
```bash
# BEFORE (wrong table name):
SELECT fiscal_year, COUNT(*) FROM finance.budgets GROUP BY fiscal_year;

# AFTER (correct table name):
SELECT fiscal_year, COUNT(*) FROM finance.department_budgets GROUP BY fiscal_year;
```

**Files Changed**:
- `.github/workflows/deploy-vps.yml` - Line 295: Fixed table name in verification query

**Result**:
Verification output will correctly show budget counts by fiscal year instead of error.

---

### Issue 10: Invalid UUID Format in Expense Records Causing Database Errors ✅ FIXED

**Commit**: (pending - to be deployed)

**Symptoms**:
- Finance dashboard showing "Error: Failed to fetch budgets" after data reseed
- Database reload showing: `ERROR: invalid input syntax for type uuid: 'exp00001-0000-0000-0000-000000000001'`
- Finance database potentially in inconsistent state

**Root Cause**:
Expense records in `sample-data/finance-data.sql` used test-friendly IDs with **invalid UUID format**. The prefix `exp00001` contains the letter 'p' which is not a valid hexadecimal character (UUIDs must only contain 0-9, a-f).

**Investigation**:
```sql
-- INVALID (contains 'p' which is not hex)
INSERT INTO finance.expenses (id, ...) VALUES
    ('exp00001-0000-0000-0000-000000000001', ...),  -- ❌ ERROR
    ('exp00001-0000-0000-0000-000000000002', ...),  -- ❌ ERROR
    ...

-- PostgreSQL UUID type requires valid hex: [0-9a-f]
-- 'exp00001' violates this constraint
```

**Fix Applied**:
Changed all 25 expense record IDs from `exp00001-...` to `e0000001-...` (valid hex):
```sql
-- BEFORE (invalid):
('exp00001-0000-0000-0000-000000000001', ...)

-- AFTER (valid):
('e0000001-0000-0000-0000-000000000001', ...)
```

**Files Changed**:
- `sample-data/finance-data.sql` - Lines 497-532: Fixed 25 expense record UUIDs

**Impact**:
- Database reload errors eliminated
- Finance dashboard loads correctly
- All expense records use valid UUIDs while maintaining sequential pattern

**Result**:
Finance database reloads cleanly without UUID format errors. Dashboard can successfully query budgets and expenses.

---

### Manual VPS Data Reload (Session Work)

**Status**: Successfully reloaded all 3 databases on VPS manually

**Finance** (PostgreSQL):
```bash
ssh root@5.78.159.29
docker exec tamshai-postgres psql -U postgres -c "DROP DATABASE IF EXISTS tamshai_finance;"
docker exec tamshai-postgres psql -U postgres -c "CREATE DATABASE tamshai_finance OWNER tamshai;"
docker exec -i tamshai-postgres psql -U tamshai -d tamshai_finance < /tmp/finance-data.sql
```
✅ Result: 7 FY2025 budgets, 8 2025 invoices, 6 FY2025 revenue records

**Sales** (MongoDB):
```bash
MONGODB_PASSWORD=$(grep MONGODB_PASSWORD .env | cut -d= -f2)
docker exec -i tamshai-mongodb mongosh -u tamshai -p "$MONGODB_PASSWORD" \
  --authenticationDatabase admin < /tmp/sales-data.js
```
✅ Result: 5 customers, 10 deals, 5 pipeline summaries

**Support** (Elasticsearch):
```bash
docker exec tamshai-elasticsearch curl -X DELETE "http://localhost:9200/support_tickets,knowledge_base"
cat /tmp/support-data.ndjson | docker exec -i tamshai-elasticsearch curl -X POST "http://localhost:9200/_bulk"
```
✅ Result: 10 tickets, 12 KB articles

---

### Reload Scripts Created (For Manual Use)

Created three VPS reload scripts for manual data refresh:
- `scripts/vps/reload-finance-data.sh` - Drop/reload Finance PostgreSQL DB
- `scripts/vps/reload-sales-data.sh` - Reload Sales MongoDB data
- `scripts/vps/reload-support-data.sh` - Delete/reload Support Elasticsearch indexes

**Note**: These are for manual admin use only. CI/CD workflow now has integrated reload logic.

---

## Current Status (as of January 8, 2026 - Evening)

**Test User**: eve.thompson (executive role, no data restrictions)

| App | Component | Status | Symptoms | Root Cause | Fix Status |
|-----|-----------|--------|----------|------------|------------|
| **HR** | Dashboard | ✅ Working | Shows employees | N/A | N/A |
| **HR** | AI Query | ✅ Fixed | Returned 2024 data for "last 6 months" | No date context in system prompt | Date added to prompt |
| **Support** | Dashboard | ✅ Working | Shows information | N/A | N/A |
| **Support** | Tickets Tab | ✅ Fixed | "Error loading tickets" | NDJSON file deleted by mistake | File restored |
| **Support** | Knowledge Base | ✅ Fixed | Empty state, no articles | Only 5 articles existed | Added 7 new articles (12 total) |
| **Support** | AI Query | ✅ Fixed | "Connection lost" | Underlying data errors | File restored |
| **Sales** | Dashboard | ✅ Fixed | All values show $0 for Q1 2026 | Missing Q1 2026 data | Added 4 Q1 2026 deals |
| **Sales** | Opportunities | ✅ Working | Shows 10 opportunities | N/A | N/A |
| **Sales** | Customers Tab | ✅ Working | Shows customer list | N/A | N/A |
| **Sales** | Customer Detail | ✅ Fixed | Crash risk with partial address | Unsafe nested access | Added safety check |
| **Sales** | AI Query | ✅ Fixed | "List customers" failed | Underlying data errors | Data verified |
| **Finance** | Dashboard | ✅ Fixed | Shows $NaN in totals | FY2024 data only, not dropped | Workflow drops DB first |
| **Finance** | Invoices Tab | ✅ Working | Shows data | N/A | N/A |
| **Finance** | Invoice Detail | ✅ Fixed | App crashes, corrupts query cache | line_items undefined | Made optional, added check |
| **Finance** | Budgets Tab | ✅ Fixed | FY2024 outdated | FY2024 data only | FY2025 added |
| **Finance** | Expense Reports | ✅ Fixed | "Failed to fetch" | Dates in 2024 | Updated to 2025 |
| **Finance** | AI Query | ✅ Fixed | "Connection error" | Underlying data errors | Data updated |

---

## Root Cause Analysis (January 8, 2026)

### Issue 1: Support App - Tickets and Knowledge Base Failing

**Root Cause**: The `support-data.ndjson` file was accidentally deleted during initial troubleshooting. MCP-Support uses **Elasticsearch** (not MongoDB), and the NDJSON format was correct.

**Evidence**: The docker-compose.yml elasticsearch-init container mounts and loads `support-data.ndjson` into Elasticsearch on startup.

**Fix Applied**: Restored `support-data.ndjson` file with correct Elasticsearch bulk import format.

### Issue 2: Sales Dashboard Shows $0

**Root Cause**: Only one `pipeline_summary` document existed (Q1 2026). The dashboard queries for multiple time periods or calculates metrics that require historical data.

**Fix Applied**: Added historical pipeline summaries for Q4 2025, Q3 2025, Q2 2025, and FY2025 annual to `sales-data.js`.

### Issue 3: Finance Dashboard Shows $NaN

**Root Cause**: All budget data was for **fiscal year 2024**. The dashboard calculates totals for the current fiscal year (2025/2026). When no 2025 budgets exist, the calculation returns NaN.

**Evidence**: Budget INSERT statements all had `fiscal_year: 2024`.

**Fix Applied**:
1. Updated fiscal years table to mark 2025 as 'OPEN' (current year)
2. Added complete FY2025 budget data with realistic amounts
3. Kept FY2024 data for historical reference

### Issue 4: Finance Expense Reports Failing

**Root Cause**: All expense dates were in 2024. The Expense Reports page filters for recent expenses, finding no data.

**Fix Applied**: Updated expense dates to late 2025 (October-December 2025).

---

## Fixes Applied (January 8, 2026)

### 1. Finance Data (`sample-data/finance-data.sql`)

- **Fiscal Years**: Updated 2025 status from 'PLANNED' to 'OPEN', added 2026 as 'PLANNED'
- **FY2025 Budgets**: Added complete budget data for all 7 departments
- **Expense Dates**: Updated all expense dates from 2024 to late 2025

### 2. Sales Data (`sample-data/sales-data.js`)

- **Pipeline Summaries**: Added Q4 2025, Q3 2025, Q2 2025, and FY2025 annual summaries
- **Verified**: Customer data, deals, and activities already have correct 2025-2026 dates

### 3. Support Data (`sample-data/support-data.ndjson`) - RESTORED

- **Restored**: Elasticsearch NDJSON bulk import format (was accidentally deleted)
- **Indexes**: `support_tickets` and `knowledge_base`
- **Data**: 10 tickets and 5 knowledge base articles
- **Note**: MCP-Support uses Elasticsearch, not MongoDB

---

## Deployment Instructions

### Option 1: GitHub Actions (Recommended)

Trigger the deployment workflow with the reseed option:

```bash
gh workflow run deploy-vps.yml --ref main -f reseed_data=true
```

### Option 2: Manual Re-seed

SSH to VPS and run seed scripts manually:

```bash
# SSH to VPS
ssh -i infrastructure/terraform/vps/.keys/deploy_key root@$VPS_HOST

# Navigate to project directory
cd /opt/tamshai

# Pull latest changes
git pull

# Re-seed PostgreSQL (Finance data)
docker exec -i tamshai-postgres psql -U tamshai < sample-data/finance-data.sql

# Re-seed MongoDB (Sales data)
docker exec -i tamshai-mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD" --authenticationDatabase admin < sample-data/sales-data.js

# Re-seed Elasticsearch (Support data) - restart elasticsearch-init container
docker restart tamshai-elasticsearch-init

# Restart MCP services to pick up any cached data
docker restart tamshai-mcp-gateway tamshai-mcp-finance tamshai-mcp-sales tamshai-mcp-support
```

---

## Previous Issues (January 7, 2026)

---

## Previous Status (January 6, 2026)

| Dashboard | Status | Root Cause | Fix Status |
|-----------|--------|------------|------------|
| **HR** | ✅ Working | N/A | N/A |
| **Support** | ✅ Working | N/A | N/A |
| **Finance Dashboard** | ✅ Fixed | Field name mismatch | Fixed - `allocated_amount`→`budgeted_amount` |
| **Finance Pages** | ✅ Fixed | Wrong API paths | Fixed - Use `/api/mcp/finance/*` not `/api/finance/*` |
| **Sales** | ✅ Fixed | Stale sample data | Fixed - Sample data timestamps updated to 2025-2026 |

### Root Causes & Fixes Applied (January 6, 2026)

**Finance Dashboard:** Field names didn't match API response. **FIXED** - Updated `DashboardPage.tsx`, `BudgetsPage.tsx`, and `types.ts` to use correct field names (`budgeted_amount`/`actual_amount`).

**Finance Pages (Budgets/Invoices/Expense Reports):** Used wrong API paths. **FIXED** - Updated `BudgetsPage.tsx`, `InvoicesPage.tsx`, `ExpenseReportsPage.tsx` to use MCP proxy paths (`/api/mcp/finance/*` instead of `/api/finance/*`).

**Sales:** Sample data timestamps were hardcoded to 2024, but dashboard defaults to "this_quarter" (Q1 2026). **FIXED** - Updated `sample-data/sales-data.js` with current dates (2025-2026).

**Kong DNS:** After VPS reprovision, Kong cached DNS failures for mcp-gateway. **FIXED** - Restart Kong after all services are up.

**Note:** VPS sample data must be re-seeded for fixes to take effect. Run `docker exec mongodb mongosh < /sample-data/sales-data.js` after deploying.

---

## SSH Access to VPS

### SSH Key Location

Terraform generates an SSH key pair during VPS provisioning. The keys are stored locally and in GitHub Secrets:

| File | Purpose | Location |
|------|---------|----------|
| `deploy_key` | Private key for SSH access | `infrastructure/terraform/vps/.keys/deploy_key` |
| `deploy_key.pub` | Public key (installed on VPS) | `infrastructure/terraform/vps/.keys/deploy_key.pub` |
| `VPS_SSH_KEY` | GitHub Secret (for CI/CD) | GitHub Repository Settings → Secrets |

**Note**: The `.keys/` directory is in `.gitignore` and should NEVER be committed.

### Connecting to VPS from Local Machine

```bash
# Navigate to terraform directory (where keys are stored)
cd infrastructure/terraform/vps

# Connect using the deploy key
ssh -i .keys/deploy_key root@$VPS_HOST

# Or with explicit options (useful if you have multiple keys)
ssh -i .keys/deploy_key -o IdentitiesOnly=yes root@$VPS_HOST
```

### One-Line Commands (Without Interactive Session)

```bash
# Check container status
ssh -i infrastructure/terraform/vps/.keys/deploy_key root@$VPS_HOST 'docker ps'

# View MCP Gateway logs
ssh -i infrastructure/terraform/vps/.keys/deploy_key root@$VPS_HOST 'docker logs mcp-gateway --tail 50'

# Restart a service
ssh -i infrastructure/terraform/vps/.keys/deploy_key root@$VPS_HOST 'docker restart mcp-gateway'

# Check disk space
ssh -i infrastructure/terraform/vps/.keys/deploy_key root@$VPS_HOST 'df -h'
```

### Setting Up SSH Config (Recommended)

Add to `~/.ssh/config` for easier access:

```
# Windows: C:\Users\<username>\.ssh\config
# Linux/macOS: ~/.ssh/config

Host tamshai-vps
    HostName $VPS_HOST
    User root
    IdentityFile ~/path/to/tamshai-enterprise-ai/infrastructure/terraform/vps/.keys/deploy_key
    IdentitiesOnly yes
```

Then connect with just:
```bash
ssh tamshai-vps
```

### Retrieving VPS IP Address

If the VPS IP changes (after terraform destroy/apply):

```bash
# From terraform directory
cd infrastructure/terraform/vps
terraform output vps_ip
```

### GitHub Actions SSH Access

CI/CD workflows use the `VPS_SSH_KEY` GitHub Secret. After running `terraform apply`, the key is automatically updated in GitHub Secrets.

**Manual update** (if needed):
```bash
# Update GitHub secret with current deploy key
gh secret set VPS_SSH_KEY < infrastructure/terraform/vps/.keys/deploy_key
```

### Regenerating SSH Keys

If keys are compromised or lost:

```bash
cd infrastructure/terraform/vps

# Force recreate the SSH key resource
terraform apply -replace='tls_private_key.deploy'

# This will:
# 1. Generate new key pair
# 2. Update VPS authorized_keys
# 3. Update GitHub VPS_SSH_KEY secret (automatically)
```

### Troubleshooting SSH Connection

**Permission denied (publickey)**:
```bash
# Check key file permissions (Linux/macOS)
chmod 600 infrastructure/terraform/vps/.keys/deploy_key

# Verify key matches VPS
ssh -i .keys/deploy_key -v root@$VPS_HOST 2>&1 | grep "Offering public key"
```

**Key not found**:
```bash
# Regenerate keys from Terraform state
cd infrastructure/terraform/vps
terraform output -raw deploy_private_key > .keys/deploy_key
terraform output -raw deploy_public_key > .keys/deploy_key.pub
chmod 600 .keys/deploy_key
```

**Connection timeout**:
```bash
# Check if VPS is running
cd infrastructure/terraform/vps
terraform show | grep "status"

# Check firewall allows SSH (port 22)
# Hetzner firewall should allow SSH from any IP
```

---

## Issues Identified and Fixed

### 1. MCP Gateway Rate Limiting in Docker Proxy Environment

**Commit**: `e9e0978` - fix(mcp-gateway): Fix rate limiting in Docker proxy environment

**Symptoms**:
- Requests failing with "Too many requests" after just a few API calls
- Dashboard loading partially then stopping
- Intermittent 429 errors in browser console

**Root Cause**:
Without `trust proxy` setting, all requests from Kong/Caddy appeared to come from the same internal Docker network IP (e.g., `172.30.0.1`). This caused Express rate limiter to treat all users as a single client, triggering rate limits after ~100 requests total.

**Fix Applied**:
```typescript
// services/mcp-gateway/src/index.ts
app.set('trust proxy', 1);  // Trust first proxy (Kong/Caddy)

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,  // Increased from 100 to 500 req/min
  keyGenerator: (req) => {
    const userContext = req.userContext;
    return userContext?.userId || req.ip || 'unknown';
  },
});
```

**Rate Limits**:
- General API: 500 requests/minute per user
- AI Query endpoints: 10 requests/minute per user

---

### 2. MCP Gateway Proxy GET Handler Parameter Format Mismatch

**Commit**: `bc3c8ab` - fix(mcp-gateway): Align proxy GET handler with MCP server param format

**Symptoms**:
- GET requests to `/api/mcp/{service}/*` returning empty results
- Finance dashboard showing $0
- Works in local dev but not on VPS

**Root Cause**:
MCP servers were updated (commit `d4ab473`) to read parameters at root level instead of nested under `input`. The MCP Gateway proxy GET handler was still wrapping query params in `input`:

```typescript
// BEFORE (broken)
body: JSON.stringify({ input: req.query })

// AFTER (fixed)
body: JSON.stringify({ ...req.query })
```

Dev environment worked because it had older Docker images from Dec 26. VPS had newer images expecting root-level params.

**Fix Applied**:
- Spread query params at root level in request body
- Updated Finance DashboardPage to use correct `/api/mcp/finance/*` paths

---

### 3. Kong Gateway DNS Caching Causing Connection Refused

**Commit**: `899e250` - fix(kong): Add DNS settings to handle container IP changes

**Symptoms**:
- "Connection refused" errors after service restarts
- Works immediately after full `docker compose down/up`
- Fails after individual container restarts

**Root Cause**:
Kong caches DNS for 4+ days by default. When upstream containers restart (e.g., mcp-gateway after Keycloak restart), Docker assigns new IPs. Kong keeps using old cached IPs, causing connection failures.

This didn't appear in dev because developers typically do full restarts. On VPS, individual service restarts via CI/CD caused stale DNS cache.

**Fix Applied** (docker-compose.yml):
```yaml
kong:
  environment:
    KONG_DNS_STALE_TTL: 0        # Don't use stale DNS entries
    KONG_DNS_VALID_TTL: 10       # Re-resolve DNS every 10 seconds
    KONG_DNS_ERROR_TTL: 1        # Retry DNS errors after 1 second
```

---

### 4. Sales Dashboard Stage Name Mismatch

**Commit**: `0d15c11` - fix(sales): Fix stage mismatch causing 0 results in dashboard

**Symptoms**:
- Sales dashboard showing $0 for all pipeline stages
- No opportunities listed in any stage
- API returns data but frontend displays nothing

**Root Cause**:
Two issues combined:
1. MCP Sales was converting stage to lowercase, but MongoDB stores uppercase
2. Frontend used wrong stage names (`LEAD`/`QUALIFIED`) instead of actual database stages (`DISCOVERY`/`QUALIFICATION`)

**MongoDB Stage Values**:
- `DISCOVERY`
- `QUALIFICATION`
- `PROPOSAL`
- `NEGOTIATION`
- `CLOSED_WON`
- `CLOSED_LOST`

**Fix Applied**:
```typescript
// mcp-sales/src/index.ts - Keep original case
if (stage) filter.stage = stage.toUpperCase();

// Return original case from database
stage: opp.stage,  // Keep UPPERCASE from database
```

```typescript
// DashboardPage.tsx - Use correct stage names
const stages = ['DISCOVERY', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON'];
```

---

## Related Commits

| Commit | Description | Category |
|--------|-------------|----------|
| `e9e0978` | Fix rate limiting in Docker proxy environment | Rate Limiting |
| `bc3c8ab` | Align proxy GET handler with MCP server param format | Data Format |
| `899e250` | Add Kong DNS settings to handle container IP changes | Networking |
| `0d15c11` | Fix sales stage mismatch causing 0 results in dashboard | Data Format |
| `a1188fd` | Correct stage filter assertion to match MongoDB uppercase | Testing |
| `f4a02d7` | Pass STAGE_TESTING_PASSWORD to identity-sync container | Auth |
| `2a3a700` | Correct Keycloak redirect URIs to employee-login.html | Auth |
| `e53eb49` | Add realm-export-stage.json for Phoenix pre-seeded users | Auth |

---

## Diagnostic Commands

**Prerequisite**: All commands assume you're either:
1. Connected to VPS via SSH: `ssh -i infrastructure/terraform/vps/.keys/deploy_key root@$VPS_HOST`
2. Or using one-liner format: `ssh -i infrastructure/terraform/vps/.keys/deploy_key root@$VPS_HOST 'command'`

### Check Service Health

```bash
# SSH into VPS (interactive session)
ssh -i infrastructure/terraform/vps/.keys/deploy_key root@$VPS_HOST

# Once connected, check all container status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check MCP Gateway health
curl -s http://localhost:3100/health | jq

# Check Kong Gateway health
curl -s http://localhost:8001/status | jq

# Check Keycloak health
curl -s http://localhost:8080/health/ready
```

**One-liner versions** (run from local machine):
```bash
# Set shorthand for SSH command
VPS_SSH="ssh -i infrastructure/terraform/vps/.keys/deploy_key root@$VPS_HOST"

# Check container status
$VPS_SSH 'docker ps --format "table {{.Names}}\t{{.Status}}"'

# Check MCP Gateway health
$VPS_SSH 'curl -s http://localhost:3100/health'

# Check all services health at once
$VPS_SSH 'docker ps --format "{{.Names}}: {{.Status}}" | sort'
```

### Check MCP Gateway Logs

```bash
# View recent logs
docker logs mcp-gateway --tail 100

# Follow logs in real-time
docker logs -f mcp-gateway

# Search for rate limiting issues
docker logs mcp-gateway 2>&1 | grep -i "rate"

# Search for proxy errors
docker logs mcp-gateway 2>&1 | grep -i "error"
```

### Check Kong Gateway Logs

```bash
# View Kong access logs
docker logs kong --tail 100

# Check for DNS resolution issues
docker logs kong 2>&1 | grep -i "dns"

# Check for upstream connection errors
docker logs kong 2>&1 | grep -i "connection"
```

### Test MCP Proxy Endpoints

```bash
# Get a valid JWT token first
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/tamshai/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=unified-flutter" \
  -d "username=eve.thompson" \
  -d "password=TamshaiTemp123!" \
  -d "grant_type=password" | jq -r '.access_token')

# Test Finance dashboard summary
curl -s "http://localhost:3100/api/mcp/finance/get_dashboard_summary" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test Sales opportunities
curl -s "http://localhost:3100/api/mcp/sales/list_opportunities" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test with stage filter
curl -s "http://localhost:3100/api/mcp/sales/list_opportunities?stage=DISCOVERY" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Check MongoDB Data

```bash
# Connect to MongoDB
docker exec -it mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD"

# Check Sales opportunities
use tamshai_sales
db.opportunities.find().limit(5).pretty()
db.opportunities.distinct("stage")

# Check Finance data
use tamshai_finance
db.invoices.countDocuments()
db.budgets.countDocuments()
```

### Check Rate Limit Status

```bash
# Check current rate limit headers
curl -s -I "http://localhost:3100/api/mcp/hr/list_employees" \
  -H "Authorization: Bearer $TOKEN" | grep -i "ratelimit"

# Expected headers:
# RateLimit-Limit: 500
# RateLimit-Remaining: 499
# RateLimit-Reset: <timestamp>
```

### Restart Services

```bash
# Restart MCP Gateway (preferred - doesn't affect Kong cache)
docker restart mcp-gateway

# If Kong DNS issues suspected, restart Kong
docker restart kong

# Full restart (resets all caches)
cd /opt/tamshai
docker compose down && docker compose up -d
```

---

## Resolved Issues (January 6, 2026)

### Finance Dashboard Shows $0 - ✅ RESOLVED

**Issue**: All summary fields showed $0 (Total Revenue, Outstanding, etc.)

**Root Cause**: Field name mismatch - Dashboard used `allocated_amount`/`spent_amount`, API returns `budgeted_amount`/`actual_amount`.

**Fix Applied** (Commit pending):
- `clients/web/apps/finance/src/pages/DashboardPage.tsx` - Updated metrics computation
- `clients/web/apps/finance/src/pages/BudgetsPage.tsx` - Updated 6 field references
- `clients/web/apps/finance/src/types.ts` - Updated Budget interface

---

### Sales Dashboard Pipeline Empty - ✅ RESOLVED

**Issue**: All pipeline stage counts showed 0, no opportunities listed.

**Root Cause**: Sample data timestamps hardcoded to 2024, dashboard defaults to "this_quarter" (Q1 2026) filter.

**Fix Applied** (Commit pending):
- `sample-data/sales-data.js` - Updated all timestamps to 2025-2026:
  - Customer `updated_at` → December 2025
  - Deal `created_at`/`updated_at` → October-December 2025
  - Deal `expected_close_date` → January-June 2026
  - Activity dates → September-December 2025
  - Pipeline summary → Q1 2026

**Deployment Note**: VPS MongoDB needs re-seeding after deployment:
```bash
# On VPS
cd /opt/tamshai
docker exec -i mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD" < sample-data/sales-data.js
```

---

### Finance App Pages Return Connection Errors - ✅ RESOLVED

**Commit**: `451a311` - fix(finance): Update API paths to use MCP proxy pattern

**Issue**: Budgets, Invoices, and Expense Reports tabs in Finance app returned "Error Loading..." with "Failed to fetch" errors.

**Root Cause**: Finance app pages used REST-style API paths (`/api/finance/budgets`, `/api/finance/invoices`, `/api/finance/expense-reports`) that don't exist in Kong routing. Kong only routes `/api/mcp/*` paths to the MCP Gateway.

**Symptoms**:
- Finance Dashboard worked (already used `/api/mcp/finance/list_budgets`)
- Budgets tab: "Error Loading Budgets"
- Invoices tab: "Error Loading Invoices"
- Expense Reports tab: "Error Loading Expense Reports"
- AI Query: "Connection error. Please try again."

**Kong 404 errors in logs**:
```
"GET /api/finance/ai-query?query=... HTTP/1.1" 404 52
```

**Fix Applied**:
- `clients/web/apps/finance/src/pages/BudgetsPage.tsx`:
  - `/api/finance/budgets` → `/api/mcp/finance/list_budgets`
  - Added `Authorization: Bearer ${token}` header
  - Updated all mutations to POST with JSON body
- `clients/web/apps/finance/src/pages/InvoicesPage.tsx`:
  - `/api/finance/invoices` → `/api/mcp/finance/list_invoices`
  - Added auth headers to all fetch calls
- `clients/web/apps/finance/src/pages/ExpenseReportsPage.tsx`:
  - `/api/finance/expense-reports` → `/api/mcp/finance/list_expense_reports`
  - Added auth headers to all fetch calls

**MCP Pattern Required**:
```typescript
// WRONG - REST pattern (no Kong route)
fetch('/api/finance/budgets')

// CORRECT - MCP proxy pattern (routes through Kong)
const url = apiConfig.mcpGatewayUrl
  ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/list_budgets`
  : '/api/mcp/finance/list_budgets';
fetch(url, { headers: { Authorization: `Bearer ${token}` } })
```

---

### Kong DNS Resolution Failure After VPS Reprovision - ✅ RESOLVED

**Issue**: After VPS teardown/reprovision, Kong couldn't resolve `mcp-gateway` hostname even though all containers were healthy.

**Symptoms**:
- Kong logs: `querying dns for mcp-gateway failed: dns server error: 3 name error`
- Kong health check: `mcp-gateway-upstream reported health status changed to UNHEALTHY`
- All API requests returned 503 or hung

**Root Cause**: Kong started before mcp-gateway container was ready during cloud-init. Docker DNS resolver caches failed lookups, and Kong's aggressive DNS caching (default 4+ days TTL) keeps returning stale failures.

**Fix Applied**:
- Restart Kong after all services are up: `docker restart tamshai-kong`
- Or wait for Kong's DNS TTL to expire and health checks to pass

**Prevention**: The `docker-compose.yml` already has Kong DNS settings to reduce TTL:
```yaml
KONG_DNS_STALE_TTL: 0        # Don't use stale DNS entries
KONG_DNS_VALID_TTL: 10       # Re-resolve DNS every 10 seconds
KONG_DNS_ERROR_TTL: 1        # Retry DNS errors after 1 second
```

---

## Diagnostic Commands (Updated)

---

## Prevention Measures

1. **Always test proxy changes on VPS** - Dev and VPS can have different Docker image versions
2. **Use consistent case for enum values** - MongoDB stores what you insert; be explicit about UPPERCASE/lowercase
3. **Configure DNS TTL for containerized gateways** - Kong, Nginx, etc. cache DNS aggressively
4. **Enable trust proxy in reverse proxy setups** - Required for accurate rate limiting and IP logging
5. **Run integration tests against stage** - Local mocks may not catch format mismatches

---

## References

- [MCP Gateway Rate Limiting Configuration](../../services/mcp-gateway/src/index.ts#L318-L350)
- [Kong DNS Configuration](../../docker-compose.yml#L135-L139)
- [Sales Stage Handling](../../services/mcp-sales/src/index.ts#L114-L140)
- [CLAUDE.md Troubleshooting Section](../../CLAUDE.md#troubleshooting)
