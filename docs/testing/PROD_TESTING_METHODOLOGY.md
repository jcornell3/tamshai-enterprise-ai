# Production Testing Methodology

**Date**: January 14, 2026 (Updated)
**Author**: Claude Code (Debugging Session)
**Purpose**: Document the testing approaches used to diagnose and verify production issues

## Overview

This document captures the testing methodology developed during the resolution of 14 production issues (see `docs/troubleshooting/PROD_403_REMEDIATION_PLAN.md`). The techniques described here can be reused for future production debugging.

## Testing Layers

### 1. Health Endpoint Testing

**Purpose**: Quick verification that services are running and responsive.

**Tools**: `curl`

**Examples**:
```bash
# MCP Gateway health (public endpoint)
curl -s "https://mcp-gateway-fn44nd7wba-uc.a.run.app/health"
# Expected: {"status":"healthy","timestamp":"...","version":"0.1.0",...}

# Keycloak health (public endpoint)
curl -s "https://auth.tamshai.com/auth/health/ready"
# Expected: HTTP 200

# JWKS endpoint (critical for JWT validation)
curl -s "https://auth.tamshai.com/auth/realms/tamshai-corp/protocol/openid-connect/certs"
# Expected: JSON with "keys" array containing RSA public keys
```

**What health endpoints reveal**:
- Service is running and accepting connections
- Basic dependencies are available
- No startup probe failures

**What health endpoints DON'T reveal**:
- Database connectivity
- Authentication/authorization correctness
- Inter-service communication

---

### 2. Cloud Run Logs Analysis

**Purpose**: Diagnose runtime errors, startup failures, and connection issues.

**Tools**: `gcloud logging read`

#### Basic Log Query

```bash
# Recent logs for a service
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mcp-hr" \
  --limit=30 \
  --format="table(timestamp,jsonPayload.level,jsonPayload.message)"
```

#### Filtered Log Queries

```bash
# Startup logs only (first 30 seconds of a revision)
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=mcp-hr \
  AND resource.labels.revision_name=mcp-hr-00045-7mw \
  AND timestamp>=\"2026-01-13T20:06:00Z\" \
  AND timestamp<=\"2026-01-13T20:06:30Z\"" \
  --limit=30 \
  --format="table(timestamp,jsonPayload.level,jsonPayload.message)"

# Database-related messages
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=mcp-hr \
  AND (jsonPayload.message=~\"database|Database|postgres|Postgres|connect|Connect\")" \
  --limit=20 \
  --format="table(timestamp,jsonPayload.level,jsonPayload.message)"

# Error-level logs only
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=mcp-hr \
  AND jsonPayload.level=\"error\"" \
  --limit=20 \
  --format="table(timestamp,jsonPayload.level,jsonPayload.message)"

# JSON format for detailed analysis
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=mcp-hr" \
  --limit=10 \
  --format=json
```

#### Key Log Patterns to Look For

| Log Message | Indicates | Action |
|-------------|-----------|--------|
| `MCP HR Server listening on port 3101` | Service started successfully | Good |
| `Database connection: OK` | PostgreSQL connected | Good |
| `Database health check failed` | PostgreSQL connection error | Check POSTGRES_* env vars |
| `password authentication failed for user "X"` | Wrong POSTGRES_USER | Fix user name |
| `server does not support SSL` | PGSSLMODE incompatible | Remove PGSSLMODE for Unix socket |
| `Redis error: connect ECONNREFUSED` | Redis not available | Expected for MCP services (not critical) |
| `Skipping identity reconciliation` | No HR sync in prod | Expected behavior |

---

### 3. Cloud Run Revision Analysis

**Purpose**: Verify correct configuration is deployed.

**Tools**: `gcloud run revisions`

#### List Recent Revisions

```bash
gcloud run revisions list \
  --service=mcp-hr \
  --region=us-central1 \
  --format="table(name,creationTimestamp)" \
  --limit=5
```

#### Inspect Revision Configuration

```bash
# Show environment variables (sensitive values hidden)
gcloud run revisions describe mcp-hr-00045-7mw \
  --region=us-central1 \
  --format="yaml(spec.containers[0].env)"

# Show all configuration
gcloud run revisions describe mcp-hr-00045-7mw \
  --region=us-central1 \
  --format=yaml
```

**What to verify**:
- `POSTGRES_HOST`: Should be `/cloudsql/...` for Unix socket
- `POSTGRES_USER`: Must match actual database user
- `POSTGRES_DB`: Must match actual database name
- `PGSSLMODE`: Should NOT be set for Unix socket connections
- Cloud SQL connector annotation present

---

### 4. Cloud SQL Logs Analysis

**Purpose**: Verify database connections from application.

**Tools**: `gcloud logging read`

```bash
# All Cloud SQL logs
gcloud logging read "resource.type=cloudsql_database" \
  --limit=30 \
  --format="table(timestamp,textPayload)"

# Filter by database name
gcloud logging read "resource.type=cloudsql_database \
  AND (textPayload=~\"tamshai_hr\" OR textPayload=~\"keycloak\")" \
  --limit=30 \
  --format="table(timestamp,textPayload)"
```

