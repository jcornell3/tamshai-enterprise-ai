# GCS Static Website Hosting - SPA Routing Limitation

**Date**: January 12, 2026
**Status**: Open - Architecture Decision Required
**Severity**: High - Blocks production portal access
**Environments Affected**: GCP Production only (dev/stage work correctly)
**Specialist Review**: Completed by GCP Production Specialist (January 12, 2026)

---

## Executive Summary

The production environment uses Google Cloud Storage (GCS) static website hosting for both the marketing website and the portal application. After successful OAuth login, users are redirected to `/app/callback`, but GCS serves the wrong `index.html` file, causing the portal to fail with 404 errors for all assets.

This is a **fundamental limitation of GCS static website hosting** - it does not support per-directory SPA (Single Page Application) routing. The VPS/stage environment uses Caddy reverse proxy with path-based routing to handle this correctly.

---

## Problem Description

### Symptoms

After successful Keycloak authentication, users see:
- White screen with partial text content
- Browser console shows multiple 404 errors:
  ```
  style.css:1 Failed to load resource: 404
  icon-mission.png:1 Failed to load resource: 404
  icon-solutions.png:1 Failed to load resource: 404
  /app/tamshai-favicon.png:1 Failed to load resource: 404
  ```

### User Journey (Failing)

1. User visits `https://prod.tamshai.com/employee-login.html`
2. Clicks "Sign in with SSO"
3. Redirected to Keycloak (`/auth/realms/tamshai-corp/...`)
4. Enters credentials + TOTP successfully
5. Keycloak redirects to `https://prod.tamshai.com/app/callback?code=...`
6. **FAILURE**: Wrong page served, assets fail to load

---

## Root Cause Analysis

### GCS Static Website Configuration

The GCS bucket `prod.tamshai.com` is configured with:

```terraform
# infrastructure/terraform/modules/storage/main.tf
resource "google_storage_bucket" "static_website" {
  name = "prod.tamshai.com"

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"  # SPA routing
  }
}
```

### How GCS Handles Requests

| Request Path | File Exists? | Expected Response | Actual Response |
|-------------|--------------|-------------------|-----------------|
| `/` | Yes (`/index.html`) | `/index.html` (marketing) | Works correctly |
| `/app/` | Yes (`/app/index.html`) | `/app/index.html` (portal) | **Returns root index.html (marketing)** |
| `/app/callback` | **No** | `not_found_page` → `/index.html` | Returns root index.html (marketing) |

**Observation**: Even `/app/` with trailing slash returns the marketing site's index.html, suggesting GCS may not be respecting `main_page_suffix` for subdirectories, or there's a configuration issue.

**The Problem**: GCS's `not_found_page` is bucket-level, not directory-level. When `/app/callback` doesn't exist as a file, GCS returns the root `/index.html` (marketing site) instead of `/app/index.html` (portal).

### File Structure in GCS Bucket

```
gs://prod.tamshai.com/
├── index.html              ← Marketing site (root)
├── style.css               ← Marketing assets
├── tamshai-favicon.png
├── assets/
│   ├── emblem.png
│   ├── icon-mission.png
│   └── ...
├── employee-login.html
├── app/
│   ├── index.html          ← Portal SPA (should handle /app/*)
│   ├── vite.svg
│   └── assets/
│       ├── index-C-5yRytR.js
│       └── index-CuHCodkk.css
```

### Why Marketing Assets Fail

When GCS serves `/index.html` for the `/app/callback` request:

1. Browser URL is `https://prod.tamshai.com/app/callback`
2. Marketing `index.html` has **relative** asset paths:
   ```html
   <link rel="stylesheet" href="style.css">
   <img src="assets/icon-mission.png">
   ```
