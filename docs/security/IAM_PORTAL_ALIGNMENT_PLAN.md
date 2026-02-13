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
        dev)   domain="tamshai-playground.local" ;;
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

---

## January 12, 2026 Update: SSO Redirect Issue Resolution

### Problem Identified

After successful TOTP authentication, users were being redirected to `prod.tamshai.com/app/callback` instead of `app.tamshai.com/app/callback`, causing a Keycloak error: "Unexpected error when handling authentication request to identity provider."

### Root Cause Analysis

1. **Static Site vs Portal Confusion**: The GCS bucket at `prod.tamshai.com` accidentally had a stale copy of the portal at `/app/`
2. **SSO Button Misconfiguration**: `employee-login.html` linked to `/app/` (relative path) instead of `https://app.tamshai.com` (absolute URL)
3. **OAuth redirect_uri Mismatch**: Portal at `prod.tamshai.com/app/` set `redirect_uri` based on `window.location.origin`, sending callbacks to GCS instead of Cloud Run

### Architecture Clarification

| Component | Domain | Hosting | Purpose |
|-----------|--------|---------|---------|
| Marketing Site | `prod.tamshai.com` | GCS Bucket | Static HTML pages (employee-login.html) |
| Portal SPA | `app.tamshai.com` | Cloud Run | React/Vite application |
| Keycloak | `keycloak-fn44nd7wba-uc.a.run.app` | Cloud Run | Identity provider |

### Changes Made

#### 1. SSO Button URL Fix (`apps/tamshai-website/src/employee-login.html`)
```html
<!-- Before -->
<a href="/app/" id="sso-login-btn" class="sso-btn">

<!-- After -->
<a href="https://app.tamshai.com" id="sso-login-btn" class="sso-btn">
```

#### 2. Workflow Path Trigger Fix (`.github/workflows/deploy-to-gcp.yml`)
```yaml
# Before - apps/** changes didn't trigger deployment
paths:
  - 'services/**'
  - 'clients/web/**'
  - 'keycloak/**'

# After - static site changes now trigger deployment
paths:
  - 'services/**'
  - 'clients/web/**'
  - 'keycloak/**'
  - 'apps/**'
```

Also added `apps/tamshai-website/**` to the `web` filter in `detect-changes` job.

#### 3. Cache-Control Update
```bash
gcloud storage objects update gs://prod.tamshai.com/employee-login.html \
  --cache-control="no-cache,must-revalidate"
```

### Cloudflare Cache Considerations

**Critical Learning**: Cloudflare edge cache must be explicitly purged for single-file changes:

1. "Purge Everything" may not immediately propagate
2. **Use Custom Purge with specific URL**: `https://prod.tamshai.com/employee-login.html`
3. Verify with `curl` before testing in browser

### Verification Steps

1. Verify GCS has correct content:
   ```bash
   gcloud storage cat gs://prod.tamshai.com/employee-login.html | grep sso-login-btn
   # Should show: href="https://app.tamshai.com"
   ```

2. Verify Cloudflare is serving updated content:
   ```bash
   curl -s "https://prod.tamshai.com/employee-login.html" | grep sso-login-btn
   # Should show: href="https://app.tamshai.com"
   ```

3. Manual browser test:
   - Clear cache or use incognito
   - Go to `https://prod.tamshai.com/employee-login.html`
   - Inspect SSO button URL
   - Click and verify redirect to `app.tamshai.com`

### Remaining Issue: Keycloak Callback Error

After TOTP authentication succeeds, some users see:
> "We are sorry... Unexpected error when handling authentication request to identity provider."

**Status**: Under investigation
**Workaround**: Access portal directly at `https://app.tamshai.com/app`

---

## January 12, 2026 Update: 403 API Error Fix

### Problem Identified

After successfully logging in and seeing apps on the portal landing page, eve.thompson was getting 403 Forbidden errors when the apps tried to fetch data from MCP Gateway (e.g., `/api/mcp/finance/list_invoices`).