**Key patterns**:
| Log Message | Indicates |
|-------------|-----------|
| `connection received: host=[local]` | Unix socket connection (good) |
| `connection authorized: user=tamshai database=tamshai_hr` | Successful auth |
| `password authentication failed` | Wrong credentials |
| `no encryption` | SSL required but not provided |

---

### 5. Terraform State Verification

**Purpose**: Confirm infrastructure matches expected configuration.

**Tools**: `terraform state`, `terraform plan`

#### Check Specific Resource

```bash
# Set credentials
export GOOGLE_APPLICATION_CREDENTIALS=gcp-sa-key.json

# List MCP-related resources
terraform state list | grep -E "mcp|cloudrun"

# Show specific service configuration
terraform state show 'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]'

# Show database user
terraform state show 'module.database.google_sql_user.tamshai_user'
```

#### Detect Drift

```bash
# Plan without applying
terraform plan

# Expected for aligned state:
# "No changes. Your infrastructure matches the configuration."

# If changes detected, review carefully before applying
```

---

### 6. Keycloak API Testing

**Purpose**: Verify authentication and user configuration.

**Tools**: `curl`, Keycloak Admin API

#### Get Admin Token

```bash
# URL-encode password (handles special characters)
ADMIN_PASS=$(gcloud secrets versions access latest --secret=tamshai-prod-keycloak-admin-password)
ENCODED_PASS=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$ADMIN_PASS', safe=''))")

# Get admin token
TOKEN=$(curl -s -X POST "https://auth.tamshai.com/auth/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli&grant_type=password&username=admin&password=$ENCODED_PASS" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

#### Query Keycloak Admin API

```bash
# List users in realm
curl -s "https://auth.tamshai.com/auth/admin/realms/tamshai-corp/users?max=10" \
  -H "Authorization: Bearer $TOKEN"

# Get specific user
curl -s "https://auth.tamshai.com/auth/admin/realms/tamshai-corp/users?username=eve.thompson" \
  -H "Authorization: Bearer $TOKEN"

# List clients
curl -s "https://auth.tamshai.com/auth/admin/realms/tamshai-corp/clients" \
  -H "Authorization: Bearer $TOKEN"
```

**Why this is useful**:
- Confirms Keycloak can connect to its PostgreSQL database
- Verifies user configuration (groups, roles, TOTP status)
- Tests authentication flow without browser

---

### 7. TOTP Authentication Testing

**Purpose**: Verify TOTP authentication flow works correctly.

**Tools**: `oathtool`, `curl`, Playwright E2E tests

#### Generate TOTP Code

```bash
# Using oathtool (recommended)
oathtool --totp --base32 "***REDACTED_TOTP_SECRET***"
# Output: 6-digit code valid for 30 seconds
```

#### Common TOTP Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| "Invalid authenticator code" | Clock drift or parallel tests | Sync clock, use `--workers=1` |
| TOTP setup page appears | User has no TOTP credential | E2E test auto-captures secret |
| NullPointerException in logs | Wrong secretData format | Only `value` field in secretData |
| "Unexpected error" on login | secretData is NULL | Fix realm-export.json format |

#### Key TOTP Configuration Facts

1. **secretData format**: Only accepts `{"value":"..."}` - no other fields
2. **credentialData format**: Contains `subType`, `period`, `digits`, `algorithm`
3. **Keycloak --import-realm**: Only imports on FIRST container startup
4. **E2E test auto-capture**: Automatically handles TOTP setup if needed

See [E2E_USER_TESTS.md](./E2E_USER_TESTS.md) for complete TOTP testing documentation.

---

### 8. API Authentication Testing

**Purpose**: Test end-to-end API access with authentication.

**Note**: E2E tests with Playwright handle TOTP authentication automatically. See E2E_USER_TESTS.md.

#### Test Without Auth (Expect 401)

```bash
# Should return authentication error
curl -s "https://mcp-gateway-fn44nd7wba-uc.a.run.app/api/mcp/hr/list_employees"
# Expected: {"error":"Missing or invalid authorization header"}
```

#### Test MCP Service Directly (Expect 403)

```bash
# MCP services require Cloud Run IAM authentication
curl -s "https://mcp-hr-fn44nd7wba-uc.a.run.app/health"
# Expected: 403 Forbidden (HTML page)
# This is CORRECT - MCP services should not be publicly accessible
```

---

### 9. GCP Secret Manager Verification

**Purpose**: Confirm secrets are correctly configured and accessible.

**Tools**: `gcloud secrets`

```bash
# List secrets
gcloud secrets list --project=gen-lang-client-0553641830

# Access secret value (be careful with output)
gcloud secrets versions access latest --secret=tamshai-prod-db-password

# Check IAM bindings
gcloud secrets get-iam-policy tamshai-prod-mongodb-uri
```

**Key secrets to verify**:
| Secret | Used By |
|--------|---------|
| `tamshai-prod-db-password` | MCP services (PostgreSQL) |
| `tamshai-prod-mongodb-uri` | MCP services (MongoDB) |
| `tamshai-prod-anthropic-api-key` | MCP Gateway (Claude API) |
| `tamshai-prod-keycloak-admin-password` | Admin access |

---

## Issue Diagnosis Flowchart

```
API Call Fails
     │
     ▼
