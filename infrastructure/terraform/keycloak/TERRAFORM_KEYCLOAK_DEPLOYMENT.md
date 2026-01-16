# Terraform Keycloak Deployment Guide

## Overview

This Terraform configuration manages Keycloak realm setup across all environments (dev, ci, stage, prod). It replaces bash scripts with infrastructure-as-code for consistency and reliability.

**Benefits**:
- ✅ **Environment Alignment**: Same code for dev/ci/stage/prod
- ✅ **Built-in Dependencies**: Terraform waits for realm readiness automatically
- ✅ **Idempotent**: Can rerun safely without errors
- ✅ **State Management**: Detects drift with `terraform plan`
- ✅ **No Race Conditions**: Eliminates HTTP 400 errors from bash scripts

---

## Directory Structure

```
infrastructure/terraform/keycloak/
├── versions.tf                 # Terraform and provider versions
├── provider.tf                 # Keycloak provider configuration
├── variables.tf                # Input variables
├── main.tf                     # Realm, roles, users, client resources
├── outputs.tf                  # Outputs for CI and integration tests
├── environments/
│   ├── dev.tfvars             # Local Docker configuration
│   ├── ci.tfvars              # GitHub Actions configuration
│   ├── stage.tfvars           # VPS staging configuration
│   └── prod.tfvars            # GCP production configuration (future)
└── TERRAFORM_KEYCLOAK_DEPLOYMENT.md  # This file
```

---

## Prerequisites

### All Environments

1. **Terraform** >= 1.5.0
   ```bash
   terraform version
   ```

2. **Keycloak** 23.0+ running and accessible

3. **Admin Credentials** for Keycloak

### Local Development

1. **Docker Desktop** running
2. Start Keycloak via docker-compose:
   ```bash
   cd infrastructure/docker
   docker compose up -d keycloak
   ```

3. Wait for Keycloak to be ready:
   ```bash
   # Wait for admin console
   for i in {1..30}; do
     if curl -sf http://localhost:8180/ | grep -q "Keycloak"; then
       echo "Keycloak ready!"
       sleep 5  # Grace period
       break
     fi
     sleep 2
   done
   ```

---

## Quick Start

### 1. Local Development Deployment

```bash
# Navigate to Keycloak Terraform directory
cd infrastructure/terraform/keycloak

# Initialize Terraform (first time only)
terraform init

# Review the plan
terraform plan -var-file=environments/dev.tfvars

# Apply configuration
terraform apply -var-file=environments/dev.tfvars

# Verify outputs
terraform output realm_name
terraform output test_users
```

**Expected Output**:
```
Apply complete! Resources: 25 added, 0 changed, 0 destroyed.

Outputs:

environment = "dev"
keycloak_url = "http://localhost:8180"
realm_name = "tamshai-corp"
roles_created = [
  "hr-read",
  "hr-write",
  "finance-read",
  "finance-write",
  "sales-read",
  "sales-write",
  "support-read",
  "support-write",
  "executive",
]
test_users = <sensitive>
```

### 2. View Sensitive Outputs

```bash
# Get client secret for MCP Gateway
terraform output -raw mcp_gateway_client_secret

# Get all test user details
terraform output -json test_users | jq .
```

### 3. Verify in Keycloak UI

1. Open Keycloak Admin Console: http://localhost:8180/admin
2. Login: `admin` / `admin`
3. Select realm: `tamshai-corp`
4. Verify:
   - **Clients**: `mcp-gateway` exists
   - **Roles**: 9 roles created (hr-read, hr-write, etc.)
   - **Users**: 8 users created (alice.chen, bob.martinez, etc.)

### 4. Test User Authentication

```bash
# Get token for alice.chen (HR Manager)
curl -X POST http://localhost:8180/realms/tamshai-corp/protocol/openid-connect/token \
  -d "client_id=mcp-gateway" \
  -d "client_secret=test-client-secret" \
  -d "username=alice.chen" \
  -d "password=[REDACTED-DEV-PASSWORD]" \
  -d "grant_type=password" \
  -d "scope=openid" | jq .

# Expected: access_token, refresh_token, etc.
```

