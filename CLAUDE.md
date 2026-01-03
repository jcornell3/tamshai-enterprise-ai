# Tamshai Enterprise AI - Claude Code Guide

## Project Overview

**Project**: Tamshai Corp Enterprise AI Access System
**Version**: 1.4 (December 2025)
**Type**: Microservices Architecture with AI Orchestration
**Primary Language**: TypeScript/Node.js
**Status**: VPS Staging Deployed - MCP Gateway Refactoring in Progress

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
# Check service status (dev or stage)
./scripts/infra/status.sh dev            # Check local dev services
./scripts/infra/status.sh stage          # Check stage VPS services

# Deploy services
./scripts/infra/deploy.sh dev            # Deploy all dev services
./scripts/infra/deploy.sh dev --build    # Rebuild containers
./scripts/infra/deploy.sh dev --sync     # Deploy and sync Keycloak
./scripts/infra/deploy.sh stage          # Deploy to stage VPS

# Keycloak management
./scripts/infra/keycloak.sh sync dev     # Sync Keycloak clients/config
./scripts/infra/keycloak.sh sync stage   # Sync stage Keycloak
./scripts/infra/keycloak.sh status dev   # Check Keycloak status
./scripts/infra/keycloak.sh clients dev  # List all clients
./scripts/infra/keycloak.sh users dev    # List all users
./scripts/infra/keycloak.sh scopes dev   # List client scopes
./scripts/infra/keycloak.sh logs dev     # View Keycloak logs

# MCP health check
./scripts/mcp/health-check.sh dev        # Check all MCP servers
./scripts/mcp/health-check.sh stage      # Check stage MCP servers

# MCP server restart
./scripts/mcp/restart.sh dev             # Restart all MCP servers
./scripts/mcp/restart.sh dev gateway     # Restart only MCP Gateway
./scripts/mcp/restart.sh stage all       # Restart all on stage

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

# Environment teardown
./scripts/infra/teardown.sh dev          # Stop dev containers
./scripts/infra/teardown.sh dev --volumes # Remove data volumes (DESTRUCTIVE)
./scripts/infra/teardown.sh stage        # Stop stage containers

# Database backup (alternative location)
./scripts/infra/backup.sh                # Backup all databases
./scripts/infra/backup.sh postgres       # Backup PostgreSQL only
./scripts/infra/backup.sh mongodb        # Backup MongoDB
```

**Environment Variables for Stage Scripts:**
```bash
export VPS_HOST="5.78.159.29"            # VPS IP address
export VPS_SSH_USER="root"               # SSH user
export KEYCLOAK_ADMIN_PASSWORD="xxx"     # For Keycloak admin commands
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

### Flutter Unified Client Development

```bash
cd clients/unified_flutter

# Get dependencies
flutter pub get

# Generate Freezed/JSON serialization code
flutter pub run build_runner build --delete-conflicting-outputs

# Run on Windows (debug)
flutter run -d windows

# Build Windows release
flutter build windows --release

# Run tests
flutter test
```

**Key Flutter Files**:
- `lib/core/auth/` - OAuth service, secure storage, auth state
- `lib/core/api/` - Dio HTTP client with auth interceptor
- `lib/features/chat/` - Chat UI, SSE streaming, message handling
- `lib/features/home/` - Home screen, user profile display

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

```
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
```
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

---

## Development Environment

### Prerequisites

- Docker Desktop 4.0+ with Docker Compose v2+
- Node.js 20+ and npm 10+
- GitHub CLI 2.40+ (for CI/CD debugging, PR management)
- Terraform 1.5+ (for VPS deployment)
- 8GB RAM minimum (16GB recommended)
- 20GB free disk space

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

### VPS Staging (Current)

**Status**: ✅ **Deployed and Running**
**Platform**: Hetzner Cloud
**Location**: Hillsboro, Oregon (hil datacenter)
**Server**: CPX31 (4 vCPU, 8GB RAM)
**IP**: 5.78.159.29
**Domain**: Configured via Cloudflare

**Deployment Method**: Terraform + cloud-init
**Files**:
- `infrastructure/terraform/vps/main.tf` - Hetzner Cloud infrastructure
- `infrastructure/cloud-init/cloud-init.yaml` - Automated VPS provisioning
- `.github/workflows/deploy-vps.yml` - CI/CD deployment pipeline

**Services Deployed**:
- MCP Gateway (Port 3100)
- Keycloak (Port 8080)
- PostgreSQL, MongoDB, Redis
- Caddy reverse proxy (HTTPS via Cloudflare)

**Deployment Commands**:
```bash
cd infrastructure/terraform/vps
terraform init
terraform plan
terraform apply

# IMPORTANT: After terraform apply (especially destroy+apply), update SSH secret:
gh secret set VPS_SSH_KEY < infrastructure/terraform/vps/.keys/deploy_key

# Then deploy via GitHub Actions
gh workflow run deploy-vps.yml --ref main
```

