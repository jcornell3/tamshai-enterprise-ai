# Portal Client Alignment Plan

**Date**: January 11, 2026
**Status**: Analysis Complete - Minor Alignment Required
**Priority**: Medium (Configuration inconsistency)

## Executive Summary

The web portal configuration uses **different OAuth client IDs** across environments. While all environments currently work (verified by E2E tests on stage), the configuration is inconsistent and should be standardized for maintainability.

## Current State Analysis

### Client ID Configuration by Environment

| Environment | Portal Expects | Created By | Result |
|-------------|---------------|------------|--------|
| **Dev** | `mcp-gateway` | Terraform (dev.tfvars) | **WORKS** (but uses wrong client type) |
| **Stage** | `web-portal` | Terraform (applied during rebuild) | **WORKS** (E2E tests pass) |
| **Prod** | `tamshai-web-portal` | Terraform (TF_VAR_*) | **Needs verification** (Terraform creates `web-portal`) |

### Configuration Source Files

| Environment | Portal Config | Client Provisioning | tfvars File |
|-------------|--------------|---------------------|-------------|
| Dev | `.env.example` → `mcp-gateway` | `terraform/keycloak/` with `dev.tfvars` | `keycloak/environments/dev.tfvars` |
| Stage | `cloud-init.yaml` → `web-portal` | `sync-realm.sh stage` | `keycloak/environments/stage.tfvars` (unused) |
| Prod | `.env.production` → `tamshai-web-portal` | `.github/workflows/terraform-keycloak-prod.yml` | **MISSING** (uses defaults) |

### What Each Provisioning Method Creates

**Terraform (`keycloak/main.tf`):**
- `mcp-gateway` (CONFIDENTIAL - for backend services)
- `web-portal` (PUBLIC - for browser SPAs)
- `mcp-hr-service` (CONFIDENTIAL - for identity sync)
- Test users with roles

**sync-realm.sh:**
- `tamshai-website`
- `tamshai-flutter-client`
- `mcp-hr-service`
- Sample app clients (hr-app, finance-app, sales-app, support-app)
- **Does NOT create `mcp-gateway` or `web-portal`!**

## Root Cause

1. **Historical divergence**: Dev started with `mcp-gateway` (predates web-portal client creation)
2. **Stage uses sync-realm.sh**: This script was written for identity sync but never updated to create portal clients
3. **Prod was never properly configured**: The Terraform workflow uses TF_VAR_* env vars with default redirect URIs

## Proposed Solution

### Standard Client ID: `web-portal`

**Rationale:**
- Clearly describes its purpose (web browser portal)
- Already defined in Terraform with proper configuration (PUBLIC client, PKCE, protocol mappers)
- Consistent with other client naming (`tamshai-website`, `tamshai-flutter-client`)

### Implementation Changes

#### 1. Add `web-portal` client to sync-realm.sh

Add after `sync_flutter_client()`:

```bash
sync_web_portal_client() {
    log_info "Syncing web-portal client..."

    local domain
    case "$ENV" in
        dev)   domain="tamshai.local" ;;
        stage) domain="www.tamshai.com" ;;
        prod)  domain="prod.tamshai.com" ;;
        *)     domain="localhost" ;;
    esac

    local client_json="{
        \"clientId\": \"web-portal\",
        \"name\": \"Tamshai Web Portal (SPA)\",
        \"description\": \"Browser-based AI assistant portal\",
        \"enabled\": true,
        \"publicClient\": true,
        \"standardFlowEnabled\": true,
        \"directAccessGrantsEnabled\": false,
        \"serviceAccountsEnabled\": false,
        \"protocol\": \"openid-connect\",
        \"redirectUris\": [
            \"http://localhost:4000/*\",
            \"https://$domain/*\",
            \"https://$domain/app/*\"
        ],
        \"webOrigins\": [
            \"http://localhost:4000\",
            \"https://$domain\"
        ],
        \"attributes\": {
            \"pkce.code.challenge.method\": \"S256\"
        },
        \"defaultClientScopes\": [\"openid\", \"profile\", \"email\", \"roles\"]
    }"

    create_or_update_client "web-portal" "$client_json"
}
```

Update `main()` to call it:
```bash
sync_web_portal_client  # Add after sync_flutter_client
```

#### 2. Update portal .env files

**clients/web/apps/portal/.env.example:**
```env
VITE_KEYCLOAK_CLIENT_ID=web-portal
```

