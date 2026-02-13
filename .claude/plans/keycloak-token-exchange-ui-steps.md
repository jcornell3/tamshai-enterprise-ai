# Keycloak Token Exchange - Admin UI Configuration Steps

**Purpose**: Complete token exchange configuration using Keycloak Admin UI (workaround for API issue)
**Time Required**: 10-15 minutes
**Prerequisites**: Dev environment running (`terraform apply` complete)

---

## Prerequisites Check

- [ ] Services running: `docker compose ps` (all healthy)
- [ ] Keycloak accessible: <http://localhost:8180/auth>
- [ ] Features enabled: Check logs for `Preview features enabled: admin-fine-grained-authz:v1, token-exchange:v1`

---

## Step 1: Access Keycloak Admin Console

1. **URL**: <http://localhost:8180/auth/admin>
2. **Credentials**:
   - Username: `admin`
   - Password: `admin` (from `.env` file `KEYCLOAK_ADMIN_PASSWORD`)
3. **Select Realm**: `tamshai-corp` (top-left dropdown)

---

## Step 2: Verify Client Exists

1. Navigate: **Clients** (left sidebar)
2. Search: `mcp-integration-runner`
3. **Verify**:
   - [x] Client exists
   - [x] Service Accounts Enabled = ON
   - [x] Authorization Enabled = ON (if not, toggle ON and save)

**If client doesn't exist**: Run this first:

```bash
cd infrastructure/docker
source .env
# See keycloak-token-exchange-blocking-issue.md for client creation script
```

---

## Step 3: Verify Service Account User

1. Navigate: **Users** (left sidebar)
2. Search: `service-account-mcp-integration-runner`
3. **Verify**: User exists
4. Click on user → **Role Mappings** tab
5. **Verify**: `impersonation` role assigned under realm-management client roles

**If role missing**:
- Filter by clients: `realm-management`
- Available roles: Find `impersonation`
- Click **Add selected**

---

## Step 4: Enable Users Permissions (Critical)

1. Navigate: **Users** (left sidebar)
2. Click: **Permissions** tab (top of page)
3. **Toggle**: "Permissions Enabled" = ON
4. **Click**: Save (if prompted)

**Expected Result**: Page shows several permission links:
- view
- manage
- map-roles
- manage-group-membership
- **impersonate** ⬅️ This is what we need
- user-impersonated

---

## Step 5: Create Client Policy for Impersonation

1. **Still on Users Permissions page**
2. **Click**: `impersonate` link
3. You're now viewing: "admin-impersonating.permission.users"
4. **Click**: "Policies" tab (top of permission page)
5. **Current State**: Should show "No policies" or empty list
6. **Click**: "Create policy" dropdown → **Client**
7. **Fill in form**:
   - Name: `mcp-integration-runner-policy`
   - Description: `Allow MCP integration runner to impersonate users`
   - Clients: Start typing "mcp-integration", select `mcp-integration-runner`
   - Logic: POSITIVE
   - Decision Strategy: UNANIMOUS (default)
8. **Click**: Save

**Expected Result**: Policy created, shown in policies list

---

## Step 6: Bind Policy to Impersonate Permission

1. **Still on impersonate permission page**
2. **Click**: "Settings" tab
3. **Section**: Apply Policy
4. **Field**: Policies → Click dropdown
5. **Select**: `mcp-integration-runner-policy`
6. **Decision Strategy**: AFFIRMATIVE (default is fine)
7. **Click**: Save

**Expected Result**: Policy now bound to permission

---

## Step 7: Verify Configuration

### Via Admin UI

1. Return to: Users → Permissions → impersonate
2. **Settings tab**: Should show policy in "Apply Policy" field
3. **Policies tab**: Should list the policy

### Via REST API (Optional)

```bash
cd infrastructure/docker
source .env

TOKEN=$(curl -s -X POST "http://localhost:8180/auth/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${KEYCLOAK_ADMIN}" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

# Get impersonate permission
curl -s -X GET "http://localhost:8180/auth/admin/realms/tamshai-corp/clients/f0408dd8-81f9-4bc9-8207-fc1c782c0070/authz/resource-server/permission/efd9e24d-0f0e-462b-8c91-1dcd16bde196" \
  -H "Authorization: Bearer $TOKEN" | jq '{name, policies}'
```

**Expected Output**:

```json
{
  "name": "admin-impersonating.permission.users",
  "policies": [
    "cfdb972d-6ce9-4fdf-9216-a83d71707ec1"
  ]
}
```

---

## Step 8: Test Token Exchange

### Quick Manual Test

```bash
cd infrastructure/docker
source .env

# URL encode the secret
SECRET_ENCODED="cQFv7tO4FZPQS6my5YF%2BcRD7Z3XJJ6owuZWbhqdFXuc%3D"

# Get service token
SERVICE_TOKEN=$(curl -s -X POST "http://localhost:8180/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=mcp-integration-runner" \
  -d "client_secret=$SECRET_ENCODED" \
  -d "grant_type=client_credentials" | jq -r '.access_token')

echo "Service token acquired: ${SERVICE_TOKEN:0:50}..."

# Exchange for alice.chen
RESULT=$(curl -s -X POST "http://localhost:8180/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=mcp-integration-runner" \
  -d "client_secret=$SECRET_ENCODED" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=$SERVICE_TOKEN" \
  -d "requested_subject=alice.chen")

echo "$RESULT" | jq '.'
```

