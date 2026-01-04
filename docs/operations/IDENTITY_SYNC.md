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
         │                        │  5. Lookup mcp-gateway     │
         │                        │     client UUID            │
         │                        │───────────────────────────►│
         │                        │                            │
         │                        │  Client UUID               │
         │                        │◄───────────────────────────│
         │                        │                            │
         │                        │  6. List client roles      │
         │                        │───────────────────────────►│
         │                        │                            │
         │                        │  Available roles           │
         │                        │◄───────────────────────────│
         │                        │                            │
         │                        │  7. Assign department role │
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
│  │  mcp-gateway  │  │  ← Client with role definitions
│  │    client     │  │
│  │  - hr-read    │  │
│  │  - hr-write   │  │
│  │  - finance-*  │  │
│  │  - sales-*    │  │
│  │  - support-*  │  │
│  │  - executive  │  │
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

## The Client UUID Bug (Fixed January 2026)

### Problem

The identity sync service failed in stage with "unknown_error" for all 59 employees.

### Root Cause

The Keycloak Admin API expects the **client UUID** (internal identifier) when listing roles, but the code was passing the **clientId** (human-readable name):

```typescript
// WRONG - uses clientId name 'mcp-gateway'
const roles = await this.kcAdmin.clients.listRoles({
  id: KeycloakConfig.MCP_GATEWAY_CLIENT_ID,  // 'mcp-gateway'
});
```

### Why It Worked in Dev

In dev, users are pre-configured, so:
1. Identity sync finds existing user
2. Skips user creation
3. Checks if user already has roles assigned
4. Skips role assignment (never calls buggy code)

### Why It Failed in Stage

In stage, users don't exist, so:
1. Identity sync must create each user
2. After creation, assigns department role
3. Calls `clients.listRoles` with wrong ID
4. Keycloak returns 404/error
5. Sync fails with "unknown_error"

### The Fix

Added a client lookup step before listing roles:

```typescript
// CORRECT - first lookup client UUID, then use it
private async assignDepartmentRole(
  keycloakUserId: string,
  department: string
): Promise<void> {
  // Step 1: Find client by clientId to get its internal UUID
  const clients = await this.kcAdmin.clients.find({
    clientId: KeycloakConfig.MCP_GATEWAY_CLIENT_ID,  // 'mcp-gateway'
  });

  if (clients.length === 0 || !clients[0].id) {
    return; // Client not found - skip role assignment
  }

  const clientUUID = clients[0].id;  // e.g., '123e4567-e89b-12d3-a456-426614174000'

  // Step 2: Now use the UUID to list roles
  const roles = await this.kcAdmin.clients.listRoles({
    id: clientUUID,  // Uses UUID, not clientId
  });

  // ... assign matching role to user
}
```

### Docker Cache Issue

After deploying the fix, identity sync still failed because `docker compose run --rm identity-sync` used a cached image. The fix was to add the `--build` flag:

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
- Verify `mcp-gateway` client exists with role definitions
- Check role names match department mapping

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
*Fixed: Client UUID lookup bug, Docker cache issue*
