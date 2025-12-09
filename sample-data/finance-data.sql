-- Tamshai Corp Finance Sample Data
-- This script runs after database initialization

\c tamshai_finance;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SCHEMA (v1.4)
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS finance;

-- Grant permissions to tamshai user
GRANT USAGE ON SCHEMA finance TO tamshai;
GRANT ALL ON ALL TABLES IN SCHEMA finance TO tamshai;
GRANT ALL ON ALL SEQUENCES IN SCHEMA finance TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT ALL ON TABLES TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT ALL ON SEQUENCES TO tamshai;

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
-- DEPARTMENT BUDGETS
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.department_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_code VARCHAR(10) NOT NULL,
    fiscal_year INTEGER NOT NULL,
    category_id UUID REFERENCES finance.budget_categories(id),
    budgeted_amount DECIMAL(15, 2) NOT NULL,
    actual_amount DECIMAL(15, 2) DEFAULT 0,
    forecast_amount DECIMAL(15, 2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(department_code, fiscal_year, category_id)
);

-- 2024 Budgets (simplified - key departments)
INSERT INTO finance.department_budgets (department_code, fiscal_year, category_id, budgeted_amount, actual_amount, forecast_amount) 
SELECT 'EXEC', 2024, id, 500000, 425000, 510000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (department_code, fiscal_year, category_id, budgeted_amount, actual_amount, forecast_amount) 
SELECT 'HR', 2024, id, 750000, 680000, 740000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (department_code, fiscal_year, category_id, budgeted_amount, actual_amount, forecast_amount) 
SELECT 'FIN', 2024, id, 450000, 410000, 455000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (department_code, fiscal_year, category_id, budgeted_amount, actual_amount, forecast_amount) 
SELECT 'SALES', 2024, id, 1200000, 1050000, 1180000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (department_code, fiscal_year, category_id, budgeted_amount, actual_amount, forecast_amount) 
SELECT 'ENG', 2024, id, 2500000, 2200000, 2480000 FROM finance.budget_categories WHERE code = 'EXP-SAL'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (department_code, fiscal_year, category_id, budgeted_amount, actual_amount, forecast_amount) 
SELECT 'MKT', 2024, id, 800000, 720000, 850000 FROM finance.budget_categories WHERE code = 'EXP-MKT'
ON CONFLICT DO NOTHING;

INSERT INTO finance.department_budgets (department_code, fiscal_year, category_id, budgeted_amount, actual_amount, forecast_amount) 
SELECT 'IT', 2024, id, 600000, 520000, 580000 FROM finance.budget_categories WHERE code = 'EXP-TECH'
ON CONFLICT DO NOTHING;

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
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    is_confidential BOOLEAN DEFAULT false
);

INSERT INTO finance.financial_reports (report_type, fiscal_year, period, title, description, document_path, status, is_confidential, created_by, published_at) VALUES
    ('PL', 2024, 'Q1', '2024 Q1 Profit & Loss Statement', 'First quarter P&L for FY2024', '/finance-docs/2024/pl/q1-pl-statement.pdf', 'FINAL', false, 'bob.martinez', '2024-04-15'),
    ('PL', 2024, 'Q2', '2024 Q2 Profit & Loss Statement', 'Second quarter P&L for FY2024', '/finance-docs/2024/pl/q2-pl-statement.pdf', 'FINAL', false, 'bob.martinez', '2024-07-15'),
    ('PL', 2024, 'Q3', '2024 Q3 Profit & Loss Statement', 'Third quarter P&L for FY2024', '/finance-docs/2024/pl/q3-pl-statement.pdf', 'REVIEW', false, 'bob.martinez', NULL),
    ('BALANCE_SHEET', 2024, 'Q2', '2024 Q2 Balance Sheet', 'Balance sheet as of June 30, 2024', '/finance-docs/2024/balance/q2-balance-sheet.pdf', 'FINAL', false, 'bob.martinez', '2024-07-20'),
    ('QUARTERLY', 2024, 'Q2', '2024 Q2 Executive Summary', 'Executive financial summary for Q2', '/finance-docs/2024/executive/q2-executive-summary.pdf', 'FINAL', true, 'bob.martinez', '2024-07-25'),
    ('CASH_FLOW', 2024, 'H1', '2024 H1 Cash Flow Analysis', 'First half cash flow statement', '/finance-docs/2024/cashflow/h1-cash-flow.pdf', 'FINAL', false, 'lisa.anderson', '2024-07-30')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- INVOICES (CONFIDENTIAL - finance-write only)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    vendor_name VARCHAR(200) NOT NULL,
    vendor_id VARCHAR(50),
    description TEXT,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    paid_date DATE,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, PAID, OVERDUE
    department_code VARCHAR(10),
    category_id UUID REFERENCES finance.budget_categories(id),
    document_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP
);

INSERT INTO finance.invoices (invoice_number, vendor_name, vendor_id, description, amount, invoice_date, due_date, paid_date, status, department_code) VALUES
    ('INV-2024-001', 'Amazon Web Services', 'AWS-001', 'Cloud infrastructure - October 2024', 45000.00, '2024-10-01', '2024-10-31', '2024-10-28', 'PAID', 'IT'),
    ('INV-2024-002', 'Salesforce', 'SF-001', 'CRM licenses - Q4 2024', 28500.00, '2024-10-01', '2024-10-15', '2024-10-12', 'PAID', 'SALES'),
    ('INV-2024-003', 'WeWork', 'WW-001', 'Office space - November 2024', 35000.00, '2024-11-01', '2024-11-15', NULL, 'APPROVED', 'OPS'),
    ('INV-2024-004', 'Google Cloud', 'GCP-001', 'Cloud services - October 2024', 22000.00, '2024-10-05', '2024-11-05', NULL, 'PENDING', 'ENG'),
    ('INV-2024-005', 'HubSpot', 'HS-001', 'Marketing automation - Q4', 15000.00, '2024-10-10', '2024-11-10', NULL, 'APPROVED', 'MKT'),
    ('INV-2024-006', 'Workday', 'WD-001', 'HR platform - Annual', 85000.00, '2024-09-01', '2024-09-30', '2024-09-25', 'PAID', 'HR'),
    ('INV-2024-007', 'Legal Associates LLP', 'LA-001', 'Contract review services', 12500.00, '2024-10-15', '2024-11-15', NULL, 'PENDING', 'LEGAL')
ON CONFLICT (invoice_number) DO NOTHING;

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
CREATE INDEX IF NOT EXISTS idx_reports_type_year ON finance.financial_reports(report_type, fiscal_year);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tamshai;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tamshai;
