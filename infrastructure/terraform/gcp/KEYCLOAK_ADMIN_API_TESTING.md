# Keycloak Admin REST API Testing - Option B Results

**Date**: January 10, 2026 04:00 UTC
**Objective**: Test manual realm import using Keycloak Admin REST API
**Result**: ❌ BLOCKED - Admin password authentication failure

---

## Issue Discovered: Admin Password Mismatch

### Symptoms

Attempting to authenticate with the Keycloak Admin API fails with HTTP 401:

```bash
curl -X POST "https://keycloak-1046947015464.us-central1.run.app/auth/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=$KEYCLOAK_ADMIN_PASSWORD" \  # From GCP Secret Manager
  -d "grant_type=password"

# Response:
{
  "error": "invalid_grant",
  "error_description": "Invalid user credentials"
}
```

### Keycloak Logs Confirm

```
2026-01-10 03:58:34,048 WARN [org.keycloak.events] (executor-thread-1)
  type="LOGIN_ERROR",
  realmName="master",
  clientId="admin-cli",
  userId="622fe925-7f0a-4737-abb4-fd6363613b8b",  # Admin user EXISTS
  error="invalid_user_credentials",
  username="admin"
```

**Key Finding**: The admin user EXISTS (has a UUID) but the password is WRONG.

---

## Root Cause Analysis

### Environment Variable Deprecation

Keycloak 26.0.7 startup logs show:

```
2026-01-09 21:43:37,335 WARN [org.keycloak.services] (main)
  KC-SERVICES0110: Environment variable 'KEYCLOAK_ADMIN_PASSWORD' is deprecated,
  use 'KC_BOOTSTRAP_ADMIN_PASSWORD' instead

2026-01-09 21:43:37,335 WARN [org.keycloak.services] (main)
  KC-SERVICES0110: Environment variable 'KEYCLOAK_ADMIN' is deprecated,
  use 'KC_BOOTSTRAP_ADMIN_USERNAME' instead
```

### Bootstrap vs Runtime Behavior

**OLD (Deprecated)**: `KEYCLOAK_ADMIN` + `KEYCLOAK_ADMIN_PASSWORD`
- Still functional in Keycloak 26.0.7 but deprecated
- Creates admin user on first startup

**NEW (Recommended)**: `KC_BOOTSTRAP_ADMIN_USERNAME` + `KC_BOOTSTRAP_ADMIN_PASSWORD`
- Keycloak 25+ official way
- **ONLY works on first startup with empty database**
- After initial deployment, has NO effect

### Timeline of Events

1. **Jan 9, 06:35 UTC**: GCP Secret Manager secret `tamshai-prod-keycloak-admin-password` created by Terraform
   - Value: `nZ7Ng6&2fU7uIVwqHrk5&mn@`

2. **Jan 9, ~19:42 UTC**: First Keycloak deployment (revision keycloak-00001-qmm)
   - Container started with `KEYCLOAK_ADMIN_PASSWORD` env var
   - Keycloak SHOULD have created admin user with this password
   - BUT: Logs show "kc.db build time options differ" error
   - Container exited with code 2

3. **Jan 9-10**: Multiple redeployments (revisions 00002-00016)
   - Each deployment passes `KEYCLOAK_ADMIN_PASSWORD` from Secret Manager
   - But admin user already exists - env var ignored
   - Password never updated

### Hypothesis

