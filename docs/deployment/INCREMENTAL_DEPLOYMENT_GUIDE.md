# Incremental Deployment Guide

**Version**: 1.0
**Last Updated**: 2025-12-31
**Status**: Production Ready

---

## Overview

This guide explains how to use the incremental deployment workflows for Tamshai Enterprise AI. These workflows enable **service-specific deployments** (1-2 minutes) instead of monolithic full-stack deployments (10-15 minutes).

### Benefits

- ✅ **Fast Deployment**: 1-2 minutes vs 10-15 minutes monolithic
- ✅ **Low Downtime**: 0-5 seconds vs 30-60 seconds full stack
- ✅ **Service Isolation**: Deploy one service without affecting others
- ✅ **Easy Rollback**: Service-specific rollback in 1 minute
- ✅ **Testing Isolation**: QA can test single service changes

---

## Workflow Categories

### 1. Service-Specific Deployments (7 workflows)

Deploy individual backend services to VPS.

| Workflow | Service | Port | Trigger Path |
|----------|---------|------|--------------|
| `deploy-mcp-gateway.yml` | MCP Gateway | 3100 | `services/mcp-gateway/**` |
| `deploy-mcp-hr.yml` | MCP HR | 3101 | `services/mcp-hr/**` |
| `deploy-mcp-finance.yml` | MCP Finance | 3102 | `services/mcp-finance/**` |
| `deploy-mcp-sales.yml` | MCP Sales | 3103 | `services/mcp-sales/**` |
| `deploy-mcp-support.yml` | MCP Support | 3104 | `services/mcp-support/**` |
| `deploy-kong.yml` | Kong Gateway | 8100 | `infrastructure/kong/**` |
| `deploy-keycloak.yml` | Keycloak | 8180 | `infrastructure/keycloak/**` |

**Automatic Trigger**: Push to `main` branch with changes in trigger path
**Manual Trigger**: GitHub Actions UI → Run workflow → Select environment

### 2. Frontend Deployments (2 workflows)

Deploy static assets to Cloudflare Pages CDN.

| Workflow | App | Trigger Path |
|----------|-----|--------------|
| `deploy-frontend-desktop.yml` | Flutter Desktop | `clients/unified_flutter/**` |
| `deploy-frontend-web.yml` | React/Vue Web | `clients/web/**` |

**Deployment Time**: 2-3 minutes
**Downtime**: 0 seconds (CDN cutover)

### 3. Database Migrations (2 workflows)

Run Flyway schema migrations with automatic backups.

| Workflow | Database | Trigger Path |
|----------|----------|--------------|
| `deploy-migrations-hr.yml` | HR Database | `services/mcp-hr/migrations/**` |
| `deploy-migrations-finance.yml` | Finance Database | `services/mcp-finance/migrations/**` |

**Deployment Time**: 1-3 minutes
**Downtime**: 0-30 seconds (depends on schema locks)

### 4. Environment Promotion (2 workflows)

Promote code between environments with Git tagging.

| Workflow | Promotion | Approval Required |
|----------|-----------|-------------------|
| `promote-dev-to-staging.yml` | Dev → Staging | No (manual dispatch only) |
| `promote-staging-to-production.yml` | Staging → Production | Yes (GitHub Environment) |

**Deployment Time**: 5-10 minutes
**Downtime**: 5-10 minutes (full stack restart)

---

## Quick Start

### Deploy a Single Service (Auto)

**When**: You push changes to `main` branch affecting a service.

```bash
# Example: Update MCP Gateway logging level
cd services/mcp-gateway
vim src/index.ts  # Make changes
git add .
git commit -m "feat(gateway): Increase logging verbosity"
git push origin main
```

**Result**: `deploy-mcp-gateway.yml` workflow runs automatically.

### Deploy a Single Service (Manual)

**When**: You want to deploy a specific service without pushing code.

**Steps**:
1. Go to GitHub → Actions → Select workflow (e.g., "Deploy MCP Gateway")
2. Click "Run workflow"
3. Select environment (`staging` or `production`)
4. Click "Run workflow"

**Result**: Service deployed in 1-2 minutes.

### Rollback a Service

**When**: Recently deployed service has issues.

**Steps**:
1. Go to GitHub → Actions → Select workflow (e.g., "Deploy MCP HR")
2. Click "Run workflow"
3. Select environment (`staging` or `production`)
4. Check "Rollback to previous version"
5. Click "Run workflow"

