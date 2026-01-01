# Task: Implement Incremental Deployment Workflows

**Date**: 2025-12-31
**Priority**: High
**Status**: 📋 PLANNED
**Type**: Infrastructure Enhancement
**Estimated Effort**: 16-24 hours

---

## Overview

Implement granular, service-specific deployment workflows to enable incremental updates to individual services, websites, and applications without requiring full environment redeployments.

**Business Need**: As we add more services and websites, we need the ability to update a single service (e.g., MCP Gateway, HR app frontend) without restarting the entire stack. This reduces downtime, deployment time, and risk.

**Current State**: Monolithic deployments that restart all services
**Target State**: Pinpoint deployments that update only changed services

---

## Current Deployment Capabilities

### ✅ What We Have

**1. GitHub Actions Workflows**:
- `.github/workflows/deploy-vps.yml` - Full VPS deployment
  - Triggers: Push to main, manual dispatch, releases
  - Scope: **All services** (monolithic)
  - Method: `docker compose up -d` (recreates all containers)
  - Health checks: MCP Gateway, Keycloak only

- `.github/workflows/deploy.yml` - DevSecOps pipeline
  - Security scanning (Checkov, tfsec, Semgrep)
  - Integration tests
  - No actual deployment (pipeline only)

- `.github/workflows/ci.yml` - Integration tests
  - Runs on all PRs/pushes
  - No deployment capability

**2. Manual Scripts**:
- `scripts/deploy-vps.sh` - SSH-based full deployment
  - Requires SSH key access
  - Pulls latest code, rebuilds all containers
  - Limited to full stack updates

- `infrastructure/terraform/vps/deploy-to-existing-vps.sh` - Initial setup only
  - One-time VPS provisioning
  - Not suitable for incremental updates

**3. Docker Compose Files**:
- `docker-compose.vps.yml` - Production VPS stack
- `infrastructure/docker/docker-compose.yml` - Local dev stack
- No per-service compose files

---

## ❌ What We're Missing

### Gap #1: Service-Specific Deployment Workflows

**Missing**: GitHub Actions workflows for individual services
- No workflow for `deploy-mcp-gateway-only`
- No workflow for `deploy-keycloak-only`
- No workflow for `deploy-hr-app-only`
- No workflow for `deploy-static-content-only`

**Impact**: Cannot update a single service without full environment restart

---

### Gap #2: Per-Service Docker Compose Overrides

**Missing**: Service-specific compose files for selective updates

**Current Limitation**:
```bash
# This updates ALL services (monolithic)
docker compose -f docker-compose.vps.yml up -d

# This doesn't exist (service-specific)
docker compose -f docker-compose.vps.yml up -d mcp-gateway  # ← Works, but not automated
```

**Impact**: Manual intervention required for selective updates

---

### Gap #3: Zero-Downtime Deployment Strategy

**Missing**: Blue-Green or Rolling deployment capability
- No health check gates before traffic switching
- No rollback mechanism
- No staged deployments (canary, gradual rollout)

**Current Risk**: Service downtime during updates (30-60 seconds per deployment)

---

### Gap #4: Static Content Deployment Pipeline

**Missing**: Dedicated workflow for website content updates
- No CDN integration (Cloudflare Pages, Netlify, S3+CloudFront)
- No separate static asset deployment
- Website updates require full service restart

**Example Use Cases Not Supported**:
- Update HR app frontend (React build) without touching backend
- Update marketing website content
- Deploy documentation updates
- Update CSS/images without service restart

---

### Gap #5: Environment-Specific Deployment Controls

**Missing**: Granular environment routing (dev → staging → prod)
- Current workflows don't distinguish between dev/stage/prod for specific services
- No promotion workflow (stage → prod after testing)
- No rollback workflow

---

## Required Capabilities

### 1. Service-Specific Workflows

**Requirement**: GitHub Actions workflows for each deployable unit

**Services Requiring Dedicated Workflows**:
1. **MCP Gateway** (`services/mcp-gateway/`)
   - Triggers: Changes to `services/mcp-gateway/**`
   - Actions: Build, test, deploy container
   - Rollback: Keep previous version, swap on failure

