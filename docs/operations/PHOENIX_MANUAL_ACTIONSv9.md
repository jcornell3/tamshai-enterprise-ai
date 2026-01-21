# Phoenix Rebuild v9 - Manual Actions Log

**Date**: January 20, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production
**Purpose**: Validate v8.1 automation - Zero manual actions expected
**Previous Rebuild**: v8 (January 20, 2026)

## Pre-Rebuild Checklist

- [ ] All workflows passed after pushing v8.1 fixes
- [ ] v8 issues (#30-#33) remediated in automation
- [ ] Issue #30: provision-job built early in Phase 4
- [ ] Issue #30b: Minimal build context (~50MB vs 7.6GB)
- [ ] Issue #31: Artifact Registry auto-import recovery
- [ ] Issue #32: _REGION substitution in provision-users.sh
- [ ] Issue #33: Health checks accept 2xx + follow redirects
- [ ] .gcloudignore optimized (exclude Electron, keep Flutter platform dirs)

## Expected Improvements from v8

| Issue # | Issue | v8 Status | v9 Expectation | v9 Result |
|---------|-------|-----------|----------------|-----------|
| #30 | provision_users job fails (image not found) | Deferred (warning) | No errors - image built early | |
| #30b | provision-job upload slow (7.6GB repo) | Not addressed | Fast upload (~50MB context) | |
| #31 | Artifact Registry 409 during terraform | Manual import | Auto-import recovery | |
| #32 | provision-users missing _REGION | Warning | No warnings | |
| #33 | web-portal health check timeout | Non-blocking | Health check passes | |

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

**v8 Total Duration**: ~55 minutes
**v9 Total Duration**: TBD
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

**Expected Behavior** (Issue #30 fix):
- provision-job image built BEFORE terraform apply
- Minimal build context (~50MB) for fast upload
- No "image not found" errors for provision_users job

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
| keycloak | latest | |
| web-portal | latest | |
| provision-job | latest | |

**Expected Behavior** (Issue #30b fix):
- provision-job uses minimal context (~50MB vs 7.6GB)
- Upload completes in ~30 seconds instead of 10+ minutes

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

**Expected Behavior** (Issue #31 fix):
- Artifact Registry 409 error auto-recovered via import
- No manual terraform import needed

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

**Expected Behavior** (Issues #32, #33 fix):
- provision-users Cloud Build succeeds with _REGION substitution
- Health checks pass for all services including web-portal

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

| Phase | v8 Manual Actions | v9 Manual Actions |
|-------|-------------------|-------------------|
| 1. Pre-flight | 0 | |
| 2. Secret verification | 0 | |
| 3. Pre-destroy cleanup | 0 | |
| 4. Terraform destroy | 0 | |
| 5. Build images | 0 | |
| 6. Regenerate SA key | 0 | |
| 7. Terraform Cloud Run | 1 (Artifact Registry import) | |
| 8. Deploy via GHA | 0 | |
| 9. Configure TOTP | 0 | |
| 10. Verification | 0 | |
| **TOTAL** | **1** | |

### Issues Fixed in v8.1

| Issue # | Description | Fix Applied |
|---------|-------------|-------------|
| #30 | provision_users job fails (image not found) | Build provision-job early in Phase 4 |
| #30b | provision-job upload slow (7.6GB repo) | Minimal build context (~50MB) |
| #31 | Artifact Registry 409 during terraform | Auto-import recovery in phoenix-rebuild.sh |
| #32 | provision-users missing _REGION | Added to substitutions in provision-users.sh |
| #33 | web-portal health check timeout | Accept 2xx + follow redirects in health-checks.sh |

### Duration Comparison

| Metric | v8 | v9 | Change |
|--------|----|----|--------|
| Total Duration | ~55 min | TBD | |
| Manual Actions | 1 | TBD (expected: 0) | |

### Gap Status Summary

| Issue | v8 Status | v9 Validation |
|-------|-----------|---------------|
| #30 | Deferred (warning) | |
| #30b | Not addressed | |
| #31 | Manual import | |
| #32 | Warning | |
| #33 | Non-blocking | |

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

**End of Phoenix v9 Log**
*Status: PENDING*
*Started: TBD*
*Completed: TBD*
*Manual Actions: TBD (expected: 0)*
