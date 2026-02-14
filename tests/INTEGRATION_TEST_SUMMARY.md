# Integration Testing Suite - Summary

**Last Updated**: February 5, 2026
**Status**: Active Development
**Total Test Cases**: 295 across 13 test files in 4 locations

---

## Test Locations

Integration tests are spread across four directories:

| Location | Files | Test Cases | Purpose |
|----------|-------|------------|---------|
| `tests/integration/` | 5 | 117 | Cross-service E2E integration |
| `services/mcp-gateway/src/__tests__/integration/` | 5 | 144 | Gateway-specific + TDD RED phase |
| `services/mcp-hr/tests/integration/` | 1 | 9 | Identity provisioning |
| `services/mcp-journey/tests/integration/` | 2 | 25 | Journey MCP server + knowledge index |

---

## Prerequisites

### 1. Running Services

Docker services must be running. `jest.setup.js` verifies health and fails fast if services are down.

```bash
cd infrastructure/docker && docker compose up -d
```

Required: Keycloak, MCP Gateway, MCP HR, MCP Finance, MCP Sales, MCP Support, PostgreSQL, MongoDB, Redis.

### 2. Environment Secrets

**Preferred Method: Token Exchange (February 2026)**

Integration tests now use the `mcp-integration-runner` service account for secure authentication:

```bash
# Retrieve integration test secret from GitHub
eval $(./scripts/secrets/read-github-secrets.sh --integration --env)
```

This sets `MCP_INTEGRATION_RUNNER_SECRET` in your shell session, enabling token exchange authentication (OAuth 2.0 compliant, no user passwords in test code).

**Fallback Method: ROPC (Deprecated)**

If `MCP_INTEGRATION_RUNNER_SECRET` is not available, tests fall back to ROPC using `DEV_USER_PASSWORD`:

```bash
# Retrieve user password (ROPC fallback only)
eval $(./scripts/secrets/read-github-secrets.sh --user-passwords --env)
```

**IMPORTANT**: ROPC is being phased out per OAuth 2.0 Security BCP (RFC 8252). Use token exchange for new test development.

**Optional**: For AI query tests (SSE streaming, RBAC AI queries), also set:

```bash
export CLAUDE_API_KEY=sk-ant-api03-...   # From Anthropic Console
```

Tests that require `CLAUDE_API_KEY` use the `testOrSkip` pattern and skip gracefully if not set.

### 3. Full Environment Variable Reference

| Variable | Required | Default | Source |
|----------|----------|---------|--------|
| `MCP_INTEGRATION_RUNNER_SECRET` | **Preferred** | (empty, falls back to ROPC) | `read-github-secrets.sh --integration` |
| `DEV_USER_PASSWORD` | **Fallback** | (empty) | `read-github-secrets.sh --user-passwords` |
| `CLAUDE_API_KEY` | No | (empty, tests skip) | Anthropic Console |
| `KEYCLOAK_ADMIN_PASSWORD` | No | `admin` | Local dev default |
| `KEYCLOAK_URL` | **Auto** | Derived from `PORT_KEYCLOAK` | `.env` via `jest.config.js` |
| `KEYCLOAK_REALM` | No | `tamshai-corp` | Docker Compose |
| `MCP_GATEWAY_URL` | **Auto** | Derived from `PORT_MCP_GATEWAY` | `.env` via `jest.config.js` |
| `MCP_HR_URL` | **Auto** | Derived from `PORT_MCP_HR` | `.env` via `jest.config.js` |
| `MCP_FINANCE_URL` | **Auto** | Derived from `PORT_MCP_FINANCE` | `.env` via `jest.config.js` |
| `MCP_SALES_URL` | **Auto** | Derived from `PORT_MCP_SALES` | `.env` via `jest.config.js` |
| `MCP_SUPPORT_URL` | **Auto** | Derived from `PORT_MCP_SUPPORT` | `.env` via `jest.config.js` |
| `KEYCLOAK_CLIENT_SECRET` | No | `test-client-secret` | Keycloak config |
| `REDIS_URL` | **Auto** | Derived from `PORT_REDIS` | `.env` via `jest.config.js` |

### read-github-secrets.sh Options

