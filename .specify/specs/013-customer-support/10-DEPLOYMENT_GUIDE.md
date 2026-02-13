# Customer Support Portal - Deployment Guide

## 1. Overview

This guide covers deployment of the Customer Support Portal across development, staging, and production environments.

## 2. Prerequisites

### 2.1 System Requirements

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 20+
- npm 10+

### 2.2 Environment Access

- Access to Keycloak admin console
- MongoDB credentials
- Redis credentials

## 3. Local Development Setup

### 3.1 Hosts File Configuration

Add the following to your hosts file:

**Windows**: `C:\Windows\System32\drivers\etc\hosts`
**macOS/Linux**: `/etc/hosts`

```
127.0.0.1   customers.tamshai-playground.local
127.0.0.1   www.tamshai-playground.local
```

### 3.2 Start Infrastructure

```bash
# Start base infrastructure (Keycloak, MongoDB, Redis)
cd infrastructure/docker
docker compose up -d keycloak mongodb redis

# Wait for Keycloak to be ready
./scripts/wait-for-keycloak.sh

# Sync customer realm
cd keycloak/scripts
./docker-sync-realm.sh dev tamshai-keycloak --customer-realm
```

### 3.3 Load Sample Data

```bash
# Load customer sample data
cd infrastructure/database/sample-data
mongosh mongodb://localhost:27018/support --file support-customers.js
```

### 3.4 Start Services

**Option A: Docker Compose (Full Stack)**

```bash
cd infrastructure/docker
docker compose up -d web-customer-support mcp-support
```

**Option B: Development Mode (Hot Reload)**

```bash
# Terminal 1: MCP Support
cd services/mcp-support
npm install
npm run dev

# Terminal 2: Customer Portal
cd clients/web/apps/customer-support
npm install
npm run dev
```

### 3.5 Verify Deployment

```bash
# Health checks
curl http://localhost:3104/health        # MCP Support
curl http://localhost:4006               # Customer Portal

# Test login (browser)
open http://localhost:4006
# Login with: jane.smith@acme.com / AcmeLead123!
```

## 4. Service Configuration

### 4.1 Customer Portal Web App

**File**: `clients/web/apps/customer-support/.env`

```bash
# API Configuration
VITE_MCP_GATEWAY_URL=http://localhost:8100
VITE_KEYCLOAK_URL=http://localhost:8180
VITE_KEYCLOAK_REALM=tamshai-customers
VITE_KEYCLOAK_CLIENT_ID=customer-portal

# Feature Flags
VITE_ENABLE_KB_SUGGESTIONS=true
```

**Docker Build**:

```dockerfile
# clients/web/apps/customer-support/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 4.2 MCP Support Extensions

**Environment Variables**:

```bash
# services/mcp-support/.env
PORT=3104
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27018/support
REDIS_URL=redis://localhost:6380

# Keycloak (Dual Realm)
KEYCLOAK_URL=http://localhost:8180
KEYCLOAK_INTERNAL_REALM=tamshai
KEYCLOAK_CUSTOMER_REALM=tamshai-customers

# Elasticsearch (optional, for KB search)
ELASTICSEARCH_URL=http://localhost:9201
```

### 4.3 Docker Compose Service Definition

**File**: `infrastructure/docker/docker-compose.yml` (additions)

```yaml
services:
  # ... existing services ...

  web-customer-support:
    build:
      context: ../../clients/web/apps/customer-support
      dockerfile: Dockerfile
    ports:
      - "4006:80"
    environment:
      - VITE_MCP_GATEWAY_URL=http://kong:8000
      - VITE_KEYCLOAK_URL=http://keycloak:8080
      - VITE_KEYCLOAK_REALM=tamshai-customers
      - VITE_KEYCLOAK_CLIENT_ID=customer-portal
    depends_on:
      - kong
      - keycloak
    networks:
      - tamshai-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.customer-support.rule=Host(`customers.tamshai-playground.local`)"
      - "traefik.http.services.customer-support.loadbalancer.server.port=80"
```

## 5. Keycloak Configuration

### 5.1 Create Customer Realm

**Option A: Import Realm Export**

```bash
# Copy realm export to Keycloak container
docker cp keycloak/realm-export-customers-dev.json tamshai-keycloak:/tmp/

# Import via Keycloak CLI
docker exec -it tamshai-keycloak /opt/keycloak/bin/kc.sh import \
  --file /tmp/realm-export-customers-dev.json
