# Keycloak 23.0 Deep Dive - Lessons Learned

## Executive Summary

During integration test implementation, we discovered critical differences in Keycloak 23.0's `start-dev` mode that required programmatic realm setup instead of realm import.

**Key Findings**:
1. Health endpoints (`/health/ready`) are unreliable in `start-dev` mode
2. Admin console is the most reliable readiness indicator
3. Realm import has compatibility issues with authentication flows
4. Admin API is the recommended approach for CI/test environments

---

## Issue 1: Health Endpoint Behavior

### Investigation Results

| Endpoint | start-dev Mode | start Mode (Production) |
|----------|----------------|-------------------------|
| `/health` | ❌ Not responding | ✅ Responds immediately |
| `/health/ready` | ❌ Delayed/unreliable | ✅ Responds after ~30s |
| `/health/live` | ❌ Delayed/unreliable | ✅ Responds after ~30s |
| Admin console (`/`) | ✅ First to respond | ✅ Responds after ~20s |

**Timeline** (start-dev mode):
- 0s - Keycloak process starts
- 10s - Admin console begins responding
- 15s - Realm endpoints accessible (/realms/master)
- 30s+ - Health endpoints may respond (inconsistent)

**Root Cause**:
- `start-dev` mode prioritizes developer convenience over production-grade health checks
- Health features may be lazy-loaded or disabled entirely
- No official Keycloak documentation confirms this, discovered through empirical testing

**Recommendation**:
- ✅ **CI/Dev**: Use admin console check (`curl http://localhost:8180/ | grep "Keycloak"`)
- ✅ **Production**: Use `/health/ready` with `start` mode (not `start-dev`)

---

## Issue 2: Realm Import Compatibility

### Error Encountered

```
ERROR: Cannot invoke "org.keycloak.models.AuthenticationFlowModel.getId()"
because "flow" is null
```

**Context**:
- Exporting realm from Keycloak 22.x
- Importing into Keycloak 23.0
- Authentication flows incompatible

### Root Cause Analysis

Keycloak 23.0 changed the internal structure of authentication flows. Realm exports from earlier versions reference flows by old IDs that don't exist in the new schema.

**Attempted Fixes**:
1. ❌ Import with `--override true` - Failed
2. ❌ Manual flow removal from JSON - Failed (dependencies)
3. ✅ Create realm programmatically via Admin API - **Success**

### Solution: Admin API Realm Setup

Instead of importing a monolithic JSON file, create realm components individually:

```bash
# 1. Create empty realm
curl -X POST http://localhost:8180/admin/realms \
  -H "Content-Type: application/json" \
  -u admin:admin \
  -d '{"realm":"tamshai-corp","enabled":true}'

# 2. Create roles
curl -X POST http://localhost:8180/admin/realms/tamshai-corp/roles \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"hr-read"}'

# 3. Create users
curl -X POST http://localhost:8180/admin/realms/tamshai-corp/users \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "username":"alice.chen",
    "enabled":true,
    "credentials":[{"type":"password","value":"[REDACTED-DEV-PASSWORD]","temporary":false}]
  }'

# 4. Assign roles
curl -X POST http://localhost:8180/admin/realms/tamshai-corp/users/$USER_ID/role-mappings/realm \
  -H "Authorization: Bearer $TOKEN" \
  -d '[{"name":"hr-read"}]'
```

**Benefits**:
- ✅ Version-agnostic (works across Keycloak versions)
- ✅ Scriptable and repeatable
- ✅ Idempotent (can rerun without errors)
- ✅ No authentication flow compatibility issues

---

## Production Recommendations

### For VPS Staging (Hetzner)

Use `start` mode (not `start-dev`):

```yaml
# docker-compose.yml (VPS uses root compose file)
keycloak:
  command: start --hostname-strict=false
  environment:
    KC_HEALTH_ENABLED: true  # Explicitly enable health endpoints
```

Health check:
```bash
curl http://localhost:8080/health/ready
```

### For GCP Production (GKE)

Kubernetes readiness probe:

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 60
  periodSeconds: 10
  timeoutSeconds: 5
  successThreshold: 1
  failureThreshold: 3
