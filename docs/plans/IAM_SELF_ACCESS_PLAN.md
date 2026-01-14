# IAM Self-Access Implementation Plan

**Created**: January 13, 2026
**Status**: Planning
**Priority**: HIGH - Core functionality gap
**Author**: Tamshai-Dev

---

## Executive Summary

Currently, users without department-specific roles (e.g., Marcus Johnson - Engineer, Frank Davis - IT Intern) cannot access any MCP servers, even though PostgreSQL RLS policies allow "self-access" to their own data. This is because the MCP Gateway requires department roles (`hr-read`, `finance-read`, etc.) to route requests to MCP servers.

**The Gap**: RLS allows self-access at the database layer, but the application layer blocks users before they can reach the database.

**Solution**: Create an `employee` role that all employees receive, granting basic access to all MCP servers while relying on RLS for data filtering.

---

## Problem Analysis

### Current State

**MCP Gateway Role Requirements** (`services/mcp-gateway/src/mcp/role-mapper.ts`):

| MCP Server | Required Roles |
|------------|----------------|
| mcp-hr | `hr-read`, `hr-write`, `executive` |
| mcp-finance | `finance-read`, `finance-write`, `executive` |
| mcp-sales | `sales-read`, `sales-write`, `executive` |
| mcp-support | `support-read`, `support-write`, `executive` |

**Current User Role Assignments**:

| User | Group(s) | Roles | Can Access |
|------|----------|-------|------------|
| eve.thompson | C-Suite | `executive` | All MCP servers |
| alice.chen | HR-Department, Managers | `hr-read`, `hr-write` | mcp-hr only |
| bob.martinez | Finance-Team, Managers | `finance-read`, `finance-write` | mcp-finance only |
| marcus.johnson | Engineering-Team | (none) | **Nothing** |
| frank.davis | IT-Team | (none) | **Nothing** |
| nina.patel | Engineering-Managers | `manager` | **Nothing** |

**RLS Self-Access Policies** (work correctly but are unreachable):

```sql
-- hr.employees: Self-access policy
CREATE POLICY employee_self_access ON hr.employees
FOR SELECT USING (
  email = current_setting('app.current_user_id', true)
);

-- finance.expenses: Self-access policy
CREATE POLICY expense_self_access ON finance.expenses
FOR SELECT USING (
  submitted_by = current_setting('app.current_user_id', true)
);
```

### Impact

1. **Marcus Johnson** cannot view his own HR record, performance reviews, or expense reports
2. **Frank Davis** cannot view his own data or submit support tickets
3. **Nina Patel** (manager role but no department roles) cannot access any apps
4. Any employee outside HR/Finance/Sales/Support departments is locked out

---

## Proposed Solution

### Overview

```
BEFORE:
User → MCP Gateway → [No matching role] → ACCESS DENIED

AFTER:
User → MCP Gateway → [Has 'employee' role] → MCP Server → RLS → Self-access only
```

### Components to Modify

1. **Keycloak**: Add `employee` client role, `All-Employees` group
2. **MCP Gateway**: Add `employee` to `requiredRoles` for each MCP server
3. **sync-realm.sh**: Assign all users to `All-Employees` group
4. **Terraform**: Define `employee` role and group in IaC
5. **identity-sync**: Auto-assign new employees to `All-Employees` group

---

## Implementation Details

### Step 1: Create `employee` Client Role

**Location**: Keycloak `mcp-gateway` client

**Terraform** (`infrastructure/terraform/keycloak/main.tf`):

```hcl
# Base employee role - grants access to all MCP servers (self-access via RLS)
resource "keycloak_role" "employee" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "employee"
  description = "Base employee role - allows self-access to all MCP servers"
}
```

**Realm Export** (`keycloak/realm-export-dev.json`):

```json
{
  "name": "employee",
  "description": "Base employee role - allows self-access to all MCP servers",
  "composite": false,
  "clientRole": true,
  "containerId": "mcp-gateway"
}
```

### Step 2: Create `All-Employees` Group

**Location**: Keycloak realm groups

**Realm Export** (`keycloak/realm-export-dev.json`):

