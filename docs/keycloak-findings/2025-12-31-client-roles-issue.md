# Keycloak Client Roles Not Appearing in resource_access Claim

## Issue Summary

**Status**: 🔴 UNRESOLVED
**Date**: December 31, 2025
**Severity**: HIGH (blocks 65/74 integration tests)

Integration tests fail with 401 Unauthorized because JWT tokens have `"resource_access": null` despite:
- ✅ Terraform applying successfully (25 resources added)
- ✅ `full_scope_allowed = true` on the client
- ✅ Roles configured as client roles (with `client_id`)
- ✅ User role assignments using `keycloak_user_roles`
- ✅ Correct client_id in token requests

## Environment

- **Keycloak Version**: 23.0 (start-dev mode)
- **Terraform Provider**: mrparkers/keycloak 4.4.0
- **Realm**: tamshai-corp
- **Client**: mcp-gateway (confidential)

## Expected vs Actual

### Expected JWT Token
```json
{
  "iss": "http://127.0.0.1:8180/realms/tamshai-corp",
  "sub": "1b5a438e-4360-4267-9e26-29e1f7e9f386",
  "preferred_username": "alice.chen",
  "resource_access": {
    "mcp-gateway": {
      "roles": ["hr-read", "hr-write"]
    }
  }
}
```

### Actual JWT Token
```json
{
  "iss": "http://127.0.0.1:8180/realms/tamshai-corp",
  "sub": "1b5a438e-4360-4267-9e26-29e1f7e9f386",
  "preferred_username": "alice.chen",
  "resource_access": null
}
```

## Terraform Configuration

### Client Configuration
```hcl
resource "keycloak_openid_client" "mcp_gateway" {
  realm_id  = keycloak_realm.tamshai_corp.id
  client_id = "mcp-gateway"
  name      = "MCP Gateway"
  enabled   = true

  access_type                  = "CONFIDENTIAL"
  client_secret                = var.mcp_gateway_client_secret
  standard_flow_enabled        = true
  direct_access_grants_enabled = true
  service_accounts_enabled     = true

  valid_redirect_uris = var.valid_redirect_uris
  web_origins         = ["+"]

  # OAuth/OIDC settings
  full_scope_allowed = true  # ← Changed to true
}
```

### Client Role Definition
```hcl
resource "keycloak_role" "hr_read" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id  # ← Makes it a client role
  name        = "hr-read"
  description = "Read access to HR data"
}
```

### User Role Assignment
```hcl
resource "keycloak_user" "alice_chen" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "alice.chen"
  enabled    = true
  email      = "alice@tamshai.com"
  first_name = "Alice"
  last_name  = "Chen"
  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}

resource "keycloak_user_roles" "alice_chen_roles" {
  realm_id = keycloak_realm.tamshai_corp.id
  user_id  = keycloak_user.alice_chen.id

  role_ids = [
    keycloak_role.hr_read.id,
    keycloak_role.hr_write.id,
  ]
}
```

## Token Request

```bash
curl -X POST http://127.0.0.1:8180/realms/tamshai-corp/protocol/openid-connect/token \
  -d "client_id=mcp-gateway" \
  -d "client_secret=test-client-secret" \
  -d "username=alice.chen" \
  -d "password=password123" \
  -d "grant_type=password" \
  -d "scope=openid profile email"
```

**Response**: HTTP 200 OK with access_token, but `resource_access: null` in decoded JWT

## Investigation History

### Attempt 1: Remove "roles" Scope
**Hypothesis**: The "roles" scope was invalid
**Action**: Removed "roles" from scope parameter in all test files
**Result**: ❌ Still `resource_access: null`
**Commits**: d6a3b15

### Attempt 2: Convert to Client Roles
**Hypothesis**: Roles were realm roles, need client roles for `resource_access`
**Action**: Added `client_id = keycloak_openid_client.mcp_gateway.id` to all 9 role definitions
**Result**: ❌ Still `resource_access: null`
**Terraform Output**: "Apply complete! Resources: 25 added, 0 changed, 0 destroyed"
**Commits**: d6b8b24

### Attempt 3: Enable full_scope_allowed
**Hypothesis**: `full_scope_allowed = false` requires explicit mappers
**Action**: Changed `full_scope_allowed = false` → `full_scope_allowed = true`
**Result**: ❌ Still `resource_access: null`
**Terraform Output**: "Apply complete! Resources: 25 added, 0 changed, 0 destroyed"
**CI Run**: #20620325041 - Terraform applied successfully, debug shows resource_access: null
**Commits**: 52b1419

## Research Findings

