-- =============================================================================
-- Migration 007: Create Admin Schema
-- =============================================================================
-- Purpose: Create admin schema for user management audit trail
-- Version: 1.0
-- Date: 2026-01-09
-- Author: Claude-Dev (Admin Portal Phase 1)
--
-- Tables:
--   - admin.user_management_audit: Immutable audit log of all admin actions
--   - admin.service_account_metadata: Service account lifecycle tracking
--
-- Security:
--   - Row-level security enabled (append-only for audit log)
--   - tamshai_app role can only INSERT and SELECT (no UPDATE/DELETE)
-- =============================================================================

-- Create admin schema
CREATE SCHEMA IF NOT EXISTS admin;

COMMENT ON SCHEMA admin IS 'Admin portal data: audit logs, service account metadata';

-- =============================================================================
-- Table: admin.user_management_audit
-- =============================================================================
-- Immutable audit log for all admin portal actions
-- Compliance: SOC 2, SOX (7-year retention)
-- =============================================================================

CREATE TABLE admin.user_management_audit (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who performed the action
  admin_user_id UUID NOT NULL,
  admin_username TEXT NOT NULL,
  admin_email TEXT,

  -- What action was taken
  action_type TEXT NOT NULL,
  -- Possible values:
  --   'create_user', 'update_user', 'delete_user', 'disable_user', 'enable_user',
  --   'assign_role', 'revoke_role', 'reset_password',
  --   'create_service_account', 'rotate_secret', 'delete_service_account',
  --   'create_role', 'delete_role'

  -- Who/what was affected
  target_user_id UUID,
  target_username TEXT,
  target_email TEXT,
  role_name TEXT,

  -- Additional context
  details JSONB,               -- Free-form additional data
  changes JSONB,               -- Before/after values for updates
  -- Example changes:
  -- {
  --   "before": {"enabled": true, "email": "old@example.com"},
  --   "after": {"enabled": false, "email": "new@example.com"}
  -- }

  -- Security metadata
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,

  -- Compliance (GDPR right-to-delete)
  retention_until TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_action_type CHECK (action_type IN (
    'create_user', 'update_user', 'delete_user', 'disable_user', 'enable_user',
    'assign_role', 'revoke_role', 'reset_password',
    'create_service_account', 'rotate_secret', 'delete_service_account',
    'create_role', 'delete_role'
  ))
);

-- Indexes for performance
CREATE INDEX idx_audit_timestamp ON admin.user_management_audit(timestamp DESC);
CREATE INDEX idx_audit_admin ON admin.user_management_audit(admin_user_id);
CREATE INDEX idx_audit_target ON admin.user_management_audit(target_user_id);
CREATE INDEX idx_audit_action ON admin.user_management_audit(action_type);
CREATE INDEX idx_audit_role ON admin.user_management_audit(role_name) WHERE role_name IS NOT NULL;

-- Full-text search on details (for audit log viewer)
CREATE INDEX idx_audit_details_gin ON admin.user_management_audit USING gin(details);

-- Table comment
COMMENT ON TABLE admin.user_management_audit IS 'Immutable audit log for all admin portal actions. Append-only for SOC 2/SOX compliance (7-year retention).';

-- Column comments
COMMENT ON COLUMN admin.user_management_audit.action_type IS 'Type of admin action performed (e.g., create_user, assign_role)';
COMMENT ON COLUMN admin.user_management_audit.details IS 'JSON context about the action (reason, request metadata, etc.)';
COMMENT ON COLUMN admin.user_management_audit.changes IS 'JSON before/after values for update operations';
COMMENT ON COLUMN admin.user_management_audit.retention_until IS 'GDPR compliance: Date when record can be purged (NULL = retain indefinitely)';

-- =============================================================================
-- Row-Level Security: Append-Only Audit Log
-- =============================================================================

-- Enable RLS on audit table
ALTER TABLE admin.user_management_audit ENABLE ROW LEVEL SECURITY;