```json
{
  "name": "All-Employees",
  "path": "/All-Employees",
  "realmRoles": [],
  "clientRoles": {
    "mcp-gateway": ["employee"]
  }
}
```

**sync-realm.sh** addition:

```bash
sync_all_employees_group() {
    log_info "Syncing All-Employees group..."

    # Check if group exists
    local group_id=$($KCADM get groups -r "$REALM" -q "name=All-Employees" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

    if [ -z "$group_id" ]; then
        log_info "  Creating All-Employees group..."
        $KCADM create groups -r "$REALM" -s name=All-Employees
        group_id=$($KCADM get groups -r "$REALM" -q "name=All-Employees" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
    else
        log_info "  All-Employees group already exists"
    fi

    # Assign employee role to the group
    if [ -n "$group_id" ]; then
        local mcp_gateway_id=$(get_client_uuid "mcp-gateway")
        if [ -n "$mcp_gateway_id" ]; then
            log_info "  Assigning 'employee' client role to All-Employees group..."
            $KCADM add-roles -r "$REALM" \
                --gid "$group_id" \
                --cclientid mcp-gateway \
                --rolename employee 2>/dev/null || log_info "    Role may already be assigned"
        fi
    fi
}
```

### Step 3: Assign All Users to `All-Employees` Group

**sync-realm.sh** modification to `assign_user_groups()`:

```bash
assign_user_groups() {
    log_info "Assigning users to groups..."

    # Skip in production (users managed by identity-sync only)
    if [ "$ENV" = "prod" ]; then
        log_info "Skipping user group assignment in production"
        return 0
    fi

    # Get All-Employees group ID
    local all_employees_id=$($KCADM get groups -r "$REALM" -q "name=All-Employees" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

    # Assign ALL users to All-Employees group
    if [ -n "$all_employees_id" ]; then
        log_info "Assigning all users to All-Employees group..."
        local users=$($KCADM get users -r "$REALM" --fields username,id 2>/dev/null)

        # Extract each user and assign to All-Employees
        echo "$users" | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | while read user_id; do
            if [ -n "$user_id" ]; then
                $KCADM update "users/$user_id/groups/$all_employees_id" -r "$REALM" -s realm="$REALM" -n 2>/dev/null || true
            fi
        done
        log_info "  All users assigned to All-Employees"
    fi

    # Department-specific assignments (existing logic)
    local -a user_groups=(
        "eve.thompson:C-Suite"
        "alice.chen:HR-Department,Managers"
        # ... rest of existing mappings
    )

    # ... existing assignment logic
}
```

### Step 4: Update MCP Gateway Role Mapper

**File**: `services/mcp-gateway/src/mcp/role-mapper.ts`

```typescript
export function createDefaultMCPServers(mcpServerUrls: {
  hr: string;
  finance: string;
  sales: string;
  support: string;
}): MCPServerConfig[] {
  return [
    {
      name: 'hr',
      url: mcpServerUrls.hr,
      // Added 'employee' for self-access
      requiredRoles: ['employee', 'hr-read', 'hr-write', 'executive'],
      description: 'HR data including employees, departments, org structure',
    },
    {
      name: 'finance',
      url: mcpServerUrls.finance,
      requiredRoles: ['employee', 'finance-read', 'finance-write', 'executive'],
      description: 'Financial data including budgets, reports, invoices',
    },
    {
      name: 'sales',
      url: mcpServerUrls.sales,
      requiredRoles: ['employee', 'sales-read', 'sales-write', 'executive'],
      description: 'CRM data including customers, deals, pipeline',
    },
    {
      name: 'support',
      url: mcpServerUrls.support,
      requiredRoles: ['employee', 'support-read', 'support-write', 'executive'],
      description: 'Support data including tickets, knowledge base',
    },
  ];
}
```

### Step 5: Update Terraform Keycloak Configuration

**File**: `infrastructure/terraform/keycloak/main.tf`

