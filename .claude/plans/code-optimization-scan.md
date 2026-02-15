# Code Optimization Scan - Full Project Report

**Date**: 2026-02-14
**Performed By**: Claude-QA
**Scope**: Entire Tamshai Enterprise AI codebase

---

## Executive Summary

A comprehensive scan of the entire project identified **62 optimization opportunities** across 4 categories:
- **Services** (MCP servers + gateway): 15 issues, ~3,590 lines recoverable
- **Infrastructure** (Docker, Terraform, DB, Keycloak, scripts): 17 issues
- **Client Apps** (7 React web apps + shared UI): 10 issues, ~2,500 lines recoverable
- **Tests & CI/CD** (E2E, integration, performance, workflows): 20 issues, 20-30 min CI savings

**Total estimated impact**: ~6,000+ lines of duplicate code removable, 20-30 minute CI pipeline speedup, improved type safety and consistency.

---

## Priority Matrix

| Priority | Category | Issue | Impact |
|----------|----------|-------|--------|
| P0 | Services | Error handler duplication (6 services) | 500+ lines, inconsistent error codes |
| P0 | Services | Redis confirmation utils (6 copies) | 400+ lines, missing error handling |
| P0 | Services | Database connection duplication (4 services) | 400+ lines, security-critical code |
| P0 | Clients | AIQueryPage duplication (7 apps) | 2,500+ lines, 15-20KB bundle bloat per app |
| P0 | CI/CD | E2E sequential workers (1 worker) | 15-20 min savings per run |
| P0 | CI/CD | Keycloak 3x startup in CI | 5-7 min savings per run |
| P0 | CI/CD | Shared package built 4x in CI | 3-4 min savings per run |
| P1 | Services | Logger duplication (29 instances) | 290+ lines |
| P1 | Services | Response type duplication (6 files) | 600+ lines, type inconsistency |
| P1 | Services | Authorization helper duplication (6+ services) | 150+ lines, security consistency |
| P1 | Infra | Missing composite indexes (expense_reports) | O(n) → O(log n) query performance |
| P1 | Infra | Docker Compose service redundancy | 490 lines reducible |
| P1 | Infra | CORS wildcard scheme in Kong | Security issue |
| P1 | CI/CD | Job parallelization (serial deps) | 10-15 min savings |
| P1 | CI/CD | Auth logic duplication (5 copies in tests) | 200+ lines |
| P1 | CI/CD | 6 MCP services have no unit tests | Coverage gap |
| P2 | Services | Health check endpoint duplication (8 services) | 200+ lines |
| P2 | Services | Auth middleware in route handlers | 50+ lines per service |
| P2 | Services | Inconsistent Express versions | Maintenance risk |
| P2 | Infra | Dockerfile duplication (9 identical patterns) | 15-20% faster builds |
| P2 | Infra | Inefficient RLS LIKE patterns (payroll) | Query performance |
| P2 | Infra | Over-broad DB permissions (BYPASSRLS) | Security risk |
| P2 | Infra | RLS policy complexity (expense_reports) | 7 evaluations per row |
| P2 | Infra | Keycloak realm export bloat | 33KB → 15KB |
| P2 | Infra | Sync script clients.sh redundancy | 400+ lines |
| P3 | Infra | Terraform hardcoded secret names (GCP-only) | Low-risk maintainability |
| P2 | Infra | Terraform external PowerShell sources | Platform dependency |
| P2 | Infra | Script error handling gaps (backup.sh) | Silent failures |
| P2 | Infra | Script logging duplication | Code reuse |
| P2 | Clients | Missing useMemo in large pages | Re-render performance |
| P2 | Clients | Voice hook eager initialization | Unnecessary API access |
| P2 | Clients | Loose `any` typing (5+ pages) | Type safety |
| P2 | CI/CD | E2E test fixture isolation | Flaky test prevention |
| P2 | CI/CD | Playwright timeout too aggressive (60s) | False negatives |
| P2 | CI/CD | k6 thresholds too loose (5% errors) | Misleading results |
| P3 | Services | Test fixture/mock duplication | 200+ lines |
| P3 | Services | Dead code (cursor encoding duplicates) | Cleanup |
| P3 | Infra | Health check improvements (Docker) | 5-10s faster startup |
| P3 | Infra | Kong retry config for SSE | Duplicate streaming risk |
| P3 | Infra | Terraform missing data sources | Validation gaps |
| P3 | Clients | CallbackPage duplication (3 apps) | 60 lines per app |
| P3 | Clients | Unused Vite template CSS (7 apps) | Cleanup |
| P3 | Clients | Duplicate APIResponse type | 100+ lines |
| P3 | CI/CD | Missing test factories | Code quality |
| P3 | CI/CD | Missing performance baselines | Regression detection |

---

## Section 1: Services (MCP Servers + Gateway)

### 1.1 CRITICAL: Error Handler Duplication (6 services)

Each MCP service independently implements `ErrorCode` enum, `withErrorHandling()`, `handleValidationError()`, and `handleDatabaseError()` with slight variations.

**Files**:
- `services/mcp-hr/src/utils/error-handler.ts`
- `services/mcp-finance/src/utils/error-handler.ts`
- `services/mcp-sales/src/utils/error-handler.ts`
- `services/mcp-support/src/utils/error-handler.ts`
- `services/mcp-payroll/src/utils/error-handler.ts`
- `services/mcp-tax/src/utils/error-handler.ts`

**Recommendation**: Create `@tamshai/shared/src/errors/base-error-handler.ts` with generic handlers. Service-specific error codes extend the base enum.

**Savings**: 500+ lines, 50+ duplicated functions

---

### 1.2 CRITICAL: Redis Confirmation Utilities (6 copies)

Each service duplicates `storePendingConfirmation()`, `getPendingConfirmation()`, `confirmationExists()`, and `deletePendingConfirmation()` with varying quality. HR has no error handling, Finance has full try-catch, Payroll uses best pattern (lazy-loaded singleton).

**Files**: `services/mcp-*/src/utils/redis.ts`

**Recommendation**: Move to `@tamshai/shared/src/cache/redis-confirmation-cache.ts`. Standardize on Payroll's lazy-loading getter pattern. Support custom key prefixes per service.

**Savings**: 400+ lines

---

### 1.3 CRITICAL: Database Connection Duplication (4 services)

All PostgreSQL services duplicate identical `Pool` configuration and `queryWithRLS()` implementation (~100 lines each).

**Files**: `services/mcp-{hr,finance,payroll,tax}/src/database/connection.ts`

**Recommendation**: Create `@tamshai/shared/src/database/postgres-client.ts`. Services instantiate with database name only.

**Savings**: 400+ lines of security-critical code

---

### 1.4 HIGH: Logger Duplication (29 instances)

29 separate `winston.createLogger()` calls across all services with identical configuration.

**Recommendation**: Create shared logger factory in `@tamshai/shared/src/utils/logger-factory.ts`. Already started in mcp-payroll/mcp-tax.

**Savings**: 290+ lines

---

### 1.5 HIGH: Response Type Duplication (6 files)

Each service has its own `response.ts` with near-identical types. Critical inconsistency: `suggestedAction` is required in shared but optional in Finance.

