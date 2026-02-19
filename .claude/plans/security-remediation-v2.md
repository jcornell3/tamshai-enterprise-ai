# Security Remediation Plan v2

**Created**: 2026-02-18
**Source**: `docs/security/SECURITY_CONCERNSv2.md`
**Status**: In Progress (E1-E4, M1-M3 Complete)
**Last Updated**: 2026-02-18

---

## Executive Summary

This plan addresses 12 security findings from the SECURITY_CONCERNSv2.md review, segmented by implementation complexity. The focus is on the VPS/stage environment, with applicability to dev and prod environments.

---

## EASY - Configuration Changes (1-2 hours each)

### E1. Remove `account` from JWT Valid Audiences

| Attribute | Value |
|-----------|-------|
| **Risk** | Medium - Allows tokens not intended for mcp-gateway |
| **File** | `services/mcp-gateway/src/auth/jwt-validator.ts` |
| **Effort** | 15 minutes |
| **Testing** | Unit tests + integration tests |

**Current Code:**
```typescript
// The validateToken function includes `account` in valid audiences
```

**Remediation:**
1. Remove `account` from the valid audiences array
2. Update unit tests to verify rejection of `account` audience tokens
3. Run integration tests to ensure no regression

**Acceptance Criteria:**
- [x] `account` audience removed from jwt-validator.ts
- [x] Unit test added: tokens with only `account` audience are rejected
- [x] Integration tests pass

---

### E2. Remove test-user.journey from C-Suite in Production

| Attribute | Value |
|-----------|-------|
| **Risk** | Critical - Test user has executive privileges in prod |
| **File** | `keycloak/scripts/lib/groups.sh` |
| **Effort** | 30 minutes |
| **Testing** | E2E tests with temporary elevation |

**Current Code (lines 309-310):**
```bash
local -a critical_users=(
    ...
    "test-user.journey:All-Employees"
    "test-user.journey:C-Suite"        # <-- REMOVE THIS LINE
)
```

**Remediation:**
1. Remove `"test-user.journey:C-Suite"` from `assign_critical_prod_users()` array
2. Keep `"test-user.journey:All-Employees"` for basic access
3. E2E tests that need executive access use **existing temporary elevation**:
   - `tests/e2e/utils/roles.ts` already provides `grantRealmRole()` / `revokeRealmRole()`
   - Tests grant `executive` role in `beforeAll()`, revoke in `afterAll()`

**E2E Test Pattern (already supported):**
```typescript
import { grantRealmRole, revokeRealmRole } from '../utils/roles';

test.describe('Executive Dashboard Tests', () => {
  test.beforeAll(async () => {
    // Temporarily elevate test user to executive
    await grantRealmRole('test-user.journey', 'executive');
  });

  test.afterAll(async () => {
    // Always revoke after tests complete
    await revokeRealmRole('test-user.journey', 'executive');
  });

  test('can view executive dashboard', async ({ page }) => {
    // Test runs with elevated privileges
  });
});
```

**Why This Is Better:**
- Test user has **minimal privileges by default**
- Elevation happens **only during test execution**
- Automatic cleanup via `afterAll()` hook
- Principle of least privilege maintained

**Acceptance Criteria:**
- [x] Line 310 (`test-user.journey:C-Suite`) removed from `groups.sh`
- [x] `test-user.journey` still in `All-Employees` group
- [x] E2E tests using temporary elevation pass
- [x] Verified via `./scripts/infra/keycloak.sh users prod` - no C-Suite membership

---

### E3. Restrict webOrigins for mcp-gateway Client

| Attribute | Value |
|-----------|-------|
| **Risk** | Medium - CSRF vulnerability with wildcard origin |
| **File** | `keycloak/scripts/lib/clients.sh` |
| **Effort** | 30 minutes |
| **Testing** | CORS verification from allowed/blocked origins |

**Current Code:**
```bash
# get_mcp_gateway_client_json() sets webOrigins to ["+"]
```

**Remediation:**
1. Replace `["+"]` with explicit domain list per environment:
   - Dev: `["https://www.tamshai.local", "http://localhost:*"]`
   - Stage: `["https://www.tamshai.com"]`
   - Prod: `["https://prod.tamshai.com"]`
2. Use environment variable for domain configuration

**Acceptance Criteria:**
- [x] webOrigins explicitly lists allowed domains
- [x] CORS preflight from unauthorized origin fails
- [x] All web apps continue to function

---

### E4. Enable Caddy Auto-HTTPS (Let's Encrypt)

