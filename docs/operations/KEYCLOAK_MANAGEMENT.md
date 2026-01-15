# Keycloak Management Guide

This document describes how to manage Keycloak in the Tamshai Enterprise AI system, including setup, user synchronization, and troubleshooting.

## Quick Reference

```bash
# All commands use: scripts/infra/keycloak.sh [command] [environment]

# Check status
./scripts/infra/keycloak.sh status dev

# Sync realm clients and scopes
./scripts/infra/keycloak.sh sync dev

# Sync HR employees to Keycloak users
./scripts/infra/keycloak.sh sync-users dev

# Re-import client configurations (keeps users, updates mappers)
./scripts/infra/keycloak.sh reimport dev

# Reset Keycloak (fresh database, re-import realm)
./scripts/infra/keycloak.sh reset dev

# List users
./scripts/infra/keycloak.sh users dev

# List clients
./scripts/infra/keycloak.sh clients dev

# View logs
./scripts/infra/keycloak.sh logs dev
```

## Architecture

### User Sources

Keycloak has two types of users:

1. **Bootstrap Users** - Pre-configured in `keycloak/realm-export-dev.json`:
   - `alice.chen` (HR Manager)
   - `bob.martinez` (Finance Director)
   - `carol.johnson` (VP of Sales)
   - `dan.williams` (Support Director)
   - `eve.thompson` (CEO, Executive)
   - `frank.davis` (IT Intern)
   - `marcus.johnson` (Software Engineer)
   - `nina.patel` (Engineering Manager)

2. **HR-Synced Users** - Created from `hr.employees` table via `sync-users` command

### Database Configuration

Keycloak connects to PostgreSQL using:
- **Database**: `keycloak`
- **User**: `keycloak` (NOT `tamshai`)
- **Connection**: `jdbc:postgresql://postgres:5432/keycloak`

The `keycloak` user must own the `public` schema for Liquibase migrations to work.

## Fresh Environment Setup

When setting up a fresh environment, run these steps in order:

### 1. Start Services

```bash
cd infrastructure/docker
docker compose up -d
```

### 2. Wait for Keycloak

Keycloak takes 60-90 seconds to start on first run (database migrations).

```bash
# Check health
curl -sf http://localhost:8180/auth/health/ready

# Or via script
./scripts/infra/keycloak.sh status dev
```

### 3. Sync Realm Configuration

Ensure all clients and scopes are properly configured:

```bash
./scripts/infra/keycloak.sh sync dev
```

### 4. Sync HR Users

Import employees from the HR database:

```bash
./scripts/infra/keycloak.sh sync-users dev
```

This will:
- Create Keycloak users for all active HR employees
- Map departments to roles (see Role Mapping below)
- Set default password for new users

## Role Mapping

The `sync-users` command maps HR departments to Keycloak roles:

| Department Code | Keycloak Roles |
|-----------------|----------------|
| EXEC | executive |
| HR | hr-read, hr-write |
| FIN | finance-read, finance-write |
| SALES | sales-read, sales-write |
| SUPPORT | support-read, support-write |
| (other) | (no department roles) |

Additionally:
- Employees with `is_manager=true` get the `manager` role

## Re-importing Client Configurations

When you modify `realm-export-dev.json` (e.g., adding protocol mappers, audience claims), use `reimport` to apply changes without losing users:

```bash
./scripts/infra/keycloak.sh reimport dev
```

This will:
1. Read client configurations from `realm-export-dev.json`
2. Update protocol mappers for each client
3. Preserve all user accounts and sessions

**Use case**: When you add a new audience mapper to a client (e.g., `mcp-gateway-audience` for the `tamshai-website` client), run this command to apply it immediately.

**After reimport**: Users must log out and log back in to get new tokens with the updated claims.

**Note**: If `jq` is installed, the script will process all clients. Otherwise, it falls back to adding the critical `mcp-gateway-audience` mapper only.

## Resetting Keycloak

If Keycloak gets corrupted or you need a fresh start:

```bash
./scripts/infra/keycloak.sh reset dev
```

This will:
1. Stop Keycloak container
2. Drop and recreate the Keycloak database with proper permissions
3. Start Keycloak (triggers realm import)
4. Run `sync` to ensure client configuration

**Note**: This deletes all Keycloak data including users, sessions, and configuration.

## Troubleshooting

### "permission denied for schema public"

This error occurs when the `keycloak` database user doesn't have proper permissions.

**Fix**:
```bash
cd infrastructure/docker
docker compose exec -T postgres psql -U postgres -d keycloak -c "
    ALTER SCHEMA public OWNER TO keycloak;
    GRANT ALL ON SCHEMA public TO keycloak;
"
docker compose restart keycloak
```

### "no schema has been selected to create in"

Similar to above - the schema permissions aren't correct.

**Fix**: Run the reset command:
```bash
./scripts/infra/keycloak.sh reset dev
```

### Realm not imported

Keycloak only imports the realm on a fresh database. If you need to re-import:

1. Use the reset command, or
2. Manually:
   ```bash
   docker compose stop keycloak
   docker compose exec -T postgres psql -U postgres -d keycloak -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION keycloak;"
   docker compose up -d keycloak
   ```

### Users can't log in with SSO

Check that the client scopes are configured:

```bash
./scripts/infra/keycloak.sh scopes dev
```

Should include: `profile`, `email`, `roles`, `web-origins`, `offline_access`

If scopes are missing, run:
```bash
./scripts/infra/keycloak.sh sync dev
```

### HR users not appearing

Run the user sync:
```bash
./scripts/infra/keycloak.sh sync-users dev
```

Check the HR database has active employees:
```bash
docker compose exec -T postgres psql -U tamshai -d tamshai_hr -c \
    "SELECT COUNT(*) FROM hr.employees WHERE status='ACTIVE' AND deleted_at IS NULL;"
```

## Credentials

Credentials are managed via environment variables and should never be committed to version control:

- `KEYCLOAK_ADMIN_PASSWORD` - Keycloak admin password
- `USER_PASSWORD` - Default password for HR-synced users (mapped from DEV/STAGE/PROD_USER_PASSWORD)
- Test user credentials are in `.env.example` (dev) or GitHub Secrets (stage/prod)

**Note**: Bootstrap users (from realm export) have TOTP configured. HR-synced users do not require TOTP by default.

## Health Endpoints

| Environment | URL |
|-------------|-----|
| Dev | http://localhost:8180/auth/health/ready |
| Stage | https://$VPS_HOST/auth/health/ready |

## Related Files

- `keycloak/realm-export-dev.json` - Dev realm configuration
- `keycloak/realm-export.json` - Production realm configuration
- `keycloak/scripts/sync-realm.sh` - Client sync script
- `keycloak/scripts/sync-users.sh` - User sync script (standalone)
- `scripts/infra/keycloak.sh` - Main management script
- `infrastructure/docker/docker-compose.yml` - Keycloak container config