```

**DO NOT use**:
- `start-dev` mode in production
- Admin console check as readiness probe
- Realm import for automated deployments

---

## Testing Strategy

### Local Development

- Use Docker Compose with realm import (realm-export-dev.json)
- Faster iteration, no API setup needed

### CI/CD

- Use Admin API setup script (setup-keycloak-realm.sh)
- Ensures version compatibility
- Validates deployment automation

### Staging/Production

- Use Terraform/Ansible with Admin API
- Store realm configuration as code (Infrastructure as Code)
- Never rely on manual imports

---

## Keycloak Admin API Reference

### Authentication

```bash
# Get admin token
TOKEN=$(curl -sf -X POST http://localhost:8180/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')
```

### Common Operations

```bash
# List realms
curl -X GET http://localhost:8180/admin/realms \
  -H "Authorization: Bearer $TOKEN"

# Get realm users
curl -X GET http://localhost:8180/admin/realms/tamshai-corp/users \
  -H "Authorization: Bearer $TOKEN"

# Get user roles
curl -X GET http://localhost:8180/admin/realms/tamshai-corp/users/$USER_ID/role-mappings \
  -H "Authorization: Bearer $TOKEN"

# Test user authentication
curl -X POST http://localhost:8180/realms/tamshai-corp/protocol/openid-connect/token \
  -d "client_id=mcp-gateway" \
  -d "client_secret=test-client-secret" \
  -d "username=alice.chen" \
  -d "password=[REDACTED-DEV-PASSWORD]" \
  -d "grant_type=password"
```

---

## Troubleshooting Guide

### Issue: Setup script fails with "Failed to get admin token"

**Cause**: Keycloak not fully started or admin console not responding

**Fix**:
```bash
# Check Keycloak is running
curl -sf http://localhost:8180/ | grep "Keycloak"

# Check admin endpoint specifically
curl -sf http://localhost:8180/realms/master

# View Keycloak logs
docker logs keycloak | tail -50
```

### Issue: User creation returns 409 Conflict

**Cause**: User already exists (script is idempotent, this is expected)

**Fix**: Script handles this gracefully, retrieves existing user ID

### Issue: Role assignment fails

**Cause**: Role doesn't exist or user ID is invalid

**Fix**:
```bash
# Verify role exists
curl -X GET http://localhost:8180/admin/realms/tamshai-corp/roles/hr-read \
  -H "Authorization: Bearer $TOKEN"

# Verify user exists
curl -X GET http://localhost:8180/admin/realms/tamshai-corp/users?username=alice.chen \
  -H "Authorization: Bearer $TOKEN"
```

### Issue: Integration tests fail with "invalid_grant"

**Cause**: Client secret mismatch or client not configured for direct grant

**Fix**:
```bash
# Verify client configuration
curl -X GET "http://localhost:8180/admin/realms/tamshai-corp/clients?clientId=mcp-gateway" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0] | {clientId, directAccessGrantsEnabled, secret}'

# Should show:
# {
#   "clientId": "mcp-gateway",
#   "directAccessGrantsEnabled": true,
#   "secret": "test-client-secret"
# }
```

---

## Setup Script Details

### Script Location
`tests/integration/setup-keycloak-realm.sh`

### What It Creates

**Roles**:
- hr-read, hr-write
- finance-read, finance-write
- sales-read, sales-write
- support-read, support-write
- executive

**Users**:
| Username | Email | Roles | Password |
|----------|-------|-------|----------|
| alice.chen | alice@tamshai.com | hr-read, hr-write | [REDACTED-DEV-PASSWORD] |
| bob.martinez | bob@tamshai.com | finance-read, finance-write | [REDACTED-DEV-PASSWORD] |
| carol.johnson | carol@tamshai.com | sales-read, sales-write | [REDACTED-DEV-PASSWORD] |
| dan.williams | dan@tamshai.com | support-read, support-write | [REDACTED-DEV-PASSWORD] |
| eve.thompson | eve@tamshai.com | executive | [REDACTED-DEV-PASSWORD] |
| frank.davis | frank@tamshai.com | (none - intern) | [REDACTED-DEV-PASSWORD] |
| nina.patel | nina@tamshai.com | (none - manager) | [REDACTED-DEV-PASSWORD] |
| marcus.johnson | marcus@tamshai.com | (none - engineer) | [REDACTED-DEV-PASSWORD] |

**Client**:
- Client ID: `mcp-gateway`
- Secret: `test-client-secret`
- Direct Access Grants: Enabled
- Standard Flow: Enabled

### Script Features

- **Idempotent**: Can be run multiple times without errors
- **Verbose Logging**: Color-coded output for debugging
- **Error Handling**: Strict mode (`set -euo pipefail`)
- **Environment Variables**: Configurable via env vars
- **Validation**: Checks for admin token, role creation, user creation

### Usage

```bash
# Local development
cd tests/integration
chmod +x setup-keycloak-realm.sh
./setup-keycloak-realm.sh