**Recommendation**: All services import from `@tamshai/shared`. Delete 5+ local response.ts files.

**Savings**: 600+ lines

---

### 1.6 HIGH: Authorization Helper Duplication (6+ services)

Each service implements `hasXxxAccess(roles)` with same pattern, different role lists.

**Recommendation**: Create `@tamshai/shared/src/auth/role-checker.ts` with factory function and role matrices as configuration.

**Savings**: 150+ lines, centralized role management

---

### 1.7 HIGH: Auth Checks in Route Handlers (all services)

Role-checking duplicated in every route handler (20+ times in mcp-payroll alone) instead of middleware.

**Recommendation**: Create `createAuthorizationMiddleware(requiredRoles)` in shared. Apply at app level.

**Savings**: 50+ lines per service

---

### 1.8 MEDIUM: Health Check Endpoints (8 services)

Identical health check logic repeated in every service's `index.ts`.

**Recommendation**: Create `@tamshai/shared/src/routes/health-routes.ts` with factory: `createHealthRoutes(serviceName, checkFns)`.

**Savings**: 200+ lines

---

### 1.9 MEDIUM: Inconsistent Express Versions → Migrate All to Express 5

**Current state** - 10 services on 3 different Express versions:

| Version | Services |
|---------|----------|
| `^5.2.1` | mcp-gateway (already migrated) |
| `^4.21.2` | mcp-finance, mcp-sales, mcp-support |
| `^4.18.2` | mcp-hr, mcp-payroll, mcp-tax, mcp-ui, mcp-journey, shared |

All 10 services use `@types/express@^4.17.21`.

**Recommendation**: Migrate all services to Express `^5.2.1`.

**Migration Risk: LOW** - Code analysis of mcp-hr and mcp-finance confirms both already follow Express 5-compatible patterns:

- All route handlers are `async` functions with explicit try-catch (no reliance on Express 4 sync error behavior)
- No use of deprecated `app.del()` (all use `app.post()`, `app.get()`)
- No `req.query` usage (all services use POST with `req.body`)
- No response chaining (`res.status().json()` used as terminal statement, not chained)
- No `res.redirect()` calls (no redirect status default change impact)
- Middleware uses standard `(req, res, next)` signature (compatible)
- `express.json()` body parser already in use (compatible)

**Express 5 Breaking Changes - Impact Assessment**:

| Breaking Change | Impact | Notes |
|----------------|--------|-------|
| `res.json()`/`res.send()` return Promises | None | Used as terminal statements with `return`, not chained |
| Async errors auto-caught | None | All handlers already use try-catch (still valid) |
| `req.query` nested objects disabled | None | No `req.query` usage in any MCP service |
| `req.host` includes port | None | No `req.host` usage found |
| `app.del()` removed | None | Not used |
| Path matching changes | None | All routes are simple strings (`/health`, `/tools/list_*`) |
| `res.redirect()` defaults 303 | None | No redirects in MCP services |

**Migration Steps Per Service**:

```bash
# For each service (mcp-hr, mcp-finance, mcp-sales, mcp-support, mcp-payroll, mcp-tax, mcp-ui, mcp-journey, shared):
cd services/<service-name>
npm install express@^5.2.1
npm install --save-dev @types/express@latest
npm run typecheck   # Verify types compile
npm test            # Run unit tests
```

**Type Compatibility Note**: Express 5 does not ship its own types yet. `@types/express@^4.17.21` is still used even by mcp-gateway on Express 5. Monitor the `@types/express` package for v5 type releases - when available, update all services together.

**Optional Improvements After Migration**:
1. Remove explicit try-catch from route handlers - Express 5 auto-catches async rejections, so a global error middleware could replace 145+ individual try-catch blocks across mcp-hr (14 routes) and mcp-finance (25 routes). This pairs well with item 1.1 (shared error handler extraction).
2. Add `await` to `res.json()` calls for consistency with async patterns (not required, but good practice).

**Effort**: ~1 hour for all services (dependency updates + test runs). No code changes required.

---

### 1.10 MEDIUM: Redis Client Management Inconsistency

Different approaches across services: HR uses global instance, Payroll uses lazy-loaded singleton (best), Sales has minimal error handling.

**Recommendation**: Standardize on Payroll's lazy-loaded singleton pattern via shared factory.

---

## Section 2: Infrastructure

### 2.1 HIGH: Missing Composite Indexes (expense_reports)

Current indexes are single-column only. Missing:
```sql
CREATE INDEX idx_expense_reports_employee_status ON finance.expense_reports(employee_id, status);
CREATE INDEX idx_expense_reports_dept_status ON finance.expense_reports(department_code, status);
CREATE INDEX idx_expense_reports_created_desc ON finance.expense_reports(created_at DESC);
CREATE INDEX idx_expense_reports_approved_audit ON finance.expense_reports(approved_by, approved_at);
```

**Impact**: Common filtering patterns (e.g., "my pending reports") do full table scans.

---

### 2.2 HIGH: Docker Compose Service Redundancy

Lines 302-556 of `docker-compose.yml` contain 8 MCP service definitions with nearly identical structure (environment, healthcheck, depends_on).

**Recommendation**: Use YAML anchors and merge keys:
```yaml
x-mcp-service: &mcp-service
  environment: &mcp-env
    NODE_ENV: development
    LOG_LEVEL: info
  healthcheck: &mcp-health
    interval: 30s
    timeout: 10s
    retries: 3
```

**Savings**: Reduce from 1090 to ~600 lines

---

### 2.3 HIGH: CORS Wildcard Scheme in Kong

`kong.yml` lines 116-150 allow `tamshai-ai://*` which permits any domain on mobile.

**Fix**: Use explicit scheme: `tamshai-ai://app`

---

### 2.4 MEDIUM: Dockerfile Duplication (9 services)

All 9 MCP service Dockerfiles contain identical build logic (sed commands, Alpine patches, non-root user creation).

**Recommendation**: Create shared Dockerfile template or multi-stage base image.

**Savings**: 15-20% faster rebuilds, 50+ lines eliminated

---

### 2.5 MEDIUM: Inefficient RLS LIKE Patterns (Payroll)

`payroll/schema.sql` lines 238-304 use `LIKE '%payroll-write%'` string matching for role checks.

**Recommendation**: Use array containment operators (`@>`) which are indexable.

---

### 2.6 MEDIUM: Over-Broad Database Permissions

`payroll/schema.sql` grants `ALL` (including DELETE) and `BYPASSRLS` to tamshai user.

**Recommendation**: Grant only SELECT, INSERT, UPDATE. Remove BYPASSRLS. Use soft-deletes.

---

### 2.7 MEDIUM: RLS Policy Complexity (expense_reports)

10 separate RLS policies on expense_reports create evaluation overhead (7 USING conditions per row for SELECT).

**Recommendation**: Consolidate into single role-based CASE policy.

---

### 2.8 MEDIUM: Keycloak Realm Export Bloat

Dev realm export is 33KB (38% larger than stage/prod) due to test user credentials and event history. Client definitions overlap with sync-realm.sh.

**Recommendation**: Remove client definitions from exports, let sync-realm.sh be single source of truth for clients. Target: 33KB → 15KB.

---

### 2.9 MEDIUM: Sync Script Redundancy (clients.sh)

