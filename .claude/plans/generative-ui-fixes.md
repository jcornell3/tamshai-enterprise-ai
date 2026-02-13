# Generative UI Component Fixes - Complete Plan

## Executive Summary

Apply all fixes from the HR org chart implementation to all other generative UI components across Finance, Sales, Support, and Approvals domains.

**Reference Implementation**: HR Org Chart (commits: a14dadd8, a8ac80a9, 82048858, etc.)

## Components to Fix

### Sales App

- `sales:customer` → CustomerDetailCard
- `sales:leads` → LeadsDataTable
- `sales:forecast` → ForecastChart

### Finance App

- `finance:budget` → BudgetSummaryCard
- `finance:quarterly_report` → QuarterlyReportDashboard

### Support App

- Need to add component registrations (currently none exist)

### Approvals

- `approvals:pending` → ApprovalsQueue (cross-domain)

---

## Phase 1: Infrastructure Fixes (CRITICAL - Blocks Everything)

### 1.1: Caddy Configuration

**Status**: ✅ Already Fixed (commit 82048858)
- Added `/mcp-ui/*` route to Caddyfile.dev
- Added `MCP_UI_PORT` environment variable to Caddy service

### 1.2: Docker Compose Configuration

**Status**: ⚠️ Partial - Need to verify all apps

**Required Changes**:

```yaml
# For each web app (web-sales, web-finance, web-support)
services:
  web-sales:
    build:
      args:
        VITE_MCP_UI_URL: ""  # Empty = use Caddy proxy
  web-finance:
    build:
      args:
        VITE_MCP_UI_URL: ""
  web-support:
    build:
      args:
        VITE_MCP_UI_URL: ""
```

### 1.3: App .env Files

**Status**: ❌ Missing

**Required Files**:
- `clients/web/apps/sales/.env`
- `clients/web/apps/finance/.env`
- `clients/web/apps/support/.env`

**Content**:

```bash
# MCP UI Service URL (local development only)
# Production uses Caddy reverse proxy at /mcp-ui/*
VITE_MCP_UI_URL=http://localhost:3118
```

---

## Phase 2: Frontend Fixes

### 2.1: AIQueryPage URL Fallback

**File Pattern**: `clients/web/apps/{domain}/src/pages/AIQueryPage.tsx`

**Current Issue**:

```typescript
// WRONG - routes to Kong, gets 404
mcpUiUrl = '/api/mcp-ui/display';
```

**Fix**:

```typescript
// CORRECT - routes to Caddy → MCP UI
mcpUiUrl = '/mcp-ui/api/display';
```

**Apps to Fix**:
- ❌ Sales
- ❌ Finance
- ❌ Support
- ✅ HR (already fixed)

### 2.2: Component Styling

**Location**: `clients/web/packages/ui/src/components/generative/`

**Issue**: Components may use custom CSS classes instead of Tailwind

**Reference**: OrgChartComponent.tsx (commit a14dadd8)

**Pattern to Apply**:
1. Use Tailwind utility classes instead of custom CSS
2. Match existing app page styling (check domain-specific pages)
3. Use semantic color tokens:
   - `secondary-200` for neutral backgrounds
   - `secondary-900` for primary text
   - `secondary-600` for secondary text
   - `primary-500`/`primary-50` for highlights
   - `border-secondary-200` for borders

**Components to Audit**:
- ❓ CustomerDetailCard
- ❓ LeadsDataTable
- ❓ ForecastChart
- ❓ BudgetSummaryCard
- ❓ QuarterlyReportDashboard
- ❓ ApprovalsQueue

---

## Phase 3: Backend Fixes (MCP UI Service)

### 3.1: Component Registry Transform Functions

**File**: `services/mcp-ui/src/registry/component-registry.ts`

**Issue**: ID mapping inconsistencies (employee_id vs id, customer_id vs id, etc.)

**Pattern from HR**:

```typescript
transform: (data: unknown): Record<string, unknown> => {
  const nodes = (data as Array<any>) || [];
  const rootNode = nodes.find(n => n.level === 0) || null;

  // Map {domain}_id → id for component compatibility
  const mapEmployee = (emp: any) => emp ? { ...emp, id: emp.employee_id } : null;

  return {
    self: mapEmployee(rootNode),
    directReports: (rootNode?.direct_reports || []).map(mapEmployee),
  };
},
```

**Components to Fix**:
- ❓ sales:customer (customer_id → id)
- ❓ sales:leads (lead_id → id)
- ❓ finance:budget (budget_id → id?)
- ❓ approvals:pending (Multiple IDs: timeoff_id, expense_id, budget_id)

### 3.2: Parameter Resolution