2. **MCP Servers** (HR, Finance, Sales, Support)
   - Triggers: Changes to `services/mcp-{hr,finance,sales,support}/**`
   - Actions: Build, test, deploy specific server
   - Multi-service: Deploy all MCP servers if shared dependency changes

3. **Keycloak Configuration** (`infrastructure/keycloak/`)
   - Triggers: Changes to realm config, themes, extensions
   - Actions: Update Keycloak without full restart
   - Validation: Test auth flow after update

4. **Frontend Applications** (Planned: HR, Finance, Sales apps)
   - Triggers: Changes to `clients/{hr,finance,sales}-app/**`
   - Actions: Build static assets, deploy to CDN/web server
   - No backend restart: Assets served separately

5. **Static Content** (Marketing, docs, landing pages)
   - Triggers: Changes to `website/**` or `docs/**`
   - Actions: Build, deploy to CDN (Cloudflare Pages)
   - Zero downtime: Atomic CDN deployment

6. **Database Migrations** (`migrations/**`)
   - Triggers: Manual dispatch only (never automatic)
   - Actions: Run migrations, validate, rollback on failure
   - Safety: Require approval, backup before migration

---

### 2. Deployment Strategies by Service Type

#### Strategy A: Container Replacement (Stateless Services)

**Applies to**: MCP Gateway, MCP Servers, API services

**Method**: Docker Compose selective update
```bash
# Update only MCP Gateway
docker compose -f docker-compose.vps.yml up -d --no-deps --build mcp-gateway

# Update all MCP servers
docker compose -f docker-compose.vps.yml up -d --no-deps --build \
  mcp-hr mcp-finance mcp-sales mcp-support
```

**Health Check**: Wait for service to be healthy before marking deployment success
```bash
until curl -sf http://localhost:3100/health; do sleep 1; done
```

**Rollback**: Keep previous image, restart if new version fails
```bash
docker tag mcp-gateway:latest mcp-gateway:rollback
docker compose up -d mcp-gateway
# If fails:
docker tag mcp-gateway:rollback mcp-gateway:latest
docker compose up -d mcp-gateway
```

---

#### Strategy B: Static Asset Deployment (Frontend Apps)

**Applies to**: React/Vue/Svelte apps, marketing websites

**Method**: Build → Upload to CDN/S3 → Atomic switch
```bash
# Build frontend
npm run build

# Deploy to Cloudflare Pages (atomic deployment)
wrangler pages deploy dist/ --project-name=tamshai-hr-app

# OR deploy to S3 + CloudFront
aws s3 sync dist/ s3://tamshai-hr-app/ --delete
aws cloudfront create-invalidation --distribution-id XXX --paths "/*"
```

**Advantages**:
- Zero backend downtime
- Instant rollback (change active deployment)
- CDN caching for performance

---

#### Strategy C: Configuration Update (Keycloak, Kong)

**Applies to**: Keycloak realm config, Kong routes

**Method**: Import configuration without restart
```bash
# Keycloak: Import realm updates
docker exec keycloak /opt/keycloak/bin/kc.sh import \
  --file /tmp/realm-export.json --override false

# Kong: Update routes via Admin API
curl -X POST http://kong:8001/config \
  -F config=@kong.yml
```

**Advantages**:
- No service restart
- Immediate effect
- Easy rollback (import previous config)

---

#### Strategy D: Database Migration (PostgreSQL, MongoDB)

**Applies to**: Schema changes, data migrations

**Method**: Flyway, Liquibase, or custom migration scripts
```bash
# Run migrations (requires approval)
docker compose exec postgres psql -U tamshai -d tamshai_hr \
  -f /migrations/001_add_department_column.sql

# Verify migration
docker compose exec postgres psql -U tamshai -d tamshai_hr \
  -c "SELECT version FROM schema_migrations;"

# Rollback if needed
docker compose exec postgres psql -U tamshai -d tamshai_hr \
  -f /migrations/001_rollback.sql
```

