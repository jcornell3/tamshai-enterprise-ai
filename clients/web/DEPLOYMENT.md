# Web Applications Deployment Guide

## Overview

This document provides instructions for deploying the Tamshai Enterprise AI web applications (Portal, HR, Finance) using Docker and Docker Compose.

## Architecture

All three applications are built with:
- **React 18.2.0** - UI framework
- **Vite 5.4.21** - Build tool and dev server
- **TypeScript 5.3.3** - Type safety
- **Tailwind CSS 3.4.0** - Styling
- **react-oidc-context 3.0.0** - OIDC authentication
- **Nginx Alpine** - Production web server

## Built Images

After running the build process, you should have three Docker images:

| Image | Size | Description |
|-------|------|-------------|
| `tamshai-web-portal:latest` | 81.6 MB | Main launchpad application |
| `tamshai-web-hr:latest` | 81.6 MB | HR employee management app |
| `tamshai-web-finance:latest` | 81.6 MB | Finance budget and invoice app |

## Port Allocation

| Application | Port | URL |
|-------------|------|-----|
| Portal | 4000 | http://localhost:4000 |
| HR | 4001 | http://localhost:4001 |
| Finance | 4002 | http://localhost:4002 |

## Building Images

### From Source (Development)

```bash
cd /home/jcornell/tamshai-enterprise-ai/clients/web

# Build all images
docker build -f apps/portal/Dockerfile -t tamshai-web-portal:latest .
docker build -f apps/hr/Dockerfile -t tamshai-web-hr:latest .
docker build -f apps/finance/Dockerfile -t tamshai-web-finance:latest .
```

### Using Docker Compose

The web applications are integrated into the main docker-compose.yml file:

```bash
cd /home/jcornell/tamshai-enterprise-ai/infrastructure/docker

# Build and start all services (including web apps)
docker compose up -d --build

# Build and start only web apps
docker compose up -d --build web-portal web-hr web-finance

# View logs
docker compose logs -f web-portal
docker compose logs -f web-hr
docker compose logs -f web-finance
```

## Environment Variables

Each application uses the following environment variables (set in docker-compose.yml):

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_KEYCLOAK_URL` | `http://localhost:8180` | Keycloak authentication server |
| `VITE_KEYCLOAK_CLIENT_ID` | `mcp-gateway` | OAuth2/OIDC client ID |
| `VITE_API_GATEWAY_URL` | `http://kong:8000` | Kong API Gateway (internal) |
| `VITE_MCP_GATEWAY_URL` | `http://mcp-gateway:3100` | MCP Gateway (internal) |

**Note**: In development, create a `.env.local` file in each app directory:

```bash
# apps/portal/.env.local
VITE_KEYCLOAK_URL=http://localhost:8180
VITE_KEYCLOAK_CLIENT_ID=mcp-gateway
VITE_API_GATEWAY_URL=http://localhost:8100
VITE_MCP_GATEWAY_URL=http://localhost:3100
```

## Health Checks

Each application exposes a health check endpoint:

```bash
# Check Portal health
curl http://localhost:4000/health
# Expected: healthy

# Check HR health
curl http://localhost:4001/health
# Expected: healthy

# Check Finance health
curl http://localhost:4002/health
# Expected: healthy
```

## Nginx Configuration

Each application uses Nginx with:

### Security Headers
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Compression
- Gzip enabled for text/CSS/JS/JSON/SVG
- Minimum file size: 1024 bytes

### Caching
- HTML: 1 day with `public, immutable`
- Static assets (JS/CSS/images): 1 year with `public, immutable`

### API Proxy
All `/api/*` requests are proxied to Kong Gateway:
- Upstream: `http://kong-gateway:8100`
- WebSocket support enabled
- Proper headers forwarded (`X-Real-IP`, `X-Forwarded-For`, etc.)

## Testing Deployment

### 1. Start All Services

```bash
cd infrastructure/docker
docker compose up -d
```

Wait for all services to be healthy:

```bash
docker compose ps
```

### 2. Access Applications

- **Portal**: http://localhost:4000
- **HR App**: http://localhost:4001
- **Finance App**: http://localhost:4002

### 3. Test Authentication Flow

1. Navigate to any application
2. Click "Sign In"
3. Redirect to Keycloak: http://localhost:8180
4. Login with test user:
   - Username: `alice.chen` (HR Manager)
   - Password: `password123`
   - TOTP: Use secret `JBSWY3DPEHPK3PXP`
5. Redirect back to application
6. Verify authenticated state

### 4. Test API Integration

In the browser console:

```javascript
// Get current user
fetch('http://localhost:8100/api/user', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
})
.then(r => r.json())
.then(console.log);

// Query MCP Gateway (v1.4 SSE)
const eventSource = new EventSource(
  'http://localhost:8100/api/query?q=List all employees',
  { headers: { 'Authorization': `Bearer ${accessToken}` } }
);
eventSource.onmessage = (event) => console.log(event.data);
```

## Troubleshooting

### Issue: Container fails to start

**Check logs**:
```bash
docker compose logs web-portal
docker compose logs web-hr
docker compose logs web-finance
```

**Common causes**:
- Build failed (check Dockerfile)
- Port conflict (check if 4000-4002 are available)
- Nginx configuration error (check nginx.conf syntax)

### Issue: White screen / Failed to fetch

