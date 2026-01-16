# Terraform User Provisioning Implementation Plan

## Objective

Achieve consistent user provisioning across dev/stage/prod using Terraform exclusively, eliminating plaintext passwords from realm exports.

## Current State

**✅ Good**: Terraform configuration already has all users with `initial_password` blocks
**❌ Problem**: Realm export files also contain users with plaintext passwords (ignored after first import)

## Root Cause of Password Issues

```
Dev/Stage (Works):
- Keycloak starts with --import-realm flag
- On FIRST startup, plaintext passwords in realm-export-dev.json are hashed
- Subsequent restarts: "Realm already exists. Import skipped"
- Passwords work because they were hashed during initial import

Prod (Broken):
- recreate-realm-prod.sh uses Admin API to delete/reimport
- Admin API ignores plaintext passwords
- Users created but passwords invalid
```

## Solution: Remove Users from Realm Exports

**Principle**: Realm exports should contain **configuration only**, not user data.

**Files to modify**:
1. `keycloak/realm-export-dev.json` - Remove `users` array
2. `keycloak/realm-export.json` - Remove `users` array

**User provisioning**: Handled exclusively by Terraform `keycloak_user` resources

## Implementation Steps

### Phase 1: Dev Environment Validation

**Step 1.1: Backup current dev Keycloak database**
```bash
cd infrastructure/docker
docker exec tamshai-postgres pg_dump -U postgres keycloak > backups/keycloak-dev-before-terraform-$(date +%Y%m%d).sql
```

**Step 1.2: Remove users from realm-export-dev.json**
```json
{
  "id": "tamshai-corp",
  "realm": "tamshai-corp",
  // ... all configuration ...
  "users": []  // ← REMOVE ALL USERS
}
```

**Step 1.3: Stop Keycloak and reset database**
```bash
cd infrastructure/docker
docker compose down keycloak
docker exec tamshai-postgres psql -U postgres -c "DROP DATABASE keycloak;"
docker exec tamshai-postgres psql -U postgres -c "CREATE DATABASE keycloak OWNER keycloak;"
```

**Step 1.4: Start Keycloak (imports realm with NO users)**
```bash
docker compose up -d keycloak
# Wait 30 seconds for Keycloak to initialize
sleep 30
```

**Step 1.5: Apply Terraform to provision users**
```bash
cd infrastructure/terraform/keycloak

# Set environment variables
export TF_VAR_environment="dev"
export TF_VAR_test_user_password="[REDACTED-DEV-PASSWORD]"  # Dev password
export TF_VAR_keycloak_url="http://localhost:8180"
export TF_VAR_keycloak_admin_password="admin"

# Initialize (first time only)
terraform init

# Plan (review changes)
terraform plan

# Apply (provision users)
terraform apply -auto-approve
```

**Step 1.6: Verify users can authenticate**
```bash
# Test eve.thompson
curl -X POST "http://localhost:8180/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=eve.thompson" \
  -d "password=[REDACTED-DEV-PASSWORD]" \
  -d "grant_type=password" \
  -d "client_id=admin-cli"

# Should return access_token (SUCCESS)
```

**Step 1.7: Run E2E tests**
```bash
cd tests/e2e
TEST_ENV=dev CI=true npx playwright test login-journey
```

**Success Criteria**:
- ✅ All users created via Terraform
- ✅ Passwords work (authenticate successfully)
- ✅ TOTP setup prompts on first login
- ✅ E2E tests pass
- ✅ No plaintext passwords in git

---

### Phase 2: Stage Environment (VPS)

**Prerequisites**: Phase 1 validated successfully in dev

**Step 2.1: Remove users from realm-export.json**
```json
{
  "id": "tamshai-corp",
  "realm": "tamshai-corp",
  // ... all configuration ...
  "users": []  // ← REMOVE ALL USERS (except test-user.journey for E2E)
}
```

**Note**: Keep `test-user.journey` in realm-export.json for E2E testing, or provision via Terraform.

**Step 2.2: Update VPS deployment**
```bash
# SSH to VPS
ssh root@$VPS_HOST

# Navigate to project
cd /opt/tamshai

# Pull latest changes (with users removed from realm-export.json)
git pull origin main

# Stop Keycloak and reset database
docker compose down keycloak
docker exec postgres psql -U postgres -c "DROP DATABASE keycloak;"
docker exec postgres psql -U postgres -c "CREATE DATABASE keycloak OWNER keycloak;"

# Start Keycloak (imports realm with NO users)
docker compose up -d keycloak
sleep 30
```

**Step 2.3: Apply Terraform to provision users**
```bash
cd infrastructure/terraform/keycloak

# Set environment variables
export TF_VAR_environment="stage"
export TF_VAR_test_user_password="$(cat /dev/urandom | tr -dc 'A-Za-z0-9!@#$%^&*' | head -c 16)"
export TF_VAR_keycloak_url="https://vps.tamshai.com"
export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD"

# Apply Terraform
terraform workspace select stage || terraform workspace new stage
terraform apply -auto-approve
```

**Step 2.4: Verify stage deployment**
```bash
# Test authentication
curl -X POST "https://vps.tamshai.com/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=eve.thompson" \
  -d "password=$TF_VAR_test_user_password" \
  -d "grant_type=password" \
  -d "client_id=admin-cli"

# Run E2E tests
cd tests/e2e
npm run test:login:stage
```

