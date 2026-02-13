# Plan: Phoenix v5 Issues (10 Gaps)

**Status**: ~95% Complete (most gaps fixed; may be obsolete given Phoenix v9-v11)
**Last Assessed**: 2026-02-13

---

## Gap Status

| Gap # | Issue | Status |
|-------|-------|--------|
| 50 | Storage bucket `force_destroy` not working with `phoenix_mode=true` | WORKAROUND ONLY |
| 51 | mcp-gateway terraform missing REDIS_HOST and VPC connector | FIXED |
| 52 | sync-keycloak-realm fails during Phoenix (cold start timeout) | FIXED |
| 53 | Corporate users not provisioned (identity-sync not triggered) | FIXED |
| 54 | reset-test-user-totp.py uses hardcoded password | FIXED |
| 55 | web-portal Dockerfile expects repo root context | DOCUMENTED |
| 56 | keycloak build needs Dockerfile.cloudbuild | DOCUMENTED |
| 57 | clients/web/cloudbuild.yaml doesn't exist | DOCUMENTED |
| 58 | --tag flag requires Dockerfile in build context | DOCUMENTED |
| 59 | E2E tests check wrong realm name | FIXED |

**Documentation**: `.specify/docs/operations/PHOENIX_MANUAL_ACTIONSv5.md`

---

## Context

Phoenix has evolved significantly since v5:
- v1-v2: 15+ manual actions (~4 hours)
- v3-v5: 8-10 manual actions (~2 hours)
- v6-v8: 3-5 manual actions (~90 minutes)
- v9-v11: 0 manual actions (~75 minutes) - **Fully automated**

---

## Remaining Work

- [ ] Gap #50: Implement proper storage bucket cleanup for phoenix_mode rebuilds
- [ ] Gaps #55-58: Verify if build process issues are still relevant in current Phoenix version
- [ ] **Recommendation**: Validate all 10 gaps against current Phoenix (v9+) and close obsolete items