```bash
./scripts/secrets/read-github-secrets.sh --integration      # Integration test secret (MCP_INTEGRATION_RUNNER_SECRET) - PREFERRED
./scripts/secrets/read-github-secrets.sh --e2e              # E2E test secrets (TEST_USER_PASSWORD, TEST_USER_TOTP_SECRET)
./scripts/secrets/read-github-secrets.sh --user-passwords   # DEV/STAGE/PROD passwords (ROPC fallback)
./scripts/secrets/read-github-secrets.sh --keycloak         # Keycloak admin password
./scripts/secrets/read-github-secrets.sh --all              # All secrets
./scripts/secrets/read-github-secrets.sh --all --env        # Output as export statements
./scripts/secrets/read-github-secrets.sh --all --json       # Output as JSON
```

The script triggers a GitHub Actions workflow (`export-test-secrets.yml`), waits for completion, downloads the secrets artifact, outputs the values, then deletes the workflow run for security.

**Prerequisite**: GitHub CLI (`gh`) must be authenticated with access to the repository.

---

## Test Execution

### tests/integration/ (Primary Suite)

```bash
# 1. Get secrets first (token exchange - preferred)
eval $(./scripts/secrets/read-github-secrets.sh --integration --env)

# 2. Run tests
cd tests/integration
npm install
npm test                          # All tests
npm test -- rbac.test.ts          # RBAC only
npm test -- mcp-tools.test.ts     # MCP tool tests only
npm test -- sse-streaming.test.ts # SSE streaming only
```

**Config**: `jest.config.js` - 120s timeout, sequential execution (`maxWorkers: 1`), `jest.setup.js` runs health checks before tests.

### services/mcp-gateway/ (Service Integration)

```bash
cd services/mcp-gateway
npm run test:integration
```

**Config**: `jest.integration.config.js` - 30s timeout, sequential execution, setup via `src/__tests__/integration/setup.ts`.

**Parallelized Keycloak Setup**: The setup uses `Promise.all` to prepare/restore all 8 test users concurrently, reducing setup time from ~8 sequential HTTP round-trips to ~1 parallel round-trip.

### services/mcp-journey/ (Vitest)

```bash
cd services/mcp-journey
npx vitest run tests/integration/
```

**Note**: Uses Vitest (not Jest).

---

## Test Files Inventory

### tests/integration/

#### 1. rbac.test.ts (19 tests)

RBAC and authorization testing against live Keycloak + MCP Gateway.

| Test Group | Tests | Notes |
|------------|-------|-------|
| Authentication Tests | 3 | Valid/invalid credentials, non-existent user |
| Authorization - User Info | 4 | Role verification per user (HR, Finance, Executive, Intern) |
| Authorization - MCP Access | 5 | Cross-department access, self-access via employee role |
| Authorization - AI Queries | 4 | `testOrSkip` - requires `CLAUDE_API_KEY` |
| Data Filtering | 2 | Salary masking, contact detail filtering (60s timeout) |
| Audit Logging | 1 | Query logging with user context |

**Conditional Tests**: 5 tests use `testOrSkip` pattern (skip if no `CLAUDE_API_KEY`).

**Env Vars**: `KEYCLOAK_URL` (default: `http://127.0.0.1:8180/auth`), `DEV_USER_PASSWORD`, `CLAUDE_API_KEY` (optional).

#### 2. mcp-tools.test.ts (42 tests)

Comprehensive MCP tool testing across all 4 domain servers.

| MCP Server | Read Tools | Write Tools | Notes |
|------------|------------|-------------|-------|
| HR | 5 (list_employees, get_employee) | 3 (delete_employee, update_salary) | Truncation, LLM errors |
| Finance | 4 (get_budget, list_invoices) | 2 (delete_invoice, approve_budget) | Status filtering |
| Sales | 5 (list_opportunities, get_customer) | 2 (close_opportunity, delete_customer) | Stage filtering |
| Support | 4 (search_tickets, get_knowledge_article) | 1 (close_ticket) | Full-text search |

Also includes:
- **Multi-Role Access Control** (7 tests) - Executive cross-dept, Intern denied, dept-specific boundaries
- **Performance Tests** (3 tests) - Single query <2s, truncation overhead <100ms, 5 concurrent queries
- **Health Checks** (4 tests) - All MCP servers healthy

**Architecture v1.4 Coverage**:
- LIMIT+1 truncation pattern with metadata
- LLM-friendly error schemas with `suggestedAction`
- Human-in-the-loop confirmations with `pending_confirmation` status

