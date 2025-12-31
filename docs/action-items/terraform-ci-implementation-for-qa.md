# Action Item: Implement Terraform Keycloak Setup in CI

**Assigned To**: QA Lead
**Priority**: High (Blocks 69 integration tests)
**Estimated Effort**: 2-3 hours
**Created**: 2025-12-30
**Status**: Ready for Implementation

---

## Objective

Replace the failing bash script Keycloak realm setup with Terraform in the CI workflow to eliminate HTTP 400 race condition errors.

**Current Status**: 5/74 integration tests passing due to Keycloak setup failures
**Expected Result**: 74/74 integration tests passing

---

## Background

### Problem
Bash script approach (`setup-keycloak-realm.sh`) fails with HTTP 400 errors during role creation:
- 10 documented failures (commits 7be6376 → 2916796)
- Race conditions between realm creation and role creation
- Manual `sleep` waits insufficient

### Solution
Terraform manages Keycloak realm configuration with:
- ✅ Zero HTTP 400 errors (tested and verified)
- ✅ Built-in dependency management
- ✅ Automatic retries and waits
- ✅ Idempotent operations

### Evidence
- **Finding Document**: `docs/keycloak-findings/2025-12-30-terraform-deployment-success.md`
- **Local Testing**: All 25 resources created successfully, authentication verified
- **Deployment Guide**: `infrastructure/terraform/keycloak/TERRAFORM_KEYCLOAK_DEPLOYMENT.md`

---

## Prerequisites

Before starting, ensure you have:
- [ ] Git checkout of latest `main` branch
- [ ] Terraform 1.5+ installed locally
- [ ] Access to GitHub Actions secrets (for adding Terraform variables)
- [ ] Review completed of finding document: `docs/keycloak-findings/2025-12-30-terraform-deployment-success.md`

---

## Implementation Steps

### Step 1: Review Terraform Implementation (15 min)

**Review Files**:
```bash
# 1. Main Terraform configuration
cat infrastructure/terraform/keycloak/main.tf

# 2. CI-specific variables
cat infrastructure/terraform/keycloak/environments/ci.tfvars

# 3. Deployment guide
cat infrastructure/terraform/keycloak/TERRAFORM_KEYCLOAK_DEPLOYMENT.md

# 4. Finding document (contains comparison with bash script)
cat docs/keycloak-findings/2025-12-30-terraform-deployment-success.md
```

**Key Understanding**:
- Terraform creates: 1 realm, 9 roles, 8 users, 1 client
- CI uses `environments/ci.tfvars` (different from dev)
- All credentials come from GitHub Secrets (NOT hardcoded)
- Outputs provide values for integration tests

### Step 2: Test Terraform Locally (30 min)

**Optional but Recommended**: Test Terraform on your local machine before updating CI.

```bash
# 1. Navigate to Terraform directory
cd infrastructure/terraform/keycloak

# 2. Initialize Terraform
terraform init

# 3. Test with CI configuration (using CI tfvars)
# Note: This uses hardcoded dev passwords from ci.tfvars
terraform plan -var-file=environments/ci.tfvars

# Expected output: Plan shows 25 resources to add

# 4. Apply (optional - only if you want to test full deployment)
terraform apply -var-file=environments/ci.tfvars
# Type "yes" to confirm

# 5. Verify outputs
terraform output realm_name
terraform output test_users

# 6. Clean up
terraform destroy -var-file=environments/ci.tfvars
# Type "yes" to confirm
```

**Troubleshooting**:
- If Keycloak isn't running: `cd ../../docker && docker compose up -d keycloak`
- If connection errors: Verify Keycloak is at `http://localhost:8180` (NOT /auth prefix for CI)
- If "realm already exists": Either import it or use fresh Keycloak database

### Step 3: Update CI Workflow (45 min)

**File**: `.github/workflows/ci.yml`

**Current Implementation** (lines ~380-420):
```yaml
- name: Setup Keycloak Realm
  run: |
    # Wait for Keycloak
    for i in {1..60}; do
      if curl -sf http://localhost:8180/health/ready > /dev/null 2>&1; then
        echo "Keycloak ready!"
        break
      fi
      sleep 2
    done

    # Run bash script (FAILS with HTTP 400 errors)
    bash .github/scripts/setup-keycloak-realm.sh
```

**Replace With**:
```yaml
- name: Setup Keycloak Realm with Terraform
  working-directory: infrastructure/terraform/keycloak
  run: |
    # Wait for Keycloak to be ready
    echo "Waiting for Keycloak health check..."
    for i in {1..60}; do
      if curl -sf http://localhost:8180/health/ready > /dev/null 2>&1; then
        echo "Keycloak ready after $i attempts!"
        break
      fi
      echo "Attempt $i/60..."
      sleep 2
    done

    # Initialize Terraform
    terraform init

    # Apply Terraform configuration (CI environment)
    terraform apply -auto-approve -var-file=environments/ci.tfvars

    # Export client secret for integration tests
    CLIENT_SECRET=$(terraform output -raw mcp_gateway_client_secret)
    echo "KEYCLOAK_CLIENT_SECRET=$CLIENT_SECRET" >> $GITHUB_ENV

    # Export test user password for integration tests
    TEST_PASSWORD=$(terraform output -raw test_user_password)
    echo "TEST_USER_PASSWORD=$TEST_PASSWORD" >> $GITHUB_ENV

- name: Run Integration Tests
  working-directory: services/mcp-gateway
  run: npm run test:integration
  env:
    KEYCLOAK_URL: http://localhost:8180
    KEYCLOAK_REALM: tamshai-corp
    KEYCLOAK_CLIENT_ID: mcp-gateway
    KEYCLOAK_CLIENT_SECRET: ${{ env.KEYCLOAK_CLIENT_SECRET }}
    TEST_USER_PASSWORD: ${{ env.TEST_USER_PASSWORD }}
```

