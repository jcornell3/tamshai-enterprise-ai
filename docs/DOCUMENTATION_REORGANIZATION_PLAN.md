# Documentation Reorganization Plan

**Created**: January 3, 2026
**Status**: Proposed
**Author**: Tamshai-Dev

---

## Executive Summary

Analysis of the repository's 145+ markdown files revealed significant organizational issues affecting maintainability and discoverability. This plan proposes moving 40+ files to proper locations based on repository best practices.

**Key Issues Identified:**
- 3 files at root that belong in `docs/` (KEYCLOAK_SETUP.md, QUICKSTART.md, PERMISSIONS_AUDIT.md)
- 11 non-spec files incorrectly placed in `.specify/`
- 16 dated investigation files cluttering `docs/keycloak-findings/`
- Duplicate documentation (KEYCLOAK_SETUP.md in 2+ locations)
- Legacy scaffold directory with redundant docs (confirmed deprecated)

---

## Phase 1: Root Directory Cleanup

**Goal**: Keep only essential community files at root level.

### Files to Move

| File | Current Location | New Location | Reason |
|------|------------------|--------------|--------|
| `KEYCLOAK_SETUP.md` | Root | `docs/deployment/KEYCLOAK_SETUP.md` | Procedural docs belong in docs/ |
| `QUICKSTART.md` | Root | DELETE (duplicate) | Duplicate of `docs/deployment/QUICK_START.md` |
| `PERMISSIONS_AUDIT.md` | Root | `docs/security/audits/2025-12-29-permissions-audit.md` | Security audit belongs in docs/security/ |

### Files to Keep at Root

| File | Reason |
|------|--------|
| `README.md` | Standard project entry point |
| `CHANGELOG.md` | Standard versioning practice |
| `CONTRIBUTING.md` | Community standard |
| `CODE_OF_CONDUCT.md` | Community standard |
| `SECURITY.md` | GitHub security policy standard location |
| `CLAUDE.md` | AI assistant guide for Claude Code |
| `GEMINI.md` | AI assistant guide for Google Gemini (parallel to CLAUDE.md) |
| `DOCUMENTATION_INDEX.md` | Project documentation index |

---

## Phase 2: .specify/ Directory Cleanup

**Goal**: `.specify/` should contain ONLY specifications, templates, and memory files.

### Files to Move Out of .specify/

| File | Current Location | New Location | Reason |
|------|------------------|--------------|--------|
| `CI_TEST_ISSUES_2026-01-01.md` | `.specify/` | `docs/troubleshooting/2026-01-01-ci-test-issues.md` | Investigation notes |
| `V1.4_UPDATE_STATUS.md` | `.specify/` | `docs/status/V1.4_UPDATE_STATUS.md` | Status report |
| `V1.4_IMPLEMENTATION_STATUS.md` | `.specify/` | `docs/status/V1.4_IMPLEMENTATION_STATUS.md` | Status report |
| `V1.4_CONFIRMATION_FLOW_TEST_RESULTS.md` | `.specify/` | `docs/testing/V1.4_CONFIRMATION_FLOW_TEST_RESULTS.md` | Test results |
| `TEST_FIX_PLAN.md` | `.specify/` | `docs/tasks/TEST_FIX_PLAN.md` | Execution plan |
| `SPEC_ALIGNMENT_PLAN.md` | `.specify/` | `docs/tasks/SPEC_ALIGNMENT_PLAN.md` | Analysis/planning |
| `Keycloak-Atomic-Dev.md` | `.specify/` | `docs/tasks/keycloak-atomic-dev.md` | Task planning |
| `Keycloak-Atomic-QA.md` | `.specify/` | `docs/tasks/keycloak-atomic-qa.md` | Task planning |
| `ARCHITECTURE_V1.4_CHANGES.md` | `.specify/` | `docs/architecture/V1.4_CHANGES.md` | Architecture docs |

### Files to Keep in .specify/

