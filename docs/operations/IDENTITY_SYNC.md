# Identity Sync Service

This document describes the identity synchronization service that provisions HR employees as Keycloak users in the Tamshai Enterprise AI system.

## Overview

The identity sync service bridges the gap between HR employee data (stored in PostgreSQL) and Keycloak user accounts. It enables single sign-on (SSO) for employees by automatically creating and maintaining their Keycloak accounts based on HR system data.

## Architecture

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IDENTITY SYNC FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────────┐
│   PostgreSQL     │     │  identity-sync   │     │       Keycloak           │
│   (HR Database)  │     │    Service       │     │   (Identity Provider)    │
└────────┬─────────┘     └────────┬─────────┘     └────────────┬─────────────┘
         │                        │                            │
         │  1. Query employees    │                            │
         │◄───────────────────────│                            │
         │                        │                            │
         │  Employee records      │                            │
         │───────────────────────►│                            │
         │                        │                            │
         │                        │  2. Authenticate           │
         │                        │     (client credentials)   │
         │                        │───────────────────────────►│
         │                        │                            │
         │                        │  Access token              │
         │                        │◄───────────────────────────│
         │                        │                            │
         │                        │  3. For each employee:     │
         │                        │     Check if user exists   │
         │                        │───────────────────────────►│
         │                        │                            │
         │                        │  User exists?              │
         │                        │◄───────────────────────────│
         │                        │                            │
         │                        │  4a. If new: Create user   │
         │                        │───────────────────────────►│
         │                        │                            │
         │                        │  4b. If exists: Update     │
         │                        │───────────────────────────►│
         │                        │                            │
         │                        │  5. Look up realm role     │
         │                        │     by name                │
         │                        │───────────────────────────►│
         │                        │                            │
         │                        │  Role (or not found)       │
         │                        │◄───────────────────────────│
         │                        │                            │
         │                        │  6. Assign realm role      │
         │                        │     to user                │
         │                        │───────────────────────────►│
         │                        │                            │
         │                        │  Success                   │
         │                        │◄───────────────────────────│
         │                        │                            │
```

### Component Interaction

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SYSTEM COMPONENTS                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐
│     PostgreSQL      │
│  ┌───────────────┐  │
│  │  hr.employees │  │  ← Source of truth for employee data
│  │  - employee_id│  │
│  │  - email      │  │
│  │  - first_name │  │
│  │  - last_name  │  │
│  │  - department │  │
│  │  - hire_date  │  │
│  │  - status     │  │
│  └───────────────┘  │
└──────────┬──────────┘
           │
           │ SQL Query
           ▼
┌─────────────────────┐
│   identity-sync     │
│   Docker Container  │
│  ┌───────────────┐  │
│  │ IdentitySync  │  │  ← Core service class
│  │   Service     │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ KcAdminClient │  │  ← Keycloak Admin API client
│  └───────────────┘  │
└──────────┬──────────┘
           │
           │ Keycloak Admin REST API
           ▼
┌─────────────────────┐
│      Keycloak       │
│  ┌───────────────┐  │
│  │  tamshai-corp │  │  ← Realm
│  │     realm     │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │  Realm Roles  │  │  ← Roles defined at realm level
│  │  - hr-read    │  │
│  │  - hr-write   │  │
│  │  - finance-*  │  │
│  │  - sales-*    │  │
│  │  - support-*  │  │
│  │  - executive  │  │  ← Composite role (all read access)
│  └───────────────┘  │
└─────────────────────┘
```

### Department to Role Mapping

```
┌────────────────────┐     ┌─────────────────────┐
│    HR Department   │────►│  hr-read, hr-write  │
└────────────────────┘     └─────────────────────┘

┌────────────────────┐     ┌─────────────────────────────┐
│ Finance Department │────►│  finance-read, finance-write│
└────────────────────┘     └─────────────────────────────┘

┌────────────────────┐     ┌───────────────────────────┐
│  Sales Department  │────►│  sales-read, sales-write  │
└────────────────────┘     └───────────────────────────┘

┌────────────────────┐     ┌─────────────────────────────┐
│ Support Department │────►│ support-read, support-write │
└────────────────────┘     └─────────────────────────────┘

┌────────────────────┐     ┌─────────────────────────────┐
│     Executive      │────►│  executive (composite role) │
└────────────────────┘     └─────────────────────────────┘
```

## Dev vs Stage Environments

### Development Environment

In development, users are **pre-configured** in `keycloak/realm-export-dev.json`:

```json
{
  "users": [
    {
      "username": "eve.thompson",
      "email": "eve.thompson@tamshai.com",
      "enabled": true,
      "credentials": [{"type": "password", "value": "..."}],
      ...
    },
    // ... 7 more pre-configured users
  ]
}
```

This means:
- Users exist immediately after Keycloak starts
- Identity sync finds existing users and skips creation
- Role assignment code path is rarely exercised

### Stage/Production Environments

In stage and production, `keycloak/realm-export.json` has an **empty users array**:

```json
{
  "users": []
}
```

This means:
- No users exist after Keycloak starts
- Identity sync must create all users from HR data
- All code paths (create user, assign roles) are exercised

## Username Format (Updated January 2026)

The identity sync service creates Keycloak usernames in `firstname.lastname` format (e.g., `eve.thompson`) rather than using the email address. This ensures:

- **Consistency**: Same username format across dev and stage/prod environments
- **User Experience**: Users can log in with familiar `firstname.lastname` usernames
- **Alignment**: Matches pre-configured users in `realm-export-dev.json`

If users were previously created with email as username, they will need to be deleted and re-synced to get the correct username format.

## Role Assignment Evolution

### Original Issue: Client UUID Bug (January 2026)

The identity sync service originally used **client roles** (roles defined on the `mcp-gateway` client). This caused issues because:

1. The Keycloak Admin API requires client UUID for `clients.listRoles()`
2. The code was passing `clientId` (name) instead of UUID
3. Resulted in "unknown_error" for all employees in stage

### Current Solution: Realm Roles (January 2026)

The fix was refactored to use **realm roles** instead of client roles. This is simpler and more reliable:

```typescript
private async assignDepartmentRole(
  keycloakUserId: string,
  department: string
): Promise<void> {
  const roleName = DEPARTMENT_ROLE_MAP[department];
  if (!roleName) return;

  // Look up the realm role by name (no client UUID needed)
  const realmRole = await this.kcAdmin.roles.findOneByName({ name: roleName });
  if (!realmRole || !realmRole.id) {
    return; // Role not found - skip assignment
  }

  // Assign realm role to user
  await this.kcAdmin.users.addRealmRoleMappings({
    id: keycloakUserId,
    roles: [{ id: realmRole.id, name: realmRole.name! }],
  });
}
```

**Why realm roles are better:**
- No client UUID lookup required
- Roles appear in `realm_access.roles` in JWT (standard location)
- MCP Gateway already merges realm and client roles
- Simpler code with fewer API calls

### Department Role Mapping

The `DEPARTMENT_ROLE_MAP` maps HR department codes to Keycloak realm roles:

| Department Code | Realm Role |
|-----------------|------------|
| HR | hr-read |
| FIN | finance-read |
| SALES | sales-read |
| SUPPORT | support-read |
| ENG | engineering-read |
| EXEC | executive |

The `executive` role is a **composite role** that includes read access to all departments.

### Docker Cache Issue

When deploying fixes, always use the `--build` flag to rebuild containers:

```bash
# Forces rebuild with latest code
docker compose run --rm --build identity-sync
```

This was added to:
- `.github/workflows/deploy-vps.yml`
- `infrastructure/terraform/vps/cloud-init.yaml`
- `scripts/infra/deploy.sh`

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `KEYCLOAK_URL` | Keycloak base URL | `http://keycloak:8080` |
| `KEYCLOAK_REALM` | Target realm | `tamshai-corp` |
| `KEYCLOAK_CLIENT_ID` | Service account client | `mcp-hr-service` |
| `KEYCLOAK_CLIENT_SECRET` | Service account secret | `MCP_HR_SERVICE_CLIENT_SECRET` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `STAGE_TESTING_PASSWORD` | Fixed password for synced users (stage/dev only) | `TamshaiTemp123!` |

**Note on STAGE_TESTING_PASSWORD:** In stage/dev environments, all synced users are given this fixed password for testing. In production, this should be left empty and users will receive cryptographically random passwords (requiring password reset on first login).

### Keycloak Client Requirements

The `mcp-hr-service` client must have:
- `serviceAccountsEnabled: true`
- Service account roles:
  - `realm-management/manage-users`
  - `realm-management/query-users`
  - `realm-management/view-clients`
  - `realm-management/query-clients`

## Running Identity Sync

### Via Deployment Scripts

```bash
# Full deployment (includes identity sync)
./scripts/infra/deploy.sh dev --sync
./scripts/infra/deploy.sh stage

# Manual sync only
./scripts/infra/keycloak.sh sync-users dev
```

### Via Docker Compose

```bash
# In development
cd infrastructure/docker
docker compose run --rm --build identity-sync

# In stage (SSH to VPS)
cd /opt/tamshai
docker compose run --rm --build identity-sync
```

### Via GitHub Actions

The `deploy-vps.yml` workflow automatically runs identity sync after deployment.

## Troubleshooting

### Common Issues

**1. "unknown_error" for all employees**
- Check if `mcp-hr-service` client has required realm-management roles
- Verify client secret matches between Keycloak and environment variables

**2. Users not created**
- Check `identity-sync` container logs: `docker logs tamshai-identity-sync`
- Verify PostgreSQL `hr.employees` table has data
- Check Keycloak is accessible from identity-sync container

**3. Roles not assigned**
- Verify realm roles exist in Keycloak (hr-read, finance-read, etc.)
- Check department code in HR database matches DEPARTMENT_ROLE_MAP
- Verify `mcp-hr-service` client has `realm-management/manage-users` role

**4. Changes not taking effect**
- Use `--build` flag to rebuild container with latest code
- Verify code changes are committed and pushed

### Viewing Logs

```bash
# Container logs
docker logs tamshai-identity-sync

# Follow logs in real-time
docker logs -f tamshai-identity-sync

# All logs from identity sync runs
docker compose logs identity-sync
```

## Related Documentation

- [Keycloak Management Guide](./KEYCLOAK_MANAGEMENT.md)
- [VPS Deployment Guide](../deployment/VPS_SETUP_GUIDE.md)
- [GitHub Actions Deployment](../.github/workflows/deploy-vps.yml)

---

*Last Updated: January 2026*
*Fixed: Realm roles instead of client roles, EXEC department mapping, Docker cache issue*
