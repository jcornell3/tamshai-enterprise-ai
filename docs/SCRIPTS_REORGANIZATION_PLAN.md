# Scripts Reorganization Plan

**Created**: January 3, 2026
**Status**: Proposed
**Author**: Tamshai-Dev

---

## Executive Summary

Analysis of the repository's 58+ scripts revealed organizational issues affecting maintainability and discoverability. This plan proposes consolidating duplicates, removing deprecated scripts, and addressing hardcoded values.

**Key Issues Identified:**
- 5 duplicate scripts in `.specify/scripts/` (root vs bash/ subdirectory)
- 2 overlapping backup scripts with different features
- 2 deprecated scripts that should be archived or removed
- Hardcoded VPS IP (`$VPS_HOST`) in 6+ scripts
- Inconsistent naming conventions (sh vs ps1 duplicates)
- Missing script for common operations

---

## Phase 1: Consolidate .specify/scripts/ Duplicates

**Goal**: Single authoritative version of each Spec Kit script.

### Issue Analysis

The `.specify/scripts/` directory has overlapping scripts at root level and in `bash/` subdirectory:

| Root Script | bash/ Version | Differences |
|-------------|---------------|-------------|
| `check-prerequisites.sh` (78 lines) | `check-prerequisites.sh` (167 lines) | bash/ has JSON output, more options |
| `common.sh` (42 lines) | `common.sh` (115 lines) | bash/ has more utility functions |
| `create-new-feature.sh` | `create-new-feature.sh` | Similar functionality |
| `setup-plan.sh` | `setup-plan.sh` | Similar functionality |
| `update-claude-md.sh` | `update-agent-context.sh` | Different names, different purposes |

### Recommended Actions

| Script | Action | Reason |
|--------|--------|--------|
| Root `check-prerequisites.sh` | **DELETE** | bash/ version is more comprehensive |
| Root `common.sh` | **DELETE** | bash/ version has more utilities |
| Root `create-new-feature.sh` | **DELETE** | Keep bash/ version as canonical |
| Root `setup-plan.sh` | **DELETE** | Keep bash/ version as canonical |
| Root `update-claude-md.sh` | **KEEP** | Different purpose than update-agent-context.sh |

### Implementation Commands

```bash
# Remove duplicate scripts (keep bash/ versions)
git rm .specify/scripts/check-prerequisites.sh
git rm .specify/scripts/common.sh
git rm .specify/scripts/create-new-feature.sh
git rm .specify/scripts/setup-plan.sh

# Commit
git commit -m "chore: Remove duplicate .specify scripts, keep bash/ versions"
```

### Post-Action: Update References

Check for any references to the deleted scripts:
```bash
grep -r "\.specify/scripts/check-prerequisites" --include="*.md" --include="*.yml" .
grep -r "\.specify/scripts/common.sh" --include="*.sh" .
```

---

## Phase 2: Consolidate Backup Scripts

**Goal**: Single backup script with all features.

### Issue Analysis

Two backup scripts exist with different features:

| Script | Features | Missing |
|--------|----------|---------|
| `scripts/db/backup.sh` | dev/stage support, SSH, PostgreSQL, MongoDB, Redis | Keycloak realm export |
| `scripts/infra/backup.sh` | PostgreSQL, MongoDB, Keycloak realm export | Stage support, Redis |

### Recommended Actions

**Option A (Recommended)**: Merge features into `scripts/db/backup.sh` and deprecate `scripts/infra/backup.sh`

**Option B**: Keep both, document different use cases

### Implementation (Option A)

1. Add Keycloak realm export to `scripts/db/backup.sh`
2. Add deprecation notice to `scripts/infra/backup.sh`
3. Update `CLAUDE.md` to reference only `scripts/db/backup.sh`

```bash
# Add deprecation header to scripts/infra/backup.sh
# (Manual edit required - add DEPRECATED notice)

# Update CLAUDE.md references
# Change: ./scripts/infra/backup.sh → ./scripts/db/backup.sh
```

---

## Phase 3: Archive/Remove Deprecated Scripts

**Goal**: Remove or archive scripts that are no longer used.