**Safety Requirements**:
- Always manual approval (never automatic)
- Always backup before migration
- Always test in dev/stage first
- Always have rollback script

---

## Implementation Plan

### Phase 1: Core Service Deployment Workflows (8 hours)

**Goal**: Enable independent deployment of core backend services

**Tasks**:

1. **Create Service-Specific Workflows** (4 hours)
   - [ ] `.github/workflows/deploy-mcp-gateway.yml`
   - [ ] `.github/workflows/deploy-mcp-servers.yml`
   - [ ] `.github/workflows/deploy-keycloak.yml`

2. **Implement Selective Docker Compose Updates** (2 hours)
   - [ ] Add deployment scripts: `scripts/deploy-service.sh <service-name>`
   - [ ] Add health check validation per service
   - [ ] Add rollback capability (tag previous image)

3. **Add Service-Level Health Checks** (2 hours)
   - [ ] Health endpoints for all MCP servers
   - [ ] Liveness/readiness probes in docker-compose
   - [ ] Timeout and retry logic in deployment scripts

**Acceptance Criteria**:
- ✅ Can deploy MCP Gateway without affecting other services
- ✅ Can deploy individual MCP server without full restart
- ✅ Failed deployment auto-rolls back to previous version
- ✅ Health checks validate service before marking success

---

### Phase 2: Frontend/Static Content Pipeline (6 hours)

**Goal**: Enable zero-downtime website and app updates

**Tasks**:

1. **Setup Cloudflare Pages Integration** (3 hours)
   - [ ] Create Cloudflare Pages projects (hr-app, finance-app, marketing)
   - [ ] Configure build settings (React, Vite)
   - [ ] Add GitHub Actions workflow: `.github/workflows/deploy-frontend.yml`
   - [ ] Test deployment + rollback

2. **Static Asset Deployment Workflow** (2 hours)
   - [ ] Build step (npm run build)
   - [ ] Upload to Cloudflare Pages / S3
   - [ ] Invalidate CDN cache
   - [ ] Notify on deployment success/failure

3. **Serve Static Apps via Caddy** (1 hour)
   - [ ] Update Caddyfile to proxy static app routes
   - [ ] Configure SPA routing (React Router)
   - [ ] Add cache headers for static assets

**Acceptance Criteria**:
- ✅ Frontend app updates deploy in <2 minutes
- ✅ Zero backend downtime during frontend updates
- ✅ Instant rollback via Cloudflare UI
- ✅ CDN caching reduces server load

---

### Phase 3: Database Migration Workflow (4 hours)

**Goal**: Safe, approved, reversible database migrations

**Tasks**:

1. **Migration Framework Setup** (2 hours)
   - [ ] Choose framework (Flyway, Liquibase, or custom)
   - [ ] Create migration directory structure
   - [ ] Add migration tracking table (schema_migrations)
   - [ ] Write example migration + rollback

2. **Manual Approval Workflow** (2 hours)
   - [ ] Create `.github/workflows/deploy-migration.yml`
   - [ ] Require manual approval (GitHub Environments)
   - [ ] Pre-migration backup (pg_dump)
   - [ ] Run migration, validate, commit or rollback

**Acceptance Criteria**:
- ✅ Migrations require explicit approval
- ✅ Automatic backup before migration
- ✅ Rollback script available for every migration
- ✅ Migration history tracked in database

---

### Phase 4: Environment Promotion Workflow (6 hours)

**Goal**: Controlled promotion from dev → stage → prod

**Tasks**:

1. **Multi-Environment Support** (3 hours)
   - [ ] Separate docker-compose files: `docker-compose.{dev,stage,prod}.yml`
   - [ ] Environment-specific secrets (GitHub Environments)
   - [ ] Deployment workflow accepts `environment` parameter

2. **Promotion Workflow** (3 hours)
   - [ ] Workflow: `.github/workflows/promote-to-production.yml`
   - [ ] Require stage deployment success
   - [ ] Require manual approval for production
   - [ ] Tag production deployments (Git tags)
   - [ ] Notify team on production deployment