| File/Directory | Reason |
|----------------|--------|
| `README.md` | Spec Kit overview |
| `INTEGRATION.md` | Spec Kit integration docs |
| `ARCHITECTURE_SPECS.md` | Master spec document |
| `memory/constitution.md` | Project constitution |
| `templates/*` | Specification templates |
| `specs/001-011/*` | All numbered specifications |

---

## Phase 3: Archive Investigation Files

**Goal**: Move dated debugging/investigation files to archive to declutter active docs.

### Step 1: Create Archive README FIRST

Before moving any files, create `docs/archived/README.md`:

```markdown
# Archived Documentation

This directory contains historical documentation that is no longer actively maintained
but preserved for reference.

## Contents

- `keycloak-debugging-2025-12/` - Investigation files from December 2025 Keycloak integration
- `legacy-scaffold/` - Deprecated tamshai_auth_scaffold documentation

## Note

These files may contain outdated information. For current documentation, see the main `docs/` directory.
```

### Step 2: Create Archive Structure

```
docs/archived/
├── README.md (create first!)
├── keycloak-debugging-2025-12/
│   └── [16 investigation files]
└── legacy-scaffold/
    └── README.md
```

### Files to Archive

Move 16 dated files from `docs/keycloak-findings/` to `docs/archived/keycloak-debugging-2025-12/`:

| File | Size | Date |
|------|------|------|
| `2025-12-30-terraform-deployment-success.md` | 12K | Dec 30 |
| `2025-12-31-401-error-root-cause-analysis.md` | 12K | Dec 31 |
| `2025-12-31-ci-health-check-resolution.md` | 11K | Dec 31 |
| `2025-12-31-ci-improvements-code-review.md` | 17K | Dec 31 |
| `2025-12-31-ci-integration-test-fixes.md` | 16K | Dec 31 |
| `2025-12-31-client-roles-issue.md` | 8.8K | Dec 31 |
| `2025-12-31-client-roles-response.md` | 3.6K | Dec 31 |
| `2025-12-31-final-status.md` | 11K | Dec 31 |
| `2025-12-31-github-security-scanning-discrepancy.md` | 11K | Dec 31 |
| `2025-12-31-integration-test-401-token-acquisition.md` | 9.6K | Dec 31 |
| `2025-12-31-mcp-integration-test-remediation-plan.md` | 29K | Dec 31 |
| `2025-12-31-phase5-remaining-issues.md` | 12K | Dec 31 |
| `2025-12-31-security-remediation-plan.md` | 23K | Dec 31 |
| `2025-12-31-status-update.md` | 6.0K | Dec 31 |
| `2025-12-31-terraform-success-but-401-test-failures.md` | 14K | Dec 31 |
| `ci-401-debug-strategy.md` | 11K | - |

### Files to Keep/Move from docs/keycloak-findings/

| File | Action | Reason |
|------|--------|--------|
| `KEYCLOAK_MANAGEMENT.md` | **MOVE to `docs/operations/`** | Operational guide, not investigation findings |
| `KEYCLOAK_USER_TESTING_METHODOLOGIES.md` | Keep in place | Testing reference still relevant to this directory |

**Note**: After moving KEYCLOAK_MANAGEMENT.md, `docs/keycloak-findings/` can be renamed to `docs/keycloak-investigations/` for clarity, or kept as-is with only testing methodology docs.

---

## Phase 4: Consolidate Duplicate Documentation

**Goal**: Single source of truth for each topic.

### KEYCLOAK_SETUP.md Consolidation

| Location | Action |
|----------|--------|
| Root `KEYCLOAK_SETUP.md` | Move to `docs/deployment/KEYCLOAK_SETUP.md` |
| `tamshai_auth_scaffold/KEYCLOAK_SETUP.md` | DELETE (duplicate) |

### QUICKSTART.md Consolidation

| Location | Action |
|----------|--------|
| Root `QUICKSTART.md` | DELETE |
| `docs/deployment/QUICK_START.md` | Keep as canonical |
| `tamshai_auth_scaffold/QUICKSTART.md` | DELETE (duplicate) |

---

