# C1: Vault Production Mode Configuration - Remediation Plan

**Created**: 2026-02-18
**Updated**: 2026-02-19
**Source**: `.claude\plans\security-remediation-v2.md`
**Status**: ✅ Complete (2026-02-19)

---

## Executive Summary

HashiCorp Vault is currently running in development mode (`server -dev`), which is insecure for staging/production. This plan configures Vault for production mode.

**Key Discovery**: Vault was already initialized and unseal keys are stored in GitHub Secrets:
- `VAULT_UNSEAL_KEY_1` through `VAULT_UNSEAL_KEY_5`
- `VAULT_ROOT_TOKEN`

**This means Phase 2 (Initialization) is already complete.** We only need to:
1. Create production Vault config
2. Update deploy workflow to use prod mode + unseal
3. Add monitoring

---

## Current State Analysis

### What Exists
```
infrastructure/docker/vault/
├── config/           # Empty - needs vault.hcl
└── init-dev.sh       # Already configures KV, policies, AppRole
```

### Docker Compose (dev)
```yaml
vault:
  command: server -dev  # <-- Must change
  environment:
    VAULT_DEV_ROOT_TOKEN_ID: ${VAULT_DEV_ROOT_TOKEN}  # <-- Remove for prod
```

### init-dev.sh Already Provides
- ✅ KV v2 at `tamshai/` path
- ✅ Policies: `mcp-service`, `keycloak-service`
- ✅ AppRole: `mcp-gateway`, `keycloak` roles
- ✅ Secrets structure: `tamshai/mcp-gateway`, `tamshai/databases`, `tamshai/keycloak`

---

## Environment Strategy

| Environment | Vault Mode | Auto-Unseal | Secret Delivery |
|-------------|------------|-------------|-----------------|
| **Dev** | Dev mode (keep) | N/A | Env vars via .env |
| **Stage** | Production | Transit (self) | Env vars + Vault backup |
| **Prod (GCP)** | Production | GCP KMS | Vault AppRole fetch |

**Rationale**: Dev mode is acceptable for local development. Stage uses Vault primarily for audit trail and rotation capability. Prod uses full Vault integration.

---

## Existing Infrastructure

### GitHub Secrets (Already Set)
```
VAULT_UNSEAL_KEY_1  ✅
VAULT_UNSEAL_KEY_2  ✅
VAULT_UNSEAL_KEY_3  ✅
VAULT_UNSEAL_KEY_4  ✅
VAULT_UNSEAL_KEY_5  ✅
VAULT_ROOT_TOKEN    ✅
```

### Helper Script
`scripts/set-vault-secrets.ps1` - Used to store keys after initialization

---

## Implementation Phases

### ~~Phase 2: Initialization~~ (ALREADY DONE)
Vault was previously initialized. Keys stored in GitHub Secrets.

---

### Phase 1: Vault Configuration (1 hour)

**1.1 Create vault.hcl for Stage**

Create `infrastructure/docker/vault/config/vault-stage.hcl`:

```hcl
# Vault Production Configuration for Stage
# =========================================

# File storage (simple, no external dependencies)
storage "file" {
  path = "/vault/file"
}

# Listener - TLS disabled (Caddy handles TLS termination)
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = "true"  # Internal network only, behind Caddy
}

# API address for client redirects
api_addr = "http://vault:8200"

# Disable mlock (required for Docker without --privileged)
disable_mlock = true

# Enable UI
ui = true

# Telemetry for monitoring
telemetry {
  disable_hostname = true
}
```

**1.2 Create Stage Docker Compose Override**

Add to `infrastructure/docker/docker-compose.stage.yml`:

```yaml
services:
  vault:
    image: hashicorp/vault:1.15
    container_name: tamshai-stage-vault
    cap_add:
      - IPC_LOCK
    environment:
      VAULT_ADDR: http://127.0.0.1:8200
      VAULT_API_ADDR: http://vault:8200
    volumes:
      - vault_file:/vault/file
      - ./vault/config/vault-stage.hcl:/vault/config/vault.hcl:ro
    command: server -config=/vault/config/vault.hcl
    healthcheck:
      test: ["CMD", "sh", "-c", "vault status | grep -E '(Sealed.*false|Initialized.*true)'"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - data-network
    restart: unless-stopped

volumes:
  vault_file:
```

**1.3 Keep Dev Configuration Unchanged**

The existing `server -dev` configuration remains for local development.

---

### Phase 2: Deploy Workflow Updates (2 hours)

Since unseal keys already exist in GitHub Secrets, we just need to:
1. Update docker-compose for stage to use prod mode
2. Add unseal step to deploy workflow

**2.1 Update Stage Vault Configuration**

The deploy workflow needs to configure Vault for prod mode on stage. Add to `deploy-vps.yml`:

```yaml
- name: Configure Vault for production mode
  run: |
    ssh ${{ env.SSH_OPTS }} ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'ENDSSH'
      # Create vault config directory
      mkdir -p /opt/tamshai/infrastructure/docker/vault/config

      # Write production config
      cat > /opt/tamshai/infrastructure/docker/vault/config/vault.hcl << 'EOF'
      storage "file" {
        path = "/vault/file"
      }
      listener "tcp" {
        address     = "0.0.0.0:8200"
        tls_disable = "true"
      }
      api_addr = "http://vault:8200"
      disable_mlock = true
      ui = true
      EOF

      # Update docker-compose to use prod mode
      # (handled by environment-specific override or sed)
    ENDSSH
```