**Acceptance Criteria**:
- ✅ Cannot deploy to prod without stage success
- ✅ Production deployments require approval
- ✅ All production deployments are tagged
- ✅ Easy rollback to previous production tag

---

## Workflow Templates

### Template 1: Service-Specific Deployment

**File**: `.github/workflows/deploy-mcp-gateway.yml`

```yaml
name: Deploy MCP Gateway

on:
  push:
    branches: [main]
    paths:
      - 'services/mcp-gateway/**'
      - '.github/workflows/deploy-mcp-gateway.yml'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options: [dev, staging, production]
        default: 'staging'

jobs:
  deploy:
    name: Deploy MCP Gateway to ${{ inputs.environment || 'staging' }}
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment || 'staging' }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: services/mcp-gateway
        run: npm ci

      - name: Run tests
        working-directory: services/mcp-gateway
        run: npm test

      - name: Build
        working-directory: services/mcp-gateway
        run: npm run build

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.VPS_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key

      - name: Deploy to VPS
        run: |
          ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=no \
            ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'EOF'
          set -e

          cd /opt/tamshai

          # Pull latest code
          git fetch origin
          git checkout main
          git pull origin main

          # Tag current version for rollback
          docker tag mcp-gateway:latest mcp-gateway:rollback || true

          # Update only MCP Gateway (no-deps = don't restart dependencies)
          docker compose -f docker-compose.vps.yml build mcp-gateway
          docker compose -f docker-compose.vps.yml up -d --no-deps mcp-gateway

          # Wait for health check
          echo "Waiting for MCP Gateway to be healthy..."
          for i in {1..30}; do
            if curl -sf http://localhost:3100/health > /dev/null 2>&1; then
              echo "✅ MCP Gateway is healthy"
              exit 0
            fi
            echo "Waiting... ($i/30)"
            sleep 2
          done

          # Rollback if health check fails
          echo "❌ Health check failed, rolling back..."
          docker tag mcp-gateway:rollback mcp-gateway:latest
          docker compose -f docker-compose.vps.yml up -d --no-deps mcp-gateway
          exit 1
          EOF

      - name: Verify deployment
        run: |
          DOMAIN="${{ secrets.VPS_DOMAIN }}"
          if curl -sf https://${DOMAIN}/api/health > /dev/null; then
            echo "✅ External endpoint healthy"
          else
            echo "⚠️ External endpoint check failed (may be transient)"
          fi
```

---

### Template 2: Frontend Deployment

**File**: `.github/workflows/deploy-hr-app.yml`

```yaml
name: Deploy HR App Frontend

on:
  push:
    branches: [main]
    paths:
      - 'clients/hr-app/**'
  workflow_dispatch:

jobs:
  deploy:
    name: Deploy HR App to Cloudflare Pages
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: clients/hr-app
        run: npm ci

      - name: Build
        working-directory: clients/hr-app
        run: npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy clients/hr-app/dist --project-name=tamshai-hr-app

      - name: Get deployment URL
        run: |
          echo "Deployed to: https://tamshai-hr-app.pages.dev"
```

---

### Template 3: Database Migration

**File**: `.github/workflows/deploy-migration.yml`

```yaml
name: Deploy Database Migration

on:
  workflow_dispatch:
    inputs:
      migration_file:
        description: 'Migration file to run (e.g., 001_add_column.sql)'
        required: true
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options: [dev, staging, production]

jobs:
  migrate:
    name: Run Migration on ${{ inputs.environment }}
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}  # Requires approval for production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.VPS_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key

      - name: Backup database
        run: |
          ssh -i ~/.ssh/deploy_key ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'EOF'
          BACKUP_FILE="/backups/postgres_$(date +%Y%m%d_%H%M%S).sql"
          docker compose exec -T postgres pg_dump -U tamshai tamshai_hr > "$BACKUP_FILE"
          echo "✅ Backup created: $BACKUP_FILE"
          EOF

      - name: Run migration
        run: |
          ssh -i ~/.ssh/deploy_key ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'EOF'
          set -e

          cd /opt/tamshai

          # Run migration
          docker compose exec -T postgres psql -U tamshai -d tamshai_hr \
            -f /migrations/${{ inputs.migration_file }}

          # Verify migration
          docker compose exec -T postgres psql -U tamshai -d tamshai_hr \
            -c "SELECT version FROM schema_migrations ORDER BY executed_at DESC LIMIT 1;"

          echo "✅ Migration completed successfully"
          EOF
```

