# Tamshai Testing Guide

Complete guide for running unit tests, integration tests, and obtaining test coverage metrics.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Docker Port Reference](#docker-port-reference)
- [Obtaining Secrets](#obtaining-secrets)
- [Running Unit Tests](#running-unit-tests)
- [Running Integration Tests](#running-integration-tests)
- [Test Coverage](#test-coverage)
- [TOTP Management](#totp-management)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

1. **Docker Desktop** running with all containers healthy
2. **Node.js 20+** and npm 10+
3. **GitHub CLI (gh)** authenticated with `bunnyfoo` account
4. **Bash shell** (Git Bash on Windows)

Verify Docker containers are running:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" | grep tamshai-dev
```

---

## Docker Port Reference

| Service | Container Name | Internal Port | External Port |
|---------|---------------|---------------|---------------|
| **Keycloak** | tamshai-dev-keycloak | 8080 | **8180** |
| **MCP Gateway** | tamshai-dev-mcp-gateway | 3100 | **3100** |
| **MCP HR** | tamshai-dev-mcp-hr | 3101 | **3101** |
| **MCP Finance** | tamshai-dev-mcp-finance | 3102 | **3102** |
| **MCP Sales** | tamshai-dev-mcp-sales | 3103 | **3103** |
| **MCP Support** | tamshai-dev-mcp-support | 3104 | **3104** |
| **MCP Journey** | tamshai-dev-mcp-journey | 3105 | **3105** |
| **MCP Payroll** | tamshai-dev-mcp-payroll | 3106 | **3106** |
| **MCP Tax** | tamshai-dev-mcp-tax | 3117 | **3117** |
| **PostgreSQL** | tamshai-dev-postgres | 5432 | **5433** |
| **Redis** | tamshai-dev-redis | 6379 | **6380** |
| **Caddy (HTTPS)** | tamshai-dev-caddy | 443 | **443** |

**URL Patterns:**
- Keycloak Admin: `http://127.0.0.1:8180/auth/admin`
- Keycloak Token: `http://127.0.0.1:8180/auth/realms/tamshai-corp/protocol/openid-connect/token`
- MCP Gateway Health: `http://127.0.0.1:3100/health`

---

## Obtaining Secrets

Secrets are stored in GitHub and retrieved via workflow dispatch.

### Required Secrets

| Secret | Purpose | Used By |
|--------|---------|---------|
| `MCP_INTEGRATION_RUNNER_SECRET` | Service account for token exchange (impersonate test users) | Integration tests |
| `KEYCLOAK_CLIENT_SECRET` | mcp-gateway client secret | Integration tests |
| `CLAUDE_API_KEY` | Anthropic API key for AI queries | SSE streaming tests |

### Retrieve Secrets

```bash
# Get all secrets
./scripts/secrets/read-github-secrets.sh --all

# Get user passwords only
./scripts/secrets/read-github-secrets.sh --user-passwords

# Export as environment variables
eval $(./scripts/secrets/read-github-secrets.sh --all --env)
```

**Output Example:**

```bash
==========================================
Retrieved Secrets (all)
==========================================
CLAUDE_API_KEY=sk-ant-api03-<REDACTED>
DEV_USER_PASSWORD=<REDACTED>
TEST_USER_PASSWORD=<REDACTED>
==========================================
```

### Keycloak Client Secret

The `mcp-gateway` client secret can also be retrieved directly from Keycloak:

```bash
MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080/auth --realm master --user admin --password <admin-password>

MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh get clients -r tamshai-corp \
  --fields clientId,secret -q clientId=mcp-gateway
```

**Note:** Retrieve via the kcadm.sh command above or from GitHub secrets.

---

## Running Unit Tests

### Service Unit Tests

```bash
# MCP Gateway
cd services/mcp-gateway
npm test                    # Run all tests
npm test -- --coverage      # With coverage
npm test -- --watch         # Watch mode for TDD

# MCP HR
cd services/mcp-hr
npm test

# MCP Finance
cd services/mcp-finance
npm test

# All services (from repo root)
npm run test:services
```

### Web App Unit Tests (Vitest)

```bash
cd clients/web

# All apps
npm test

# Specific app
npm test -- --filter finance
npm test -- --filter sales
npm test -- --filter support
npm test -- --filter hr
npm test -- --filter payroll

# With coverage
npm test -- --coverage
```

---

## Running Integration Tests

### Quick Start

```bash
cd tests/integration

# Set required environment variables (get values from ./scripts/secrets/read-github-secrets.sh)
export MCP_INTEGRATION_RUNNER_SECRET='<from-github-secrets>'
export KEYCLOAK_CLIENT_SECRET='<from-keycloak-or-github-secrets>'

# Run all integration tests
npm test

# Run specific test file
npm test -- rbac.test.ts
npm test -- mcp-gateway-proxy.test.ts
npm test -- sse-streaming.test.ts
```

### One-Liner with Secrets

```bash
cd tests/integration && \
  MCP_INTEGRATION_RUNNER_SECRET="$MCP_INTEGRATION_RUNNER_SECRET" \
  npm test
```

### MCP Gateway Integration Tests

The MCP Gateway has its own integration tests in `services/mcp-gateway/`:

```bash
cd services/mcp-gateway

# Run all integration tests
MCP_GATEWAY_URL=http://127.0.0.1:3100 \
KEYCLOAK_URL=http://127.0.0.1:8180 \
MCP_INTEGRATION_RUNNER_SECRET="$MCP_INTEGRATION_RUNNER_SECRET" \
npm run test:integration

# Run specific test pattern (e.g., Payroll)
MCP_GATEWAY_URL=http://127.0.0.1:3100 \
KEYCLOAK_URL=http://127.0.0.1:8180 \
MCP_INTEGRATION_RUNNER_SECRET="$MCP_INTEGRATION_RUNNER_SECRET" \
npm run test:integration -- --testNamePattern="Payroll"
```

**Note:** Both `tests/integration/` and `services/mcp-gateway/` integration tests have automatic TOTP handling - no manual clearing required.

### Test Files

| Test File | Description | Duration |
|-----------|-------------|----------|
| `rbac.test.ts` | Role-based access control | ~45s |
| `mcp-gateway-proxy.test.ts` | MCP endpoint routing | ~3s |
| `mcp-tools.test.ts` | MCP tool invocations | ~60s |
| `sse-streaming.test.ts` | AI query streaming | ~120s |
| `query-scenarios.test.ts` | Natural language queries | ~90s |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KEYCLOAK_URL` | `http://127.0.0.1:8180` | Keycloak base URL (without `/auth`) |
| `KEYCLOAK_REALM` | `tamshai-corp` | Realm name |
| `GATEWAY_URL` / `MCP_GATEWAY_URL` | `http://127.0.0.1:3100` | MCP Gateway URL |
| `MCP_HR_URL` | `http://127.0.0.1:3101` | MCP HR URL |
| `MCP_FINANCE_URL` | `http://127.0.0.1:3102` | MCP Finance URL |
| `MCP_SALES_URL` | `http://127.0.0.1:3103` | MCP Sales URL |
| `MCP_SUPPORT_URL` | `http://127.0.0.1:3104` | MCP Support URL |
| `MCP_INTEGRATION_RUNNER_SECRET` | (required) | Service account secret for token exchange |
| `KEYCLOAK_CLIENT_SECRET` | `mcp-gateway-secret` | mcp-gateway client secret |

**Note:** Test files add `/auth` to the Keycloak URL internally where needed.

---

## Test Coverage

### Service Coverage (Jest)

```bash
cd services/mcp-gateway
npm test -- --coverage

# Coverage report locations:
# - Terminal summary
# - coverage/lcov-report/index.html (HTML report)
# - coverage/lcov.info (for CI tools)
```

### Web App Coverage (Vitest)

```bash
cd clients/web

# Install coverage provider (first time)
npm install -D @vitest/coverage-v8

# Run with coverage
npm test -- --coverage

# Coverage report by app
npm test -- --filter finance --coverage
```

### Coverage Thresholds

| Component | Statements | Branches | Functions | Lines |
|-----------|------------|----------|-----------|-------|
| MCP Gateway | 31% | 29% | 31% | 31% |
| Finance App | 75% | 65% | 76% | 77% |
| Sales App | 73% | 64% | 74% | 76% |
| Support App | 81% | 69% | 87% | 83% |
| HR App | 65% | 57% | 57% | 69% |

**Strategy:** 90% coverage required on new code (diff coverage).

---

## TOTP Management

Integration tests use direct access grants which bypass TOTP. However, user accounts may have `CONFIGURE_TOTP` required action which blocks authentication.

### Check User TOTP Status

```bash
# Get user ID
MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh get users -r tamshai-corp \
  -q username=alice.chen --fields id,requiredActions
```

### Disable TOTP Requirement (for testing)

```bash
# Get admin credentials
MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080/auth --realm master --user admin --password <admin-password>

# Clear requiredActions for a user
USER_ID="d3f27af0-3fd7-4e89-beca-b005f997003c"  # alice.chen
MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh update users/$USER_ID -r tamshai-corp \
  -s 'requiredActions=[]' -s 'enabled=true'
```

### Re-enable TOTP Requirement

```bash
MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh update users/$USER_ID -r tamshai-corp \
  -s 'requiredActions=["CONFIGURE_TOTP"]'
```

### Automatic TOTP Handling

Both integration test locations have automatic TOTP handling:

| Location | Setup File | Behavior |
|----------|------------|----------|
| `tests/integration/` | `jest.setup.js` | Handles TOTP automatically |
| `services/mcp-gateway/` | `setup.ts` | Handles TOTP automatically |

**How it works:**
1. **Before tests:** Removes `CONFIGURE_TOTP` from all test users
2. **After tests:** Restores `CONFIGURE_TOTP` for users without OTP credentials
3. **CI mode:** Skips TOTP handling (Keycloak is ephemeral)

**Note:** Manual TOTP management is only needed if running tests outside these frameworks.

---

## Troubleshooting

### Common Errors

#### "Services not ready for integration tests"

```bash
❌ Some services are not healthy. Please start all services:
   cd infrastructure/docker && docker compose up -d
```

**Solution:** Verify containers are running and healthy:

```bash
docker ps --filter "name=tamshai-dev" --format "{{.Names}}: {{.Status}}"
```

#### "Account is not fully set up"

```bash
{"error":"invalid_grant","error_description":"Account is not fully set up"}
```

**Note:** This should be handled automatically by the test setup files. If you see this error, it means automatic TOTP handling failed or you're running tests outside the standard frameworks.

**Manual Solution:** Clear user's requiredActions:

```bash
MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh update users/<USER_ID> -r tamshai-corp \
  -s 'requiredActions=[]'
```

#### "Invalid user credentials"

**Solution:** Reset the user's password:

```bash
MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh set-password -r tamshai-corp \
  --username alice.chen --new-password "$DEV_USER_PASSWORD"
```

#### "jwt audience invalid. expected: mcp-gateway"

**Solution:** Add audience mapper to mcp-gateway client:

```bash
# Get client ID
CLIENT_ID=$(MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh get clients -r tamshai-corp \
  -q clientId=mcp-gateway --fields id | jq -r '.[0].id')

# Add audience mapper
MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
  /opt/keycloak/bin/kcadm.sh create clients/$CLIENT_ID/protocol-mappers/models \
  -r tamshai-corp \
  -s 'name=mcp-gateway-audience' \
  -s 'protocol=openid-connect' \
  -s 'protocolMapper=oidc-audience-mapper' \
  -s 'config."included.client.audience"=mcp-gateway' \
  -s 'config."id.token.claim"=true' \
  -s 'config."access.token.claim"=true'
```

#### "ECONNREFUSED" or "503 Service Unavailable"

**Solution:** Check specific service health:

```bash
curl http://127.0.0.1:3100/health  # Gateway
curl http://127.0.0.1:3101/health  # HR
curl http://127.0.0.1:3102/health  # Finance
```

Restart unhealthy container:

```bash
docker restart tamshai-dev-mcp-gateway
```

### Debug Token Contents

```bash
# Get token via token exchange (requires MCP_INTEGRATION_RUNNER_SECRET env var)
TOKEN=$(./scripts/get-keycloak-token.sh alice.chen)

# Or manually via curl:
SVC_TOKEN=$(curl -s -X POST 'http://127.0.0.1:8180/auth/realms/tamshai-corp/protocol/openid-connect/token' \
  -d 'grant_type=client_credentials' \
  -d 'client_id=mcp-integration-runner' \
  -d "client_secret=$MCP_INTEGRATION_RUNNER_SECRET" | jq -r '.access_token')
TOKEN=$(curl -s -X POST 'http://127.0.0.1:8180/auth/realms/tamshai-corp/protocol/openid-connect/token' \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
  -d 'client_id=mcp-integration-runner' \
  -d "client_secret=$MCP_INTEGRATION_RUNNER_SECRET" \
  -d "subject_token=$SVC_TOKEN" \
  -d 'requested_subject=alice.chen' \
  -d 'scope=openid profile roles' | jq -r '.access_token')

# Decode payload
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | jq '.realm_access.roles'
```

### Clean Test Artifacts

```bash
# Remove temporary files created during testing
rm -f bob_token.json token.json response.json expense_response.json finance_response.json
rm -f tests/integration/test_output.txt
rm -rf tests/e2e/.auth/
rm -rf clients/web/.turbo/cache/
```

---

## Test Users

| Username | Role | Department | Password |
|----------|------|------------|----------|
| eve.thompson | executive | Executive | (DEV_USER_PASSWORD) |
| alice.chen | hr-read, hr-write | HR | (DEV_USER_PASSWORD) |
| bob.martinez | finance-read, finance-write | Finance | (DEV_USER_PASSWORD) |
| carol.johnson | sales-read, sales-write | Sales | (DEV_USER_PASSWORD) |
| dan.williams | support-read, support-write | Support | (DEV_USER_PASSWORD) |
| nina.patel | manager | Engineering | (DEV_USER_PASSWORD) |
| marcus.johnson | employee | Engineering | (DEV_USER_PASSWORD) |
| frank.davis | (none) | IT Intern | (DEV_USER_PASSWORD) |

---

*Last Updated: February 2026*
