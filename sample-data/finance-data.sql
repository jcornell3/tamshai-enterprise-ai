-- Tamshai Corp Finance Sample Data
-- This script runs after database initialization

\c tamshai_finance;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SCHEMA (v1.4)
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS finance;

-- Grant permissions to tamshai user (admin/sync operations)
GRANT USAGE ON SCHEMA finance TO tamshai;
GRANT ALL ON ALL TABLES IN SCHEMA finance TO tamshai;
GRANT ALL ON ALL SEQUENCES IN SCHEMA finance TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT ALL ON TABLES TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT ALL ON SEQUENCES TO tamshai;

-- IMPORTANT: Allow tamshai to bypass Row-Level Security policies
-- Required for identity-sync service account
ALTER USER tamshai BYPASSRLS;

-- Create tamshai_app user for RLS-enforced operations (used by MCP servers and tests)
-- This user does NOT have BYPASSRLS - RLS policies will be enforced
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tamshai_app') THEN
        CREATE ROLE tamshai_app WITH LOGIN PASSWORD 'changeme';
    END IF;
END
$$;

-- Grant permissions to tamshai_app (same as tamshai but without BYPASSRLS)
GRANT USAGE ON SCHEMA finance TO tamshai_app;
GRANT ALL ON ALL TABLES IN SCHEMA finance TO tamshai_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA finance TO tamshai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT ALL ON TABLES TO tamshai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT ALL ON SEQUENCES TO tamshai_app;

-- =============================================================================
-- ARR METRICS TABLE (SaaS Key Metrics)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.arr_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    as_of_date DATE NOT NULL UNIQUE,
    arr DECIMAL(15,2) NOT NULL,
    mrr DECIMAL(15,2) NOT NULL,
    net_new_arr DECIMAL(15,2) DEFAULT 0,
    gross_revenue_retention DECIMAL(5,2) DEFAULT 100,
    net_revenue_retention DECIMAL(5,2) DEFAULT 100,
    arpu DECIMAL(12,2) DEFAULT 0,
    active_subscriptions INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert current ARR metrics snapshot (February 2026)
INSERT INTO finance.arr_metrics (as_of_date, arr, mrr, net_new_arr, gross_revenue_retention, net_revenue_retention, arpu, active_subscriptions)
VALUES
    ('2026-02-01', 12500000, 1041667, 250000, 92.5, 108.3, 2500, 5000),
    ('2026-01-01', 12250000, 1020833, 250000, 93.0, 107.8, 2450, 4950),
    ('2025-12-01', 12000000, 1000000, 200000, 92.8, 107.5, 2420, 4900),
    ('2025-11-01', 11800000, 983333, 180000, 92.5, 107.2, 2390, 4850),
    ('2025-10-01', 11620000, 968333, 170000, 92.3, 107.0, 2360, 4800)
ON CONFLICT (as_of_date) DO UPDATE SET
    arr = EXCLUDED.arr,
    mrr = EXCLUDED.mrr,
    net_new_arr = EXCLUDED.net_new_arr,
    gross_revenue_retention = EXCLUDED.gross_revenue_retention,
    net_revenue_retention = EXCLUDED.net_revenue_retention,
    arpu = EXCLUDED.arpu,
    active_subscriptions = EXCLUDED.active_subscriptions;

-- Enable RLS on arr_metrics
ALTER TABLE finance.arr_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Finance role can see ARR metrics
CREATE POLICY arr_metrics_finance_access ON finance.arr_metrics
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy: Executive role can see ARR metrics
CREATE POLICY arr_metrics_executive_access ON finance.arr_metrics
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- =============================================================================
-- ARR MOVEMENT TABLE (Monthly Changes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.arr_movement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period VARCHAR(7) NOT NULL,  -- '2026-01'
    period_label VARCHAR(50) NOT NULL,
    starting_arr DECIMAL(15,2) NOT NULL,
    new_arr DECIMAL(15,2) DEFAULT 0,
    expansion_arr DECIMAL(15,2) DEFAULT 0,
    churn_arr DECIMAL(15,2) DEFAULT 0,
    contraction_arr DECIMAL(15,2) DEFAULT 0,
    net_new_arr DECIMAL(15,2) DEFAULT 0,
    ending_arr DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(period)
);

-- Insert ARR movement for last 12 months
INSERT INTO finance.arr_movement (period, period_label, starting_arr, new_arr, expansion_arr, churn_arr, contraction_arr, net_new_arr, ending_arr)
VALUES
    ('2026-02', 'February 2026', 12250000, 180000, 120000, -50000, -20000, 230000, 12480000),
    ('2026-01', 'January 2026', 12000000, 200000, 150000, -100000, -30000, 220000, 12220000),
    ('2025-12', 'December 2025', 11800000, 150000, 100000, -50000, -20000, 180000, 11980000),
    ('2025-11', 'November 2025', 11620000, 140000, 90000, -50000, -15000, 165000, 11785000),
    ('2025-10', 'October 2025', 11450000, 130000, 80000, -40000, -10000, 160000, 11610000),
    ('2025-09', 'September 2025', 11300000, 120000, 70000, -40000, -10000, 140000, 11440000),
    ('2025-08', 'August 2025', 11150000, 110000, 80000, -40000, -10000, 140000, 11290000),
    ('2025-07', 'July 2025', 11000000, 120000, 70000, -40000, -10000, 140000, 11140000),
    ('2025-06', 'June 2025', 10850000, 130000, 60000, -40000, -10000, 140000, 10990000),
    ('2025-05', 'May 2025', 10700000, 120000, 70000, -40000, -10000, 140000, 10840000),
    ('2025-04', 'April 2025', 10550000, 110000, 80000, -40000, -10000, 140000, 10690000),
    ('2025-03', 'March 2025', 10400000, 120000, 70000, -40000, -10000, 140000, 10540000)
ON CONFLICT (period) DO UPDATE SET
    period_label = EXCLUDED.period_label,
    starting_arr = EXCLUDED.starting_arr,
    new_arr = EXCLUDED.new_arr,
    expansion_arr = EXCLUDED.expansion_arr,
    churn_arr = EXCLUDED.churn_arr,
    contraction_arr = EXCLUDED.contraction_arr,
    net_new_arr = EXCLUDED.net_new_arr,
    ending_arr = EXCLUDED.ending_arr;

-- Enable RLS on arr_movement
ALTER TABLE finance.arr_movement ENABLE ROW LEVEL SECURITY;

-- Policy: Finance role can see ARR movement
CREATE POLICY arr_movement_finance_access ON finance.arr_movement
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy: Executive role can see ARR movement
CREATE POLICY arr_movement_executive_access ON finance.arr_movement
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- =============================================================================
-- FISCAL YEARS
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.fiscal_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER UNIQUE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO finance.fiscal_years (year, start_date, end_date, status) VALUES
    (2023, '2023-01-01', '2023-12-31', 'CLOSED'),
    (2024, '2024-01-01', '2024-12-31', 'CLOSED'),
    (2025, '2025-01-01', '2025-12-31', 'OPEN'),
    (2026, '2026-01-01', '2026-12-31', 'PLANNED')
ON CONFLICT (year) DO UPDATE SET status = EXCLUDED.status;

-- =============================================================================
-- BUDGET CATEGORIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.budget_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL, -- REVENUE, EXPENSE, CAPITAL
    description TEXT
);

INSERT INTO finance.budget_categories (name, code, type, description) VALUES
    ('Product Revenue', 'REV-PROD', 'REVENUE', 'Revenue from product sales'),
    ('Service Revenue', 'REV-SVC', 'REVENUE', 'Revenue from professional services'),
    ('Subscription Revenue', 'REV-SUB', 'REVENUE', 'Recurring subscription revenue'),
    ('Salaries & Benefits', 'EXP-SAL', 'EXPENSE', 'Employee compensation and benefits'),
    ('Marketing', 'EXP-MKT', 'EXPENSE', 'Marketing and advertising expenses'),
    ('Technology', 'EXP-TECH', 'EXPENSE', 'Software, hardware, and cloud services'),
    ('Facilities', 'EXP-FAC', 'EXPENSE', 'Office rent and utilities'),
    ('Travel', 'EXP-TRV', 'EXPENSE', 'Business travel expenses'),
    ('Professional Services', 'EXP-PRO', 'EXPENSE', 'Legal, accounting, consulting'),
    ('Equipment', 'CAP-EQP', 'CAPITAL', 'Capital equipment purchases'),
    ('Software Development', 'CAP-SW', 'CAPITAL', 'Capitalized software development')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- BUDGET STATUS ENUM (v1.5 - Issue #78)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_status') THEN
        CREATE TYPE finance.budget_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
    END IF;
END
$$;

-- =============================================================================
-- BUDGET APPROVAL ACTION ENUM (v1.5 - Issue #78)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_approval_action') THEN
        CREATE TYPE finance.budget_approval_action AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');
    END IF;
END
$$;

-- =============================================================================
-- DEPARTMENT BUDGETS
-- v1.5 Enhancement (Issue #78): Added approval workflow columns
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.department_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_id VARCHAR(50) UNIQUE,  -- Human-readable ID for testing
    department_code VARCHAR(10) NOT NULL,
    department VARCHAR(100) NOT NULL,  -- Full department name for RLS matching
    fiscal_year INTEGER NOT NULL,
    category_id UUID REFERENCES finance.budget_categories(id),
    budgeted_amount DECIMAL(15, 2) NOT NULL,
    amount DECIMAL(15, 2),  -- Alias for budgeted_amount for test compatibility
    actual_amount DECIMAL(15, 2) DEFAULT 0,
    forecast_amount DECIMAL(15, 2),
    notes TEXT,
    -- v1.5 Approval Workflow Columns (Issue #78)
    status finance.budget_status DEFAULT 'DRAFT',
    submitted_by UUID,  -- FK to hr.employees (cross-database reference, not enforced)
    submitted_at TIMESTAMP,
    approved_by UUID,   -- FK to hr.employees (cross-database reference, not enforced)
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(department_code, fiscal_year, category_id)
);

-- Add approval columns if table already exists (for incremental migration)
DO $$
BEGIN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'department_budgets' AND column_name = 'status') THEN
        ALTER TABLE finance.department_budgets ADD COLUMN status finance.budget_status DEFAULT 'DRAFT';
    END IF;

    -- Add submitted_by column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'department_budgets' AND column_name = 'submitted_by') THEN
        ALTER TABLE finance.department_budgets ADD COLUMN submitted_by UUID;
    END IF;

    -- Add submitted_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'department_budgets' AND column_name = 'submitted_at') THEN
        ALTER TABLE finance.department_budgets ADD COLUMN submitted_at TIMESTAMP;
    END IF;

    -- Add approved_by column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'department_budgets' AND column_name = 'approved_by') THEN
        ALTER TABLE finance.department_budgets ADD COLUMN approved_by UUID;
    END IF;

    -- Add approved_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'department_budgets' AND column_name = 'approved_at') THEN
        ALTER TABLE finance.department_budgets ADD COLUMN approved_at TIMESTAMP;
    END IF;

    -- Add rejection_reason column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'department_budgets' AND column_name = 'rejection_reason') THEN
        ALTER TABLE finance.department_budgets ADD COLUMN rejection_reason TEXT;
    END IF;

    -- Add version column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'department_budgets' AND column_name = 'version') THEN
        ALTER TABLE finance.department_budgets ADD COLUMN version INTEGER DEFAULT 1;
    END IF;