```hcl
# =============================================================================
# Employee Role (Base access for all employees)
# =============================================================================

resource "keycloak_role" "employee" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "employee"
  description = "Base employee role - allows self-access to all MCP servers"
}

# =============================================================================
# All-Employees Group
# =============================================================================

resource "keycloak_group" "all_employees" {
  realm_id = keycloak_realm.tamshai_corp.id
  name     = "All-Employees"
}

resource "keycloak_group_roles" "all_employees_roles" {
  realm_id = keycloak_realm.tamshai_corp.id
  group_id = keycloak_group.all_employees.id

  role_ids = [
    keycloak_role.employee.id,
  ]
}

# =============================================================================
# User Group Memberships (assign all users to All-Employees)
# =============================================================================

resource "keycloak_group_memberships" "alice_chen_all_employees" {
  realm_id = keycloak_realm.tamshai_corp.id
  group_id = keycloak_group.all_employees.id
  members  = [
    keycloak_user.alice_chen.username,
    keycloak_user.bob_martinez.username,
    keycloak_user.carol_johnson.username,
    keycloak_user.dan_williams.username,
    keycloak_user.eve_thompson.username,
    keycloak_user.frank_davis.username,
    keycloak_user.nina_patel.username,
    keycloak_user.marcus_johnson.username,
    keycloak_user.test_user_journey.username,
  ]
}
```

### Step 6: Update identity-sync Service

Modify the identity-sync service to automatically assign new employees to the `All-Employees` group:

**File**: `services/mcp-hr/src/identity-sync.ts` (or similar)

```typescript
async function provisionUser(employee: Employee): Promise<void> {
  // Create user in Keycloak
  const userId = await keycloak.createUser({
    username: employee.username,
    email: employee.email,
    // ...
  });

  // Always assign to All-Employees group
  await keycloak.assignUserToGroup(userId, 'All-Employees');

  // Assign department-specific groups based on employee.department
  const departmentGroup = mapDepartmentToGroup(employee.department);
  if (departmentGroup) {
    await keycloak.assignUserToGroup(userId, departmentGroup);
  }
}
```

---

## Access Matrix After Implementation

| User | Groups | Roles | HR Access | Finance Access | Sales Access | Support Access |
|------|--------|-------|-----------|----------------|--------------|----------------|
| eve.thompson | All-Employees, C-Suite | `employee`, `executive` | **All** | **All** | **All** | **All** |
| alice.chen | All-Employees, HR-Dept | `employee`, `hr-read`, `hr-write` | **All** | Self | Self | Self |
| bob.martinez | All-Employees, Finance | `employee`, `finance-read`, `finance-write` | Self | **All** | Self | Self |
| carol.johnson | All-Employees, Sales-Mgr | `employee`, `sales-read`, `sales-write` | Self | Self | **All** | Self |
| dan.williams | All-Employees, Support | `employee`, `support-read`, `support-write` | Self | Self | Self | **All** |
| nina.patel | All-Employees, Eng-Mgr | `employee`, `manager` | Self | Self | Self | Self |
| marcus.johnson | All-Employees, Eng-Team | `employee` | **Self** | **Self** | **Self** | **Self** |
| frank.davis | All-Employees, IT-Team | `employee` | **Self** | **Self** | **Self** | **Self** |

**Legend**:
- **All**: Full department access (view all records)
- **Self**: Self-access only (view own record/tickets/expenses)

---

## Updated Role Hierarchy

```
executive (composite)
├── hr-read
├── finance-read
├── sales-read
└── support-read

employee (base role - all employees)
├── Grants access to all MCP servers
└── RLS enforces self-access only

Department Roles (elevated access):
├── hr-read, hr-write → Full HR access
├── finance-read, finance-write → Full Finance access
├── sales-read, sales-write → Full Sales access
└── support-read, support-write → Full Support access

manager (special role)
└── Grants access to direct reports via RLS is_manager_of()
```

---

## RLS Policy Interaction

The `employee` role grants MCP server access, but **RLS policies still control data visibility**:

| Scenario | MCP Gateway | RLS Policy | Result |
|----------|-------------|------------|--------|
| Marcus views HR | `employee` → Allowed | `employee_self_access` | Sees only his record |
| Marcus views all HR | `employee` → Allowed | No `hr-read` role | Query returns 1 row |
| Alice views HR | `hr-read` → Allowed | `employee_hr_access` | Sees all employees |
| Eve views HR | `executive` → Allowed | `employee_executive_access` | Sees all employees |