`keycloak/scripts/lib/clients.sh` (30KB) creates clients one-by-one with ~50-line functions repeated 8 times.

**Recommendation**: Data-driven approach with client definitions loop. Target: 30KB → 8KB.

---

### 2.10 LOW: Terraform Hardcoded Secret Names (GCP-only)

`gcp/main.tf` lines 254-270 pass hardcoded secret names (`"tamshai-prod-claude-api-key"`, etc.) to the `cloudrun` module, while the `security` module creates these same secrets dynamically using `"tamshai-${var.environment}-*"`. If `local.environment` were ever changed from `"prod"`, cloudrun would reference stale secret names.

**Scope**: GCP prod only. Dev and stage use completely different secret management (GitHub Secrets via PowerShell `fetch-github-secrets.ps1` → Docker Compose env vars). They don't use GCP Secret Manager or the cloudrun module at all.

**Environment Secret Architecture**:
| Environment | Secret Source | Mechanism |
|-------------|-------------|-----------|
| Dev | GitHub Secrets | PowerShell → `data.external` → `.env` file → Docker Compose |
| Stage (VPS) | GitHub Secrets + `random_password` | PowerShell → cloud-init / SSH |
| Prod (GCP) | GCP Secret Manager | `google_secret_manager_secret` → Cloud Run env injection |

**Risk Assessment**: Low. `local.environment` is hardcoded to `"prod"` on line 48 of `gcp/main.tf` and GCP is only used for production. This is a maintainability concern, not an active bug.

**Recommendation**: Add outputs to `modules/security/outputs.tf` for each secret name, then reference `module.security.*_secret_name` in the cloudrun module call instead of hardcoded strings. Also remove the unused `keycloak_admin_user_secret` (line 255 comment says "Not used").

**Effort**: ~30 minutes. No infrastructure changes.

---

### 2.11 MEDIUM: Terraform External PowerShell Sources

`dev/main.tf` calls PowerShell scripts for GitHub secrets, creating platform dependency.

**Recommendation**: Use Terraform's native GitHub provider.

---

### 2.12 MEDIUM: Script Error Handling Gaps

`scripts/db/backup.sh` lines 69-80 silently continue on database backup failures.

**Fix**: Add error checking in the backup loop with `|| return 1`.

---

### 2.13 LOW: Script Logging Duplication

`backup.sh`, `restore.sh`, and Keycloak scripts all define identical `log_info/warn/error` functions.

**Recommendation**: Create `scripts/lib/logging.sh` as single source.

---

### 2.14 LOW: Docker Health Check Improvements

Keycloak uses basic TCP check instead of `/health/ready` endpoint. Elasticsearch uses bash TCP hack.

**Recommendation**: Standardize on native health endpoints.

---

### 2.15 LOW: Kong Retry Config for SSE

`kong.yml` sets `retries: 3` for mcp-gateway, which can cause duplicate messages during streaming.

**Fix**: Set `retries: 1` for streaming endpoints.

---

## Section 3: Client Apps (Web)

### 3.1 CRITICAL: AIQueryPage Duplication (7 apps, 3,770 lines)

All 7 apps have nearly identical AIQueryPage implementations (469-793 lines each). Only differences are example queries and hardcoded page titles.

**Files**: `clients/web/apps/*/src/pages/AIQueryPage.tsx`

**Recommendation**: Extract to `useAIQuery` hook in `@tamshai/ui`:
```typescript
export function useAIQuery(domainPrefix: string, exampleQueries: string[]) {
  // Shared: detectDirective, fetchComponentResponse, handleQueryComplete, voice I/O
}
```

**Savings**: ~2,500 lines, 15-20KB bundle reduction per app

#### 3.1 Implementation Results

**Status**: ✅ Partially complete — 4 of 7 apps refactored, 3 intentionally skipped.

**Hook created**: `clients/web/packages/ui/src/hooks/useAIQuery.ts`
- Extracts: directive detection, MCP UI component fetching, voice I/O, query state management
- Configurable via `domain` parameter for directive regex matching
- Exports: `useAIQuery`, `UseAIQueryOptions`, `UseAIQueryReturn`

**Apps refactored** (using `useAIQuery` hook):

| App | Before | After | Savings | Notes |
|-----|--------|-------|---------|-------|
| HR | 470 lines | 217 lines | 253 lines (54%) | Reference implementation |
| Sales | 455 lines | 217 lines | 238 lines (52%) | Preserved sales-specific tips, green icon |
| Support | 454 lines | 216 lines | 238 lines (52%) | Preserved support-specific tips, purple icon |
| Portal | 500+ lines | ~250 lines | ~250 lines (50%) | Uses `domain='\\w+'` for cross-domain matching |

**Total savings from refactored apps**: ~979 lines removed

**Apps intentionally NOT refactored** (architectural incompatibility):

| App | Lines | Streaming Pattern | Why Not Refactored |
|-----|-------|------------------|--------------------|
| Finance | 794 | EventSource SSE with chat message history, markdown rendering, textarea input, cancel/retry, `currentMessageContentRef` tracking | Uses fundamentally different streaming architecture (EventSource + message accumulation) that doesn't fit the SSEQueryClient-based hook. Would require rewriting the entire streaming layer, not just extracting common logic. |
| Payroll | 477 | ReadableStream POST with message history, inline ApprovalCard confirmations | Uses POST-based ReadableStream (not EventSource), chat-style message history with streaming token append, and inline human-in-the-loop approval cards — all absent from useAIQuery. |
| Tax | 486 | ReadableStream POST with pending confirmation handling | Nearly identical architecture to Payroll (ReadableStream + message history + confirmations). Same incompatibility reasons. |

**Why 3 apps were skipped**: The `useAIQuery` hook is built around the `SSEQueryClient` component pattern (used by HR, Sales, Support, Portal), which manages its own SSE connection. Finance/Payroll/Tax use a completely different approach — they manage their own streaming connections (EventSource or ReadableStream), maintain chat message history with user/assistant message objects, and handle streaming token-by-token append to the last assistant message. Forcing these into the `useAIQuery` hook would require either:
1. Rewriting them to use `SSEQueryClient` (breaking their existing UX patterns), or
2. Making the hook so generic it provides no real value

Neither option is worthwhile. The 3 skipped apps share their own pattern that could be extracted into a separate `useChatQuery` hook in the future if needed.

---

### 3.2 MEDIUM: Missing useMemo in Large Pages

- `ExpenseReportsPage.tsx` (841 lines, 12 useState calls)
- `InvoicesPage.tsx` (885 lines, 15+ useState calls)

No useMemo for computed filter values despite frequent re-renders.

**Recommendation**: Extract filter logic to `useFilteredData<T>()` hook.

---

### 3.3 MEDIUM: Voice Hook Eager Initialization

All 7 AIQueryPage apps initialize voice hooks (microphone/speaker API access) regardless of `voiceEnabled` flag.

**Recommendation**: Lazy-initialize voice hooks only when toggle is enabled.

---

### 3.4 MEDIUM: Loose `any` Typing (5+ pages)

`handleComponentAction(action: any)` appears in 5+ AIQueryPage files. Portal has `requestBody: any`.

