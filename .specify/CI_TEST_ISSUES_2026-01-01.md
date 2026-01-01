# CI Integration Test Issues - 2026-01-01

## Summary

This document captures the issues discovered during CI/CD integration test debugging and their resolutions.

---

## Issues Fixed

### 1. Elasticsearch Healthcheck Timeout (Exit Code 124)
**Status**: ✅ Fixed (c66eb63)

**Root Cause**: The `elasticsearch-node health` command requires a fully initialized cluster (150-240 seconds), but CI timeout was 180 seconds.

**Fix**: Changed to TCP socket check that only needs the port listening:
```yaml
timeout 180 bash -c 'until docker exec elasticsearch timeout 1 bash -c "</dev/tcp/localhost/9200" 2>/dev/null; do sleep 5; done'
```

---

### 2. PostgreSQL Database Not Found
**Status**: ✅ Fixed (bbf27d6)

**Root Cause**: postgres-mcp service only created `tamshai_hr` by default, but services tried to connect to `tamshai` database.

**Fix**: Changed `POSTGRES_DB` from `tamshai_hr` to `tamshai` and manually create additional databases.

---

### 3. Missing `fail()` Import
**Status**: ✅ Fixed (2796ad3)

**Root Cause**: Test files used `fail()` function without importing it from the `assert` module.

**Fix**: Added `import { fail } from 'assert'` to 3 test files.

---

### 4. Redis Port Mismatch (6380 vs 6379)
**Status**: ✅ Fixed (daa2937)

**Root Cause**: MCP servers use `REDIS_HOST` and `REDIS_PORT` environment variables (defaulting to port 6380), but CI passed `REDIS_URL` which was not parsed.

**Fix**: Changed CI to pass `REDIS_HOST: localhost` and `REDIS_PORT: 6379` instead of `REDIS_URL`.

---

### 5. list_opportunities Schema Mismatch
**Status**: ✅ Fixed (39f0730)

**Root Cause**:
- Zod schema used `status` field but MongoDB documents have `stage` field
- Test passes `stage: 'negotiation'` (lowercase) but DB stores `'NEGOTIATION'` (uppercase)

**Fix**:
- Changed schema to accept `stage` instead of `status`
- Convert stage to uppercase for MongoDB query
- Normalize returned stage to lowercase for API consistency

---

### 6. list_invoices Status Case Mismatch
**Status**: ✅ Fixed (39f0730)

**Root Cause**: PostgreSQL stores status as uppercase ('PAID'), but test expects lowercase ('paid').

**Fix**: Added normalization to convert status to lowercase in response.

---

### 7. get_budget Response Structure
**Status**: ✅ Fixed (39f0730)

**Root Cause**: Test expects `response.data.data.department` but API returned an array of budget items.

**Fix**: Changed response to return an object with:
- `department`: Department name (top-level)
- `fiscal_year`: Requested year
- `budgets`: Array of budget items
- `total_budgeted`: Sum of all budgeted amounts
- `total_actual`: Sum of all actual amounts

---

### 8. delete_invoice UUID Requirement
**Status**: ✅ Fixed (39f0730)

**Root Cause**: Schema required UUID for `invoiceId` but test passes 'INV-001' (invoice number format).

**Fix**:
- Relaxed Zod schema to accept any non-empty string
- Added regex to detect UUID vs invoice_number format
- Query by appropriate column based on format

---

### 9. Missing Test Invoice Data
**Status**: ✅ Fixed (39f0730)

**Root Cause**: Test uses `invoiceId: 'INV-001'` but sample data only had `INV-2024-XXX` format invoices.

**Fix**: Added `INV-001` test invoice with PENDING status to sample data.

---

### 10. MongoDB Database Name Mismatch
**Status**: ✅ Fixed (1d449fa)

**Root Cause**:
- CI passes `MONGODB_URL: mongodb://...@host:port/tamshai_sales?...`
- MCP Sales server code expects `MONGODB_URI` (not `MONGODB_URL`)
- Code uses `MONGODB_DB` for database name but CI embeds it in URL

**Server Log Evidence**:
```
Sample data loaded into: tamshai_sales
MCP Sales server connects to: tamshai_crm (default)
```

**Fix**:
- Accept both `MONGODB_URL` and `MONGODB_URI` environment variables
- Parse database name from URL if present
- Fall back to `MONGODB_DB` env var or default

---

## Issues Still In Progress

### 11. Write Tool Endpoints (pending_confirmation)
**Status**: ⏳ Pending

**Description**: Several write tools return 'error' instead of 'pending_confirmation':
- `delete_invoice` (Finance)
- `approve_budget` (Finance)
- `close_opportunity` (Sales)
- `delete_customer` (Sales)
- `close_ticket` (Support)

**Root Cause**: Write tools may have issues with Redis confirmations or implementation.

---

### 12. get_knowledge_article Returns Error
**Status**: ⏳ Pending

**Description**: Test expects 'success' but receives 'error'.

**Possible Causes**:
- kb_id field mismatch in Elasticsearch query
- Sample data article IDs don't match test expectations

---

## Commits Made

| Commit | Description |
|--------|-------------|
| c66eb63 | Fix Elasticsearch healthcheck with TCP socket |
| bbf27d6 | Fix postgres-mcp default database |
| 2796ad3 | Add missing fail() import |
| 28448b9 | Add RBAC authorization to MCP endpoints |
| daa2937 | Fix Redis port mismatch in CI |
| 39f0730 | Fix data structure mismatches and case normalization |
| 1d449fa | Fix MongoDB URL parsing for Sales server |

---

## Test Status

- **Before fixes**: 46/74 passing (28 failing)
- **Current status**: Awaiting CI run results

---

## Files Modified

### CI Workflow
- `.github/workflows/ci.yml` - Elasticsearch, Redis, PostgreSQL fixes