#### 3. mcp-gateway-proxy.test.ts (29 tests, 4 skipped)

End-to-end proxy routing through MCP Gateway to all domain servers.

| Test Group | Tests | Notes |
|------------|-------|-------|
| Health | 1 | Gateway health endpoint |
| HR Endpoints | 4 | Skipped in CI (`isCI` check) |
| Finance Endpoints | 4 | Skipped in CI |
| Sales Endpoints | 2 | Skipped in CI |
| Support Endpoints | 2 | Skipped in CI |
| Payroll Endpoints | 7 | `describe.skip` (always skipped) |
| Cross-Role Access | 4 | Executive all-dept, cross-dept employee role |
| Response Validation | 3 | Payroll field validation (skipped) |
| Error Handling | 2 | 401 unauthenticated, 404 not found |

**Skip Reasons**: MCP servers not accessible via Docker hostnames in CI; Payroll endpoints awaiting full integration.

#### 4. query-scenarios.test.ts (22 tests)

Natural language query routing and pagination scenarios.

| Scenario | Tests | Notes |
|----------|-------|-------|
| "Who are my team members?" | 7 | Executive, HR Manager, Eng Manager, Intern |
| "List all employees" | 4 | Cursor-based pagination (59 employees across pages) |
| Query Routing | 2 | UUID routing to get_employee, pagination detection |
| Budget Status Query | 4 | Summary with breakdowns, dept/fiscal year filtering |
| Error Handling | 1 | Unknown user email error |
| Health Checks | 3 | HR, Finance, Gateway accessible |

#### 5. sse-streaming.test.ts (5 tests)

SSE streaming for AI query responses.

| Test Group | Tests | Notes |
|------------|-------|-------|
| POST /api/query | 4 | Executive/HR streaming, Intern limited access, progressive chunks |
| Error Handling | 2 | Non-existent server, missing query body |
| GET /api/query | 1 | EventSource-compatible endpoint |
| Health Checks | 2 | Gateway and Keycloak accessible |

**Conditional**: 4 tests use `testOrSkip` (require `CLAUDE_API_KEY`). 90s timeout per AI test.

---

### services/mcp-gateway/src/**tests**/integration/

#### 6. rls-policies.test.ts (37 tests) - TDD RED

PostgreSQL Row-Level Security policy validation.

| Test Group | Tests | Notes |
|------------|-------|-------|
| Reference Tables (Public Read) | 4 | departments, grade_levels, fiscal_years, budget_categories |
| HR Employees - SELECT | 5 | Intern self-only, manager team, cross-team denied |
| HR Employee Write Ops | 6 | Salary update self/other, delete restrictions |
| Finance Access by Role | 8 | Read/write separation, expense filtering |
| Finance Write Ops | 5 | Approve permissions, role enforcement |
| Cross-Schema Denial | 4 | HR cannot read Finance and vice versa |
| Audit Table Access | 2 | Read-only for users |

**Status**: TDD RED phase - tests define expected RLS behavior before implementation.

#### 7. budget-approval.test.ts (32 tests) - TDD RED

Finance budget approval workflow.

| Test Group | Tests | Notes |
|------------|-------|-------|
| Schema - approval columns | 8 | status, submitted_by/at, approved_by/at, version |
| Approval History Table | 3 | Table existence, audit columns |
| approve_budget Tool | 7 | Confirmation, Redis storage, status transition |
| submit_budget Tool | 5 | Draft to PENDING_APPROVAL, optimistic locking |
| Business Rules | 5 | Status transitions, role requirements |

