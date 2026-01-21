# ADR-003: Nginx to Caddy Migration

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-003: Nginx to Caddy Migration",
  "headline": "Migration from Nginx to Caddy for VPS Staging Reverse Proxy",
  "description": "Documents the decision to pivot from Nginx to Caddy due to mTLS configuration complexity blocking VPS deployment",
  "datePublished": "2025-12-28",
  "dateModified": "2026-01-21",
  "keywords": ["nginx", "caddy", "reverse-proxy", "mtls", "https", "ssl", "vps", "staging"],
  "learningResourceType": "failure-analysis",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Nginx" },
    { "@type": "SoftwareApplication", "name": "Caddy" }
  ],
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>

## Status

**Accepted** (December 2025)

## Context

The VPS staging environment required a reverse proxy to:

1. Terminate HTTPS traffic from Cloudflare
2. Route requests to internal Docker services (Keycloak, MCP Gateway, web portal)
3. Handle WebSocket upgrades for SSE streaming
4. Provide mTLS for service-to-service communication (originally planned)

Nginx was initially selected as the reverse proxy due to team familiarity and widespread adoption.

## Decision

Pivot from Nginx to Caddy for the VPS staging reverse proxy.

## Problem with Nginx

### mTLS Configuration Complexity

The original architecture called for mTLS (mutual TLS) between services. Configuring Nginx for mTLS proved problematic:

1. **Certificate Generation**: Required manual creation of CA, server, and client certificates
2. **Configuration Verbosity**: Nginx mTLS config required 50+ lines per upstream
3. **Renewal Complexity**: Certificate rotation required coordinated updates across services
4. **Debugging Difficulty**: mTLS failures produced opaque error messages
5. **Time Investment**: Days spent on configuration without successful mTLS

### Specific Issues Encountered

```nginx
# Example of complex Nginx mTLS configuration that was problematic
upstream keycloak {
    server keycloak:8080;
}

server {
    listen 443 ssl;
    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_client_certificate /etc/nginx/certs/ca.crt;
    ssl_verify_client on;
    ssl_verify_depth 2;

    # ... 40+ more lines of configuration
}
```

**Failure Modes**:
- Certificate chain validation failures
- Client certificate not being sent
- Incorrect certificate paths in Docker volumes
- SSL handshake timeouts

## Why Caddy

### Automatic HTTPS

Caddy provides automatic HTTPS with Let's Encrypt, eliminating manual certificate management:

```caddy
# Equivalent Caddy configuration - 10 lines vs 50+
www.tamshai.com {
    reverse_proxy /auth/* keycloak:8080
    reverse_proxy /api/* mcp-gateway:3100
    reverse_proxy /* web-portal:80
}
```

### Key Advantages

| Feature | Nginx | Caddy |
|---------|-------|-------|
| Auto HTTPS | Manual setup | Built-in |
| Config complexity | High | Low |
| Certificate renewal | Manual/certbot | Automatic |
| WebSocket support | Extra config | Automatic |
| Hot reload | Requires signal | Automatic |

### Revised Security Model

Instead of mTLS between services, adopted a defense-in-depth approach:

1. **Network Isolation**: Docker network restricts inter-service communication
2. **Cloudflare Proxy**: External traffic filtered at edge
3. **JWT Validation**: Each service validates tokens independently
4. **Firewall Rules**: VPS firewall limits exposed ports

## Consequences

### Positive

- **Deployment Unblocked**: VPS staging deployed within hours of switching
- **Simpler Configuration**: Caddyfile is ~20 lines vs 200+ for Nginx
- **Automatic Certificates**: No manual Let's Encrypt setup
- **Easier Maintenance**: Configuration changes don't require deep SSL knowledge
- **Better Defaults**: Secure TLS settings out of the box

### Negative

- **Less Community Resources**: Nginx has more Stack Overflow answers
- **Different Syntax**: Team needed to learn Caddyfile format
- **mTLS Deferred**: Service-to-service encryption postponed to production (GCP handles this)

### Trade-offs Accepted

- Accepted that VPS staging would not have mTLS between services
- Relied on network isolation and JWT validation as compensating controls
- Documented security justification in `docs/security/VPS_FIREWALL_JUSTIFICATION.md`

## Timeline

```
Dec 2025 Week 3              Dec 2025 Week 4
       │                            │
   Nginx mTLS                    Caddy
   attempts fail                 deployed
       │                            │
       └── 3+ days                  └── 2 hours
           of debugging                 to working
```

## References

- `docs/archived/keycloak-debugging-2025-12/2025-12-28-caddy-migration.md` - Migration notes
- `docs/troubleshooting/VPS_DATA_AVAILABILITY_ISSUES.md` - Related VPS issues
- `docs/security/VPS_FIREWALL_JUSTIFICATION.md` - Security model documentation
- `infrastructure/cloud-init/cloud-init.yaml` - Caddy configuration in VPS provisioning

## Related Decisions

- ADR-001: Desktop Client Migration (OAuth complexity theme)
- ADR-002: Phoenix Rebuild Evolution (simplified by Caddy in staging)

---

*This ADR is part of the Tamshai Project Journey - sometimes the "industry standard" tool isn't the right choice for your specific context.*