### Terraform Provider Documentation
According to [keycloak_user_roles documentation](https://registry.terraform.io/providers/mrparkers/keycloak/latest/docs/resources/user_roles), the resource **does support client roles**:
- `role_ids` accepts any role IDs (realm or client roles)
- Example shows both realm and client roles in the same assignment

### Keycloak Behavior
From [JANUA article on full scopes](https://www.janua.fr/keycloak-roles-restriction-and-full-scopes/):
- When `full_scope_allowed = true`, all user role mappings are added to tokens
- When `full_scope_allowed = false`, explicit client scopes are required

### Known Issues
- [KEYCLOAK-5259](https://issues.redhat.com/browse/KEYCLOAK-5259): Client role mappers have known issues even with correct configuration

## Possible Root Causes

### Theory 1: Terraform State Mismatch
- Terraform claims "25 added, 0 changed" (recreated all resources)
- User role assignments might not be applying to the new client role IDs
- **Verification Needed**: Check Keycloak Admin Console to see if roles are actually assigned

### Theory 2: Keycloak Caching
- Keycloak might cache realm/client configuration
- Fresh Terraform apply might not trigger cache invalidation
- **Verification Needed**: Restart Keycloak container after Terraform apply

### Theory 3: Client Scope Mapper Missing
- Even with `full_scope_allowed = true`, client roles might need explicit mapper
- Terraform might not be creating the default client scope mappers
- **Verification Needed**: Check if "roles" client scope mapper exists for mcp-gateway client

### Theory 4: Composite Role Issue
- The `executive` role is a composite role containing client roles
- Composite client roles might have different behavior than simple client roles
- **Verification Needed**: Test with non-composite roles (hr-read, hr-write directly)

### Theory 5: Terraform Provider Bug
- mrparkers/keycloak 4.4.0 might have a bug with client role assignments
- **Verification Needed**: Try with different provider version or manual Keycloak configuration

## Next Steps for Research Team

### High Priority
1. **Manual Keycloak Configuration**: Create client roles and assign to user via Keycloak Admin Console, verify if `resource_access` appears in token
2. **Provider Version Test**: Try Keycloak Terraform provider 5.x (if available)
3. **Debug Terraform State**: Use `terraform show` to inspect actual role IDs being assigned
4. **Keycloak Admin API**: Directly query Keycloak Admin API to verify role assignments

### Medium Priority
5. **Cache Invalidation**: Add Keycloak restart step after Terraform apply in CI
6. **Client Scope Mapper**: Manually add client role mapper via Terraform (keycloak_generic_client_role_mapper)
7. **Composite Role Test**: Create non-composite client roles to isolate issue
8. **Token Introspection**: Use Keycloak's token introspection endpoint to see full token details

### Low Priority
9. **Realm vs Client Roles**: Compare JWT tokens from realm roles vs client roles
10. **Direct Grant vs OAuth Flow**: Test if Authorization Code flow produces different tokens

## Related Files

- **Terraform Configuration**: `infrastructure/terraform/keycloak/main.tf`
- **Integration Tests**: `tests/integration/rbac.test.ts`, `tests/integration/sse-streaming.test.ts`
- **CI Debug Output**: `.github/workflows/ci.yml` (lines 486-537)
- **Documentation**: `docs/CI_FIXES_2025-12-30.md` (Issue #10)

## References

- [Keycloak Terraform Provider - keycloak_user_roles](https://registry.terraform.io/providers/mrparkers/keycloak/latest/docs/resources/user_roles)
- [Keycloak Terraform Provider - keycloak_role](https://registry.terraform.io/providers/mrparkers/keycloak/latest/docs/resources/role)
- [JANUA - Keycloak Roles Restriction and Full Scopes](https://www.janua.fr/keycloak-roles-restriction-and-full-scopes/)
- [Red Hat Issue Tracker - KEYCLOAK-5259](https://issues.redhat.com/browse/KEYCLOAK-5259)
- [Medium - Keycloak Client Scope Explained](https://medium.com/@torinks/keycloak-client-scopes-bc3ba10b2dbb)
- [Keycloak Documentation - Authorization Services](https://www.keycloak.org/docs/latest/authorization_services/index.html)

## Impact

- **Tests Failing**: 65/74 integration tests (88% failure rate)
- **Feature Blocked**: RBAC (Role-Based Access Control) completely broken
- **CI Status**: ❌ Integration Tests job failing on every PR

---

**Last Updated**: December 31, 2025
**Author**: Claude Code (Sonnet 4.5)
**Status**: AWAITING RESEARCH TEAM INVESTIGATION
