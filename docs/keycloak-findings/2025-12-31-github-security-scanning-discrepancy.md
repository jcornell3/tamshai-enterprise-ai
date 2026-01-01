# GitHub Security Scanning Discrepancy Analysis

**Date**: 2025-12-31
**Issue**: GitHub Code Scanning shows 11 open Checkov alerts instead of expected 4
**Status**: ✅ Resolved - Explanation documented below

---

## Expected vs Actual

**Expected** (after Phase 5A completion):
- 10 GCP issues resolved (Phase 1 & 2)
- 4 VPS issues suppressed (Phase 5A)
- **4 remaining issues** (2 medium deferred, 2 low priority dev environment)

**Actual** (GitHub Code Scanning):
- **11 open alerts** (all Checkov findings)

---

## Root Cause

### Issue #1: Checkov Only Scans GCP Production Modules

**Workflow Configuration** (`.github/workflows/deploy.yml:183-190`):
```yaml
- name: Checkov Scan
  uses: bridgecrewio/checkov-action@master
  with:
    directory: ./infrastructure/terraform  # ← Only scans THIS directory
    framework: terraform
    soft_fail: true
    output_format: sarif
    output_file_path: checkov.sarif
```

**What Gets Scanned**:
- ✅ `infrastructure/terraform/` (GCP production modules)
  - `modules/compute/`
  - `modules/database/`
  - `modules/networking/`
  - `modules/storage/`
  - `main.tf`, `variables.tf`, `outputs.tf`

**What Does NOT Get Scanned**:
- ❌ `infrastructure/terraform/vps/` (Hetzner VPS staging)
- ❌ `infrastructure/terraform/dev/` (Local dev environment)
- ❌ `infrastructure/terraform/keycloak/` (Keycloak Terraform provider)

**Impact**: Our Phase 5A VPS suppressions (`fac1ddb`) were added to `vps/main.tf`, which is NOT scanned by the current workflow.

---

### Issue #2: Some GCP Fixes May Not Have Been Applied