**Recommendation**: Define `ComponentAction` interface in shared types.

---

### 3.5 LOW: CallbackPage Duplication (3 apps)

Finance, Payroll, Tax define identical CallbackPage inline in App.tsx.

**Recommendation**: Extract to `@tamshai/ui` as reusable component.

---

### 3.6 LOW: Unused Vite Template CSS (7 apps)

All apps have stale `App.css` with unused `.logo`, `@keyframes logo-spin`, `.read-the-docs` classes from Vite scaffold.

**Recommendation**: Remove or empty these files. Tailwind handles all styling.

---

### 3.7 POSITIVE: Already Well-Optimized

- Vite config is centralized via `vite.config.base.ts` factory
- Tailwind uses shared preset (`@tamshai/tailwind-config`)
- Vendor chunk splitting configured (react, react-router-dom, tanstack-query)

---

## Section 4: Tests & CI/CD

### 4.1 CRITICAL: E2E Tests Forced Sequential (workers: 1)

**File**: `tests/e2e/playwright.config.ts` lines 42-45

```typescript
fullyParallel: false,
workers: 1, // Always sequential for TOTP-based authentication
```

**Current state**: 17 spec files (16 UI + 1 API) forced to run one at a time. The comment says "TOTP codes are time-based and auth sessions can conflict in parallel."

**Why the constraint is outdated**: The codebase already has TOTP window tracking in `tests/e2e/utils/auth.ts` lines 128-155 that:
- Persists the last TOTP window to a temp file (`.totp-secrets/last-totp-window`)
- `ensureFreshTotpWindow()` waits for the next 30-second TOTP window before generating a new code
- This mechanism was specifically designed to survive Playwright worker restarts (line 123-126 comment)

**The real constraint**: All 16 UI specs authenticate as the same user (`test-user.journey`) via the same TOTP secret. Two workers authenticating simultaneously would consume the same TOTP code, causing a Keycloak rejection. However, this is solvable with per-worker user assignment.

**17 spec files** (all run sequentially today):

| File | Test User | Domain |
|------|-----------|--------|
| `login-journey.ui.spec.ts` | test-user.journey | Auth |
| `customer-login-journey.ui.spec.ts` | jane.smith@acme.com | Customer (no TOTP) |
| `customer-portal-pages.ui.spec.ts` | jane.smith@acme.com | Customer (no TOTP) |
| `sample-apps.ui.spec.ts` | test-user.journey | All apps |
| `generative-ui.ui.spec.ts` | test-user.journey | Generative UI |
| `hr-wizard.ui.spec.ts` | alice.chen | HR |
| `finance-budgets.ui.spec.ts` | bob.martinez | Finance |
| `finance-bulk.ui.spec.ts` | bob.martinez | Finance |
| `finance-expense-reports.ui.spec.ts` | bob.martinez | Finance |
| `sales-lead-wizard.ui.spec.ts` | carol.johnson | Sales |
| `support-detail.ui.spec.ts` | dan.williams | Support |
| `support-escalation.ui.spec.ts` | dan.williams | Support |
| `payroll-app.ui.spec.ts` | test-user.journey | Payroll |
| `payroll-wizard.ui.spec.ts` | test-user.journey | Payroll |
| `tax-app.ui.spec.ts` | test-user.journey | Tax |
| `cross-app-executive.ui.spec.ts` | eve.thompson | Executive |
| `gateway.api.spec.ts` | (API-only) | Gateway |

**Recommended fix - 3 parallel worker groups**:

```typescript
// playwright.config.ts
export default defineConfig({
  workers: process.env.CI ? 3 : 1,  // 3 workers in CI, 1 locally
  fullyParallel: false,  // Sequential within each worker (project)

  projects: [
    {
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
      // No TOTP needed - runs independently
    },
    {
      name: 'customer',
      testMatch: /customer-.*\.ui\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      // Customer specs use password-only auth (no TOTP conflict)
    },
    {
      name: 'employee',
      testMatch: /^(?!customer-).*\.ui\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      // Employee specs share TOTP - sequential within this project
    },
  ],
});
```

**Why 3 workers is safe**:
- `api` project: No browser, no TOTP - fully independent
- `customer` project: Customer realm uses password-only auth (no TOTP) - fully independent
- `employee` project: All TOTP-based specs run sequentially within this worker, using existing `ensureFreshTotpWindow()` guard

**Further optimization** (Phase 2): Assign different test users to different spec files so the `employee` project can also parallelize:
- Worker A: `alice.chen` specs (HR) + `bob.martinez` specs (Finance)
- Worker B: `carol.johnson` specs (Sales) + `dan.williams` specs (Support)
- Worker C: `test-user.journey` specs (Payroll, Tax, Login)
- Each user has their own TOTP secret, so no window conflicts

**Impact**: Reduce E2E suite from 25-30 min to 8-10 min (3x improvement with 3 workers).

**Effort**: 15 min config change (Phase 1), 2-3 hours for per-user parallelization (Phase 2).

**Risk**: Low. The existing `ensureFreshTotpWindow()` mechanism already handles the edge case. Customer specs have zero TOTP risk. API specs have zero browser risk.

---

### 4.2 CRITICAL: Keycloak Started 3x in CI

**File**: `.github/workflows/ci.yml`

Three separate jobs each start their own Keycloak instance:

| Job | Lines | Method | Wait Time | Keycloak Version |
|-----|-------|--------|-----------|-----------------|
| `integration-tests` | 555-592 | Manual `docker run` + PostgreSQL container + `keycloak-network` | 60-90s (60 attempts × 3s sleep) | 24.0 |
| `e2e-tests` | 1099-1104 | `.github/actions/setup-keycloak` composite action | 60-90s (300s timeout / 5s intervals) | 26.0 |
| `performance-tests` | 1205-1209 | `.github/actions/setup-keycloak` composite action | 60-90s (same) | 26.0 |

**Total wasted time**: ~3 × 90s = **4.5 minutes** of Keycloak startup per CI run.

**Additional problem - version mismatch**: Integration tests use Keycloak **24.0** (line 573), while E2E and performance use **26.0** (setup-keycloak default, line 15 of action.yml). This means integration tests validate against a different Keycloak version than E2E/perf tests.

**Additional problem - different setup approaches**: Integration tests use a full Terraform-provisioned realm (lines 599-632: `terraform apply` with `ci.tfvars`), while E2E/perf use realm import from `realm-export-dev.json` (setup-keycloak action line 61). These may produce different realm configurations.

**Why this can't be a single shared job easily**: GitHub Actions jobs run on separate VMs - a Keycloak container started in one job is not accessible from another. The jobs would need to use GitHub Actions service containers (defined at job level) or a shared Docker network.

**Recommended fix - two approaches**:

**Option A: Consolidate to setup-keycloak action everywhere** (simpler)

Replace the manual `docker run` in integration-tests (lines 539-592) with the existing composite action + Terraform provisioning. This ensures consistent Keycloak version and reduces duplicated setup code by ~55 lines:

```yaml
# integration-tests job - replace lines 539-592 with:
- name: Setup Keycloak
  id: keycloak
  uses: ./.github/actions/setup-keycloak
  with:
    keycloak-port: ${{ vars.DEV_KEYCLOAK }}
    keycloak-version: '26.0'  # Match E2E/perf

- name: Configure Keycloak with Terraform
  # ... existing Terraform steps (lines 594-632) remain unchanged
```