END
$$;

-- 2024 Budgets (simplified - key departments)
INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount)
SELECT 'BUD-EXEC-2024-SAL', 'EXEC', 'Executive', 2024, id, 500000, 500000, 425000, 510000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount)
SELECT 'BUD-HR-2024-SAL', 'HR', 'Human Resources', 2024, id, 750000, 750000, 680000, 740000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount)
SELECT 'BUD-FIN-2024-SAL', 'FIN', 'Finance', 2024, id, 450000, 450000, 410000, 455000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount)
SELECT 'BUD-SALES-2024-SAL', 'SALES', 'Sales', 2024, id, 1200000, 1200000, 1050000, 1180000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount)
SELECT 'BUD-ENG-2024-SAL', 'ENG', 'Engineering', 2024, id, 2500000, 2500000, 2200000, 2480000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount)
SELECT 'BUD-MKT-2024-MKT', 'MKT', 'Marketing', 2024, id, 800000, 800000, 720000, 850000 FROM finance.budget_categories WHERE code = 'EXP-MKT'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount)
SELECT 'BUD-IT-2024-TECH', 'IT', 'IT', 2024, id, 600000, 600000, 520000, 580000 FROM finance.budget_categories WHERE code = 'EXP-TECH'
ON CONFLICT DO NOTHING;

-- Update existing budgets to have status='DRAFT' and version=1 (v1.5 migration)
UPDATE finance.department_budgets
SET status = 'DRAFT', version = 1
WHERE status IS NULL OR version IS NULL;

-- =============================================================================
-- 2025 BUDGETS (Current Fiscal Year)
-- =============================================================================
INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status)
SELECT 'BUD-EXEC-2025-SAL', 'EXEC', 'Executive', 2025, id, 525000, 525000, 475000, 520000, 'APPROVED' FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status)
SELECT 'BUD-HR-2025-SAL', 'HR', 'Human Resources', 2025, id, 800000, 800000, 720000, 790000, 'APPROVED' FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status)
SELECT 'BUD-FIN-2025-SAL', 'FIN', 'Finance', 2025, id, 480000, 480000, 435000, 475000, 'APPROVED' FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status)
SELECT 'BUD-SALES-2025-SAL', 'SALES', 'Sales', 2025, id, 1350000, 1350000, 1200000, 1340000, 'APPROVED' FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status)
SELECT 'BUD-ENG-2025-SAL', 'ENG', 'Engineering', 2025, id, 2800000, 2800000, 2550000, 2780000, 'APPROVED' FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status)
SELECT 'BUD-MKT-2025-MKT', 'MKT', 'Marketing', 2025, id, 900000, 900000, 820000, 890000, 'APPROVED' FROM finance.budget_categories WHERE code = 'EXP-MKT'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status)
SELECT 'BUD-IT-2025-TECH', 'IT', 'IT', 2025, id, 680000, 680000, 610000, 670000, 'APPROVED' FROM finance.budget_categories WHERE code = 'EXP-TECH'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- TEST FIXTURE BUDGETS (for integration tests)
-- These budgets are in PENDING_APPROVAL status for testing approval workflow
-- =============================================================================

-- Budget in PENDING_APPROVAL status for approval tests (submitted by nina.patel - manager)
INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status, submitted_by, submitted_at)
SELECT 'BUD-TEST-PENDING-1', 'ENG', 'Engineering', 2026, id, 3000000, 3000000, 0, 3000000, 'PENDING_APPROVAL',
    'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'::uuid, NOW() - interval '1 day'
FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT (budget_id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    department = EXCLUDED.department,
    fiscal_year = EXCLUDED.fiscal_year,
    category_id = EXCLUDED.category_id,
    budgeted_amount = EXCLUDED.budgeted_amount,
    amount = EXCLUDED.amount,
    actual_amount = EXCLUDED.actual_amount,
    forecast_amount = EXCLUDED.forecast_amount,
    status = EXCLUDED.status,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    approved_by = NULL,
    approved_at = NULL,
    rejection_reason = NULL;

-- Budget submitted by bob.martinez (finance-write user) for separation of duties test
-- bob.martinez cannot approve this budget because he submitted it
INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status, submitted_by, submitted_at)
SELECT 'BUD-TEST-SOD', 'FIN', 'Finance', 2026, id, 500000, 500000, 0, 500000, 'PENDING_APPROVAL',
    '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1'::uuid, NOW() - interval '2 days'
FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT (budget_id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    department = EXCLUDED.department,
    fiscal_year = EXCLUDED.fiscal_year,
    category_id = EXCLUDED.category_id,
    budgeted_amount = EXCLUDED.budgeted_amount,
    amount = EXCLUDED.amount,
    actual_amount = EXCLUDED.actual_amount,
    forecast_amount = EXCLUDED.forecast_amount,
    status = EXCLUDED.status,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    approved_by = NULL,
    approved_at = NULL,
    rejection_reason = NULL;

-- Additional test budgets for various test scenarios
INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status, submitted_by, submitted_at)
SELECT 'BUD-TEST-PENDING-2', 'HR', 'Human Resources', 2026, id, 850000, 850000, 0, 850000, 'PENDING_APPROVAL',
    'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'::uuid, NOW() - interval '3 days'
FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT (budget_id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    department = EXCLUDED.department,
    fiscal_year = EXCLUDED.fiscal_year,
    category_id = EXCLUDED.category_id,
    budgeted_amount = EXCLUDED.budgeted_amount,
    amount = EXCLUDED.amount,
    actual_amount = EXCLUDED.actual_amount,
    forecast_amount = EXCLUDED.forecast_amount,
    status = EXCLUDED.status,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    approved_by = NULL,
    approved_at = NULL,
    rejection_reason = NULL;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status, submitted_by, submitted_at)
SELECT 'BUD-TEST-PENDING-3', 'SALES', 'Sales', 2026, id, 1400000, 1400000, 0, 1400000, 'PENDING_APPROVAL',
    'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'::uuid, NOW() - interval '4 days'
FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT (budget_id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    department = EXCLUDED.department,
    fiscal_year = EXCLUDED.fiscal_year,
    category_id = EXCLUDED.category_id,
    budgeted_amount = EXCLUDED.budgeted_amount,
    amount = EXCLUDED.amount,
    actual_amount = EXCLUDED.actual_amount,
    forecast_amount = EXCLUDED.forecast_amount,
    status = EXCLUDED.status,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    approved_by = NULL,
    approved_at = NULL,
    rejection_reason = NULL;

-- Additional test fixture budgets (each test needs its own to avoid state conflicts)
-- BUD-TEST-REJECT-1 uses EXP-TRV to avoid conflict with BUD-TEST-PENDING-2 (HR, 2026, EXP-SAL)
INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status, submitted_by, submitted_at)
SELECT 'BUD-TEST-REJECT-1', 'HR', 'Human Resources', 2026, id, 750000, 750000, 0, 750000, 'PENDING_APPROVAL',
    'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'::uuid, NOW() - interval '5 days'
FROM finance.budget_categories WHERE code = 'EXP-TRV'
ON CONFLICT (budget_id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    department = EXCLUDED.department,
    fiscal_year = EXCLUDED.fiscal_year,
    category_id = EXCLUDED.category_id,
    budgeted_amount = EXCLUDED.budgeted_amount,
    amount = EXCLUDED.amount,
    actual_amount = EXCLUDED.actual_amount,
    forecast_amount = EXCLUDED.forecast_amount,
    status = EXCLUDED.status,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    approved_by = NULL,
    approved_at = NULL,
    rejection_reason = NULL;

-- BUD-TEST-AUDIT-1 uses EXP-PRO (not EXP-SAL) to avoid unique constraint conflict with BUD-TEST-SOD
-- Both would otherwise use (FIN, 2026, EXP-SAL) violating (department_code, fiscal_year, category_id) uniqueness
INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status, submitted_by, submitted_at)
SELECT 'BUD-TEST-AUDIT-1', 'FIN', 'Finance', 2026, id, 450000, 450000, 0, 450000, 'PENDING_APPROVAL',
    'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'::uuid, NOW() - interval '6 days'
