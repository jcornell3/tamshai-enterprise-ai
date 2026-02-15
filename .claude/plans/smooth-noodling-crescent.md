# Remaining P1 Optimizations: Infrastructure & CI/CD

## Context

The code optimization scan (2026-02-14) identified 62 optimization opportunities. P0 items and P1 services items (logger, response types, auth helpers) are complete. Six P1 items remain across infrastructure and CI/CD. After investigation, 3 items are actionable, 1 is partially actionable, and 2 items should be downgraded/deferred.

---

## Item 1: Missing Composite Indexes (expense_reports) — ACTIONABLE

**File**: `sample-data/finance-data.sql` (after line 1337)

**Current state**: 7 single-column indexes. Common query patterns (filter by employee+status, department+status+date, audit trail) require scanning multiple indexes or doing sequential scans.

**Action**: Add 4 composite indexes after the existing index block at line 1337:

```sql
-- Composite indexes for common query patterns (P1 optimization)
CREATE INDEX IF NOT EXISTS idx_expense_reports_status_pagination
  ON finance.expense_reports(status, submission_date DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_reports_dept_pagination
  ON finance.expense_reports(department_code, submission_date DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_reports_employee_status
  ON finance.expense_reports(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_expense_reports_approved_audit
  ON finance.expense_reports(approved_by, approved_at);
```

**Risk**: None (additive, IF NOT EXISTS).

---

## Item 2: Docker Compose YAML Anchors — ACTIONABLE

**File**: `infrastructure/docker/docker-compose.yml` (lines 302-556, 9 MCP services)

**Current state**: 9 MCP services repeat identical patterns:
- Healthcheck block (5 lines × 9 = 45 lines): `interval: 30s`, `timeout: 10s`, `retries: 3`
- Redis env vars (3 lines × 8 = 24 lines): `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- PostgreSQL env vars (4 lines × 5 = 20 lines): `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Common env vars (3 lines × 9 = 27 lines): `NODE_ENV`, `LOG_LEVEL`, `MCP_INTERNAL_SECRET`
- postgres+redis depends_on (4 lines × 5 = 20 lines)

**Action**: Add YAML extension fields at the top of the file (before `services:`), then reference with merge keys:

```yaml
# Extension fields for MCP service commonalities
x-mcp-common-env: &mcp-common-env
  NODE_ENV: development
  REDIS_HOST: redis
  REDIS_PORT: 6379
  REDIS_PASSWORD: ${REDIS_PASSWORD:?REDIS_PASSWORD is required}
  LOG_LEVEL: info
  MCP_INTERNAL_SECRET: ${MCP_INTERNAL_SECRET:?MCP_INTERNAL_SECRET is required}

x-postgres-env: &postgres-env
  POSTGRES_HOST: postgres
  POSTGRES_PORT: 5432
  POSTGRES_USER: tamshai
  POSTGRES_PASSWORD: ${TAMSHAI_DB_PASSWORD:?TAMSHAI_DB_PASSWORD is required}

x-mcp-healthcheck: &mcp-healthcheck
  interval: 30s
  timeout: 10s
  retries: 3

x-depends-postgres-redis: &depends-postgres-redis
  postgres:
    condition: service_healthy
  redis:
    condition: service_healthy

x-depends-redis: &depends-redis
  redis:
    condition: service_healthy
```

Each service environment uses `<<: *mcp-common-env` merge key, healthcheck uses `<<: *mcp-healthcheck` with service-specific `test:`. Services using PostgreSQL add `<<: *postgres-env` to their environment.

**Example before** (mcp-finance, lines 349-383):
```yaml
  mcp-finance:
    build:
      context: ../..
      dockerfile: services/mcp-finance/Dockerfile
    container_name: tamshai-dev-mcp-finance
    environment:
      NODE_ENV: development
      PORT: ${PORT_MCP_FINANCE:?PORT_MCP_FINANCE is required}
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: tamshai_finance
      POSTGRES_USER: tamshai
      POSTGRES_PASSWORD: ${TAMSHAI_DB_PASSWORD:?TAMSHAI_DB_PASSWORD is required}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD:?REDIS_PASSWORD is required}
      LOG_LEVEL: info
      MCP_INTERNAL_SECRET: ${MCP_INTERNAL_SECRET:?MCP_INTERNAL_SECRET is required}
    ports:
      - "${PORT_MCP_FINANCE}:${PORT_MCP_FINANCE}"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:${PORT_MCP_FINANCE}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - tamshai-network
```