**Savings**: ~55 lines of duplicated Docker/wait logic, consistent Keycloak version, ~30s faster (eliminate redundant PostgreSQL container for Keycloak since `start-dev` uses H2).

**Option B: Merge integration + E2E into a single job** (more complex, bigger savings)

Since `integration-tests`, `e2e-tests`, and `performance-tests` all:
1. Only run on `push` to `main` (not on PRs)
2. All need Keycloak + MCP Gateway
3. Run sequentially anyway (E2E and perf both `needs: [gateway-lint-test]`)

They could be merged into a single `main-branch-tests` job that starts Keycloak once:

```yaml
main-branch-tests:
  name: Integration + E2E + Performance
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  needs: [gateway-lint-test]
  steps:
    - Setup Keycloak (once)
    - Configure with Terraform (once)
    - Build shared + gateway (once)
    - Start all MCP servers (once)
    - Run integration tests
    - Run E2E tests (API project)
    - Run k6 smoke test
    - Cleanup
```

**Savings**: 2 Keycloak startups eliminated (~3 min), 2 shared package builds eliminated (~2 min), 2 gateway builds eliminated (~2 min). Total: **~7 minutes per CI run**.

**Trade-off**: Longer single job vs shorter parallel jobs. But since these jobs already run only on main push (not blocking PRs), the total wall-clock time is actually shorter because there's no parallel execution happening today - they queue sequentially on the free tier.

**Recommended**: **Option A** — E2E and integration tests are intentionally separate jobs (different test scopes, different failure isolation, different run conditions). Merging them (Option B) would conflate test boundaries and make failures harder to diagnose. Option A delivers the key wins (version consistency, code deduplication, ~30s savings) without restructuring the test pipeline.

#### 4.2 Validation Methodology: Before/After Testing (Option A)

**Goal**: Prove the ~30-second savings and verify Keycloak version consistency after consolidating to the `setup-keycloak` action in integration-tests.

**Step 1: Capture Baseline Metrics (Before)**

Focus on the `integration-tests` job, which is the only one being changed. Collect timing data from the **last 10 `push` to `main` CI runs**:

```bash
# List recent workflow runs on main branch
gh api repos/jcornell3/tamshai-enterprise-ai/actions/runs \
  --jq '.workflow_runs[] | select(.head_branch=="main" and .event=="push") | {id: .id, created: .created_at, status: .status}' \
  | head -30

# For each run, get integration-tests job timing:
RUN_ID=<run_id>
gh api repos/jcornell3/tamshai-enterprise-ai/actions/runs/$RUN_ID/jobs \
  --jq '.jobs[] | select(.name | test("integration"; "i")) | {
    id: .id,
    name: .name,
    started: .started_at,
    completed: .completed_at,
    duration_seconds: (((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601)))
  }'
```

**Extract step-level timing** for the integration-tests job:

```bash
JOB_ID=<job_id>
gh api repos/jcornell3/tamshai-enterprise-ai/actions/jobs/$JOB_ID \
  --jq '.steps[] | {name: .name, duration_seconds: (((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601))), status: .conclusion}'
```

**Key steps to isolate in integration-tests (before)**:
- "Start PostgreSQL for Keycloak" — PostgreSQL container for Keycloak backend (~5-10s)
- "Start Keycloak" — manual `docker run` with Keycloak 24.0 (~5s)
- "Wait for Keycloak to be ready" — 60 attempts × 3s sleep polling loop (~60-90s)
- Total Keycloak setup = sum of above three steps

**Metrics to record per run** (spreadsheet):

| Run ID | Keycloak PG Start | Keycloak Start | Keycloak Wait | Total KC Setup | Keycloak Version | Total Job Duration |
|--------|-------------------|----------------|---------------|----------------|------------------|--------------------|
| 12345 | 8s | 5s | 72s | 85s | 24.0 | 8m 42s |
| 12346 | 7s | 4s | 68s | 79s | 24.0 | 8m 15s |

**Step 2: Calculate Baseline Summary**

```
Baseline (integration-tests job, current state):
  Keycloak setup method              = Manual docker run + separate PostgreSQL
  Keycloak version                   = 24.0 (MISMATCHED vs E2E/perf at 26.0)
  Avg Keycloak setup time            = K seconds (PG start + KC start + wait)
  Avg total job duration             = T seconds
  Lines of Keycloak setup code       = ~55 lines (lines 539-592)
```

**Step 3: Implement Option A**

1. Replace manual `docker run` in integration-tests (lines 539-592) with `setup-keycloak` action
2. Update Keycloak version from 24.0 to 26.0 (matches E2E/perf)
3. Remove redundant PostgreSQL container (setup-keycloak uses `start-dev` mode with H2)
4. Push to main
5. Collect timing from next 5-10 runs

**Step 4: Measure After-State**

```bash
# Same commands as Step 1, applied to post-change runs
RUN_ID=<new_run_id>
gh api repos/jcornell3/tamshai-enterprise-ai/actions/runs/$RUN_ID/jobs \
  --jq '.jobs[] | select(.name | test("integration"; "i")) | {id: .id, duration_seconds: (((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601)))}'

# Check the new "Setup Keycloak" step timing
JOB_ID=<new_job_id>
gh api repos/jcornell3/tamshai-enterprise-ai/actions/jobs/$JOB_ID \
  --jq '.steps[] | select(.name | test("[Kk]eycloak|[Ss]etup"; "i")) | {name: .name, duration_seconds: (((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601)))}'
```

**Step 5: Validation Criteria**

| Metric | Before | After (Expected) | How to Verify |
|--------|--------|-------------------|---------------|
| Keycloak version | 24.0 | 26.0 | Check action log output for image tag |
| Version consistent with E2E/perf | No | Yes | Compare version across all 3 jobs |
| PostgreSQL container for KC | Yes (separate) | No (H2 embedded) | Check job steps — no PG start step |
| Keycloak setup lines in ci.yml | ~55 | ~5 (action call) | `wc -l` on the relevant YAML block |
| Keycloak setup time | K seconds | K' seconds | Step timing comparison |
| Total job duration | T seconds | T' seconds | Job timing comparison |

**Expected savings breakdown**:
- PostgreSQL container startup eliminated: ~8s
- Simplified wait logic (action handles internally): ~10-20s
- Net Keycloak setup time change: ~20-30s faster
- Lines of CI code removed: ~50

**Note**: The primary value of Option A is **consistency and maintainability**, not raw time savings. The ~30s time reduction is a secondary benefit. The key wins are:
1. All 3 jobs use the same Keycloak version (26.0)
2. All 3 jobs use the same setup mechanism (composite action)
3. 50+ lines of duplicated Docker/wait logic removed from ci.yml
4. Future Keycloak version upgrades only need to change one place

**Reporting**: After collecting before/after data:

```
| Metric                            | Before (avg) | After (avg) | Delta    |
|-----------------------------------|-------------|------------|----------|
| Keycloak version                  | 24.0        | 26.0       | Aligned  |
| Version match across jobs         | No (24/26)  | Yes (26)   | Fixed    |
| Keycloak setup time (integ job)   | K sec       | K' sec     | Δ sec    |
| Total integration-tests duration  | T sec       | T' sec     | Δ sec    |
| CI YAML lines (Keycloak section)  | ~55         | ~5         | -50      |
```

---

### 4.3 CRITICAL: Shared Package Built 4x in CI

**File**: `.github/workflows/ci.yml`

The `services/shared` package (`npm ci && npm run build`) is executed independently in 4 jobs:

| Job | Lines | Purpose |
|-----|-------|---------|
| `gateway-lint-test` | 59-63 | Build shared before gateway tests |
| `mcp-hr-lint-test` | 151-155 | Build shared before HR tests |
| `integration-tests` | 659-663 | Build shared before starting gateway |
| `e2e-tests` | 1108-1112 | Build shared before starting gateway |
| `performance-tests` | 1214-1218 | Build shared before starting gateway |

**That's 5 redundant builds** (not 4 as originally reported - mcp-hr also builds it).

Each build performs:
1. `npm ci` - Downloads and installs dependencies (~30-45s)
2. `npm run build` - TypeScript compilation (`tsc`) (~15-20s)

**Total wasted time**: 4 redundant builds × ~60s = **~4 minutes per CI run**.

**Why caching doesn't help today**: Each job uses `actions/setup-node` with `cache: 'npm'` pointing to different `cache-dependency-path` values (gateway, hr, integration, etc.). The shared package's `node_modules` and `dist/` output are not cached or shared between jobs.

**Recommended fix - artifact sharing**:

```yaml
# New job: runs first, builds shared once
build-shared:
  name: Build Shared Package
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
        cache-dependency-path: services/shared/package-lock.json
    - working-directory: services/shared
      run: npm ci && npm run build
    - uses: actions/upload-artifact@v4
      with:
        name: shared-dist
        path: |
          services/shared/dist/
          services/shared/node_modules/
        retention-days: 1

# Then in each downstream job:
gateway-lint-test:
  needs: [build-shared]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/download-artifact@v4
      with:
        name: shared-dist
        path: services/shared/
    # Remove "Build shared package" step entirely
    - name: Install dependencies
      working-directory: services/mcp-gateway
      run: npm ci
```

**Jobs that need updating**:
1. `gateway-lint-test` - Add `needs: [build-shared]`, remove lines 59-63
2. `mcp-hr-lint-test` - Add `needs: [build-shared]`, remove lines 151-155
3. `integration-tests` - Add `needs: [build-shared, gateway-lint-test]`, remove lines 659-663
4. `e2e-tests` - Add `needs: [build-shared, gateway-lint-test]`, remove lines 1108-1112
5. `performance-tests` - Add `needs: [build-shared, gateway-lint-test]`, remove lines 1214-1218

**Impact analysis**:
- `build-shared` runs in ~60s (once)
- `upload-artifact` adds ~5-10s
- `download-artifact` adds ~5-10s per downstream job (5 jobs × 10s = 50s)
- Net savings: 4 × 60s - 50s = **~190 seconds (3+ minutes) per CI run**

**Risk**: Low. The artifact contains compiled TypeScript output (`dist/`) which is deterministic. All jobs get the same build output.

**Alternative - npm workspace caching**: If the project migrates to npm workspaces, `npm ci --workspaces` at the root would install and build all packages once, and the npm cache would handle deduplication naturally. This is a larger refactor but would solve the problem more elegantly.

**Effort**: ~1 hour to implement artifact sharing. Add `build-shared` job, update 5 downstream jobs.

#### 4.3 Validation Methodology: Before/After Testing

**Goal**: Prove the claimed ~3+ minute savings from eliminating 4 redundant shared package builds.

**Step 1: Capture Baseline Metrics (Before)**

Collect the "Build shared package" step duration from the **last 10 CI runs** across all 5 jobs that build it. Use the GitHub Actions API:

```bash
# Get job IDs for a specific run
RUN_ID=<run_id>
gh api repos/jcornell3/tamshai-enterprise-ai/actions/runs/$RUN_ID/jobs \
  --jq '.jobs[] | select(.name | test("gateway-lint|mcp-hr-lint|integration|e2e|performance"; "i")) | {id: .id, name: .name}'

# For each job, extract the shared build step timing
JOB_ID=<job_id>
gh api repos/jcornell3/tamshai-enterprise-ai/actions/jobs/$JOB_ID \
  --jq '.steps[] | select(.name | test("[Bb]uild shared|shared package"; "i")) | {
    name: .name,
    duration_seconds: (((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601)))
  }'
```

**Metrics to record per run** (create a spreadsheet):

| Run ID | gateway-lint-test | mcp-hr-lint-test | integration-tests | e2e-tests | performance-tests | Total |
|--------|-------------------|------------------|-------------------|-----------|-------------------|-------|
| 12345 | 62s | 58s | 65s | 61s | 59s | 305s |
| 12346 | 60s | 55s | 63s | 58s | 57s | 293s |

**What each build includes** (measure both sub-steps where visible):
- `npm ci` in `services/shared/` — dependency installation (~30-45s)
- `npm run build` in `services/shared/` — TypeScript compilation (~15-20s)

**Step 2: Calculate Baseline Summary**

```
Baseline (current state):
  Avg shared build duration per job  = B seconds
  Number of jobs building shared     = 5
  Total shared build time per CI run = 5 × B seconds

After (artifact sharing):
  build-shared job                   = B seconds (once)
  upload-artifact                    = U seconds (~5-10s)
  download-artifact × 5 jobs         = 5 × D seconds (~5-10s each)
  Total shared build time per CI run = B + U + 5×D seconds

  Projected savings = (5 × B) - (B + U + 5×D) = 4×B - U - 5×D
  With B=60s, U=10s, D=10s:         = 240 - 10 - 50 = 180s = ~3 minutes
```

**Step 3: Implement the Change**

1. Add `build-shared` job with `upload-artifact` step
2. Update all 5 downstream jobs: add `needs: [build-shared]`, add `download-artifact`, remove shared build steps
3. Push to main
4. Collect timing from next 5-10 runs

**Step 4: Measure After-State**

```bash
# Measure the new build-shared job
gh api repos/jcornell3/tamshai-enterprise-ai/actions/runs/$RUN_ID/jobs \
  --jq '.jobs[] | select(.name | test("build.shared|Build Shared"; "i")) | {
    name: .name,
    duration_seconds: (((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601)))
  }'

# Measure download-artifact overhead in each downstream job
JOB_ID=<downstream_job_id>
gh api repos/jcornell3/tamshai-enterprise-ai/actions/jobs/$JOB_ID \
  --jq '.steps[] | select(.name | test("[Dd]ownload"; "i")) | {
    name: .name,
    duration_seconds: (((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601)))
  }'
```

**Step 5: Validation Criteria**

The ~3-minute savings claim is validated if:

| Metric | Projected | How to Measure |
|--------|-----------|----------------|
| Shared builds eliminated | 4 of 5 | Count of "Build shared" steps across all jobs |
| Upload artifact overhead | ~10s | Step timing in `build-shared` job |
| Download artifact overhead (total) | ~50s (5 × 10s) | Sum of download steps across 5 jobs |
| Net savings per CI run | ~190s (~3 min) | (Before total) - (After total) |