### MCP Finance
- `services/mcp-finance/src/tools/get-budget.ts` - Response structure
- `services/mcp-finance/src/tools/list-invoices.ts` - Status normalization
- `services/mcp-finance/src/tools/delete-invoice.ts` - Accept invoice_number

### MCP Sales
- `services/mcp-sales/src/index.ts` - Stage filter, ObjectId serialization
- `services/mcp-sales/src/database/connection.ts` - MongoDB URL parsing

### Sample Data
- `sample-data/finance-data.sql` - Added INV-001 test invoice

---

---

## Potential Future Issues: Naming Inconsistencies

The following naming inconsistencies were identified during code review that could cause future CI failures:

### 1. MongoDB Database Fallback: `tamshai_crm` vs `tamshai_sales` (HIGH RISK)
**Status**: ✅ Fixed

**Location**: `services/mcp-sales/src/database/connection.ts:33`

```typescript
const DATABASE_NAME = process.env.MONGODB_DB || extractDatabaseFromUrl(MONGODB_URL) || 'tamshai_crm';
```

**Issue**: The fallback default is `tamshai_crm` but all actual configurations use `tamshai_sales`:
- `infrastructure/docker/docker-compose.yml:226` → `MONGODB_DB: tamshai_sales`
- `docker-compose.vps.yml:216` → `MONGODB_DB: tamshai_sales`
- `sample-data/sales-data.js:5` → `db.getSiblingDB('tamshai_sales')`
- `.github/workflows/ci.yml:429` → loads into `tamshai_sales`
- `.github/workflows/ci.yml:650` → passes `tamshai_sales` in URL

**Risk**: If `MONGODB_DB` and `MONGODB_URL` env vars are both missing or malformed, the server will connect to `tamshai_crm` (which doesn't exist) instead of `tamshai_sales`.

**Fix Applied**: Changed fallback from `'tamshai_crm'` to `'tamshai_sales'` at line 33.

---

### 2. Redis Port Default: 6380 vs 6379 (MEDIUM RISK)
**Status**: ✅ Fixed

**Locations with 6380 default**:
- `services/mcp-hr/src/utils/redis.ts:22` → `port: parseInt(process.env.REDIS_PORT || '6380')`
- `services/mcp-finance/src/utils/redis.ts:22` → `port: parseInt(process.env.REDIS_PORT || '6380')`
- `services/mcp-sales/src/utils/redis.ts:18` → `port: parseInt(process.env.REDIS_PORT || '6380')`
- `services/mcp-support/src/utils/redis.ts:16` → `port: parseInt(process.env.REDIS_PORT || '6380')`
- `tests/integration/mcp-tools.test.ts:25` → `redis://127.0.0.1:6380`

**Locations with 6379 default**:
- `services/mcp-gateway/src/utils/redis.ts:28` → `port: parseInt(process.env.REDIS_PORT || '6379')`

**Docker Compose/CI use 6379**:
- All docker-compose files pass `REDIS_PORT: 6379`
- CI workflow passes `REDIS_PORT: 6379`

**Issue**: Code defaults (6380) don't match runtime configuration (6379). The env vars currently save us, but if they're missing, services will try to connect to port 6380.

**Risk Level**: Medium - Currently mitigated by env vars but fragile.

**Fix Applied**: Standardized all defaults to 6379 (matching Docker/CI) in all 5 files.

---

### 3. Documentation References Outdated Database Names (LOW RISK)
**Status**: ✅ Fixed

The following documentation files still reference `tamshai_crm` instead of `tamshai_sales`:
- `docs/architecture/V1.4_IMPLEMENTATION_SUMMARY.md:445`
- `.specify/ARCHITECTURE_SPECS.md:157`
- `tests/integration/README.md:248`
- `.specify/specs/004-mcp-suite/spec.md:235`
- `.specify/specs/001-foundation/tasks.md:24`
- `.specify/specs/001-foundation/spec.md:28`
- `.specify/specs/001-foundation/plan.md:53`

**Risk**: Developer confusion, not a runtime issue.

**Fix Applied**: Updated all 7 documentation files to use `tamshai_sales`.

---

### 4. Environment Variable Naming: REDIS_URL vs REDIS_HOST/REDIS_PORT (LOW RISK)
**Status**: 📝 Inconsistent Patterns

**Pattern 1 (separate vars)**:
- All MCP servers use `REDIS_HOST` + `REDIS_PORT`

**Pattern 2 (URL string)**:
- `docker-compose.secure.yml:117` → `REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379`
- `mcp-gateway/src/__tests__/setup.ts:9` → `REDIS_URL = 'redis://localhost:6379'`
- `mcp-gateway/src/security/token-revocation.ts:27` → `redisUrl: process.env.REDIS_URL`

**Risk**: Low - Most services use REDIS_HOST/REDIS_PORT consistently, but token-revocation.ts uses REDIS_URL.

---

### 5. Keycloak Realm Name (VERIFIED CONSISTENT)
**Status**: ✅ OK

All references use `tamshai-corp` consistently:
- `tests/integration/mcp-tools.test.ts:20` → `'tamshai-corp'`
- CI workflow → `tamshai-corp`

---

## Summary of Fixes Applied

| Priority | Issue | Location | Status |
|----------|-------|----------|--------|
| HIGH | MongoDB fallback `tamshai_crm` | `mcp-sales/src/database/connection.ts:33` | ✅ Fixed |
| MEDIUM | Redis port defaults 6380 | 5 files (4 MCP servers + integration test) | ✅ Fixed |
| LOW | Documentation outdated | 7 documentation files | ✅ Fixed |

---

*Document generated: 2026-01-01*
*Updated: 2026-01-01 (Added naming inconsistency analysis)*