**clients/web/apps/portal/.env.production:**
```env
VITE_KEYCLOAK_CLIENT_ID=web-portal
```

#### 3. Create Keycloak prod.tfvars

**infrastructure/terraform/keycloak/environments/prod.tfvars:**
```hcl
keycloak_url        = "https://keycloak-fn44nd7wba-uc.a.run.app/auth"
keycloak_admin_user = "admin"
# keycloak_admin_password from TF_VAR_* or Secret Manager

realm_name         = "tamshai-corp"
realm_display_name = "Tamshai Corporation - Production"

environment = "prod"
tls_insecure_skip_verify = false

valid_redirect_uris = [
  "https://prod.tamshai.com/*",
  "https://prod.tamshai.com/app/*",
  "https://tamshai.com/*",
  "https://www.tamshai.com/*",
]
```

#### 4. Update terraform-keycloak-prod.yml workflow

Change from env vars to tfvars:
```yaml
- name: Terraform Plan
  working-directory: infrastructure/terraform/keycloak
  env:
    TF_VAR_keycloak_admin_password: ${{ steps.get-password.outputs.password }}
    TF_VAR_test_user_password: ***REDACTED_PASSWORD***
  run: |
    terraform plan -var-file=environments/prod.tfvars -out=tfplan
```

## Environment-Specific Justifications

### Dev Environment
- **Client ID**: `web-portal` (changing from `mcp-gateway`)
- **Justification**: Portal is a PUBLIC browser app, not a CONFIDENTIAL backend service
- **Redirect URIs**: localhost:4000 only

### Stage Environment
- **Client ID**: `web-portal`
- **Provisioning**: sync-realm.sh (maintains independence from Terraform)
- **Justification**: Stage mirrors production but uses VPS infrastructure
- **Redirect URIs**: www.tamshai.com paths

### Prod Environment
- **Client ID**: `web-portal` (changing from `tamshai-web-portal`)
- **Provisioning**: Terraform with prod.tfvars
- **Justification**: GCP production uses Terraform-managed Keycloak
- **Redirect URIs**: prod.tamshai.com, tamshai.com, www.tamshai.com

## Migration Steps

### Step 1: Update sync-realm.sh (Fixes Stage)
1. Add `sync_web_portal_client()` function
2. Call it in `main()`
3. Test locally: `./keycloak/scripts/docker-sync-realm.sh stage tamshai-keycloak`

### Step 2: Re-deploy Stage
1. Push changes to main
2. deploy-vps.yml will run sync-realm.sh automatically
3. Verify: `https://www.tamshai.com/app/` login works

### Step 3: Update Dev Portal Config
1. Change `.env.example` to use `web-portal`
2. Run `terraform apply -var-file=environments/dev.tfvars`
3. Test local portal login

### Step 4: Create Prod tfvars and Update Workflow
1. Create `keycloak/environments/prod.tfvars`
2. Update `terraform-keycloak-prod.yml` to use it
3. Run workflow manually to apply changes
4. Update `.env.production` client ID

## Security Considerations

- **PUBLIC vs CONFIDENTIAL**: `web-portal` is correctly configured as PUBLIC (browser SPAs cannot store secrets)
- **PKCE**: Enabled on all portal clients to prevent authorization code interception
- **Redirect URI Validation**: Each environment has explicit redirect URIs (no wildcards at domain level)
- **Audience Mappers**: web-portal tokens include mcp-gateway audience for API access

## Testing Checklist

- [ ] Dev: Portal login with `web-portal` client works
- [ ] Stage: Portal login after sync-realm.sh update works
- [ ] Prod: Portal login after tfvars update works
- [ ] E2E tests pass on all environments
- [ ] MCP Gateway accepts tokens from web-portal client

## Rollback Plan

If issues arise:
1. **Dev**: Revert .env.example to `mcp-gateway`
2. **Stage**: Remove web-portal from sync-realm.sh, redeploy
3. **Prod**: Delete prod.tfvars, revert workflow changes

## Timeline

| Step | Action | Risk |
|------|--------|------|
| 1 | Update sync-realm.sh | Low (additive change) |
| 2 | Deploy to stage | Medium (affects stage auth) |
| 3 | Update dev config | Low (local only) |
| 4 | Update prod config | High (production auth) |

**Recommendation**: Execute steps 1-2 first, validate stage, then proceed to dev and prod.