```

**Option B: Run Sync Script**

```bash
cd keycloak/scripts
./docker-sync-realm.sh dev tamshai-keycloak --customer-realm
```

### 5.2 Verify Realm Configuration

```bash
# Get admin token
ADMIN_TOKEN=$(curl -s -X POST \
  "http://localhost:8180/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

# List realms
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:8180/admin/realms" | jq '.[].realm'

# Should show: tamshai, tamshai-customers

# List customer realm clients
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:8180/admin/realms/tamshai-customers/clients" | jq '.[].clientId'
```

### 5.3 Test Customer Login

```bash
# Get customer token
curl -s -X POST \
  "http://localhost:8180/realms/tamshai-customers/protocol/openid-connect/token" \
  -d "client_id=customer-portal" \
  -d "username=jane.smith@acme.com" \
  -d "password=AcmeLead123!" \
  -d "grant_type=password" \
  -d "scope=openid organization"

# Verify organization_id in token
# Decode at https://jwt.io
```

## 6. Database Setup

### 6.1 MongoDB Collections

```javascript
// Connect to MongoDB
mongosh mongodb://localhost:27018/support

// Create indexes
db.organizations.createIndex({ organization_id: 1 }, { unique: true });
db.organizations.createIndex({ domain: 1 });

db.contacts.createIndex({ keycloak_user_id: 1 }, { unique: true });
db.contacts.createIndex({ organization_id: 1 });
db.contacts.createIndex({ email: 1 }, { unique: true });

db.tickets.createIndex({ organization_id: 1, created_at: -1 });
db.tickets.createIndex({ contact_id: 1, created_at: -1 });

db.audit_log.createIndex({ organization_id: 1, timestamp: -1 });
db.audit_log.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
```

### 6.2 Load Sample Data

```bash
# Load sample data script
cd infrastructure/database/sample-data
mongosh mongodb://localhost:27018/support --file support-customers.js
```

## 7. Caddy Configuration (Dev/Stage)

**File**: `infrastructure/caddy/Caddyfile`

```caddyfile
# Customer Portal
customers.tamshai-playground.local {
    reverse_proxy web-customer-support:80
}

# Internal Portal (existing)
www.tamshai-playground.local {
    reverse_proxy portal:80

    # Route to customer portal link
    handle /customer-login {
        redir https://customers.tamshai-playground.local 302
    }
}
```

## 8. Kong Gateway Routes

**File**: Add to `infrastructure/kong/kong.yml`

```yaml
services:
  - name: customer-support
    url: http://mcp-support:3104
    routes:
      - name: customer-api
        paths:
          - /api/customer
        methods:
          - GET
          - POST
          - PUT
          - DELETE
        strip_path: false
```

## 9. Health Checks

### 9.1 Service Health Endpoints

| Service | Endpoint | Expected |
|---------|----------|----------|
| MCP Support | `GET /health` | `{"status":"ok"}` |
| Customer Portal | `GET /` | HTML response |
| Keycloak | `GET /health/ready` | 200 OK |

### 9.2 Health Check Script

```bash
#!/bin/bash
# scripts/health-check-customer.sh

echo "Checking Customer Support services..."

# MCP Support
if curl -sf http://localhost:3104/health > /dev/null; then
  echo "MCP Support:     OK"
else
  echo "MCP Support:     FAILED"
fi

# Customer Portal
if curl -sf http://localhost:4006 > /dev/null; then
  echo "Customer Portal: OK"
else
  echo "Customer Portal: FAILED"
fi

# Keycloak Customer Realm
if curl -sf "http://localhost:8180/realms/tamshai-customers/.well-known/openid-configuration" > /dev/null; then
  echo "Keycloak Realm:  OK"
else
  echo "Keycloak Realm:  FAILED"
fi
```

## 10. Troubleshooting

### 10.1 Common Issues

**Issue**: Keycloak login redirects to wrong realm

**Solution**: Verify `VITE_KEYCLOAK_REALM=tamshai-customers` in customer portal config

---

**Issue**: JWT missing organization_id claim

**Solution**: Ensure `organization` scope is in default client scopes for `customer-portal` client

```bash
# Check client scopes
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:8180/admin/realms/tamshai-customers/clients/{client-uuid}/default-client-scopes"
```

---

**Issue**: 403 Forbidden on customer endpoints

**Solution**: Verify token is from `tamshai-customers` realm, not `tamshai`

```bash
# Check token issuer
echo $TOKEN | cut -d. -f2 | base64 -d | jq '.iss'
# Should contain: /realms/tamshai-customers
```

---

**Issue**: MongoDB connection refused

**Solution**: Ensure MongoDB is running and accessible

```bash
docker compose logs mongodb
mongosh mongodb://localhost:27018 --eval "db.adminCommand('ping')"
```

### 10.2 Debug Logging

Enable debug logging for troubleshooting:

```bash
# MCP Support
export LOG_LEVEL=debug
npm run dev

# View Docker logs
docker compose logs -f mcp-support
docker compose logs -f web-customer-support
```

## 11. Production Checklist

- [ ] Customer realm password policy configured
- [ ] MFA optional setting verified
- [ ] Session timeout configured (4 hours)
- [ ] Rate limiting configured in Kong
- [ ] SSL/TLS certificates configured
- [ ] MongoDB indexes created
- [ ] Audit log retention configured
- [ ] Health check endpoints monitored
- [ ] Error alerting configured
- [ ] Backup procedures verified
