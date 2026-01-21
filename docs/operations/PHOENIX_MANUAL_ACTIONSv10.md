# Phoenix Rebuild v10 - Manual Actions Log

**Date**: January 20, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production
**Purpose**: Validate Issue #32 fix - Zero manual actions expected
**Previous Rebuild**: v9 (January 20, 2026)

## Pre-Rebuild Checklist

- [ ] All workflows passed after pushing v9.1 fixes
- [ ] Issue #32 remediated in cloudbuild-provision-users.yaml
- [ ] Issue #32: Removed invalid nested substitution syntax
- [ ] Issue #32: Construct CLOUD_SQL_INSTANCE inline in each step
- [ ] _REGION now has default value 'us-central1'

## Expected Improvements from v9

| Issue # | Issue | v9 Status | v10 Expectation | v10 Result |
|---------|-------|-----------|-----------------|------------|
| #32 | provision-users `_REGION` substitution error | FAIL | No errors - inline construction | |

## Timeline

| Time (UTC) | Phase | Action | Result | Duration |
|------------|-------|--------|--------|----------|
| | 1-2 | Pre-flight + Secret verification | | |
| | 3 | Pre-destroy cleanup | | |
| | 4 | Terraform destroy + apply (infra) | | |
| | 5 | Build container images | | |
| | 6 | Regenerate SA key | | |
| | 7 | Terraform Cloud Run | | |
| | 8 | Deploy via GitHub Actions | | |
| | 9 | Configure TOTP | | |
| | 10 | Provision Users & Verify | | |

**v9 Total Duration**: ~57 minutes
**v10 Total Duration**: TBD
**Manual Actions**: TBD (expected: 0)

---

## Phase 1-2: Pre-flight Checks & Secret Verification

**Duration**: TBD

**Result**: TBD

**Findings**:
- TBD

**Manual Actions Required**: TBD

---

## Phase 3: Pre-destroy Cleanup

**Duration**: TBD

**Result**: TBD

**Findings**:
- TBD

**Manual Actions Required**: TBD

---

## Phase 4: Terraform Destroy + Apply (Infrastructure)

**Duration**: TBD

**Result**: TBD

**Findings**:
- TBD

**Manual Actions Required**: TBD

---

## Phase 5: Build Container Images

**Duration**: TBD

**Result**: TBD

**Images Built**:
| Image | Tag | Status |
|-------|-----|--------|
| mcp-gateway | latest | |
| mcp-hr | latest | |
| mcp-finance | latest | |
| mcp-sales | latest | |
| mcp-support | latest | |
| keycloak | v2.0.0-postgres | |
| web-portal | latest | |
| provision-job | latest | |

**Findings**:
- TBD

**Manual Actions Required**: TBD

---

## Phase 6: Regenerate SA Key

**Duration**: TBD

**Result**: TBD

**Findings**:
- TBD

**Manual Actions Required**: TBD

---

## Phase 7: Terraform Cloud Run

**Duration**: TBD

**Result**: TBD

**Findings**:
- TBD

**Manual Actions Required**: TBD

---

## Phase 8: Deploy via GitHub Actions

**Duration**: TBD

**Result**: TBD

**Workflow Jobs**:
| Job | Duration | Status |
|-----|----------|--------|
| detect-changes | | |
| discover-urls | | |
| deploy-static-website | | |
| deploy-mcp-support | | |
| deploy-mcp-finance | | |
| deploy-mcp-hr | | |
| deploy-mcp-sales | | |
| deploy-gateway | | |
| deploy-web-portal | | |
| deploy-keycloak | | |
| sync-keycloak-realm | | |
| notify | | |

**Findings**:
- TBD

**Manual Actions Required**: TBD

---

## Phase 9: Configure TOTP

**Duration**: TBD

**Result**: TBD

**Findings**:
- TBD

**Manual Actions Required**: TBD

---

## Phase 10: Provision Users & Verify

**Duration**: TBD

**Result**: TBD

**Expected Behavior** (Issue #32 fix):
- provision-users Cloud Build succeeds without `_REGION` substitution error
- CLOUD_SQL_INSTANCE constructed inline in each step
- All health checks pass

**Health Checks**:
| Service | Status |
|---------|--------|
| mcp-gateway | |
| mcp-hr (auth-protected) | |
| mcp-finance (auth-protected) | |
| mcp-sales (auth-protected) | |
| mcp-support (auth-protected) | |
| keycloak | |
| web-portal | |

**Findings**:
- TBD

**Manual Actions Required**: TBD

---

## Summary

### Manual Actions Count

| Phase | v9 Manual Actions | v10 Manual Actions |
|-------|-------------------|-------------------|
| 1. Pre-flight | 0 | |
| 2. Secret verification | 0 | |
| 3. Pre-destroy cleanup | 0 | |
| 4. Terraform destroy | 0 | |
| 5. Build images | 0 | |
| 6. Regenerate SA key | 0 | |
| 7. Terraform Cloud Run | 0 | |
| 8. Deploy via GHA | 0 | |
| 9. Configure TOTP | 0 | |
| 10. Verification | 0 | |
| **TOTAL** | **0** | |

### Issues Fixed in v9.1

| Issue # | Description | Fix Applied | Status |
|---------|-------------|-------------|--------|
| #32 | provision-users `_REGION` substitution error | Removed invalid nested substitution; construct CLOUD_SQL_INSTANCE inline in each step | |

### Duration Comparison

| Metric | v9 | v10 | Change |
|--------|----|----|--------|
| Total Duration | ~57 min | TBD | |
| Manual Actions | 0 | TBD (expected: 0) | |

### Gap Status Summary

| Issue | v9 Status | v10 Validation |
|-------|-----------|----------------|
| #30 | PASS | |
| #30b | PASS | |
| #31 | PASS | |
| #32 | FAIL | |
| #33 | PASS | |
| #34 | FIXED | |
| #35 | PASS | |

---

## Deployed Services

### Cloud Run URLs

| Service | URL |
|---------|-----|
| Keycloak | TBD |
| MCP Gateway | TBD |
| MCP HR | TBD |
| MCP Finance | TBD |
| MCP Sales | TBD |
| MCP Support | TBD |
| Web Portal | TBD |

### Cloud SQL

- **Connection Name**: TBD
- **Private IP**: TBD

---

## Automated Run Command

For fully automated Phoenix rebuild (no interactive prompts):

```bash
./scripts/gcp/phoenix-rebuild.sh --yes
```

Or with specific phase start:

```bash
./scripts/gcp/phoenix-rebuild.sh --yes --phase=5
```

---

**End of Phoenix v10 Log**
*Status: PENDING*
*Started: TBD*
*Completed: TBD*
*Manual Actions: TBD (expected: 0)*