3. Browser resolves these relative to current URL:
   - `style.css` → `/app/style.css` (doesn't exist → 404)
   - `assets/icon-mission.png` → `/app/assets/icon-mission.png` (doesn't exist → 404)

### Portal Configuration (Correct)

The portal at `/app/index.html` is correctly configured with **absolute** paths:

```html
<link rel="icon" type="image/svg+xml" href="/app/vite.svg" />
<script type="module" src="/app/assets/index-C-5yRytR.js"></script>
<link rel="stylesheet" href="/app/assets/index-CuHCodkk.css">
```

The portal would work correctly **if GCS served `/app/index.html` for `/app/callback`**.

---

## Environment Comparison

### VPS/Stage Environment (Working)

Uses Caddy reverse proxy with path-based routing:

```caddyfile
# infrastructure/terraform/vps/cloud-init.yaml (lines 186-189)
handle_path /app/* {
  reverse_proxy web-portal:80
}
```

The `web-portal` container runs nginx with SPA routing:

```nginx
# clients/web/apps/portal/nginx.conf
location / {
  try_files $uri $uri/ /index.html;
}
```

**Flow**:
1. Request: `/app/callback`
2. Caddy routes to `web-portal:80`
3. nginx's `try_files` serves `/index.html` (portal's index.html)
4. Portal SPA handles `/callback` route client-side

### GCP Production Environment (Broken)

Uses GCS static website hosting - no reverse proxy, no per-directory routing:

```
Request: /app/callback
  → GCS: File not found
  → GCS: Return not_found_page (bucket-level)
  → Serves: /index.html (root marketing site)
  → Wrong page!
```

---

## Proposed Solutions

### Option 1: Cloud Load Balancer with URL Map (Recommended)

Deploy a Cloud HTTP(S) Load Balancer with URL map for path-based routing:

```
/app/*     → Cloud Run (portal nginx container)
/api/*     → Cloud Run (mcp-gateway)
/auth/*    → Cloud Run (keycloak)
/*         → GCS bucket (marketing site)
```

**Pros**:
- Matches VPS architecture exactly
- Full SPA support per application
- Single domain, clean URLs
- Can add CDN caching

**Cons**:
- Additional cost (~$18/month for load balancer)
- More complex infrastructure
- Requires managed SSL certificate

**Implementation**:
- Create Cloud Run service for portal (nginx + built assets)
- Create URL map with backend services
- Configure managed SSL certificate
- Update Terraform modules

### Option 2: Deploy Portal to Cloud Run

Run the portal as a standalone Cloud Run service:

```
https://portal.tamshai.com/  → Cloud Run (portal)
https://prod.tamshai.com/    → GCS (marketing)
```

**Pros**:
- Simpler than load balancer
- Full SPA routing support
- Independent scaling

**Cons**:
- Different domain for portal (OAuth redirect changes)
- Users see URL change after login
- Additional Cloud Run service cost

**Implementation**:
- Create Dockerfile for portal (already exists at `clients/web/apps/portal/Dockerfile`)
- Deploy to Cloud Run
- Update Keycloak redirect URIs
- Update employee-login.html link

### Option 3: Separate GCS Bucket for Portal

Create a dedicated bucket for the portal:

```
https://portal.tamshai.com/ → GCS bucket (portal)
https://prod.tamshai.com/   → GCS bucket (marketing)
```

**Pros**:
- No additional compute costs
- GCS handles SPA routing within the bucket

**Cons**:
- Requires separate subdomain
- DNS and SSL configuration
- OAuth redirect changes
- Less cohesive user experience

### Option 4: Hash-Based Routing (Workaround)

Change portal to use hash-based routing:

```
Before: /app/callback
After:  /app/#/callback
```

**Pros**:
- No infrastructure changes
- Works with current GCS setup

**Cons**:
- Ugly URLs with `#`
- Not SEO-friendly (not relevant for internal app)
- Requires portal code changes
- Keycloak redirect URI changes
- Non-standard approach

---

## Specialist Review and Recommendation

### GCP Production Specialist Analysis

> **Core Issue**: Google Cloud Storage is a Key-Value store, not a web server. While it has a "Static Website" feature, its routing logic is binary:
>
> 1. Does the object `/app/callback` exist? **No.**
> 2. Serve the configured `NotFoundPage` (Error Document).
>
> Because you have multiple applications (Marketing and Portal) sharing a path structure or bucket, GCS cannot distinguish between a "404 Not Found" on the marketing site and a "Client-side Route" for the SPA. It serves the top-level error page, which breaks the relative paths for CSS/JS, resulting in the "White Screen of Death."

### Specialist Recommendation: Option 1 (Cloud Run + Caddy)

**Strongly recommended** for Phoenix Architecture alignment:

| Factor | Rationale |
|--------|-----------|
| **Process over Hack** | GCS static hosting is a "hacked fix" for a complex multi-app portal. Caddy in Cloud Run is a "Process." |
| **Environment Parity** | Same Caddyfile configuration in Dev, Stage, and Prod |
| **Reprovision Capability** | Fulfills core requirement of "terraform destroy && terraform apply" |
| **Cost Efficiency** | Fits "Scale-to-Zero" model - only pay when browsing |
| **Routing Logic** | Preserves exact `/app/*` → `/app/index.html` rewrite from Stage |

### Implementation Steps (Specialist Guidance)

1. **Create Dockerfile** in `apps/portal/` using `caddy:alpine` base
2. **Copy static assets** into the image
3. **Configure Caddyfile** with SPA routing rules
4. **Deploy to Cloud Run** as a new service
5. **Map routing** via Global Load Balancer: `prod.tamshai.com/app/*` → Cloud Run service

This resolves the 404 asset issue because Caddy will correctly serve `/app/index.html` for any request under `/app/` that doesn't match a physical file.

---

## Original Recommendation (Pre-Review)

**Option 1 (Cloud Load Balancer)** was recommended for production-grade deployment:

1. **Architecture alignment**: Matches VPS/stage architecture
2. **Future-proof**: Can add more apps (`/hr/*`, `/finance/*`, etc.)
3. **Performance**: CDN caching capability
4. **Security**: WAF integration possible
5. **Single domain**: Clean user experience

### Cost Analysis

| Component | Monthly Cost |
|-----------|-------------|
| Cloud Load Balancer | ~$18 |
| Cloud Run (portal) | ~$0-5 (scales to zero) |
| **Total Additional** | ~$18-23/month |

---

## Temporary Mitigation

Until a permanent solution is implemented, users can:

1. **Use VPS/stage**: `https://www.tamshai.com` for full functionality
2. **Use desktop client**: Flutter desktop app doesn't depend on web routing

**Note**: Accessing `https://prod.tamshai.com/app/` directly does NOT work - it also returns a white screen with the marketing site's index.html content. This confirms the GCS routing limitation affects all `/app/*` paths, not just `/app/callback`.

---

## Technical References

### Relevant Files

| File | Purpose |
|------|---------|
| `infrastructure/terraform/modules/storage/main.tf` | GCS bucket configuration |
| `clients/web/apps/portal/vite.config.ts` | Portal base path (`/app/`) |
| `clients/web/apps/portal/nginx.conf` | Portal SPA routing (for Docker) |
| `infrastructure/terraform/vps/cloud-init.yaml` | VPS Caddy configuration |
| `.github/workflows/deploy-to-gcp.yml` | GCP deployment workflow |

### GCS Documentation

- [Hosting a static website on Cloud Storage](https://cloud.google.com/storage/docs/hosting-static-website)
- [Website configuration](https://cloud.google.com/storage/docs/static-website#website-configuration)

### Key Limitation Quote

From GCS documentation:
> "The `notFoundPage` specifies the object to return when a requested object is not found. This is a bucket-level setting."

There is no per-directory or per-path `notFoundPage` configuration in GCS.

---

## Action Items

### If Proceeding with Specialist Recommendation (Cloud Run + Caddy)

1. [ ] **Create Portal Dockerfile**: `clients/web/apps/portal/Dockerfile.prod` using `caddy:alpine`
2. [ ] **Create Portal Caddyfile**: SPA routing configuration matching stage
3. [ ] **Create Terraform Module**: `infrastructure/terraform/modules/portal-cloudrun/`
4. [ ] **Configure Load Balancer**: URL map for `prod.tamshai.com/app/*` → Cloud Run
5. [ ] **Update CI/CD**: Add portal Cloud Run deployment to `deploy-to-gcp.yml`
6. [ ] **Update Keycloak**: Verify redirect URIs work with new routing
7. [ ] **Test E2E**: Verify full OAuth flow works
8. [ ] **Document**: Update architecture docs with new routing

### Alternative: Quick Fix (Hash Routing)

1. [ ] **Modify Portal Router**: Change from BrowserRouter to HashRouter
2. [ ] **Update Keycloak**: Change redirect URI to `https://prod.tamshai.com/app/#/callback`
3. [ ] **Rebuild and Deploy**: Push changes to trigger GCS deployment
4. [ ] **Test E2E**: Verify OAuth flow with hash routing

---

## Appendix: Current OAuth Flow

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐
│ User Browser │     │ prod.tamshai.com    │     │   Keycloak   │
└──────┬───────┘     │ (GCS Bucket)        │     └──────┬───────┘
       │             └──────────┬──────────┘            │
       │                        │                       │
       │  1. GET /employee-login.html                   │
       │ ──────────────────────>│                       │
       │                        │                       │
       │  2. Click "SSO Login"  │                       │
       │ ──────────────────────────────────────────────>│
       │                        │                       │
       │  3. Login + TOTP       │                       │
       │ ──────────────────────────────────────────────>│
       │                        │                       │
       │  4. Redirect to /app/callback?code=xxx         │
       │ <──────────────────────────────────────────────│
       │                        │                       │
       │  5. GET /app/callback  │                       │
       │ ──────────────────────>│                       │
       │                        │                       │
       │  6. GCS returns /index.html (WRONG!)           │
       │ <──────────────────────│                       │
       │                        │                       │
       │  7. Assets fail (404)  │                       │
       │ ──────────────────────>│                       │
       │  ❌ WHITE SCREEN       │                       │
       └───────────────────────────────────────────────┘
```

---

**Document Author**: Claude (Tamshai-Dev)
**Review Status**: Pending third-party review
**Last Updated**: January 12, 2026