| Attribute | Value |
|-----------|-------|
| **Risk** | Critical - MITM between Cloudflare and VPS |
| **File** | `infrastructure/docker/Caddyfile.stage` |
| **Effort** | 1 hour |
| **Testing** | SSL Labs test, curl with certificate verification |

**Current Code:**
```
auto_https off
```

**Remediation:**
1. Remove `auto_https off` directive
2. Configure email for Let's Encrypt notifications
3. Ensure ports 80/443 are accessible for ACME challenge
4. Update Cloudflare SSL/TLS to "Full (Strict)" mode

**Acceptance Criteria:**
- [x] Caddy automatically provisions Let's Encrypt certificate
- [x] Cloudflare set to "Full (Strict)" SSL mode
- [x] SSL Labs grade A or better
- [x] No mixed content warnings

---

## MEDIUM - Moderate Code Changes (4-8 hours each)

### M1. Reduce mcp-hr-service Permissions

| Attribute | Value |
|-----------|-------|
| **Risk** | High - Service account has excessive realm access |
| **File** | `keycloak/scripts/lib/clients.sh` |
| **Effort** | 4 hours |
| **Testing** | Identity sync functional tests |

**Current State:**
- `fullScopeAllowed: true`
- Roles: `manage-users`, `view-users`, `query-users`, `view-realm`, `manage-realm`

**Remediation:**
1. Audit actual permissions needed by identity-sync
2. Set `fullScopeAllowed: false`
3. Remove `manage-realm` (only needed for initial setup)
4. Retain only: `view-users`, `query-users`, `manage-users` (if user creation needed)
5. Test identity-sync workflow end-to-end

**Acceptance Criteria:**
- [x] `fullScopeAllowed` set to false
- [x] `manage-realm` removed
- [x] Identity sync provisions users successfully
- [x] Identity sync cannot modify realm settings

---

### M2. Replace Password Grant with Client Credentials

| Attribute | Value |
|-----------|-------|
| **Risk** | Medium - Admin credentials exposed in scripts |
| **File** | `keycloak/scripts/lib/authz.sh` |
| **Effort** | 4 hours |
| **Testing** | Keycloak sync scripts, token exchange setup |

**Current Code:**
```bash
# Uses password grant with admin username/password
curl ... -d "grant_type=password" -d "username=$KEYCLOAK_ADMIN" ...
```

**Remediation:**
1. Create dedicated `keycloak-admin-cli` confidential client
2. Grant appropriate admin roles to client service account
3. Modify `sync_token_exchange_permissions()` to use client credentials grant
4. Update all admin API calls to use service account token

**Implementation:**
```bash
# New approach using client credentials
curl -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "client_id=keycloak-admin-cli" \
  -d "client_secret=$KEYCLOAK_ADMIN_CLIENT_SECRET" \
  -d "grant_type=client_credentials"
```

**Acceptance Criteria:**
- [x] Admin username/password not used in scripts
- [x] Client credentials grant used for admin API
- [x] All sync-realm.sh functions work correctly
- [x] KEYCLOAK_ADMIN_PASSWORD removed from .env requirements

---

### M3. Docker Network Segmentation

| Attribute | Value |
|-----------|-------|
| **Risk** | Medium - Flat network allows lateral movement |
| **File** | `infrastructure/docker/docker-compose.yml` |
| **Effort** | 6 hours |
| **Testing** | Network isolation verification, service connectivity |

**Current State:**
- Single flat `tamshai-network`
- All containers can communicate with all others

**Remediation:**
1. Create segmented networks:
   - `frontend-network`: Kong, Caddy
   - `gateway-network`: Kong, MCP Gateway
   - `backend-network`: MCP Gateway, MCP servers
   - `data-network`: MCP servers, databases
2. Attach containers to only required networks
3. Document network topology

**Network Topology:**
```
Internet → Caddy [frontend] → Kong [frontend, gateway] → MCP Gateway [gateway, backend]
                                                              ↓
                                                    MCP Servers [backend, data]
                                                              ↓
                                                    Databases [data]
```

**Acceptance Criteria:**
- [x] 4 networks created with appropriate isolation
- [x] Kong cannot directly access databases
- [x] MCP servers cannot access Kong
- [x] All services functional after segmentation

---

## COMPLEX - Architectural Changes (2-5 days each)

### C1. Vault Production Mode Configuration

| Attribute | Value |
|-----------|-------|
| **Risk** | Critical - Dev mode Vault has no security |
| **Files** | `infrastructure/docker/docker-compose.yml`, new `vault/config/` |
| **Effort** | 2-3 days |
| **Testing** | Vault initialization, seal/unseal, secret retrieval |