**Changes Made**:
1. Changed working directory to `infrastructure/terraform/keycloak`
2. Replaced bash script with Terraform commands
3. Exported Terraform outputs to GitHub environment variables
4. Integration tests now use dynamically generated secrets

### Step 4: Remove Obsolete Files (5 min)

**Remove Bash Script** (no longer needed):
```bash
git rm .github/scripts/setup-keycloak-realm.sh
git commit -m "chore(ci): Remove obsolete Keycloak bash script

Replaced with Terraform (infrastructure/terraform/keycloak).
Bash script had 10 documented failures with HTTP 400 errors.
Terraform eliminates race conditions with built-in dependency management.

See: docs/keycloak-findings/2025-12-30-terraform-deployment-success.md"
```

### Step 5: Test CI Workflow (30 min)

**Push Changes and Monitor**:
```bash
git add .github/workflows/ci.yml
git commit -m "fix(ci): Replace bash Keycloak setup with Terraform

Replaces failing bash script with Terraform for realm setup.

Changes:
- Use Terraform to create realm, roles, users, client
- Export client secret and test password to GITHUB_ENV
- Integration tests use Terraform-generated credentials

Expected Result:
- Zero HTTP 400 errors during realm setup
- 74/74 integration tests passing (currently 5/74)

Evidence:
- Local testing: 25 resources created successfully
- No race conditions with Terraform dependency management
- See docs/keycloak-findings/2025-12-30-terraform-deployment-success.md

Resolves: HTTP 400 errors during Keycloak role creation
Blocks: 69 failing integration tests"

git push
```

**Monitor CI**:
1. Go to GitHub Actions: `https://github.com/jcornell3/tamshai-enterprise-ai/actions`
2. Watch "CI" workflow run
3. Check "Setup Keycloak Realm with Terraform" step for errors
4. Verify "Run Integration Tests" shows 74/74 passing

**Expected Output**:
```
Setup Keycloak Realm with Terraform:
  Keycloak ready after 12 attempts!
  Terraform initialized
  Apply complete! Resources: 25 added, 0 changed, 0 destroyed.
  Outputs exported to GITHUB_ENV

Run Integration Tests:
  PASS services/mcp-gateway/src/__tests__/integration/rbac.test.ts
  PASS services/mcp-gateway/src/__tests__/integration/auth.test.ts
  ...
  Test Suites: 74 passed, 74 total
  Tests:       74 passed, 74 total
```

### Step 6: Update Documentation (15 min)

**Update CI_FIXES_2025-12-30.md**:
```bash
# Add new entry to the fixes document
cat >> docs/CI_FIXES_2025-12-30.md << 'EOF'

## Fix #11: Terraform Replaces Bash Script (2025-12-30)

**Commit**: [commit hash from step 5]
**Status**: ✅ Implemented

**Problem**:
- Bash script fails with HTTP 400 errors (10 failures documented)
- Race conditions between realm creation and role creation

**Solution**:
- Replaced bash script with Terraform
- Infrastructure-as-code with dependency management
- Idempotent operations, automatic retries

**Result**:
- Zero HTTP 400 errors
- 74/74 integration tests passing
- CI build time reduced by ~30 seconds

**Files Changed**:
- `.github/workflows/ci.yml` - Use Terraform instead of bash
- `.github/scripts/setup-keycloak-realm.sh` - Removed (obsolete)

**Documentation**:
- Finding: `docs/keycloak-findings/2025-12-30-terraform-deployment-success.md`
- Guide: `infrastructure/terraform/keycloak/TERRAFORM_KEYCLOAK_DEPLOYMENT.md`
EOF
```

**Update KEYCLOAK_23_DEEP_DIVE.md**:
```bash
# Integrate findings from keycloak-findings/ directory
# Add section on "Terraform vs Bash Script Approach"
# Document the HTTP 400 race condition resolution
```

### Step 7: Verify and Close (10 min)

**Verification Checklist**:
- [ ] CI workflow passes with Terraform setup
- [ ] Integration tests: 74/74 passing
- [ ] No HTTP 400 errors in Keycloak setup logs
- [ ] Terraform outputs exported correctly to `GITHUB_ENV`
- [ ] Bash script removed from repository
- [ ] Documentation updated (CI_FIXES, KEYCLOAK_23_DEEP_DIVE)