FROM finance.budget_categories WHERE code = 'EXP-PRO'
ON CONFLICT (budget_id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    department = EXCLUDED.department,
    fiscal_year = EXCLUDED.fiscal_year,
    category_id = EXCLUDED.category_id,
    budgeted_amount = EXCLUDED.budgeted_amount,
    amount = EXCLUDED.amount,
    actual_amount = EXCLUDED.actual_amount,
    forecast_amount = EXCLUDED.forecast_amount,
    status = EXCLUDED.status,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    approved_by = NULL,
    approved_at = NULL,
    rejection_reason = NULL;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status, submitted_by, submitted_at)
SELECT 'BUD-TEST-AUDIT-2', 'MKT', 'Marketing', 2026, id, 800000, 800000, 0, 800000, 'PENDING_APPROVAL',
    'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'::uuid, NOW() - interval '7 days'
FROM finance.budget_categories WHERE code = 'EXP-MKT'
ON CONFLICT (budget_id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    department = EXCLUDED.department,
    fiscal_year = EXCLUDED.fiscal_year,
    category_id = EXCLUDED.category_id,
    budgeted_amount = EXCLUDED.budgeted_amount,
    amount = EXCLUDED.amount,
    actual_amount = EXCLUDED.actual_amount,
    forecast_amount = EXCLUDED.forecast_amount,
    status = EXCLUDED.status,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    approved_by = NULL,
    approved_at = NULL,
    rejection_reason = NULL;

INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status, submitted_by, submitted_at)
SELECT 'BUD-TEST-AUDIT-3', 'IT', 'IT', 2026, id, 600000, 600000, 0, 600000, 'PENDING_APPROVAL',
    'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'::uuid, NOW() - interval '8 days'
FROM finance.budget_categories WHERE code = 'EXP-TECH'
ON CONFLICT (budget_id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    department = EXCLUDED.department,
    fiscal_year = EXCLUDED.fiscal_year,
    category_id = EXCLUDED.category_id,
    budgeted_amount = EXCLUDED.budgeted_amount,
    amount = EXCLUDED.amount,
    actual_amount = EXCLUDED.actual_amount,
    forecast_amount = EXCLUDED.forecast_amount,
    status = EXCLUDED.status,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    approved_by = NULL,
    approved_at = NULL,
    rejection_reason = NULL;

-- BUD-TEST-RULES-1 uses EXP-FAC to avoid conflict with BUD-TEST-PENDING-3 (SALES, 2026, EXP-SAL)
INSERT INTO finance.department_budgets (budget_id, department_code, department, fiscal_year, category_id, budgeted_amount, amount, actual_amount, forecast_amount, status, submitted_by, submitted_at)
SELECT 'BUD-TEST-RULES-1', 'SALES', 'Sales', 2026, id, 1200000, 1200000, 0, 1200000, 'PENDING_APPROVAL',
    'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'::uuid, NOW() - interval '9 days'
FROM finance.budget_categories WHERE code = 'EXP-FAC'
ON CONFLICT (budget_id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    department = EXCLUDED.department,
    fiscal_year = EXCLUDED.fiscal_year,
    category_id = EXCLUDED.category_id,
    budgeted_amount = EXCLUDED.budgeted_amount,
    amount = EXCLUDED.amount,
    actual_amount = EXCLUDED.actual_amount,
    forecast_amount = EXCLUDED.forecast_amount,
    status = EXCLUDED.status,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    approved_by = NULL,
    approved_at = NULL,
    rejection_reason = NULL;

-- =============================================================================
-- BUDGET APPROVAL HISTORY (v1.5 - Issue #78)
-- Audit trail for all budget approval workflow actions
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.budget_approval_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_id UUID NOT NULL REFERENCES finance.department_budgets(id) ON DELETE CASCADE,
    action finance.budget_approval_action NOT NULL,
    actor_id UUID NOT NULL,  -- FK to hr.employees (cross-database reference, not enforced)
    action_at TIMESTAMP DEFAULT NOW(),
    comments TEXT
);

-- Index for efficient history lookups
CREATE INDEX IF NOT EXISTS idx_budget_approval_history_budget_id ON finance.budget_approval_history(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_approval_history_action_at ON finance.budget_approval_history(action_at);
CREATE INDEX IF NOT EXISTS idx_budget_approval_history_actor ON finance.budget_approval_history(actor_id);

-- =============================================================================
-- FINANCIAL REPORTS (Metadata - actual documents in MinIO)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.financial_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(50) NOT NULL, -- PL, BALANCE_SHEET, CASH_FLOW, QUARTERLY
    fiscal_year INTEGER NOT NULL,
    period VARCHAR(20), -- Q1, Q2, Q3, Q4, ANNUAL
    title VARCHAR(200) NOT NULL,
    description TEXT,
    document_path VARCHAR(500), -- Path in MinIO
    status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, REVIEW, FINAL
    visibility VARCHAR(20) DEFAULT 'INTERNAL', -- PUBLIC, INTERNAL, CONFIDENTIAL
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    is_confidential BOOLEAN DEFAULT false
);

INSERT INTO finance.financial_reports (report_type, fiscal_year, period, title, description, document_path, status, visibility, is_confidential, created_by, published_at) VALUES
    ('PL', 2024, 'Q1', '2024 Q1 Profit & Loss Statement', 'First quarter P&L for FY2024', '/finance-docs/2024/pl/q1-pl-statement.pdf', 'FINAL', 'PUBLIC', false, 'bob.martinez', '2024-04-15'),
    ('PL', 2024, 'Q2', '2024 Q2 Profit & Loss Statement', 'Second quarter P&L for FY2024', '/finance-docs/2024/pl/q2-pl-statement.pdf', 'FINAL', 'PUBLIC', false, 'bob.martinez', '2024-07-15'),
    ('PL', 2024, 'Q3', '2024 Q3 Profit & Loss Statement', 'Third quarter P&L for FY2024', '/finance-docs/2024/pl/q3-pl-statement.pdf', 'REVIEW', 'INTERNAL', false, 'bob.martinez', NULL),
    ('BALANCE_SHEET', 2024, 'Q2', '2024 Q2 Balance Sheet', 'Balance sheet as of June 30, 2024', '/finance-docs/2024/balance/q2-balance-sheet.pdf', 'FINAL', 'PUBLIC', false, 'bob.martinez', '2024-07-20'),
    ('QUARTERLY', 2024, 'Q2', '2024 Q2 Executive Summary', 'Executive financial summary for Q2', '/finance-docs/2024/executive/q2-executive-summary.pdf', 'FINAL', 'CONFIDENTIAL', true, 'bob.martinez', '2024-07-25'),
    ('CASH_FLOW', 2024, 'H1', '2024 H1 Cash Flow Analysis', 'First half cash flow statement', '/finance-docs/2024/cashflow/h1-cash-flow.pdf', 'FINAL', 'PUBLIC', false, 'lisa.anderson', '2024-07-30')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- INVOICES (CONFIDENTIAL - finance-write only)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id VARCHAR(50) UNIQUE,  -- Test-friendly ID (primary identifier for tests)
    invoice_number VARCHAR(50) UNIQUE,  -- Legacy invoice number
    vendor_name VARCHAR(200) NOT NULL,
    vendor_id VARCHAR(50),
    description TEXT,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    invoice_date DATE DEFAULT CURRENT_DATE,
    due_date DATE DEFAULT CURRENT_DATE + INTERVAL '30 days',
    paid_date DATE,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, PAID, OVERDUE, DRAFT
    department_code VARCHAR(10),
    category_id UUID REFERENCES finance.budget_categories(id),
    document_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP
);

INSERT INTO finance.invoices (invoice_id, invoice_number, vendor_name, vendor_id, description, amount, invoice_date, due_date, paid_date, status, department_code) VALUES
    ('INV-001', 'INV-001', 'Test Vendor Inc', 'TV-001', 'Test invoice for integration testing', 5000.00, '2025-11-01', '2025-12-01', NULL, 'PENDING', 'ENG'),
    ('INV-2025-001', 'INV-2025-001', 'Amazon Web Services', 'AWS-001', 'Cloud infrastructure - October 2025', 45000.00, '2025-10-01', '2025-10-31', '2025-10-28', 'PAID', 'IT'),
    ('INV-2025-002', 'INV-2025-002', 'Salesforce', 'SF-001', 'CRM licenses - Q4 2025', 28500.00, '2025-10-01', '2025-10-15', '2025-10-12', 'PAID', 'SALES'),
    ('INV-2025-003', 'INV-2025-003', 'WeWork', 'WW-001', 'Office space - November 2025', 35000.00, '2025-11-01', '2025-11-15', NULL, 'APPROVED', 'OPS'),
    ('INV-2025-004', 'INV-2025-004', 'Google Cloud', 'GCP-001', 'Cloud services - October 2025', 22000.00, '2025-10-05', '2025-11-05', NULL, 'PENDING', 'ENG'),
    ('INV-2025-005', 'INV-2025-005', 'HubSpot', 'HS-001', 'Marketing automation - Q4', 15000.00, '2025-10-10', '2025-11-10', NULL, 'APPROVED', 'MKT'),
    ('INV-2025-006', 'INV-2025-006', 'Workday', 'WD-001', 'HR platform - Annual', 85000.00, '2025-09-01', '2025-09-30', '2025-09-25', 'PAID', 'HR'),
    ('INV-2025-007', 'INV-2025-007', 'Legal Associates LLP', 'LA-001', 'Contract review services', 12500.00, '2025-10-15', '2025-11-15', NULL, 'PENDING', 'LEGAL'),
    -- =============================================================================
    -- EDGE CASE: Overdue invoices (Phase 5 - Enterprise UX Hardening)
    -- Used to test danger styling, overdue filters, and escalation workflows
    -- =============================================================================
    -- 90 days overdue (critical)
    ('INV-2025-008', 'INV-2025-008', 'DataCenter Services Inc', 'DCS-001', 'Server colocation - September 2025', 8500.00, '2025-09-01', '2025-10-01', NULL, 'PENDING', 'IT'),
    -- 60 days overdue (high priority)
    ('INV-2025-009', 'INV-2025-009', 'CloudFlare Enterprise', 'CF-001', 'CDN services - October 2025', 3200.00, '2025-10-01', '2025-11-01', NULL, 'PENDING', 'ENG'),
    -- 45 days overdue (approved but not paid)
    ('INV-2025-010', 'INV-2025-010', 'Creative Agency Partners', 'CAP-001', 'Brand redesign phase 1', 25000.00, '2025-10-15', '2025-11-15', NULL, 'APPROVED', 'MKT'),
    -- 30 days overdue (pending approval)
    ('INV-2025-011', 'INV-2025-011', 'Office Supplies Co', 'OSC-001', 'Q4 office supplies order', 4750.00, '2025-11-01', '2025-12-01', NULL, 'PENDING', 'OPS'),
    -- Multi-line item invoice (10 line items) - used to test detail modal scroll
    ('INV-2025-012', 'INV-2025-012', 'Tech Equipment Wholesale', 'TEW-001', 'IT equipment refresh - 10 monitors, 10 keyboards, 10 mice, 10 headsets, 10 webcams, 10 docking stations, 10 USB hubs, 10 mouse pads, 10 monitor stands, 10 cable organizers', 18750.00, '2025-11-15', '2025-12-15', NULL, 'PENDING', 'IT')
ON CONFLICT (invoice_id) DO UPDATE SET
    status = EXCLUDED.status,
    paid_date = EXCLUDED.paid_date,
    approved_by = EXCLUDED.approved_by,
    approved_at = EXCLUDED.approved_at;

-- =============================================================================
-- REVENUE SUMMARY (Quarterly)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.revenue_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fiscal_year INTEGER NOT NULL,
    quarter VARCHAR(2) NOT NULL,
    category_id UUID REFERENCES finance.budget_categories(id),
    amount DECIMAL(15, 2) NOT NULL,
    growth_percentage DECIMAL(5, 2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2025, 'Q1', id, 2500000, 12.5, 'Strong product sales' FROM finance.budget_categories WHERE code = 'REV-PROD'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2025, 'Q1', id, 1800000, 18.2, 'New enterprise contracts' FROM finance.budget_categories WHERE code = 'REV-SUB'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2025, 'Q2', id, 2750000, 10.0, 'Continued growth' FROM finance.budget_categories WHERE code = 'REV-PROD'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2025, 'Q2', id, 2100000, 16.7, 'Low churn rate' FROM finance.budget_categories WHERE code = 'REV-SUB'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2025, 'Q3', id, 2900000, 5.5, 'Seasonal slowdown' FROM finance.budget_categories WHERE code = 'REV-PROD'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2025, 'Q3', id, 2400000, 14.3, 'Strong retention' FROM finance.budget_categories WHERE code = 'REV-SUB'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- DEPARTMENT REFERENCE TABLE (Issue #77 - v1.5)
-- Mirrors hr.departments for cross-database RLS policies
-- Kept in sync by application layer or scheduled job
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.departments (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL
);

-- Insert department reference data (mirrors hr.departments)
INSERT INTO finance.departments (id, name, code) VALUES
    ('d1000000-0000-0000-0000-000000000001', 'Executive', 'EXEC'),
    ('d1000000-0000-0000-0000-000000000002', 'Human Resources', 'HR'),
    ('d1000000-0000-0000-0000-000000000003', 'Finance', 'FIN'),
    ('d1000000-0000-0000-0000-000000000004', 'Sales', 'SALES'),
    ('d1000000-0000-0000-0000-000000000005', 'Customer Support', 'SUPPORT'),
    ('d1000000-0000-0000-0000-000000000006', 'Engineering', 'ENG'),
    ('d1000000-0000-0000-0000-000000000007', 'Marketing', 'MKT'),
    ('d1000000-0000-0000-0000-000000000008', 'Operations', 'OPS'),
    ('d1000000-0000-0000-0000-000000000009', 'Legal', 'LEGAL'),
    ('d1000000-0000-0000-0000-000000000010', 'IT', 'IT')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;

-- Enable RLS on departments (public read)
ALTER TABLE finance.departments ENABLE ROW LEVEL SECURITY;

-- Policy: Any authenticated user can read departments
CREATE POLICY departments_public_read ON finance.departments
    FOR SELECT
    USING (true);

-- =============================================================================
-- EXPENSE TRACKING (Issue #77 - v1.5)
-- =============================================================================

-- Create expense category enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_category' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'finance')) THEN
        CREATE TYPE finance.expense_category AS ENUM ('TRAVEL', 'MEALS', 'SUPPLIES', 'SOFTWARE', 'OTHER');
    END IF;
END
$$;

-- Create expense status enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'finance')) THEN
        CREATE TYPE finance.expense_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED');
    END IF;
END
$$;

-- Create the expenses table
CREATE TABLE IF NOT EXISTS finance.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL,
    department_id UUID NOT NULL,
    expense_date DATE NOT NULL,
    category finance.expense_category NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    status finance.expense_status DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    approved_by UUID,
    approved_at TIMESTAMP,
    receipt_path VARCHAR(500)
);

-- Add columns if they don't exist (for incremental migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'expenses' AND column_name = 'approved_by') THEN
        ALTER TABLE finance.expenses ADD COLUMN approved_by UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'expenses' AND column_name = 'approved_at') THEN
        ALTER TABLE finance.expenses ADD COLUMN approved_at TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'finance' AND table_name = 'expenses' AND column_name = 'receipt_path') THEN
        ALTER TABLE finance.expenses ADD COLUMN receipt_path VARCHAR(500);
    END IF;