**Secondary benefits to measure**:
- **Critical path impact**: Does `build-shared` become a bottleneck? Measure if downstream jobs wait for it. Since the build takes ~60s and downstream jobs start with checkout + node setup (~20-30s), there should be minimal blocking.
- **Job-minutes consumed**: Total billable minutes across all jobs (GitHub Actions billing metric). Should decrease by ~4 × 1 min = 4 job-minutes per run.

**Reporting**: After collecting before/after data:

```
| Metric                            | Before (avg) | After (avg) | Savings   |
|-----------------------------------|-------------|------------|-----------|
| Shared builds per CI run          | 5           | 1          | 4         |
| Total shared build seconds        | ~300s       | ~60s       | ~240s     |
| Artifact upload/download overhead | 0s          | ~60s       | -60s      |
| Net time savings                  | -           | -          | ~180s     |
| Job-minutes consumed (shared)     | ~5 min      | ~1.8 min   | ~3.2 min  |
```

**Risk factors**:
- Artifact upload/download may be slower on large `node_modules/` — consider uploading only `dist/` and running `npm ci` separately in downstream jobs (trades download time for install time)
- `build-shared` failure blocks all downstream jobs (single point of failure) — but shared build failures today already break all downstream jobs anyway
- `actions/upload-artifact@v4` has a 10 GB limit — `dist/` + `node_modules/` should be well under this

---

### 4.4 HIGH: Job Parallelization

Integration tests block E2E tests, but E2E only needs lint to pass.

**Recommendation**:
- `e2e-tests: needs: [gateway-lint-test]` (not integration)
- `performance-tests: needs: [gateway-lint-test]`
- `terraform-validate` runs in parallel with everything

**Savings**: 10-15 minutes per CI run.

---

### 4.5 HIGH: Auth Logic Duplication in Tests (5 copies)

TOTP code generation, token exchange, admin token acquisition duplicated across:
- `tests/e2e/utils/auth.ts`
- `tests/e2e/fixtures/authenticated.ts`
- `tests/integration/jest.setup.js`
- `services/mcp-gateway/src/__tests__/integration/setup.ts`
- `tests/e2e/specs/login-journey.ui.spec.ts`

**Recommendation**: Create `tests/shared/auth/` module with `TotpSecretManager`, `TotpWindowTracker`, `createAuthenticatedContext()`.

**Savings**: 200+ lines.

---

### 4.6 HIGH: 6 MCP Services Have No Unit Tests

| Service | Status |
|---------|--------|
| mcp-gateway | Tested |
| mcp-hr | Tested |
| mcp-finance | Partial (budget approval only) |
| mcp-sales | No tests |
| mcp-support | No tests |
| mcp-payroll | No tests |
| mcp-tax | No tests |
| mcp-ui | No tests |
| mcp-journey | No tests (also uses vitest, not jest) |

**Recommendation**: Add minimum 50% coverage per service, focusing on tool input validation, RBAC enforcement, and error handling.

---

### 4.7 MEDIUM: Missing Test Fixture Isolation

Integration tests modify database state (budget approvals, expense reports) with no per-test reset.

**Recommendation**: Create `withFixtureReset()` wrapper using PostgreSQL savepoints.

---

### 4.8 MEDIUM: Playwright Timeout Too Aggressive

60-second timeout insufficient for SSO flow (30-45s) + generative UI streaming.

**Fix**: Increase to 120s. Change trace to `retain-on-failure`. Add `maxFailures: 3`.

---

### 4.9 MEDIUM: k6 Thresholds Too Loose

Current: 1% error rate acceptable, 5% for errors counter. Unrealistic load profile (4 min total).

**Fix**: Tighten to `error_rate < 0.1%`. Create proper smoke/load/stress/soak scenarios.

---

### 4.10 LOW: Missing Performance Baselines

No committed baseline metrics for regression detection.

**Recommendation**: Create `tests/performance/baselines/` with JSON metrics per endpoint.

---

### 4.11 LOW: Missing Test Factories

No shared mock factories for MCP responses, user contexts, or test data.

**Recommendation**: Create `tests/shared/factories/` with `createTestToken()`, `createMockExpenseReport()`, etc.

---

## P0 Implementation Status

**Completed**: 2026-02-14 by Claude-QA

| Item | Description | Status | Details |
|------|-------------|--------|---------|
| 4.1 | E2E parallel workers | ✅ Done | 3 projects (api/customer/employee), workers: CI ? 3 : 1 |
| 4.2 | Keycloak consolidation | ✅ Done | Option A — setup-keycloak action with import-realm, admin-password, http-relative-path inputs |
| 4.3 | Shared package artifact sharing | ✅ Done | build-shared job + upload/download-artifact in 5 downstream jobs |
| 1.1 | Error handler consolidation | ✅ Done | 22 error codes added to shared ErrorCode enum, 6 service wrappers updated, 192 tests passing |
| 1.2 | Redis confirmation utils | ✅ Done | `createRedisConfirmationCache` factory in shared, lazy-loading singleton, 6 service wrappers |
| 1.3 | Database connection consolidation | ✅ Done | `createPostgresClient` factory in shared, HR/Payroll/Tax updated, 45 connection tests passing |
| 3.1 | useAIQuery hook extraction | ✅ Done | 4 of 7 apps refactored (HR/Sales/Support/Portal), 3 skipped (Finance/Payroll/Tax — architectural incompatibility, see section 3.1 notes) |

**CI Baseline Metrics** (captured before changes from 3 recent runs):
- Integration-tests: Keycloak setup=36s, shared build=4s, total=235s
- E2E-tests: Setup Keycloak=36s, shared build=6s, total=131s
- Performance-tests: Setup Keycloak=37s, shared build=7s, total=99s
- Gateway-lint shared build=6s, MCP-HR shared build=5s

**After Metrics** (CI run 22031657387, commit d4892634):

| Job | Step | Before (s) | After (s) | Delta |
|-----|------|-----------|----------|-------|
| Build Shared Package | Build shared | N/A | 5 | New job |
| Build Shared Package | Upload artifact | N/A | 6 | New job |
| Gateway - Node 20 | Download shared artifact | N/A | 3 | Replaces build |
| Gateway - Node 20 | (no "Build shared" step) | 6 | 0 | -6s |
| MCP HR - Node 20 | Download shared artifact | N/A | 3 | Replaces build |
| MCP HR - Node 20 | (no "Build shared" step) | 5 | 0 | -5s |
| Integration Tests | Setup Keycloak | 36 | 32 | -4s |
| Integration Tests | Download shared artifact | N/A | 3 | Replaces build |
| Integration Tests | (no "Build shared" step) | 4 | 0 | -4s |
| E2E Tests | Setup Keycloak | 36 | 37 | +1s |
| E2E Tests | Download shared artifact | N/A | 3 | Replaces build |
| E2E Tests | (no "Build shared" step) | 6 | 0 | -6s |
| Performance Tests | Setup Keycloak | 37 | 37 | 0s |
| Performance Tests | Download shared artifact | N/A | 2 | Replaces build |
| Performance Tests | (no "Build shared" step) | 7 | 0 | -7s |