## Phase 5: Consolidate Task/Action-Item Directories

**Goal**: Single location for all task and action-item documents.

### Merge Action Items

| Current Location | Files | Action |
|------------------|-------|--------|
| `docs/action-items/` | 2 files | Move to `docs/tasks/` |
| `docs/tasks/` | 3 files | Keep |

### Files to Move

| File | From | To |
|------|------|-----|
| `terraform-ci-implementation-for-qa.md` | `docs/action-items/` | `docs/tasks/` |
| `terraform-dev-full-stack.md` | `docs/action-items/` | `docs/tasks/` |

### Delete Empty Directory

After moving files, delete `docs/action-items/`.

---

## Phase 6: Handle Legacy Scaffold

**Goal**: Archive deprecated scaffold code documentation.

**Status**: CONFIRMED DEPRECATED by project owner.

The `tamshai_auth_scaffold/` directory contains:
- `README.md` - Archive to `docs/archived/legacy-scaffold/`
- `KEYCLOAK_SETUP.md` - DELETE (duplicate)
- `QUICKSTART.md` - DELETE (duplicate)

### Actions

| File | Action |
|------|--------|
| `tamshai_auth_scaffold/README.md` | Move to `docs/archived/legacy-scaffold/README.md` |
| `tamshai_auth_scaffold/KEYCLOAK_SETUP.md` | DELETE |
| `tamshai_auth_scaffold/QUICKSTART.md` | DELETE |

---

## Phase 7: Create New Directory Structure

### New Directories to Create

```bash
mkdir -p docs/archived/keycloak-debugging-2025-12
mkdir -p docs/status
mkdir -p docs/testing
mkdir -p docs/troubleshooting
mkdir -p docs/security/audits
```

### Directory Purposes

| Directory | Purpose |
|-----------|---------|
| `docs/archived/` | Historical investigation files, deprecated docs |
| `docs/status/` | Project status reports (V1.4 updates, etc.) |
| `docs/testing/` | Test results, test plans |
| `docs/troubleshooting/` | Debugging guides, issue investigations |
| `docs/security/audits/` | Security audit reports |

---

## Implementation Commands

### Phase 1: Root Cleanup

```bash
# Move KEYCLOAK_SETUP.md to docs/deployment/
git mv KEYCLOAK_SETUP.md docs/deployment/KEYCLOAK_SETUP.md

# Delete duplicate QUICKSTART.md
git rm QUICKSTART.md

# Move PERMISSIONS_AUDIT.md to docs/security/audits/
mkdir -p docs/security/audits
git mv PERMISSIONS_AUDIT.md docs/security/audits/2025-12-29-permissions-audit.md

# NOTE: Keep GEMINI.md at root (required for Gemini AI assistant)
```

### Phase 2: .specify/ Cleanup

```bash
# Create new directories
mkdir -p docs/status docs/testing docs/troubleshooting docs/tasks

# Move status reports
git mv .specify/V1.4_UPDATE_STATUS.md docs/status/
git mv .specify/V1.4_IMPLEMENTATION_STATUS.md docs/status/

# Move test results
git mv .specify/V1.4_CONFIRMATION_FLOW_TEST_RESULTS.md docs/testing/

# Move task/planning docs
git mv .specify/TEST_FIX_PLAN.md docs/tasks/
git mv .specify/SPEC_ALIGNMENT_PLAN.md docs/tasks/
git mv .specify/Keycloak-Atomic-Dev.md docs/tasks/keycloak-atomic-dev.md
git mv .specify/Keycloak-Atomic-QA.md docs/tasks/keycloak-atomic-qa.md

# Move architecture docs
git mv .specify/ARCHITECTURE_V1.4_CHANGES.md docs/architecture/V1.4_CHANGES.md

# Move troubleshooting
git mv .specify/CI_TEST_ISSUES_2026-01-01.md docs/troubleshooting/2026-01-01-ci-test-issues.md
```

### Phase 3: Archive Investigation Files