**Current State:**
```yaml
command: server -dev
```

**Remediation Phases:**

**Phase 1: Configuration (Day 1)**
1. Create `vault/config/vault.hcl` with production settings
2. Configure file or Consul storage backend
3. Set up TLS for Vault API
4. Remove `-dev` flag from command

**Phase 2: Initialization (Day 1)**
1. Initialize Vault (`vault operator init`)
2. Securely store unseal keys (Shamir's secret sharing)
3. Store root token securely
4. Create operational tokens with limited policies

**Phase 3: Secret Migration (Day 2)**
1. Create Vault policies for each service
2. Migrate secrets from .env to Vault KV
3. Create AppRole auth for services
4. Update services to fetch secrets from Vault

**Phase 4: Auto-Unseal (Day 3)**
1. Configure auto-unseal using cloud KMS or transit
2. Set up monitoring for seal status
3. Document recovery procedures

**Acceptance Criteria:**
- [ ] Vault runs in server mode (not dev)
- [ ] TLS enabled for Vault API
- [ ] Secrets stored in Vault KV engine
- [ ] Services authenticate via AppRole
- [ ] Auto-unseal configured
- [ ] Recovery procedures documented

---

### C2. Encrypted Secrets at Rest

| Attribute | Value |
|-----------|-------|
| **Risk** | Critical - Plaintext secrets on disk |
| **Files** | `infrastructure/terraform/vps/cloud-init.yaml`, new encryption scripts |
| **Effort** | 3-4 days |
| **Testing** | Phoenix rebuild with encrypted secrets |

**Current State:**
- Secrets decoded to plaintext `.env` file
- File persists on disk

**Remediation Architecture:**

```
GitHub Secrets (encrypted)
        ↓
[cloud-init] base64 decode → encrypted blob
        ↓
[startup script] decrypt in memory using VPS-specific key
        ↓
[docker-compose] pass as environment variables (never written to disk)
```

**Implementation Phases:**

**Phase 1: Encryption Infrastructure (Day 1)**
1. Generate encryption key per VPS (stored in Hetzner metadata or derived from instance ID)
2. Create encryption script for CI/CD to encrypt secrets before deploy
3. Store encrypted blob (not plaintext) in cloud-init

**Phase 2: Decryption at Startup (Day 2)**
1. Modify cloud-init to:
   - Retrieve encrypted secrets blob
   - Decrypt using instance-specific key (in memory)
   - Export as environment variables
   - Never write decrypted secrets to disk
2. Use `process substitution` or `env` command to pass secrets

**Phase 3: Docker Integration (Day 3)**
1. Modify docker-compose to use environment variables directly
2. Remove `.env` file dependency
3. Update service startup scripts

**Phase 4: Cleanup & Hardening (Day 4)**
1. Add startup verification (secrets loaded correctly)
2. Add monitoring for decryption failures
3. Document key rotation procedures

**Implementation Sketch:**
```bash
# cloud-init modification
- |
  # Decrypt secrets in memory, never write to disk
  DECRYPTED_SECRETS=$(echo "$ENCRYPTED_SECRETS_BLOB" | openssl enc -d -aes-256-cbc -pbkdf2 -k "$INSTANCE_KEY")

  # Export each secret as environment variable
  eval "$(echo "$DECRYPTED_SECRETS" | sed 's/^/export /')"

  # Start docker-compose with environment
  docker compose up -d
```

**Acceptance Criteria:**
- [ ] No plaintext secrets written to VPS disk
- [ ] Phoenix rebuild works with encrypted secrets
- [ ] Secrets accessible to containers via environment
- [ ] Key rotation procedure documented
- [ ] Monitoring for decryption failures

---

### C3. Refactor Keycloak Scripts to Admin Client

| Attribute | Value |
|-----------|-------|
| **Risk** | Low - Technical debt, maintainability |
| **Files** | `keycloak/scripts/lib/*.sh`, new `keycloak/scripts/admin-client/` |
| **Effort** | 5 days |
| **Testing** | All sync-realm.sh functions |

**Current State:**
- Shell scripts with curl + jq
- Complex JSON manipulation in bash
- Hard to test and maintain

**Remediation Options:**

**Option A: Node.js with @keycloak/keycloak-admin-client**
```typescript
import KcAdminClient from '@keycloak/keycloak-admin-client';

const kcAdmin = new KcAdminClient({
  baseUrl: process.env.KEYCLOAK_URL,
  realmName: 'master'
});

await kcAdmin.auth({
  clientId: 'admin-cli',
  clientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
  grantType: 'client_credentials'
});

// Type-safe client creation
await kcAdmin.clients.create({
  clientId: 'mcp-gateway',
  protocol: 'openid-connect',
  // ... full type support
});
```

**Option B: Python with python-keycloak**
```python
from keycloak import KeycloakAdmin

keycloak_admin = KeycloakAdmin(
    server_url=os.environ['KEYCLOAK_URL'],
    client_id='admin-cli',
    client_secret_key=os.environ['KEYCLOAK_ADMIN_CLIENT_SECRET']
)

keycloak_admin.create_client({
    'clientId': 'mcp-gateway',
    'protocol': 'openid-connect'
})
```

**Recommendation:** Option A (Node.js) - aligns with project's TypeScript stack

**Migration Plan:**
1. Day 1: Set up Node.js admin client project
2. Day 2: Migrate client management functions
3. Day 3: Migrate role and group functions
4. Day 4: Migrate user and authorization functions
5. Day 5: Testing, documentation, deprecate shell scripts

**Acceptance Criteria:**
- [ ] New TypeScript/Node.js admin client project
- [ ] All sync-realm.sh functions migrated
- [ ] Type-safe Keycloak API interactions
- [ ] Unit tests for admin operations
- [ ] Shell scripts deprecated (kept for reference)

---

## Implementation Priority Matrix

| ID | Finding | Risk | Effort | Priority |
|----|---------|------|--------|----------|
| E2 | Test user in C-Suite (prod) | Critical | Easy | **P0 - Immediate** |
| E4 | Unencrypted traffic | Critical | Easy | **P0 - Immediate** |
| E1 | Account JWT audience | Medium | Easy | P1 - High |
| E3 | Wildcard webOrigins | Medium | Easy | P1 - High |
| M1 | HR service permissions | High | Medium | P1 - High |
| M2 | Password grant in scripts | Medium | Medium | P2 - Normal |
| M3 | Flat Docker network | Medium | Medium | P2 - Normal |
| C1 | Vault dev mode | Critical | Complex | **P0 - Immediate** |
| C2 | Plaintext secrets | Critical | Complex | **P0 - Immediate** |
| C3 | Keycloak script refactor | Low | Complex | P3 - Low |

---

## Execution Schedule

### Sprint 1: Critical Items (Week 1)
- [x] E2: Remove test-user from C-Suite in prod
- [x] E4: Enable Caddy auto-HTTPS
- [x] E1: Remove account audience
- [x] E3: Restrict webOrigins

### Sprint 2: Medium Priority (Week 2)
- [x] M1: Reduce mcp-hr-service permissions
- [x] M2: Replace password grant with client credentials

### Sprint 3: Infrastructure (Week 3)
- [x] M3: Docker network segmentation
- [ ] C1: Begin Vault production mode (Phases 1-2)

### Sprint 4: Secrets Management (Week 4)
- [ ] C1: Complete Vault production mode (Phases 3-4)
- [ ] C2: Encrypted secrets at rest (Phases 1-2)

### Sprint 5: Finalization (Week 5)
- [ ] C2: Complete encrypted secrets (Phases 3-4)
- [ ] C3: Begin Keycloak admin client migration (optional)

---

## Rollback Procedures

### E1-E4 Rollback
Git revert of configuration changes; no data migration needed.

### M1-M3 Rollback
1. Restore previous Keycloak client configuration
2. Restore previous docker-compose.yml
3. Run sync-realm.sh to apply reverted config

### C1-C2 Rollback
1. Restore previous docker-compose.yml (Vault dev mode)
2. Restore previous cloud-init.yaml (plaintext secrets)
3. Redeploy VPS with terraform destroy/apply

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Critical vulnerabilities | 4 | 0 |
| High-risk findings | 2 | 0 |
| Medium-risk findings | 4 | 0 |
| Low-risk findings | 2 | 2 (acceptable) |
| Secrets in plaintext | Yes | No |
| Network segmentation | None | 4 zones |

---

## Dependencies

- Let's Encrypt: Port 80 accessible for ACME challenge
- Hetzner: Instance metadata API for encryption key derivation
- GitHub Actions: Updated secrets encryption workflow
- Cloudflare: SSL mode change to "Full (Strict)"

---

*Plan Author: Tamshai-Dev (Claude-Dev)*
*Review Required: Security team sign-off before C1/C2 implementation*