**Expected Result**:

```json
{
  "access_token": "eyJhbGc...",
  "expires_in": 300,
  "refresh_expires_in": 0,
  "token_type": "Bearer",
  "not-before-policy": 0,
  "scope": "profile email"
}
```

**If you see an error**:

```json
{
  "error": "access_denied",
  "error_description": "Client not allowed to exchange"
}
```

→ Policy not properly bound, revisit Step 6

### Run Integration Tests

```bash
cd tests/integration
npm test -- auth-token-exchange.test.ts
```

**Expected**: 16 passing tests

---

## Step 9: Export Realm for Idempotency

### Export via Docker

```bash
cd infrastructure/docker

# Export realm to temp directory
docker compose exec keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp/export \
  --realm tamshai-corp \
  --users realm_file

# Copy export from container to host
docker compose cp keycloak:/tmp/export/tamshai-corp-realm.json ./realm-export-new.json

# Review the export
head -50 ./realm-export-new.json
```

### Update Realm Export File

```bash
# Backup current export
cp ../../keycloak/realm-export-dev.json ../../keycloak/realm-export-dev.json.backup

# Replace with new export
# CAREFUL: Review diff first!
diff ../../keycloak/realm-export-dev.json ./realm-export-new.json | head -100

# If diff looks good, update
cp ./realm-export-new.json ../../keycloak/realm-export-dev.json
```

### Alternative: Manual Merge

If export is too large or contains unwanted changes:
1. Open `realm-export-dev.json` in editor
2. Find the `authorizationSettings` section
3. Manually add the client policy and permission binding
4. Save file

---

## Step 10: Verify Idempotency

### Test Phoenix Rebuild

```bash
cd infrastructure/terraform/dev

# Destroy and rebuild
terraform destroy -var-file=dev.tfvars -auto-approve
terraform apply -var-file=dev.tfvars -auto-approve

# Wait for services (~5 minutes)

# Test token exchange again
cd ../../../tests/integration
npm test -- auth-token-exchange.test.ts
```

**Expected**: 16 passing tests (configuration persisted via realm export)

---

## Step 11: Commit Changes

```bash
# Check what changed
git status
git diff keycloak/realm-export-dev.json | head -100

# Commit
git add keycloak/realm-export-dev.json
git commit -m "fix(keycloak): add token exchange permissions for integration tests

- Enable client policy binding for mcp-integration-runner
- Allow service account to impersonate test users
- Configuration via Admin UI due to API limitation
- Exported to realm-export-dev.json for idempotency

Resolves token exchange error: 'subject not allowed to impersonate'
Unblocks integration test migration from ROPC to token exchange

See: .claude/plans/keycloak-token-exchange-blocking-issue.md

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to remote
git push
```

---

## Troubleshooting

### Policy Not Visible in Dropdown (Step 6)

- **Refresh page**: Browser cache issue
- **Check policy exists**: Users → Permissions → impersonate → Policies tab
- **Recreate policy**: Delete and recreate in Step 5

### Token Exchange Still Fails After Configuration

- **Check Keycloak logs**:

  ```bash
  docker compose logs keycloak | grep -i "exchange\|imperson" | tail -20
  ```

- **Verify policy bound**:

  ```bash
  # Use REST API verification from Step 7
  ```

- **Restart Keycloak**:

  ```bash
  docker compose restart keycloak
  sleep 60  # Wait for startup
  ```

### Realm Export Doesn't Include Authorization Settings

- **Use full export flag**: `--users realm_file` (already in commands)
- **Check file size**: Should be >100KB with authorization settings
- **Manual verification**: Search file for `"authorizationSettings"`

---

## Success Criteria

- [ ] Token exchange succeeds (no "access_denied" error)
- [ ] Integration tests pass (16/16)
- [ ] Configuration survives Keycloak restart
- [ ] Configuration survives Phoenix rebuild
- [ ] Changes committed to git

---

## Time Spent

| Step | Time |
|------|------|
| 1-3: Admin Console Setup | 2-3 min |
| 4-6: Configure Permissions | 5-7 min |
| 7-8: Test Configuration | 2-3 min |
| 9-11: Export & Commit | 5-10 min |
| **Total** | **15-25 min** |

---

## Next Steps

After successful configuration:
1. Update test auth refactoring plan with completion status
2. Begin Phase 2: Migrate remaining integration tests to token exchange
3. Consider Terraform provider for long-term automation

---

## Related Documents

- **Full Issue Report**: `keycloak-token-exchange-blocking-issue.md`
- **Quick Reference**: `keycloak-token-exchange-quick-ref.md`
- **Test Auth Plan**: `test-auth-refactoring.md`
