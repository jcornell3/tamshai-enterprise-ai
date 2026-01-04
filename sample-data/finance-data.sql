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
    (2024, '2024-01-01', '2024-12-31', 'OPEN'),
    (2025, '2025-01-01', '2025-12-31', 'PLANNED')
ON CONFLICT (year) DO NOTHING;

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
    ('INV-001', 'INV-001', 'Test Vendor Inc', 'TV-001', 'Test invoice for integration testing', 5000.00, '2024-11-01', '2024-12-01', NULL, 'PENDING', 'ENG'),
    ('INV-2024-001', 'INV-2024-001', 'Amazon Web Services', 'AWS-001', 'Cloud infrastructure - October 2024', 45000.00, '2024-10-01', '2024-10-31', '2024-10-28', 'PAID', 'IT'),
    ('INV-2024-002', 'INV-2024-002', 'Salesforce', 'SF-001', 'CRM licenses - Q4 2024', 28500.00, '2024-10-01', '2024-10-15', '2024-10-12', 'PAID', 'SALES'),
    ('INV-2024-003', 'INV-2024-003', 'WeWork', 'WW-001', 'Office space - November 2024', 35000.00, '2024-11-01', '2024-11-15', NULL, 'APPROVED', 'OPS'),
    ('INV-2024-004', 'INV-2024-004', 'Google Cloud', 'GCP-001', 'Cloud services - October 2024', 22000.00, '2024-10-05', '2024-11-05', NULL, 'PENDING', 'ENG'),
    ('INV-2024-005', 'INV-2024-005', 'HubSpot', 'HS-001', 'Marketing automation - Q4', 15000.00, '2024-10-10', '2024-11-10', NULL, 'APPROVED', 'MKT'),
    ('INV-2024-006', 'INV-2024-006', 'Workday', 'WD-001', 'HR platform - Annual', 85000.00, '2024-09-01', '2024-09-30', '2024-09-25', 'PAID', 'HR'),
    ('INV-2024-007', 'INV-2024-007', 'Legal Associates LLP', 'LA-001', 'Contract review services', 12500.00, '2024-10-15', '2024-11-15', NULL, 'PENDING', 'LEGAL')
ON CONFLICT DO NOTHING;

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
SELECT 2024, 'Q1', id, 2500000, 12.5, 'Strong product sales' FROM finance.budget_categories WHERE code = 'REV-PROD'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2024, 'Q1', id, 1800000, 18.2, 'New enterprise contracts' FROM finance.budget_categories WHERE code = 'REV-SUB'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2024, 'Q2', id, 2750000, 10.0, 'Continued growth' FROM finance.budget_categories WHERE code = 'REV-PROD'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2024, 'Q2', id, 2100000, 16.7, 'Low churn rate' FROM finance.budget_categories WHERE code = 'REV-SUB'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2024, 'Q3', id, 2900000, 5.5, 'Seasonal slowdown' FROM finance.budget_categories WHERE code = 'REV-PROD'
ON CONFLICT DO NOTHING;

INSERT INTO finance.revenue_summary (fiscal_year, quarter, category_id, amount, growth_percentage, notes)
SELECT 2024, 'Q3', id, 2400000, 14.3, 'Strong retention' FROM finance.budget_categories WHERE code = 'REV-SUB'
ON CONFLICT DO NOTHING;

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