---

## Environment-Specific Deployments

### CI Environment (GitHub Actions)

**File**: `.github/workflows/ci.yml`

```yaml
- name: Setup Keycloak with Terraform
  working-directory: infrastructure/terraform/keycloak
  run: |
    # Wait for Keycloak
    for i in {1..30}; do
      if curl -sf http://localhost:8180/ | grep -q "Keycloak"; then
        echo "Keycloak ready!"
        sleep 5
        break
      fi
      sleep 2
    done

    # Initialize and apply
    terraform init
    terraform apply -auto-approve -var-file=environments/ci.tfvars

    # Export client secret for tests
    echo "KEYCLOAK_CLIENT_SECRET=$(terraform output -raw mcp_gateway_client_secret)" >> $GITHUB_ENV

- name: Run Integration Tests
  working-directory: services/mcp-gateway
  run: npm run test:integration
  env:
    KEYCLOAK_URL: http://localhost:8180
    KEYCLOAK_REALM: tamshai-corp
    KEYCLOAK_CLIENT_ID: mcp-gateway
    KEYCLOAK_CLIENT_SECRET: ${{ env.KEYCLOAK_CLIENT_SECRET }}
```

### Stage Environment (VPS)

**Prerequisites**:
1. VPS running (get IP from: `terraform output -raw vps_ip`)
2. Keycloak accessible at https://<vps-ip>/auth
3. Admin credentials stored securely

**Deployment**:
```bash
cd infrastructure/terraform/keycloak

# Set credentials via environment variables (DO NOT commit)
export TF_VAR_keycloak_admin_password="YOUR_STAGE_ADMIN_PASSWORD"
export TF_VAR_test_user_password="YOUR_STAGE_TEST_PASSWORD"
export TF_VAR_mcp_gateway_client_secret="YOUR_STAGE_CLIENT_SECRET"

# Apply configuration
terraform init
terraform plan -var-file=environments/stage.tfvars
terraform apply -var-file=environments/stage.tfvars
```

---

## Resources Created

### 1. Realm: `tamshai-corp`

- **Display Name**: Tamshai Corporation
- **Access Token Lifespan**: 5 minutes (dev/ci), 15 minutes (prod)
- **SSL Required**: External (localhost exempt)
- **Email Verification**: Disabled (dev/ci), Enabled (prod)
- **Password Policy**: Length 8+ (dev/ci), Length 12+ with complexity (prod)

### 2. Roles (9 total)

| Role | Description |
|------|-------------|
| `hr-read` | Read access to HR data |
| `hr-write` | Write access to HR data |
| `finance-read` | Read access to finance data |
| `finance-write` | Write access to finance data |
| `sales-read` | Read access to sales data |
| `sales-write` | Write access to sales data |
| `support-read` | Read access to support data |
| `support-write` | Write access to support data |
| `executive` | Composite role (all read roles) |

### 3. Users (8 total)

| Username | Name | Email | Roles | Use Case |
|----------|------|-------|-------|----------|
| alice.chen | Alice Chen | alice@tamshai.com | hr-read, hr-write | HR Manager |
| bob.martinez | Bob Martinez | bob@tamshai.com | finance-read, finance-write | Finance Director |
| carol.johnson | Carol Johnson | carol@tamshai.com | sales-read, sales-write | VP of Sales |
| dan.williams | Dan Williams | dan@tamshai.com | support-read, support-write | Support Director |
| eve.thompson | Eve Thompson | eve@tamshai.com | executive | CEO |
| frank.davis | Frank Davis | frank@tamshai.com | (none) | Intern |
| nina.patel | Nina Patel | nina@tamshai.com | (none) | Engineering Manager |
| marcus.johnson | Marcus Johnson | marcus@tamshai.com | (none) | Software Engineer |

**Password** (dev/ci): `[REDACTED-DEV-PASSWORD]`

### 4. Client: `mcp-gateway`

