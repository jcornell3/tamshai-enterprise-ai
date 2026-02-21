# Dev vs Stage Environment Comparison

**Date**: 2026-02-20
**Purpose**: Document differences between dev and stage Phoenix build configurations

## Summary

| Aspect | Dev | Stage |
|--------|-----|-------|
| **Realm Export** | realm-export-dev.json | realm-export-stage.json |
| **Credentials in Export** | None (set post-import) | Placeholders (substituted pre-import) |
| **Clients in Export** | 6 clients | 8 clients (+flutter, +website) |
| **Client Creation** | sync-realm.sh creates ALL | sync-realm.sh creates ALL |
| **Password Setting** | sync-realm.sh via Admin API | Placeholder substitution + sync-realm.sh |
| **TOTP Setting** | Direct DB insert (main.tf) | Placeholder substitution in realm export |
| **Bootstrap** | terraform apply → docker compose | terraform apply → cloud-init |

**Key Point**: Both environments end up with the same credentials set. The mechanism differs but the result is the same.

---

## 1. User Credentials

### Dev Mechanism
```
1. Keycloak imports realm-export-dev.json (users exist, NO credentials)
2. keycloak-sync container runs sync-realm.sh
3. sync-realm.sh calls set_test_user_password() and set_corporate_user_passwords()
4. Passwords set via Keycloak Admin API using DEV_USER_PASSWORD env var
5. TOTP set via direct PostgreSQL insert in dev/main.tf null_resource
```

### Stage Mechanism
```
1. Cloud-init substitutes placeholders in realm-export-stage.json:
   - __TEST_USER_PASSWORD__ → TEST_USER_PASSWORD env var
   - __TEST_USER_TOTP_SECRET__ → TEST_USER_TOTP_SECRET_RAW env var
   - __STAGE_USER_PASSWORD__ → STAGE_USER_PASSWORD env var
2. Keycloak imports realm WITH credentials already set
3. sync-realm.sh runs (may update passwords again)
4. cloud-init verifies TOTP exists (does NOT delete/recreate)
```

### Environment Variables

| Variable | Dev Source | Stage Source |
|----------|------------|--------------|
| DEV_USER_PASSWORD | GitHub Secret → Terraform → .env | N/A |
| STAGE_USER_PASSWORD | N/A | GitHub Secret → cloud-init → .env |
| TEST_USER_PASSWORD | GitHub Secret → Terraform → .env | GitHub Secret → cloud-init → .env |
| TEST_USER_TOTP_SECRET_RAW | GitHub Secret → Terraform | GitHub Secret → cloud-init → .env |

---

## 2. Clients

### Realm Export Contents

**Dev (realm-export-dev.json)**:
- ai-desktop
- ai-mobile
- hr-app
- finance-app
- sales-app
- support-app

**Stage (realm-export-stage.json)**:
- ai-desktop
- ai-mobile
- hr-app
- finance-app
- sales-app
- support-app
- **tamshai-flutter-client** (additional)
- **tamshai-website** (additional)

### sync-realm.sh Creates ALL Clients

Regardless of what's in the realm export, `sync-realm.sh` creates/updates ALL clients via `sync_all_clients()`:

```bash
# From keycloak/scripts/lib/clients.sh
declare -A CLIENT_IDS=(
    [website]="tamshai-website"
    [flutter]="tamshai-flutter-client"
    [portal]="web-portal"
    [gateway]="mcp-gateway"
    [ui]="mcp-ui"
    [hr_service]="mcp-hr-service"
    [integration_runner]="mcp-integration-runner"
)
```

**Result**: Both dev and stage end up with ALL clients created by sync-realm.sh.

---

## 3. TOTP Configuration

### Dev: Direct Database Insert

```hcl
# From infrastructure/terraform/dev/main.tf
docker exec tamshai-dev-postgres psql -U keycloak -d keycloak -qtA -c "
  INSERT INTO credential (id, user_id, type, user_label, secret_data, credential_data, priority, created_date)
  VALUES (
    gen_random_uuid()::text,
    '$USER_ID',
    'otp',
    'Terraform Provisioned',
    '{\"value\":\"$TEST_USER_TOTP_SECRET_RAW\"}',
    ...
  );
"
```

**Why Direct DB**: Keycloak Admin API doesn't support POST to `/users/{id}/credentials` for OTP.