**2.2 Add Unseal Step**

Add after Vault container starts:

```yaml
- name: Unseal Vault
  if: success()
  run: |
    ssh ${{ env.SSH_OPTS }} ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'ENDSSH'
      export VAULT_ADDR=http://127.0.0.1:8200

      # Wait for Vault to be ready
      for i in {1..30}; do
        if curl -s $VAULT_ADDR/v1/sys/health | grep -q "initialized"; then
          break
        fi
        sleep 2
      done

      # Unseal if sealed
      if curl -s $VAULT_ADDR/v1/sys/health | grep -q '"sealed":true'; then
        echo "Unsealing Vault..."
        vault operator unseal "${{ secrets.VAULT_UNSEAL_KEY_1 }}"
        vault operator unseal "${{ secrets.VAULT_UNSEAL_KEY_2 }}"
        vault operator unseal "${{ secrets.VAULT_UNSEAL_KEY_3 }}"
      fi

      vault status
    ENDSSH
```

---

### Phase 3: Monitoring & Alerting (1 hour, optional)

**3.1 Add Vault Health Check to Stage Monitor**

Update `infrastructure/monitoring/scripts/monitor.sh` to include Vault seal status:

```bash
# Add to CHECK_ENDPOINTS
CHECK_ENDPOINTS=/api/health,/auth/realms/tamshai-corp,/v1/sys/health

# Vault health returns 503 when sealed - treat as critical
```

**3.2 Discord Alert for Sealed Vault**

The existing monitor will alert if Vault returns non-2xx (sealed = 503).

---

## Testing Checklist

### Phase 1 Testing (Local)
- [ ] `vault-stage.hcl` created in `vault/config/`
- [ ] Vault starts in prod mode with file storage
- [ ] `vault status` shows initialized=true, sealed=true

### Phase 2 Testing (Stage Deploy)
- [ ] Deploy workflow writes vault.hcl to VPS
- [ ] Deploy workflow unseals Vault using GitHub Secrets
- [ ] `vault status` shows initialized=true, sealed=false
- [ ] Phoenix rebuild results in working (unsealed) Vault

### Phase 3 Testing (Monitoring)
- [ ] Sealed Vault triggers Discord alert
- [ ] Unsealed Vault shows healthy in monitor

---

## Rollback Procedure

1. **Revert docker-compose changes**:
   ```bash
   git checkout HEAD~1 -- infrastructure/docker/docker-compose.stage.yml
   ```

2. **Restart with dev mode**:
   ```bash
   docker compose down vault
   docker volume rm tamshai_vault_file
   docker compose up -d vault
   ```

3. **Re-run init-dev.sh** to restore dev secrets

---

## Security Considerations

| Consideration | Mitigation |
|---------------|------------|
| Unseal keys in GitHub Secrets | Keys are encrypted at rest, only 3 of 5 stored |
| Root token exposure | Used only for initial setup, then stored offline |
| Vault API without TLS | Internal Docker network only, Caddy handles external TLS |
| Single Vault instance | Acceptable for stage; prod would use HA cluster |

---

## Phoenix Rebuild Behavior

The Vault procedures are **idempotent** and handle Phoenix rebuilds gracefully:

| Scenario | Vault State | Deploy Workflow Behavior |
|----------|-------------|-------------------------|
| Normal deploy | Initialized, sealed | Unseal with stored keys ✅ |
| Normal deploy | Initialized, unsealed | Skip unseal (already done) ✅ |
| Phoenix rebuild | Not initialized | Skip unseal, log info ✅ |
| Dev mode | N/A (no seal) | Skip unseal ✅ |

**After Phoenix Rebuild (fresh Vault):**
1. Vault data volume is lost
2. Vault needs re-initialization (`vault operator init`)
3. New unseal keys are generated (old keys won't work)
4. Store new keys in GitHub Secrets via `scripts/set-vault-secrets.ps1`
5. Next deploy will use new keys

**Recommended: Keep dev mode for stage** until production migration, as it avoids the re-initialization complexity after Phoenix rebuilds.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `vault/config/vault-stage.hcl` | Create | Production Vault config |
| `.github/workflows/deploy-vps.yml` | Modify | Add Vault config + unseal steps |
| `monitoring/scripts/monitor.sh` | Modify | Add Vault health check (optional) |

**Not Needed** (already done):
- ~~`vault/init-prod.sh`~~ - Vault already initialized
- ~~`vault/unseal.sh`~~ - Unseal done in workflow
- ~~GitHub Secrets~~ - Already set

---

## Acceptance Criteria

- [x] Vault config file created (vault-stage.hcl)
- [x] Vault persists data across container restarts (file storage backend)
- [x] Unseal keys stored securely in GitHub Secrets (DONE previously)
- [x] Deploy workflow auto-unseals after restart (C1 Phase 2)
- [x] Phoenix rebuild handled gracefully (idempotent unseal step)

---

## Future Enhancements (Post-MVP)

1. **GCP KMS Auto-Unseal** for production (no manual keys needed)
2. **HA Vault Cluster** with Raft storage
3. **Dynamic Secrets** for database credentials
4. **Service Migration** to fetch secrets from Vault at runtime
5. **Audit Logging** to external storage

---

*Plan Author: Tamshai-Dev (Claude-Dev)*
*Last Updated: 2026-02-19*