# CI (automatically run by GitHub Actions)
# See .github/workflows/ci.yml
```

---

## CI Integration

### Workflow Steps

1. **Start Keycloak** - Docker container with start-dev mode
2. **Wait for Admin Console** - Check homepage for "Keycloak" text
3. **Create Realms** - Empty tamshai and tamshai-corp realms
4. **Wait for Admin API** - Verify /admin/realms endpoint
5. **Run Setup Script** - Create users/roles/clients
6. **Verify Setup** - Check user count and client existence
7. **Run Integration Tests** - 74 tests with full Keycloak realm

### Environment Variables

```yaml
env:
  KEYCLOAK_URL: http://localhost:8180
  KEYCLOAK_REALM: tamshai-corp
  KEYCLOAK_ADMIN: admin
  KEYCLOAK_ADMIN_PASSWORD: admin
  KEYCLOAK_CLIENT_SECRET: test-client-secret
```

### Verification Step

The CI workflow verifies the setup worked:

```bash
# Get user count
USER_COUNT=$(curl -X GET .../users | jq '. | length')
if [ "$USER_COUNT" -lt 8 ]; then
  echo "Expected at least 8 users, got $USER_COUNT"
  exit 1
fi

# Verify client exists
CLIENT=$(curl -X GET ".../clients?clientId=mcp-gateway" | jq '.[0].clientId')
if [ "$CLIENT" != "\"mcp-gateway\"" ]; then
  exit 1
fi
```

---

## Performance Impact

### Setup Script Timing

- Admin token retrieval: ~1s
- Role creation (9 roles): ~2s
- Client creation: ~1s
- User creation (8 users): ~8s
- Role assignment (16 assignments): ~4s
- **Total**: ~16 seconds

### CI Workflow Timing

| Step | Duration |
|------|----------|
| Start Keycloak | ~20s |
| Wait for admin console | ~15s |
| Create realms | ~2s |
| Wait for Admin API | ~5s |
| Run setup script | ~16s |
| Verify setup | ~2s |
| **Total overhead** | **~60s** |

This is acceptable overhead for the benefit of 100% integration test coverage.

---

## Security Considerations

### Test Credentials

⚠️ **IMPORTANT**: The credentials in the setup script are **ONLY FOR CI/TESTING**

- Password: `[REDACTED-DEV-PASSWORD]` (weak, predictable)
- Client secret: `test-client-secret` (hardcoded)
- Admin password: `admin` (default)

**Production must**:
- Use strong, randomly-generated passwords
- Store secrets in environment variables or secret managers (GCP Secret Manager, HashiCorp Vault)
- Enable TOTP/WebAuthn MFA
- Rotate credentials regularly

### Script Permissions

The setup script requires:
- Admin access to Keycloak
- Ability to create realms, users, roles, clients
- Network access to Keycloak API

**DO NOT**:
- Run this script in production
- Commit real credentials to git
- Use test credentials outside CI/dev environments

---

## Maintenance

### When to Update the Script

- **Adding new roles**: Add to the role creation loop
- **Adding new test users**: Add to the user creation section
- **Changing client configuration**: Update `create_client()` function
- **Updating Keycloak**: Test compatibility with new version

### Script Location in Codebase

```
tamshai-enterprise-ai/
├── tests/
│   └── integration/
│       ├── setup-keycloak-realm.sh  ← Main script
│       ├── jest.setup.js            ← Test framework setup
│       ├── rbac.test.ts             ← Uses created users/roles
│       └── ...
└── .github/
    └── workflows/
        └── ci.yml                    ← Runs the script
```

---

## Future Enhancements

### Possible Improvements

1. **Composite Roles**: Create `executive` as composite role (includes all read roles)
2. **Group Management**: Use Keycloak groups for department organization
3. **LDAP Integration**: Sync users from corporate directory
4. **Custom Attributes**: Add department, title, employee_id attributes
5. **Session Configuration**: Configure token lifetimes, refresh tokens
6. **Theme Customization**: Brand Keycloak with company logo/colors

### Production Migration Path

1. Export realm configuration from dev/staging
2. Convert to Terraform/Ansible scripts
3. Store in Infrastructure-as-Code repository
4. Validate with CI/CD pipeline
5. Deploy to production with approval gates
6. Monitor and audit

---

**Document Created**: December 30, 2025
**Author**: Tamshai QA Team
**Keycloak Version**: 23.0.0
**Applies To**: CI/CD, Local Development, VPS Staging, GCP Production