**Status**: TDD RED phase (GitHub Issue #78).

#### 8. expense-tracking.test.ts (22 tests) - TDD RED

Finance expense tracking schema and tools.

| Test Group | Tests | Notes |
|------------|-------|-------|
| Table Structure | 5 | Schema, columns, types, FKs, indexes |
| get_expense_report Tool | 9 | Filtering, RLS, concurrency |
| Sample Data | 3 | Records, categories, statuses |
| RLS Policies | 5 | Self-only, manager team, finance-write all |

**Status**: TDD RED phase (GitHub Issue #77).

#### 9. schema-validation.test.ts (24 tests, 4 skipped)

Validates database schemas match spec documents.

**Status**: TDD RED phase. 4 tests explicitly skipped.

#### 10. mcp-gateway-proxy.test.ts (29 tests)

Duplicate of `tests/integration/mcp-gateway-proxy.test.ts` with minor differences (runs under mcp-gateway's jest config).

---

### services/mcp-hr/tests/integration/

#### 11. identity-provisioning.test.ts (9 tests)

Keycloak identity provisioning via IdentityService.

| Test Group | Tests | Notes |
|------------|-------|-------|
| User creation/update | ~4 | Keycloak user lifecycle |
| Group assignments | ~2 | Role-based group mapping |
| Cleanup/rollback | ~2 | Atomic migration rollback |
| Audit trail | ~1 | Provisioning audit records |

**Dependencies**: Keycloak Admin API, PostgreSQL, Redis.

---

### services/mcp-journey/tests/integration/

#### 12. mcp-server.test.ts (17 tests) - TDD RED

MCP Journey server tool and resource endpoints.

| Test Group | Tests | Notes |
|------------|-------|-------|
| Health endpoint | 3 | Status, service name, uptime |
| Tool endpoints | 5 | query_failures, lookup_adr, search_journey |
| Resource endpoints | 4 | Read failure/decision resources, list, 404 |
| Agent identity | 2 | Identity metadata, disclaimer |

**Framework**: Vitest (not Jest).

#### 13. knowledge-index.test.ts (8 tests) - TDD RED

Semantic search and knowledge indexing.

| Test Group | Tests | Notes |
|------------|-------|-------|
| Knowledge Index | 8 | Full-text search, embedding search, hybrid, CRUD |

**Framework**: Vitest (not Jest).

---

## Test Categories Summary

| Category | Test Count | Status |
|----------|-----------|--------|
| RBAC / Authorization | 19 | Active |
| MCP Tool Coverage (19 tools) | 42 | Active |
| Gateway Proxy Routing | 58 | Active (some skipped in CI) |
| Query Scenarios | 22 | Active |
| SSE Streaming | 5 | Active (conditional on API key) |
| RLS Policies | 37 | TDD RED |
| Budget Approval Workflow | 32 | TDD RED |
| Expense Tracking | 22 | TDD RED |
| Schema Validation | 24 | TDD RED |
| Identity Provisioning | 9 | Active |
| MCP Journey Server | 17 | TDD RED |
| Knowledge Index | 8 | TDD RED |

### By Maturity

| Status | Tests | % |
|--------|-------|---|
| **Active** (can run against live services) | 155 | 53% |
| **TDD RED** (expected to fail, spec-first) | 140 | 47% |
| **Total** | 295 | 100% |

---

## Conditional Test Patterns

### testOrSkip (Claude API Key)

~12 tests skip automatically when `CLAUDE_API_KEY` is not set. These test actual AI query flows through Claude and require a valid API key starting with `sk-ant-api`.

### isCI (CI Environment)

~15 tests in `mcp-gateway-proxy.test.ts` skip in CI because MCP servers aren't accessible via Docker hostnames from the test runner.

### describe.skip (Payroll)

7 payroll endpoint tests are always skipped pending full proxy integration.

---

## Dependencies

| Dependency | Required By | Purpose |
|------------|-------------|---------|
| Keycloak | All tests | Authentication, JWT tokens |
| MCP Gateway (`PORT_MCP_GATEWAY`) | Proxy, RBAC, SSE, Query | Request routing |
| MCP HR (`PORT_MCP_HR`) | Tools, Proxy, Query | Employee data |
| MCP Finance (`PORT_MCP_FINANCE`) | Tools, Proxy, Query | Budget/invoice data |
| MCP Sales (`PORT_MCP_SALES`) | Tools, Proxy | Opportunities/CRM |
| MCP Support (`PORT_MCP_SUPPORT`) | Tools, Proxy | Tickets/KB |
| MCP Payroll (`PORT_MCP_PAYROLL`) | Proxy (skipped) | Payroll data |
| PostgreSQL (`PORT_POSTGRES`) | RLS, Schema, Identity | Relational data |
| MongoDB (`PORT_MONGODB`) | Schema validation | Sales/Support documents |
| Redis (`PORT_REDIS`) | Confirmation flows | Token cache, pending actions |
| Claude API | SSE, RBAC AI queries | AI response generation |

---

## Helper Scripts (tests/integration/)

| Script | Purpose |
|--------|---------|
| `jest.setup.js` | Service health checks before test execution |
| `create-flutter-client.js` | Create Flutter client in Keycloak |
| `fix-flutter-client.js` | Fix Flutter client configuration |
| `fix-totp.js` | Fix TOTP configuration for test users |
| `setup-totp-for-testing.js` | Configure TOTP secrets for test users |
| `restore-eve-totp.js` | Restore Eve Thompson's TOTP after tests |
| `setup-keycloak-mappers.js` | Configure Keycloak protocol mappers |
| `remove-offline-access.js` | Remove offline_access scope |

---

## File Structure

```
tests/integration/
    rbac.test.ts                   # 19 tests - RBAC authorization
    mcp-tools.test.ts              # 42 tests - All MCP tool coverage
    mcp-gateway-proxy.test.ts      # 29 tests - Gateway proxy routing
    query-scenarios.test.ts        # 22 tests - NL query routing
    sse-streaming.test.ts          #  5 tests - SSE streaming
    jest.config.js                 # 120s timeout, sequential
    jest.setup.js                  # Health checks
    package.json                   # Jest 30.2, ts-jest, axios
    tsconfig.json                  # TypeScript config
    *.js                           # Keycloak helper scripts

services/mcp-gateway/src/__tests__/integration/
    rls-policies.test.ts           # 37 tests - PostgreSQL RLS (RED)
    budget-approval.test.ts        # 32 tests - Budget workflow (RED)
    expense-tracking.test.ts       # 22 tests - Expense tracking (RED)
    schema-validation.test.ts      # 24 tests - Schema vs spec (RED)
    mcp-gateway-proxy.test.ts      # 29 tests - Proxy routing
    setup.ts                       # Test setup, auth helpers

services/mcp-hr/tests/integration/
    identity-provisioning.test.ts  #  9 tests - Keycloak provisioning

services/mcp-journey/tests/integration/
    mcp-server.test.ts             # 17 tests - MCP Journey (RED, Vitest)
    knowledge-index.test.ts        #  8 tests - Semantic search (RED, Vitest)
```

---

---

## Troubleshooting

### Connection Pool Exhaustion

**Symptom**: Tests fail with `AggregateError:` (empty) or `remaining connection slots are reserved for roles with the SUPERUSER attribute`

**Cause**: Database connections leak when tests fail before cleanup. Leaked connections accumulate across test runs until PostgreSQL's `max_connections` (100) is exceeded.

**Solution**: Clear leaked idle connections:

```bash
# Check connection count
docker exec tamshai-dev-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# If count > 20, terminate idle tamshai_app connections
docker exec tamshai-dev-postgres psql -U postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'tamshai_app' AND state = 'idle';"
```

### Port Configuration

Integration tests use ports from environment variables (no hardcoded defaults):

| Service | Environment Variable | Derived URL |
|---------|---------------------|-------------|
| PostgreSQL | `PORT_POSTGRES` | `POSTGRES_PORT` |
| Keycloak | `PORT_KEYCLOAK` | `KEYCLOAK_URL` |
| MCP Gateway | `PORT_MCP_GATEWAY` | `MCP_GATEWAY_URL` |
| Redis | `PORT_REDIS` | `REDIS_URL` |

Ports are derived from `PORT_*` variables in `infrastructure/docker/.env` (generated by Terraform from GitHub Variables). The `jest.config.js` loads this file via `dotenv` and derives service URLs automatically. No hardcoded port defaults exist — tests fail explicitly if `.env` is missing.

### Keycloak `/auth` Prefix

Local dev Keycloak is configured with `KC_HTTP_RELATIVE_PATH=/auth` in `docker-compose.yml`. This means all Keycloak URLs must include the `/auth` path prefix:

- **Correct** (local dev): `http://127.0.0.1:$PORT_KEYCLOAK/auth/realms/tamshai-corp/...`
- **Incorrect** (local dev): `http://127.0.0.1:$PORT_KEYCLOAK/realms/tamshai-corp/...` (returns 404)

The `jest.config.js` handles this automatically — it appends `/auth` when deriving `KEYCLOAK_URL` from `PORT_KEYCLOAK`. In CI, Keycloak runs at root path (no `/auth`) and `KEYCLOAK_URL` is set explicitly.

If you override `KEYCLOAK_URL` manually, remember to include `/auth` for local dev.

---

*Last Updated: February 8, 2026*
*Updated By: Claude-Dev (Tamshai-Dev)*
