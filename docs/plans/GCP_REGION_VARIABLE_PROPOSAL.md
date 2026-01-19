# GCP_REGION Environment Variable Proposal

## Problem

`us-central1` is hardcoded in 161 locations across the codebase:
- 7 GitHub workflow files
- 12 shell scripts
- 2 Cloud Build YAML files
- 14+ documentation files

This makes region changes difficult and error-prone.

## Proposed Solution

### 1. Create GitHub Variable (Not Secret)

Since the region isn't sensitive, use a **GitHub Repository Variable** instead of a secret:

```bash
# Create repository variable (preferred over secret for non-sensitive config)
gh variable set GCP_REGION --body "us-central1" --repo jcornell3/tamshai-enterprise-ai
```

> **Note**: If GitHub Variables aren't available, use a secret:
> ```bash
> gh secret set GCP_REGION --body "us-central1" --repo jcornell3/tamshai-enterprise-ai
> ```

### 2. Files Requiring Changes

#### GitHub Workflows (7 files)

| File | Current | Proposed |
|------|---------|----------|
| `.github/workflows/deploy-to-gcp.yml` | `GCP_REGION: us-central1` | `GCP_REGION: ${{ vars.GCP_REGION }}` |
| `.github/workflows/export-gcp-secrets.yml` | hardcoded in script | Use `${{ vars.GCP_REGION }}` |
| `.github/workflows/gcloud-create-domain-mapping.yml` | `--region=us-central1` | `--region=${{ vars.GCP_REGION }}` |
| `.github/workflows/provision-prod-data.yml` | `GCP_REGION: us-central1` | `GCP_REGION: ${{ vars.GCP_REGION }}` |
| `.github/workflows/provision-prod-users.yml` | `GCP_REGION: us-central1` | `GCP_REGION: ${{ vars.GCP_REGION }}` |
| `.github/workflows/recreate-realm-prod.yml` | `GCP_REGION: us-central1` | `GCP_REGION: ${{ vars.GCP_REGION }}` |
| `.github/workflows/reset-prod-database.yml` | `GCP_REGION: us-central1` | `GCP_REGION: ${{ vars.GCP_REGION }}` |

**Pattern for workflow env section:**
```yaml
env:
  GCP_REGION: ${{ vars.GCP_REGION }}
  AR_REPO: ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/tamshai
```

#### Shell Scripts (Already Good Pattern - 12 files)

These scripts already use the fallback pattern `${GCP_REGION:-us-central1}`:
- `scripts/gcp/gcp-infra-deploy.sh`
- `scripts/gcp/gcp-infra-teardown.sh`
- `scripts/gcp/lib/dynamic-urls.sh`
- `scripts/gcp/lib/health-checks.sh`
- `scripts/gcp/load-sample-data.sh`
- `scripts/gcp/phoenix-preflight.sh`
- `scripts/gcp/phoenix-rebuild.sh`
- `scripts/gcp/provision-users-job.sh`
- `scripts/gcp/remove-sample-data.sh`
- `scripts/gcp/test-data-access.sh`

**No changes needed** - they will automatically use `GCP_REGION` when set.

However, some have hardcoded values that should be updated:

| File | Line | Current | Proposed |
|------|------|---------|----------|
| `scripts/gcp/phoenix-preflight.sh` | 323 | `local region="us-central1"` | `local region="${GCP_REGION:-us-central1}"` |
| `scripts/gcp/phoenix-rebuild.sh` | 423 | `local region="us-central1"` | `local region="${GCP_REGION:-us-central1}"` |

#### Cloud Build YAML (2 files)

| File | Current | Proposed |
|------|---------|----------|
| `scripts/gcp/cloudbuild-provision-users.yaml` | `_REGION: 'us-central1'` | `_REGION: '${_GCP_REGION}'` (pass as substitution) |
| `scripts/gcp/provision-job/cloudbuild.yaml` | `_REGION: 'us-central1'` | `_REGION: '${_GCP_REGION}'` |

Cloud Build invocation would pass the region:
```bash
gcloud builds submit --substitutions=_GCP_REGION=${GCP_REGION}
```

#### Documentation (14+ files)

Replace hardcoded `us-central1` with `${GCP_REGION}` placeholder in:
- `CLAUDE.md`
- `docs/operations/PHOENIX_*.md`
- `docs/plans/GCP_PROD_*.md`
- `docs/setup/MONGODB_ATLAS_SETUP.md`
- `docs/testing/PROD_TESTING_METHODOLOGY.md`
- `docs/troubleshooting/*.md`
- `scripts/gcp/README.md`

### 3. Implementation Order

1. **Create GitHub variable**
   ```bash
   gh variable set GCP_REGION --body "us-central1"
   ```

2. **Update workflows** (highest impact)
   - Change env declarations to use `${{ vars.GCP_REGION }}`

3. **Update shell scripts** (2 files with hardcoded values)
   - `phoenix-preflight.sh`
   - `phoenix-rebuild.sh`

4. **Update Cloud Build files** (2 files)
   - Add substitution variable pattern

5. **Update documentation** (14+ files)
   - Replace hardcoded values with `${GCP_REGION}` placeholder

### 4. Testing

After implementation:
```bash
# Verify variable is set
gh variable list

# Test deploy workflow
gh workflow run deploy-to-gcp.yml --ref main

# Verify region is used correctly
gh run view --log | grep "region="
```

### 5. Rollback

If issues occur, temporarily revert workflow env to hardcoded:
```yaml
env:
  GCP_REGION: us-central1  # Temporary rollback
```

---

## Summary

| Category | File Count | Changes Required |
|----------|------------|------------------|
| GitHub Workflows | 7 | Change env declaration |
| Shell Scripts | 2 | Fix hardcoded values |
| Cloud Build | 2 | Add substitution pattern |
| Documentation | 14+ | Use placeholder |
| **Total** | **25+** | |

**Estimated Effort**: 1-2 hours

---

*Created: 2026-01-19*