**Access**:
- API Gateway: `https://5.78.159.29/api` (via Cloudflare)
- Keycloak: `https://5.78.159.29/auth`
- Health Check: `https://5.78.159.29/health`

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

### Active Work: MCP Gateway Refactoring

**Objective**: Increase test coverage from 31% to 70%+ by refactoring 1,533-line `index.ts` monolith.

**Documentation**: `.specify/specs/003-mcp-gateway/REFACTORING_PLAN.md` (3,477 lines)

**Status**: Ready for implementation by QA Lead
**Timeline**: 5 weeks (4 phases + optional error handler)
**Review Status**: ✅ All 3 review rounds complete (Tech Lead, QA Lead, Final Review)

**Critical Implementation Requirements**:
1. 🔴 **Client disconnect handling** in Phase 3 (prevents $570/month Anthropic API waste)
2. 🔴 **HTTP mocking with nock** in Phase 4.2 (prevents flaky CI, 8x faster tests)
3. 🔴 **JWTValidator singleton** in Phase 2 (prevents JWKS cache bypass)

**Target Metrics**:
- Overall coverage: 31% → 60%+ (diff: 90%+)
- Type coverage: 85%+
- index.ts LOC: 1,533 → <200

### Completed Work

**Phase 1**: ✅ Docker Compose infrastructure, Keycloak SSO, sample data
**Phase 2**: ✅ JWT validation, token revocation, prompt injection defense
**Phase 3**: ✅ MCP Gateway implementation, Claude API integration, role-based routing
**Phase 4**: ⚠️ MCP Suite servers (planned for implementation)
**Phase 5**: ⚠️ Sample web apps (planned)
**Phase 6**: ✅ Flutter unified desktop client (Windows complete)
**Phase 7**: ⚠️ Monitoring & alerting (planned)
**Phase 8**: ✅ VPS staging deployment (Hetzner Cloud)
**Phase 9**: ✅ Security remediation (Terraform infrastructure)
  - 10 GCP issues resolved (SSL, logging, encryption, access controls)
  - 4 VPS issues suppressed with defense-in-depth justifications
  - Security documentation created (state security, firewall justification)
  - Remaining: 2-3 low-priority items deferred to Phase 6 (monitoring)
**Phase 10**: ✅ Documentation (this file, security docs)

---

## Security & Compliance

### Security Model

**Defense-in-Depth**: 6 layers (Auth, Gateway, MCP, Servers, Data, Network)
**Authentication**: OIDC with PKCE, TOTP MFA, WebAuthn (production admins)
**Authorization**: Hierarchical RBAC with composite roles
**Token Management**: 5-minute JWT, Redis revocation, rotation-ready
**Prompt Defense**: 5-layer injection protection (validation, blocking, delimiters, reinforcement, output validation)

See `docs/architecture/security-model.md` for complete security documentation.

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

2. **Add to sync script** (`keycloak/scripts/sync-realm.sh`):
```bash
sync_my_new_app_client() {
    local client_json='{...}'
    create_or_update_client "my-new-app" "$client_json"
}
```

3. **Apply locally**:
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

4. **Deploy to stage**: Push to main - CI/CD will sync automatically

### Manual Keycloak Sync

**Local Development:**
```bash
cd keycloak/scripts
./docker-sync-realm.sh dev tamshai-keycloak
```

**Stage/VPS (via SSH):**
```bash
ssh root@5.78.159.29
cd /opt/tamshai
docker cp keycloak/scripts/sync-realm.sh keycloak:/tmp/
docker exec keycloak bash -c 'sed -i "s/\r$//" /tmp/sync-realm.sh'
docker exec -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  keycloak /tmp/sync-realm.sh stage
```

### Keycloak Admin Access

**Local Dev:**
- URL: http://localhost:8180/auth/admin
- Username: admin
- Password: admin

**Stage/Prod:**
- URL: https://[VPS_IP]/auth/admin
- Credentials: Stored in Terraform state or secrets manager

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
# Get token from Keycloak
TOKEN=$(curl -X POST http://localhost:8180/realms/tamshai/protocol/openid-connect/token \
  -d "client_id=mcp-gateway" \
  -d "client_secret=[REDACTED-DEV-SECRET]" \
  -d "username=alice.chen" \
  -d "password=[REDACTED-DEV-PASSWORD]" \
  -d "grant_type=password" \
  -d "scope=openid" | jq -r '.access_token')

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
- [Security Remediation Plan](docs/keycloak-findings/2025-12-31-security-remediation-plan.md)
- [Phase 5 Security Analysis](docs/keycloak-findings/2025-12-31-phase5-remaining-issues.md)

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

**GitHub**: https://github.com/jcornell3/tamshai-enterprise-ai
**Issues**: Use GitHub Issues for bug reports
**Project Sponsor**: John Cornell

---

*Last Updated: December 31, 2025*
*Architecture Version: 1.4 (Flutter Desktop Complete, VPS Staging Deployed, Security Hardened)*
*Document Version: 2.1 (Security Remediation Complete)*