- **Client ID**: `mcp-gateway`
- **Client Secret**: `test-client-secret` (dev/ci)
- **Access Type**: Confidential
- **Standard Flow**: Enabled (OAuth authorization code flow)
- **Direct Access Grants**: Enabled (password grant for tests)
- **Service Accounts**: Enabled
- **Valid Redirect URIs**: Environment-specific

---

## State Management

### Local State (Dev)

By default, Terraform stores state locally in `terraform.tfstate`.

**WARNING**: Do NOT commit `terraform.tfstate` to git (already in `.gitignore`).

### Remote State (CI/Stage/Prod)

For CI and production, use remote state backend:

**File**: `backend.tf` (create if needed)

```hcl
terraform {
  backend "s3" {
    bucket = "tamshai-terraform-state"
    key    = "keycloak/terraform.tfstate"
    region = "us-west-2"

    # Enable state locking
    dynamodb_table = "terraform-locks"
  }
}
```

Or use Terraform Cloud:

```hcl
terraform {
  backend "remote" {
    organization = "tamshai-corp"

    workspaces {
      prefix = "keycloak-"
    }
  }
}
```

---

## Troubleshooting

### Issue: `Error: Failed to create realm`

**Cause**: Keycloak not ready or admin credentials incorrect

**Fix**:
```bash
# Verify Keycloak is running
curl -sf http://localhost:8180/ | grep "Keycloak"

# Test admin credentials
curl -X POST http://localhost:8180/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq .

# Should return access_token
```

### Issue: `Error: Failed to create role` (HTTP 400)

**Cause**: This was the issue with bash scripts. Terraform handles this automatically.

**Why Terraform Fixes This**:
- Terraform's Keycloak provider waits for realm to be fully ready
- Built-in retry logic for transient failures
- Dependency graph ensures roles wait for realm

**Verification**:
```bash
# Enable debug logging
export TF_LOG=DEBUG
terraform apply -var-file=environments/dev.tfvars

# Look for retry attempts in logs
grep -i "retry" terraform.log
```

### Issue: `Error: realm already exists`

**Cause**: Trying to create a realm that already exists

**Fix**: Import existing realm into Terraform state
```bash
# Import realm
terraform import keycloak_realm.tamshai_corp tamshai-corp

# Import will fail if resource differs - safer to destroy and recreate in dev
terraform destroy -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars
```

### Issue: State drift detected

**Symptom**: `terraform plan` shows changes even though nothing changed in code

**Cause**: Manual changes made in Keycloak UI

**Fix**:
```bash
# See what changed
terraform plan -var-file=environments/dev.tfvars

# Option 1: Apply Terraform config (revert manual changes)
terraform apply -var-file=environments/dev.tfvars

# Option 2: Update Terraform to match current state (if manual changes were intentional)
terraform refresh -var-file=environments/dev.tfvars
```

---

## Updating Configuration

### Adding a New Role

1. Edit `main.tf`:
```hcl
resource "keycloak_role" "new_role" {
  realm_id    = keycloak_realm.tamshai_corp.id
  name        = "new-role-name"
  description = "Description of the new role"
}
```

2. Add to outputs in `outputs.tf`:
```hcl
output "roles_created" {
  value = [
    # ... existing roles
    keycloak_role.new_role.name,
  ]
}
```

3. Apply:
```bash
terraform plan -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars
```

### Adding a New User

1. Edit `main.tf`:
```hcl
resource "keycloak_user" "new_user" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "new.user"
  enabled    = true
  email      = "new.user@tamshai.com"
  first_name = "New"
  last_name  = "User"

  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}

resource "keycloak_user_roles" "new_user_roles" {
  realm_id = keycloak_realm.tamshai_corp.id
  user_id  = keycloak_user.new_user.id

  role_ids = [
    keycloak_role.some_role.id,
  ]
}
```

2. Apply changes

### Changing Token Lifetimes

Edit `main.tf`:
```hcl
resource "keycloak_realm" "tamshai_corp" {
  # ...
  access_token_lifespan = "10m"  # Changed from 5m
  # ...
}
```