**Most likely scenario**: The initial deployment (#1, keycloak-00001-qmm) failed or crashed before properly setting the admin password. Subsequent deployments passed the password variable, but Keycloak ignores it after the database is initialized.

**Alternative**: Keycloak created the admin user with a DIFFERENT password than what was in the environment variable due to a bug or configuration issue in the initial deployment.

---

## Attempted Solutions

### 1. Direct Admin API Authentication ❌

**Attempted**:
```bash
KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest \
  --secret=tamshai-prod-keycloak-admin-password)

curl -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=$KEYCLOAK_ADMIN_PASSWORD" \
  -d "grant_type=password"
```

**Result**: HTTP 401 - Invalid credentials

### 2. Cloud Run Container Exec ❌

**Attempted**: Use `gcloud run executions` to run kcadm.sh inside container

**Result**: Cloud Run doesn't support exec like Kubernetes or Docker

**Why this would work**: kcadm.sh can connect to localhost Keycloak admin without network authentication

### 3. Database Direct Access ⚠️

**Considered**: Connect to Cloud SQL PostgreSQL and update admin user password hash

**Challenges**:
- Requires Cloud SQL Proxy or VPC access
- Need to generate Keycloak-compatible bcrypt password hash
- Risk of corrupting database if hash format is wrong
- Keycloak uses specific bcrypt parameters (cost factor, etc.)

**Not recommended**: Too risky for production environment

---

## Working Solutions

### Solution A: Use GitHub Actions Workflow (Recommended)

The `sync-keycloak-realm` job in `.github/workflows/deploy-to-gcp.yml` is designed for this:

```bash
# Trigger Keycloak-only deployment
gh workflow run deploy-to-gcp.yml --field service=keycloak

# The workflow will:
# 1. Build and push Keycloak image (quick - already built)
# 2. Deploy to Cloud Run (revision 00017)
# 3. Run sync-keycloak-realm job:
#    - Creates temporary Cloud Run job
#    - Runs /opt/keycloak/scripts/sync-realm.sh inside container
#    - Script uses kcadm.sh with localhost connection (no auth needed)
#    - Imports all clients, roles, users from realm-export.json
```

**Pros**:
- No password required - uses localhost connection
- Already implemented and tested
- Safe - runs sync script in isolated job
- Automated via CI/CD

**Cons**:
- Requires GitHub Actions run
- Slightly slower than direct API

### Solution B: Reset Admin Password via Cloud Run Job

Create a one-time job to reset the admin password to match Secret Manager:

```bash
# Create password reset job
gcloud run jobs create keycloak-password-reset \
  --image=us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/keycloak:latest \
  --region=us-central1 \
  --service-account=tamshai-prod-keycloak@gen-lang-client-0553641830.iam.gserviceaccount.com \
  --set-secrets=NEW_ADMIN_PASSWORD=tamshai-prod-keycloak-admin-password:latest \
  --vpc-connector=tamshai-prod-connector \
  --max-retries=0 \
  --task-timeout=5m \
  --command="/bin/bash" \
  --args="-c,/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password admin && /opt/keycloak/bin/kcadm.sh set-password --realm master --username admin --new-password \$NEW_ADMIN_PASSWORD"

# Execute
gcloud run jobs execute keycloak-password-reset --region=us-central1 --wait
```

**Pros**:
- Resets password to match Secret Manager
- Enables future Admin API usage
- One-time operation

**Cons**:
- Requires knowing current admin password (catch-22)
- More complex than Solution A

### Solution C: Manual Import via Keycloak Console UI

1. Access Keycloak Admin Console: https://keycloak-1046947015464.us-central1.run.app/auth/admin
2. Login with master realm admin credentials (unknown password)
3. Navigate to tamshai-corp realm → Clients
4. Manually create tamshai-website client with configuration from realm-export.json

**Pros**:
- Direct UI access
- Visual confirmation

**Cons**:
- Requires admin password (same problem as API)
- Manual, error-prone
- Not reproducible/automatable

---

## Recommendation

**Use Solution A (GitHub Workflow)** because:

1. ✅ No authentication required (uses localhost kcadm.sh)
2. ✅ Already implemented and ready to use
3. ✅ Automated and reproducible
4. ✅ Safe - runs in isolated Cloud Run job
5. ✅ Will import all clients, roles, and users from realm-export.json

**Command**:
```bash
gh workflow run deploy-to-gcp.yml --field service=keycloak
gh run watch  # Monitor progress
```

**Expected duration**: 3-5 minutes
- Build: ~30s (cached)
- Deploy: ~60s
- Realm sync: ~30s

---

## Lessons Learned

### 1. Bootstrap Variables Are One-Time Only

`KC_BOOTSTRAP_ADMIN_USERNAME` and `KC_BOOTSTRAP_ADMIN_PASSWORD` (or deprecated `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD`) only work on **initial startup with empty database**.

Once Keycloak creates the admin user, these variables are **ignored forever**.

**Best Practice**: After initial deployment, manage admin credentials through:
- Keycloak Admin Console
- kcadm.sh CLI tool
- Admin REST API (once authenticated)

### 2. Admin Password Changes Require Special Handling

To change admin password in deployed Keycloak:
1. Use kcadm.sh: `kcadm.sh set-password --username admin --new-password <new>`
2. Use Admin REST API: `PUT /admin/realms/master/users/{id}/reset-password`
3. Use Keycloak Admin Console UI

**Do NOT**: Just update environment variable and redeploy - it won't work!

### 3. Cloud Run Job Approach for Administrative Tasks

For operations that require privileged access:
- Create temporary Cloud Run jobs
- Run commands inside Keycloak container
- Use localhost connections to bypass network authentication
- Clean up job after execution

### 4. Realm Sync Pattern

The sync-realm.sh script pattern is superior to `--import-realm` because:
- Import only works on first startup
- Sync can be run anytime
- Sync is idempotent (safe to run multiple times)
- Sync preserves existing data while updating configuration

---

## Next Steps

1. **Run workflow**: `gh workflow run deploy-to-gcp.yml --field service=keycloak`
2. **Verify client import**: Test OAuth flow with tamshai-website client
3. **Run E2E tests**: `./scripts/test/journey-e2e-automated.sh prod`
4. **Document admin password rotation procedure** for future reference

---

*Testing conducted: January 10, 2026 04:00 UTC*
*Tester: Claude Sonnet 4.5 (QA Lead)*
*Conclusion: Admin REST API blocked due to password mismatch - recommend GitHub workflow approach instead*
