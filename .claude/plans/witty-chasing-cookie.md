# Plan: Security Remediation - Dev

**Status**: ~60% Complete
**Last Assessed**: 2026-02-13

---

## Status Summary

| Category | Issue | Status | Priority |
|----------|-------|--------|----------|
| Terraform Phase 3 deployment | Apply DB SSL, audit logging, storage versioning to dev | PENDING | HIGH |
| Terraform Phase 3 validation | Run 10 validation steps, re-run Checkov | PENDING | HIGH |
| IAM scope reduction | Replace project-level `roles/iam.serviceAccountUser` | PENDING | HIGH |
| API key incident follow-up | New key from Anthropic, update GCP SM, redeploy | PENDING (user action) | CRITICAL |
| Secrets baseline reduction | Reduced 367 -> 182 entries (-50%) | COMPLETE | - |
| CORS enforcement | Explicit origins in Kong + Keycloak | COMPLETE | - |
| OAuth flow policy | ROPC disabled prod/stage, enabled dev/CI | COMPLETE | - |
| Vulnerability monitoring | Weekly Grype scans automated | COMPLETE | - |
| VPS firewall suppressions | Documented with justifications | COMPLETE | - |
| Centralized logging (Phase 6) | Loki or Cloud Logging agent | DEFERRED | LOW |

---

## Remaining Work (Priority Order)

### CRITICAL

- [ ] Obtain new Claude API key from Anthropic Console (user action)
- [ ] Update GCP Secret Manager with new key
- [ ] Redeploy MCP Gateway service

### HIGH

- [ ] Apply Terraform Phase 3 to dev environment:
  - Database SSL enforcement (`require_ssl = true`)
  - PostgreSQL audit logging flags
  - Storage public access prevention
  - Bucket access logging + versioning
- [ ] Run Phase 3 validation (10 steps documented in `docs/archived/keycloak-debugging-2025-12/2025-12-31-security-remediation-plan.md`)
- [ ] Re-run Checkov security scan
- [ ] Implement IAM service account scope reduction (CKV_GCP_41, CKV_GCP_49)
  - Replace project-level binding with 3 resource-scoped bindings
  - See `docs/security/IAM_SECURITY_REMEDIATION_PLAN.md`

### LOW

- [ ] Phase 6: Centralized logging (Loki or Cloud Logging agent) - deferred

**Estimated effort**: 4-6 hours for HIGH items, plus user action for CRITICAL
