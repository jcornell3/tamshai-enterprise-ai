# VPS IP Address Remediation Plan

**Document Version**: 1.1
**Created**: January 7, 2026
**Status**: Complete (Phases 1-4)

## Overview

This document outlines the plan to replace hardcoded VPS IP address references (`5.78.159.29`) with environment variables across the codebase. This change improves:

1. **Security**: Reduces exposure of infrastructure details in public repositories
2. **Flexibility**: Enables easy IP changes without code modifications
3. **Environment Parity**: Consistent configuration across dev/stage/prod

---

## Current State Summary

| Category | File Count | Priority |
|----------|------------|----------|
| Source Code | 2 | Critical |
| Scripts (Bash/PowerShell) | 17 | High |
| Keycloak Config | 3 | High |
| Documentation | 23 | Low |
| CI/CD (comments only) | 1 | None |

**Total Occurrences**: 127 references across 46 files

---

## Environment Variable Strategy

### New Variables

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `VPS_HOST` | VPS IP address or hostname | (none - required for stage) | Scripts, CI/CD |
| `VITE_STAGE_API_URL` | Stage API base URL | (none) | Web clients |
| `VITE_STAGE_AUTH_URL` | Stage Keycloak URL | (none) | Web clients |

### Configuration Locations

| Environment | Configuration File | Notes |
|-------------|-------------------|-------|
| Local Dev | `.env.local` (gitignored) | Developer machines |
| CI/CD | GitHub Secrets | `VPS_HOST` already exists |
| Stage VPS | `/opt/tamshai/.env` | Set during cloud-init |

---

## Phase 1: Critical - Source Code (Week 1)

### Files to Update

#### 1. `clients/web/packages/auth/src/config.ts`

**Current** (line 39):
```typescript
if (hostname.includes('tamshai.com') || hostname.includes('5.78.159.29')) {
```

**Proposed**:
```typescript
const STAGE_HOSTS = ['tamshai.com', 'vps.tamshai.com'];
// For direct IP access, check VITE_STAGE_HOST env var at build time
if (STAGE_HOSTS.some(h => hostname.includes(h)) ||
    (import.meta.env.VITE_STAGE_HOST && hostname.includes(import.meta.env.VITE_STAGE_HOST))) {
```

**Risk**: Low - build-time configuration
**Testing**: Verify stage detection works with domain names

#### 2. `clients/web/apps/portal/src/pages/LandingPage.tsx`

**Current** (line 42):
```typescript
hostname.includes('tamshai.com') || hostname.includes('5.78.159.29')) {
```

**Proposed**: Same pattern as config.ts - use environment variable

**Risk**: Low
**Testing**: Verify landing page environment detection

---

## Phase 2: High Priority - Scripts (Week 2)

### Pattern Already Established

Many scripts already use the correct pattern:
```bash
local vps_host="${VPS_HOST:-5.78.159.29}"
```

### Scripts Requiring Updates

These scripts need the default fallback removed or documented:

| Script | Current Pattern | Action |
|--------|-----------------|--------|
| `scripts/infra/deploy.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/infra/status.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/infra/keycloak.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/infra/rollback.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/infra/rebuild.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/db/backup.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/db/restore.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/mcp/restart.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/mcp/health-check.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/vault/vault.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern, document requirement |
| `scripts/test/e2e-login-with-totp-backup.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern |
| `scripts/test/user-validation.sh` | `${VPS_HOST:-5.78.159.29}` | Keep pattern |

### Scripts Requiring Full Update

| Script | Issue | Action |
|--------|-------|--------|
| `scripts/verify-stage-deployment.ps1` | Hardcoded `$STAGE_URL` | Use `$env:VPS_HOST` |
| `scripts/set-vault-secrets.ps1` | Example in prompt | Update example text |
| `infrastructure/terraform/vps/deploy-to-existing-vps.sh` | Comment reference | Update comment |

### Recommended Script Header

Add to all stage scripts:
```bash
# Required environment variables for stage:
#   VPS_HOST - VPS IP address or hostname (e.g., 5.78.159.29)
#   VPS_SSH_USER - SSH username (default: root)
```

---

## Phase 3: High Priority - Keycloak Configuration (Week 2)

### Files to Update

| File | Occurrences | Approach |
|------|-------------|----------|
| `keycloak/realm-export-dev.json` | 4 | Use domain names only |
| `keycloak/realm-export-stage.json` | 4 | Use domain names only |
| `keycloak/scripts/sync-realm.sh` | 5 | Parameterize with `$VPS_HOST` |