### Root Cause

The `mcp-gateway-audience` protocol mapper was only being added to the `tamshai-website` client in `sync-realm.sh`, but production uses the `web-portal` client (defined in deploy-to-gcp.yml: `VITE_KEYCLOAK_CLIENT_ID: web-portal`).

Tokens issued by `web-portal` did not include `mcp-gateway` in the audience claim, causing MCP Gateway to reject them with 403.

### Solution

Updated `sync_audience_mapper()` in `keycloak/scripts/sync-realm.sh` to add the audience mapper to ALL web clients:

```bash
# Before: Only added to tamshai-website
sync_audience_mapper() {
    log_info "Syncing mcp-gateway-audience mapper..."
    local client_uuid=$(get_client_uuid "tamshai-website")
    # ... add mapper only to tamshai-website
}

# After: Added to all web clients
sync_audience_mapper() {
    log_info "Syncing mcp-gateway-audience mapper on all web clients..."
    add_audience_mapper_to_client "tamshai-website"
    add_audience_mapper_to_client "web-portal"
    add_audience_mapper_to_client "tamshai-flutter-client"
}
```

### Clients Receiving Audience Mapper

| Client ID | Purpose | Fix Applied |
|-----------|---------|-------------|
| `tamshai-website` | Marketing site SSO | Already had mapper |
| `web-portal` | Production Cloud Run apps | **NEW** - Mapper added |
| `tamshai-flutter-client` | Mobile/desktop Flutter apps | **NEW** - Mapper added |

### Deployment

1. Committed fix to `keycloak/scripts/sync-realm.sh`
2. Push triggered deploy-to-gcp.yml workflow
3. `sync-keycloak-realm` job ran and applied the mappers to production Keycloak

### Verification

After deployment, eve.thompson should be able to:
1. Log in to `app.tamshai.com`
2. Click on any department app (HR, Finance, Sales, Support)
3. See data fetched from MCP Gateway without 403 errors

### Related Files

- `keycloak/scripts/sync-realm.sh` - Fixed sync_audience_mapper function
- `keycloak/realm-export.json` - Already had mapper defined for web-portal (but not applied to live Keycloak)
- `.github/workflows/deploy-to-gcp.yml` - sync-keycloak-realm job runs the fix

---

## January 13, 2026 Update: Multiple 403 Error Causes Identified

After the audience mapper fix, eve.thompson was still seeing 403 errors. Investigation revealed **two additional issues**:

### Issue 1: Broken Client Role Mappers (Keycloak Configuration)

**Problem**: The `web-portal` Keycloak client had two protocol mappers that were created without the required `usermodel.clientRoleMapping.clientId` configuration:

- `client-roles-mapper` - supposed to map web-portal's client roles
- `mcp-gateway-roles-mapper` - supposed to map mcp-gateway's client roles into web-portal tokens

**Root Cause**: Commit `ec878fa` (Jan 1, 2026) created these mappers in Terraform without the required `client_id_for_role_mappings` parameter:

```hcl
# BROKEN - missing client_id_for_role_mappings
resource "keycloak_openid_user_client_role_protocol_mapper" "web_portal_mcp_roles" {
  realm_id  = keycloak_realm.tamshai_corp.id
  client_id = keycloak_openid_client.web_portal.id
  name      = "mcp-gateway-roles-mapper"
  claim_name = "resource_access.mcp-gateway.roles"
  # MISSING: client_id_for_role_mappings = keycloak_openid_client.mcp_gateway.id
}
```

The `terraform-keycloak-prod.yml` workflow applied this broken configuration to production Keycloak on January 11.

**Symptoms**: JWT tokens had empty role claims (`resource_access.mcp-gateway.roles` was undefined), causing MCP Gateway to see "Your roles: None" and return 403.

**Fixes Applied**:

| Fix | Commit | Purpose |
|-----|--------|---------|
| Terraform config | `b1b0d69` | Added `client_id_for_role_mappings` to both mappers |
| Keycloak API | Manual | Immediately updated mappers in production via Admin API |
| sync-realm.sh | `f168c85` | Added `sync_client_role_mappers()` to permanently fix on every sync |

The `sync_client_role_mappers()` function ensures mappers are correctly configured even if Keycloak is reimported or Terraform runs again.

### Issue 2: Cloud Run Service-to-Service Authentication

**Problem**: After fixing the Keycloak mappers, a **different** 403 error appeared - an HTML response from Cloud Run IAM:

```html
<h1>Error: Forbidden</h1>
<h2>Your client does not have permission to get URL <code>/tools/list_employees</code></h2>
```

**Root Cause**: The MCP Gateway was calling Cloud Run services (mcp-hr, mcp-finance, etc.) without including a GCP identity token for service-to-service authentication.

**Request Flow**:
```
Browser → Portal → /api/mcp/hr/list_employees
                           ↓
MCP Gateway → https://mcp-hr-fn44nd7wba-uc.a.run.app/tools/list_employees
                           ↓
Cloud Run IAM → 403 Forbidden (missing identity token)
```

**Key Insight**: This was NOT the same 403 as before:
- Previous 403: JSON from MCP Gateway authorization (`ACCESS_DENIED`, includes roles info)
- New 403: HTML from Cloud Run IAM (`Your client does not have permission`)

**IAM Configuration**:
- The service account `tamshai-prod-mcp-gateway` has `roles/run.invoker` on all MCP services ✅
- But the MCP Gateway code wasn't sending the identity token ❌

**Affected Scope**:
- **Production only** - Dev and stage use Docker Compose where services communicate directly
- **All MCP services** - HR, Finance, Sales, Support all affected equally

**Fix Applied**:

1. Added `google-auth-library` to `services/mcp-gateway/package.json`

2. Created `services/mcp-gateway/src/utils/gcp-auth.ts`:
   - Detects if running on GCP (checks metadata server availability)
   - Fetches identity tokens with proper audience
   - Caches tokens (they expire after 1 hour)
   - Returns null in dev/stage (no-op)

3. Updated `services/mcp-gateway/src/routes/mcp-proxy.routes.ts`:
   ```typescript
   // Get GCP identity token for Cloud Run service-to-service auth
   const identityToken = await getIdentityToken(server.url);

   const mcpResponse = await axios.post(targetUrl, body, {
     headers: {
       'Content-Type': 'application/json',
       // Include GCP identity token if available
       ...(identityToken && { Authorization: `Bearer ${identityToken}` }),
     },
   });
   ```

### Summary of All 403 Error Causes

| Error Type | Source | Symptom | Status |
|------------|--------|---------|--------|
| Missing audience mapper | Keycloak | JSON: `ACCESS_DENIED` from MCP Gateway | ✅ Fixed |
| Broken client role mappers | Keycloak/Terraform | JSON: `Your roles: None` in MCP Gateway response | ✅ Fixed |
| Missing GCP identity token | MCP Gateway code | HTML: Cloud Run IAM 403 Forbidden | ✅ Fixed |

### Key Learnings

1. **Different 403s have different sources** - Always check if the response is JSON (application) or HTML (infrastructure)

2. **Terraform without state is destructive** - The `terraform-keycloak-prod.yml` workflow runs without backend state, causing it to try creating resources that already exist

3. **Cloud Run service-to-service auth is required** - Even with correct IAM permissions, the calling service must include an identity token

4. **sync-realm.sh is the source of truth for production** - Since Terraform can't reliably manage production Keycloak (state issues), sync-realm.sh should handle all critical configuration

---

## January 13, 2026 Update: CI/Terraform Configuration Alignment

### Problem Identified