**Result**: Service rolled back to previous Docker image tag in 1 minute.

### Deploy Frontend App

**When**: You update Flutter or React/Vue web app.

```bash
# Example: Update Flutter desktop app UI
cd clients/unified_flutter
vim lib/features/chat/presentation/chat_screen.dart
git add .
git commit -m "feat(ui): Improve chat UI layout"
git push origin main
```

**Result**: `deploy-frontend-desktop.yml` runs, deploys to Cloudflare Pages (0 downtime).

### Run Database Migration

**When**: You add a new migration file.

```bash
# Example: Add new HR database column
cd services/mcp-hr
mkdir -p migrations
cat > migrations/V2__add_employee_timezone.sql << EOF
ALTER TABLE hr.employees ADD COLUMN timezone VARCHAR(50) DEFAULT 'UTC';
EOF

git add migrations/V2__add_employee_timezone.sql
git commit -m "feat(db): Add employee timezone column"
git push origin main
```

**Result**: `deploy-migrations-hr.yml` runs, applies migration with automatic backup.

**Dry Run** (test migration without applying):
1. Go to GitHub → Actions → "Deploy Migrations - HR Database"
2. Click "Run workflow"
3. Check "Dry run (validate only)"
4. Click "Run workflow"

### Promote to Staging

**When**: You want to release a version to staging.

**Steps**:
1. Ensure all changes are merged to `main` and tested locally
2. Go to GitHub → Actions → "Promote Dev to Staging"
3. Click "Run workflow"
4. Enter version tag (e.g., `v1.4.0-staging.1`)
5. Select services to promote (`all` or `mcp-hr,mcp-gateway`)
6. Check "Run smoke tests after promotion"
7. Click "Run workflow"

**Result**: Git tag created, services deployed to staging, smoke tests run.

### Promote to Production

**When**: Staging is stable and ready for production release.

**Steps**:
1. Verify staging is working correctly (run smoke tests)
2. Go to GitHub → Actions → "Promote Staging to Production"
3. Click "Run workflow"
4. Enter version tag (e.g., `v1.4.0` - no `-staging` suffix)
5. Select services to promote (`all` or `mcp-hr,mcp-gateway`)
6. Uncheck "Skip pre-deployment tests" (recommended)
7. Click "Run workflow"
8. **Wait for manual approval** (GitHub Environment protection)
9. Review pre-deployment test results
10. Approve deployment in GitHub Actions UI

**Result**: Git tag created, services deployed to production, production smoke tests run.

---

## Deployment Patterns

### Pattern 1: Single Service Update

**Use Case**: Fix bug in MCP HR service.

**Steps**:
1. Fix bug in `services/mcp-hr/src/tools/employee.ts`
2. Commit and push to `main`
3. `deploy-mcp-hr.yml` runs automatically
4. MCP HR restarted in 1-2 minutes
5. Other services (gateway, finance, sales) unaffected

**Downtime**: 0-5 seconds (MCP HR only)

### Pattern 2: Multiple Services Update

**Use Case**: Add new feature requiring changes to gateway + HR + finance.

**Steps**:
1. Make changes to all 3 services
2. Commit and push to `main`
3. THREE workflows run in parallel:
   - `deploy-mcp-gateway.yml`
   - `deploy-mcp-hr.yml`
   - `deploy-mcp-finance.yml`
4. All 3 services deployed in 1-2 minutes

**Downtime**: 0-5 seconds per service (staggered)

### Pattern 3: Database + Application Update

**Use Case**: Add new database column + code to use it.

**Steps**:
1. Create migration file in `services/mcp-hr/migrations/`
2. Update application code in `services/mcp-hr/src/`
3. Commit and push to `main`
4. TWO workflows run sequentially:
   - `deploy-migrations-hr.yml` (runs first)
   - `deploy-mcp-hr.yml` (runs after migration)
5. Migration applied, then application deployed

**Downtime**: 0-30 seconds (migration) + 0-5 seconds (service restart)

### Pattern 4: Infrastructure Service Update

**Use Case**: Update Keycloak realm configuration.

**Steps**:
1. Update `infrastructure/keycloak/realm-export.json`
2. Commit and push to `main`
3. `deploy-keycloak.yml` runs
4. Keycloak restarted (30-60 seconds downtime)
5. **WARNING**: Existing user sessions may be invalidated