### Scripts to Archive

| Script | Status | Action | Reason |
|--------|--------|--------|--------|
| `scripts/setup-dev.sh` | DEPRECATED | Archive | Header says "Use Terraform workflow instead" |
| `clients/unified/scripts/register-protocol-handler.ps1` | DEPRECATED | Delete | clients/unified/ is deprecated |

### Implementation Commands

```bash
# Archive deprecated dev setup script
mkdir -p docs/archived/deprecated-scripts/
git mv scripts/setup-dev.sh docs/archived/deprecated-scripts/

# Delete deprecated protocol handler (parent directory already deprecated)
git rm clients/unified/scripts/register-protocol-handler.ps1

# Commit
git commit -m "chore: Archive deprecated scripts, remove unified client scripts"
```

---

## Phase 4: Extract Hardcoded Values to Configuration

**Goal**: Centralize configuration values for easier maintenance.

### Hardcoded Values Found

| Value | Current Location | Occurrences |
|-------|------------------|-------------|
| VPS IP `$VPS_HOST` | Multiple scripts | 6+ |
| Default ports (3100, 8180, etc.) | Service scripts | 10+ |
| Container names (tamshai-*) | All scripts | 20+ |

### Recommended Solution

Create a shared configuration file:

**New File**: `scripts/config.sh`

```bash
#!/bin/bash
# =============================================================================
# Tamshai Scripts Configuration
# =============================================================================
# Shared configuration for all scripts. Source this file to get common values.

# VPS Configuration
export DEFAULT_VPS_HOST="${VPS_HOST:-$VPS_HOST}"
export DEFAULT_VPS_SSH_USER="${VPS_SSH_USER:-root}"

# Service Ports
export PORT_MCP_GATEWAY=3100
export PORT_MCP_HR=3101
export PORT_MCP_FINANCE=3102
export PORT_MCP_SALES=3103
export PORT_MCP_SUPPORT=3104
export PORT_KEYCLOAK=8180
export PORT_KONG=8100
export PORT_POSTGRES=5433
export PORT_MONGODB=27018
export PORT_REDIS=6380
export PORT_VAULT=8200

# Container Names
export CONTAINER_POSTGRES="tamshai-postgres"
export CONTAINER_MONGODB="tamshai-mongodb"
export CONTAINER_REDIS="tamshai-redis"
export CONTAINER_KEYCLOAK="tamshai-keycloak"
export CONTAINER_VAULT="tamshai-vault"

# Docker Compose Files
export COMPOSE_FILE_DEV="infrastructure/docker/docker-compose.yml"
export COMPOSE_FILE_STAGE="docker-compose.yml"

# Keycloak
export KEYCLOAK_REALM="tamshai-corp"
```

### Implementation Steps

1. Create `scripts/config.sh` with centralized values
2. Update scripts to source `config.sh`
3. Replace hardcoded values with variables

---

## Phase 5: Naming Convention Standardization

**Goal**: Consistent naming across shell and PowerShell scripts.

### Current Issues

| Shell Script | PowerShell Equivalent | Issue |
|--------------|----------------------|-------|
| `scripts/discover-mobile-host.sh` | `scripts/discover-mobile-host.ps1` | OK - same name |
| N/A | `scripts/verify-stage-deployment.ps1` | Missing shell equivalent |
| `scripts/vault-install.sh` | N/A | Missing PowerShell equivalent |

### Recommended Naming Convention

- Shell scripts: `kebab-case.sh`
- PowerShell scripts: `kebab-case.ps1`
- Match names when equivalent functionality exists

### No Action Required

Current naming is reasonably consistent. Document the convention in a README.

---

## Phase 6: Add Missing Scripts

**Goal**: Fill gaps in script coverage.

### Potentially Missing Scripts

| Script | Purpose | Priority |
|--------|---------|----------|
| `scripts/secrets/update-github-secrets.sh` | Automate `gh secret set` after terraform apply | High |
| `scripts/test/run-integration-tests.sh` | Run integration test suite locally | Medium |
| `scripts/infra/destroy.sh` | Completely destroy environment (companion to deploy) | Low |
| `scripts/secrets/rotate-all.sh` | Rotate all secrets in sequence | Low |

