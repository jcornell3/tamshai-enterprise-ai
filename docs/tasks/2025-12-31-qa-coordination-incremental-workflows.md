# QA Coordination: Incremental Deployment Workflows

**Date**: 2025-12-31 (Updated: 2026-01-01)
**Author**: Claude-Dev (claude-dev@tamshai.com)
**Status**: ✅ Ready for QA Testing
**Target Audience**: QA Lead, Project Sponsor

---

## Status Update (2026-01-01)

| Issue | Title | Status |
|-------|-------|--------|
| #60 | MCP Integration Test Remediation | ✅ **Closed** |
| #61 | Incremental Deployment Workflows | ✅ **Complete** (13 workflows created) |
| #62 | Keycloak Atomic Migration | 🔴 Open (blocker for data seeding automation) |

**Test Results (Latest CI Run)**:
- 89 tests passed
- 7 tests skipped (Claude API-dependent)
- 0 tests failing

---

## Incremental Workflows Created

All 13 workflows are now in `.github/workflows/`:

### Service-Specific Deployments (7 files)

| Workflow | Health Endpoint | Port |
|----------|-----------------|------|
| `deploy-mcp-gateway.yml` | `/health` | 3100 |
| `deploy-mcp-hr.yml` | `/health` | 3101 |
| `deploy-mcp-finance.yml` | `/health` | 3102 |
| `deploy-mcp-sales.yml` | `/health` | 3103 |
| `deploy-mcp-support.yml` | `/health` | 3104 |
| `deploy-kong.yml` | `/api/health` | 8100 |
| `deploy-keycloak.yml` | `/health/ready` | 8180 |

### Frontend Deployments (2 files)

| Workflow | Platform |
|----------|----------|
| `deploy-frontend-desktop.yml` | Cloudflare Pages (Flutter) |
| `deploy-frontend-web.yml` | Cloudflare Pages (React/Vue) |

### Database Migrations (2 files)

| Workflow | Database |
|----------|----------|
| `deploy-migrations-hr.yml` | PostgreSQL (tamshai_hr) |
| `deploy-migrations-finance.yml` | PostgreSQL (tamshai_finance) |

### Environment Promotion (2 files)

| Workflow | Flow |
|----------|------|
| `promote-dev-to-staging.yml` | Dev → Staging |
| `promote-staging-to-production.yml` | Staging → Production |

---

## QA Actions Required

### Phase 1: Workflow Validation (4-6 hours)

#### 1.1 Manual Trigger Testing

Test each service workflow via GitHub Actions:

```
GitHub → Actions → [Workflow Name] → Run workflow
```

**Test Matrix**:

| Workflow | Manual Trigger | Health Check | Status |
|----------|----------------|--------------|--------|
| deploy-mcp-gateway | ⬜ | `curl http://<staging>:3100/health` | ⬜ |
| deploy-mcp-hr | ⬜ | `curl http://<staging>:3101/health` | ⬜ |
| deploy-mcp-finance | ⬜ | `curl http://<staging>:3102/health` | ⬜ |
| deploy-mcp-sales | ⬜ | `curl http://<staging>:3103/health` | ⬜ |
| deploy-mcp-support | ⬜ | `curl http://<staging>:3104/health` | ⬜ |
| deploy-kong | ⬜ | `curl http://<staging>:8100/api/health` | ⬜ |
| deploy-keycloak | ⬜ | `curl http://<staging>:8180/health/ready` | ⬜ |

**Expected Health Response**:
```json
{
  "status": "healthy",
  "service": "<service-name>",
  "timestamp": "2026-01-01T..."
}
```

#### 1.2 Path-Based Trigger Testing

Verify workflows trigger on correct file changes:

| Workflow | Trigger Path | Test Method |
|----------|--------------|-------------|
| deploy-mcp-gateway | `services/mcp-gateway/**` | Modify file, push, verify workflow runs |
| deploy-mcp-hr | `services/mcp-hr/**` | Modify file, push, verify workflow runs |
| deploy-mcp-finance | `services/mcp-finance/**` | Modify file, push, verify workflow runs |

**Test Procedure**:
1. Create branch `test/incremental-trigger-<service>`
2. Modify trivial file (e.g., add comment to `src/index.ts`)
3. Push branch
4. Verify ONLY that service's workflow triggers
5. Verify OTHER service workflows do NOT trigger

#### 1.3 Rollback Testing

Test rollback functionality for at least 2 services:

