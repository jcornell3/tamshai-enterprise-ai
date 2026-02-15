# Tamshai Enterprise AI - Claude Code Guide

## Project Overview

**Project**: Tamshai Corp Enterprise AI Access System
**Version**: 1.5 (February 2026)
**Type**: Microservices Architecture with AI Orchestration
**Primary Language**: TypeScript/Node.js
**Status**: App Ecosystem Expansion - Payroll Module Implementation

### Purpose

Enterprise-grade AI access system enabling secure Claude AI integration with role-based data access. Employees can use AI assistants while ensuring data access respects existing security boundaries through defense-in-depth architecture.

---

## Git Configuration for Claude Personas

**IMPORTANT**: Set your git identity based on which Claude persona is active.

```bash
# When Claude-Dev is active (feature development, bug fixes)
git config user.name "Tamshai-Dev"
git config user.email "claude-dev@tamshai.com"

# When Claude-QA is active (testing, quality assurance, refactoring)
git config user.name "Tamshai-QA"
git config user.email "claude-qa@tamshai.com"
```

**Verify Configuration**:

```bash
git config user.name
git config user.email
```

**Why This Matters**: Separates commits by role for audit trails and authorship tracking.

---

## GitHub Authentication

**CRITICAL**: Always use these settings for GitHub operations:

| Setting | Value | Notes |
|---------|-------|-------|
| **GitHub Account** | `jcornell3` | Never use `bunnyfoo` |
| **Repository** | `tamshai-enterprise-ai` | Not `tamshai-enterprise-ai-new` |
| **Token Variable** | `JCORNELL_GH_TOKEN` | Never use `GITHUB_TOKEN` |

**Authentication Method**:

```bash
# Authenticate via gh CLI (preferred)
unset GITHUB_TOKEN
gh auth login --with-token <<< "$JCORNELL_GH_TOKEN"

# Verify correct account
gh api user --jq '.login'  # Must return: jcornell3
```

**Git Push Method**:

The Windows Credential Manager may cache incorrect credentials that override gh CLI authentication. To reliably push:

```bash
# 1. Unset GITHUB_TOKEN (it may point to wrong account)
unset GITHUB_TOKEN

# 2. Get jcornell3's token from gh CLI
TOKEN=$(gh auth token)

# 3. Push using token directly (bypasses credential manager)
git -c credential.helper= push https://jcornell3:${TOKEN}@github.com/jcornell3/tamshai-enterprise-ai.git main
```

**Note**: This embeds the token in the command but NOT in git config. The token is ephemeral in the shell session only.

**NEVER**:
- Use `GITHUB_TOKEN` environment variable (points to wrong account)
- Push to or reference `bunnyfoo` repositories
- Store tokens in `.git/config` or git credential store

---

## Environment Alignment Goals

**CRITICAL REQUIREMENT**: Dev, Stage, and Prod environments must be aligned so that:

1. **Terraform destroy + apply** on any environment brings all services up and working
2. **Realm exports** (realm-export-dev.json, realm-export-stage.json) contain identical configuration
3. **sync-realm.sh** handles any missing configuration (clients, mappers, groups)
4. **Sample data** can be reloaded with `--reseed` option

### Key Alignment Items