### Recommended New Script: update-github-secrets.sh

Given recent SSH key rotation issues, this script would automate GitHub secret updates:

```bash
#!/bin/bash
# Update GitHub secrets from Terraform output or Vault
# Usage: ./update-github-secrets.sh [environment]

# Example implementation:
cd infrastructure/terraform/vps
VPS_SSH_KEY=$(terraform output -raw ssh_private_key)
echo "$VPS_SSH_KEY" | gh secret set VPS_SSH_KEY
echo "Updated VPS_SSH_KEY in GitHub secrets"
```

### No Immediate Action for Low Priority

The High priority script (`update-github-secrets.sh`) should be created. Others are suggestions for future development.

---

## Phase 7: Documentation Updates

**Goal**: Ensure all scripts are documented and referenced correctly.

### Actions Required

1. **Update CLAUDE.md**: Verify all script references are accurate
2. **Add scripts/README.md**: Create overview of script organization, reference `SCRIPTS_INDEX.md` for full catalog
3. **Standardize headers**: Ensure all scripts have consistent documentation headers

### Documentation Header Template

```bash
#!/bin/bash
# =============================================================================
# Script Name and Purpose
# =============================================================================
#
# Brief description of what the script does.
#
# Usage:
#   ./script-name.sh [arguments]
#
# Arguments:
#   arg1    - Description
#   arg2    - Description
#
# Environment Variables:
#   VAR_NAME  - Description (default: value)
#
# Examples:
#   ./script-name.sh dev
#   ./script-name.sh stage --build
#
# Dependencies:
#   - docker
#   - curl
#
# =============================================================================
```

---

## Implementation Priority

| Phase | Priority | Effort | Risk |
|-------|----------|--------|------|
| Phase 1: .specify duplicates | HIGH | Low | Low |
| Phase 2: Backup consolidation | MEDIUM | Medium | Low |
| Phase 3: Archive deprecated | HIGH | Low | Low |
| Phase 4: Hardcoded values | LOW | High | Medium |
| Phase 5: Naming conventions | LOW | Low | Low |
| Phase 6: Missing scripts | LOW | Medium | Low |
| Phase 7: Documentation | MEDIUM | Medium | Low |

**Recommended Order**: Phase 1 → Phase 3 → Phase 7 → Phase 2 → Phase 4

---

## Summary of Changes

| Action | Count | Impact |
|--------|-------|--------|
| Scripts to delete | 5 | Remove duplicates |
| Scripts to archive | 1 | Preserve for reference |
| Scripts to modify | 0 | (Phase 4 optional) |
| New files to create | 2 | config.sh, scripts/README.md |

**Files to Delete:**
1. `.specify/scripts/check-prerequisites.sh` - duplicate of bash/ version
2. `.specify/scripts/common.sh` - duplicate of bash/ version
3. `.specify/scripts/create-new-feature.sh` - duplicate of bash/ version
4. `.specify/scripts/setup-plan.sh` - duplicate of bash/ version
5. `clients/unified/scripts/register-protocol-handler.ps1` - deprecated client

**Files to Archive:**
1. `scripts/setup-dev.sh` → `docs/archived/deprecated-scripts/`

---

## Risk Mitigation

1. **Broken references**: Search for script paths before deletion
2. **CI/CD impact**: Check workflow files for script references
3. **Git history**: Use `git mv` and `git rm` to preserve history

### Pre-Implementation Checklist

```bash
# Search for references to scripts being modified
grep -r "\.specify/scripts/check-prerequisites" --include="*.yml" --include="*.md" .
grep -r "\.specify/scripts/common" --include="*.sh" .
grep -r "setup-dev.sh" --include="*.md" --include="*.yml" .
grep -r "register-protocol-handler.ps1" --include="*.md" .
```

---

## Approval

- [ ] Review proposed changes
- [ ] Verify no CI/CD references to deleted scripts
- [ ] Approve reorganization plan
- [ ] Execute implementation phases
- [ ] Update SCRIPTS_INDEX.md after completion

---

*This plan follows repository best practices for script organization.*
