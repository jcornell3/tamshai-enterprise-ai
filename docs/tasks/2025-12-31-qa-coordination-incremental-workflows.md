# QA Coordination: Incremental Deployment Workflows

**Date**: 2025-12-31
**Author**: Claude-Dev (claude-dev@tamshai.com)
**Status**: 📋 Impact Assessment
**Target Audience**: QA Lead, Project Sponsor

---

## Executive Summary

**Question**: Will creating incremental deployment workflow files (`.github/workflows/deploy-*.yml`) conflict with QA's current CI/CD remediation work?

**Answer**: ✅ **NO CONFLICTS** - QA is working on different workflows (testing, not deployment)

**Additional QA Work Required**: 🟡 **MINIMAL** (4-6 hours) - Organize tests by service, verify health checks

---

## Current QA Work (MCP Integration Test Remediation)

### Files QA is Working On

**1. `.github/workflows/ci.yml`** - Integration Test Workflow
- **Purpose**: Run unit + integration tests on push/PR
- **QA's Work**: Fix 21 failing MCP integration tests (Issue #60)
- **Scope**:
  - Fix tool response status errors (10 tests)
  - Add filtering logic (4 tests)
  - Implement human-in-the-loop confirmations (6 tests)
  - Fix authorization checks (5 tests)
- **Estimated Time**: 16-24 hours
- **Status**: In Progress

**2. `.github/workflows/deploy.yml`** - DevSecOps Security Scanning
- **Purpose**: Code quality, SAST, dependency scanning, Terraform scanning
- **QA's Work**: Ensure security scans pass (CodeQL, npm audit, Checkov)
- **Scope**: Fix security findings, not deployment logic
- **Status**: Maintenance/monitoring

**3. MCP Server Source Files**
- `services/mcp-hr/src/tools/*.ts` - Fix tool response formats
- `services/mcp-hr/src/middleware/rbac.ts` - Fix authorization logic
- `services/mcp-hr/tests/integration/*.test.ts` - Update integration tests

### QA Work Does NOT Touch

- ❌ Deployment workflows (`deploy-vps.yml`)
- ❌ Deployment scripts (`scripts/deploy-vps.sh`)
- ❌ Docker Compose configurations
- ❌ SSH deployment logic

---

## Proposed Incremental Workflow Files (Dev Work)

### New Workflow Files (13 total)

**Service-Specific Deployments** (7 files):
1. `.github/workflows/deploy-mcp-gateway.yml`
2. `.github/workflows/deploy-mcp-hr.yml`
3. `.github/workflows/deploy-mcp-finance.yml`
4. `.github/workflows/deploy-mcp-sales.yml`
5. `.github/workflows/deploy-mcp-support.yml`
6. `.github/workflows/deploy-kong.yml`
7. `.github/workflows/deploy-keycloak.yml`

**Frontend Deployments** (2 files):
8. `.github/workflows/deploy-frontend-desktop.yml`
9. `.github/workflows/deploy-frontend-web.yml`

**Database Migrations** (2 files):
10. `.github/workflows/deploy-migrations-hr.yml`
11. `.github/workflows/deploy-migrations-finance.yml`

**Environment Promotion** (2 files):
12. `.github/workflows/promote-dev-to-staging.yml`
13. `.github/workflows/promote-staging-to-production.yml`

### Potential Conflicts with QA Work

**Analysis**: ✅ **NO CONFLICTS**

| File | QA Touching? | Dev Creating? | Conflict? |
|------|-------------|---------------|-----------|
| `.github/workflows/ci.yml` | ✅ YES | ❌ NO | ✅ No conflict |
| `.github/workflows/deploy.yml` | 🟡 Monitoring | ❌ NO | ✅ No conflict |
| `.github/workflows/deploy-vps.yml` | ❌ NO | 🟡 Maybe update | ⚠️ Coordination needed |
| `.github/workflows/deploy-*.yml` (new) | ❌ NO | ✅ YES | ✅ No conflict (new files) |

**Rationale**:
- QA is fixing **test logic** (integration tests for MCP servers)
- Dev is creating **deployment logic** (how to deploy services to VPS)
- These are SEPARATE concerns (testing ≠ deployment)

---

## Impact on `.github/workflows/deploy-vps.yml`

### Current State

**File**: `.github/workflows/deploy-vps.yml`
**Purpose**: Monolithic deployment of ALL 13 services to VPS
**Triggers**:
- Push to `main` branch (auto-deploy)
- Manual workflow_dispatch
- Release published

**Deployment Logic**:
```bash
# SSH to VPS
ssh $VPS_USER@$VPS_HOST << 'EOF'
  cd /opt/tamshai
  git pull origin main
  docker compose -f docker-compose.vps.yml up -d --build
EOF
```