**Check browser console** for errors:
- CORS errors → Update Kong Gateway CORS configuration
- 401 Unauthorized → Keycloak not accessible or token expired
- Network errors → Check if backend services are running

**Verify Kong is running**:
```bash
docker compose ps kong
curl http://localhost:8100/api/health
```

### Issue: Authentication redirects fail

**Check Keycloak configuration**:
```bash
# Check Keycloak is accessible
curl http://localhost:8180/realms/tamshai-corp/.well-known/openid-configuration

# Verify client exists
docker compose exec keycloak sh -c "
  /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master \
    --user admin --password admin
  /opt/keycloak/bin/kcadm.sh get clients -r tamshai-corp --fields clientId
"
```

**Check redirect URIs**:
- Portal should have `http://localhost:4000/*`
- HR should have `http://localhost:4001/*`
- Finance should have `http://localhost:4002/*`

### Issue: SSE streaming doesn't work

**Verify EventSource support**:
```bash
# Test SSE endpoint
curl -N -H "Authorization: Bearer $TOKEN" \
  http://localhost:8100/api/query?q=test
```

**Check Nginx proxy configuration**:
- Ensure `proxy_http_version 1.1` is set
- Ensure `Connection 'upgrade'` header is set
- Ensure no buffering on Nginx

### Issue: Build takes too long

**Optimize build**:
```bash
# Use BuildKit for parallel builds
DOCKER_BUILDKIT=1 docker compose build

# Build with cache
docker compose build --parallel
```

## Production Considerations

### 1. Environment Variables

Do NOT hardcode URLs in production. Use environment variables:

```yaml
# docker-compose.prod.yml
environment:
  VITE_KEYCLOAK_URL: ${KEYCLOAK_URL}
  VITE_API_GATEWAY_URL: ${API_GATEWAY_URL}
```

### 2. TLS/SSL

Enable HTTPS with Let's Encrypt:

```nginx
# Add to nginx.conf
listen 443 ssl http2;
ssl_certificate /etc/letsencrypt/live/portal.tamshai.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/portal.tamshai.com/privkey.pem;
```

### 3. CDN Integration

Use a CDN for static assets:

```nginx
# Add CDN headers
add_header CDN-Cache-Control "public, max-age=31536000, immutable";
```

### 4. Monitoring

Add health check endpoints to monitoring:

```bash
# Prometheus exporter
curl http://localhost:4000/metrics
```

### 5. Logging

Configure centralized logging:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## Architecture v1.4 Features

All web applications implement Architecture v1.4:

### 1. SSE Streaming (Section 6.1)
- EventSource API for real-time responses
- Handles 30-60 second Claude reasoning without timeouts
- Chunk-by-chunk rendering

### 2. Human-in-the-Loop Confirmations (Section 5.6)
- ApprovalCard component for write operations
- 5-minute confirmation timeout
- User approval required before execution

### 3. Truncation Warnings (Section 5.3)
- Yellow banner when results exceed 50 records
- AI-visible warning injection
- User informed of incomplete data

### 4. LLM-Friendly Errors (Section 7.4)
- Structured error responses with `suggestedAction`
- Enables AI self-correction
- User-friendly error messages

## Development vs Production

### Development Mode

```bash
cd clients/web
npm run dev  # Starts Vite dev servers on ports 4000-4002
```

**Features**:
- Hot module replacement
- Source maps enabled
- Console logs visible
- CORS permissive

### Production Mode

```bash
docker compose up -d web-portal web-hr web-finance
```

**Features**:
- Optimized builds with code splitting
- Gzip compression
- Security headers
- Health checks enabled
- API proxy to backend

## Rollback Procedure

If deployment fails:

```bash
# Stop new containers
docker compose stop web-portal web-hr web-finance

# Remove new containers
docker compose rm -f web-portal web-hr web-finance

# Restore previous images
docker tag tamshai-web-portal:backup tamshai-web-portal:latest
docker tag tamshai-web-hr:backup tamshai-web-hr:latest
docker tag tamshai-web-finance:backup tamshai-web-finance:latest

# Restart with previous version
docker compose up -d web-portal web-hr web-finance
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Deploy Web Apps

on:
  push:
    branches: [main]
    paths:
      - 'clients/web/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Portal
        run: docker build -f clients/web/apps/portal/Dockerfile -t tamshai-web-portal:${{ github.sha }} clients/web
      - name: Build HR
        run: docker build -f clients/web/apps/hr/Dockerfile -t tamshai-web-hr:${{ github.sha }} clients/web
      - name: Build Finance
        run: docker build -f clients/web/apps/finance/Dockerfile -t tamshai-web-finance:${{ github.sha }} clients/web
      - name: Push to Registry
        run: |
          docker push tamshai-web-portal:${{ github.sha }}
          docker push tamshai-web-hr:${{ github.sha }}
          docker push tamshai-web-finance:${{ github.sha }}
```

## Support

For issues:
1. Check logs: `docker compose logs -f [service]`
2. Check health: `curl http://localhost:400[0-2]/health`
3. Review [Architecture Overview](../../docs/architecture/overview.md)
4. Check [CLAUDE.md](../../CLAUDE.md) for development patterns

---

**Last Updated**: December 11, 2025
**Architecture Version**: 1.4
**Document Version**: 1.0
