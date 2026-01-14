# IAM Self-Access Implementation - Change Log

**Date**: January 13, 2026
**Author**: Tamshai-Dev
**Status**: COMPLETE (awaiting E2E validation)
**Ticket/Plan**: docs/plans/IAM_SELF_ACCESS_PLAN.md

---

## Purpose

Enable all employees to access MCP servers for self-access (view their own data via RLS), even if they don't have department-specific roles.

**Problem**: Users like Marcus Johnson (Engineer) and Frank Davis (IT Intern) have no department roles, so they're blocked at the MCP Gateway before RLS can filter their data.

**Solution**: Add `employee` role that grants MCP server access; RLS enforces data filtering.

---

## Files Changed

### 1. keycloak/realm-export-dev.json
**Impact**: Dev environment only
**Change**: Added `employee` realm role and `All-Employees` group

```json
// Added to roles.realm array:
{
  "name": "employee",
  "description": "Base employee role - allows self-access to all MCP servers via RLS"
}

// Added to groups array:
{
  "name": "All-Employees",
  "path": "/All-Employees",
  "realmRoles": ["employee"]
}
```

**Rollback**: Remove the `employee` role from `roles.realm` array and `All-Employees` group from `groups` array.

---

### 2. keycloak/scripts/sync-realm.sh
**Impact**: All environments (dev, stage, prod)
**Changes**:

a) Added `sync_all_employees_group()` function (lines ~605-643):
```bash
sync_all_employees_group() {
    # Creates 'employee' role if missing
    # Creates 'All-Employees' group if missing
    # Assigns 'employee' role to group
}
```

b) Updated `assign_user_groups()` user mappings to include `All-Employees`:
```bash
# BEFORE:
"eve.thompson:C-Suite"
"marcus.johnson:Engineering-Team"

# AFTER:
"eve.thompson:All-Employees,C-Suite"
"marcus.johnson:All-Employees,Engineering-Team"
```

c) Added call to `sync_all_employees_group` in main() before `assign_user_groups`

d) Added test-user.journey assignment to All-Employees in `provision_test_user()`

**Rollback**:
1. Remove `sync_all_employees_group()` function
2. Remove `All-Employees,` prefix from all user mappings in `assign_user_groups()`
3. Remove `sync_all_employees_group` call from main()
4. Remove All-Employees assignment from `provision_test_user()`

---

### 3. services/mcp-gateway/src/mcp/role-mapper.ts
**Impact**: All environments (code deployed everywhere)
**Change**: Added `employee` to `requiredRoles` for all MCP servers

```typescript
// BEFORE:
requiredRoles: ['hr-read', 'hr-write', 'executive'],

// AFTER:
requiredRoles: ['employee', 'hr-read', 'hr-write', 'executive'],
```

Applied to: hr, finance, sales, support servers

**Rollback**: Remove `'employee',` from all `requiredRoles` arrays in `createDefaultMCPServers()`.

---

### 4. services/mcp-gateway/src/mcp/role-mapper.test.ts
**Impact**: Test code only
**Change**: Updated test assertions to expect `employee` in `requiredRoles`

**Rollback**: Revert `requiredRoles` expectations to exclude `employee`.

---

### 5. infrastructure/terraform/keycloak/main.tf
**Impact**: ALL ENVIRONMENTS (dev, ci, stage, prod)
**Status**: COMPLETE

**Changes applied**:

a) Added `employee` client role resource (lines 137-147):
```hcl
resource "keycloak_role" "employee" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "employee"
  description = "Base employee role - allows self-access to all MCP servers via RLS"
}
```

b) Added `employee` role to existing user role assignments:
- `alice_chen_roles` (line 381)
- `bob_martinez_roles` (line 412)
- `carol_johnson_roles` (line 443)
- `dan_williams_roles` (line 474)
- `eve_thompson_roles` (line 505)

c) Created NEW role assignments for users who had no roles:
```hcl
# frank_davis_roles (lines 532-538)
# nina_patel_roles (lines 563-569)
# marcus_johnson_roles (lines 594-600)
# test_user_journey_roles (lines 627-633)
```

**Rollback**: Remove `keycloak_role.employee` resource and remove `keycloak_role.employee.id` from all `keycloak_user_roles` resources. Also remove the newly created `*_roles` resources for frank_davis, nina_patel, marcus_johnson, and test_user_journey.

---

## Verification Steps

After deployment, verify:

1. **Login as marcus.johnson** (engineer with no dept roles)
   - Should be able to access HR app → see only own record
   - Should be able to access Finance app → see only own expenses

2. **Login as alice.chen** (HR department)
   - Should still have full HR access
   - Should have self-access to other apps

3. **E2E tests pass**
   ```bash
   cd tests/e2e && npm test -- --project=chromium --grep='login'
   ```

---

## Rollback Procedure

If issues occur, rollback in this order:

1. **Immediate (code)**: Revert `role-mapper.ts` to remove `employee` from requiredRoles
   - This blocks self-access at gateway level
   - Deploy MCP Gateway

2. **Keycloak (if needed)**: Run these commands in Keycloak container:
   ```bash
   # Remove all users from All-Employees group
   # Delete All-Employees group
   # Delete employee role
   ```

3. **Terraform (if applied)**:
   ```bash
   cd infrastructure/terraform/keycloak
   # Revert main.tf changes
   terraform apply -var-file=environments/dev.tfvars
   ```

---

## Related Files (Reference)

- Plan: `docs/plans/IAM_SELF_ACCESS_PLAN.md`
- IAM Design: `docs/security/IAM_DESIGN.md`
- Role Hierarchy: Documented in IAM_DESIGN.md

---

*Last Updated: January 13, 2026*