**Characteristics**:
- Deploys ALL services (mcp-gateway, mcp-hr, keycloak, kong, postgres, etc.)
- 10-15 minute deployment time
- 30-60 second downtime (services restart)

### Options for Handling `deploy-vps.yml`

**Option 1: Keep as "Full Stack Deploy"** (RECOMMENDED)
- Keep `deploy-vps.yml` unchanged
- Use for emergency full-stack deployments
- Use incremental workflows for normal deployments

**Pros**:
- ✅ Safety net for critical issues requiring full redeploy
- ✅ No changes to existing workflow (QA work unaffected)
- ✅ Backward compatibility

**Cons**:
- ⚠️ Two deployment methods (monolithic + incremental)

**Option 2: Deprecate `deploy-vps.yml`**
- Rename to `deploy-vps-legacy.yml`
- Remove auto-trigger (manual only)
- Use incremental workflows exclusively

**Pros**:
- ✅ Single deployment method (cleaner)

**Cons**:
- ⚠️ Requires updating existing deployment docs
- ⚠️ No full-stack deploy option

**Option 3: Update `deploy-vps.yml` to Orchestrate Incremental Workflows**
- Change `deploy-vps.yml` to trigger all service-specific workflows
- Use GitHub API to dispatch workflows

**Pros**:
- ✅ Maintains "deploy all" capability
- ✅ Uses incremental infrastructure

**Cons**:
- ⚠️ Complex implementation (workflow orchestration)
- ⚠️ Harder to debug

### Recommendation: Option 1 (Keep as Full Stack Deploy)

**Rationale**:
- Minimal disruption to QA work
- Provides emergency full-stack deployment option
- Incremental workflows used for 95% of deployments

**Changes to `deploy-vps.yml`**:
```yaml
# Add comment to header
name: Deploy to VPS (Full Stack)

# NOTE: This workflow deploys ALL services (monolithic deployment).
# For service-specific deployments, use:
#   - deploy-mcp-gateway.yml
#   - deploy-mcp-hr.yml
#   - etc.
# Use this workflow only for:
#   - Emergency full-stack redeployments
#   - Major infrastructure changes affecting multiple services
```

**Impact on QA**: ✅ **ZERO** (no changes to workflow logic, just documentation)

---

## Additional QA Work Required for Incremental Workflows

### 1. Service-Specific Test Organization (4 hours)

**Current State**: All integration tests run together

**Required**: Organize tests by service for targeted test runs

**Example**:
```json
// services/mcp-hr/package.json
{
  "scripts": {
    "test": "jest",
    "test:integration": "jest --testPathPattern=tests/integration",
    "test:integration:hr": "jest --testPathPattern=tests/integration/hr",
    "test:integration:auth": "jest --testPathPattern=tests/integration/auth",
    "test:integration:identity": "jest --testPathPattern=tests/integration/identity"
  }
}
```

**Usage in Workflow**:
```yaml
# .github/workflows/deploy-mcp-hr.yml
- name: Run HR-specific integration tests
  run: npm run test:integration:hr
```

**QA Tasks**:
- [ ] Review current test file structure
- [ ] Group tests by service domain (hr, finance, sales, support)
- [ ] Add test scripts to `package.json` for each service
- [ ] Verify tests can run in isolation (no cross-service dependencies)

**Estimated Time**: 4 hours

### 2. Health Check Endpoint Verification (1 hour)

**Current State**: Health checks exist but may not be comprehensive

**Required**: Verify all services have robust health checks for deployment verification

**Example**:
```typescript
// services/mcp-hr/src/index.ts
app.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    await db.query('SELECT 1');

    // Check Redis connectivity
    await redis.ping();

    // Check Keycloak connectivity (if applicable)
    // await fetch('http://keycloak:8080/health/ready');

    res.json({
      status: 'healthy',
      service: 'mcp-hr',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: 'connected',
        redis: 'connected'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

**QA Tasks**:
- [ ] Verify health check endpoints return 200 when healthy
- [ ] Verify health check endpoints return 503 when unhealthy
- [ ] Test health checks with dependency failures (DB down, Redis down)
- [ ] Document expected health check response format

**Estimated Time**: 1 hour

### 3. Rollback Scenario Testing (1-2 hours)

**Current State**: No rollback testing

**Required**: Verify rollback mechanism works for each service

**Test Scenarios**:
1. **Healthy Deployment → Rollback**: Deploy new version, manually trigger rollback, verify old version restored
2. **Failed Health Check → Auto-Rollback**: Deploy broken version, verify auto-rollback occurs
3. **Database Migration Rollback**: Run migration, trigger rollback, verify schema reverted

**QA Tasks**:
- [ ] Test manual rollback via workflow_dispatch
- [ ] Test automatic rollback on health check failure
- [ ] Verify rollback restores previous Docker image tag
- [ ] Document rollback procedure

**Estimated Time**: 2 hours

### Total Additional QA Work: 6-7 hours

---

## Timeline Coordination

### Scenario 1: Sequential Work (QA First, Then Dev)

**Timeline**:
```
Week 1: QA fixes MCP integration tests (16-24 hours)
  ├─ Fix tool response status errors
  ├─ Add filtering logic
  ├─ Implement confirmations
  └─ Fix authorization checks