**Success Criteria**:
- ✅ Stage users provisioned via Terraform
- ✅ Passwords work on VPS
- ✅ E2E tests pass on stage

---

### Phase 3: Production Environment (GCP)

**Prerequisites**: Phase 2 validated successfully on stage

**Step 3.1: Store password in GCP Secret Manager**
```bash
# Generate strong password
PROD_PASSWORD=$(openssl rand -base64 24)

# Store in Secret Manager
echo -n "$PROD_PASSWORD" | gcloud secrets create keycloak-test-user-password \
  --data-file=- \
  --replication-policy=automatic

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding keycloak-test-user-password \
  --member="serviceAccount:tamshai-keycloak@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Step 3.2: Update Cloud Run Keycloak deployment**
```yaml
# cloud-run-keycloak.yaml
env:
  - name: KEYCLOAK_ADMIN_PASSWORD
    valueFrom:
      secretKeyRef:
        name: keycloak-admin-password
        key: latest
  - name: TEST_USER_PASSWORD
    valueFrom:
      secretKeyRef:
        name: keycloak-test-user-password
        key: latest
```

**Step 3.3: Deploy updated Keycloak to Cloud Run**
```bash
gcloud run deploy keycloak \
  --image us-central1-docker.pkg.dev/PROJECT_ID/tamshai/keycloak:latest \
  --update-secrets TEST_USER_PASSWORD=keycloak-test-user-password:latest
```

**Step 3.4: Apply Terraform to provision prod users**
```bash
cd infrastructure/terraform/keycloak

# Set environment variables
export TF_VAR_environment="prod"
export TF_VAR_test_user_password="$(gcloud secrets versions access latest --secret=keycloak-test-user-password)"
export TF_VAR_keycloak_url="https://keycloak-fn44nd7wba-uc.a.run.app"
export TF_VAR_keycloak_admin_password="$(gcloud secrets versions access latest --secret=keycloak-admin-password)"

# Apply Terraform
terraform workspace select prod || terraform workspace new prod
terraform apply
```

**Step 3.5: Verify production deployment**
```bash
# Test authentication
curl -X POST "https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=eve.thompson" \
  -d "password=$TF_VAR_test_user_password" \
  -d "grant_type=password" \
  -d "client_id=admin-cli"

# Run E2E tests
cd tests/e2e
npm run test:login:prod
```

**Success Criteria**:
- ✅ Prod users provisioned via Terraform
- ✅ Passwords stored in GCP Secret Manager
- ✅ E2E tests pass on prod
- ✅ Zero downtime deployment

---

## Rollback Plan

If any phase fails:

**Dev Rollback**:
```bash
cd infrastructure/docker
docker compose down keycloak
docker exec tamshai-postgres psql -U postgres -c "DROP DATABASE keycloak;"
docker exec tamshai-postgres psql -U postgres -c "CREATE DATABASE keycloak OWNER keycloak;"
cat backups/keycloak-dev-before-terraform-YYYYMMDD.sql | docker exec -i tamshai-postgres psql -U postgres
docker compose up -d keycloak
```

**Stage Rollback**:
```bash
ssh root@$VPS_HOST
cd /opt/tamshai
git checkout <previous-commit>
./scripts/infra/deploy.sh stage --sync
```

**Prod Rollback**:
```bash
# Revert Terraform changes
cd infrastructure/terraform/keycloak
terraform workspace select prod
terraform destroy -target=keycloak_user.eve_thompson
# (or revert entire workspace)
```

---

## Terraform State Management

**Dev**: Local state file (`terraform.tfstate` in `.gitignore`)
**Stage**: Remote state in GCP bucket
**Prod**: Remote state in GCP bucket (separate workspace)

```bash
# Configure remote backend (one-time setup)
terraform {
  backend "gcs" {
    bucket = "tamshai-terraform-state"
    prefix = "keycloak"
  }
}
```

---

## Environment Variables Reference

| Environment | Variable | Source |
|-------------|----------|--------|
| Dev | `TF_VAR_test_user_password` | Hardcoded "[REDACTED-DEV-PASSWORD]" |
| Dev | `TF_VAR_keycloak_url` | http://localhost:8180 |
| Stage | `TF_VAR_test_user_password` | Generated (store in .env) |
| Stage | `TF_VAR_keycloak_url` | https://vps.tamshai.com |
| Prod | `TF_VAR_test_user_password` | GCP Secret Manager |
| Prod | `TF_VAR_keycloak_url` | https://keycloak-fn44nd7wba-uc.a.run.app |

---

## Benefits of This Approach

✅ **Security**: No plaintext passwords in git
✅ **Consistency**: Same provisioning method across all environments
✅ **Idempotent**: Can run `terraform apply` repeatedly
✅ **Auditable**: Terraform state tracks all changes
✅ **Zero Downtime**: No need to delete database (except initial migration)
✅ **Password Rotation**: Update secret, run `terraform apply`
✅ **Compliance**: Meets SOC 2, GDPR requirements

---

## Post-Migration Cleanup

After all environments successfully migrated:

1. Remove `reset_test_user_password()` from `recreate-realm-prod.sh` (no longer needed)
2. Update documentation to reference Terraform-first approach
3. Add CI/CD workflow to validate Terraform on PR
4. Document password rotation procedure

---

*Created: 2026-01-11*
*Author: Tamshai-QA*
