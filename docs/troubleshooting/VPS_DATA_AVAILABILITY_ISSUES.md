# VPS Data Availability Issues - Troubleshooting Guide

**Document Version**: 1.0
**Created**: January 5, 2026
**Last Updated**: January 5, 2026

This document summarizes the issues encountered with data not being available on the VPS staging environment, the bugs fixed, and diagnostic commands for future troubleshooting.

---

## Current Status (as of January 5, 2026)

| Dashboard | Status | Notes |
|-----------|--------|-------|
| **HR** | ✅ Working | All data displays correctly |
| **Support** | ✅ Working | All data displays correctly |
| **Finance** | ⚠️ Partial | $0 for all summary fields; Recent Invoices and Recent Budget Changes ARE visible |
| **Sales** | ⚠️ Partial | $0 for all summary fields; No pipeline stages listed (Discovery, Qualification, Proposal, Negotiation, Closed Won) |

---

## Issues Identified and Fixed

### 1. MCP Gateway Rate Limiting in Docker Proxy Environment

**Commit**: `e9e0978` - fix(mcp-gateway): Fix rate limiting in Docker proxy environment

**Symptoms**:
- Requests failing with "Too many requests" after just a few API calls
- Dashboard loading partially then stopping
- Intermittent 429 errors in browser console

**Root Cause**:
Without `trust proxy` setting, all requests from Kong/Caddy appeared to come from the same internal Docker network IP (e.g., `172.30.0.1`). This caused Express rate limiter to treat all users as a single client, triggering rate limits after ~100 requests total.

**Fix Applied**:
```typescript
// services/mcp-gateway/src/index.ts
app.set('trust proxy', 1);  // Trust first proxy (Kong/Caddy)

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,  // Increased from 100 to 500 req/min
  keyGenerator: (req) => {
    const userContext = req.userContext;
    return userContext?.userId || req.ip || 'unknown';
  },
});
```

**Rate Limits**:
- General API: 500 requests/minute per user
- AI Query endpoints: 10 requests/minute per user

---

### 2. MCP Gateway Proxy GET Handler Parameter Format Mismatch

**Commit**: `bc3c8ab` - fix(mcp-gateway): Align proxy GET handler with MCP server param format

**Symptoms**:
- GET requests to `/api/mcp/{service}/*` returning empty results
- Finance dashboard showing $0
- Works in local dev but not on VPS

**Root Cause**:
MCP servers were updated (commit `d4ab473`) to read parameters at root level instead of nested under `input`. The MCP Gateway proxy GET handler was still wrapping query params in `input`:

```typescript
// BEFORE (broken)
body: JSON.stringify({ input: req.query })

// AFTER (fixed)
body: JSON.stringify({ ...req.query })
```

Dev environment worked because it had older Docker images from Dec 26. VPS had newer images expecting root-level params.

**Fix Applied**:
- Spread query params at root level in request body
- Updated Finance DashboardPage to use correct `/api/mcp/finance/*` paths

---

### 3. Kong Gateway DNS Caching Causing Connection Refused

**Commit**: `899e250` - fix(kong): Add DNS settings to handle container IP changes

**Symptoms**:
- "Connection refused" errors after service restarts
- Works immediately after full `docker compose down/up`
- Fails after individual container restarts

**Root Cause**:
Kong caches DNS for 4+ days by default. When upstream containers restart (e.g., mcp-gateway after Keycloak restart), Docker assigns new IPs. Kong keeps using old cached IPs, causing connection failures.

This didn't appear in dev because developers typically do full restarts. On VPS, individual service restarts via CI/CD caused stale DNS cache.

**Fix Applied** (docker-compose.yml):
```yaml
kong:
  environment:
    KONG_DNS_STALE_TTL: 0        # Don't use stale DNS entries
    KONG_DNS_VALID_TTL: 10       # Re-resolve DNS every 10 seconds
    KONG_DNS_ERROR_TTL: 1        # Retry DNS errors after 1 second
```

---

### 4. Sales Dashboard Stage Name Mismatch

**Commit**: `0d15c11` - fix(sales): Fix stage mismatch causing 0 results in dashboard

**Symptoms**:
- Sales dashboard showing $0 for all pipeline stages
- No opportunities listed in any stage
- API returns data but frontend displays nothing

**Root Cause**:
Two issues combined:
1. MCP Sales was converting stage to lowercase, but MongoDB stores uppercase
2. Frontend used wrong stage names (`LEAD`/`QUALIFIED`) instead of actual database stages (`DISCOVERY`/`QUALIFICATION`)

**MongoDB Stage Values**:
- `DISCOVERY`
- `QUALIFICATION`
- `PROPOSAL`
- `NEGOTIATION`
- `CLOSED_WON`
- `CLOSED_LOST`

**Fix Applied**:
```typescript
// mcp-sales/src/index.ts - Keep original case
if (stage) filter.stage = stage.toUpperCase();

// Return original case from database
stage: opp.stage,  // Keep UPPERCASE from database
```

```typescript
// DashboardPage.tsx - Use correct stage names
const stages = ['DISCOVERY', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON'];
```

---

## Related Commits