END
$$;

-- Create indexes for expenses table
CREATE INDEX IF NOT EXISTS idx_expenses_employee ON finance.expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_department ON finance.expenses(department_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON finance.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON finance.expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON finance.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON finance.expenses(created_at);

-- =============================================================================
-- EXPENSE SAMPLE DATA
-- Using employee_id and department_id values from hr-data.sql
-- =============================================================================

-- Employee IDs from hr-data.sql:
-- Eve Thompson (CEO, Executive): e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b
-- Alice Chen (VP HR): f104eddc-21ab-457c-a254-78051ad7ad67
-- Bob Martinez (Finance Director): 1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1
-- Carol Johnson (VP Sales): c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c
-- Dan Williams (Support Director): d7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f
-- Nina Patel (Engineering Manager): a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d
-- Marcus Johnson (Software Engineer): e1000000-0000-0000-0000-000000000052
-- Frank Davis (IT Intern): b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e
-- Ryan Garcia (Sales Manager): e1000000-0000-0000-0000-000000000031
-- Lisa Anderson (Senior Accountant): e1000000-0000-0000-0000-000000000021

-- Department IDs from hr-data.sql:
-- Executive: d1000000-0000-0000-0000-000000000001
-- HR: d1000000-0000-0000-0000-000000000002
-- Finance: d1000000-0000-0000-0000-000000000003
-- Sales: d1000000-0000-0000-0000-000000000004
-- Support: d1000000-0000-0000-0000-000000000005
-- Engineering: d1000000-0000-0000-0000-000000000006
-- Marketing: d1000000-0000-0000-0000-000000000007
-- Operations: d1000000-0000-0000-0000-000000000008
-- IT: d1000000-0000-0000-0000-000000000010

INSERT INTO finance.expenses (id, employee_id, department_id, expense_date, category, description, amount, status, approved_by, approved_at, receipt_path) VALUES
    -- TRAVEL expenses (diverse statuses) - Updated to late 2025
    ('e0000001-0000-0000-0000-000000000001', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'd1000000-0000-0000-0000-000000000004', '2025-10-15', 'TRAVEL', 'Client visit flight to New York - Acme Corp deal', 850.00, 'REIMBURSED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-10-20 10:30:00', '/receipts/2025/10/flight-nyc-001.pdf'),
    ('e0000001-0000-0000-0000-000000000002', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'd1000000-0000-0000-0000-000000000004', '2025-10-16', 'TRAVEL', 'NYC hotel - 2 nights for client meetings', 420.00, 'REIMBURSED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-10-20 10:35:00', '/receipts/2025/10/hotel-nyc-001.pdf'),
    ('e0000001-0000-0000-0000-000000000003', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'd1000000-0000-0000-0000-000000000001', '2025-11-01', 'TRAVEL', 'Board meeting travel - San Francisco', 1250.00, 'APPROVED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-11-05 09:00:00', '/receipts/2025/11/travel-sf-ceo.pdf'),
    ('e0000001-0000-0000-0000-000000000004', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'd1000000-0000-0000-0000-000000000006', '2025-12-10', 'TRAVEL', 'Tech conference travel - AWS re:Invent', 2100.00, 'PENDING', NULL, NULL, '/receipts/2025/12/reinvent-travel.pdf'),

    -- MEALS expenses - Updated to late 2025
    ('e0000001-0000-0000-0000-000000000005', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'd1000000-0000-0000-0000-000000000004', '2025-10-15', 'MEALS', 'Client dinner - Acme Corp negotiations', 285.50, 'REIMBURSED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-10-20 10:40:00', '/receipts/2025/10/dinner-acme.pdf'),
    ('e0000001-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000031', 'd1000000-0000-0000-0000-000000000004', '2025-10-22', 'MEALS', 'Team lunch - Q4 kickoff meeting', 156.75, 'APPROVED', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', '2025-10-25 14:00:00', '/receipts/2025/10/team-lunch-q4.pdf'),
    ('e0000001-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000052', 'd1000000-0000-0000-0000-000000000006', '2025-12-05', 'MEALS', 'Working lunch during sprint planning', 32.50, 'PENDING', NULL, NULL, NULL),
    ('e0000001-0000-0000-0000-000000000008', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'd1000000-0000-0000-0000-000000000002', '2025-09-15', 'MEALS', 'Candidate interview lunch - Senior HR Manager role', 89.00, 'REIMBURSED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-09-20 11:00:00', '/receipts/2025/09/interview-lunch.pdf'),

    -- SUPPLIES expenses - Updated to late 2025
    ('e0000001-0000-0000-0000-000000000009', 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e', 'd1000000-0000-0000-0000-000000000010', '2025-10-01', 'SUPPLIES', 'Office supplies - notebooks and pens', 45.99, 'APPROVED', 'e1000000-0000-0000-0000-000000000060', '2025-10-03 09:00:00', '/receipts/2025/10/office-supplies.pdf'),
    ('e0000001-0000-0000-0000-000000000010', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'd1000000-0000-0000-0000-000000000005', '2025-10-10', 'SUPPLIES', 'Headset for remote support calls', 129.99, 'REIMBURSED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-10-15 10:00:00', '/receipts/2025/10/headset.pdf'),
    ('e0000001-0000-0000-0000-000000000011', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'd1000000-0000-0000-0000-000000000006', '2025-11-01', 'SUPPLIES', 'Ergonomic keyboard for team member', 175.00, 'PENDING', NULL, NULL, '/receipts/2025/11/keyboard.pdf'),
    ('e0000001-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000003', '2025-08-20', 'SUPPLIES', 'Printer paper and toner - bulk order', 289.50, 'REIMBURSED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-08-25 09:30:00', '/receipts/2025/08/printer-supplies.pdf'),

    -- SOFTWARE expenses - Updated to late 2025
    ('e0000001-0000-0000-0000-000000000013', 'e1000000-0000-0000-0000-000000000052', 'd1000000-0000-0000-0000-000000000006', '2025-10-01', 'SOFTWARE', 'JetBrains annual license renewal', 249.00, 'APPROVED', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', '2025-10-05 08:00:00', '/receipts/2025/10/jetbrains.pdf'),
    ('e0000001-0000-0000-0000-000000000014', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'd1000000-0000-0000-0000-000000000006', '2025-09-15', 'SOFTWARE', 'GitHub Copilot team subscription - 6 months', 570.00, 'REIMBURSED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-09-20 14:00:00', '/receipts/2025/09/copilot.pdf'),
    ('e0000001-0000-0000-0000-000000000015', 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e', 'd1000000-0000-0000-0000-000000000010', '2025-12-08', 'SOFTWARE', 'Udemy course - Cloud Security Fundamentals', 79.99, 'PENDING', NULL, NULL, NULL),
    ('e0000001-0000-0000-0000-000000000016', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'd1000000-0000-0000-0000-000000000003', '2025-07-01', 'SOFTWARE', 'QuickBooks advanced features addon', 350.00, 'REIMBURSED', 'e1000000-0000-0000-0000-000000000002', '2025-07-05 10:00:00', '/receipts/2025/07/quickbooks.pdf'),

    -- OTHER expenses - Updated to late 2025
    ('e0000001-0000-0000-0000-000000000017', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'd1000000-0000-0000-0000-000000000001', '2025-10-20', 'OTHER', 'Industry association membership renewal', 500.00, 'APPROVED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-10-22 11:00:00', '/receipts/2025/10/association.pdf'),
    ('e0000001-0000-0000-0000-000000000018', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'd1000000-0000-0000-0000-000000000002', '2025-10-25', 'OTHER', 'HR certification exam fee - SHRM-SCP', 375.00, 'REJECTED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-10-28 15:00:00', NULL),
    ('e0000001-0000-0000-0000-000000000019', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'd1000000-0000-0000-0000-000000000004', '2025-12-12', 'OTHER', 'Trade show booth rental deposit', 1500.00, 'PENDING', NULL, NULL, '/receipts/2025/12/tradeshow.pdf'),
    ('e0000001-0000-0000-0000-000000000020', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'd1000000-0000-0000-0000-000000000005', '2025-09-01', 'OTHER', 'Customer appreciation gifts - top 10 accounts', 450.00, 'REIMBURSED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-09-10 09:00:00', '/receipts/2025/09/customer-gifts.pdf'),

    -- Additional expenses - Updated to late 2025
    ('e0000001-0000-0000-0000-000000000021', 'e1000000-0000-0000-0000-000000000052', 'd1000000-0000-0000-0000-000000000006', '2025-12-15', 'TRAVEL', 'Uber to client site for production issue', 45.00, 'PENDING', NULL, NULL, NULL),
    ('e0000001-0000-0000-0000-000000000022', 'e1000000-0000-0000-0000-000000000031', 'd1000000-0000-0000-0000-000000000004', '2025-08-15', 'TRAVEL', 'Mileage reimbursement - customer visits', 156.80, 'REIMBURSED', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', '2025-08-20 10:00:00', '/receipts/2025/08/mileage.pdf'),
    ('e0000001-0000-0000-0000-000000000023', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'd1000000-0000-0000-0000-000000000002', '2025-11-01', 'MEALS', 'New hire onboarding lunch', 125.00, 'APPROVED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-11-05 11:30:00', '/receipts/2025/11/onboarding-lunch.pdf'),
    ('e0000001-0000-0000-0000-000000000024', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'd1000000-0000-0000-0000-000000000003', '2025-10-30', 'SUPPLIES', 'External monitor for WFH setup', 299.99, 'APPROVED', 'e1000000-0000-0000-0000-000000000002', '2025-11-02 14:00:00', '/receipts/2025/10/monitor.pdf'),
    ('e0000001-0000-0000-0000-000000000025', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'd1000000-0000-0000-0000-000000000006', '2025-10-20', 'OTHER', 'Team building activity - escape room', 320.00, 'REIMBURSED', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2025-10-25 16:00:00', '/receipts/2025/10/team-building.pdf')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- VIEWS FOR ROLE-BASED ACCESS
-- =============================================================================

-- Budget summary view (finance-read)
CREATE OR REPLACE VIEW budget_summary AS
SELECT
    db.department_code,
    fy.year as fiscal_year,
    bc.name as category,
    bc.type as category_type,
    db.budgeted_amount,
    db.actual_amount,
    db.forecast_amount,
    ROUND((db.actual_amount / NULLIF(db.budgeted_amount, 0)) * 100, 1) as utilization_pct
FROM finance.department_budgets db
JOIN finance.fiscal_years fy ON db.fiscal_year = fy.year
JOIN finance.budget_categories bc ON db.category_id = bc.id
ORDER BY db.department_code, bc.type, bc.name;

-- Revenue trend view (finance-read)
CREATE OR REPLACE VIEW revenue_trend AS
SELECT
    rs.fiscal_year,
    rs.quarter,
    bc.name as revenue_type,
    rs.amount,
    rs.growth_percentage
FROM finance.revenue_summary rs
JOIN finance.budget_categories bc ON rs.category_id = bc.id
WHERE bc.type = 'REVENUE'
ORDER BY rs.fiscal_year, rs.quarter, bc.name;

-- Public reports view (anyone can see non-confidential)
CREATE OR REPLACE VIEW public_reports AS
SELECT
    id,
    report_type,
    fiscal_year,
    period,
    title,
    description,
    status,
    published_at
FROM finance.financial_reports
WHERE is_confidential = false AND status = 'FINAL';

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_budgets_dept_year ON finance.department_budgets(department_code, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON finance.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON finance.invoices(vendor_name);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON finance.invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_reports_type_year ON finance.financial_reports(report_type, fiscal_year);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger function to auto-increment budget version when approved budgets are modified
-- This supports optimistic locking for concurrent budget modifications
CREATE OR REPLACE FUNCTION finance.increment_budget_version()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'APPROVED' AND NEW.budgeted_amount != OLD.budgeted_amount THEN
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to department_budgets table
DROP TRIGGER IF EXISTS budget_version_trigger ON finance.department_budgets;
CREATE TRIGGER budget_version_trigger
    BEFORE UPDATE ON finance.department_budgets
    FOR EACH ROW
    EXECUTE FUNCTION finance.increment_budget_version();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- REFERENCE TABLES RLS (Public Read - any authenticated user)
-- -----------------------------------------------------------------------------

-- Enable RLS on fiscal_years (public read)
ALTER TABLE finance.fiscal_years ENABLE ROW LEVEL SECURITY;

-- Policy: Any authenticated user can read fiscal years
CREATE POLICY fiscal_year_public_read ON finance.fiscal_years
    FOR SELECT
    USING (true);  -- Any authenticated connection can read

-- Enable RLS on budget_categories (public read)
ALTER TABLE finance.budget_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Any authenticated user can read budget categories
CREATE POLICY budget_category_public_read ON finance.budget_categories
    FOR SELECT
    USING (true);  -- Any authenticated connection can read

-- -----------------------------------------------------------------------------
-- Helper function: Set session context from JWT (matches HR pattern)
-- Called by MCP Finance server at the start of each request
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finance.set_user_context(
    p_user_id VARCHAR,
    p_user_email VARCHAR,
    p_user_roles VARCHAR,
    p_user_department VARCHAR DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id, true);
    PERFORM set_config('app.current_user_email', p_user_email, true);
    PERFORM set_config('app.current_user_roles', p_user_roles, true);
    PERFORM set_config('app.current_user_department', COALESCE(p_user_department, ''), true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- DEPARTMENT BUDGETS RLS
-- -----------------------------------------------------------------------------
ALTER TABLE finance.department_budgets ENABLE ROW LEVEL SECURITY;

-- Policy 1: Finance role can see all budgets
CREATE POLICY budget_finance_access ON finance.department_budgets
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy 2: Executive role can see all budgets
CREATE POLICY budget_executive_access ON finance.department_budgets
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- Policy 3: Department heads can see their own department's budget
-- Uses full department name to match session variable (e.g., 'Engineering')
CREATE POLICY budget_department_access ON finance.department_budgets
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND department = current_setting('app.current_user_department', true)
    );

-- Policy 4: Finance-write can modify budgets
CREATE POLICY budget_finance_modify ON finance.department_budgets
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    )
    WITH CHECK (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy 5: Department heads can submit their department's budgets (v1.5 - Issue #78)
-- Allows UPDATE on status column for budget submission
CREATE POLICY budget_department_submit ON finance.department_budgets
    FOR UPDATE
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND department = current_setting('app.current_user_department', true)
    )
    WITH CHECK (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND department = current_setting('app.current_user_department', true)
    );

-- -----------------------------------------------------------------------------
-- BUDGET APPROVAL HISTORY RLS (v1.5 - Issue #78)
-- -----------------------------------------------------------------------------
ALTER TABLE finance.budget_approval_history ENABLE ROW LEVEL SECURITY;

-- Policy 1: Finance-read can view all budget approval history
CREATE POLICY budget_history_finance_read ON finance.budget_approval_history
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy 2: Executive role can view all budget approval history
CREATE POLICY budget_history_executive_access ON finance.budget_approval_history
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- Policy 3: Department heads can see their department's budget history
CREATE POLICY budget_history_department_access ON finance.budget_approval_history
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND EXISTS (
            SELECT 1 FROM finance.department_budgets db
            WHERE db.id = budget_approval_history.budget_id
            AND db.department = current_setting('app.current_user_department', true)
        )
    );

-- Policy 4: Finance-write can insert history records
CREATE POLICY budget_history_finance_insert ON finance.budget_approval_history
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy 5: Managers can insert history records (for submissions)
CREATE POLICY budget_history_manager_insert ON finance.budget_approval_history
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND EXISTS (
            SELECT 1 FROM finance.department_budgets db
            WHERE db.id = budget_approval_history.budget_id
            AND db.department = current_setting('app.current_user_department', true)
        )
    );

-- -----------------------------------------------------------------------------
-- INVOICES RLS (Confidential - stricter access)
-- -----------------------------------------------------------------------------
ALTER TABLE finance.invoices ENABLE ROW LEVEL SECURITY;

-- Policy 1: Finance role can see all invoices
CREATE POLICY invoice_finance_access ON finance.invoices
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy 2: Executive role can see all invoices
CREATE POLICY invoice_executive_access ON finance.invoices
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- Policy 3: Department managers can see invoices for their department only
CREATE POLICY invoice_department_access ON finance.invoices
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND department_code = current_setting('app.current_user_department', true)
    );

-- Policy 4: Finance-write can modify invoices
CREATE POLICY invoice_finance_modify ON finance.invoices
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    )
    WITH CHECK (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- -----------------------------------------------------------------------------
-- FINANCIAL REPORTS RLS
-- -----------------------------------------------------------------------------
ALTER TABLE finance.financial_reports ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can see PUBLIC visibility or non-confidential published reports
CREATE POLICY report_public_access ON finance.financial_reports
    FOR SELECT
    USING (
        (visibility = 'PUBLIC' AND status = 'FINAL')
        OR (is_confidential = false AND status = 'FINAL')
    );

-- Policy 2: Finance role can see all reports (including drafts)
CREATE POLICY report_finance_access ON finance.financial_reports
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy 3: Executive role can see all reports (including confidential)
CREATE POLICY report_executive_access ON finance.financial_reports
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- Policy 4: Report creators can see their own reports
CREATE POLICY report_creator_access ON finance.financial_reports
    FOR SELECT
    USING (
        created_by = current_setting('app.current_user_email', true)
    );

-- Policy 5: Finance-write can modify reports
CREATE POLICY report_finance_modify ON finance.financial_reports
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    )
    WITH CHECK (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- -----------------------------------------------------------------------------
-- REVENUE SUMMARY RLS
-- -----------------------------------------------------------------------------
ALTER TABLE finance.revenue_summary ENABLE ROW LEVEL SECURITY;

-- Policy 1: Finance role can see all revenue data
CREATE POLICY revenue_finance_access ON finance.revenue_summary
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy 2: Executive role can see all revenue data
CREATE POLICY revenue_executive_access ON finance.revenue_summary
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- Policy 3: Sales leadership can see revenue data (read-only)
CREATE POLICY revenue_sales_access ON finance.revenue_summary
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%sales-read%'
    );

-- -----------------------------------------------------------------------------
-- EXPENSES RLS (Issue #77 - v1.5)
-- -----------------------------------------------------------------------------
ALTER TABLE finance.expenses ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can see their own expenses (self-access)
CREATE POLICY expense_self_access ON finance.expenses
    FOR SELECT
    USING (
        employee_id::text = current_setting('app.current_user_id', true)
    );

-- Policy 2: Users can INSERT their own expenses only
CREATE POLICY expense_self_insert ON finance.expenses
    FOR INSERT
    WITH CHECK (
        employee_id::text = current_setting('app.current_user_id', true)
    );

-- Policy 3: Finance role (read) can see all expenses
CREATE POLICY expense_finance_read_access ON finance.expenses
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-read%'
    );

-- Policy 4: Finance role (write) can see and modify all expenses
CREATE POLICY expense_finance_write_access ON finance.expenses
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    )
    WITH CHECK (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy 5: Executive role can see all expenses
CREATE POLICY expense_executive_access ON finance.expenses
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- Policy 6: Manager role can see expenses from their department
-- Note: Uses finance.departments (local copy of hr.departments) for cross-database RLS
CREATE POLICY expense_manager_access ON finance.expenses
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND department_id IN (
            SELECT d.id
            FROM finance.departments d
            WHERE d.name = current_setting('app.current_user_department', true)
               OR d.code = current_setting('app.current_user_department', true)
        )
    );

-- =============================================================================
-- AUDIT LOGGING (matches HR pattern)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.access_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP DEFAULT NOW(),
    user_id VARCHAR(100),
    user_email VARCHAR(200),
    user_roles TEXT,
    action VARCHAR(50),  -- SELECT, INSERT, UPDATE, DELETE
    table_name VARCHAR(100),
    record_id UUID,
    query_summary TEXT,
    ip_address VARCHAR(45),
    success BOOLEAN DEFAULT true,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON finance.access_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user ON finance.access_audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_action ON finance.access_audit_log(action);

-- =============================================================================
-- EXPENSE REPORTS TABLE (v1.5 - Issue #77)
-- Groups multiple expenses into reports for submission/approval workflow
-- =============================================================================

-- Create expense report status enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_report_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'finance')) THEN
        CREATE TYPE finance.expense_report_status AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REIMBURSED');
    END IF;
END
$$;

-- Create the expense_reports table
CREATE TABLE IF NOT EXISTS finance.expense_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_number VARCHAR(30) NOT NULL UNIQUE,
    employee_id UUID NOT NULL,
    department_code VARCHAR(10) NOT NULL,
    title VARCHAR(200) NOT NULL,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    status finance.expense_report_status DEFAULT 'DRAFT',
    submission_date DATE,
    submitted_at TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by UUID,
    rejected_at TIMESTAMP,
    rejected_by UUID,
    rejection_reason TEXT,
    reimbursed_at TIMESTAMP,
    reimbursed_by UUID,
    payment_reference VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create the expense_items table (line items within a report)
CREATE TABLE IF NOT EXISTS finance.expense_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_report_id UUID NOT NULL REFERENCES finance.expense_reports(id) ON DELETE CASCADE,
    expense_date DATE NOT NULL,
    category finance.expense_category NOT NULL,
    description VARCHAR(500) NOT NULL,
    vendor VARCHAR(200),
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency CHAR(3) DEFAULT 'USD',
    receipt_url VARCHAR(500),
    receipt_required BOOLEAN DEFAULT true,
    receipt_uploaded BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for expense_reports
CREATE INDEX IF NOT EXISTS idx_expense_reports_employee ON finance.expense_reports(employee_id);
CREATE INDEX IF NOT EXISTS idx_expense_reports_department ON finance.expense_reports(department_code);
CREATE INDEX IF NOT EXISTS idx_expense_reports_status ON finance.expense_reports(status);
CREATE INDEX IF NOT EXISTS idx_expense_reports_submission_date ON finance.expense_reports(submission_date);

-- Indexes for expense_items
CREATE INDEX IF NOT EXISTS idx_expense_items_report ON finance.expense_items(expense_report_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_category ON finance.expense_items(category);
CREATE INDEX IF NOT EXISTS idx_expense_items_date ON finance.expense_items(expense_date);

-- =============================================================================
-- EXPENSE REPORTS RLS (v1.5)
-- 3-tier access: Self, Manager, Finance
-- =============================================================================
ALTER TABLE finance.expense_reports ENABLE ROW LEVEL SECURITY;

-- Policy 1: Employees can see their own expense reports
CREATE POLICY expense_reports_self_access ON finance.expense_reports
    FOR SELECT
    USING (
        employee_id::text = current_setting('app.current_user_id', true)
    );

-- Policy 2: Finance-read can see all expense reports
CREATE POLICY expense_reports_finance_read ON finance.expense_reports
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- Policy 3: Executive role can see all expense reports
CREATE POLICY expense_reports_executive_access ON finance.expense_reports
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- Policy 4: Manager can see their department's expense reports
CREATE POLICY expense_reports_manager_access ON finance.expense_reports
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND department_code = current_setting('app.current_user_department', true)
    );

-- Policy 5: Employees can insert their own expense reports
CREATE POLICY expense_reports_self_insert ON finance.expense_reports
    FOR INSERT
    WITH CHECK (
        employee_id::text = current_setting('app.current_user_id', true)
    );

-- Policy 6: Employees can update their own DRAFT expense reports
CREATE POLICY expense_reports_self_update ON finance.expense_reports
    FOR UPDATE
    USING (
        employee_id::text = current_setting('app.current_user_id', true)
        AND status = 'DRAFT'
    );

-- Policy 7: Finance-write can update any expense report (for approval/rejection/reimbursement)
CREATE POLICY expense_reports_finance_update ON finance.expense_reports
    FOR UPDATE
    USING (
        current_setting('app.current_user_roles', true) LIKE '%finance-write%'
    );

-- =============================================================================
-- EXPENSE ITEMS RLS (v1.5)
-- Access controlled via parent expense_report
-- =============================================================================
ALTER TABLE finance.expense_items ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can see expense items for their accessible expense reports
CREATE POLICY expense_items_report_access ON finance.expense_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM finance.expense_reports er
            WHERE er.id = expense_items.expense_report_id
        )
    );