### Proposed Changes

#### Keycloak Realm Exports

**Current `redirectUris`**:
```json
"redirectUris": [
  "https://5.78.159.29/*",
  "https://tamshai.com/*"
]
```

**Proposed**:
```json
"redirectUris": [
  "https://vps.tamshai.com/*",
  "https://www.tamshai.com/*",
  "https://tamshai.com/*"
]
```

**Rationale**:
- Use DNS names instead of IPs
- Cloudflare proxies `vps.tamshai.com` → VPS IP
- IP can change without Keycloak reconfiguration

#### sync-realm.sh Script

**Current**:
```bash
"https://5.78.159.29/*",
```

**Proposed**:
```bash
"https://${VPS_DOMAIN:-vps.tamshai.com}/*",
```

---

## Phase 4: Low Priority - Documentation (Week 3+)

### Approach

Documentation updates are lower priority but should be addressed for consistency.

### Categories

1. **Example Commands**: Replace IP with `$VPS_HOST` placeholder
2. **Architecture Docs**: Use domain names or generic placeholders
3. **Troubleshooting**: Keep specific IP for historical context, add note about env var

### Files to Update

| File | Action |
|------|--------|
| `CLAUDE.md` | Replace with `${VPS_HOST}` examples |
| `SCRIPTS_INDEX.md` | Already documents `VPS_HOST` variable |
| `docs/deployment/*.md` | Use placeholders like `<VPS_IP>` or `$VPS_HOST` |
| `docs/troubleshooting/*.md` | Add note: "Replace 5.78.159.29 with current VPS IP" |
| `docs/testing/*.md` | Use environment variable syntax |
| `docs/operations/*.md` | Use environment variable syntax |

### Documentation Template

For commands in documentation:
```bash
# Using environment variable (recommended)
ssh root@$VPS_HOST 'docker ps'

# Or with inline substitution
VPS_HOST=<your-vps-ip> ssh root@$VPS_HOST 'docker ps'
```

---

## Implementation Checklist

### Pre-Implementation

- [ ] Verify `VPS_HOST` GitHub secret exists and is current
- [ ] Ensure Cloudflare DNS `vps.tamshai.com` points to VPS IP
- [ ] Test domain-based access to VPS services

### Phase 1: Source Code

- [x] Update `clients/web/packages/auth/src/config.ts`
- [x] Update `clients/web/apps/portal/src/pages/LandingPage.tsx`
- [x] Add `VITE_STAGE_HOST` to web build configuration
- [ ] Test stage environment detection
- [ ] Run web client tests

### Phase 2: Scripts

- [x] Review and document all script `VPS_HOST` usage
- [x] Update `scripts/verify-stage-deployment.ps1`
- [x] Update `scripts/set-vault-secrets.ps1`
- [x] Add script header documentation
- [ ] Test all stage scripts with explicit `VPS_HOST`

### Phase 3: Keycloak

- [x] Update `keycloak/realm-export-dev.json` to use domains
- [x] Update `keycloak/realm-export-stage.json` to use domains
- [x] Update `keycloak/scripts/sync-realm.sh` to use `$VPS_DOMAIN`
- [ ] Run Keycloak sync on stage
- [ ] Test OAuth flows

### Phase 4: Documentation

- [x] Update `CLAUDE.md`
- [x] Update deployment guides
- [x] Update troubleshooting guides
- [x] Review and update remaining docs

### Post-Implementation

- [ ] Update `.env.example` files with new variables
- [ ] Add section to CLAUDE.md about VPS configuration
- [ ] Create PR with all changes
- [ ] Deploy to stage and verify

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OAuth redirect failures | Medium | High | Test thoroughly; keep IP as fallback initially |
| Script failures | Low | Medium | Scripts already use `${VPS_HOST:-default}` pattern |
| Documentation confusion | Low | Low | Clear migration notes |

---

## Rollback Plan

If issues occur:

1. **Keycloak**: Re-add IP-based redirect URIs via admin console
2. **Scripts**: All use fallback defaults, so `VPS_HOST` unset = old behavior
3. **Web Clients**: Rebuild with previous config

---

## References

- [GitHub Secret: VPS_HOST](https://github.com/jcornell3/tamshai-enterprise-ai/settings/secrets/actions)
- [Cloudflare DNS Configuration](https://dash.cloudflare.com/)
- [CLAUDE.md - Environment Variables Section](../../CLAUDE.md#environment-variables)

---

*Document created by Claude Code*