---

## File Structure

**New Files to Create**:
```
.github/workflows/
├── deploy-mcp-gateway.yml          # MCP Gateway deployment
├── deploy-mcp-servers.yml          # MCP Servers (HR/Finance/Sales/Support)
├── deploy-keycloak.yml             # Keycloak configuration updates
├── deploy-frontend-hr.yml          # HR app frontend
├── deploy-frontend-finance.yml     # Finance app frontend
├── deploy-frontend-sales.yml       # Sales app frontend
├── deploy-migration.yml            # Database migrations
└── promote-to-production.yml       # Stage → Prod promotion

scripts/
├── deploy-service.sh               # Generic service deployment script
├── rollback-service.sh             # Service rollback script
├── health-check.sh                 # Service health validation
└── migrate-database.sh             # Migration runner

migrations/
├── hr/
│   ├── 001_add_department.sql
│   ├── 001_rollback.sql
│   └── ...
├── finance/
│   └── ...
└── schema_migrations.sql           # Tracking table

docker-compose.dev.yml              # Dev environment overrides
docker-compose.staging.yml          # Staging environment (current vps)
docker-compose.production.yml       # Production environment (future GCP)
```

---

## Success Criteria

**Phase 1 Complete**:
- [ ] Can deploy MCP Gateway independently in <5 minutes
- [ ] Can deploy individual MCP server without affecting others
- [ ] Failed deployments auto-rollback
- [ ] Health checks prevent bad deployments from going live

**Phase 2 Complete**:
- [ ] Frontend updates deploy in <2 minutes
- [ ] Zero backend downtime during frontend updates
- [ ] CDN delivers static assets (not app servers)
- [ ] One-click rollback via Cloudflare/CDN UI

**Phase 3 Complete**:
- [ ] Database migrations require manual approval
- [ ] Automatic backup before every migration
- [ ] Rollback scripts available and tested
- [ ] Migration history tracked in database

**Phase 4 Complete**:
- [ ] Cannot deploy to prod without stage success
- [ ] Production deployments require approval + are tagged
- [ ] Environment-specific configurations managed
- [ ] Rollback to previous production tag in <5 minutes

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Service dependency issues | High | Document dependencies, test in dev first |
| Failed health checks blocking deployment | Medium | Implement timeout + manual override option |
| Database migration failures | Critical | Always backup, always have rollback, test in dev |
| CDN cache invalidation delays | Low | Use versioned URLs (/app/v123/), aggressive cache busting |
| Rollback complexity | High | Automate rollback, test rollback procedure quarterly |

---

## Future Enhancements (Post-Implementation)

1. **Blue-Green Deployments**:
   - Run new version alongside old
   - Switch traffic atomically
   - Zero downtime deployments

2. **Canary Deployments**:
   - Deploy to 10% of traffic first
   - Monitor metrics (error rate, latency)
   - Gradually roll out or rollback

3. **Feature Flags**:
   - Deploy code but hide features
   - Enable features per user/tenant
   - A/B testing capability

4. **Automated Rollback on Metrics**:
   - Monitor error rate after deployment
   - Auto-rollback if error rate >5%
   - Integration with Prometheus/Grafana

---

## References

- Current VPS deployment: `.github/workflows/deploy-vps.yml`
- Docker Compose: `docker-compose.vps.yml`
- Deployment scripts: `scripts/deploy-vps.sh`
- Cloudflare Pages Docs: https://developers.cloudflare.com/pages/
- Docker Compose selective update: https://docs.docker.com/compose/production/

---

**Document Owner**: DevOps Team
**Next Review**: After Phase 1 implementation
**Related**: Issue #58 (GCP Production), Issue #59 (Monitoring)