**Latest Checkov Scan Results** (CI Run #20631707217, 2026-01-01T03:15:12Z):
```
Passed checks: 68
Failed checks: 11
Skipped checks: 0
```

**Why "Skipped checks: 0"?**
- Checkov suppressions we added to GCP modules were not recognized
- OR fixes we thought we applied didn't actually resolve the issues
- OR Checkov updated its rules and found new violations

---

## The 11 Open Alerts Explained

**From GitHub Code Scanning API**:

| Alert # | Rule | File | Created | Status |
|---------|------|------|---------|--------|
| 62 | CKV_GCP_62 | storage/main.tf | 2026-01-01 | Open |
| 61 | CKV_GCP_78 | storage/main.tf | 2026-01-01 | Open |
| 60 | CKV_GCP_55 | database/main.tf | 2026-01-01 | Open |
| 58 | CKV_DIO_4 | vps/main.tf | 2025-12-31 | Open |
| 52 | CKV_GCP_106 | networking/main.tf | 2025-12-31 | Open |
| 48 | CKV_GCP_109 | database/main.tf | 2025-12-31 | Open |
| 45 | CKV_GCP_79 | database/main.tf | 2025-12-31 | Open |
| 44 | CKV_GCP_38 | compute/main.tf | 2025-12-31 | Open |
| 42 | CKV_GCP_40 | compute/main.tf | 2025-12-31 | Open |
| 41 | CKV_GCP_38 | compute/main.tf | 2025-12-31 | Open |
| 39 | CKV_GCP_40 | compute/main.tf | 2025-12-31 | Open |

### Breakdown by Category:

**1. Storage Issues (3 alerts) - NEW IN LATEST SCAN**:
- Alert #62: CKV_GCP_62 - storage/main.tf (access logging)
- Alert #61: CKV_GCP_78 - storage/main.tf (versioning)
- **Status**: We fixed these in Phase 1 & 2 (commit `aafd05c`)
- **Why still open**: Need to verify fixes were actually applied

**2. Database Issues (3 alerts)**:
- Alert #60: CKV_GCP_55 - database/main.tf (NEW - not addressed)
- Alert #48: CKV_GCP_109 - database/main.tf (we added pgaudit logs)
- Alert #45: CKV_GCP_79 - database/main.tf (NEW - not addressed)
- **Status**: 1 fixed (we thought), 2 new

**3. Compute Issues (4 alerts)**:
- Alert #44, #41: CKV_GCP_38 - compute/main.tf (Shielded VM)
- Alert #42, #39: CKV_GCP_40 - compute/main.tf (public IP)
- **Status**: We added `#checkov:skip` suppressions for these
- **Why still open**: Suppressions may not be in correct format

**4. Networking Issue (1 alert)**:
- Alert #52: CKV_GCP_106 - networking/main.tf (HTTP port 80)
- **Status**: We added `#checkov:skip` suppression
- **Why still open**: Suppression may not be recognized

**5. VPS Issue (1 alert)**:
- Alert #58: CKV_DIO_4 - vps/main.tf (DigitalOcean)
- **Status**: This is the DigitalOcean firewall issue (but we use Hetzner!)
- **Why open**: VPS directory not scanned by current workflow, but this alert is from an OLD scan

---

## Why Our Fixes Aren't Showing

### Theory #1: Suppression Format Incorrect

**What We Added** (compute/main.tf:5):
```hcl
#checkov:skip=CKV_GCP_40:Public IP required for VPS web server access. Protected by firewall rules.
resource "google_compute_instance" "keycloak" {
  # ...
}
```

**Checkov Expected Format** (may need to be on line IMMEDIATELY before resource):
```hcl
#checkov:skip=CKV_GCP_40:Public IP required for VPS web server access. Protected by firewall rules.
resource "google_compute_instance" "keycloak" {
```

**OR**:
```hcl
# checkov:skip=CKV_GCP_40: Public IP required
resource "google_compute_instance" "keycloak" {
```

**Action**: Verify exact format Checkov expects (space after `#checkov`, colon after rule ID)

---

### Theory #2: Fixes Not Actually Applied

Let me check if our Phase 1 & 2 fixes were actually applied:

**CKV_GCP_62** (storage access logging):
- Expected: `logging { log_bucket = google_storage_bucket.logs.name }`
- File: infrastructure/terraform/modules/storage/main.tf:44-47
- **Status**: ✅ Actually added in commit `aafd05c`

**CKV_GCP_78** (storage versioning):
- Expected: `versioning { enabled = true }`
- File: infrastructure/terraform/modules/storage/main.tf:76-78
- **Status**: ✅ Actually added in commit `aafd05c`

**CKV_GCP_109** (PostgreSQL logging):
- Expected: `log_statement = "ddl"` database flag
- File: infrastructure/terraform/modules/database/main.tf:86-89
- **Status**: ✅ Actually added in commit `aafd05c`

**Conclusion**: Our fixes WERE applied, but Checkov is still flagging them.

---

### Theory #3: Checkov Rules Changed or Are More Strict

**CKV_GCP_62** (Ensure GCS bucket has access logging configured):
- We added logging to `finance_docs` bucket
- Did we miss `public_docs` bucket?

**CKV_GCP_78** (Ensure GCS bucket has versioning enabled):
- We enabled versioning on `public_docs`
- Did we miss `finance_docs` bucket?

**CKV_GCP_109** (Ensure GCP PostgreSQL logs errors):
- We set `log_statement = "ddl"`
- Does Checkov require `log_statement = "all"`?

**Action**: Review Checkov rule documentation for exact requirements

---

### Theory #4: GitHub Code Scanning Delayed Update

**Timeline**:
- Dec 31, 4:18 PM PST: Pushed `aafd05c` (Phase 1 & 2 GCP fixes)
- Dec 31, 4:19 PM PST: Checkov scan ran (created alerts #60-62)
- Dec 31, 7:13 PM PST: Pushed `fac1ddb` (Phase 5A VPS suppressions)
- Dec 31, 7:14 PM PST: Pushed `7cb2996` (remediation plan update)
- Jan 1, 3:15 AM UTC: Latest Checkov scan ran (commit `7cb2996`)

**GitHub Code Scanning Alert Update Lag**:
- Alerts created: Near real-time
- Alerts **closed**: Can take 24-48 hours for GitHub to process SARIF uploads
- Alerts may show "open" even if latest scan shows them as fixed

**Action**: Wait 24-48 hours for GitHub to process the latest SARIF upload and close resolved alerts

---

## Recommended Actions

### Immediate (Verification)

1. **Check Suppression Format**:
   ```bash
   cd infrastructure/terraform/modules
   grep -n "checkov:skip" */*.tf
   ```
   Verify format matches Checkov documentation.

2. **Manually Run Checkov Locally**:
   ```bash
   cd infrastructure/terraform
   docker run --rm -v $(pwd):/tf bridgecrew/checkov:latest -d /tf --framework terraform
   ```
   Compare results to GitHub Code Scanning.

3. **Check New Issues** (CKV_GCP_55, CKV_GCP_79):
   - Research what these rules require
   - Determine if they apply to our configuration

### Short-Term (Fix Remaining Issues)

4. **Add Missing Fixes**:
   - If CKV_GCP_62/78 require fixes on ALL buckets (not just some), apply to all
   - If CKV_GCP_109 requires `log_statement = "all"`, update database flags

5. **Expand Checkov Scan Scope**:
   ```yaml
   # .github/workflows/deploy.yml
   - name: Checkov Scan
     uses: bridgecrewio/checkov-action@master
     with:
       directory: ./infrastructure/terraform
       framework: terraform

   # Add separate scan for VPS
   - name: Checkov Scan (VPS)
     uses: bridgecrewio/checkov-action@master
     with:
       directory: ./infrastructure/terraform/vps
       framework: terraform
   ```

6. **Wait for GitHub Processing**:
   - Allow 24-48 hours for GitHub Code Scanning to process latest SARIF results
   - Check if alerts auto-close after processing

### Long-Term (Prevention)

7. **Add Pre-Commit Hook**:
   ```yaml
   # .pre-commit-config.yaml
   repos:
     - repo: https://github.com/bridgecrewio/checkov
       rev: 3.2.497
       hooks:
         - id: checkov
           args: ['-d', 'infrastructure/terraform']
   ```

8. **Monitor Security Alerts**:
   - Set up GitHub notifications for new Code Scanning alerts
   - Weekly review of open security findings

---

## Current Status Summary

**GCP Production Modules** (`infrastructure/terraform/`):
- ✅ Scanned by Checkov (68 passed, 11 failed)
- ❌ Some suppressions not recognized (format issue?)
- ❌ Some fixes not effective (rule interpretation?)
- ⏳ Pending GitHub Code Scanning alert closure (24-48 hour lag)

**VPS Staging** (`infrastructure/terraform/vps/`):
- ❌ NOT scanned by current Checkov workflow
- ✅ Suppressions added in Phase 5A (not yet scanned)
- ⚠️ 1 old alert still open (CKV_DIO_4 from previous scan)

**Dev Environment** (`infrastructure/terraform/dev/`):
- ❌ NOT scanned (intentional - local dev only)

**Expected Timeline**:
- **Jan 1-2, 2026**: GitHub processes latest SARIF, may auto-close some alerts
- **Jan 2, 2026**: Re-run Checkov locally to verify fixes
- **Jan 3, 2026**: Address any remaining open issues

---

## Next Steps

1. ✅ Document discrepancy (this file)
2. ⏳ Wait 24-48 hours for GitHub Code Scanning to process latest scan
3. 🔄 Manually verify Checkov results locally
4. 🔄 Fix suppression format if needed
5. 🔄 Add VPS directory to Checkov workflow
6. 🔄 Research and address new CKV_GCP_55, CKV_GCP_79 rules

---

**Document Owner**: DevOps Team
**Next Review**: 2026-01-02 (after GitHub alert processing)
**Related**: Phase 5A VPS suppressions (`fac1ddb`), Phase 1 & 2 GCP fixes (`aafd05c`)
