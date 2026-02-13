# Plan: Security Audit Remediation

**Status**: ~90% Complete (documentation done, 1 IAM fix pending)
**Last Assessed**: 2026-02-13

---

## Summary

| Component | Status | Location |
|-----------|--------|----------|
| Vulnerability Monitoring (Grype) | COMPLETE | Weekly automated workflow |
| Secrets Baseline Sanitization | COMPLETE | 367 -> 182 entries (-50%) |
| CORS Enforcement | COMPLETE | 9 explicit HTTPS origins |
| ROPC Flow Assessment | COMPLETE | `docs/security/ROPC_ASSESSMENT.md` |
| Pre-commit Hooks (gitleaks, shellcheck, markdownlint) | COMPLETE | All fixed |
| IAM Security Remediation (CKV_GCP_41/49) | PENDING | `docs/security/IAM_SECURITY_REMEDIATION_PLAN.md` |

---

## Completed Work (`docs/security/SECURITY_REMEDIATION_SUMMARY.md`)

1. **Vulnerability Monitoring**: Automated weekly Grype scans with re-evaluation script
2. **Secrets Baseline**: Removed 205+ build artifact secrets, sanitized docs
3. **CORS**: Replaced `origins: ["*"]` with 9 explicit origins (Kong + Keycloak)
4. **OAuth**: ROPC disabled in prod/stage, enabled in dev/CI only
5. **Pre-commit**: Gitleaks, shellcheck, markdownlint, detect-secrets all passing

---

## Remaining Work

- [ ] Apply IAM security remediation to `infrastructure/terraform/`:
  - Replace project-level `roles/iam.serviceAccountUser` with resource-scoped bindings
  - Scope CI/CD SA to impersonate only: Keycloak SA, MCP Gateway SA, MCP Servers SA
  - Fixes CKV_GCP_41 and CKV_GCP_49 Checkov alerts
  - **Estimated effort**: 30-60 minutes
  - **Risk**: Compromised CI/CD could currently impersonate any SA in project

**Note**: This overlaps with witty-chasing-cookie (Security Remediation - Dev). The IAM fix is documented in both plans.
