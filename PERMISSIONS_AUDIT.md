# GitHub Actions Permissions Audit Report

**Workflow**: `.github/workflows/ci.yml`
**Generated**: 2025-12-29
**Status**: 12 open security alerts for excessive permissions

---

## Executive Summary

### Current Workflow-Level Permissions
```yaml
permissions:
  contents: read          # ✅ KEEP - Needed by all jobs (clone repo)
  security-events: write  # ❌ REMOVE - Only 4-6 jobs need this
  actions: read           # ❌ REMOVE - No job uses this
  pull-requests: write    # ❌ REMOVE - No job uses this
```

### Key Findings
- **14 jobs** analyzed
- **12 security alerts** due to excessive permissions
- **100% of jobs** have `actions: read` (not used)
- **57% of jobs** have unnecessary `security-events: write`
- **0 jobs** use `pull-requests: write`

### Recommendation
**Remove workflow-level permissions**, set to `contents: read` only, then grant explicitly per job.

---

## Detailed Job Analysis

### Category 1: Build & Test Jobs (No Security Uploads)
**These jobs only need `contents: read`**

#### 1. `gateway-lint-test` (Node 20/22)
**What it does**:
- Checkout code
- npm install, lint, test
- Upload coverage to Codecov (external service)

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read` only

**Recommendation**:
```yaml
permissions:
  contents: read
```
❌ Remove `security-events: write` (doesn't upload SARIF)
❌ Remove `actions: read` (not used)

---

#### 2. `flutter-analyze-test`
**What it does**:
- Checkout code
- flutter analyze, test
- Upload coverage to Codecov (external service)

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read` only