-- Policy 2: Users can insert expense items into their own DRAFT reports
CREATE POLICY expense_items_self_insert ON finance.expense_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM finance.expense_reports er
            WHERE er.id = expense_items.expense_report_id
            AND er.employee_id::text = current_setting('app.current_user_id', true)
            AND er.status = 'DRAFT'
        )
    );

-- =============================================================================
-- EXPENSE REPORTS SAMPLE DATA (v1.5)
-- Employee IDs from hr-data.sql
-- =============================================================================

-- Employee IDs:
-- Eve Thompson (CEO): e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b
-- Alice Chen (VP HR): f104eddc-21ab-457c-a254-78051ad7ad67
-- Bob Martinez (Finance): 1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1
-- Carol Johnson (Sales): c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c
-- Nina Patel (Engineering Mgr): a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d
-- Marcus Johnson (Engineer): e1000000-0000-0000-0000-000000000052
-- Frank Davis (IT Intern): b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e

-- Report 1: Nina Patel - Approved Conference Trip
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at, approved_at, approved_by)
VALUES
    ('e1000000-0000-0000-0000-000000000101', 'EXP-2026-001', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'ENG', 'Tech Conference Travel - San Francisco', 2450.00, 'APPROVED', '2026-01-15', '2026-01-15 09:00:00', '2026-01-17 14:30:00', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1')
ON CONFLICT (report_number) DO NOTHING;

-- Report 2: Marcus Johnson - Pending Team Lunch
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at)
VALUES
    ('e1000000-0000-0000-0000-000000000102', 'EXP-2026-002', 'e1000000-0000-0000-0000-000000000052', 'ENG', 'Team Celebration Lunch', 385.50, 'SUBMITTED', '2026-01-20', '2026-01-20 10:15:00')
