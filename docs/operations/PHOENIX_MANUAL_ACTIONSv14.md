# Phoenix Rebuild v14 - Manual Actions Log

**Date**: January 26, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production
**Purpose**: Validate v13 in-flight fixes (provision-prod-users workflow, E2E cross-env)
**Previous Rebuild**: v13 (January 26, 2026)
**Constraint**: Zero manual actions — script only, no operator GCP writes

## Pre-Rebuild Issues Fixed

These issues were discovered and fixed in-flight during v13:

| Issue | Root Cause | Fix | Commit | File(s) |
|-------|-----------|-----|--------|---------|
| provision-prod-users Final Verification curl exit 3 | `${{ env.KEYCLOAK_URL }}` never defined in workflow; no discovery step existed | Added `Discover Keycloak URL` step using `gcloud run services describe` | `33ea1dc3` | `provision-prod-users.yml` |
| Cloud Run Job polling treats Unknown as failure | Polling `else` branch caught `Completed=Unknown` (job still starting) as failure | Changed to `elif "$CONDITION_STATUS" = "False"` so Unknown continues loop | `54a71c8b` | `provision-prod-users.yml` |
| E2E `TEST_ENV=prod` fails on Windows | `npm run test:login:prod` uses Unix-only syntax; cmd.exe can't parse it | Replaced with `npx cross-env TEST_ENV=prod playwright test ...` | `a09208ed` | `phoenix-rebuild.sh` |

## Pre-Rebuild Checklist

- [x] provision-prod-users KEYCLOAK_URL fix committed (commit `33ea1dc3`)
- [x] Cloud Run Job polling fix committed (commit `54a71c8b`)
- [x] E2E cross-env Windows fix committed (commit `a09208ed`)
- [x] Runbook updated to v3.7.0
- [ ] Pre-flight checks passed
- [ ] PROD_USER_PASSWORD available (via read-github-secrets.sh --phoenix)

## Expected Improvements from v13

| Issue | v13 Status | v14 Fix | v14 Expectation | v14 Result |
|-------|-----------|---------|-----------------|------------|
| provision-prod-users verification | FAIL — KEYCLOAK_URL missing, polling bug | Commits `33ea1dc3`, `54a71c8b` | Workflow passes all 3 jobs on first attempt | PENDING |
| E2E in-script execution | FAIL — Windows syntax error | Commit `a09208ed` (cross-env) | E2E tests pass in-script without manual run | PENDING |
| PROD_USER_PASSWORD fetch | PASS | No change | Continues to auto-fetch | PENDING |
| E2E secret loading | PASS | No change | Continues to load secrets | PENDING |
| #103 VPC peering stale reference | PASS (compute API fallback automated) | No change | Compute API fallback works again | PENDING |

## Timeline

| Time (UTC) | Phase | Action | Result | Duration |
|------------|-------|--------|--------|----------|
| TBD | 1-2 | Pre-flight + Secret verification | PENDING | TBD |
| TBD | 3 | Pre-destroy cleanup + Terraform destroy | PENDING | TBD |
| TBD | 4 | Terraform apply (infrastructure) | PENDING | TBD |
| TBD | 5 | Build container images | PENDING | TBD |
| TBD | 6 | Regenerate SA key | PENDING | TBD |
| TBD | 7 | Terraform Cloud Run (Stage 1-3) | PENDING | TBD |
| TBD | 8 | Deploy via GitHub Actions | PENDING | TBD |
| TBD | 9 | Configure TOTP | PENDING | TBD |
| TBD | 10 | Provision & Verify | PENDING | TBD |
| TBD | E2E | End-to-End Tests | PENDING | TBD |

**v14 Total Duration**: TBD
**Manual Actions**: TBD (target: 0)

---

## Phase 1-2: Pre-flight Checks & Secret Verification

**Result**: PENDING

---

## Phase 3: Pre-destroy Cleanup + Terraform Destroy

**Result**: PENDING

---

## Phase 4: Terraform Apply (Infrastructure)

**Result**: PENDING

---

## Phase 5: Build Container Images

**Result**: PENDING

---

## Phase 6: Regenerate SA Key

**Result**: PENDING

---

## Phase 7: Terraform Cloud Run (Staged)

**Result**: PENDING

---

## Phase 8: Deploy via GitHub Actions

**Result**: PENDING

---

## Phase 9: Configure TOTP

**Result**: PENDING

---

## Phase 10: Provision Users & Verify

**Result**: PENDING

---

## E2E Tests

**Result**: PENDING

---

## Summary

### Manual Actions Count

| Phase | v13 Manual Actions | v14 Manual Actions |
|-------|-------------------|-------------------|
| 1. Pre-flight | 0 | TBD |
| 2. Secret verification | 0 | TBD |
| 3. Pre-destroy cleanup | 0 | TBD |
| 4. Terraform apply | 0 | TBD |
| 5. Build images | 0 | TBD |
| 6. Regenerate SA key | 0 | TBD |
| 7. Terraform Cloud Run | 0 | TBD |
| 8. Deploy via GHA | 0 | TBD |
| 9. Configure TOTP | 0 | TBD |
| 10. Verification | 0 | TBD |
| E2E Tests | **1** (manual run) | TBD |
| **TOTAL** | **1** | **TBD** |

### Issues Validated

| Issue | Description | v13 Status | v14 Validation |
|-------|-------------|------------|----------------|
| provision-prod-users workflow | KEYCLOAK_URL discovery + polling fix | FAIL (fixed in-flight) | PENDING |
| E2E in-script execution | cross-env Windows compatibility | FAIL (manual run) | PENDING |
| PROD_USER_PASSWORD fetch | Auto-fetch from GitHub Secrets | PASS | PENDING |
| E2E secret loading | Load secrets before Playwright | PASS | PENDING |
| Domain mappings | api/app/auth.tamshai.com | PASS | PENDING |
| #103 | VPC peering stale reference | PASS (automated) | PENDING |
| #36 | Terraform state lock deadlock | PASS | PENDING |
| #37 | mcp-gateway SSL startup failure | PASS | PENDING |

### Blocking Requirements (PHOENIX_RUNBOOK v3.7.0)

- [ ] **User password provisioning complete** - Corporate users provisioned with known PROD_USER_PASSWORD
- [ ] **ALL E2E tests pass (6/6)** - Zero failures required

---

**End of Phoenix v14 Log**
*Status: IN PROGRESS*
*Started: TBD*
*Manual Actions: TBD (target: 0)*
*E2E Tests: PENDING*