**Downtime**: 30-60 seconds (Keycloak restart)

### Pattern 5: Frontend Update (Zero Downtime)

**Use Case**: Update Flutter desktop app UI.

**Steps**:
1. Update `clients/unified_flutter/lib/` files
2. Commit and push to `main`
3. `deploy-frontend-desktop.yml` runs
4. Static assets deployed to Cloudflare Pages
5. CDN serves new version immediately

**Downtime**: 0 seconds (CDN cutover)

### Pattern 6: Full Stack Promotion

**Use Case**: Release v1.4.0 to staging.

**Steps**:
1. Manual workflow dispatch: "Promote Dev to Staging"
2. Enter version tag: `v1.4.0-staging.1`
3. Select services: `all`
4. Git tag created, VPS checks out tag, all services rebuilt
5. Smoke tests run (MCP Gateway, Keycloak, Kong)

**Downtime**: 5-10 minutes (full stack restart)

---

## Health Checks

All service deployment workflows include automatic health checks with rollback on failure.

### Health Check Format

```bash
# MCP Services (3100-3104)
curl -sf http://localhost:3100/health | jq -e '.status == "healthy"'

# Response format
{
  "status": "healthy",
  "service": "mcp-gateway",
  "timestamp": "2025-12-31T12:00:00Z",
  "dependencies": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### Health Check Timeout

| Service | Timeout | Retry Interval |
|---------|---------|----------------|
| MCP Services | 30 seconds | 1 second |
| Keycloak | 60 seconds | 1 second |
| Kong | 30 seconds | 1 second |

### Auto-Rollback

If health check fails after deployment:
1. Workflow logs: `❌ Health check failed after 30 seconds`
2. Workflow runs: `docker tag <service>:rollback <service>:latest`
3. Workflow runs: `docker compose up -d --no-deps <service>`
4. Rollback health check (5 seconds)
5. Workflow exits with failure

---

## Secrets Configuration

### Required GitHub Secrets

**Staging Environment**:
- `VPS_HOST` - VPS IP address or hostname
- `VPS_USER` - SSH username (e.g., `root`, `tamshai`)
- `VPS_SSH_KEY` - Private SSH key for deployment
- `POSTGRES_PASSWORD` - PostgreSQL password (for migrations)
- `STAGING_URL` - Staging base URL (for smoke tests)

**Production Environment**:
- `PROD_VPS_HOST` - Production VPS IP
- `PROD_VPS_USER` - Production SSH username
- `PROD_SSH_PRIVATE_KEY` - Production SSH key
- `PROD_POSTGRES_PASSWORD` - Production PostgreSQL password

**Cloudflare (Frontend Deployments)**:
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Pages write access
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
- `CLOUDFLARE_ZONE_ID` - Cloudflare zone ID (for cache purging)

### Setting Secrets

**GitHub UI**:
1. Go to repository → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Enter name (e.g., `VPS_HOST`) and value
4. Click "Add secret"

**GitHub CLI**:
```bash
gh secret set VPS_HOST --body "$VPS_HOST"
gh secret set VPS_USER --body "tamshai"
gh secret set VPS_SSH_KEY < ~/.ssh/id_rsa
```

---

## Rollback Procedures

### Service Rollback (1 minute)

**Method 1: Workflow Dispatch (Recommended)**
1. Go to GitHub → Actions → Select service workflow
2. Click "Run workflow"
3. Select environment
4. Check "Rollback to previous version"
5. Click "Run workflow"

**Method 2: Manual SSH**
```bash
ssh tamshai@$VPS_HOST
cd /opt/tamshai
docker tag mcp-hr:rollback mcp-hr:latest
docker compose -f docker-compose.yml up -d --no-deps mcp-hr
```

### Database Rollback (5-10 minutes)

**Prerequisites**: Database backup created before migration.

**Steps**:
1. SSH to VPS
2. Locate backup file (e.g., `hr_backup_20251231_120000.dump`)
3. Restore backup:
   ```bash
   docker exec -it postgres pg_restore \
     -U tamshai \
     -d tamshai_hr \
     -c \
     hr_backup_20251231_120000.dump
   ```
4. Verify restoration:
   ```bash
   docker exec -it postgres psql \
     -U tamshai \
     -d tamshai_hr \
     -c "SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;"
   ```

### Environment Rollback (Git Tag)

**Use Case**: Rollback entire environment to previous version.

**Steps**:
1. Find previous Git tag:
   ```bash
   git tag -l --sort=-version:refname | head -5
   ```
2. Run promotion workflow with previous tag:
   - `promote-dev-to-staging.yml` with tag `v1.3.9-staging.1`
   - OR `promote-staging-to-production.yml` with tag `v1.3.9`

---

## Monitoring & Logs

### Viewing Workflow Logs

**GitHub UI**:
1. Go to repository → Actions
2. Click on workflow run
3. Expand job steps to see detailed logs

**GitHub CLI**:
```bash
# List recent workflow runs
gh run list --workflow deploy-mcp-hr.yml

