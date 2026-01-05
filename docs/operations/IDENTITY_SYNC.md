# Identity Sync Service

This document describes the identity synchronization service that provisions HR employees as Keycloak users in the Tamshai Enterprise AI system.

## Overview

The identity sync service bridges the gap between HR employee data (stored in PostgreSQL) and Keycloak user accounts. It enables single sign-on (SSO) for employees by automatically creating and maintaining their Keycloak accounts based on HR system data.

## Phoenix Architecture

The system follows "Phoenix Server" principles - the VPS can be destroyed and recreated with `terraform destroy && terraform apply`, and the application stack will **self-converge** to the correct state without manual intervention.

### Container-Native Seeding (Already Implemented)

#### A. Database Seeding via Docker Entrypoint

PostgreSQL automatically seeds data on first boot using Docker's native initialization:

**Implementation** (`infrastructure/docker/docker-compose.yml`):
```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init-multiple-databases.sh:/docker-entrypoint-initdb.d/01-init-multiple-databases.sh:ro
      - ../../sample-data/hr-data.sql:/docker-entrypoint-initdb.d/02-hr-data.sql:ro
      - ../../sample-data/finance-data.sql:/docker-entrypoint-initdb.d/03-finance-data.sql:ro
```

**How it works:**
- Files in `/docker-entrypoint-initdb.d/` execute in alphabetical order on first container start
- `01-init-multiple-databases.sh` creates the databases
- `02-hr-data.sql` seeds HR schema and employee data
- `03-finance-data.sql` seeds finance schema and data
- Runs only once (when `postgres_data` volume is empty)

**Result:** No manual database restore required. Fresh VPS gets seeded automatically.

#### B. Keycloak Seeding via Native Realm Import

Keycloak imports the realm configuration on every startup:

**Implementation** (`infrastructure/docker/docker-compose.yml`):
```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    command: start-dev --import-realm
    volumes:
      - ../../keycloak/realm-export-dev.json:/opt/keycloak/data/import/realm-export.json:ro
```

**How it works:**
- `--import-realm` flag tells Keycloak to import on startup
- Realm file at `/opt/keycloak/data/import/realm-export.json` is loaded
- Contains: realm settings, clients, roles, client scopes, authentication flows
- Dev uses `realm-export-dev.json` (includes test users)
- Stage/Prod uses `realm-export.json` (no pre-configured users)

**Result:** No manual Keycloak configuration required. Realm is ready immediately.

#### C. Runtime Identity Reconciliation (Self-Healing)

The `mcp-hr` service reconciles HR employees to Keycloak users on startup:

**How it works:**
1. `mcp-hr` waits for PostgreSQL and Keycloak to be healthy
2. On startup, calls `IdentityService.reconcileOnStartup()`
3. Queries all active employees from PostgreSQL
4. For each employee, checks if Keycloak user exists
5. Creates missing users, updates existing users
6. Assigns realm roles based on department

**Result:** If VPS reboots or identity sync previously failed, users are automatically reconciled.

### Phoenix Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHOENIX SELF-HEALING ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────────┘

  terraform apply
        │
        ▼
┌───────────────────┐
│   cloud-init      │
│                   │
│  1. Install Docker│
│  2. Git clone     │
│  3. docker compose│
│     up -d         │
│  4. DONE          │  ← No scripts, no manual steps
└───────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         DOCKER COMPOSE                                      │
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │  PostgreSQL │    │  Keycloak   │    │    Redis    │    │   mcp-hr    │ │
│  │             │    │             │    │             │    │             │ │
│  │ Seeds from  │    │ Imports     │    │ Ready for   │    │ Reconciles  │ │
│  │ /docker-    │    │ realm on    │    │ connections │    │ users on    │ │
│  │ entrypoint- │    │ startup     │    │             │    │ startup     │ │
│  │ initdb.d/   │    │             │    │             │    │             │ │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘    └──────┬──────┘ │
│         │                  │                                      │        │
│         │    SELF-SEEDING  │         SELF-CONFIGURING            │        │
│         ▼                  ▼                                      ▼        │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     HEALTHY SYSTEM STATE                             │  │
│  │  - All databases seeded with sample data                            │  │
│  │  - Keycloak realm configured with clients, roles, scopes            │  │
│  │  - All HR employees synced as Keycloak users                        │  │
│  │  - Ready to accept logins                                           │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Old vs New Architecture