Week 2: Dev implements incremental workflows (24 hours)
  ├─ Service-specific workflows (4h)
  ├─ Frontend deployment pipeline (8h)
  ├─ Database migration workflows (8h)
  └─ Environment promotion (4h)

Week 3: QA adapts tests for incremental workflows (6-7 hours)
  ├─ Organize tests by service (4h)
  ├─ Verify health checks (1h)
  └─ Test rollback scenarios (2h)
```

**Total Time**: 46-55 hours (QA: 22-31h, Dev: 24h)

**Pros**:
- ✅ No workflow file conflicts (QA finishes before Dev starts)
- ✅ Clear separation of work

**Cons**:
- ⚠️ Slower overall completion (3 weeks vs 2 weeks parallel)

### Scenario 2: Parallel Work (QA and Dev Simultaneously)

**Timeline**:
```
Week 1 (Parallel):
  QA: Fix MCP integration tests (16-24 hours)
  Dev: Implement incremental workflows (24 hours)

Week 2 (QA Adaptation):
  QA: Adapt tests for incremental workflows (6-7 hours)
  QA: Test incremental deployments with fixed tests
```

**Total Time**: 30-38 hours (overlapping work)

**Pros**:
- ✅ Faster completion (2 weeks vs 3 weeks)
- ✅ Incremental workflows ready when integration tests fixed

**Cons**:
- ⚠️ Requires coordination on file changes
- ⚠️ QA may need to adapt tests mid-stream

**Coordination Required**:
1. **Communication**: Dev notifies QA when workflow files created
2. **Testing**: QA tests incremental workflows once Dev completes Phase 1 (service-specific workflows)
3. **Feedback Loop**: QA provides feedback on health check requirements, Dev adjusts workflows

### Scenario 3: Phased Parallel (RECOMMENDED)

**Timeline**:
```
Week 1 (Phase 1 - No Overlap):
  Day 1-3: QA fixes critical integration tests (12h)
    ├─ Fix tool response status errors (highest priority)
    ├─ Fix authorization checks

  Day 4-5: Dev implements service-specific workflows (4h)
    ├─ deploy-mcp-gateway.yml
    ├─ deploy-mcp-hr.yml
    ├─ deploy-mcp-finance.yml
    └─ etc.

Week 2 (Phase 2 - Parallel):
  QA: Finish integration test fixes (8-12h) + Adapt tests (6-7h)
  Dev: Frontend + migrations + promotion workflows (20h)

Week 3 (Phase 3 - QA Validation):
  QA: Test incremental deployments end-to-end
  Dev: Fix issues found by QA
