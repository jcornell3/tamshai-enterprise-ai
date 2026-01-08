# VPS Data Availability Issues - Troubleshooting Guide

**Document Version**: 1.4
**Created**: January 5, 2026
**Last Updated**: January 8, 2026

This document summarizes the issues encountered with data not being available on the VPS staging environment, the bugs fixed, and diagnostic commands for future troubleshooting.

---

## Current Status (as of January 8, 2026)

**Test User**: eve.thompson (executive role, no data restrictions)

| App | Component | Status | Symptoms | Root Cause | Fix Status |
|-----|-----------|--------|----------|------------|------------|
| **HR** | Dashboard | ✅ Working | Shows employees | N/A | N/A |
| **HR** | AI Query | ✅ Working | Returns data | N/A | N/A |
| **Support** | Dashboard | ✅ Working | Shows information | N/A | N/A |
| **Support** | Tickets Tab | ✅ Fixed | "Error loading tickets" | NDJSON file deleted by mistake | File restored |
| **Support** | Knowledge Base | ✅ Fixed | "Error searching KB" | NDJSON file deleted by mistake | File restored |
| **Support** | AI Query | ✅ Fixed | "Connection lost" | Underlying data errors | File restored |
| **Sales** | Dashboard | ✅ Fixed | All values show $0 | Missing pipeline summaries | Summaries added |
| **Sales** | Opportunities | ✅ Working | Shows 6 opportunities | N/A | N/A |
| **Sales** | Customers Tab | ✅ Fixed | "Error loading customers" | Data present, verified | Data verified |
| **Sales** | AI Query | ✅ Fixed | "List customers" failed | Underlying data errors | Data verified |
| **Finance** | Dashboard | ✅ Fixed | Shows $NaN in totals | FY2024 data only | FY2025 added |
| **Finance** | Invoices Tab | ✅ Working | Shows data | N/A | N/A |
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
