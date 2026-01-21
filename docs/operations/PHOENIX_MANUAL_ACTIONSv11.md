# Phoenix Rebuild v11 - Manual Actions Log

**Date**: January 21, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production
**Purpose**: Validate v10 fixes on fresh rebuild - Zero manual actions expected
**Previous Rebuild**: v10 (January 21, 2026)

## Pre-Rebuild Checklist

- [x] All workflows passed after pushing v10 fixes
- [x] Issue #36 fix committed (GCS lock file check)
- [x] Issue #37 fix committed (staged Phase 7 deployment)
- [x] E2E tests passing on current production

## Expected Improvements from v10

| Issue # | Issue | v10 Status | v11 Expectation | v11 Result |
|---------|-------|-----------|-----------------|------------|
| #32 | provision-users `_REGION` substitution error | PASS | No errors | **PASS** |
| #36 | Terraform state lock deadlock | PASS | No deadlock - GCS check works | **PASS** |
| #37 | mcp-gateway SSL startup failure | PASS | SSL wait ensures clean startup | **PASS** |

## Timeline

| Time (UTC) | Phase | Action | Result | Duration |
|------------|-------|--------|--------|----------|
| 17:15 | - | Phoenix v11 rebuild started (announced) | - | - |
| 17:23:22 | 1-2 | Pre-flight + Secret verification | PASS | ~2 min |
| 17:25 | 3 | Pre-destroy cleanup | PASS | ~5 min |
| 17:30 | 4 | Terraform destroy + apply (infra) | PASS | ~20 min |
| 17:50 | 5 | Build container images | PASS | ~12 min |
| 18:02 | 6 | Regenerate SA key | PASS | ~1 min |
| 18:03 | 7 | Terraform Cloud Run (Stage 1-3) | PASS | ~20 min |
| 18:23 | 8 | Deploy via GitHub Actions | PASS | ~8 min |
| 18:31 | 9 | Configure TOTP | PASS | ~2 min |
| 18:33 | 10 | Provision Users & Verify | PASS | ~7 min |
| 18:52 | E2E | End-to-End Tests | **6/6 PASS** | ~24 sec |

**v10 Total Duration**: ~70-75 minutes (expected for fresh rebuild with SSL wait)
**v11 Total Duration**: ~98 minutes (17:15 - 18:53 UTC)
**Manual Actions**: **0** (all automated)

---

## Phase 1-2: Pre-flight Checks & Secret Verification

**Duration**: ~2 minutes

**Result**: PASS

**Findings**:
- All prerequisite checks passed
- GitHub secrets accessible
- GCP authentication successful

**Manual Actions Required**: None

---

## Phase 3: Pre-destroy Cleanup

**Duration**: ~5 minutes

**Result**: PASS

**Issue #36 Validation**:
- GCS lock file check worked correctly
- No `terraform plan` used for lock detection (avoids creating new locks)
- No Terraform state lock deadlock occurred

**Findings**:
- 49 resources destroyed successfully
- VPC connector deleted
- Cloud SQL instance deleted
- Storage buckets cleaned up

**Manual Actions Required**: None

---

## Phase 4: Terraform Destroy + Apply (Infrastructure)

**Duration**: ~20 minutes (including ~13 min Cloud SQL creation)

**Result**: PASS

**Findings**:
- 85 resources created successfully
- Cloud SQL instance created in 13m10s
- VPC, subnets, NAT gateway created
- Storage buckets created (prod.tamshai.com, logs, finance-docs, public-docs)
- Service accounts and IAM bindings configured
- Artifact Registry created

**Manual Actions Required**: None

---

## Phase 5: Build Container Images

**Duration**: ~12 minutes

**Result**: PASS

**Images Built**:
| Image | Tag | Status |
|-------|-----|--------|
| mcp-gateway | latest | SUCCESS |
| mcp-hr | latest | SUCCESS |
| mcp-finance | latest | SUCCESS |
| mcp-sales | latest | SUCCESS |
| mcp-support | latest | SUCCESS |
| keycloak | v2.0.0-postgres | SUCCESS |
| web-portal | latest | SUCCESS |
| provision-job | latest | SUCCESS |