# View specific run
gh run view 12345678

# Download logs
gh run download 12345678
```

### Viewing Service Logs

**SSH to VPS**:
```bash
ssh tamshai@$VPS_HOST

# View all services
docker compose -f /opt/tamshai/docker-compose.yml logs -f

# View specific service
docker compose -f /opt/tamshai/docker-compose.yml logs -f mcp-hr

# View last 100 lines
docker compose -f /opt/tamshai/docker-compose.yml logs --tail=100 mcp-hr
```

### Health Check Status

**Check Service Health**:
```bash
# MCP Gateway
curl http://$VPS_HOST:3100/health | jq

# MCP HR
curl http://$VPS_HOST:3101/health | jq

# Keycloak
curl http://$VPS_HOST:8180/health/ready

# Kong
curl http://$VPS_HOST:8100/api/health
```

---

## QA Coordination

### Testing Service-Specific Deployments

**QA Workflow**:
1. Dev completes feature in `services/mcp-hr/`
2. Dev pushes to `main` → `deploy-mcp-hr.yml` runs
3. QA waits for deployment success (1-2 minutes)
4. QA runs integration tests:
   ```bash
   cd services/mcp-hr
   npm run test:integration:hr
   ```
5. If tests fail, Dev fixes and pushes → auto-redeploy

### Testing Database Migrations

**QA Workflow**:
1. Dev creates migration in `services/mcp-hr/migrations/`
2. Dev pushes to `main` → `deploy-migrations-hr.yml` runs (dry run first)
3. QA verifies dry run passed
4. QA triggers manual workflow with dry_run=false
5. QA runs integration tests against new schema

### Testing Promotions

**QA Workflow (Staging)**:
1. Dev runs "Promote Dev to Staging" workflow
2. QA waits for deployment + smoke tests (5-10 minutes)
3. QA runs full regression suite on staging
4. QA approves or rejects for production promotion

---

## Troubleshooting

### Common Issues

#### Issue 1: Health Check Fails After Deployment

**Symptoms**: Workflow logs show `❌ Health check failed after 30 seconds`

**Causes**:
- Service crashed on startup
- Database connection failed
- Redis connection failed
- Environment variable misconfiguration

**Resolution**:
1. Check service logs:
   ```bash
   docker compose -f docker-compose.yml logs mcp-hr
   ```
2. Verify dependencies running:
   ```bash
   docker compose -f docker-compose.yml ps
   ```
3. Check health endpoint manually:
   ```bash
   curl http://localhost:3101/health
   ```
4. If issue persists, rollback service

#### Issue 2: Migration Fails

**Symptoms**: `deploy-migrations-hr.yml` exits with error

**Causes**:
- SQL syntax error
- Migration conflicts (out-of-order version)
- Database connection timeout
- Schema lock (long-running query)

**Resolution**:
1. Check Flyway error message in workflow logs
2. Verify migration file SQL syntax
3. Check migration version number (no gaps)
4. Restore backup if needed:
   ```bash
   pg_restore -U tamshai -d tamshai_hr hr_backup_*.dump
   ```

#### Issue 3: SSH Connection Timeout

**Symptoms**: Workflow hangs at "Setup SSH" step

**Causes**:
- VPS firewall blocking SSH
- SSH key incorrect
- VPS down

**Resolution**:
1. Verify VPS is accessible:
   ```bash
   ping $VPS_HOST
   ```
2. Test SSH manually:
   ```bash
   ssh tamshai@$VPS_HOST
   ```
3. Check GitHub secret `VPS_SSH_KEY` is correct
4. Verify VPS firewall allows SSH (port 22)

#### Issue 4: Docker Image Build Fails

**Symptoms**: Workflow logs show `docker compose build <service>` error

**Causes**:
- Dockerfile syntax error
- Missing dependencies in package.json
- npm install timeout
- Disk space full on VPS

**Resolution**:
1. Check Dockerfile for syntax errors
2. Verify package.json dependencies exist
3. Check VPS disk space:
   ```bash
   ssh tamshai@$VPS_HOST df -h
   ```
4. Prune old Docker images:
   ```bash
   docker system prune -a
   ```

---

## Best Practices

### 1. Use Incremental Deployments for Most Changes

✅ **DO**: Deploy single service when only that service changed
❌ **DON'T**: Use monolithic `deploy-vps.yml` for every change

### 2. Test in Staging Before Production

✅ **DO**: Promote to staging, run regression tests, then promote to production
❌ **DON'T**: Deploy directly to production without staging validation

### 3. Use Dry Run for Risky Migrations

✅ **DO**: Run migration with `dry_run=true` first
❌ **DON'T**: Apply migration directly to production without testing

### 4. Version Tags Follow Semver

✅ **DO**: Use semantic versioning (v1.4.0, v1.4.1)
❌ **DON'T**: Use arbitrary tags (vtest, v123)

### 5. Monitor Deployments

✅ **DO**: Watch workflow logs during deployment
❌ **DON'T**: Trigger workflow and walk away

### 6. Document Rollback Plan

✅ **DO**: Know how to rollback before deploying
❌ **DON'T**: Figure out rollback during production incident

### 7. Coordinate with QA on Database Changes

✅ **DO**: Notify QA Lead before deploying schema migrations
❌ **DON'T**: Deploy migrations without QA awareness

---

## Comparison: Incremental vs Monolithic

| Metric | Incremental Deployment | Monolithic Deployment |
|--------|------------------------|----------------------|
| **Deployment Time** | 1-2 minutes | 10-15 minutes |
| **Downtime** | 0-5 seconds | 30-60 seconds |
| **Rollback Time** | 1 minute (single service) | 10-15 minutes (all services) |
| **Testing Isolation** | Easy (deploy one service) | Hard (deploy all services) |
| **Risk** | Low (isolated failures) | High (cascade failures) |
| **Complexity** | Medium (13 workflows) | Low (1 workflow) |

---

## Migration from Monolithic Deployment

### Current State (Before)

- One workflow: `deploy-vps.yml`
- Deploys all 13 services
- 10-15 minute deployment
- Manual SSH for service-specific updates

### Target State (After)

- 13 workflows (7 services + 2 frontend + 2 migrations + 2 promotions)
- Deploy only changed services
- 1-2 minute deployment per service
- Automated workflow dispatch for all deployments

### Migration Steps

1. ✅ **Phase 1**: Service-specific workflows created (DONE)
2. ✅ **Phase 2**: Frontend deployment workflows created (DONE)
3. ✅ **Phase 3**: Database migration workflows created (DONE)
4. ✅ **Phase 4**: Environment promotion workflows created (DONE)
5. ⏸️ **Phase 5**: Test incremental deployment with low-risk change (PENDING)
6. ⏸️ **Phase 6**: QA adapts integration tests for service isolation (PENDING)
7. ⏸️ **Phase 7**: Deprecate `deploy-vps.yml` (optional)

---

## Next Steps

1. **Test Incremental Deployment**:
   - Make low-risk change (e.g., update MCP Gateway logging level)
   - Push to `main`
   - Verify `deploy-mcp-gateway.yml` runs successfully
   - Verify other services unaffected

2. **QA Coordination Checkpoint**:
   - Notify QA Lead that workflows are ready
   - QA reviews health check endpoints
   - QA organizes integration tests by service
   - QA tests rollback mechanism

3. **Documentation Update**:
   - Update CLAUDE.md with incremental deployment instructions
   - Add runbook entries for common deployment scenarios
   - Document secrets configuration for new team members

---

**Document Owner**: DevOps Team
**Review Required**: QA Lead, Project Sponsor
**Related Issues**: #61 (Incremental Deployment Workflows)
**Related Docs**: `docs/tasks/2025-12-31-incremental-deployment-workflows.md`