┌────────────────────────────────────┐
│ What HTTP status code?             │
└────────────────────────────────────┘
     │
     ├─── 401 Unauthorized
     │    └─► Check: JWT validation, issuer URL, JWKS endpoint
     │
     ├─── 403 Forbidden
     │    ├─► HTML response? → Cloud Run IAM issue (identity token)
     │    └─► JSON response? → Role/permission issue in application
     │
     ├─── 400 Bad Request
     │    └─► Check: Missing claims (sub, aud), malformed request
     │
     └─── 500/DATABASE_ERROR
          └─► Check: Cloud Run logs for database errors
               │
               ├─► "password authentication failed" → Wrong user name
               ├─► "server does not support SSL" → PGSSLMODE incompatible
               ├─► "no encryption" → PGSSLMODE needed for TCP
               └─► "connect ECONNREFUSED" → Wrong host/service not running
```

---

## CI/Terraform Drift Detection

**Background**: 6 out of 14 issues were caused by CI workflow and Terraform having different configurations.

### Prevention Checklist

Before deploying, verify these match between `deploy-to-gcp.yml` and Terraform:

| Setting | CI Workflow Location | Terraform Location |
|---------|---------------------|-------------------|
| `KEYCLOAK_ISSUER` | deploy-gateway job | `modules/cloudrun/main.tf` |
| `POSTGRES_HOST` | deploy-mcp-suite job | `modules/cloudrun/main.tf` |
| `POSTGRES_USER` | deploy-mcp-suite job | `gcp/main.tf` → cloudrun module |
| `KC_PROXY_HEADERS` | deploy-keycloak job | `modules/cloudrun/main.tf` |
| VPC connector | deploy-mcp-suite job | `modules/cloudrun/main.tf` |

### Quick Drift Check

```bash
# Compare database user
grep "POSTGRES_USER" .github/workflows/deploy-to-gcp.yml
grep "tamshai_db_user" infrastructure/terraform/gcp/main.tf

# Compare Keycloak URL
grep "KEYCLOAK_ISSUER\|VITE_KEYCLOAK_URL" .github/workflows/deploy-to-gcp.yml
grep "keycloak_domain" infrastructure/terraform/gcp/main.tf
```

---

## Testing Verification Checklist

After applying a fix, verify with this checklist:

### 1. Terraform Applied Successfully
```bash
terraform apply
# Should show: "Apply complete! Resources: X added, Y changed, 0 destroyed."
```

### 2. New Revision Created
```bash
gcloud run revisions list --service=<service> --region=us-central1 --limit=1
# New revision should have timestamp after your terraform apply
```

### 3. Startup Logs Clean
```bash
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=<service> \
  AND resource.labels.revision_name=<new-revision> \
  AND jsonPayload.level=\"error\"" \
  --limit=10
# Should only show expected errors (e.g., Redis for MCP services)
```

### 4. Database Connection OK
```bash
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=<service> \
  AND jsonPayload.message=~\"Database connection\"" \
  --limit=5
# Should show: "Database connection: OK"
```

### 5. Health Endpoint Responds
```bash
curl -s "https://<service-url>/health"
# Should return JSON with status
```

---

## Tools Reference

| Tool | Purpose | Authentication |
|------|---------|----------------|
| `gcloud logging read` | View Cloud Run/SQL logs | gcloud auth |
| `gcloud run revisions` | Inspect service configuration | gcloud auth |
| `gcloud secrets` | Access Secret Manager | gcloud auth |
| `terraform state` | Check infrastructure state | `GOOGLE_APPLICATION_CREDENTIALS` |
| `curl` | HTTP endpoint testing | None / Bearer token |

### Authentication Setup

```bash
# For gcloud commands
gcloud auth activate-service-account --key-file=gcp-sa-key.json
gcloud config set project gen-lang-client-0553641830

# For terraform commands
export GOOGLE_APPLICATION_CREDENTIALS=gcp-sa-key.json
```

---

## Lessons Learned

1. **Start with logs**: Cloud Run logs reveal most issues immediately
2. **Check revision config**: Verify environment variables match expectations
3. **Compare CI and Terraform**: Drift between deployment methods is common
4. **Read error messages carefully**: Messages like "user tamshai_app" directly reveal the problem
5. **Test incrementally**: Fix one issue, verify, then move to the next
6. **Document as you go**: Each issue discovered helps prevent future recurrence

---

## Related Documentation

- [PROD_403_REMEDIATION_PLAN.md](../troubleshooting/PROD_403_REMEDIATION_PLAN.md) - Full issue log
- [TEST_USER_JOURNEY.md](./TEST_USER_JOURNEY.md) - E2E test user setup
- [GCP_PROD_PHASE_1_COST_SENSITIVE.md](../plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md) - Architecture overview

---

*Last Updated: January 14, 2026*