### Stage: Realm Import

```json
// From realm-export-stage.json (before substitution)
{
  "type": "otp",
  "secretData": "{\"value\":\"__TEST_USER_TOTP_SECRET__\"}",
  "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA256\"}"
}
```

Cloud-init substitutes `__TEST_USER_TOTP_SECRET__` with actual value before docker build.

---

## 4. Redirect URIs

### Dev
- Localhost only: `http://localhost:400X/*`

### Stage
- Localhost + Production:
  - `http://localhost:400X/*`
  - `https://www.tamshai.com/*`
  - `https://prod.tamshai.com/*`

---

## 5. Protocol Mappers

Both environments get protocol mappers via `sync-realm.sh`:

```bash
# From keycloak/scripts/lib/mappers.sh
add_audience_mapper_to_client "tamshai-website"
add_audience_mapper_to_client "tamshai-flutter-client"
add_sub_claim_mapper_to_client "tamshai-website"
add_sub_claim_mapper_to_client "tamshai-flutter-client"
```

---

## 6. Bootstrap Process

### Dev (Terraform Local)
```
terraform apply
  → docker-compose.yml
  → keycloak imports realm-export-dev.json
  → keycloak-sync runs sync-realm.sh dev
  → identity-sync provisions users
  → null_resource sets TOTP via DB
```

### Stage (Terraform + Cloud-Init)
```
terraform apply
  → creates VPS with cloud-init
  → cloud-init substitutes placeholders in realm-export-stage.json
  → docker compose build & up
  → keycloak imports realm WITH credentials
  → mcp-integration-runner runs sync-realm.sh stage
  → cloud-init verifies TOTP exists
```

---

## 7. Key Files

| Purpose | Dev | Stage |
|---------|-----|-------|
| Terraform | infrastructure/terraform/dev/main.tf | infrastructure/terraform/vps/main.tf |
| Bootstrap | Docker Compose | cloud-init.yaml |
| Realm Export | keycloak/realm-export-dev.json | keycloak/realm-export-stage.json |
| Password Setting | sync-realm.sh + null_resource | Placeholder substitution + sync-realm.sh |
| TOTP Setting | null_resource (DB insert) | Placeholder substitution |

---

## 8. Lessons Learned

1. **Both methods work**: Dev and stage use different mechanisms but achieve the same result
2. **sync-realm.sh is idempotent**: Creates/updates all clients regardless of realm export contents
3. **TOTP cannot be set via Admin API**: Must use realm import or direct DB insert
4. **Don't delete imported credentials**: Cloud-init was incorrectly deleting TOTP that was correctly imported

---

## 9. Phase 2 Customer Realm Alignment (2026-02-21)

### Customer Realm Sync

| Aspect | Dev | Stage |
|--------|-----|-------|
| **Realm Name** | tamshai-customers | tamshai-customers |
| **Script** | sync-customer-realm.sh | sync-customer-realm.sh |
| **Password Setting** | REST API (Terraform) | REST API (cloud-init) |
| **Port Configuration** | Environment variables | Environment variables |

### Key Changes Made

1. **sync-customer-realm.sh URL Fix**:
   - Both dev and stage now use `http://localhost:8080/auth` (internal URL)
   - Scripts run inside container via `docker exec`, so external URLs don't work

2. **Customer Password Provisioning (Stage)**:
   - Added `sync-customer-realm.sh` call to cloud-init with port variables
   - Added REST API step to set customer user passwords (defense in depth)

3. **GitHub Secrets Pipeline**:
   - Added `CUSTOMER_USER_PASSWORD` flow: workflow → PowerShell → Terraform → cloud-init

### Phase 2 Lessons

5. **Scripts inside containers use internal URLs**: When running via `docker exec`, always use `http://localhost:8080/auth`, not external URLs like `https://www.tamshai.com`

6. **REST API is more reliable than env vars via docker exec**: Environment variables passed through `docker exec -e` don't handle special characters reliably. Use REST API calls from cloud-init (outside container) instead.

7. **Defense in depth for password setting**: Even when one mechanism fails (sync-customer-realm.sh auth failure), the backup mechanism (REST API) can succeed.

---

*Generated: 2026-02-20*
*Updated: 2026-02-21 (Phase 2 Complete)*