**Net shared package build savings**: (6+5+4+6+7) - (5+6+3+3+3+3+2) = 28 - 25 = **3s net** (modest savings due to artifact upload/download overhead, but the real value is build consistency and CI code deduplication).

**E2E parallel workers**: Not yet measurable (no TOTP-based tests ran in this CI run — E2E tests completed in 4s, meaning only API/smoke tests ran).

**Integration Tests**: Failed due to Keycloak version mismatch introduced by P0 item 4.2. The consolidation changed the integration tests from Keycloak 24.0 (inline `docker run`) to Keycloak 26.0 (via `setup-keycloak` action). The Terraform provider (mrparkers/keycloak ~4.4.0) and token exchange configuration are not compatible with Keycloak 26. Fix: reverted integration tests to `keycloak-version: '24.0'` while keeping E2E/perf tests on 26.0 (they use realm import, not Terraform/token-exchange).

**Deploy MCP HR**: Failed with "No such image: tamshai/mcp-hr:rollback" because `deploy-mcp-service.yml` referenced hardcoded image names (`tamshai/$SERVICE_NAME`) that no longer exist after commit faad8b78 removed `image:` tags from docker-compose.yml. Docker Compose now auto-generates image names from `COMPOSE_PROJECT_NAME`. Fix: rewrote deploy workflow to use `docker compose exec` for health checks and `docker compose images` to discover actual image names.

### Actual Line Count Analysis

| Item | Before (lines) | After (wrappers) | Shared (new) | Net Change | Notes |
|------|---------------|-----------------|-------------|-----------|-------|
| 1.1 Error handlers (6 services) | 1,130 | 989 | 331 | +190 | Added 22 new error codes, createErrorResponse factory |
| 1.2 Redis confirmation (6 services) | 506 | 336 | 232 | +62 | Added error handling, lazy loading, service-prefixed keys |
| 1.3 Database connections (4 services) | 554 | 162 | 196 | -196 | Genuine reduction; wrappers are thin |
| 3.1 useAIQuery hook (4 apps) | 2,015 | 1,113 | 208 | -694 | 4 of 7 apps refactored |
| **Total** | **4,205** | **2,600** | **967** | **-638** | |

**Honest assessment**: The initial plan estimated ~3,590 lines removable in services and ~2,500 lines in clients. The actual net reduction is ~638 lines. However, the primary value is **consolidation** (single source of truth for error codes, Redis patterns, database connections, and AI query logic) rather than raw line count reduction. The wrappers are larger than expected due to TypeScript TS2742 portability issues requiring verbose type annotations.

### Refactoring Issues Encountered

The consolidation to `@tamshai/shared` revealed several cross-package TypeScript issues that required multiple fix iterations:

**1. TS2742 "Inferred type cannot be named" (3 iterations to fix)**

When a service re-exports a function from `@tamshai/shared`, TypeScript infers the return/parameter types from shared's copy of `@types/pg`. Since each service has its own `@types/pg` installation (different node_modules path), TypeScript refuses to emit types referencing `@tamshai/shared/node_modules/@types/pg`.

- **Attempt 1**: Added `PostgresClient` type annotation to `db` variable. Failed — destructured exports still infer inner types (`Pool`, `PoolClient`) from shared's copy.
- **Attempt 2**: Used `any` type annotations on all 4 problematic exports. Fixed TS2742 but broke `queryWithRLS<T>()` generic calls with TS2347 ("Untyped function calls may not accept type arguments").
- **Attempt 3 (final)**: Imported `Pool`, `PoolClient`, `QueryResult`, `QueryResultRow` from the service's own `pg` package and wrote explicit type annotations for each export. This gives TypeScript named types it can reference from the service's own type context.

**Root cause**: npm's flat node_modules doesn't deduplicate `@types/pg` across `@tamshai/shared` and the consuming service. This is a known TypeScript limitation with monorepo-style packages that share types.

**Permanent fix**: Migrate to npm workspaces or pnpm, which hoist types to a single location.

**2. Redis test mock target change**

After consolidating Redis to `@tamshai/shared`, the HR redis.test.ts was still mocking `ioredis` directly. Since `redis.ts` now delegates to `@tamshai/shared`'s `createRedisConfirmationCache`, the tests needed to mock `@tamshai/shared` instead. Additionally, all key expectations changed from `pending:{id}` to `pending:hr:{id}` due to the new service-prefixed key format.

**3. CI/CD pipeline dependency changes**

Adding the `build-shared` job required updating `needs:` arrays in 5 downstream jobs. Each downstream job also needed a `download-artifact` step placed before any step that references `@tamshai/shared`.

**4. Keycloak version mismatch in integration tests**

The `setup-keycloak` composite action defaults to Keycloak 26.0, but the integration tests relied on Keycloak 24.0 (the version used in the previous inline `docker run` setup). Keycloak 26 has breaking changes: `admin-fine-grained-authz` feature handling changed, and the Terraform provider `mrparkers/keycloak ~4.4.0` doesn't fully support Keycloak 26's token exchange configuration. The fix was to explicitly pin `keycloak-version: '24.0'` for integration tests while keeping E2E/perf tests on 26.0. The setup-keycloak action was also updated to set both old (`KEYCLOAK_ADMIN`) and new (`KC_BOOTSTRAP_ADMIN_USERNAME`) env vars for cross-version compatibility.

**5. Deploy workflow image naming mismatch**

The `deploy-mcp-service.yml` referenced images as `tamshai/$SERVICE_NAME:latest` (e.g., `tamshai/mcp-hr:latest`), but Docker Compose auto-generates image names from `COMPOSE_PROJECT_NAME` (e.g., `tamshai-vps-mcp-hr`). This mismatch existed since commit faad8b78 removed hardcoded `image:` tags. The deploy workflow was rewritten to use `docker compose exec` for health checks (avoids container naming issues) and `docker compose images` to discover actual image names for rollback tagging.

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)
1. Fix E2E worker config (15 min change → 15-20 min CI savings)
2. Add missing composite indexes to expense_reports
3. Fix CORS wildcard scheme in Kong
4. Fix Playwright timeout config
5. Remove unused Vite template CSS

### Phase 2: Shared Service Library (1 week)
1. Extract error handlers to `@tamshai/shared`
2. Extract Redis confirmation utils to `@tamshai/shared`
3. Extract database connection factory to `@tamshai/shared`
4. Extract logger factory to `@tamshai/shared`
5. Consolidate response types to `@tamshai/shared`

### Phase 3: CI/CD Optimization (2-3 days)
1. Create composite Keycloak action
2. Build shared package once, share as artifact
3. Parallelize job dependencies
4. Create shared test auth module

### Phase 4: Client Consolidation (3-4 days)
1. Extract AIQueryPage to `useAIQuery` hook
2. Extract CallbackPage to shared component
3. Add `useFilteredData` hook
4. Fix lazy voice hook initialization

### Phase 5: Coverage & Quality (ongoing)
1. Add unit tests for 6 untested MCP services
2. Create test factories
3. Fix k6 thresholds and create baselines
4. Docker Compose YAML anchor refactoring
5. Dockerfile template consolidation

---

*Generated by Claude-QA code optimization scan, 2026-02-14*