**Test Procedure**:
1. Note current deployed version (Docker image tag)
2. Deploy a change via workflow
3. Trigger manual rollback via workflow_dispatch with `rollback: true`
4. Verify previous version restored
5. Verify health check passes after rollback

**Rollback Test Matrix**:

| Service | Pre-Rollback Version | Post-Rollback Version | Health Check | Status |
|---------|---------------------|----------------------|--------------|--------|
| mcp-gateway | ⬜ | ⬜ | ⬜ | ⬜ |
| mcp-hr | ⬜ | ⬜ | ⬜ | ⬜ |

### Phase 2: Integration Verification (2-3 hours)

#### 2.1 Cross-Service Communication

After incremental deployment, verify services can still communicate:

```bash
# Test MCP Gateway can route to MCP HR
curl -X POST http://<staging>:3100/api/query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "list employees", "userContext": {...}}'
```

#### 2.2 JWT Validation Still Works

Verify Keycloak integration after incremental Keycloak deployment:

```bash
# Get token from Keycloak
TOKEN=$(curl -X POST http://<staging>:8180/realms/tamshai-corp/protocol/openid-connect/token \
  -d "client_id=mcp-gateway" \
  -d "client_secret=<secret>" \
  -d "username=alice@tamshai.local" \
  -d "password=<password>" \
  -d "grant_type=password" | jq -r '.access_token')

# Use token with MCP Gateway
curl http://<staging>:3100/health -H "Authorization: Bearer $TOKEN"
```

### Phase 3: Documentation Review (1 hour)

#### 3.1 Review Deployment Guide

Review `docs/deployment/INCREMENTAL_DEPLOYMENT_GUIDE.md` for:
- [ ] Accuracy of health check endpoints
- [ ] Clarity of rollback procedures
- [ ] Completeness of troubleshooting section

#### 3.2 Update Test Documentation

Update `tests/integration/README.md` if needed:
- [ ] Document how to run tests against incrementally-deployed services
- [ ] Add section on verifying deployments

---

## Environment Promotion Testing (Future)

Once staging is stable, test environment promotion:

### Dev → Staging

```
GitHub → Actions → "Promote Dev to Staging" → Run workflow
  - version: v1.5.0-staging
  - services: all
```

**Verification**:
- [ ] All services healthy on staging
- [ ] Sample data intact
- [ ] Integration tests pass

### Staging → Production (Requires Approval)

```
GitHub → Actions → "Promote Staging to Production" → Run workflow
  - version: v1.5.0
  - services: all
  - skip_tests: false
```

**Verification**:
- [ ] Pre-deployment tests pass
- [ ] Manual approval received
- [ ] Production smoke tests pass

---

## Known Limitations

### 1. Keycloak Atomic Migration Not Complete

**Issue**: #62

**Impact**: Fresh Terraform builds may have broken Keycloak configuration.

**Workaround**: Test on existing staging environment (Keycloak already configured).

### 2. Sample Data Seeding Not Automated

**Impact**: New environments won't have 59 employees automatically.

**Workaround**: Manually run sample data SQL after deployment:
```bash
PGPASSWORD=<password> psql -h <host> -p 5433 -U tamshai -d tamshai_hr < sample-data/hr-data.sql
```

---

## Estimated QA Effort

| Phase | Task | Hours |
|-------|------|-------|
| 1.1 | Manual trigger testing (7 services) | 2 |
| 1.2 | Path-based trigger testing (3 services) | 1 |
| 1.3 | Rollback testing (2 services) | 1-2 |
| 2.1 | Cross-service communication | 1 |
| 2.2 | JWT validation | 0.5 |
| 3 | Documentation review | 1 |
| **Total** | | **6-8 hours** |

---

## Communication

### QA Findings

Report issues via GitHub Issues with label `deployment`:
- Workflow failures
- Health check issues
- Rollback problems

### Completion Checkpoint

When QA testing complete, update this document with:
- [ ] Test matrix results (Phase 1)
- [ ] Integration verification results (Phase 2)
- [ ] Any documentation updates needed (Phase 3)

---

## References

- **Deployment Guide**: `docs/deployment/INCREMENTAL_DEPLOYMENT_GUIDE.md`
- **Workflow Files**: `.github/workflows/deploy-*.yml`
- **Health Check Docs**: `docs/architecture/overview.md`
- **Issue #61**: Incremental Deployment Workflows
- **Issue #62**: Keycloak Atomic Migration (blocker for automation)

---

**Document Owner**: DevOps Team + QA Team
**Last Updated**: 2026-01-01
**Next Review**: After QA completes Phase 1-3 testing