**Example after**:
```yaml
  mcp-finance:
    build:
      context: ../..
      dockerfile: services/mcp-finance/Dockerfile
    container_name: tamshai-dev-mcp-finance
    environment:
      <<: [*mcp-common-env, *postgres-env]
      PORT: ${PORT_MCP_FINANCE:?PORT_MCP_FINANCE is required}
      POSTGRES_DB: tamshai_finance
    ports:
      - "${PORT_MCP_FINANCE}:${PORT_MCP_FINANCE}"
    depends_on:
      <<: *depends-postgres-redis
    healthcheck:
      <<: *mcp-healthcheck
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:${PORT_MCP_FINANCE}/health"]
    networks:
      - tamshai-network
```

**Services to update**:
| Service | Env anchors | Depends anchor | Notes |
|---------|-------------|----------------|-------|
| mcp-gateway (219-265) | `*mcp-common-env` only (no PG) | `*depends-redis` | Has unique Claude API, JWT, Keycloak env vars |
| mcp-ui (270-300) | `*mcp-common-env` only (no PG) | `*depends-redis` | Has unique Keycloak service account vars |
| mcp-hr (302-347) | `*mcp-common-env` + `*postgres-env` | `*depends-postgres-redis` | Has unique Keycloak/identity-sync vars |
| mcp-finance (349-383) | `*mcp-common-env` + `*postgres-env` | `*depends-postgres-redis` | Clean conversion |
| mcp-sales (385-416) | `*mcp-common-env` only (MongoDB) | Custom (mongodb+redis) | Has unique MongoDB URI |
| mcp-support (418-455) | `*mcp-common-env` only (ES+Mongo) | Custom (es+mongodb+redis) | Has unique ES/MongoDB vars |
| mcp-journey (457-484) | `*mcp-common-env` only (no PG) | `*depends-redis` | Has unique Gemini API var |
| mcp-payroll (486-520) | `*mcp-common-env` + `*postgres-env` | `*depends-postgres-redis` | Clean conversion |
| mcp-tax (522-556) | `*mcp-common-env` + `*postgres-env` | `*depends-postgres-redis` | Clean conversion |

**Savings**: ~100 lines. **Risk**: Low — YAML anchors are well-supported by Docker Compose v2+.

**Verification**: `docker compose config` must produce identical expanded YAML before/after.

---

## Item 3: CORS Wildcard in Kong — NO ACTION (False Positive)

**File**: `infrastructure/docker/kong/kong.yml` (lines 136-137)

**Current CORS origins**: `tamshai-ai://*` and `com.tamshai.ai://*`

**Investigation**: These are custom URL schemes for the Electron desktop app (`tamshai-ai://oauth/callback`) and Flutter mobile app (`com.tamshai.ai://callback`). Custom schemes:
- Cannot be spoofed by web browsers (browsers only send `http://` or `https://` origins)
- Are registered per-app by the OS (Windows registry, Android intent filters)
- The MCP gateway already accepts `tamshai-ai://` origins via `origin.startsWith()` (index.ts:338)
- Kong's wildcard is consistent with the gateway's approach

**Decision**: No change. The wildcard is correct for custom URL schemes. Replacing with `tamshai-ai://app` would break the actual callback URI (`tamshai-ai://oauth/callback`).

---

## Item 4: CI Job Parallelization — ACTIONABLE (small win)

**File**: `.github/workflows/ci.yml` (lines 427, 1064, 1170)

**Current state**: `integration-tests`, `e2e-tests`, `performance-tests` all have:
```yaml
needs: [build-shared, gateway-lint-test]
```

These 3 jobs already run in parallel with each other (no cross-dependency), but they all wait for `gateway-lint-test` to finish. The `gateway-lint-test` output isn't consumed by these jobs — they build the gateway themselves.