ON CONFLICT (report_number) DO NOTHING;

-- Report 3: Carol Johnson - Reimbursed Client Dinner
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at, approved_at, approved_by, reimbursed_at, reimbursed_by, payment_reference)
VALUES
    ('e1000000-0000-0000-0000-000000000103', 'EXP-2026-003', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'SALES', 'Client Dinner - Acme Corp Deal', 875.00, 'REIMBURSED', '2026-01-10', '2026-01-10 16:00:00', '2026-01-12 09:00:00', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '2026-01-18 11:00:00', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'ACH-20260118-001')
ON CONFLICT (report_number) DO NOTHING;

-- Report 4: Frank Davis - Draft Office Supplies
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, notes)
VALUES
    ('e1000000-0000-0000-0000-000000000104', 'EXP-2026-004', 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e', 'IT', 'Office Supplies Q1 2026', 156.75, 'DRAFT', 'Need to add keyboard receipt')
ON CONFLICT (report_number) DO NOTHING;

-- Report 5: Alice Chen - Under Review HR Conference
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at)
VALUES
    ('e1000000-0000-0000-0000-000000000105', 'EXP-2026-005', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'HR', 'HR Leadership Summit 2026', 3200.00, 'UNDER_REVIEW', '2026-01-25', '2026-01-25 14:00:00')