**Recommendation**:
```yaml
permissions:
  contents: read
```
❌ Remove `security-events: write` (doesn't upload SARIF)
❌ Remove `actions: read` (not used)

---

#### 3. `flutter-build`
**What it does**:
- Checkout code
- Build Linux Flutter app

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read` only

**Recommendation**:
```yaml
permissions:
  contents: read
```
❌ Remove `security-events: write` (no uploads)
❌ Remove `actions: read` (not used)

---

#### 4. `terraform-validate`
**What it does**:
- Checkout code
- terraform fmt -check
- terraform validate

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read` only

**Recommendation**:
```yaml
permissions:
  contents: read
```
❌ Remove `security-events: write` (no SARIF upload)
❌ Remove `actions: read` (not used)

---

#### 5. `docker-build`
**What it does**:
- Checkout code
- Build Docker image (no push)

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read` only

**Recommendation**:
```yaml
permissions:
  contents: read
```
❌ Remove `security-events: write` (no uploads)
❌ Remove `actions: read` (not used)

---

#### 6. `integration-tests`
**What it does**:
- Checkout code
- Run integration tests

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read` only

**Recommendation**:
```yaml
permissions:
  contents: read
```
❌ Remove `security-events: write` (no uploads)
❌ Remove `actions: read` (not used)

---

#### 7. `e2e-tests` (Playwright)
**What it does**:
- Checkout code
- Run Playwright E2E tests

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read` only

**Recommendation**:
```yaml
permissions:
  contents: read
```
❌ Remove `security-events: write` (no uploads)
❌ Remove `actions: read` (not used)

---

#### 8. `performance-tests` (k6)
**What it does**:
- Checkout code
- Run k6 performance tests

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read` only

**Recommendation**:
```yaml
permissions:
  contents: read
```
❌ Remove `security-events: write` (no uploads)
❌ Remove `actions: read` (not used)

---

### Category 2: Security Jobs (Need security-events: write)
**These jobs upload SARIF to GitHub Security tab**

#### 9. `security-scan` (npm audit / CodeQL)
**What it does**:
- Checkout code
- npm audit
- (May upload security findings)

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read`, possibly `security-events: write`

**Recommendation**:
```yaml
permissions:
  contents: read
  security-events: write  # Keep if uploading to Security tab
```
❌ Remove `actions: read` (not used)
⚠️  Verify if npm audit uploads to GitHub Security

---

#### 10. `terraform-security` (tfsec)
**What it does**:
- Checkout code
- Run tfsec security scan
- **Uploads SARIF** to GitHub Security

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read`, `security-events: write`

**Recommendation**:
```yaml
permissions:
  contents: read
  security-events: write  # ✅ KEEP - uploads SARIF
```
❌ Remove `actions: read` (not used)

---

#### 11. `qlty-check` (Static Analysis)
**What it does**:
- Checkout code
- Run qlty static analysis

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read`, possibly `security-events: write`

**Recommendation**:
```yaml
permissions:
  contents: read
  security-events: write  # Keep if qlty uploads SARIF
```
❌ Remove `actions: read` (not used)
⚠️  Verify if qlty uploads to GitHub Security

---

#### 12. `sbom` (Software Bill of Materials)
**What it does**:
- Checkout code
- Generate SBOM
- **Upload to GitHub Dependency Graph**

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read`, `security-events: write`

**Recommendation**:
```yaml
permissions:
  contents: read
  security-events: write  # ✅ KEEP - uploads to Dependency Graph
```
❌ Remove `actions: read` (not used)

---

#### 13. `container-scan` (Trivy)
**What it does**:
- Checkout code
- Run Trivy container scan
- **Upload SARIF** to GitHub Security

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read`, `security-events: write`

**Recommendation**:
```yaml
permissions:
  contents: read
  security-events: write  # ✅ KEEP - uploads SARIF
```
❌ Remove `actions: read` (not used)

---

#### 14. `pre-commit` (Secret Detection)
**What it does**:
- Checkout code
- Run pre-commit hooks (secret detection)

**Current**: `contents: read`, `security-events: write`, `actions: read`
**Needed**: `contents: read`, possibly `security-events: write`

**Recommendation**:
```yaml
permissions:
  contents: read
  security-events: write  # Keep if uploading findings
```
❌ Remove `actions: read` (not used)
⚠️  Verify if pre-commit uploads to GitHub Security

---

## Implementation Plan

### Phase 1: Remove Unused `actions: read` (Zero Risk)
**Impact**: Removes permission from all 14 jobs that don't use it

```yaml
# Remove from workflow-level
permissions:
  contents: read
  security-events: write
  # actions: read  ← REMOVE THIS
  # pull-requests: write  ← REMOVE THIS
```

**Jobs to update**: All 14 jobs - remove `actions: read` from each `permissions:` block

---

### Phase 2: Remove Unnecessary `security-events: write` (Low Risk)
**Impact**: Removes write permission from 8 jobs that don't upload security results

**Jobs to update**:
1. gateway-lint-test → `contents: read` only
2. flutter-analyze-test → `contents: read` only
3. flutter-build → `contents: read` only
4. terraform-validate → `contents: read` only
5. docker-build → `contents: read` only
6. integration-tests → `contents: read` only
7. e2e-tests → `contents: read` only
8. performance-tests → `contents: read` only

---

### Phase 3: Simplify Workflow-Level (After Job Updates)
**Impact**: Sets secure default for all jobs

```yaml
# New workflow-level permissions
permissions:
  contents: read  # Only permission all jobs need
```

---

### Phase 4: Verify Security Jobs (Monitoring)
**Jobs that should still upload to Security tab**:
- ✅ terraform-security (tfsec SARIF)
- ✅ sbom (Dependency Graph)
- ✅ container-scan (Trivy SARIF)
- ⚠️  security-scan (verify npm audit behavior)
- ⚠️  qlty-check (verify upload behavior)
- ⚠️  pre-commit (verify upload behavior)

**Action**: Monitor GitHub Security tab after changes to confirm uploads still work.

---

## Expected Outcomes

### Security Improvements
✅ **12 security alerts resolved** (missing-workflow-permissions)
✅ **75% reduction** in permissions (4 → 1 default)
✅ **Principle of least privilege** enforced
✅ **Attack surface reduced** - limits damage from compromised workflows

### Risk Assessment
- **Phase 1**: **Zero risk** - removing unused permission
- **Phase 2**: **Very low risk** - removing write from read-only jobs
- **Phase 3**: **Low risk** - simplifying to secure default
- **Phase 4**: **Monitoring only** - verify existing behavior

### Compliance Benefits
- ✅ Aligns with GitHub security best practices
- ✅ Meets NIST least privilege requirements
- ✅ Improves SOC 2 compliance posture
- ✅ Reduces supply chain attack risk

---

## Rollback Plan

If any job breaks after permission changes:

1. **Immediate fix**: Add back specific permission to affected job only
2. **Root cause**: Check job logs for permission errors
3. **Document**: Note which permission was actually needed
4. **Update audit**: Revise recommendation for that job type

---

## Next Steps

**Choose implementation approach**:

**Option A (Recommended)**: Incremental rollout
1. Phase 1 first (remove `actions: read`) - PR #1
2. Monitor for 1 day
3. Phase 2 (remove unnecessary `security-events: write`) - PR #2
4. Monitor for 1 day
5. Phase 3 (simplify workflow-level) - PR #3

**Option B**: All at once
- Single PR with all changes
- Higher risk if something breaks
- Faster resolution of security alerts

**Option C**: Automated with script
- Generate PR automatically
- Review changes before merge
- Can rollback easily

---

**Recommendation**: Proceed with **Option A (Incremental)** for safety.

Ready to implement when you approve!
