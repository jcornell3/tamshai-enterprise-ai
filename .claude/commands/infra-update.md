# Infrastructure Update - Terraform & Docker

Update infrastructure-as-code for new services while maintaining environment parity.

## Scope

This skill handles:
- Terraform module updates in `infrastructure/terraform/`
- Docker Compose updates in `infrastructure/docker/`
- Keycloak configuration in `keycloak/`
- Environment variable management

## Environment Parity Requirements

All changes must maintain parity across:
| Environment | Terraform | Docker Compose | Keycloak |
|-------------|-----------|----------------|----------|
| Dev | terraform/dev/ | docker-compose.yml | realm-export-dev.json |
| Stage | terraform/vps/ | docker-compose.yml | realm-export-stage.json |
| Prod | terraform/gcp/ | N/A (GKE) | realm-export.json |

## Adding a New Service

### 1. Docker Compose (Local Dev)
```yaml
# infrastructure/docker/docker-compose.yml
mcp-newservice:
  build:
    context: ../../services/mcp-newservice
  ports:
    - "310X:310X"
  environment:
    - DATABASE_URL=postgresql://...
    - REDIS_URL=redis://redis:6379
  depends_on:
    - postgres
    - redis
  networks:
    - tamshai-network
```

### 2. Terraform (Dev)
```hcl
# infrastructure/terraform/dev/services.tf
module "mcp_newservice" {
  source = "../modules/mcp-service"
  name   = "mcp-newservice"
  port   = 310X
}
```

### 3. Keycloak Client
Update `keycloak/scripts/sync-realm.sh`:
```bash
sync_newservice_client() {
  local client_json='{
    "clientId": "mcp-newservice",
    "name": "MCP NewService",
    "enabled": true,
    ...
  }'
  create_or_update_client "mcp-newservice" "$client_json"
}
```

### 4. MCP Gateway Routing
Update role-to-MCP mapping in `services/mcp-gateway/src/index.ts`.

## Security Checklist

- [ ] Service account has minimal IAM roles
- [ ] Database credentials use Secret Manager (prod) or env vars (dev)
- [ ] Network policies restrict access to required services only
- [ ] RLS policies are applied to new database tables
- [ ] Audit logging is enabled for sensitive operations

## Port Allocation

Check `docs/development/PORT_ALLOCATION.md` for next available port.

Current MCP ports: 3100-3107

## Verification

After infrastructure changes:
1. `terraform validate` - Syntax check
2. `terraform plan` - Preview changes
3. `docker compose config` - Validate compose file
4. Test locally before pushing
