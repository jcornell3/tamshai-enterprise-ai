-- =============================================================================
-- Vault PostgreSQL User for Credential Rotation (H5+ Security Enhancement)
-- =============================================================================
--
-- This script creates a dedicated PostgreSQL user for Vault's database secrets
-- engine to manage credential rotation for application users.
--
-- IMPORTANT: Run this script ONCE during initial setup, not on every deploy.
-- The vault user password should be set via VAULT_POSTGRES_PASSWORD env var.
--
-- Usage:
--   VAULT_POSTGRES_PASSWORD=<secure-password> psql -f vault-user.sql
--
-- Prerequisites:
--   - PostgreSQL superuser access
--   - Vault database secrets engine documentation:
--     https://developer.hashicorp.com/vault/docs/secrets/databases/postgresql
--
-- =============================================================================

-- Create vault user with CREATEROLE capability
-- This allows Vault to rotate passwords for application users
-- Note: Password should be set externally via environment variable
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vault') THEN
        CREATE USER vault WITH CREATEROLE PASSWORD 'CHANGE_ME_VIA_ENV';
        RAISE NOTICE 'Created vault user';
    ELSE
        RAISE NOTICE 'Vault user already exists';
    END IF;
END
$$;

-- Grant CONNECT to all Tamshai databases
-- This allows Vault to manage connections and rotate credentials
GRANT CONNECT ON DATABASE tamshai_hr TO vault;
GRANT CONNECT ON DATABASE tamshai_finance TO vault;
GRANT CONNECT ON DATABASE tamshai_payroll TO vault;
GRANT CONNECT ON DATABASE tamshai_tax TO vault;

-- =============================================================================
-- Application User Configuration
-- =============================================================================

-- Ensure tamshai_app user cannot bypass RLS (security requirement)
-- This is critical: the app user should NEVER have BYPASSRLS
ALTER USER tamshai_app NOBYPASSRLS;

-- Verify the change
DO $$
DECLARE
    bypass_status boolean;
BEGIN
    SELECT rolbypassrls INTO bypass_status
    FROM pg_roles
    WHERE rolname = 'tamshai_app';

    IF bypass_status THEN
        RAISE EXCEPTION 'SECURITY ERROR: tamshai_app still has BYPASSRLS';
    ELSE
        RAISE NOTICE 'VERIFIED: tamshai_app has NOBYPASSRLS (RLS enforced)';
    END IF;
END
$$;

-- =============================================================================
-- Rotation Privileges
-- =============================================================================

-- Allow vault to alter tamshai_app password
-- This is the minimum privilege needed for static role rotation
GRANT tamshai_app TO vault WITH ADMIN OPTION;

-- =============================================================================
-- Verification Queries (for manual validation)
-- =============================================================================

-- Check vault user exists and has CREATEROLE
-- SELECT rolname, rolcreaterole FROM pg_roles WHERE rolname = 'vault';

-- Check tamshai_app does NOT have BYPASSRLS
-- SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'tamshai_app';

-- Check vault can manage tamshai_app
-- SELECT member::regrole, roleid::regrole FROM pg_auth_members
-- WHERE member = 'vault'::regrole;

-- =============================================================================
-- Notes for Vault Configuration
-- =============================================================================
--
-- After running this script, configure Vault with:
--
-- 1. Enable database secrets engine:
--    vault secrets enable database
--
-- 2. Configure PostgreSQL connection:
--    vault write database/config/postgresql-tamshai_hr \
--      plugin_name=postgresql-database-plugin \
--      connection_url="postgresql://{{username}}:{{password}}@postgres:5432/tamshai_hr" \
--      username="vault" \
--      password="<vault-password>"
--
-- 3. Create static role for tamshai_app:
--    vault write database/static-roles/tamshai-app \
--      db_name=postgresql-tamshai_hr \
--      username=tamshai_app \
--      rotation_period=720h \
--      rotation_statements="ALTER USER \"{{name}}\" WITH PASSWORD '{{password}}' NOBYPASSRLS;"
--
-- 4. Read credentials (auto-rotated):
--    vault read database/static-creds/tamshai-app
--
-- =============================================================================