---

## Testing Plan

### Unit Tests

1. **role-mapper.test.ts**: Add tests for `employee` role granting access
   ```typescript
   it('should grant access to all servers with employee role', () => {
     const servers = createDefaultMCPServers(urls);
     const accessible = getAccessibleMCPServers(['employee'], servers);
     expect(accessible).toHaveLength(4);
   });
   ```

### Integration Tests

2. **Self-access tests**:
   - Marcus Johnson can view his own HR record
   - Marcus Johnson cannot view other employees
   - Frank Davis can submit support tickets
   - Frank Davis can view only his own tickets

### E2E Tests

3. **Login journey with self-access**:
   - Login as `marcus.johnson`
   - Navigate to HR app → See only own record
   - Navigate to Finance app → See only own expenses
   - Navigate to Support app → See only own tickets

---

## Migration Plan

### Phase 1: Development (Immediate)

1. Add `employee` role to `realm-export-dev.json`
2. Add `All-Employees` group to `realm-export-dev.json`
3. Update `sync-realm.sh` to create group and assign users
4. Update `role-mapper.ts` to include `employee` role
5. Test locally with `docker compose up`

### Phase 2: Stage/VPS (After Dev Testing)

1. Run `sync-realm.sh stage` to apply changes
2. Deploy updated MCP Gateway
3. Verify self-access works in stage environment

### Phase 3: Production (After Stage Verification)

1. Apply Terraform changes for Keycloak
2. Deploy updated MCP Gateway to Cloud Run
3. Run `sync-realm.sh prod` to apply group assignments
4. Verify self-access works in production

---

## Rollback Plan

If issues arise:

1. **Quick Fix**: Remove `employee` from `requiredRoles` in `role-mapper.ts`
   - This restores original behavior (no self-access)
   - Deploy updated MCP Gateway

2. **Full Rollback**:
   - Remove `All-Employees` group from Keycloak
   - Remove `employee` role from Keycloak
   - Revert `role-mapper.ts`
   - Revert `sync-realm.sh`

---

## Security Considerations

### Why This Is Safe

1. **RLS remains the ultimate gatekeeper**: The `employee` role only grants MCP server access, not data access
2. **Defense in depth preserved**: Application layer (MCP Gateway) + Database layer (RLS)
3. **No privilege escalation**: `employee` role cannot see more than RLS allows
4. **Principle of least privilege**: Self-access is the minimum necessary

### Audit Implications

- All data access is still logged in `access_audit_log`
- Token claims show `employee` role for audit trail
- RLS policies enforce access even if gateway is bypassed

---

## Files to Modify

| File | Change |
|------|--------|
| `keycloak/realm-export-dev.json` | Add `employee` role, `All-Employees` group |
| `keycloak/realm-export.json` | Add `employee` role, `All-Employees` group |
| `keycloak/scripts/sync-realm.sh` | Add `sync_all_employees_group()`, update `assign_user_groups()` |
| `infrastructure/terraform/keycloak/main.tf` | Add `employee` role, `All-Employees` group, memberships |
| `services/mcp-gateway/src/mcp/role-mapper.ts` | Add `employee` to all `requiredRoles` |
| `services/mcp-gateway/src/mcp/role-mapper.test.ts` | Add tests for `employee` role |
| `docs/security/IAM_DESIGN.md` | Update documentation |

---

## Estimated Effort

| Task | Complexity | Files |
|------|------------|-------|
| Keycloak realm exports | Low | 2 |
| sync-realm.sh updates | Medium | 1 |
| Terraform configuration | Medium | 1 |
| MCP Gateway role mapper | Low | 2 |
| Unit tests | Low | 1 |
| Integration tests | Medium | 2 |
| Documentation | Low | 1 |

**Total**: ~10 files, Medium complexity

---

## Approval Checklist

- [ ] Plan reviewed by security lead
- [ ] RLS policies verified to enforce self-access correctly
- [ ] Unit tests written for role mapper changes
- [ ] Integration tests cover self-access scenarios
- [ ] Documentation updated
- [ ] Rollback plan tested

---

*Last Updated: January 13, 2026*
*Author: Tamshai-Dev*
