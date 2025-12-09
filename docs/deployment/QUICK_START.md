# Architecture v1.4 - Quick Start Deployment Guide

**Version**: 1.4.0
**Last Updated**: December 8, 2025
**Status**: Ready for Deployment

---

## Prerequisites

Before deploying, ensure you have:

- ✅ Docker Desktop 4.0+ with Docker Compose v2+
- ✅ Node.js 20+ (for local development)
- ✅ 8GB RAM minimum (16GB recommended)
- ✅ 20GB free disk space
- ✅ Claude API Key from [Anthropic Console](https://console.anthropic.com/settings/keys)

---

## Quick Start (5 Minutes)

### 1. Configure Environment

```bash
cd infrastructure/docker

# Copy example environment file
cp .env.example .env

# Edit .env and add your Claude API key
nano .env  # or use your preferred editor
```

**Critical**: Set your `CLAUDE_API_KEY` in the .env file:
```bash
CLAUDE_API_KEY=sk-ant-api03-YOUR_KEY_HERE
```

### 2. Build All Services

```bash
# Build all Docker images (takes 2-3 minutes)
docker compose build

# Verify images were created
docker images | grep docker-mcp
```

Expected output:
```
docker-mcp-finance    latest    ce9ecd4dd662   211MB
docker-mcp-gateway    latest    33ed09036160   264MB
docker-mcp-hr         latest    347daa07485d   247MB
docker-mcp-sales      latest    a8a44dcfe1d7   220MB
docker-mcp-support    latest    7e3e16ab317e   252MB
```

### 3. Start All Services

```bash
# Start all services in detached mode
docker compose up -d

# Wait for services to be healthy (30-60 seconds)
docker compose ps
```

### 4. Verify Health

```bash
# Check all MCP servers
for port in 3100 3101 3102 3103 3104; do
  echo "Checking port $port..."
  curl -s "http://localhost:$port/health" | jq .
done
```

Expected output for each:
```json
{
  "status": "healthy",
  "service": "mcp-<name>",
  "version": "1.4.0",
  "database": "connected",
  "timestamp": "2025-12-08T..."
}
```

---

## Service URLs

After successful startup, access services at:

| Service | URL | Purpose |
|---------|-----|---------|
| **MCP Gateway** | http://localhost:3100 | AI orchestration (SSE streaming) |
| **MCP HR** | http://localhost:3101 | Employee data with RLS |
| **MCP Finance** | http://localhost:3102 | Financial data with RLS |
| **MCP Sales** | http://localhost:3103 | CRM data (MongoDB) |
| **MCP Support** | http://localhost:3104 | Tickets/KB (Elasticsearch) |
| **Keycloak** | http://localhost:8180 | Identity provider |
| **Kong Gateway** | http://localhost:8100 | API gateway |
| **PostgreSQL** | localhost:5433 | Database |
| **MongoDB** | localhost:27018 | Document store |
| **Elasticsearch** | localhost:9201 | Search engine |
| **Redis** | localhost:6380 | Confirmation cache |

---

## Testing v1.4 Features

### Test 1: SSE Streaming

```bash
# Via MCP Gateway (requires authentication token)
curl -N -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3100/api/query?query=list%20all%20employees"
```

Expected: Real-time streaming with `data: {...}\n\n` format and `[DONE]` marker.

### Test 2: Truncation Detection

```bash
# Direct to HR server (bypass auth for testing)
curl -X POST "http://localhost:3101/tools/list_employees" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "limit": 50 },
    "userContext": {
      "userId": "test-user",
      "username": "test",
      "roles": ["hr-read"]
    }
  }' | jq '.metadata'
```

Expected output if >50 employees exist:
```json
{
  "truncated": true,
  "returnedCount": 50,
  "warning": "⚠️ Showing 50 of 50+ employees. Results are incomplete..."
}
```

### Test 3: Confirmation Flow

```bash
# Step 1: Request deletion (returns pending_confirmation)
CONFIRMATION=$(curl -X POST "http://localhost:3101/tools/delete_employee" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "employeeId": "employee-uuid" },
    "userContext": {
      "userId": "test-user",
      "username": "test",
      "roles": ["hr-write"]
    }
  }' | jq -r '.confirmationId')

echo "Confirmation ID: $CONFIRMATION"

# Step 2: Check Redis (confirmation stored with 5-min TTL)
docker compose exec redis redis-cli GET "pending:$CONFIRMATION"

# Step 3: Approve via Gateway (requires auth token)
curl -X POST "http://localhost:3100/api/confirm/$CONFIRMATION" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "approved": true }'
```

### Test 4: LLM-Friendly Errors

```bash
# Try to access non-existent employee
curl -X POST "http://localhost:3101/tools/get_employee" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "employeeId": "00000000-0000-0000-0000-000000000000" },
    "userContext": {
      "userId": "test-user",
      "username": "test",
      "roles": ["hr-read"]
    }
  }' | jq .
```

Expected output:
```json
{
  "status": "error",
  "code": "EMPLOYEE_NOT_FOUND",
  "message": "Employee with ID \"00000000-0000-0000-0000-000000000000\" was not found",
  "suggestedAction": "Please verify the employee ID is correct. You can search for employees using the list_employees tool with filters.",
  "details": {
    "employeeId": "00000000-0000-0000-0000-000000000000"
  }
}
```

---

## Troubleshooting

### Issue: Docker Compose Build Fails

**Symptom**: `ERROR: failed to solve`

**Solution**:
```bash
# Clean up Docker cache
docker system prune -a

# Rebuild from scratch
docker compose build --no-cache
```

### Issue: Services Not Healthy

**Symptom**: `docker compose ps` shows "unhealthy" status

**Solution**:
```bash
# Check logs for specific service
docker compose logs mcp-hr

# Common issues:
# 1. Database not ready yet - wait 30 seconds
# 2. Redis connection failed - check redis service
# 3. Environment variable missing - check .env file
```

### Issue: Claude API Key Error

**Symptom**: `CLAUDE_API_KEY variable is not set`

**Solution**:
```bash
# Verify .env file exists
ls -la infrastructure/docker/.env

# Check if variable is set
grep CLAUDE_API_KEY infrastructure/docker/.env

# Restart services after updating .env
docker compose down
docker compose up -d
```

### Issue: Port Conflicts

**Symptom**: `port is already allocated`

**Solution**:
```bash
# Check what's using the port
lsof -i :3100

# Option 1: Stop the conflicting service
# Option 2: Change port in docker-compose.yml
```

### Issue: Database Connection Errors

**Symptom**: `database connection: FAILED`

**Solution**:
```bash
# Check PostgreSQL logs
docker compose logs postgres

# Verify database is healthy
docker compose exec postgres pg_isready -U tamshai

# Restart database
docker compose restart postgres

# Wait for health check to pass
docker compose ps postgres
```

---

## Stopping Services

### Graceful Shutdown

```bash
# Stop all services (data persists)
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

### Remove Everything

```bash
# Stop services
docker compose down -v

# Remove images
docker rmi $(docker images | grep docker-mcp | awk '{print $3}')

# Clean up system
docker system prune -a
```

---

## Development Workflow

### Local Development (Without Docker)

```bash
# Terminal 1: Start databases
docker compose up -d postgres mongodb elasticsearch redis

# Terminal 2: Run MCP Gateway locally
cd services/mcp-gateway
npm run dev

# Terminal 3: Run MCP HR locally
cd services/mcp-hr
npm run dev

# Repeat for other servers...
```

### Hot Reload in Docker

```bash
# Mount source code as volume (edit docker-compose.yml)
volumes:
  - ../../services/mcp-hr/src:/app/src

# Use tsx watch mode
command: npx tsx watch src/index.ts
```

### Debugging

```bash
# View real-time logs
docker compose logs -f mcp-gateway

# View logs with timestamps
docker compose logs -t mcp-hr

# Filter logs
docker compose logs mcp-finance | grep ERROR

# Execute shell in container
docker compose exec mcp-gateway sh
```

---

## Next Steps

After successful deployment:

1. ✅ **Run Verification Script**
   ```bash
   ./scripts/verify-mcp-servers.sh
   ```

2. ✅ **Configure Keycloak**
   - Access: http://localhost:8180
   - Login: admin/admin
   - Import realm: Already done via realm-export.json
   - Create test users: See test-users.md

3. ✅ **Test Integration**
   - Get JWT token from Keycloak
   - Test Gateway SSE endpoint
   - Verify confirmation flow
   - Check audit logs

4. ✅ **Begin Phase 6: Sample Applications**
   - Web-based query interface
   - Approval Card UI
   - Truncation warning display

---

## Production Deployment

For production deployment to GCP/AWS:

1. **Review Security**:
   - Change all default passwords
   - Use Secret Manager for credentials
   - Enable mTLS between services
   - Configure firewall rules

2. **Scale Services**:
   ```bash
   docker compose up -d --scale mcp-hr=3
   ```

3. **Configure Monitoring**:
   - Prometheus for metrics
   - Grafana for dashboards
   - Loki for log aggregation

4. **Set up CI/CD**:
   - GitHub Actions for builds
   - Automated testing
   - Blue-green deployment

See [Production Deployment Guide](./PRODUCTION.md) for details.

---

## Support & Resources

- **Documentation**: `docs/architecture/V1.4_IMPLEMENTATION_SUMMARY.md`
- **Code Examples**: `docs/development/V1.4_CODE_EXAMPLES.md`
- **Architecture Overview**: `docs/architecture/overview.md`
- **GitHub Issues**: https://github.com/jcornell3/tamshai-enterprise-ai/issues

---

*Last Updated: December 8, 2025*
*Architecture Version: 1.4.0*
*All services operational and ready for deployment ✅*
