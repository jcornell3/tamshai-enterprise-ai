-- Migration: Change approval columns from UUID to VARCHAR(255) for email storage
-- Purpose: Store human-readable email addresses instead of Keycloak user IDs
-- Date: 2026-02-22
--
-- This migration ensures consistent approval tracking across all services.
-- Email addresses are used because:
-- 1. Human-readable in audit logs
-- 2. No cross-service dependencies (don't need HR lookup)
-- 3. Keycloak user IDs are not valid UUIDs (have 'u' prefix)

-- =============================================================================
-- HR DATABASE MIGRATION
-- =============================================================================
\c tamshai_hr;

-- Drop the foreign key constraint on approver_id (it references hr.employees)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'time_off_requests_approver_id_fkey'
        AND table_schema = 'hr' AND table_name = 'time_off_requests'
    ) THEN
        ALTER TABLE hr.time_off_requests DROP CONSTRAINT time_off_requests_approver_id_fkey;
    END IF;
END $$;

-- Rename old column and add new email column
ALTER TABLE hr.time_off_requests
    ADD COLUMN IF NOT EXISTS approver_email VARCHAR(255);

-- Migrate existing data: look up email from employee_id
UPDATE hr.time_off_requests tor
SET approver_email = e.email
FROM hr.employees e
WHERE tor.approver_id = e.id
AND tor.approver_email IS NULL
AND tor.approver_id IS NOT NULL;

-- Drop old approver_id column (after migration)
-- Note: Keeping for now to allow rollback
-- ALTER TABLE hr.time_off_requests DROP COLUMN IF EXISTS approver_id;

-- Create index on new column
CREATE INDEX IF NOT EXISTS idx_time_off_requests_approver_email
ON hr.time_off_requests(approver_email);

-- =============================================================================
-- FINANCE DATABASE MIGRATION
-- =============================================================================
\c tamshai_finance;

-- department_budgets: approved_by and submitted_by
ALTER TABLE finance.department_budgets
    ALTER COLUMN approved_by TYPE VARCHAR(255) USING approved_by::TEXT;
ALTER TABLE finance.department_budgets
    ALTER COLUMN submitted_by TYPE VARCHAR(255) USING submitted_by::TEXT;

-- budget_approval_history: actor_id
ALTER TABLE finance.budget_approval_history
    ALTER COLUMN actor_id TYPE VARCHAR(255) USING actor_id::TEXT;

-- Rename column for clarity
ALTER TABLE finance.budget_approval_history
    RENAME COLUMN actor_id TO actor_email;

-- invoices: approved_by (expand from VARCHAR(100) to VARCHAR(255))
ALTER TABLE finance.invoices
    ALTER COLUMN approved_by TYPE VARCHAR(255);

-- expenses: approved_by
ALTER TABLE finance.expenses
    ALTER COLUMN approved_by TYPE VARCHAR(255) USING approved_by::TEXT;

-- expense_reports: approved_by, rejected_by, reimbursed_by
ALTER TABLE finance.expense_reports
    ALTER COLUMN approved_by TYPE VARCHAR(255) USING approved_by::TEXT;
ALTER TABLE finance.expense_reports
    ALTER COLUMN rejected_by TYPE VARCHAR(255) USING rejected_by::TEXT;
ALTER TABLE finance.expense_reports
    ALTER COLUMN reimbursed_by TYPE VARCHAR(255) USING reimbursed_by::TEXT;

-- =============================================================================
-- PAYROLL DATABASE MIGRATION
-- =============================================================================
\c tamshai_payroll;

-- pay_runs: created_by, approved_by, processed_by
ALTER TABLE payroll.pay_runs
    ALTER COLUMN created_by TYPE VARCHAR(255) USING created_by::TEXT;
ALTER TABLE payroll.pay_runs
    ALTER COLUMN approved_by TYPE VARCHAR(255) USING approved_by::TEXT;
ALTER TABLE payroll.pay_runs
    ALTER COLUMN processed_by TYPE VARCHAR(255) USING processed_by::TEXT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify HR changes
\c tamshai_hr;
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'hr' AND table_name = 'time_off_requests'
AND column_name IN ('approver_id', 'approver_email');

-- Verify Finance changes
\c tamshai_finance;
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'finance' AND table_name IN ('expense_reports', 'department_budgets', 'invoices', 'expenses')
AND column_name IN ('approved_by', 'rejected_by', 'reimbursed_by', 'submitted_by')
ORDER BY table_name, column_name;

-- Verify Payroll changes
\c tamshai_payroll;
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'payroll' AND table_name = 'pay_runs'
AND column_name IN ('created_by', 'approved_by', 'processed_by');