| Item | Location | Purpose |
|------|----------|---------|
| Audience Mapper | tamshai-website client | Adds `mcp-gateway` to token audience claim |
| MCP Gateway Client | Created by sync-realm.sh | Confidential client for API gateway |
| Group Assignments | sync-realm.sh | Maps users to groups for role inheritance |
| Sample Data | sample-data/*.sql,*.js, *.ndjson | Reloadable via `./scripts/infra/deploy.sh --reseed` |

### Environment-Specific Files

| Environment | Realm Export | Terraform | Cloud-Init |
|-------------|--------------|-----------|------------|
| Dev | realm-export-dev.json | terraform/dev/ | N/A |
| Stage | realm-export-stage.json | terraform/vps/ | cloud-init.yaml |
| Prod | realm-export.json | terraform/gcp/ | N/A |

### After Terraform Destroy + Apply

When recreating an environment from scratch:

1. **Cloud-init runs** (VPS only) - installs Docker, clones repo, starts services
2. **Keycloak imports realm** from realm export file
3. **sync-realm.sh runs** - creates clients, mappers, assigns groups
4. **identity-sync runs** - provisions HR employees as Keycloak users
5. **Sample data loads** - from docker-entrypoint-initdb.d or manual reseed

### Common Alignment Issues

| Symptom | Root Cause | Fix |
|---------|------------|-----|
| 401 Unauthorized from MCP Gateway | Missing audience mapper | Add `mcp-gateway-audience` mapper to tamshai-website client |
| "Your roles: None" in portal | Users not in groups | Run sync-realm.sh to assign groups |
| Kong "no Route matched" | Wrong HTTP method or stale DNS | Use GET for /api/query; restart Kong |
| Apps show zeroes | Sample data not loaded | Run `--reseed` or reload sample data manually |

### User Provisioning Policy

**CRITICAL**: Each environment has different user provisioning strategies.

| Environment | Test Users | Corporate Users | Password |
|-------------|------------|-----------------|----------|
| **Dev** | Pre-seeded in realm-export-dev.json | identity-sync from PostgreSQL | `DEV_USER_PASSWORD` (set via env) |
| **Stage** | identity-sync provisions | identity-sync from PostgreSQL | `STAGE_USER_PASSWORD` (GitHub Secret) |
| **Prod** | `test-user.journey` (realm-export.json) | identity-sync from PostgreSQL | `PROD_USER_PASSWORD` (GitHub Secret) |

**Prod-Specific Rules:**

1. **Only `test-user.journey` is auto-provisioned** - imported from `realm-export.json` with TOTP
2. **Identity sync is disabled** - `MCP_HR_SERVICE_CLIENT_SECRET` not set in GCP deploy
3. **sync-realm.sh skips user functions** - `assign_user_groups()` and `provision_test_user()` return early in prod
4. **Corporate users must be manually created** via Keycloak Admin UI or API

**Why This Design:**
- Production should not have test users with known passwords (security risk)
- Identity sync in prod requires careful planning (HR data source, password delivery, MFA enrollment)
- `test-user.journey` is safe because it has no data access privileges

---

## Quick Reference

### Workflow Requirements

**IMPORTANT: Always push code after making changes.**

After completing any code modification, always commit and push to the repository:

```bash
git add <modified-files>
git commit -m "feat/fix/refactor: description of changes"
git push
```

This ensures the user can immediately pull and test the changes on their local machine.

### Essential Commands

```bash
# Full environment setup (Terraform - recommended)
# Prerequisites: Add hosts file entry first (see README)
cd infrastructure/terraform/dev
terraform init                           # First time only
terraform apply -var-file=dev.tfvars     # Deploy environment
# Access at: https://www.tamshai.local

# Teardown and redeploy
terraform destroy -var-file=dev.tfvars   # Stop services
terraform apply -var-file=dev.tfvars     # Fresh deploy

# Legacy setup script (deprecated)
./scripts/setup-dev.sh

# Manual docker-compose commands
cd infrastructure/docker
docker compose up -d                      # Start all services
docker compose down                       # Stop all services

# View service logs
docker compose logs -f mcp-gateway
docker compose logs -f keycloak

# Check service health
docker compose ps
curl http://localhost:3100/health        # MCP Gateway
curl http://localhost:8100/api/health    # Kong Gateway
```

### Service Management Scripts

Scripts for managing services in dev and stage environments. All scripts are idempotent and safe to run multiple times.

```bash
# Check service status
./scripts/infra/status.sh dev            # Check local dev services

# Deploy services
./scripts/infra/deploy.sh dev            # Deploy all dev services
./scripts/infra/deploy.sh dev --build    # Rebuild containers
./scripts/infra/deploy.sh dev --sync     # Deploy and sync Keycloak
./scripts/infra/deploy.sh dev --reseed   # Reload all sample data (Finance, Sales, Support, Payroll)

# Keycloak management
./scripts/infra/keycloak.sh sync dev     # Sync Keycloak clients/config
./scripts/infra/keycloak.sh status dev   # Check Keycloak status
./scripts/infra/keycloak.sh clients dev  # List all clients
./scripts/infra/keycloak.sh users dev    # List all users
./scripts/infra/keycloak.sh scopes dev   # List client scopes
./scripts/infra/keycloak.sh logs dev     # View Keycloak logs

# MCP health check
./scripts/mcp/health-check.sh dev        # Check all MCP servers

# MCP server restart
./scripts/mcp/restart.sh dev             # Restart all MCP servers
./scripts/mcp/restart.sh dev gateway     # Restart only MCP Gateway

# Database backup/restore
./scripts/db/backup.sh dev               # Backup all databases
./scripts/db/backup.sh dev postgres      # Backup only PostgreSQL
./scripts/db/restore.sh dev ./backups/dev/20250102_120000/  # Restore from backup

# Rollback deployments
./scripts/infra/rollback.sh dev --list   # List recent commits
./scripts/infra/rollback.sh dev --steps=1 --backup  # Rollback 1 commit with backup

# Vault secrets management
./scripts/vault/vault.sh status dev      # Check Vault status
./scripts/vault/vault.sh secrets dev     # List secrets
./scripts/vault/vault.sh ui dev          # Open Vault UI

# GitHub secrets management (after Terraform changes)
./scripts/secrets/update-github-secrets.sh stage --ssh-key   # Update SSH key only
./scripts/secrets/update-github-secrets.sh stage --all       # Update all secrets
./scripts/secrets/update-github-secrets.sh stage --dry-run   # Preview changes

# Login journey testing
./scripts/test/login-journey.sh dev      # Test SSO login flow on dev
./scripts/test/login-journey.sh stage    # Test SSO login flow on stage

# Service logs viewer
./scripts/infra/logs.sh gateway          # View MCP Gateway logs
./scripts/infra/logs.sh keycloak -f      # Follow Keycloak logs
./scripts/infra/logs.sh all --since 30m  # All logs from last 30 minutes

# Container shell access
./scripts/infra/shell.sh gateway         # Shell into MCP Gateway
./scripts/infra/shell.sh postgres        # PostgreSQL client (psql)
./scripts/infra/shell.sh mongodb         # MongoDB shell (mongosh)
./scripts/infra/shell.sh redis           # Redis CLI

# Container rebuild (stop containers, preserve infrastructure)
./scripts/infra/rebuild.sh dev            # Stop dev containers
./scripts/infra/rebuild.sh dev --volumes  # Remove data volumes (DESTRUCTIVE)

# Environment teardown (DESTROYS infrastructure via Terraform)
./scripts/infra/teardown.sh dev           # Terraform destroy dev environment

# Database backup (alternative location)
./scripts/infra/backup.sh                # Backup all databases
./scripts/infra/backup.sh postgres       # Backup PostgreSQL only
./scripts/infra/backup.sh mongodb        # Backup MongoDB
```

### MCP Gateway Development

```bash
cd services/mcp-gateway

# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Build TypeScript
npm run build

# Type checking only
npm run typecheck

# Linting
npm run lint

# Unit tests
npm test

# Integration tests (requires running services)
npm run test:integration
```

---

## Architecture v1.4 Overview

### Key v1.4 Features (December 2025)

Architecture v1.4 introduces critical enhancements for AI reliability and user safety:

#### 1. SSE Transport Protocol

**Problem**: HTTP requests timeout during Claude's 30-60 second multi-step reasoning.
**Solution**: Server-Sent Events (SSE) streaming using EventSource API.

**Gateway Implementation**:

```typescript
app.post('/api/query', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: safeQuery }]
  });

  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  res.write('data: [DONE]\n\n');
});
```

**Client Implementation**:

```typescript
const eventSource = new EventSource('/api/query');
eventSource.onmessage = (event) => {
  if (event.data === '[DONE]') {
    eventSource.close();
    return;
  }
  const chunk = JSON.parse(event.data);
  appendToMessageStream(chunk);
};
```

#### 2. Truncation Warnings

**Problem**: Users unaware when AI responses are based on incomplete data (50-record limit).
**Solution**: MCP servers detect truncation and inject AI-visible warnings.

**MCP Server LIMIT+1 Pattern**:

```typescript
async function listEmployees(limit = 50): Promise<MCPToolResponse> {
  const result = await db.query(
    'SELECT * FROM hr.employees LIMIT $1',
    [limit + 1]  // Query 1 extra to detect truncation
  );

  const truncated = result.rows.length > limit;

  return {
    status: 'success',
    data: result.rows.slice(0, limit),
    metadata: {
      truncated,
      totalCount: truncated ? `${limit}+` : result.rows.length.toString(),
      warning: truncated
        ? `TRUNCATION WARNING: Only ${limit} of ${limit}+ records returned. AI must inform user that results are incomplete.`
        : null
    }
  };
}
```

#### 3. LLM-Friendly Error Schemas

**Problem**: Raw exceptions don't help Claude self-correct.
**Solution**: Discriminated union responses with `suggestedAction` fields.

```typescript
type MCPToolResponse =
  | { status: 'success', data: any, metadata?: { truncated?: boolean } }
  | { status: 'error', code: string, message: string, suggestedAction: string }
  | { status: 'pending_confirmation', confirmationId: string, message: string };

// Example: Error with suggested action
async function getEmployee(employeeId: string): Promise<MCPToolResponse> {
  const result = await db.query(
    'SELECT * FROM hr.employees WHERE employee_id = $1',
    [employeeId]
  );

  if (result.rows.length === 0) {
    return {
      status: 'error',
      code: 'EMPLOYEE_NOT_FOUND',
      message: `Employee with ID ${employeeId} not found.`,
      suggestedAction: 'Use list_employees tool to find valid employee IDs, or verify the ID format is correct (UUID expected).'
    };
  }

  return { status: 'success', data: result.rows[0] };
}
```

#### 4. Human-in-the-Loop Confirmations

**Problem**: Accidental destructive operations without user approval.
**Solution**: Write tools return `pending_confirmation`, user approves via UI.

**MCP Server Write Tool**:

```typescript
async function deleteEmployee(employeeId: string): Promise<MCPToolResponse> {
  const confirmationId = crypto.randomUUID();

  await redis.setex(
    `pending:${confirmationId}`,
    300,  // 5-minute TTL
    JSON.stringify({
      action: 'delete_employee',
      employeeId,
      userId: userContext.userId
    })
  );

  return {
    status: 'pending_confirmation',
    confirmationId,
    message: `⚠️ Delete employee ${employee.name} (${employee.email})?\n\nThis action will permanently delete the employee record and cannot be undone.`,
    confirmationData: { employeeId, employeeName: employee.name }
  };
}
```

**Gateway Confirmation Endpoint**:

```typescript
app.post('/api/confirm/:confirmationId', async (req, res) => {
  const { approved } = req.body;
  const pendingAction = await redis.get(`pending:${req.params.confirmationId}`);

  if (!pendingAction) {
    return res.status(404).json({ error: 'Confirmation expired or not found' });
  }

  if (approved) {
    const result = await executePendingAction(JSON.parse(pendingAction));
    await redis.del(`pending:${req.params.confirmationId}`);
    return res.json({ status: 'success', result });
  } else {
    await redis.del(`pending:${req.params.confirmationId}`);
    return res.json({ status: 'cancelled' });
  }
});
```

---

## Architecture Patterns

### 1. Microservices Architecture

**Pattern**: API Gateway + Service Mesh
**Implementation**: Kong Gateway → MCP Gateway → Domain MCP Servers

```text
             ┌──────────┐
   Clients   │Desktop/  │
      │      │Mobile    │
      │      └──────────┘
      │
      │      HTTPS + JWT
      ▼
┌────────────────┐
│  Kong Gateway  │ (API Gateway - Port 8100)
│  - Rate Limit  │
│  - CORS        │
│  - Auth Check  │
└────────────────┘
      │
      │      HTTP + JWT
      ▼
┌────────────────┐
│   MCP Gateway  │ (AI Orchestration - Port 3100)
│   - Routing    │
│   - Defense    │
│   - Claude API │
└────────────────┘
      │
      │      Token Propagation
      ├──────┬──────┬──────┐
      ▼      ▼      ▼      ▼
┌────────┐┌────────┐┌────────┐┌────────┐
│MCP HR  ││MCP Fin ││MCP Sale││MCP Supp│
│:3101   ││:3102   ││:3103   ││:3104   │
└────────┘└────────┘└────────┘└────────┘
      │      │       │        │
      └──────┴───────┴────────┘
                 ▼
         ┌──────────────┐
         │  Data Layer  │
         │ PostgreSQL   │
         │ MongoDB      │
         │ Redis        │
         └──────────────┘
```

### 2. Authentication: Token Propagation

**Pattern**: SSO with JWT Token Propagation
**Flow**: OIDC PKCE → JWT Issuance → Token Validation → Role Extraction

**JWT Validation in MCP Gateway** (services/mcp-gateway/src/index.ts:80-120):

```typescript
async function validateToken(authHeader: string) {
  const token = authHeader.replace('Bearer ', '');

  // 1. Verify signature with Keycloak JWKS
  const decoded = await jwt.verify(token, getKey);

  // 2. Check revocation in Redis
  const isRevoked = await redis.get(`revoked:${decoded.jti}`);
  if (isRevoked) throw new Error('Token revoked');

  // 3. Extract roles from JWT
  const roles = decoded.resource_access?.['mcp-gateway']?.roles || [];

  return { userId: decoded.sub, roles, username: decoded.preferred_username };
}
```

**Token Lifecycle**:
- Access Token: 5 minutes (short-lived for security)
- Refresh Token: 30 minutes
- Revocation: Redis cache with token JTI

### 3. Authorization: Hierarchical RBAC

**Role Hierarchy**:

```text
executive (composite role)
  ├─ hr-read → hr-write
  ├─ finance-read → finance-write
  ├─ sales-read → sales-write
  └─ support-read → support-write

Access Levels:
  Self < Manager < Department < Executive
```

**Role-to-MCP Routing** (services/mcp-gateway/src/index.ts:200-250):

```typescript
const ROLE_TO_MCP: Record<string, string[]> = {
  'hr-read': ['mcp-hr'],
  'hr-write': ['mcp-hr'],
  'finance-read': ['mcp-finance'],
  'finance-write': ['mcp-finance'],
  'sales-read': ['mcp-sales'],
  'sales-write': ['mcp-sales'],
  'support-read': ['mcp-support'],
  'support-write': ['mcp-support'],
  'executive': ['mcp-hr', 'mcp-finance', 'mcp-sales', 'mcp-support']
};

function getAccessibleMcpServers(roles: string[]): string[] {
  const mcpServers = new Set<string>();
  roles.forEach(role => {
    const servers = ROLE_TO_MCP[role] || [];
    servers.forEach(server => mcpServers.add(server));
  });
  return Array.from(mcpServers);
}
```

### 4. Security: Defense-in-Depth (6 Layers)

**Layer 1**: Authentication (Keycloak) - OIDC, PKCE, MFA
**Layer 2**: API Gateway (Kong) - Rate limiting, CORS, JWT validation
**Layer 3**: MCP Gateway - 5-layer prompt injection defense
**Layer 4**: MCP Servers - Tool allow-listing, application filtering
**Layer 5**: Data Layer - PostgreSQL RLS, MongoDB query filters
**Layer 6**: Network - mTLS (production), network segmentation

---

## Testing Strategy

### Development Methodology: TDD for Service Applications

We use **Test-Driven Development (TDD)** for all service application code:

**TDD Cycle (RED-GREEN-REFACTOR)**:
1. **RED Phase**: Write failing tests first that define expected behavior
   - Create test file before implementation
   - Tests should fail initially (no implementation exists)
   - Focus on expected inputs, outputs, and edge cases
2. **GREEN Phase**: Implement minimum code to make tests pass
   - Write only enough code to satisfy the failing tests
   - Avoid over-engineering or premature optimization
3. **REFACTOR Phase**: Improve code quality while keeping tests green
   - Clean up duplication, improve naming
   - Extract functions/modules as needed
   - All tests must remain passing

**Scope of TDD**:
- **Service Applications**: MCP Gateway, MCP HR, MCP Finance, MCP Sales, MCP Support
- **Client Applications**: Flutter unified client, web clients
- **NOT using TDD**: Infrastructure (Terraform, Docker, CI/CD configs)

### Test Coverage Philosophy

We follow a **"Diff Coverage"** strategy to balance quality with velocity:

- **90% coverage required on all new code** (enforced by Codecov, BLOCKS PRs)
- **49.06% overall coverage** (gradually improving from 31.52%)
- **70% target for new services** (industry "Commendable" tier)

**Rationale**:
1. **Prevents Regression**: All new code must be tested at 90%+
2. **Gradual Improvement**: Naturally increases overall coverage as old code is modified
3. **Developer-Friendly**: Doesn't block work on legacy code
4. **Realistic Target**: 90% allows for edge cases, not 100% perfectionism
5. **Industry Alignment**: Google/Microsoft use similar "diff coverage" strategies

See `.specify/specs/011-qa-testing/TEST_COVERAGE_STRATEGY.md` for complete strategy.

### Testing Commands

```bash
cd services/mcp-gateway

# Unit tests
npm test                          # Run all unit tests
npm test -- --coverage            # With coverage report
npm test -- --watch               # Watch mode for TDD
npm test -- rbac.test.ts          # Run specific test file

# Integration tests (requires services running)
npm run test:integration          # All integration tests
npm run test:rbac                 # RBAC integration tests only
npm run test:mcp                  # MCP tool tests
npm run test:sse                  # SSE streaming tests (120s timeout)

# Coverage
npm run coverage                  # Generate full coverage report
npm run type-coverage             # Check TypeScript type coverage (85% min)

# Linting
npm run lint                      # ESLint + TypeScript rules
npm run lint:fix                  # Auto-fix linting issues
```

### Security Testing

**CodeQL (SAST)**: Weekly + push to main + all PRs (BLOCKING ❌)
**npm audit**: Dependency vulnerability scanning (BLOCKING ❌)
**Gitleaks**: Secret detection (BLOCKING ❌)
**tfsec**: Terraform infrastructure security (BLOCKING ❌)
**Trivy**: Container vulnerability scanning (INFORMATIONAL ℹ️)

See `.specify/specs/011-qa-testing/TESTING_CI_CD_CONFIG.md` for complete CI/CD docs.

### Performance Testing (k6)

Performance and load testing uses [k6](https://k6.io/) with TDD-style threshold definitions.

**Test Scenarios**:
| Scenario | Duration | Users | Thresholds |
|----------|----------|-------|------------|
| Smoke | 30s | 1 | P95 < 200ms, Error < 1% |
| Load | 10min | 50 | P95 < 500ms, P99 < 1000ms |
| Stress | 15min | 200 | P95 < 2000ms, Error < 5% |
| Soak | 4hr | 25 | P95 < 500ms, Error < 0.1% |

**Commands**:

```bash
cd tests/performance

# Quick smoke test (30 seconds)
npm run test:smoke

# Full load test (10 minutes)
npm run test:load

# Stress test (find breaking point)
npm run test:stress

# CI mode (quick validation)
npm run test:ci
```

**CI Integration**: Performance smoke tests run automatically on push to main via `.github/workflows/ci.yml`.

**Results**: Each test generates a JSON results file (`*-results.json`) with threshold pass/fail status.

See `tests/performance/README.md` for complete documentation.

### End-to-End Testing (Playwright)

Browser-based E2E tests with full authentication flow including TOTP.

**TOTP Integration**:
- Uses `oathtool` command-line tool (now in PATH) to generate 6-digit TOTP codes
- Replaces JavaScript `otplib` library for more reliable, system-native TOTP generation
- Matches behavior of standard authenticator apps

**Test Environments**:
| Environment | App URL | Keycloak URL | TOTP Secret Source |
|-------------|---------|--------------|-------------------|
| dev | <https://www.tamshai.local> | <https://www.tamshai.local/auth> | Hardcoded (dev only) |
| stage | <https://www.tamshai.com> | <https://www.tamshai.com/auth> | Environment variable |
| prod | <https://prod.tamshai.com> | <https://keycloak-fn44nd7wba-uc.a.run.app/auth> | Secrets manager |

**Commands**:

```bash
cd tests/e2e

# Install Playwright browsers (first time only)
npm run install:browsers

# Run all E2E tests on dev
npm run test:dev

# Run login journey tests only
npm run test:login:dev
npm run test:login:stage
npm run test:login:prod

# Debug mode (step through tests)
npm run test:debug

# Interactive UI mode
npm run test:ui

# View test report
npm run test:report
```

**Environment Variables**:

```bash
# Test user service account (exists in ALL environments: dev, stage, prod)
# See docs/testing/TEST_USER_JOURNEY.md for details
export TEST_USERNAME="test-user.journey"      # Default: test-user.journey
export TEST_USER_PASSWORD="<from-secrets>"    # GitHub Secret: TEST_USER_PASSWORD
export TEST_USER_TOTP_SECRET="<from-secrets>" # GitHub Secret: TEST_USER_TOTP_SECRET

# Optional: Override with custom credentials
export TEST_USERNAME="<custom-username>"
export TEST_USER_PASSWORD="<custom-password>"
export TEST_USER_TOTP_SECRET="<custom-totp-secret>"
```

**Important**: The `test-user.journey` account is a dedicated service account for E2E testing that exists in all environments (dev, stage, prod). It has no data access privileges (safe for testing) and uses the same credentials across all environments.

**Customer Portal Test Users**:

```bash
# Customer user password (GitHub Secret: CUSTOMER_USER_PASSWORD)
export CUSTOMER_USER_PASSWORD="<from-secrets>"  # GitHub Secret: CUSTOMER_USER_PASSWORD

# Customer test users (all use the same password):
# - jane.smith@acme.com (Lead - Acme Corporation)
# - bob.developer@acme.com (Basic - Acme Corporation)
# - mike.manager@globex.com (Lead - Globex Industries)
```

**Important**: Customer users are provisioned in the `tamshai-customers` realm (separate from employee realm). They do NOT require TOTP - only username/password authentication.

**TOTP Code Generation**:

```bash
# Generate TOTP code manually for testing (test-user.journey)
oathtool --totp --base32 "$TEST_USER_TOTP_SECRET"
# Output: 6-digit code (e.g., 123456) valid for 30 seconds
```

**Test Coverage**:
- Full SSO login journey (username/password + TOTP)
- Portal SPA rendering and asset loading
- User authentication state verification
- Error handling (invalid credentials, TOTP failures)

See `tests/e2e/specs/login-journey.ui.spec.ts` for implementation details.

---

## Development Environment

### Prerequisites

- Docker Desktop 4.0+ with Docker Compose v2+
- Node.js 20+ and npm 10+
- GitHub CLI 2.40+ (for CI/CD debugging, PR management)
- Terraform 1.5+ (for VPS deployment)
- Google Cloud SDK (gcloud) - for GCP production deployments
- 8GB RAM minimum (16GB recommended)
- 20GB free disk space

**Google Cloud SDK (gcloud) Configuration**

The gcloud CLI is installed and available in PATH.

```bash
# Verify gcloud is accessible
gcloud --version
# Should output: Google Cloud SDK 551.0.0

# Authenticate with service account (for GCP deployments)
gcloud auth activate-service-account --key-file=infrastructure/terraform/gcp/gcp-sa-key.json

# Configure Docker for Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev
```

**Installation Location**: `C:\Users\jcorn\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd`

**IMPORTANT: Elasticsearch Kernel Parameter**

Elasticsearch requires `vm.max_map_count` to be set to at least 262144:

```bash
# Linux
sudo sysctl -w vm.max_map_count=262144

# Persist across reboots
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Windows (WSL2)
# In WSL2 terminal
sudo sysctl -w vm.max_map_count=262144

# macOS (Docker Desktop)
# Docker Desktop handles this automatically
# If issues persist, increase Docker memory to 4GB+
```

**Verification**:

```bash
sysctl vm.max_map_count
# Should output: vm.max_map_count = 262144
```

### Port Allocation

**Network**: `172.30.0.0/16` (avoids conflicts with MCP dev at `172.28.0.0/16`)

| Service | Port | Purpose |
|---------|------|---------|
| Kong Gateway | 8100 | API Gateway |
| Keycloak | 8180 | Identity Provider |
| MCP Gateway | 3100 | AI Orchestration |
| MCP HR | 3101 | HR Data MCP |
| MCP Finance | 3102 | Finance MCP |
| MCP Sales | 3103 | Sales MCP |
| MCP Support | 3104 | Support MCP |
| MCP Journey | 3105 | Project History Agent |
| MCP Payroll | 3106 | Payroll MCP |
| MCP Tax | 3107 | Tax MCP |
| MCP UI | 3108 | Generative UI Components |
| Web Payroll | 4005 | Payroll Web App |
| PostgreSQL | 5433 | Relational DB |
| MongoDB | 27018 | Document DB |
| Elasticsearch | 9201 | Search Engine |
| MinIO API | 9100 | Object Storage |
| MinIO Console | 9102 | MinIO UI |
| Redis | 6380 | Token Cache |
| Vault | 8200 | Secrets Management (host, not Docker) |

### Environment Variables

> **SECURITY WARNING - DEVELOPMENT ONLY**
>
> The credentials shown below are **DEFAULT VALUES FOR LOCAL DEVELOPMENT ONLY**.
>
> **FOR PRODUCTION**: Use GCP Secret Manager (see `infrastructure/terraform/main.tf`)

**File**: `infrastructure/docker/.env` (copy from `.env.example`)

```bash
# ============================================================
# LOCAL DEVELOPMENT CREDENTIALS - DO NOT USE IN PRODUCTION
# ============================================================

# Keycloak Configuration
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-admin}
KEYCLOAK_DB_PASSWORD=${KEYCLOAK_DB_PASSWORD:-changeme}

# Database Credentials
POSTGRES_PASSWORD=${TAMSHAI_DB_PASSWORD:-changeme}
MONGODB_ROOT_PASSWORD=${MONGODB_PASSWORD:-changeme}

# MCP Gateway
MCP_GATEWAY_PORT=3100
CLAUDE_API_KEY=  # REQUIRED: Get from https://console.anthropic.com/

# JWT Configuration
KEYCLOAK_ISSUER=http://keycloak:8080/realms/tamshai
JWKS_URI=http://keycloak:8080/realms/tamshai/protocol/openid-connect/certs

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
```

**Critical Variables**:
- `CLAUDE_API_KEY`: **Required** - Get from Anthropic Console, never commit
- `KEYCLOAK_ADMIN_PASSWORD`: Set via environment variable, not in file
- `POSTGRES_PASSWORD`: Set via environment variable, not in file

### Test Users

> **SECURITY WARNING - DEVELOPMENT ONLY**
>
> These test users exist ONLY in `keycloak/realm-export-dev.json` for local testing.
>
> **PRODUCTION USES**: `keycloak/realm-export.json` (no pre-configured users)

**Development Credentials** (password: `[REDACTED-DEV-PASSWORD]`, TOTP: `[REDACTED-DEV-TOTP]`):

| Username | Role | Position | Access |
|----------|------|----------|--------|
| eve.thompson | executive | CEO | All departments (read) |
| alice.chen | hr-read, hr-write | VP of HR | All employees |
| bob.martinez | finance-read, finance-write | Finance Director | All finance data |
| carol.johnson | sales-read, sales-write | VP of Sales | All sales/CRM |
| dan.williams | support-read, support-write | Support Director | Tickets, KB |
| nina.patel | manager | Engineering Manager | Team only |
| marcus.johnson | user | Software Engineer | Self only |
| frank.davis | intern | IT Intern | Minimal access |

---

## Deployment

### Local Development

**Method**: Docker Compose
**File**: `infrastructure/docker/docker-compose.yml`

```bash
cd infrastructure/docker
docker compose up -d
```

**Services**: 13 containers
**Network**: `tamshai-network` (172.30.0.0/16)
**Volumes**: Named volumes for data persistence

### Production (Planned)

**Platform**: Google Cloud Platform (GCP)
**Orchestration**: Google Kubernetes Engine (GKE)
**IaC**: Terraform (`infrastructure/terraform/main.tf`)

**Resources**:
- GKE Cluster (3 nodes, n1-standard-2)
- Cloud SQL PostgreSQL (db-f1-micro)
- Cloud Storage (finance-docs, public-docs)
- Cloud NAT + Load Balancer
- Secret Manager for credentials

**Cost Estimate**: $17-25/month (preemptible), $35-45/month (regular VMs)

---

## Current Development Status

### Active Work: App Ecosystem Expansion

Transform sample applications into enterprise-grade modules with unified UX, adding Payroll and Tax modules. All employees are US-based remote workers across multiple states, supporting a SaaS-focused financial/LLC management services enterprise.

**Plan File**: `.claude/plans/playful-zooming-willow.md`

### Implementation Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Specification Reorganization | ⏳ Planned |
| Phase 2 | App Enhancements (HR, Finance, Sales, Support) | ⏳ Planned |
| Phase 2.1 | **Expense Reports (v1.5)** | 🔄 **In Progress** |
| Phase 3.1 | **Payroll Module** | ✅ **Complete** |
| Phase 3.2 | Tax Module | ⏳ Planned |
| Phase 4 | Data Layer Expansion | ⏳ Planned |
| Phase 5 | TDD Implementation Strategy | ✅ In Use |
| Phase 6 | E2E Testing & Journey Validation | ⏳ Planned |

### Phase 3.1 - Payroll Module (Complete)

**Payroll Web App** (124 tests passing):
- Pages: DashboardPage, PayRunsPage, PayStubsPage, ContractorsPage, DirectDepositPage
- Pages: TaxWithholdingsPage, BenefitsPage, AIQueryPage
- All pages use conditional rendering pattern for consistent header display

**MCP Payroll Server** (port 3106):
- 8 tools: list_pay_runs, list_pay_stubs, get_pay_stub, list_contractors
- 4 more: get_tax_withholdings, get_benefits, get_direct_deposit, get_payroll_summary
- PostgreSQL with RLS, Redis for confirmations, Winston logging

**Database Schema** (`infrastructure/database/payroll/`):
- 10 tables: employees, pay_runs, pay_stubs, contractors, etc.
- RLS policies for role-based access
- Sample data with 8 employees, pay runs, tax withholdings, benefits

**Infrastructure**:
- Docker: mcp-payroll (3106), web-payroll (4005)
- Keycloak: payroll-read, payroll-write roles, Payroll-Team group
- PostgreSQL: tamshai_payroll database

### Phase 2.1 - Expense Reports v1.5 (In Progress)

**Database Schema** (`sample-data/finance-data.sql`):
- `finance.expense_reports` - Container table with workflow status tracking
- `finance.expense_items` - Line items with receipt tracking
- Status workflow: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → REIMBURSED (or REJECTED)
- RLS policies for 3-tier access (self, manager, finance)

**MCP Finance Tools** (port 3102):
- `list_expense_reports` - Cursor-based pagination, status/department/date filters
- `get_expense_report` - Full report with line items
- `approve_expense_report` - Human-in-the-loop confirmation (SUBMITTED/UNDER_REVIEW → APPROVED)
- `reject_expense_report` - Requires rejection reason, confirmation flow
- `reimburse_expense_report` - Payment reference tracking (APPROVED → REIMBURSED)

**Integration Tests** (`services/mcp-gateway/src/__tests__/integration/expense-reports.test.ts`):
- 32 test cases covering schema, RLS, tools, and workflow
- Test fixture reset for idempotent test runs
- 8 test expense reports across all status states

**Sample Data**:
- 8 expense reports across various statuses and departments
- 25+ line items covering travel, meals, supplies, software, equipment
- Realistic amounts ($500-$4,200 per report)

### Next Steps

1. Run and validate expense reports integration tests
2. Phase 3.2: Tax Module (TDD RED → GREEN)
3. Phase 2: Enhance existing apps (HR, Finance, Sales, Support)
4. Phase 6: Cross-app E2E testing

### Completed Foundation Work

**Phase 1-4**: ✅ Docker Compose, Keycloak SSO, JWT validation, MCP Gateway
**Phase 5**: ✅ Sample web apps (Finance, Sales, Support)
**Phase 9**: ✅ Security remediation (Terraform infrastructure)
**Phase 10**: ✅ Documentation

### Generative UI Fixes (v1.5 - February 2026)

**Status**: ✅ Complete (6 of 7 components operational)

**Plan Files**:
- `.claude/plans/generative-ui-fixes.md` - Complete implementation plan
- `.claude/plans/generative-ui-validation.md` - MCP tool validation results
- `.claude/plans/generative-ui-testing-guide.md` - Manual testing procedures

**Completed Work**:

**Phase 1 - Infrastructure** ✅
- Docker Compose build args for VITE_MCP_UI_URL
- .env files created for Sales, Finance, Support apps
- Caddy reverse proxy configuration at /mcp-ui/*

**Phase 2 - Frontend Fixes** ✅
- AIQueryPage URL fallback: `/mcp-ui/api/display` (all apps)
- Component styling: Converted to semantic tokens (secondary-*, primary-*, success/danger/warning-*)
- Components updated: ForecastChart, BudgetSummaryCard, QuarterlyReportDashboard

**Phase 3 - Component Registry Transforms** ✅
- `hr:org_chart` - Maps employee_id → id, extracts self/directReports
- `sales:customer` - Extracts customer/contacts, maps contact._id → id
- `sales:leads` - Handles leads as direct array
- `sales:forecast` - Maps forecast data (validation pending)
- `finance:budget` - Maps BudgetSummary to BudgetData with categories
- `approvals:pending` - Multi-source transform (HR + Finance) with field mapping

**Phase 4 - MCP Tool Validation** ✅
- 9 of 10 tools implemented and validated
- Missing: `finance.get_quarterly_report` (blocks QuarterlyReportDashboard)

**Phase 5 - Manual Testing** ⏳
- Testing guide created
- 6 components ready for testing
- 1 component blocked (quarterly_report)

**Phase 6 - Documentation** ✅
- Validation report generated
- Testing procedures documented
- CLAUDE.md updated

**Operational Components**:
1. ✅ HR Org Chart (display:hr:org_chart)
2. ✅ Sales Customer Detail (display:sales:customer)
3. ✅ Sales Leads Table (display:sales:leads)
4. ✅ Sales Forecast Chart (display:sales:forecast)
5. ✅ Finance Budget Summary (display:finance:budget)
6. ✅ Approvals Queue (display:approvals:pending)
7. ❌ Finance Quarterly Report (display:finance:quarterly_report) - Tool not implemented

**Known Limitations**:
- `approvals:pending.budgetAmendments.currentBudget` - Always 0 (tool returns new budget submissions, not amendments to existing budgets)
- `finance:quarterly_report` - Cannot test until get_quarterly_report tool is implemented

**Testing Instructions**:
See `.claude/plans/generative-ui-testing-guide.md` for complete manual testing procedures.

---

## Security & Compliance

### Security Model

**Defense-in-Depth**: 6 layers (Auth, Gateway, MCP, Servers, Data, Network)
**Authentication**: OIDC with PKCE, TOTP MFA, WebAuthn (production admins)
**Authorization**: Hierarchical RBAC with composite roles
**Token Management**: 5-minute JWT, Redis revocation, rotation-ready
**Prompt Defense**: 5-layer injection protection (validation, blocking, delimiters, reinforcement, output validation)

See `docs/architecture/security-model.md` for complete security documentation.

### OAuth Flow Policy

**ROPC (Resource Owner Password Credentials) Flow**:

The `direct_access_grants_enabled` setting controls whether the ROPC flow (password grant) is allowed for the `mcp-gateway` Keycloak client. **ROPC is disabled in all environments** as of 2026-02-13.

**Security Assessment** (2026-02-12, updated 2026-02-13):
- **Production Runtime**: Does NOT use ROPC flow - all production apps use Authorization Code + PKCE
- **Integration Tests**: Use token exchange (mcp-integration-runner service account) - no ROPC
- **Performance Tests**: Use token exchange with per-VU caching - no ROPC
- **Admin API Access**: Uses admin-cli client credentials (KEYCLOAK_ADMIN_CLIENT_SECRET) with ROPC fallback

**Environment Policy** (Updated 2026-02-13 - Migration Complete):

| Environment | direct_access_grants_enabled | Justification |
|-------------|------------------------------|---------------|
| **Production** | `false` | No runtime usage, security best practice |
| **Stage** | `false` | Mirror production security posture |
| **Dev** | `false` | Migration complete - using token exchange and client credentials |
| **CI** | `false` | Migration complete - using token exchange and client credentials |

**Exception**: E2E browser tests (Playwright) may use ROPC for UI login validation. This is an acceptable exception documented in `docs/security/ROPC_ASSESSMENT.md`.

**Configuration**: Set via `direct_access_grants_enabled` variable in `infrastructure/terraform/keycloak/environments/*.tfvars`

**See Also**: `docs/security/ROPC_ASSESSMENT.md` for complete security analysis and migration results.

### Compliance

**Standards**:
- SOC 2 Type II (planned)
- GDPR compliance (data masking, right to deletion)
- S-OX (financial data)

**Audit Requirements**:
- 90-day audit log retention (dev)
- 7-year retention (production)
- PII scrubbing in logs
- Tamper-proof log storage (WORM)

---

## Keycloak Configuration Management

### Overview

Keycloak configuration (clients, roles, etc.) is managed through:
1. **Source of Truth**: `keycloak/realm-export-dev.json` (dev) and `keycloak/realm-export.json` (prod)
2. **Sync Scripts**: `keycloak/scripts/sync-realm.sh` - idempotent script to sync configuration
3. **CI/CD Integration**: `deploy-vps.yml` automatically syncs Keycloak on deployment

### Adding a New Keycloak Client

1. **Add to realm export** (`keycloak/realm-export-dev.json`):

```json
{
  "clientId": "my-new-app",
  "name": "My New Application",
  "enabled": true,
  "publicClient": true,
  "standardFlowEnabled": true,
  "redirectUris": ["http://localhost:3000/*"],
  "webOrigins": ["http://localhost:3000"],
  "attributes": {"pkce.code.challenge.method": "S256"},
  "defaultClientScopes": ["openid", "profile", "email", "roles"]
}
```

1. **Add to sync script** (`keycloak/scripts/sync-realm.sh`):

```bash
sync_my_new_app_client() {
    local client_json='{...}'
    create_or_update_client "my-new-app" "$client_json"
}
```

1. **Apply locally**:

```bash
# Option 1: Run sync script (updates existing Keycloak)
cd keycloak/scripts
./docker-sync-realm.sh dev

# Option 2: Full reimport (resets Keycloak data)
cd infrastructure/docker
docker compose down keycloak
docker volume rm $(docker volume ls -q | grep keycloak) 2>/dev/null
docker compose up -d keycloak
```

1. **Deploy to stage**: Push to main - CI/CD will sync automatically

### Manual Keycloak Sync

**Local Development:**

```bash
cd keycloak/scripts
./docker-sync-realm.sh dev tamshai-keycloak
```

### Keycloak Admin Access

**Local Dev:**
- URL: <http://localhost:8180/auth/admin>
- Username: admin
- Password: admin

---

## Troubleshooting

### Common Issues

**1. Port Conflicts**

```bash
# Check if ports are in use
lsof -i :3100
lsof -i :8100
lsof -i :8180

# Change ports in .env if needed
MCP_GATEWAY_PORT=3200
KONG_PORT=8200
KEYCLOAK_PORT=8280
```

**2. Docker Compose Fails**

```bash
# Check Docker status
docker info

# Clean up old containers/networks
docker compose down -v
docker system prune -a

# Restart Docker Desktop
```

**3. Keycloak Not Ready**

```bash
# Check Keycloak logs
docker compose logs keycloak

# Wait for "Admin console listening on" message (30-60 seconds)

# Check health endpoint
curl http://localhost:8180/health/ready
```

**4. JWT Validation Fails**

```bash
# Verify Keycloak JWKS is accessible
docker compose exec mcp-gateway curl http://keycloak:8080/realms/tamshai/protocol/openid-connect/certs

# Check network connectivity
docker compose exec mcp-gateway ping keycloak

# Decode token at https://jwt.io to verify claims
```

**5. Claude API Errors**

```bash
# Verify API key is set
docker compose exec mcp-gateway printenv CLAUDE_API_KEY

# Check API key format (should start with sk-ant-api03-)
```

**6. Database Connection Issues**

```bash
# Check PostgreSQL
docker compose exec postgres psql -U tamshai -d tamshai_hr -c "SELECT 1;"

# Check MongoDB
docker compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

### Debugging Tips

**Enable Verbose Logging**:

```typescript
// services/mcp-gateway/src/index.ts
const logger = winston.createLogger({
  level: 'debug',  // Change from 'info' to 'debug'
});
```

**Inspect JWT Token**:

```bash
# Get token via token exchange (preferred - no user password needed)
SVC_TOKEN=$(curl -s -X POST http://localhost:8180/realms/tamshai-corp/protocol/openid-connect/token \
  -d "client_id=mcp-integration-runner" \
  -d "client_secret=$MCP_INTEGRATION_RUNNER_SECRET" \
  -d "grant_type=client_credentials" | jq -r '.access_token')

TOKEN=$(curl -s -X POST http://localhost:8180/realms/tamshai-corp/protocol/openid-connect/token \
  -d "client_id=mcp-integration-runner" \
  -d "client_secret=$MCP_INTEGRATION_RUNNER_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=$SVC_TOKEN" \
  -d "requested_subject=alice.chen" \
  -d "scope=openid profile roles" | jq -r '.access_token')

# Or use the helper script
TOKEN=$(./scripts/get-keycloak-token.sh alice.chen)

# Decode token
echo $TOKEN | cut -d. -f2 | base64 -d | jq .
```

**Monitor Redis**:

```bash
# Watch token revocations
docker compose exec redis redis-cli MONITOR

# List revoked tokens
docker compose exec redis redis-cli KEYS "revoked:*"
```

---

## Key Documentation References

### Architecture & Design

- [Architecture Overview](docs/architecture/overview.md)
- [Security Model](docs/architecture/security-model.md)
- [Architecture Specs](.specify/ARCHITECTURE_SPECS.md)
- [V1.4 Update Status](.specify/V1.4_UPDATE_STATUS.md)

### Security

- [Terraform State Security](docs/security/TERRAFORM_STATE_SECURITY.md)
- [VPS Firewall Justification](docs/security/VPS_FIREWALL_JUSTIFICATION.md)
- [Security Remediation Plan](docs/archived/keycloak-debugging-2025-12/2025-12-31-security-remediation-plan.md)
- [Phase 5 Security Analysis](docs/archived/keycloak-debugging-2025-12/2025-12-31-phase5-remaining-issues.md)

### Operations & Deployment

- [VPS Access & Phoenix Rebuild](.claude/vps-access-and-phoenix.md) - SSH access, container names, credentials, Phoenix rebuild procedure

### Development

- [Port Allocation](docs/development/PORT_ALLOCATION.md)
- [Lessons Learned](docs/development/lessons-learned.md)
- [Test Coverage Strategy](.specify/specs/011-qa-testing/TEST_COVERAGE_STRATEGY.md)
- [Testing & CI/CD Config](.specify/specs/011-qa-testing/TESTING_CI_CD_CONFIG.md)

### Refactoring (Active Work)

- [Refactoring Plan](.specify/specs/003-mcp-gateway/REFACTORING_PLAN.md) (3,477 lines)
  - Review #1: Technical Lead feedback (JWKS singleton, StreamingService, integration tests)
  - Review #2: QA Lead feedback (SSE scenarios, mock factories, type coverage)
  - Review #3: Final execution safeguards (disconnect handling, HTTP mocking)

### Specifications

- [001 - Foundation](.specify/specs/001-foundation/)
- [002 - Security](.specify/specs/002-security-iam/)
- [003 - MCP Gateway](.specify/specs/003-mcp-gateway/)
- [004 - MCP Suite](.specify/specs/004-mcp-suite/)
- [009 - Flutter Unified](.specify/specs/009-flutter-unified/)
- [011 - QA Testing](.specify/specs/011-qa-testing/)

### External Links

- [Anthropic Claude API Docs](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Kong Gateway](https://docs.konghq.com/gateway/latest/)

---

## Project Repository

**GitHub**: <https://github.com/jcornell3/tamshai-enterprise-ai>
**Issues**: Use GitHub Issues for bug reports
**Project Sponsor**: John Cornell

---

## Current Implementation State

**Last Updated**: 2026-02-06
**Active Phase**: Expense Reports v1.5 Implementation
**Working Branch**: main

### Current Work: Expense Reports v1.5

**Status**: Integration tests created, MCP tools implemented, database schema complete

**Completed**:
- ✅ Database schema (expense_reports, expense_items tables)
- ✅ RLS policies (self, manager, finance access)
- ✅ MCP tools (list, get, approve, reject, reimburse)
- ✅ Human-in-the-loop confirmation flows
- ✅ Sample data (8 reports, 25+ line items)
- ✅ Integration tests (32 test cases)

**In Progress**:
- 🔄 Test fixture reset validation
- 🔄 Budget approval test reliability fixes

### Enterprise UX Hardening Complete (v1.5)

**Phase 0-1: Research & Specification**
- ✅ Deep domain research (Salesforce, Gusto, ServiceNow patterns)
- ✅ UI tokens and patterns documented in `.specify/specs/005-sample-apps/`
- ✅ BULK_ACTIONS_PATTERN.md and WIZARD_PATTERN.md created

**Phase 2: Shared Component Library** (`clients/web/packages/ui/`)
- ✅ DataTable component (bulk actions, sorting, pagination, selection)
- ✅ Wizard component (multi-step, validation, breadcrumbs)
- ✅ AuditTrail component (S-OX compliance, posted indicator)
- ✅ 114 passing tests in UI package

**Phase 3: E2E Test Infrastructure** (`tests/e2e/`)
- ✅ Wizard utilities (navigation, validation, step assertions)
- ✅ Bulk action utilities (selection, toolbar, action execution)
- ✅ Database snapshot/rollback helpers
- ✅ Payroll wizard E2E tests

**Phase 4.1: Finance Invoice Batch Approval**
- ✅ InvoicesPage with DataTable bulk selection
- ✅ Bulk approve/reject/export actions
- ✅ Confirmation dialog integration
- ✅ CSV export functionality

**Phase 5: Edge Case Data & Audit Compliance**
- ✅ Overdue invoices (30-90 days, various statuses)
- ✅ Terminated employees (3 records with terminated_at)
- ✅ Breached SLA tickets (3 records past resolution_deadline)
- ✅ AuditTrail UI component with S-OX posted indicator

**Phase 6: Quality Audit**
- ✅ UI package tests: 114 passing
- ✅ Wizard component: 29 passing tests
- ✅ AuditTrail component: 22 passing tests
- ✅ DataTable component: all tests passing

### Generative UI Replication Complete (Phase C.5)

**Status**: ✅ Complete (2026-02-10)
**Scope**: Replicate generative UI + voice integration from HR app to all 5 remaining apps
**Architecture Version**: v1.5 (Generative UI + Voice I/O)

**Apps Updated**:
1. **Sales** (Commit: cc2340c8)
   - Directive detection: `display:sales:customer:*`, `display:sales:leads:*`
   - SSEQueryClient integration with onQueryComplete callback
   - Voice input/output hooks (useVoiceInput, useVoiceOutput)
   - VITE_MCP_UI_URL configuration

2. **Support** (Commit: cc2340c8)
   - Directive detection: `display:support:tickets:*`
   - SSEQueryClient integration
   - Voice I/O with toggle control
   - VITE_MCP_UI_URL configuration

3. **Finance** (Commit: eed467df)
   - Directive detection: `display:finance:budget:*`, `display:finance:quarterly_report:*`
   - EventSource integration with currentMessageContentRef tracking
   - Preserved existing features: message history, markdown, confirmations
   - Voice I/O with visual indicators

4. **Payroll** (Commit: 6f7bc858)
   - Directive detection: `display:payroll:pay_stub:*`, `display:payroll:pay_runs:*`
   - ReadableStream integration with directive detection on completion
   - Created .env.example with VITE_MCP_UI_URL
   - Voice I/O with listening indicator

5. **Tax** (Commit: 6f7bc858)
   - Directive detection: `display:tax:quarterly_estimate:*`, `display:tax:filings:*`
   - ReadableStream integration
   - Created .env.example
   - Voice I/O complete

**Key Patterns Implemented**:
- **Pattern 1** (HR, Sales, Support): SSEQueryClient callback integration
- **Pattern 2** (Finance): EventSource with content ref tracking
- **Pattern 3** (Payroll, Tax): ReadableStream with post-completion detection

**Technical Achievement**: Successfully adapted generative UI pattern to three different streaming architectures while preserving existing functionality.

**Documentation**: `.claude/generative-ui-hr-implementation.md`

### Technical Debt Log

- Finance app vitest configuration needs workspace package resolution fix
- Pre-existing test failures in Finance/Budget/Expense pages (module mocking)
- Budget approval tests require fixture reset for idempotent runs

### Next Phase: Tax Module

After completing expense reports v1.5, begin Phase 3.2 - Tax Module implementation using TDD:
1. Write failing tests (RED phase)
2. Implement minimal code (GREEN phase)
3. MCP Tax server (port 3107, container: mcp-tax)
4. Database schema and sample data

---

*Last Updated: February 15, 2026*
*Architecture Version: 1.5 (Generative UI + Expense Reports)*
*Document Version: 3.4 (CI Workflow Optimization + Port Alignment)*