```

**Total Time**: 34-42 hours (optimized overlap)

**Pros**:
- ✅ Balances speed with coordination
- ✅ QA completes critical test fixes before workflows deployed
- ✅ Dev and QA work on independent concerns after Phase 1

**Cons**:
- ⚠️ Requires clear Phase 1 checkpoint

---

## Coordination Checklist

### Before Dev Starts Incremental Workflow Work

- [ ] **Confirm QA Timeline**: When will integration test fixes be complete?
- [ ] **Review Health Checks**: Are current health check endpoints sufficient?
- [ ] **Identify Test Dependencies**: Which tests require services to be deployed together?

### During Dev Implementation

- [ ] **Notify QA**: When service-specific workflow files are created
- [ ] **Provide Examples**: Share `deploy-mcp-gateway.yml` for QA review
- [ ] **Request Feedback**: Ask QA to verify health check requirements

### After Dev Completes Phase 1 (Service-Specific Workflows)

- [ ] **QA Test Run**: QA deploys mcp-hr using `deploy-mcp-hr.yml`
- [ ] **Health Check Validation**: QA verifies health checks work as expected
- [ ] **Rollback Test**: QA tests rollback mechanism

### Before Merging to Main

- [ ] **Integration Test**: Full integration test run with incremental workflows
- [ ] **Rollback Test**: QA validates rollback for at least 2 services
- [ ] **Documentation**: Update deployment docs with new workflow usage

---

## Risk Mitigation

### Risk 1: QA Commits to `ci.yml` While Dev Commits Workflow Files

**Likelihood**: 🟢 LOW (different files)

**Impact**: 🟢 LOW (Git merge handles independent files)

**Mitigation**:
- Dev creates NEW files (no edits to `ci.yml`)
- QA edits EXISTING file (`ci.yml`)
- No merge conflicts expected

### Risk 2: Incremental Workflows Require Changes to Integration Tests

**Likelihood**: 🟡 MEDIUM (tests may assume monolithic deployment)

**Impact**: 🟡 MEDIUM (6-7 hours additional QA work)

**Mitigation**:
- QA organizes tests by service (4 hours)
- Tests can run in isolation (no cross-service dependencies)
- Health checks updated (1 hour)

### Risk 3: `deploy-vps.yml` Changes Break QA's Deployment Testing

**Likelihood**: 🟢 LOW (recommend keeping `deploy-vps.yml` unchanged)

**Impact**: 🔴 HIGH (blocks QA integration testing)

**Mitigation**:
- **Option 1 (Recommended)**: Keep `deploy-vps.yml` unchanged
- Dev creates NEW workflow files (no changes to existing)
- QA continues using `deploy-vps.yml` for full-stack testing

---

## Recommended Implementation Order

### Phase 1: QA Completes Critical Test Fixes (Week 1)

**QA Work** (12 hours):
- Fix tool response status errors (10 tests)
- Fix authorization checks (5 tests)

**Why First**:
- Unblocks CI pipeline (21 failing tests → 6 failing tests)
- No dependency on incremental workflows
- Provides stable test baseline

### Phase 2: Dev Implements Service-Specific Workflows (Week 1)

**Dev Work** (4 hours):
- Create 7 service-specific workflows
- Use existing `deploy-vps.yml` as template
- Test with low-risk service (mcp-gateway logging change)

**Why Second**:
- QA has stable test baseline (critical tests fixed)
- Dev can test workflows independently
- No disruption to QA work

**Checkpoint**: QA reviews and tests `deploy-mcp-hr.yml`

### Phase 3: QA Adapts Tests, Dev Completes Workflows (Week 2)

**QA Work** (6-7 hours):
- Organize tests by service (4h)
- Verify health checks (1h)
- Test rollback scenarios (2h)

**Dev Work** (20 hours):
- Frontend deployment pipeline (8h)
- Database migration workflows (8h)
- Environment promotion (4h)

**Why Parallel**:
- Independent work (no file conflicts)
- QA can provide feedback on health checks
- Dev can incorporate feedback into remaining workflows

### Phase 4: QA Validation (Week 3)

**QA Work** (4 hours):
- End-to-end test of incremental deployments
- Validate rollback for each service
- Document deployment procedures

**Dev Work** (2 hours):
- Fix issues found by QA
- Update workflow documentation

---

## Conclusion

### Will Incremental Workflow Files Conflict with QA's CI/CD Work?

**Answer**: ✅ **NO**

**Rationale**:
- QA is working on **ci.yml** (testing workflow)
- Dev is creating **deploy-*.yml** (deployment workflows)
- Different files, different concerns (testing ≠ deployment)

### Will Incremental Workflows Require Additional QA Work?

**Answer**: 🟡 **YES - MINIMAL (6-7 hours)**

**Required QA Work**:
1. Organize tests by service (4h)
2. Verify health checks (1h)
3. Test rollback scenarios (2h)

**Not Required**:
- ❌ Rewrite integration tests (existing tests work)
- ❌ Change test framework (Jest continues to work)
- ❌ Update CI workflow (ci.yml unchanged)

### Recommended Approach

**Timeline**: 3 weeks (phased parallel work)

**Week 1**:
- Days 1-3: QA fixes critical integration tests (12h)
- Days 4-5: Dev implements service-specific workflows (4h)

**Week 2**:
- QA: Finishes test fixes (8-12h) + adapts for incremental (6-7h)
- Dev: Frontend, migrations, promotion workflows (20h)

**Week 3**:
- QA: Validates incremental deployments (4h)
- Dev: Fixes QA findings (2h)

**Total Time**: 34-42 hours (optimized)

---

**Next Steps**:
1. ✅ **Confirm with QA Lead**: Verify timeline and coordination plan
2. ✅ **Checkpoint Agreement**: QA completes critical tests before Dev starts workflows
3. ✅ **Communication Channel**: Establish daily sync for Phase 2 (parallel work)

---

**Document Owner**: DevOps Team + QA Team
**Review Required**: QA Lead approval
**Decision Point**: Proceed with phased parallel approach?