---

## Security Considerations

### Development Environment

- **Credentials**: Hardcoded in `dev.tfvars` (acceptable for local dev)
- **State File**: Contains secrets, stored locally (NOT in git)
- **TLS**: Skip verification for localhost (acceptable)

### CI Environment

- **Credentials**: Hardcoded in `ci.tfvars` (acceptable for ephemeral CI)
- **State File**: Discarded after CI run (no persistence needed)
- **TLS**: Skip verification (CI uses localhost)

### Stage/Production Environments

- **Credentials**: MUST use environment variables or secret managers
  ```bash
  export TF_VAR_keycloak_admin_password="$(gcloud secrets versions access latest --secret=keycloak-admin-password)"
  export TF_VAR_test_user_password="$(gcloud secrets versions access latest --secret=test-user-password)"
  export TF_VAR_mcp_gateway_client_secret="$(gcloud secrets versions access latest --secret=mcp-client-secret)"
  ```

- **State File**: MUST use remote backend (S3, GCS, Terraform Cloud)
- **TLS**: MUST validate certificates (`tls_insecure_skip_verify = false`)
- **Passwords**: MUST be strong, randomly generated
- **MFA**: MUST be enabled for admin users

---

## Comparison: Bash Script vs Terraform

| Aspect | Bash Script | Terraform |
|--------|-------------|-----------|
| **Race Conditions** | HTTP 400 errors (10 failures) | ✅ No errors (built-in waits) |
| **Idempotency** | Custom logic required | ✅ Built-in |
| **State Drift** | No detection | ✅ `terraform plan` shows drift |
| **Dependencies** | Manual wait loops | ✅ Automatic dependency graph |
| **Error Handling** | Custom HTTP code checks | ✅ Provider handles retries |
| **Environment Alignment** | Copy/paste scripts | ✅ Same code, different tfvars |
| **Secrets Management** | Hardcoded in script | ✅ Variables/secret backends |
| **Rollback** | Manual | ✅ `terraform destroy` |
| **Debugging** | `echo` statements | ✅ `TF_LOG=DEBUG` |
| **Learning Curve** | Low (bash knowledge) | Medium (Terraform knowledge) |

---

## Next Steps

1. **Test in Dev**: Verify Terraform works with local Docker Keycloak
2. **Update CI**: Replace bash script with Terraform in `.github/workflows/ci.yml`
3. **Deploy to Stage**: Test Terraform against VPS staging environment
4. **Document Findings**: Feed discoveries back to `KEYCLOAK_23_DEEP_DIVE.md`
5. **Production Ready**: Configure remote state and secret management for prod

---

## Maintenance

### Keep Terraform Provider Updated

```bash
# Check for provider updates
terraform init -upgrade

# Review changelog
# https://github.com/mrparkers/terraform-provider-keycloak/releases
```

### Backup State File

```bash
# Before major changes, backup state
cp terraform.tfstate terraform.tfstate.backup.$(date +%Y%m%d-%H%M%S)
```

### Regular State Refresh

```bash
# Sync state with actual Keycloak configuration
terraform refresh -var-file=environments/dev.tfvars
```

---

## Testing Results (2025-12-30)

### Successful Local Docker Deployment

**Test Environment**:
- Keycloak 24.0.5
- PostgreSQL 16
- Terraform 1.10.3
- Keycloak Provider 4.4.0

**Test Procedure**:
1. Started fresh Keycloak container (no realm import)
2. Dropped and recreated keycloak database
3. Ran `terraform apply -var-file=environments/dev.tfvars`
4. Verified resource creation
5. Tested authentication with created users

**Results**: ✅ **All tests passed**

```
Apply complete! Resources: 25 added, 0 changed, 0 destroyed.

Resources Created:
- 1 realm (tamshai-corp)
- 9 roles (hr-read, hr-write, finance-read, finance-write, sales-read, sales-write, support-read, support-write, executive)
- 8 users (alice.chen, bob.martinez, carol.johnson, dan.williams, eve.thompson, frank.davis, nina.patel, marcus.johnson)
- 1 OpenID client (mcp-gateway)
- 5 role assignments
```