**File**: `services/mcp-ui/src/mcp/mcp-client.ts`

**Issue**: "me" parameter not resolved for all parameter names

**Current Fix** (commit a8ac80a9):

```typescript
if (value === 'me' && (toolParam === 'userId' || toolParam === 'rootEmployeeId' || toolParam.toLowerCase().includes('user'))) {
  value = userContext.userId;
}
```

**Verify**: Does this work for all component parameters?

---

## Phase 4: MCP Server Fixes

### 4.1: Sales MCP Server

**Port**: 3103
**Tools to Audit**:
- `get_customer` - Check customer_id handling, UUID vs VARCHAR
- `list_leads` - Check lead_id handling
- `get_forecast` - Check return structure

**Pattern to Apply**:
1. PostgreSQL type casting: `WHERE (c.id::text = $1 OR ...)`
2. Relaxed Zod validation: `.string().optional()` instead of `.uuid()`
3. Return arrays with proper ID mapping

### 4.2: Finance MCP Server

**Port**: 3102
**Tools to Audit**:
- `get_budget` - Check department/year parameters
- `get_quarterly_report` - Check quarter/year parameters
- `get_pending_expenses` - Check userId resolution
- `get_pending_budgets` - Check userId resolution

### 4.3: Support MCP Server

**Port**: 3104
**Status**: ❌ No generative UI components registered yet

**Action**: Determine which Support components should be added to registry

---

## Phase 5: Testing & Validation

### 5.1: Component Rendering Tests

**For Each Component**:
1. Create test directive (e.g., `display:sales:customer:customerId=CUST-001`)
2. Test in AI Query page
3. Verify:
   - ✅ Data loads without errors
   - ✅ Component renders with proper styling
   - ✅ No console errors
   - ✅ Responsive layout works
   - ✅ Voice narration (if applicable)

### 5.2: E2E Test Cases

**Test Matrix**:
| Domain | Component | Test Query | Expected Result |
|--------|-----------|------------|-----------------|
| Sales | customer | "Show customer ACME Corp" | CustomerDetailCard with contacts |
| Sales | leads | "Show me hot leads" | LeadsDataTable with status=hot |
| Sales | forecast | "Sales forecast Q1 2026" | ForecastChart for Q1 |
| Finance | budget | "Show Engineering budget" | BudgetSummaryCard for dept |
| Finance | quarterly_report | "Q4 2025 financial report" | QuarterlyReportDashboard |
| Approvals | pending | "Show my pending approvals" | ApprovalsQueue with counts |

---

## Phase 6: Documentation

### 6.1: Update Component Registry Docs

- Document ID mapping patterns
- Document parameter resolution rules
- Add examples for each component

### 6.2: Update CLAUDE.md

- Add generative UI troubleshooting section
- Document common pitfalls (employee_id vs id, CORS, etc.)

---

## Execution Order (TDD Approach)

### Step 1: Infrastructure (Phase 1)

1. Create .env files for all apps
2. Verify docker-compose.yml build args
3. Verify Caddy configuration

### Step 2: Frontend AIQueryPage (Phase 2.1)

1. Fix Sales AIQueryPage URL fallback
2. Fix Finance AIQueryPage URL fallback
3. Fix Support AIQueryPage URL fallback
4. Rebuild containers

### Step 3: Backend Component Registry (Phase 3.1)

1. Audit all transform functions
2. Add ID mapping where needed
3. Test with sample data

### Step 4: Component Styling (Phase 2.2)

1. Audit each component for custom CSS
2. Convert to Tailwind (reference OrgChartComponent)
3. Match domain-specific page styling

### Step 5: MCP Server Fixes (Phase 4)

1. Sales MCP tools
2. Finance MCP tools
3. Add Support components (if needed)

### Step 6: E2E Testing (Phase 5)

1. Test each component manually
2. Create automated test suite
3. Document test cases

---

## Risk Assessment

### High Risk

- ❗ CORS/routing issues (already fixed for HR, need to verify for others)
- ❗ ID mapping inconsistencies causing component render failures

### Medium Risk

- ⚠️ Component styling mismatches
- ⚠️ Parameter resolution edge cases

### Low Risk

- ℹ️ Voice narration quality
- ℹ️ Empty state handling

---

## Success Criteria

- [ ] All 6 generative UI components render properly
- [ ] All components use Tailwind styling
- [ ] All components have correct ID mapping
- [ ] All apps route to /mcp-ui/api/display correctly
- [ ] E2E tests pass for all components
- [ ] Documentation updated

---

**Estimated Effort**: 4-6 hours
**Priority**: HIGH (blocks generative UI feature)
**Dependencies**: None (infrastructure already in place)