ON CONFLICT (report_number) DO NOTHING;

-- Report 6: Nina Patel - Rejected Training (missing receipts)
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at, rejected_at, rejected_by, rejection_reason)
VALUES
    ('e1000000-0000-0000-0000-000000000106', 'EXP-2026-006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'ENG', 'Cloud Certification Training', 599.00, 'REJECTED', '2026-01-05', '2026-01-05 11:00:00', '2026-01-07 09:30:00', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'Missing receipts for online course purchases. Please upload all receipts and resubmit.')
ON CONFLICT (report_number) DO NOTHING;

-- Report 7: Bob Martinez - Approved Software Subscription
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at, approved_at, approved_by)
VALUES
    ('e1000000-0000-0000-0000-000000000107', 'EXP-2026-007', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'FIN', 'Accounting Software Annual Subscription', 1200.00, 'APPROVED', '2026-01-02', '2026-01-02 08:00:00', '2026-01-03 10:00:00', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b')
ON CONFLICT (report_number) DO NOTHING;

-- Report 8: Eve Thompson - Executive Travel (Pending)
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at)
VALUES
    ('e1000000-0000-0000-0000-000000000108', 'EXP-2026-008', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'EXEC', 'Board Meeting Travel - New York', 4850.00, 'SUBMITTED', '2026-02-01', '2026-02-01 16:30:00')
ON CONFLICT (report_number) DO NOTHING;

-- =============================================================================
-- DEDICATED TEST FIXTURES FOR INTEGRATION TESTS (v1.5)
-- These fixtures are used exclusively by workflow tests to avoid interference.
-- Each test gets its own dedicated record to prevent parallel test conflicts.
-- IDs use 2xx range to distinguish from sample data (1xx range).
-- =============================================================================

-- Approval Test Fixtures (SUBMITTED status, ready for approval)
-- TEST_APR_PERM: For permission check test
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at)
VALUES
    ('e1000000-0000-0000-0000-000000000201', 'EXP-TEST-APR-01', 'e1000000-0000-0000-0000-000000000052', 'ENG', 'Test Approval - Permission Check', 250.00, 'SUBMITTED', '2026-02-01', '2026-02-01 09:00:00')
ON CONFLICT (report_number) DO NOTHING;

-- TEST_APR_CONFIRM: For confirmation flow test
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at)
VALUES
    ('e1000000-0000-0000-0000-000000000202', 'EXP-TEST-APR-02', 'e1000000-0000-0000-0000-000000000052', 'ENG', 'Test Approval - Confirmation Flow', 350.00, 'SUBMITTED', '2026-02-01', '2026-02-01 10:00:00')
ON CONFLICT (report_number) DO NOTHING;

-- TEST_APR_EXEC: For execute approval test
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at)
VALUES
    ('e1000000-0000-0000-0000-000000000203', 'EXP-TEST-APR-03', 'e1000000-0000-0000-0000-000000000052', 'ENG', 'Test Approval - Execute Action', 450.00, 'SUBMITTED', '2026-02-01', '2026-02-01 11:00:00')
ON CONFLICT (report_number) DO NOTHING;

-- Rejection Test Fixtures (UNDER_REVIEW status, ready for rejection)
-- TEST_REJ_CONFIRM: For rejection confirmation flow test
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at)
VALUES
    ('e1000000-0000-0000-0000-000000000211', 'EXP-TEST-REJ-01', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'HR', 'Test Rejection - Confirmation Flow', 500.00, 'UNDER_REVIEW', '2026-02-01', '2026-02-01 12:00:00')
ON CONFLICT (report_number) DO NOTHING;

-- TEST_REJ_EXEC: For execute rejection test
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at)
VALUES
    ('e1000000-0000-0000-0000-000000000212', 'EXP-TEST-REJ-02', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'HR', 'Test Rejection - Execute Action', 600.00, 'UNDER_REVIEW', '2026-02-01', '2026-02-01 13:00:00')
ON CONFLICT (report_number) DO NOTHING;