| Commit | Description | Category |
|--------|-------------|----------|
| `e9e0978` | Fix rate limiting in Docker proxy environment | Rate Limiting |
| `bc3c8ab` | Align proxy GET handler with MCP server param format | Data Format |
| `899e250` | Add Kong DNS settings to handle container IP changes | Networking |
| `0d15c11` | Fix sales stage mismatch causing 0 results in dashboard | Data Format |
| `a1188fd` | Correct stage filter assertion to match MongoDB uppercase | Testing |
| `f4a02d7` | Pass STAGE_TESTING_PASSWORD to identity-sync container | Auth |
| `2a3a700` | Correct Keycloak redirect URIs to employee-login.html | Auth |
| `e53eb49` | Add realm-export-stage.json for Phoenix pre-seeded users | Auth |

---

## Diagnostic Commands

### Check Service Health

```bash
# SSH into VPS
ssh root@5.78.159.29

# Check all container status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check MCP Gateway health
curl -s http://localhost:3100/health | jq

# Check Kong Gateway health
curl -s http://localhost:8001/status | jq

# Check Keycloak health
curl -s http://localhost:8080/health/ready
```

### Check MCP Gateway Logs

```bash
# View recent logs
docker logs mcp-gateway --tail 100

# Follow logs in real-time
docker logs -f mcp-gateway

# Search for rate limiting issues
docker logs mcp-gateway 2>&1 | grep -i "rate"

# Search for proxy errors
docker logs mcp-gateway 2>&1 | grep -i "error"
```

### Check Kong Gateway Logs

```bash
# View Kong access logs
docker logs kong --tail 100

# Check for DNS resolution issues
docker logs kong 2>&1 | grep -i "dns"

# Check for upstream connection errors
docker logs kong 2>&1 | grep -i "connection"
```

### Test MCP Proxy Endpoints

```bash
# Get a valid JWT token first
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/tamshai/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=unified-flutter" \
  -d "username=eve.thompson" \
  -d "password=TamshaiTemp123!" \
  -d "grant_type=password" | jq -r '.access_token')

# Test Finance dashboard summary
curl -s "http://localhost:3100/api/mcp/finance/get_dashboard_summary" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test Sales opportunities
curl -s "http://localhost:3100/api/mcp/sales/list_opportunities" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test with stage filter
curl -s "http://localhost:3100/api/mcp/sales/list_opportunities?stage=DISCOVERY" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Check MongoDB Data

```bash
# Connect to MongoDB
docker exec -it mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD"

# Check Sales opportunities
use tamshai_sales
db.opportunities.find().limit(5).pretty()
db.opportunities.distinct("stage")

# Check Finance data
use tamshai_finance
db.invoices.countDocuments()
db.budgets.countDocuments()
```

### Check Rate Limit Status

```bash
# Check current rate limit headers
curl -s -I "http://localhost:3100/api/mcp/hr/list_employees" \
  -H "Authorization: Bearer $TOKEN" | grep -i "ratelimit"

# Expected headers:
# RateLimit-Limit: 500
# RateLimit-Remaining: 499
# RateLimit-Reset: <timestamp>
```

### Restart Services

```bash
# Restart MCP Gateway (preferred - doesn't affect Kong cache)
docker restart mcp-gateway

# If Kong DNS issues suspected, restart Kong
docker restart kong

# Full restart (resets all caches)
cd /opt/tamshai
docker compose down && docker compose up -d
```

---

## Outstanding Issues to Investigate

### Finance Dashboard Shows $0

**Current Behavior**:
- All summary fields show $0 (Total Revenue, Outstanding, etc.)
- Recent Invoices section IS populated
- Recent Budget Changes section IS populated

**Possible Causes**:
1. Aggregation query not matching date ranges
2. Field mapping mismatch in dashboard summary tool
3. Currency/amount field parsing issue

**Next Steps**:
```bash
# Check get_dashboard_summary tool response
curl -s "http://localhost:3100/api/mcp/finance/get_dashboard_summary" \
  -H "Authorization: Bearer $TOKEN" | jq

# Check raw invoice data
docker exec -it mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD" --eval \
  'use tamshai_finance; db.invoices.aggregate([{$group:{_id:null, total:{$sum:"$amount"}}}])'
```

### Sales Dashboard Pipeline Empty

**Current Behavior**:
- All pipeline stage counts show 0
- Total pipeline value shows $0
- Individual opportunity queries may return data

**Possible Causes**:
1. Dashboard using wrong aggregation field names
2. Stage filter case sensitivity issue
3. Date range filter excluding all data

**Next Steps**:
```bash
# Check list_opportunities with no filter
curl -s "http://localhost:3100/api/mcp/sales/list_opportunities" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'

# Check stage distribution in MongoDB
docker exec -it mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD" --eval \
  'use tamshai_sales; db.opportunities.aggregate([{$group:{_id:"$stage", count:{$sum:1}}}])'
```

---

## Prevention Measures

1. **Always test proxy changes on VPS** - Dev and VPS can have different Docker image versions
2. **Use consistent case for enum values** - MongoDB stores what you insert; be explicit about UPPERCASE/lowercase
3. **Configure DNS TTL for containerized gateways** - Kong, Nginx, etc. cache DNS aggressively
4. **Enable trust proxy in reverse proxy setups** - Required for accurate rate limiting and IP logging
5. **Run integration tests against stage** - Local mocks may not catch format mismatches

---

## References

- [MCP Gateway Rate Limiting Configuration](../../services/mcp-gateway/src/index.ts#L318-L350)
- [Kong DNS Configuration](../../docker-compose.yml#L135-L139)
- [Sales Stage Handling](../../services/mcp-sales/src/index.ts#L114-L140)
- [CLAUDE.md Troubleshooting Section](../../CLAUDE.md#troubleshooting)