```bash
# Create archive directory
mkdir -p docs/archived/keycloak-debugging-2025-12

# Move all dated investigation files
git mv docs/keycloak-findings/2025-12-30-*.md docs/archived/keycloak-debugging-2025-12/
git mv docs/keycloak-findings/2025-12-31-*.md docs/archived/keycloak-debugging-2025-12/
git mv docs/keycloak-findings/ci-401-debug-strategy.md docs/archived/keycloak-debugging-2025-12/
```

### Phase 4: Consolidate Duplicates

```bash
# Remove duplicate in scaffold
git rm tamshai_auth_scaffold/KEYCLOAK_SETUP.md
git rm tamshai_auth_scaffold/QUICKSTART.md
```

### Phase 5: Merge Action Items

```bash
# Move action items to tasks
git mv docs/action-items/terraform-ci-implementation-for-qa.md docs/tasks/
git mv docs/action-items/terraform-dev-full-stack.md docs/tasks/

# Remove empty directory
rmdir docs/action-items
```

---

## Post-Reorganization Tasks

1. **Create docs/archived/README.md FIRST** - Explain archive purpose before moving files
2. **Update cross-references** - Files like `CI_TEST_ISSUES_2026-01-01.md` reference archived files; add redirect notes
3. **Update DOCUMENTATION_INDEX.md** - Regenerate with new file locations
4. **Update CLAUDE.md** - Fix Key Documentation References section (lines 1010-1050)
5. **Update README.md** - Verify documentation links still work
6. **Search for broken links**:
   ```bash
   grep -r "docs/" --include="*.md" | grep -v node_modules
   grep -r "docs/" .specify/ --include="*.md"  # Also check .specify/
   ```
7. **Archive this plan** - Move to `docs/archived/` after completion

---

## Review Feedback (2026-01-03)

### Addressed Issues

1. **Missing clients/unified_flutter/** - FIXED: Added to DOCUMENTATION_INDEX.md
2. **clients/unified/ deprecation** - FIXED: Marked as deprecated in index

### Open Questions for Tech Writer

| Question | Recommendation | Status |
|----------|---------------|--------|
| Should `docs/keycloak-findings/KEYCLOAK_MANAGEMENT.md` move to `docs/operations/`? | YES - It's operational guidance, not investigation findings | PENDING |
| Historical context notes in active docs pointing to archived investigations? | Add "See also: docs/archived/..." notes where relevant | PENDING |
| Update CLAUDE.md Key Documentation References after reorganization? | YES - Required post-task | PENDING |

### This Plan's Fate

After reorganization is complete, this file (`docs/DOCUMENTATION_REORGANIZATION_PLAN.md`) should be:
- Moved to `docs/archived/2026-01-reorganization-plan.md`
- Or deleted if execution is tracked in Git commits

---

## Summary of Changes

| Action | Count | Size Impact |
|--------|-------|-------------|
| Files moved | 32 | No change |
| Files deleted (duplicates) | 3 | -20K |
| Files archived | 16 | No change |
| New directories created | 6 | - |
| Directories removed | 2 | - |

**Files to Delete:**
1. `QUICKSTART.md` (root) - duplicate
2. `tamshai_auth_scaffold/KEYCLOAK_SETUP.md` - duplicate
3. `tamshai_auth_scaffold/QUICKSTART.md` - duplicate

**Files to Keep (clarified):**
- `GEMINI.md` - Required for Gemini AI assistant

---

## Risk Mitigation

1. **Broken links**: Run link checker before and after
2. **CI/CD references**: Check workflows for hardcoded paths
3. **External documentation**: Check if any external docs reference moved files
4. **Git history**: Use `git mv` to preserve file history

---

## Approval

- [x] Review proposed changes
- [x] Verify scaffold deprecation status (CONFIRMED DEPRECATED)
- [ ] Approve reorganization plan
- [ ] Execute implementation phases
- [ ] Update DOCUMENTATION_INDEX.md
- [ ] Verify no broken links

---

*This plan follows repository best practices from GitHub documentation guidelines and the Node.js, React, and Kubernetes project documentation structures.*