**Authentication Test**:
```bash
curl -X POST http://localhost:8180/auth/realms/tamshai-corp/protocol/openid-connect/token \
  -d "client_id=mcp-gateway" \
  -d "client_secret=test-client-secret" \
  -d "username=alice.chen" \
  -d "password=[REDACTED-DEV-PASSWORD]" \
  -d "grant_type=password" \
  -d "scope=openid"

# Result: ✅ Successfully returned access_token
```

### Key Discoveries

#### 1. KC_HTTP_RELATIVE_PATH Configuration

**Issue**: Initial terraform apply failed with connection errors to http://localhost:8180/

**Root Cause**: docker-compose.yml sets `KC_HTTP_RELATIVE_PATH: /auth`, causing Keycloak to run at http://localhost:8180/auth not root.

**Fix**: Updated `environments/dev.tfvars`:
```hcl
# Before:
keycloak_url = "http://localhost:8180"

# After:
keycloak_url = "http://localhost:8180/auth"
```

**Impact**:
- Affects ALL Keycloak URLs in dev environment
- Admin console: http://localhost:8180/auth/admin
- Realms: http://localhost:8180/auth/realms/{realm}
- Health check: http://localhost:8180/auth/health/ready

**Action for CI**: Ensure ci.tfvars uses correct URL with /auth prefix if CI Keycloak uses same configuration.

#### 2. Database Persistence

**Discovery**: Keycloak realm data persists in PostgreSQL even when container is removed.

**Implication**:
- Removing `tamshai-keycloak` container does NOT remove realm data
- Must drop/recreate `keycloak` database for truly fresh test
- In CI: Fresh Keycloak container + fresh database = clean slate for Terraform

**Testing Procedure for Fresh Deployment**:
```bash
# Stop Keycloak
docker compose stop keycloak

# Drop and recreate database
docker compose exec postgres psql -U postgres -d postgres \
  -c "DROP DATABASE keycloak;"
docker compose exec postgres psql -U postgres -d postgres \
  -c "CREATE DATABASE keycloak WITH OWNER keycloak;"

# Restart Keycloak (will initialize fresh schema)
docker compose up -d keycloak

# Wait for health check
for i in {1..40}; do
  if curl -sf http://localhost:8180/auth/health/ready > /dev/null 2>&1; then
    echo "Keycloak ready!"
    break
  fi
  sleep 3
done

# Run Terraform
cd infrastructure/terraform/keycloak
terraform apply -var-file=environments/dev.tfvars
```

#### 3. Comparison with Bash Script Approach

**Bash Script Issues** (from CI failures):
- HTTP 400 errors during role creation (10 failures documented)
- Race conditions between realm creation and role creation
- Manual wait loops (`sleep 10`) insufficient
- No detection of when realm is "truly ready" for role creation

**Terraform Approach** (tested successfully):
- ✅ Zero HTTP 400 errors
- ✅ Built-in dependency management (roles wait for realm)
- ✅ Provider handles retries and waits automatically
- ✅ Idempotent - can rerun safely without errors
- ✅ State management detects drift

**Evidence**: Terraform completed all 25 resources in single apply with no errors or retries needed.

---

## References

- **Terraform Keycloak Provider**: https://registry.terraform.io/providers/mrparkers/keycloak/latest/docs
- **Keycloak Admin REST API**: https://www.keycloak.org/docs-api/23.0/rest-api/
- **Project Documentation**: `docs/KEYCLOAK_23_DEEP_DIVE.md`
- **CI Fixes**: `docs/CI_FIXES_2025-12-30.md`

---

**Created**: 2025-12-30
**Author**: Tamshai QA Team
**Purpose**: Environment alignment (dev/ci/stage/prod) via Infrastructure-as-Code
**Status**: ✅ Tested successfully - Local Docker deployment complete (2025-12-30)
**Next Steps**: Update CI workflow to use Terraform instead of bash scripts