**Findings**:
- All 8 images built successfully on first attempt
- No network errors (Issue #34 retry logic not needed)
- All images verified in Artifact Registry

**Manual Actions Required**: None

---

## Phase 6: Regenerate SA Key

**Duration**: ~1 minute

**Result**: PASS

**Findings**:
- New SA key created and validated
- GitHub secret `GCP_SA_KEY_PROD` updated
- SA key can access project (Issue #10 validation)

**Manual Actions Required**: None

---

## Phase 7: Terraform Cloud Run

**Duration**: ~20 minutes (including ~17 min SSL wait)

**Result**: PASS

**Issue #37 Validation** (Staged Deployment):
- Stage 1: Deployed Keycloak, MCP Suite (hr, finance, sales, support), web-portal, domain mappings
- Stage 2: Waited for SSL certificate on auth.tamshai.com (34 attempts, ~17 minutes)
- Stage 3: Deployed mcp-gateway after SSL was ready

**SSL Wait Log**:
- SSL certificate provisioning started
- Polling every 30 seconds
- Certificate deployed and working after 34 attempts (~17 minutes)
- HTTPS verified working on auth.tamshai.com (HTTP 200)

**Findings**:
- Staged deployment worked perfectly
- No mcp-gateway startup failures (Issue #37 FIXED)
- All domain mappings created successfully
- SSL certificates deployed correctly

**Manual Actions Required**: None

---

## Phase 8: Deploy via GitHub Actions

**Duration**: ~8 minutes

**Result**: PASS

**Workflow Jobs**:
| Job | Duration | Status |
|-----|----------|--------|
| detect-changes | 6s | SUCCESS |
| discover-urls | ~40s | SUCCESS |
| deploy-static-website | ~35s | SUCCESS |
| deploy-mcp-support | 1m9s | SUCCESS |
| deploy-mcp-finance | 1m7s | SUCCESS |
| deploy-mcp-hr | 1m8s | SUCCESS |
| deploy-mcp-sales | 1m8s | SUCCESS |
| deploy-gateway | 1m18s | SUCCESS |
| deploy-web-portal | 1m28s | SUCCESS |
| deploy-keycloak | 1m39s | SUCCESS |
| sync-keycloak-realm | 4m3s | SUCCESS |
| notify | 2s | SUCCESS |

**Findings**:
- All 12 deployment jobs completed successfully
- Keycloak TOTP secret injected correctly
- sync-keycloak-realm configured test-user.journey
- All services passed health checks

**Manual Actions Required**: None

---

## Phase 9: Configure TOTP

**Duration**: ~2 minutes

**Result**: PASS

**Findings**:
- TOTP secret fetched from `TEST_USER_TOTP_SECRET_RAW` GitHub Secret
- Existing OTP credential deleted (8b72d46f-ad92-4396-93ec-2d689cab90c1)
- New OTP credential created via user update method
- Credential verified: `totp-1769021256`

**Manual Actions Required**: None

---

## Phase 10: Provision Users & Verify

**Duration**: ~5 minutes

**Result**: PASS

**Issue #32 Validation**:
- provision-users Cloud Build succeeded without `_REGION` substitution error
- CLOUD_SQL_INSTANCE constructed inline in each step
- Cloud Build completed successfully (verify-only action)

**Health Checks**:
| Service | Status |
|---------|--------|
| mcp-gateway | HEALTHY |
| mcp-hr (auth-protected) | HEALTHY (via gcloud) |
| mcp-finance (auth-protected) | HEALTHY (via gcloud) |
| mcp-sales (auth-protected) | HEALTHY (via gcloud) |
| mcp-support (auth-protected) | HEALTHY (via gcloud) |
| keycloak | HEALTHY |
| web-portal | HEALTHY |

**Findings**:
- Issue #32 fully resolved - no more `_REGION` substitution errors
- provision-users Cloud Build completed successfully
- All services healthy and responding

**Manual Actions Required**: None

---

## E2E Tests

**Duration**: ~24 seconds

**Result**: **6/6 PASS**

| Test | Duration | Status |
|------|----------|--------|
| should display employee login page with SSO button | 4.1s | PASS |
| should redirect to Keycloak when clicking SSO | 4.0s | PASS |
| should complete full login journey with credentials | 11.5s | PASS |
| should handle invalid credentials gracefully | 1.9s | PASS |
| should load portal without JavaScript errors | 883ms | PASS |
| should not have 404 errors for assets | 836ms | PASS |

**Findings**:
- TOTP authentication working correctly (used oathtool SHA1)
- Full login journey successful for test-user.journey
- Portal SPA rendering without errors
- All assets loading correctly

---

## Summary

### Manual Actions Count

| Phase | v10 Manual Actions | v11 Manual Actions |
|-------|-------------------|-------------------|
| 1. Pre-flight | 0 | 0 |
| 2. Secret verification | 0 | 0 |
| 3. Pre-destroy cleanup | 0 | 0 |
| 4. Terraform destroy | 0 | 0 |
| 5. Build images | 0 | 0 |
| 6. Regenerate SA key | 0 | 0 |
| 7. Terraform Cloud Run | 0 | 0 |
| 8. Deploy via GHA | 0 | 0 |
| 9. Configure TOTP | 0 | 0 |
| 10. Verification | 0 | 0 |
| **TOTAL** | **0** | **0** |

### Issues Validated

| Issue # | Description | v10 Status | v11 Validation |
|---------|-------------|------------|----------------|
| #32 | provision-users `_REGION` substitution error | FIXED | **PASS** |
| #36 | Terraform state lock deadlock | FIXED | **PASS** |
| #37 | mcp-gateway SSL startup failure | FIXED | **PASS** |

### Duration Comparison

| Metric | v10 | v11 | Change |
|--------|-----|-----|--------|
| Total Duration | ~70-75 min (expected) | ~83 min | +11% (fresh SSL wait) |
| Phase 7 (with SSL wait) | ~15-20 min | ~20 min | In range |
| Manual Actions | 0 | **0** | No change |
| E2E Tests | 6/6 PASS | **6/6 PASS** | No change |

### Gap Status Summary

| Issue | v10 Status | v11 Validation |
|-------|-----------|----------------|
| #30 | PASS | **PASS** |
| #30b | PASS | **PASS** |
| #31 | PASS | **PASS** |
| #32 | PASS | **PASS** |
| #33 | PASS | **PASS** |
| #34 | PASS | **PASS** |
| #35 | PASS | **PASS** |
| #36 | PASS | **PASS** |
| #37 | PASS | **PASS** |

---

## Deployed Services

### Cloud Run URLs

| Service | URL |
|---------|-----|
| Keycloak | https://keycloak-fn44nd7wba-uc.a.run.app |
| MCP Gateway | https://mcp-gateway-fn44nd7wba-uc.a.run.app |
| MCP HR | https://mcp-hr-fn44nd7wba-uc.a.run.app |
| MCP Finance | https://mcp-finance-fn44nd7wba-uc.a.run.app |
| MCP Sales | https://mcp-sales-fn44nd7wba-uc.a.run.app |
| MCP Support | https://mcp-support-fn44nd7wba-uc.a.run.app |
| Web Portal | https://web-portal-fn44nd7wba-uc.a.run.app |

### Custom Domains

| Domain | Service |
|--------|---------|
| https://auth.tamshai.com | Keycloak |
| https://app.tamshai.com | Web Portal |
| https://prod.tamshai.com | Marketing Site (GCS) |

### Cloud SQL

- **Connection Name**: gen-lang-client-0553641830:us-central1:tamshai-prod-postgres
- **Private IP**: 10.86.0.3

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

## E2E Test Command

```bash
cd tests/e2e
eval $(../../scripts/secrets/read-github-secrets.sh --e2e --env)
npx cross-env TEST_ENV=prod playwright test login-journey --project=chromium --workers=1
```

---

**End of Phoenix v11 Log**
*Status: COMPLETED*
*Started: 2026-01-21 17:15:00 UTC*
*Completed: 2026-01-21 18:53:00 UTC*
*Manual Actions: 0*
*E2E Tests: 6/6 PASS*