-- Policy: Allow INSERT for tamshai_app role (append-only)
CREATE POLICY audit_append_only ON admin.user_management_audit
  FOR INSERT
  TO tamshai_app
  WITH CHECK (true);

-- Policy: Allow SELECT for tamshai_app role (read audit log)
CREATE POLICY audit_read_only ON admin.user_management_audit
  FOR SELECT
  TO tamshai_app
  USING (true);

-- No UPDATE or DELETE policies = denied by default (immutable log)

COMMENT ON POLICY audit_append_only ON admin.user_management_audit IS 'Allows tamshai_app to insert audit entries (append-only)';
COMMENT ON POLICY audit_read_only ON admin.user_management_audit IS 'Allows tamshai_app to read audit log for reporting';

-- =============================================================================
-- Table: admin.service_account_metadata
-- =============================================================================
-- Metadata for service accounts (OAuth clients)
-- Complements Keycloak client data with lifecycle tracking
-- =============================================================================

CREATE TABLE admin.service_account_metadata (
  -- Primary Key
  client_id TEXT PRIMARY KEY,

  -- Basic Info
  name TEXT NOT NULL,
  description TEXT,
  account_type TEXT NOT NULL,
  -- Possible values: 'system', 'integration', 'test'

  -- Ownership
  created_by_user_id UUID NOT NULL,
  created_by_username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Lifecycle
  last_used_at TIMESTAMPTZ,
  last_secret_rotation TIMESTAMPTZ,
  secret_expires_at TIMESTAMPTZ,

  -- Custom Attributes (owner, expiry, etc.)
  attributes JSONB,

  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID,

  -- Constraints
  CONSTRAINT valid_account_type CHECK (account_type IN ('system', 'integration', 'test'))
);

-- Indexes
CREATE INDEX idx_sa_type ON admin.service_account_metadata(account_type);
CREATE INDEX idx_sa_created_by ON admin.service_account_metadata(created_by_user_id);
CREATE INDEX idx_sa_last_used ON admin.service_account_metadata(last_used_at DESC);
CREATE INDEX idx_sa_deleted ON admin.service_account_metadata(deleted_at) WHERE deleted_at IS NOT NULL;

-- Table comment
COMMENT ON TABLE admin.service_account_metadata IS 'Service account metadata and lifecycle tracking (complements Keycloak client data)';

-- Column comments
COMMENT ON COLUMN admin.service_account_metadata.account_type IS 'Type of service account: system (core infra), integration (external), test (non-prod)';
COMMENT ON COLUMN admin.service_account_metadata.last_used_at IS 'Last time a token was issued for this service account';
COMMENT ON COLUMN admin.service_account_metadata.last_secret_rotation IS 'Last time client secret was rotated (90-day policy)';
COMMENT ON COLUMN admin.service_account_metadata.attributes IS 'Custom attributes (owner email, expiry date, cost center, etc.)';

-- =============================================================================
-- Grants: tamshai_app role permissions
-- =============================================================================

-- Grant schema usage
GRANT USAGE ON SCHEMA admin TO tamshai_app;

-- Grant table permissions
GRANT SELECT, INSERT ON admin.user_management_audit TO tamshai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin.service_account_metadata TO tamshai_app;

-- =============================================================================
-- Sample Audit Log Entry (for testing)
-- =============================================================================
-- Uncomment to insert sample entry:
-- INSERT INTO admin.user_management_audit (
--   admin_user_id, admin_username, admin_email,
--   action_type,
--   target_user_id, target_username, target_email,
--   details,
--   ip_address, user_agent
-- ) VALUES (
--   'f104eddc-21ab-457c-a254-78051ad7ad67',
--   'alice.chen',
--   'alice@tamshai.com',
--   'create_user',
--   'a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6',
--   'test.contractor',
--   'test@example.com',
--   '{"userType": "contractor", "contractEnd": "2026-06-30"}'::jsonb,
--   '192.168.1.100',
--   'Mozilla/5.0 Chrome/120.0'
-- );

-- =============================================================================
-- End of Migration 007
-- =============================================================================