-- Reimbursement Test Fixtures (APPROVED status, ready for reimbursement)
-- TEST_RMB_STATUS: For status check/permission test
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at, approved_at, approved_by)
VALUES
    ('e1000000-0000-0000-0000-000000000221', 'EXP-TEST-RMB-01', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'FIN', 'Test Reimbursement - Status Check', 700.00, 'APPROVED', '2026-02-01', '2026-02-01 14:00:00', '2026-02-02 10:00:00', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b')
ON CONFLICT (report_number) DO NOTHING;

-- TEST_RMB_EXEC: For execute reimbursement test
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at, approved_at, approved_by)
VALUES
    ('e1000000-0000-0000-0000-000000000222', 'EXP-TEST-RMB-02', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'FIN', 'Test Reimbursement - Execute Action', 800.00, 'APPROVED', '2026-02-01', '2026-02-01 15:00:00', '2026-02-02 11:00:00', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b')
ON CONFLICT (report_number) DO NOTHING;

-- Denied Confirmation Test Fixture (SUBMITTED status, for testing denied confirmation)
-- TEST_DENY: For denied confirmation test (approval request that gets denied)
INSERT INTO finance.expense_reports (id, report_number, employee_id, department_code, title, total_amount, status, submission_date, submitted_at)
VALUES
    ('e1000000-0000-0000-0000-000000000231', 'EXP-TEST-DENY-01', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'EXEC', 'Test Denied Confirmation Flow', 900.00, 'SUBMITTED', '2026-02-01', '2026-02-01 16:00:00')
ON CONFLICT (report_number) DO NOTHING;

-- Add expense items for test fixtures (1 item each for simplicity)
INSERT INTO finance.expense_items (expense_report_id, expense_date, category, description, vendor, amount, receipt_uploaded)
VALUES
    ('e1000000-0000-0000-0000-000000000201', '2026-02-01', 'MEALS', 'Test approval item', 'Test Vendor', 250.00, true),
    ('e1000000-0000-0000-0000-000000000202', '2026-02-01', 'MEALS', 'Test approval item', 'Test Vendor', 350.00, true),
    ('e1000000-0000-0000-0000-000000000203', '2026-02-01', 'MEALS', 'Test approval item', 'Test Vendor', 450.00, true),
    ('e1000000-0000-0000-0000-000000000211', '2026-02-01', 'TRAVEL', 'Test rejection item', 'Test Vendor', 500.00, true),
    ('e1000000-0000-0000-0000-000000000212', '2026-02-01', 'TRAVEL', 'Test rejection item', 'Test Vendor', 600.00, true),
    ('e1000000-0000-0000-0000-000000000221', '2026-02-01', 'SOFTWARE', 'Test reimbursement item', 'Test Vendor', 700.00, true),
    ('e1000000-0000-0000-0000-000000000222', '2026-02-01', 'SOFTWARE', 'Test reimbursement item', 'Test Vendor', 800.00, true),
    ('e1000000-0000-0000-0000-000000000231', '2026-02-01', 'OTHER', 'Test deny item', 'Test Vendor', 900.00, true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- EXPENSE ITEMS SAMPLE DATA (v1.5)
-- Line items for each expense report
-- =============================================================================

-- Items for Report 1: Nina Patel Conference Trip ($2450.00 total)
INSERT INTO finance.expense_items (expense_report_id, expense_date, category, description, vendor, amount, receipt_uploaded)
VALUES
    ('e1000000-0000-0000-0000-000000000101', '2026-01-12', 'TRAVEL', 'Roundtrip flight SFO', 'United Airlines', 650.00, true),
    ('e1000000-0000-0000-0000-000000000101', '2026-01-12', 'TRAVEL', 'Hotel - 3 nights', 'Marriott Union Square', 1200.00, true),
    ('e1000000-0000-0000-0000-000000000101', '2026-01-13', 'MEALS', 'Dinner with speaker', 'Boulevard Restaurant', 185.00, true),
    ('e1000000-0000-0000-0000-000000000101', '2026-01-14', 'TRAVEL', 'Uber to/from airport', 'Uber', 125.00, true),
    ('e1000000-0000-0000-0000-000000000101', '2026-01-13', 'OTHER', 'Conference registration fee', 'TechConf 2026', 290.00, true)
ON CONFLICT DO NOTHING;

-- Items for Report 2: Marcus Johnson Team Lunch ($385.50 total)
INSERT INTO finance.expense_items (expense_report_id, expense_date, category, description, vendor, amount, receipt_uploaded)
VALUES
    ('e1000000-0000-0000-0000-000000000102', '2026-01-18', 'MEALS', 'Team lunch - sprint completion', 'Pasta Palace', 285.50, true),
    ('e1000000-0000-0000-0000-000000000102', '2026-01-18', 'MEALS', 'Desserts and coffee', 'Sweet Treats Cafe', 100.00, true)
ON CONFLICT DO NOTHING;

-- Items for Report 3: Carol Johnson Client Dinner ($875.00 total)
INSERT INTO finance.expense_items (expense_report_id, expense_date, category, description, vendor, amount, receipt_uploaded)
VALUES
    ('e1000000-0000-0000-0000-000000000103', '2026-01-08', 'MEALS', 'Client dinner - Acme Corp negotiations', 'The Capital Grille', 650.00, true),
    ('e1000000-0000-0000-0000-000000000103', '2026-01-08', 'OTHER', 'Parking - downtown garage', 'City Center Parking', 45.00, true),
    ('e1000000-0000-0000-0000-000000000103', '2026-01-08', 'TRAVEL', 'Rideshare home', 'Lyft', 180.00, true)
ON CONFLICT DO NOTHING;

-- Items for Report 4: Frank Davis Office Supplies ($156.75 total)
INSERT INTO finance.expense_items (expense_report_id, expense_date, category, description, vendor, amount, receipt_uploaded, receipt_required)
VALUES
    ('e1000000-0000-0000-0000-000000000104', '2026-01-22', 'SUPPLIES', 'Mechanical keyboard', 'Amazon', 89.99, false, true),
    ('e1000000-0000-0000-0000-000000000104', '2026-01-22', 'SUPPLIES', 'USB-C hub', 'Amazon', 45.99, true, true),
    ('e1000000-0000-0000-0000-000000000104', '2026-01-23', 'SUPPLIES', 'Notebook and pens', 'Office Depot', 20.77, true, true)
ON CONFLICT DO NOTHING;

-- Items for Report 5: Alice Chen HR Conference ($3200.00 total)
INSERT INTO finance.expense_items (expense_report_id, expense_date, category, description, vendor, amount, receipt_uploaded)
VALUES
    ('e1000000-0000-0000-0000-000000000105', '2026-01-22', 'TRAVEL', 'Flight to Chicago', 'American Airlines', 485.00, true),
    ('e1000000-0000-0000-0000-000000000105', '2026-01-22', 'TRAVEL', 'Hotel - 4 nights', 'Hilton Chicago', 1600.00, true),
    ('e1000000-0000-0000-0000-000000000105', '2026-01-23', 'OTHER', 'Conference registration', 'SHRM Leadership Summit', 895.00, true),
    ('e1000000-0000-0000-0000-000000000105', '2026-01-24', 'MEALS', 'Networking dinner', 'Chicago Cut Steakhouse', 220.00, true)
ON CONFLICT DO NOTHING;

-- Items for Report 6: Nina Patel Training ($599.00 total) - Missing receipt
INSERT INTO finance.expense_items (expense_report_id, expense_date, category, description, vendor, amount, receipt_uploaded, receipt_required, notes)
VALUES
    ('e1000000-0000-0000-0000-000000000106', '2026-01-03', 'OTHER', 'AWS Solutions Architect course', 'Udemy', 199.00, false, true, 'Need to download receipt from Udemy'),
    ('e1000000-0000-0000-0000-000000000106', '2026-01-04', 'OTHER', 'AWS Practice exams', 'Tutorials Dojo', 50.00, false, true, 'Email receipt requested'),
    ('e1000000-0000-0000-0000-000000000106', '2026-01-05', 'SOFTWARE', 'AWS certification exam fee', 'AWS', 350.00, true, true, NULL)
ON CONFLICT DO NOTHING;

-- Items for Report 7: Bob Martinez Software ($1200.00 total)
INSERT INTO finance.expense_items (expense_report_id, expense_date, category, description, vendor, amount, receipt_uploaded)
VALUES
    ('e1000000-0000-0000-0000-000000000107', '2026-01-01', 'SOFTWARE', 'QuickBooks Online - Annual subscription', 'Intuit', 1200.00, true)
ON CONFLICT DO NOTHING;

-- Items for Report 8: Eve Thompson Executive Travel ($4850.00 total)
INSERT INTO finance.expense_items (expense_report_id, expense_date, category, description, vendor, amount, receipt_uploaded)
VALUES
    ('e1000000-0000-0000-0000-000000000108', '2026-01-28', 'TRAVEL', 'Business class flight to NYC', 'Delta Airlines', 2200.00, true),
    ('e1000000-0000-0000-0000-000000000108', '2026-01-28', 'TRAVEL', 'Hotel - The Plaza 2 nights', 'The Plaza Hotel', 1800.00, true),
    ('e1000000-0000-0000-0000-000000000108', '2026-01-29', 'MEALS', 'Board dinner', 'Per Se', 650.00, true),
    ('e1000000-0000-0000-0000-000000000108', '2026-01-30', 'TRAVEL', 'Car service', 'Blacklane', 200.00, true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA finance TO tamshai;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA finance TO tamshai;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tamshai;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tamshai;
GRANT EXECUTE ON FUNCTION finance.set_user_context TO tamshai;

-- Grant permissions to tamshai_app for RLS-enforced access
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA finance TO tamshai_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA finance TO tamshai_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tamshai_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tamshai_app;
GRANT EXECUTE ON FUNCTION finance.set_user_context TO tamshai_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA finance TO tamshai_app;
