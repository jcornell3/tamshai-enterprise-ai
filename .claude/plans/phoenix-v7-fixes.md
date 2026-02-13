# Plan: Phoenix v7 Issues (3 Critical)

**Status**: CLOSED
**Closed**: 2026-02-13

---

## Issues

| Issue # | Description | Status |
|---------|-------------|--------|
| 9 | Provision Job IAM Race Condition | FIXED - Added `depends_on` for IAM bindings |
| 10 | SA Key Invalidated After Manual Terraform | FIXED - SA key validation in Phase 6 of phoenix-rebuild.sh |
| 11 | Terraform 409 "Already Exists" Conflicts | FIXED - 30-min timeouts + auto-recovery logic |

**Documentation**: `docs/operations/PHOENIX_MANUAL_ACTIONSv7.md`

---

## Key Files Modified

- `infrastructure/terraform/modules/security/main.tf` - IAM depends_on
- `infrastructure/terraform/modules/cloudrun/main.tf` - 30-min timeouts
- `scripts/gcp/phoenix-rebuild.sh` - 409 auto-recovery + SA key validation

---

## Remaining Work

None. All 3 issues fixed and validated in subsequent Phoenix rebuilds (v8-v15).

**This plan can be CLOSED.**