**Action**: Remove `gateway-lint-test` from `needs:` for all 3 test jobs:
```yaml
# Line 427, 1064, 1170 — change:
needs: [build-shared, gateway-lint-test]
# to:
needs: [build-shared]
```

**Savings**: Saves the duration of `gateway-lint-test` (~2-3 min) from the critical path of main-branch jobs. These jobs start as soon as `build-shared` finishes (~11s) instead of waiting for gateway tests.

**Risk**: Low. The test jobs don't use any output from gateway-lint-test. They build the gateway independently. If gateway tests fail, the CI still shows it as a separate failed job.

---

## Item 5: Auth Logic Consolidation in Tests — DEFER TO P2

**Current state**: 5 files with overlapping auth patterns across E2E, integration, and unit test setups.

**Reason to defer**: The duplication is across different test frameworks (Playwright E2E vs Jest integration vs Jest unit), different Node.js environments (ESM vs CJS), and different authentication flows (browser-based TOTP vs token exchange vs admin API). Consolidating into a single module requires careful handling of:
- Framework-specific imports (Playwright `page` vs `axios`)
- Environment variable differences (CI vs local)
- Module resolution (the E2E and integration test dirs don't share a `node_modules`)

**Impact**: ~200 lines of duplication, but it's not causing bugs. The risk/effort ratio is unfavorable for P1.

---

## Item 6: Unit Test Coverage Gaps — PARTIALLY ACTIONABLE

The scan's claim of "6 MCP services have no unit tests" is outdated. After the P1 services work, all services except `mcp-journey` have tests:

| Service | Coverage | Tests | Status |
|---------|----------|-------|--------|
| mcp-gateway | High | 593 | Has tests |
| mcp-hr | 91.4% | 394 | Has tests |
| mcp-finance | 83.4% | 303 | Has tests |
| mcp-sales | 86.0% | 129 | Has tests |
| mcp-support | 89.9% | 274 | Has tests |
| mcp-payroll | 95.4% | 148 | Has tests |
| mcp-tax | 96.6% | 157 | Has tests |
| mcp-ui | 52.5% | 128 | Has tests (low coverage) |
| **mcp-journey** | **0%** | **0** | **No tests** |

**Actionable**: Create basic unit tests for `mcp-journey` (the Project History Agent).

**mcp-journey source files** (21 files, ~1,500 lines):
- 5 tools: `get-context.ts`, `lookup-adr.ts`, `list-pivots.ts`, `search-journey.ts`, `query-failures.ts`
- 5 resources: `decisions.ts`, `evolution.ts`, `failures.ts`, `lessons.ts`, `phoenix.ts`
- 4 indexer: `embedding-generator.ts`, `index-builder.ts`, `json-ld-extractor.ts`, `markdown-parser.ts`
- 2 middleware: `agent-identity.ts`, `rate-limit.ts`
- 3 index/exports: `index.ts`, `tools/index.ts`, `resources/index.ts`

**Approach**: Create `jest.config.js` (or `vitest.config.ts` if it uses Vitest) and tests for the highest-value modules:
- `markdown-parser.ts` — pure function, easy to test
- `json-ld-extractor.ts` — pure function
- `agent-identity.ts` middleware — req/res mock
- `rate-limit.ts` middleware — req/res mock
- `get-context.ts` tool — mock Redis

**Target**: 50% coverage on new tests (prioritize pure functions and middleware).

---

## Execution Order

1. **Item 1** (Composite indexes) — 5 min, zero risk
2. **Item 4** (CI parallelization) — 5 min, 3-line change
3. **Item 2** (Docker Compose anchors) — 1 hour, validate with `docker compose config`
4. **Item 6** (mcp-journey tests) — 3-4 hours, TDD style

Items 3 (CORS) and 5 (test auth) are deferred — no action.

## Verification

After all items:
1. `docker compose -f infrastructure/docker/docker-compose.yml config` produces valid, identical expanded YAML
2. `docker compose up -d` starts all services successfully
3. `npm test` passes in mcp-journey with ≥50% coverage
4. CI pipeline main-branch jobs start ~2-3 min sooner (integration/e2e/perf no longer wait for gateway tests)
5. PostgreSQL `\di finance.*` confirms new composite indexes exist after `--reseed`