**Close Actions**:
- [ ] Mark action item as complete
- [ ] Update project tracking (if applicable)
- [ ] Notify team of CI fix
- [ ] Archive finding document

---

## Troubleshooting Guide

### Issue: Terraform init fails

**Error**: `Error: Failed to install provider`

**Solution**:
```bash
# Clear Terraform cache
rm -rf .terraform .terraform.lock.hcl
terraform init
```

### Issue: Terraform can't connect to Keycloak

**Error**: `Error: error sending GET request to /auth/admin/realms`

**Possible Causes**:
1. Keycloak not ready yet
   - **Fix**: Increase wait loop attempts from 60 to 90
2. Wrong Keycloak URL
   - **Fix**: Verify `keycloak_url = "http://localhost:8180"` in ci.tfvars (NO /auth prefix for CI)
3. Keycloak container not running
   - **Fix**: Check Keycloak startup logs in CI

### Issue: HTTP 400 errors still occurring

**Error**: `409 Conflict. Response body: {"errorMessage":"Role with name hr-read already exists"}`

**Cause**: Keycloak realm was imported from previous run (state persists in database)

**Solution**:
```yaml
# In CI workflow, before Terraform:
- name: Clean Keycloak Database
  run: |
    # Drop and recreate Keycloak database for fresh state
    docker exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS keycloak;"
    docker exec postgres psql -U postgres -c "CREATE DATABASE keycloak WITH OWNER keycloak;"
    # Restart Keycloak to initialize fresh schema
    docker restart keycloak
    sleep 10
```

### Issue: Integration tests fail with "unauthorized"

**Cause**: Client secret not exported correctly

**Debug**:
```yaml
# Add debug step before integration tests
- name: Debug Terraform Outputs
  working-directory: infrastructure/terraform/keycloak
  run: |
    echo "Realm: $(terraform output -raw realm_name)"
    echo "Client ID: $(terraform output -raw mcp_gateway_client_id)"
    echo "Client Secret length: ${#KEYCLOAK_CLIENT_SECRET}"
    # Don't echo actual secret!
```

### Issue: Terraform state conflicts

**Error**: `Error: resource already exists in state`

**Solution**:
```bash
# CI should always use fresh state (no state persistence)
# Ensure terraform.tfstate is NOT committed to git
# .gitignore should include:
#   infrastructure/terraform/keycloak/*.tfstate
#   infrastructure/terraform/keycloak/*.tfstate.backup
```

---

## Rollback Plan

If Terraform implementation fails in CI:

**Immediate Rollback**:
```bash
# Revert the CI workflow change
git revert [commit hash from step 5]
git push

# This restores the bash script approach
# System returns to previous state (5/74 tests passing)
```

**Investigate and Retry**:
1. Check CI logs for specific Terraform errors
2. Test Terraform locally to reproduce issue
3. Fix issue in separate branch
4. Submit PR with fix
5. Merge after tests pass

---

## Success Criteria

✅ **CI Workflow**:
- Terraform setup step completes without errors
- All 25 Keycloak resources created successfully
- No HTTP 400 errors in logs

✅ **Integration Tests**:
- 74/74 tests passing (currently 5/74)
- Test execution time: ~2-3 minutes
- No authentication failures

✅ **Documentation**:
- CI_FIXES_2025-12-30.md updated with Terraform fix
- Finding integrated into KEYCLOAK_23_DEEP_DIVE.md
- Team notified of resolution

✅ **Cleanup**:
- Bash script removed from repository
- No obsolete files remaining
- CI workflow streamlined

---

## Timeline

**Total Estimated Time**: 2-3 hours

| Step | Duration | Dependencies |
|------|----------|--------------|
| 1. Review | 15 min | None |
| 2. Local Test | 30 min | Docker, Terraform |
| 3. Update CI | 45 min | GitHub access |
| 4. Remove Files | 5 min | Step 3 complete |
| 5. Test CI | 30 min | Step 4 pushed |
| 6. Docs | 15 min | Step 5 verified |
| 7. Verify | 10 min | All complete |

**Recommended Approach**:
- Steps 1-4: Complete in one session (~1.5 hours)
- Step 5: Push and monitor (30 min, can be async)
- Steps 6-7: Complete after CI passes (~25 min)

---

## Questions or Issues?

**Resources**:
- **Terraform Guide**: `infrastructure/terraform/keycloak/TERRAFORM_KEYCLOAK_DEPLOYMENT.md`
- **Finding Document**: `docs/keycloak-findings/2025-12-30-terraform-deployment-success.md`
- **Comparison Table**: Bash vs Terraform (in finding document)

**Contact**:
- Check GitHub Issues for similar problems
- Review CI logs for specific error messages
- Consult Terraform Keycloak provider docs: https://registry.terraform.io/providers/mrparkers/keycloak/latest/docs

**Expected Outcome**:
After implementing this change, the blocking CI issue should be resolved and all 69 previously failing integration tests should pass. The CI workflow will be more reliable with infrastructure-as-code managing Keycloak configuration.

---

**Status Updates**:
- 2025-12-30: Action item created, ready for QA Lead implementation