After fixing Keycloak mappers and GCP identity tokens, users were still getting **401 Unauthorized** errors when the portal tried to access MCP Gateway. The JWT tokens were being rejected due to an **issuer mismatch**.

### Root Cause: Two Sources of Truth Out of Sync

The production environment had **two different deployment configurations** that were using different Keycloak URLs:

| Configuration Source | Keycloak URLs Used |
|---------------------|-------------------|
| **Terraform** (`infrastructure/terraform/modules/cloudrun/main.tf`) | `https://auth.tamshai.com/...` |
| **CI Workflow** (`.github/workflows/deploy-to-gcp.yml`) | `https://keycloak-fn44nd7wba-uc.a.run.app/...` |

**How the mismatch occurred:**

1. Terraform was updated to use the custom domain `auth.tamshai.com` for `KEYCLOAK_ISSUER`
2. Running `terraform apply` deployed MCP Gateway with the new issuer URL
3. The CI workflow was still building `web-portal` with `VITE_KEYCLOAK_URL` pointing to the Cloud Run URL
4. Users authenticated via Cloud Run URL → JWT tokens had `iss: https://keycloak-fn44nd7wba-uc.a.run.app/...`
5. MCP Gateway validated against `https://auth.tamshai.com/...` → issuer didn't match → **401 Unauthorized**

### JWT Issuer Claim Explained

When a user authenticates, Keycloak issues a JWT token with an `iss` (issuer) claim that matches the URL the user authenticated against:

```json
{
  "iss": "https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp",
  "sub": "user-uuid",
  "aud": ["mcp-gateway"],
  ...
}
```

The MCP Gateway validates tokens by checking that `iss` matches its configured `KEYCLOAK_ISSUER`. If they don't match, the token is rejected.

### Hardcoded URLs in deploy-to-gcp.yml (Before Fix)

The CI workflow had Cloud Run URLs hardcoded in multiple places:

```yaml
# Line 110 - MCP Gateway deployment
KEYCLOAK_ISSUER=https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp

# Line 216 - Keycloak deployment
KC_HOSTNAME=https://keycloak-fn44nd7wba-uc.a.run.app/auth

# Line 341 - Web Portal build
VITE_KEYCLOAK_URL: https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp

# Lines 238, 247 - Health checks
curl -sf "https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/..."
```

### Solution: Standardize on auth.tamshai.com

Updated `.github/workflows/deploy-to-gcp.yml` to use the custom domain consistently:

| Location | Before | After |
|----------|--------|-------|
| deploy-gateway `KEYCLOAK_URL` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-gateway `KEYCLOAK_ISSUER` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-gateway `JWKS_URI` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-keycloak `KC_HOSTNAME` | `https://keycloak-fn44nd7wba-uc.a.run.app/auth` | `auth.tamshai.com` |
| sync-keycloak-realm `KEYCLOAK_URL` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| sync-keycloak-realm health checks | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-web-portal `VITE_KEYCLOAK_URL` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-web-portal `--memory` | `256Mi` | `512Mi` (gen2 requirement) |

### Domain Mapping Configuration

The custom domain `auth.tamshai.com` was already configured via:

1. **DNS**: CNAME record pointing to `ghs.googlehosted.com` (Google Cloud Run hosting)
2. **Cloud Run Domain Mapping**: Terraform resource `google_cloud_run_domain_mapping.keycloak`
3. **SSL Certificate**: Automatically provisioned by Google

No DNS changes were required for this fix.

### Commit Reference

- **Commit**: `9a19af8` - `fix(ci): Use auth.tamshai.com consistently for Keycloak URLs`

### Key Learnings

1. **Keep CI and Terraform in sync** - Both deployment paths must use the same configuration values

2. **Custom domains require consistency** - If using a custom domain in Terraform, the CI workflow must also use it

3. **JWT issuer validation is strict** - The URL must match exactly, including protocol and path

4. **Build-time vs runtime configuration** - `VITE_*` variables are baked into the build; changing them requires rebuilding the image