| Aspect | Old (Brittle) | New (Phoenix) |
|--------|---------------|---------------|
| **Database seeding** | Manual `restore.sh` script | Automatic via `/docker-entrypoint-initdb.d/` |
| **Keycloak config** | Manual `sync-realm.sh` script | Automatic via `--import-realm` |
| **User provisioning** | One-shot `identity-sync` container | Self-healing reconciliation in `mcp-hr` |
| **cloud-init** | Complex script orchestration | Simple `docker compose up -d` |
| **VPS reboot** | Users may be missing | Automatically reconciled |
| **Failure recovery** | Manual intervention required | Self-healing on next startup |

---

## Identity Sync Flow

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IDENTITY SYNC FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────────┐
│   PostgreSQL     │     │     mcp-hr       │     │       Keycloak           │
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
│  │  - employee_id│  │    Seeded via /docker-entrypoint-initdb.d/
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
│      mcp-hr         │
│   Docker Container  │
│  ┌───────────────┐  │
│  │ IdentitySync  │  │  ← Reconciles on startup (self-healing)
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
│  │  tamshai-corp │  │  ← Realm (imported via --import-realm)
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

The `DEPARTMENT_ROLE_MAP` maps HR department codes to Keycloak realm roles:

| Department Code | Realm Role | Description |
|-----------------|------------|-------------|
| HR | hr-read | HR department read access |
| FIN | finance-read | Finance department read access |
| SALES | sales-read | Sales department read access |
| SUPPORT | support-read | Support department read access |
| ENG | engineering-read | Engineering department read access |
| EXEC | executive | Composite role (all department read access) |

---

## Email Domain Transformation

The identity sync service supports **environment-based email domain transformation**, allowing a single source of truth for employee data while using different email domains per environment.

### How It Works

| Environment | Source Email (HR Database) | Keycloak Email |
|-------------|---------------------------|----------------|
| **dev** | `alice@tamshai.local` | `alice@tamshai.local` (unchanged) |
| **stage** | `alice@tamshai.local` | `alice@tamshai.com` (transformed) |
| **prod** | `alice@tamshai.local` | `alice@tamshai.com` (transformed) |

### Implementation

The `transformEmailForEnvironment()` function in `services/mcp-hr/src/services/identity.ts` handles this:

```typescript
export function transformEmailForEnvironment(email: string): string {
  const environment = process.env.ENVIRONMENT || 'dev';

  // In dev environment, keep emails as-is (@tamshai.local)
  if (environment === 'dev') {
    return email;
  }

  // In stage/prod, transform @tamshai.local to @tamshai.com
  if (email.endsWith('@tamshai.local')) {
    return email.replace('@tamshai.local', '@tamshai.com');
  }

  return email;
}
```

### Why This Design?

1. **Single source of truth**: One `hr-data.sql` file for all environments
2. **Local development**: Uses `.local` domain to avoid DNS/email conflicts
3. **Stage/Production**: Uses real `@tamshai.com` domain for user logins
4. **Automatic**: No manual configuration needed - driven by `ENVIRONMENT` variable

### Configuration

The `ENVIRONMENT` variable is set in:
- **Dev**: Not set or `dev` (uses docker-compose defaults)
- **Stage/Prod**: Set in `cloud-init.yaml` via Terraform: `ENVIRONMENT=${environment}`

---

## Dev vs Stage Environments

### Development Environment

In development, users are **pre-configured** in `keycloak/realm-export-dev.json`:

```json
{
  "users": [
    {
      "username": "eve.thompson",
      "email": "eve@tamshai.local",
      "enabled": true,
      "credentials": [{"type": "password", "value": "..."}],
      ...
    },
    // ... 7 more pre-configured users
  ]
}
```

