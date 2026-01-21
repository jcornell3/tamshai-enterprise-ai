# ADR-006: GCS SPA Routing Limitation - Cloud Run Migration

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-006: GCS SPA Routing Limitation",
  "headline": "Migration from GCS Static Hosting to Cloud Run for SPA Applications",
  "description": "Documents the discovery that GCS cannot handle SPA routing and the decision to use Cloud Run for portal hosting",
  "datePublished": "2026-01-12",
  "dateModified": "2026-01-21",
  "keywords": ["gcs", "google-cloud-storage", "spa", "single-page-application", "cloud-run", "routing", "oauth"],
  "learningResourceType": "failure-analysis",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Google Cloud Storage" },
    { "@type": "SoftwareApplication", "name": "Cloud Run" }
  ],
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>

## Status

**Accepted** (January 2026)

## Context

The GCP production environment initially used Google Cloud Storage (GCS) for static website hosting. The architecture had:

- Marketing site at `/` (index.html)
- Portal SPA at `/app/` (separate index.html)
- OAuth callback redirecting to `/app/callback`

**Problem**: After successful Keycloak authentication, users saw a white screen with 404 errors for all assets.

## Decision

Migrate portal hosting from GCS static website to Cloud Run containerized nginx.

### Root Cause

GCS's `not_found_page` setting is **bucket-level, not directory-level**:

```terraform
# This doesn't work as expected for SPAs in subdirectories
resource "google_storage_bucket" "static_website" {
  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"  # Always returns ROOT index.html
  }
}
```

When a user hits `/app/callback` (which doesn't exist as a file), GCS returns the **root** `/index.html` (marketing site) instead of `/app/index.html` (portal).

### Request Flow (Failing)

| Request | File Exists? | Expected | Actual (GCS) |
|---------|-------------|----------|--------------|
| `/` | Yes | Marketing index.html | ✅ Works |
| `/app/` | Yes | Portal index.html | ❌ Returns marketing |
| `/app/callback` | No | Portal index.html | ❌ Returns marketing |

### Solution: Cloud Run with nginx

```nginx
# nginx.conf for portal
server {
    listen 8080;
    root /usr/share/nginx/html;

    location / {
        try_files $uri $uri/ /index.html;  # SPA routing
    }
}
```

Cloud Run serves the portal with proper SPA routing, while GCS continues to serve the marketing site.

## Alternatives Considered

### Cloud CDN with URL Rewriting

**Rejected because**:
- URL rewrite rules have limited pattern matching
- Cannot differentiate between "file not found" and "SPA route"
- Added complexity without solving root cause

### Firebase Hosting

**Rejected because**:
- Would require migrating from GCS
- Additional service to manage
- Cloud Run already needed for API services

### Single Bucket with Flat Structure

**Rejected because**:
- Marketing and portal have different release cycles
- Asset naming collisions possible
- Doesn't solve OAuth callback routing

## Consequences

### Positive

- **OAuth Works**: `/app/callback` correctly serves portal SPA
- **Proper SPA Routing**: All portal routes handled by nginx try_files
- **Independent Deployments**: Portal can deploy without affecting marketing
- **Container Consistency**: Portal runs same nginx config as dev/stage

### Negative

- **Additional Cost**: Cloud Run instances vs free GCS hosting
- **Cold Starts**: First request may have slight delay
- **Two Hosting Methods**: Marketing on GCS, Portal on Cloud Run

### Architecture Change

```
Before (Broken):
┌─────────────────────────────────────────┐
│          GCS Bucket                      │
│  /index.html (marketing)                 │
│  /app/index.html (portal)                │
│  not_found_page → /index.html (WRONG!)   │
└─────────────────────────────────────────┘

After (Working):
┌─────────────────────┐  ┌─────────────────────┐
│    GCS Bucket       │  │    Cloud Run        │
│  /index.html        │  │  nginx + portal     │
│  (marketing only)   │  │  try_files routing  │
└─────────────────────┘  └─────────────────────┘
         │                        │
         └────────┬───────────────┘
                  │
         Cloud Load Balancer
         /app/* → Cloud Run
         /*     → GCS
```

## References

- `docs/troubleshooting/GCS_SPA_ROUTING_LIMITATION.md` - Full analysis
- `infrastructure/terraform/gcp/main.tf` - Cloud Run portal configuration
- `clients/web/apps/portal/nginx.conf` - nginx SPA routing config

## Related Decisions

- ADR-003: Nginx to Caddy Migration (Caddy handles this correctly in VPS)
- ADR-011: GCP Cost Optimization (Cloud Run adds cost but is necessary)

---

*This ADR is part of the Tamshai Project Journey - documenting when "industry standard" hosting doesn't work for your use case.*
