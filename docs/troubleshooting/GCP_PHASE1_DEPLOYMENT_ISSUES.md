# GCP Phase 1 Production Deployment Issues

**Document Version**: 1.0
**Created**: January 9, 2026
**Status**: Active Troubleshooting
**Deployment Progress**: 52/60 resources (87%), 4/6 services running

---

## Table of Contents

1. [Overview](#overview)
2. [Security Incident: API Key Exposure](#security-incident-api-key-exposure)
3. [Keycloak PostgreSQL Connection Failures](#keycloak-postgresql-connection-failures)
4. [MCP Gateway Startup Validation Issues](#mcp-gateway-startup-validation-issues)
5. [Container Build Configuration Mismatches](#container-build-configuration-mismatches)
6. [Current Workarounds](#current-workarounds)
7. [Pending Solutions](#pending-solutions)
8. [Lessons Learned](#lessons-learned)

---

## Overview

This document tracks critical issues encountered during the GCP Phase 1 production deployment on January 9, 2026. The deployment attempted to launch 6 Cloud Run services (mcp-gateway, keycloak, and 4 MCP Suite servers) with Cloud SQL PostgreSQL backend.

**Timeline**:
- 06:00 UTC - Initial terraform apply (52/60 resources deployed)
- 06:35 UTC - API key exposure detected by GitHub
- 07:13 UTC - Anthropic deactivates exposed key
- 16:00 UTC - Begin debugging Keycloak PostgreSQL connection
- 18:06 UTC - Switch to dev-file workaround, force redeploy in progress

**Root Causes**:
1. Terraform plan file (.tfplan) not gitignored - contained sensitive variables
2. Keycloak unable to connect to Cloud SQL PostgreSQL via Unix sockets
3. Container image build-time database configuration conflicts with runtime settings
4. mcp-gateway fail-fast validation blocking startup when Keycloak unavailable

---

## Security Incident: API Key Exposure

### Problem

Terraform plan file (`infrastructure/terraform/gcp/tfplan`) committed to public GitHub repository containing Anthropic API key in plaintext.

**Exposed Data**:
- Key ID: 6880146
- Key Name: tamshai-enterprise-ai-prod
- Key Hint: sk-ant-api03-6be...FwAA
- Commit: 4e12a9e2b15c79716b32175256537ab91a9f080a
- Detection: GitHub secret scanning at 07:13 UTC

### Root Cause

1. Executed `terraform plan -out=tfplan` which saves ALL variable values (including sensitive) in binary file
2. The `.tfplan` file pattern was not in `.gitignore`
3. Committed and pushed without inspection

### Resolution

✅ **COMPLETED** (January 9, 2026 18:00 UTC)

1. **Immediate Actions**:
   - Added `*.tfplan` to `.gitignore`
   - Removed file from repository: `git rm -f infrastructure/terraform/gcp/tfplan`
   - Created incident report: `SECURITY_INCIDENT_2026-01-09.md`

2. **Git History Purge**:
   ```bash
   FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch infrastructure/terraform/gcp/tfplan' \
     --prune-empty --tag-name-filter cat -- --all

   git push --force origin main
   ```
   Result: All 986 commits rewritten, leaked key permanently removed

3. **API Key Rotation**:
   - User obtained new API key from Anthropic Console
   - Updated GitHub secret: `ANTHROPIC_API_KEY_PROD`
   - Updated GCP Secret Manager (version 3): `tamshai-prod-anthropic-api-key`
   - Updated local `terraform.tfvars` (gitignored)

### Prevention

**Pre-commit Hook** (recommended):
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for sensitive files
if git diff --cached --name-only | grep -E '\.(tfplan|tfstate|tfvars|env)$'; then
  echo "ERROR: Attempting to commit sensitive Terraform files"
  echo "Files detected:"
  git diff --cached --name-only | grep -E '\.(tfplan|tfstate|tfvars|env)$'
  exit 1
fi

# Check for potential secrets in code
if git diff --cached | grep -E 'sk-ant-api03-|AKIA[0-9A-Z]{16}'; then
  echo "ERROR: Potential API key or secret detected in commit"
  exit 1
fi
```

**Workflow Change**:
- Never use `terraform plan -out=...` for inspection purposes
- Only use output files for immediate `terraform apply` in CI/CD
- Immediately delete tfplan files after apply

---

## Keycloak PostgreSQL Connection Failures

### Problem

Keycloak container fails to start on Cloud Run, unable to connect to Cloud SQL PostgreSQL database via Unix socket path.

**Symptoms**:
```
ERROR: Unable to parse URL jdbc:postgresql:///cloudsql/gen-lang-client-0553641830:us-central1:tamshai-prod-postgres:5432/keycloak
ERROR: Failed to obtain JDBC connection
ERROR: The connection attempt failed
```

**Cloud Run Error**:
```
The user-provided container failed the configured startup probe checks.
```

### Root Cause

Keycloak's JDBC URL construction does not correctly handle Unix socket paths with Cloud SQL's format.

**Cloud SQL Unix Socket Format**:
```
/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
```

**Issue**: Keycloak automatically appends `:5432` (port) to the host parameter, creating malformed path:
```
/cloudsql/gen-lang-client-0553641830:us-central1:tamshai-prod-postgres:5432
```

Unix sockets don't use ports - the `:5432` is invalid in the file path.

### Attempted Solutions

#### Attempt 1: Separate Environment Variables (FAILED)
```hcl
env {
  name  = "KC_DB_URL_HOST"
  value = "/cloudsql/${var.postgres_connection_name}"
}
env {
  name  = "KC_DB_URL_DATABASE"
  value = var.keycloak_db_name
}
```

**Result**: Keycloak still appended `:5432` to host, creating:
```
jdbc:postgresql:///cloudsql/PROJECT:REGION:INSTANCE:5432/keycloak
```

#### Attempt 2: Full JDBC URL with host Parameter (FAILED)
```hcl
env {
  name  = "KC_DB_URL"
  value = "jdbc:postgresql:///${var.keycloak_db_name}?host=/cloudsql/${var.postgres_connection_name}"
}
```

**Result**: URL parsing error:
```
ERROR: protocol = socket host = null
ERROR: Failed to select a proxy
```

PostgreSQL driver misinterpreted the `?host=` parameter as a proxy configuration.

#### Attempt 3: URL Properties Parameter (FAILED)
```hcl
env {
  name  = "KC_DB_URL_HOST"
  value = "/cloudsql/${var.postgres_connection_name}"
}
env {
  name  = "KC_DB_URL_PROPERTIES"
  value = "?port=5432"
}
```

**Result**: Keycloak appended properties AFTER adding `:5432` to host:
```
jdbc:postgresql:///cloudsql/PROJECT:REGION:INSTANCE:5432/keycloak?port=5432
```

#### Attempt 4: Quarkus Datasource Override (FAILED)
```hcl
env {
  name  = "QUARKUS_DATASOURCE_JDBC_URL"
  value = "jdbc:postgresql:///${var.keycloak_db_name}?host=/cloudsql/${var.postgres_connection_name}&port=5432"
}
```

**Result**: Same parsing error as Attempt 2.

#### Attempt 5: AFUNIXSocketFactory (NOT ATTEMPTED)

Considered using junixsocket library:
```
jdbc:postgresql://localhost/${db}?socketFactory=org.newsclub.net.unix.AFUNIXSocketFactory$FactoryArg&socketFactoryArg=/cloudsql/${connection}/.s.PGSQL.5432
```

**Blockers**:
- Requires adding junixsocket JAR to Keycloak container (non-trivial)
- Official Keycloak image may not support custom dependencies
- Would need custom Dockerfile with maven builds

### Current Workaround

**Status**: ✅ IMPLEMENTED (Temporary)

Using H2 in-memory database (dev-file) to unblock deployment:
```hcl
env {
  name  = "KC_DB"
  value = "dev-file"
}
```

**Implications**:
- ❌ Data not persisted (lost on container restart)
- ❌ Realm configuration must be re-imported on every startup
- ❌ User sessions lost on restart
- ❌ Not suitable for production use
- ✅ Allows testing full deployment flow
- ✅ Allows validating mcp-gateway with new API key

**Container Build Change**:

Removed database-specific build to allow runtime selection:
```dockerfile
# Before (PostgreSQL baked in):
RUN /opt/keycloak/bin/kc.sh build --db=postgres

# After (runtime selection):
RUN /opt/keycloak/bin/kc.sh build
```

---

## MCP Gateway Startup Validation Issues

### Problem

mcp-gateway container exits during startup when unable to validate Keycloak connectivity.

**Error**:
```
Failed to validate Keycloak connectivity {"error":"getaddrinfo ENOTFOUND auth.tamshai.com"}
Exiting: Keycloak validation failed in production mode
```

### Root Cause

mcp-gateway performs fail-fast validation at startup (services/mcp-gateway/src/index.ts:492-514):

```typescript
async function validateKeycloakConnectivity(): Promise<void> {
  const jwksUri = config.keycloak.jwksUri ||
    `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`;

  try {
    const response = await axios.get(jwksUri, { timeout: 5000 });
    // ...
  } catch (error) {
    logger.error('Failed to validate Keycloak connectivity', { error, jwksUri });
    if (process.env.NODE_ENV === 'production') {
      logger.error('Exiting: Keycloak validation failed in production mode');
      process.exit(1); // Fail-fast in production
    }
  }
}
```

**Issues**:
1. **DNS doesn't exist**: `auth.tamshai.com` not configured yet (Cloudflare CNAME pending)
2. **Keycloak not ready**: Even with internal Cloud Run URL, Keycloak takes 30-60s to start
3. **Circular dependency**: mcp-gateway validates Keycloak, but can't start until Keycloak is healthy

### Attempted Solutions

#### Attempt 1: Use Internal Cloud Run URL (PARTIAL SUCCESS)

Changed from external domain to internal Cloud Run URL:
```hcl
env {
  name  = "KEYCLOAK_ISSUER"
  value = "${google_cloud_run_service.keycloak.status[0].url}/realms/tamshai"
}
```

**Result**: Removes DNS dependency, but still times out if Keycloak starting slowly.

#### Attempt 2: Skip Validation Flag (NOT IMPLEMENTED)

Could add environment variable to skip validation:
```typescript
if (process.env.SKIP_KEYCLOAK_VALIDATION === 'true') {
  logger.warn('Skipping Keycloak validation (SKIP_KEYCLOAK_VALIDATION=true)');
  return;
}
```

**Blockers**:
- Code change required
- Need to rebuild mcp-gateway container
- Not ideal for production (bypasses important validation)

### Current Workaround

**Status**: ⏳ IN PROGRESS

Deploy Keycloak first with dev-file, wait for healthy, then deploy mcp-gateway with internal URL.

---

## Container Build Configuration Mismatches

### Problem

Keycloak container built with specific database configuration cannot be changed at runtime.

**Error**:
```
The following build time options have values that differ from what is persisted -
the new values will NOT be used until another build is run: kc.db
```

### Root Cause

Keycloak optimizes at build time using Quarkus:
```dockerfile
RUN /opt/keycloak/bin/kc.sh build --db=postgres
```

This "bakes in" PostgreSQL configuration. Trying to switch to `dev-file` at runtime fails.

### Resolution

✅ **FIXED** (Commit b524934)

Build without database flag to allow runtime selection:
```dockerfile
# Build optimized Keycloak (database selected at runtime)
RUN /opt/keycloak/bin/kc.sh build
```

**Trade-off**:
- Slightly slower startup (Quarkus optimizations not database-specific)
- Increased flexibility for testing different database backends

---

## Current Workarounds

### 1. Keycloak with H2 In-Memory Database

**Configuration**:
```hcl
env {
  name  = "KC_DB"
  value = "dev-file"
}
```

**Limitations**:
- Data lost on restart
- Cannot scale beyond 1 instance
- Realm import runs on every startup (~30s overhead)

**When to Use**: Development, testing, proof-of-concept deployments

### 2. Increased Startup Probe Timeouts

**Configuration**:
```hcl
startup_probe {
  http_get {
    path = "/auth/health/ready"
    port = 8080
  }
  initial_delay_seconds = 180  # 3 minutes
  timeout_seconds       = 10
  period_seconds        = 60
  failure_threshold     = 15   # 15 attempts
}
# Total: 180s + (60s × 15) = 1080s (18 minutes)
```

**Why Needed**: Keycloak realm import can take 30-60 seconds with dev-file database.

### 3. Internal Cloud Run URLs for Service-to-Service

**Configuration**:
```hcl
env {
  name  = "KEYCLOAK_ISSUER"
  value = "${google_cloud_run_service.keycloak.status[0].url}/realms/tamshai"
}
```

**Benefits**:
- No DNS configuration required
- Faster (no external routing)
- Works during deployment before DNS propagated

**Limitation**: JWT tokens issued with internal URL won't validate against external domain.

---

## Pending Solutions

### Solution 1: Cloud SQL Proxy Sidecar (RECOMMENDED)

Use Cloud SQL Proxy as sidecar container to provide TCP connection.

**Terraform Configuration**:
```hcl
resource "google_cloud_run_service" "keycloak" {
  # ...

  template {
    spec {
      containers {
        # Main Keycloak container
        image = "us-central1-docker.pkg.dev/.../keycloak:latest"

        env {
          name  = "KC_DB"
          value = "postgres"
        }
        env {
          name  = "KC_DB_URL"
          value = "jdbc:postgresql://127.0.0.1:5432/${var.keycloak_db_name}"
        }
      }

      containers {
        # Cloud SQL Proxy sidecar
        image = "gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.8.0"

        args = [
          "--structured-logs",
          "--port=5432",
          "gen-lang-client-0553641830:us-central1:tamshai-prod-postgres"
        ]
      }
    }
  }
}
```

**Benefits**:
- Standard TCP connection (no Unix socket complexity)
- Official Google-supported solution
- Automatic connection pooling and IAM authentication support
- Works identically in local dev and Cloud Run

**Implementation Steps**:
1. Update Cloud Run service definition to include sidecar container
2. Change JDBC URL to `jdbc:postgresql://127.0.0.1:5432/keycloak`
3. Remove Cloud SQL instance annotation (proxy handles connection)
4. Test with health check endpoints

**Estimated Time**: 1-2 hours (requires Terraform changes, testing)

### Solution 2: Private IP with VPC Connector (ALTERNATIVE)

Connect to Cloud SQL via private IP through VPC Access Connector.

**Prerequisites**:
- Cloud SQL private IP enabled (already configured)
- VPC Access Connector deployed (already exists: tamshai-prod-connector)

**Configuration**:
```hcl
env {
  name  = "KC_DB_URL"
  value = "jdbc:postgresql://${google_sql_database_instance.postgres.private_ip_address}:5432/${var.keycloak_db_name}"
}
```

**Benefits**:
- No sidecar container needed
- Standard PostgreSQL connection
- Better for high-traffic scenarios

**Drawbacks**:
- VPC Connector adds latency (~5-10ms)
- VPC Connector costs $0.054/hour ($39/month)
- Less portable (Cloud Run specific)

### Solution 3: External PostgreSQL with Cloud Run Jobs

Move Keycloak to Cloud Run Jobs for long-running process.

**Not Recommended**:
- Cloud Run Jobs designed for batch processing, not web services
- Loses auto-scaling benefits
- Complicates deployment

---

## Lessons Learned

### 1. Terraform State Management

**Issue**: Terraform plan files contain sensitive data in plaintext.

**Best Practices**:
- Never commit `.tfplan`, `.tfstate`, or `.tfvars` files
- Use `-out` only in CI/CD for immediate apply
- Always inspect `.gitignore` before pushing infrastructure code
- Use pre-commit hooks to block sensitive files

**Prevention**:
```gitignore
# Terraform
*.tfplan
*.tfplan.json
*.tfstate
*.tfstate.backup
terraform.tfvars
*.auto.tfvars
```

### 2. Cloud SQL Unix Socket Limitations

**Issue**: Not all database drivers handle Unix sockets identically.

**Considerations**:
- Test database connectivity early in deployment
- Prefer Cloud SQL Proxy sidecar for maximum compatibility
- Unix sockets save memory but add driver complexity
- Document exact JDBC URL format required for each language

### 3. Container Build-Time vs Runtime Configuration

**Issue**: Keycloak bakes database selection into optimized build.

**Best Practices**:
- Understand build-time optimization trade-offs
- Prefer runtime configuration for flexibility during development
- Use build-time optimization only for production-frozen configs
- Document which settings are build-time vs runtime

### 4. Service Startup Dependencies

**Issue**: mcp-gateway requires Keycloak to be healthy before starting.

**Solutions**:
- Implement retry logic with exponential backoff
- Use startup probes with generous timeouts
- Consider init containers for critical dependencies
- Deploy dependencies first, then dependent services

**Example Retry Logic**:
```typescript
async function validateKeycloakConnectivity(retries = 5): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(jwksUri, { timeout: 5000 });
      return; // Success
    } catch (error) {
      if (i === retries - 1) throw error;
      const delay = Math.pow(2, i) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 5. Cloud Run Health Check Configuration

**Issue**: Default health checks too aggressive for slow-starting services.

**Recommendations**:
- **Startup Probe**: Generous timeouts (3-5 minutes) for initial boot
- **Liveness Probe**: Detect crashes (60s period, 3 failures = restart)
- **Readiness Probe**: Not supported in Cloud Run (use startup probe)

**Keycloak Specifics**:
- Realm import adds 30-60s to startup time
- Use HTTP probes, not TCP (Keycloak may bind port before ready)
- Path must include `/auth` prefix if KC_HTTP_RELATIVE_PATH set

### 6. Multi-Service Deployment Strategy

**Issue**: Deploying all services simultaneously creates race conditions.

**Recommended Order**:
1. **Infrastructure Layer**: VPC, Cloud SQL, Secret Manager
2. **Data Layer**: Database initialization, migrations
3. **Identity Layer**: Keycloak deployment and validation
4. **API Layer**: mcp-gateway deployment
5. **Service Layer**: MCP Suite servers
6. **Ingress Layer**: IAM bindings, DNS configuration

**Terraform Dependency**:
```hcl
resource "google_cloud_run_service" "mcp_gateway" {
  depends_on = [
    google_cloud_run_service.keycloak
  ]
}
```

### 7. Windows Development Environment Challenges

**Issues Documented**:
- gcloud CLI wrapper scripts fail in Git Bash (documented in `WINDOWS_GCLOUD_ISSUES.md`)
- PATH not persisted across sessions
- Python subprocess resolution problems

**Workarounds**:
- Use GCP Console for interactive tasks (SSH, log viewing)
- Set PATH explicitly in each shell session
- Use full absolute paths for gcloud commands

---

## Related Documentation

- [Security Incident Report](../../SECURITY_INCIDENT_2026-01-09.md)
- [Windows gcloud Issues](./WINDOWS_GCLOUD_ISSUES.md)
- [GCP Deployment Plan](../plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md)
- [Keycloak Cloud Run Configuration](https://cloud.google.com/sql/docs/postgres/connect-run)
- [Cloud SQL Proxy Documentation](https://cloud.google.com/sql/docs/postgres/sql-proxy)

---

## Next Actions

### Immediate (Next 24 Hours)

1. ✅ Complete current force-replace deployment
2. ✅ Verify Keycloak starts successfully with dev-file
3. ✅ Verify mcp-gateway starts with new API key
4. ✅ Test end-to-end query flow with 4 working MCP servers

### Short-Term (Next Week)

1. ⏳ Implement Cloud SQL Proxy sidecar solution
2. ⏳ Test PostgreSQL connection with sidecar
3. ⏳ Deploy to staging with persistent database
4. ✅ **Implement IAP tunneling for VM access** (infrastructure already configured)
   - Firewall rule: `allow-ssh-from-iap` (35.235.240.0/20)
   - VM tags: `ssh-enabled` on keycloak and mcp-gateway instances
   - IAM: `roles/iap.tunnelResourceAccessor` granted to claude-deployer
   - Usage: `gcloud compute ssh <instance> --tunnel-through-iap --command="..."`
5. ⏳ Configure Cloudflare DNS for external domains

### Long-Term (Next Sprint)

1. ✅ **Add retry logic to mcp-gateway Keycloak validation** (commit 40c1f44)
   - Exponential backoff with jitter (1s → 30s max)
   - Configurable retries via KEYCLOAK_VALIDATION_RETRIES (default: 10)
   - Enhanced startup probe: 6 minute timeout
   - Pending: Rebuild and deploy container
2. ⏳ Implement comprehensive health check dashboard
3. ⏳ Create deployment runbook with troubleshooting steps
4. ⏳ Set up monitoring and alerting (Cloud Logging, Error Reporting)
5. ⏳ Performance testing with k6 for production load

---

*Last Updated: January 9, 2026 19:30 UTC*
*Document Maintainer: Claude-Dev*
*Related Incident: SECURITY-2026-01-09-001*