This means:
- Users exist immediately after Keycloak starts (via `--import-realm`)
- Identity reconciliation finds existing users and verifies/updates them
- Emails use `@tamshai.local` domain (no transformation in dev)
- Faster development cycle (no waiting for user creation)

### Stage/Production Environments

In stage and production, `keycloak/realm-export.json` has an **empty users array**:

```json
{
  "users": []
}
```

This means:
- No users exist after Keycloak realm import
- Identity reconciliation creates all users from HR database
- Emails are transformed from `@tamshai.local` → `@tamshai.com`
- All code paths (create user, assign roles) are exercised
- Uses `STAGE_TESTING_PASSWORD` for predictable test credentials

---

## Role Assignment

### Realm Roles (Current Implementation)

The identity sync uses **realm roles** rather than client roles. This is simpler and more reliable:

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

### Historical Note: Client UUID Bug

The original implementation used client roles, which required looking up the `mcp-gateway` client UUID. This caused issues because the code passed `clientId` (name) instead of UUID. The switch to realm roles eliminated this complexity entirely.

---

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `KEYCLOAK_URL` | Keycloak base URL | `http://keycloak:8080` |
| `KEYCLOAK_REALM` | Target realm | `tamshai-corp` |
| `KEYCLOAK_CLIENT_ID` | Service account client | `mcp-hr-service` |
| `KEYCLOAK_CLIENT_SECRET` | Service account secret | `MCP_HR_SERVICE_CLIENT_SECRET` |
| `POSTGRES_HOST` | PostgreSQL host | `postgres` |
| `POSTGRES_DB` | Database name | `tamshai_hr` |
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

---

## Running Identity Sync

### Automatic (Recommended)

With the Phoenix architecture, identity sync runs automatically:

1. **On VPS creation**: `mcp-hr` reconciles users on startup
2. **On VPS reboot**: `mcp-hr` reconciles users on startup
3. **On container restart**: `mcp-hr` reconciles users on startup

No manual intervention required.

### Manual Trigger (If Needed)

```bash
# Restart mcp-hr to trigger reconciliation
docker compose restart mcp-hr

# View reconciliation logs
docker compose logs -f mcp-hr | grep -i reconcil
```

### Legacy One-Shot Sync (Deprecated)

The standalone `identity-sync` container is deprecated but still available:

```bash
# In development
cd infrastructure/docker
docker compose run --rm --build identity-sync

# In stage (SSH to VPS)
cd /opt/tamshai
docker compose run --rm --build identity-sync
```

---

## Troubleshooting

### Common Issues

**1. Users not created after VPS deploy**
- Check `mcp-hr` container logs: `docker compose logs mcp-hr`
- Verify PostgreSQL `hr.employees` table has data
- Check Keycloak is healthy: `curl http://localhost:8080/health/ready`

**2. Roles not assigned**
- Verify realm roles exist in Keycloak (hr-read, finance-read, etc.)
- Check department code in HR database matches DEPARTMENT_ROLE_MAP
- Verify `mcp-hr-service` client has `realm-management/manage-users` role

**3. Reconciliation not running**
- Check `mcp-hr` started successfully: `docker compose ps`
- Look for "Starting Identity Reconciliation" in logs
- Verify PostgreSQL and Keycloak health checks pass

**4. Docker Hub rate limiting**
- Error: "You have reached your unauthenticated pull rate limit"
- Wait 6 hours for limit reset, or use Docker Hub authentication
- Consider using alternative registries (quay.io for Keycloak)

### Viewing Logs

```bash
# mcp-hr reconciliation logs
docker compose logs mcp-hr | grep -i "reconcil\|identity\|sync"

# All mcp-hr logs
docker compose logs -f mcp-hr

# Check container health
docker compose ps
```

---

## Related Documentation

- [Keycloak Management Guide](./KEYCLOAK_MANAGEMENT.md)
- [VPS Deployment Guide](../deployment/VPS_SETUP_GUIDE.md)
- [GitHub Actions Deployment](../../.github/workflows/deploy-vps.yml)

---

*Last Updated: January 2026*
*Architecture: Phoenix self-healing with container-native seeding*
