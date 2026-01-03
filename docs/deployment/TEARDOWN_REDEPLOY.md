# Tear-Down and Redeploy Guide

This document describes how to perform clean tear-downs and redeploys for both development and staging environments.

## Quick Reference

| Environment | Method | Time | Data Loss |
|-------------|--------|------|-----------|
| Dev (Local) | Docker Compose | ~2 min | Yes (volumes removed) |
| Stage (VPS) | GitHub Actions | ~8 min | Yes (fresh deployment) |

---

## Development Environment (Local)

### Prerequisites
- Docker Desktop running
- Terminal in project root

### Tear-Down and Redeploy

```bash
cd infrastructure/docker

# Stop all containers and remove volumes (data loss!)
docker compose down -v

# Redeploy with fresh data
docker compose up -d

# Wait for services (Keycloak takes 60-90 seconds)
sleep 90

# Verify all services are healthy
docker compose ps
```

### Verify Services

```bash
# Run login journey tests
./scripts/test/login-journey.sh dev

# Expected: All 9+ tests pass
```

### What Gets Reset
- PostgreSQL databases (tamshai_hr, tamshai_finance, keycloak)
- MongoDB collections
- Elasticsearch indices
- Redis cache
- Keycloak realm (re-imported from realm-export-dev.json)

### What Persists
- Docker images (not rebuilt unless you add `--build`)
- Code changes (mounted volumes)

---

## Staging Environment (VPS)

### Prerequisites
- GitHub CLI installed (`gh`)
- Repository access with workflow permissions
- Internet connectivity

### Method: GitHub Actions (Recommended)

**DO NOT use SSH directly** - Use GitHub Actions workflows to avoid Git for Windows pop-ups and ensure consistent deployment.

### ⚠️ Critical: SSH Key Update After Terraform Rebuild

**When you run `terraform destroy` followed by `terraform apply`**, a NEW SSH key is generated. The GitHub Actions `VPS_SSH_KEY` secret must be updated or deployments will fail with "Permission denied (publickey)".

```bash
# After terraform apply, update the secret with the new key:
./scripts/secrets/update-github-secrets.sh stage --ssh-key

# Or manually:
# gh secret set VPS_SSH_KEY < infrastructure/terraform/vps/.keys/deploy_key

# Then trigger a deployment:
gh workflow run deploy-vps.yml --ref main
```

For full SSH key documentation, see [STAGE_VPS_DEPLOYMENT_STATUS.md](../deployment/STAGE_VPS_DEPLOYMENT_STATUS.md#step-2-update-github-ssh-secret).

### Full Tear-Down and Redeploy

```bash
# Trigger fresh VPS bootstrap
gh workflow run bootstrap-vps.yml \
  -f environment=staging \
  -f fresh_start=true \
  -f rebuild=true \
  -f pull_latest=true
```

**Parameters:**
| Parameter | Value | Description |
|-----------|-------|-------------|
| `environment` | `staging` | Target environment |
| `fresh_start` | `true` | Stop all containers, prune volumes |
| `rebuild` | `true` | Rebuild Docker images from scratch |
| `pull_latest` | `true` | Pull latest code from main branch |

### Monitor Workflow Progress

```bash
# Watch the workflow run
gh run watch

# Or list recent runs
gh run list --workflow=bootstrap-vps.yml --limit=5

# View specific run details
gh run view <run-id>
```

### Verify Stage Services

```bash
# Quick health checks
curl -sf https://www.tamshai.com/auth/realms/tamshai-corp/.well-known/openid-configuration | head -1
curl -sf https://www.tamshai.com/api/health
curl -sf -o /dev/null -w "%{http_code}" https://www.tamshai.com/

# Run full login journey tests
./scripts/test/login-journey.sh stage
```

### Expected Results

Services should be accessible within 5-8 minutes:
- Website: https://www.tamshai.com/ (200)
- Keycloak: https://www.tamshai.com/auth (OIDC discovery working)
- MCP Gateway: https://www.tamshai.com/api/health (healthy)

---

## Workflow Reference

### bootstrap-vps.yml Options

| Workflow | Trigger | Use Case |
|----------|---------|----------|
| `bootstrap-vps.yml` | Manual (workflow_dispatch) | Fresh deployment, tear-down/redeploy |
| `deploy-vps.yml` | Push to main | Incremental updates |

### Tear-Down Only (No Redeploy)

Not recommended for staging. If needed, use:

```bash
gh workflow run bootstrap-vps.yml \
  -f environment=staging \
  -f fresh_start=true \
  -f rebuild=false \
  -f pull_latest=false
```

This stops containers and prunes volumes but doesn't rebuild.

---

## Troubleshooting

### Stage Services Not Starting

1. **Check workflow status:**
   ```bash
   gh run list --workflow=bootstrap-vps.yml --limit=3
   gh run view <run-id> --log-failed
   ```

2. **Wait longer:** Services may take up to 8 minutes after workflow completes (especially Keycloak migrations)

3. **Re-run workflow:** If services fail, trigger another bootstrap:
   ```bash
   gh workflow run bootstrap-vps.yml -f environment=staging -f fresh_start=true -f rebuild=true
   ```

### Dev Services Not Starting

1. **Check Docker Desktop:** Ensure it's running
2. **Check logs:**
   ```bash
   docker compose logs -f keycloak
   docker compose logs -f mcp-gateway
   ```
3. **Elasticsearch vm.max_map_count:**
   ```bash
   # WSL2
   sudo sysctl -w vm.max_map_count=262144
   ```

### Connection Errors (HTTP 000, Exit Code 7)

These indicate network/DNS issues or services still starting:
- Wait 2-3 minutes and retry
- Check if Cloudflare proxy is enabled
- Verify VPS is reachable: `ping 5.78.159.29`

---

## When to Tear-Down and Redeploy

### Recommended
- After major infrastructure changes (docker-compose.yml, Dockerfile)
- After Keycloak realm configuration changes
- When services are in unknown/corrupted state
- Before major demo or testing sessions

### Not Needed
- Simple code changes (use incremental deploy)
- Configuration changes in .env files
- Adding/updating MCP tools

---

## Related Documentation

- [Keycloak Management](../keycloak-findings/KEYCLOAK_MANAGEMENT.md)
- [Port Allocation](../development/PORT_ALLOCATION.md)
- [CLAUDE.md](../../CLAUDE.md) - Development environment setup

---

*Last Updated: January 2026*
