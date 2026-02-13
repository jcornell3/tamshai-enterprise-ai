-- Payroll Database Schema
-- MCP Payroll Server - Port 3106

-- Connect to payroll database (required for Docker init scripts)
\c tamshai_payroll;

-- Create schema
CREATE SCHEMA IF NOT EXISTS payroll;

-- Grant permissions to tamshai user (admin/sync operations)
GRANT USAGE ON SCHEMA payroll TO tamshai;
GRANT ALL ON ALL TABLES IN SCHEMA payroll TO tamshai;
GRANT ALL ON ALL SEQUENCES IN SCHEMA payroll TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA payroll GRANT ALL ON TABLES TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA payroll GRANT ALL ON SEQUENCES TO tamshai;

-- IMPORTANT: Allow tamshai to bypass Row-Level Security policies
-- Required for admin operations and integration tests
ALTER USER tamshai BYPASSRLS;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employees table (payroll-specific employee data)
CREATE TABLE IF NOT EXISTS payroll.employees (
    employee_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hr_employee_id UUID, -- Reference to HR system
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    ssn_encrypted VARCHAR(255), -- Encrypted SSN
    date_of_birth DATE,
    hire_date DATE NOT NULL,
    termination_date DATE,
    department VARCHAR(100),
    job_title VARCHAR(100),
    employment_type VARCHAR(50) DEFAULT 'FULL_TIME', -- FULL_TIME, PART_TIME, CONTRACT
    pay_type VARCHAR(50) DEFAULT 'SALARY', -- SALARY, HOURLY
    annual_salary DECIMAL(12, 2),
    hourly_rate DECIMAL(10, 2),
    pay_frequency VARCHAR(50) DEFAULT 'BI_WEEKLY', -- WEEKLY, BI_WEEKLY, SEMI_MONTHLY, MONTHLY
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, TERMINATED
    manager_id UUID REFERENCES payroll.employees(employee_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pay runs table
CREATE TABLE IF NOT EXISTS payroll.pay_runs (
    pay_run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    pay_date DATE NOT NULL,
    pay_frequency VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'DRAFT', -- DRAFT, PENDING, APPROVED, PROCESSED, CANCELLED
    total_gross DECIMAL(14, 2) DEFAULT 0,
    total_net DECIMAL(14, 2) DEFAULT 0,
    total_taxes DECIMAL(14, 2) DEFAULT 0,
    total_deductions DECIMAL(14, 2) DEFAULT 0,
    employer_taxes DECIMAL(14, 2) DEFAULT 0,
    employer_benefits DECIMAL(14, 2) DEFAULT 0,
    employee_count INTEGER DEFAULT 0,
    created_by UUID,
    approved_by UUID,
    processed_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- Pay stubs table
CREATE TABLE IF NOT EXISTS payroll.pay_stubs (
    pay_stub_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES payroll.employees(employee_id),
    pay_run_id UUID NOT NULL REFERENCES payroll.pay_runs(pay_run_id),
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    pay_date DATE NOT NULL,
    gross_pay DECIMAL(12, 2) NOT NULL,
    net_pay DECIMAL(12, 2) NOT NULL,
    total_taxes DECIMAL(12, 2) NOT NULL,
    total_deductions DECIMAL(12, 2) NOT NULL,
    hours_worked DECIMAL(8, 2),
    overtime_hours DECIMAL(8, 2),
    ytd_gross DECIMAL(14, 2) DEFAULT 0,
    ytd_net DECIMAL(14, 2) DEFAULT 0,
    ytd_taxes DECIMAL(14, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pay stub earnings (line items)
CREATE TABLE IF NOT EXISTS payroll.pay_stub_earnings (
    earning_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pay_stub_id UUID NOT NULL REFERENCES payroll.pay_stubs(pay_stub_id),
    earning_type VARCHAR(50) NOT NULL, -- REGULAR, OVERTIME, BONUS, COMMISSION, PTO, SICK
    description VARCHAR(255),
    hours DECIMAL(8, 2),
    rate DECIMAL(10, 2),
    amount DECIMAL(12, 2) NOT NULL
);

-- Pay stub taxes (line items)
CREATE TABLE IF NOT EXISTS payroll.pay_stub_taxes (
    tax_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pay_stub_id UUID NOT NULL REFERENCES payroll.pay_stubs(pay_stub_id),
    tax_type VARCHAR(50) NOT NULL, -- FEDERAL, STATE, LOCAL, FICA_SS, FICA_MED
    description VARCHAR(255),
    amount DECIMAL(12, 2) NOT NULL,
    ytd_amount DECIMAL(14, 2) DEFAULT 0
);

-- Pay stub deductions (line items)
CREATE TABLE IF NOT EXISTS payroll.pay_stub_deductions (
    deduction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pay_stub_id UUID NOT NULL REFERENCES payroll.pay_stubs(pay_stub_id),
    deduction_type VARCHAR(50) NOT NULL, -- HEALTH, DENTAL, VISION, 401K, HSA, FSA, LIFE, DISABILITY
    description VARCHAR(255),
    amount DECIMAL(12, 2) NOT NULL,
    is_pretax BOOLEAN DEFAULT true,
    ytd_amount DECIMAL(14, 2) DEFAULT 0
);

-- Tax withholdings table
CREATE TABLE IF NOT EXISTS payroll.tax_withholdings (
    withholding_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES payroll.employees(employee_id),
    federal_filing_status VARCHAR(50) DEFAULT 'SINGLE', -- SINGLE, MARRIED_FILING_JOINTLY, MARRIED_FILING_SEPARATELY, HEAD_OF_HOUSEHOLD
    federal_allowances INTEGER DEFAULT 0,
    federal_additional DECIMAL(10, 2) DEFAULT 0,
    federal_exempt BOOLEAN DEFAULT false,
    state VARCHAR(2),
    state_filing_status VARCHAR(50),
    state_allowances INTEGER DEFAULT 0,
    state_additional DECIMAL(10, 2) DEFAULT 0,
    state_exempt BOOLEAN DEFAULT false,
    local_tax_enabled BOOLEAN DEFAULT false,
    local_jurisdiction VARCHAR(100),
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (employee_id, effective_date)
);

-- Benefit deductions table
CREATE TABLE IF NOT EXISTS payroll.benefit_deductions (
    deduction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES payroll.employees(employee_id),
    benefit_type VARCHAR(50) NOT NULL, -- health, dental, vision, 401k, hsa, fsa, life, disability
    benefit_name VARCHAR(255) NOT NULL,
    employee_amount DECIMAL(10, 2) NOT NULL,
    employer_contribution DECIMAL(10, 2) DEFAULT 0,
    frequency VARCHAR(50) DEFAULT 'PER_PAY_PERIOD', -- PER_PAY_PERIOD, MONTHLY, ANNUAL
    is_pretax BOOLEAN DEFAULT true,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, PENDING
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Direct deposit accounts table
CREATE TABLE IF NOT EXISTS payroll.direct_deposit_accounts (
    account_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES payroll.employees(employee_id),
    account_type VARCHAR(50) NOT NULL, -- CHECKING, SAVINGS
    bank_name VARCHAR(255) NOT NULL,
    routing_number VARCHAR(9) NOT NULL, -- Stored encrypted in production
    account_number VARCHAR(17) NOT NULL, -- Stored encrypted in production
    allocation_type VARCHAR(50) NOT NULL, -- PERCENTAGE, FIXED_AMOUNT, REMAINDER
    allocation_value DECIMAL(10, 2), -- NULL if REMAINDER
    priority INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, PENDING_VERIFICATION
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contractors table (1099)
CREATE TABLE IF NOT EXISTS payroll.contractors (
    contractor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    tax_id VARCHAR(9), -- EIN or SSN, encrypted in production
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, TERMINATED
    payment_method VARCHAR(50) DEFAULT 'ACH', -- ACH, CHECK, WIRE
    hourly_rate DECIMAL(10, 2),
    contract_start_date DATE NOT NULL,
    contract_end_date DATE,
    ytd_payments DECIMAL(14, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contractor payments table
CREATE TABLE IF NOT EXISTS payroll.contractor_payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES payroll.contractors(contractor_id),
    payment_date DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    invoice_number VARCHAR(100),
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED, PROCESSED, CANCELLED
    payment_method VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pay_runs_status ON payroll.pay_runs(status);
CREATE INDEX IF NOT EXISTS idx_pay_runs_pay_date ON payroll.pay_runs(pay_date DESC);
CREATE INDEX IF NOT EXISTS idx_pay_stubs_employee ON payroll.pay_stubs(employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_stubs_pay_date ON payroll.pay_stubs(pay_date DESC);
CREATE INDEX IF NOT EXISTS idx_pay_stubs_pay_run ON payroll.pay_stubs(pay_run_id);
CREATE INDEX IF NOT EXISTS idx_tax_withholdings_employee ON payroll.tax_withholdings(employee_id);
CREATE INDEX IF NOT EXISTS idx_benefit_deductions_employee ON payroll.benefit_deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_direct_deposit_employee ON payroll.direct_deposit_accounts(employee_id);
CREATE INDEX IF NOT EXISTS idx_contractors_status ON payroll.contractors(status);
CREATE INDEX IF NOT EXISTS idx_contractor_payments_contractor ON payroll.contractor_payments(contractor_id);

-- Row-Level Security Policies
ALTER TABLE payroll.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.pay_stubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.tax_withholdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.benefit_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.direct_deposit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.contractor_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Payroll admins can see all data
CREATE POLICY payroll_admin_policy ON payroll.employees
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%payroll-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

CREATE POLICY payroll_admin_pay_runs ON payroll.pay_runs
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%payroll-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%payroll-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

CREATE POLICY payroll_admin_pay_stubs ON payroll.pay_stubs
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%payroll-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%payroll-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
        OR employee_id::text = current_setting('app.current_user_id', true)
    );

CREATE POLICY payroll_admin_tax_withholdings ON payroll.tax_withholdings
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%payroll-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%payroll-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
        OR employee_id::text = current_setting('app.current_user_id', true)
    );

CREATE POLICY payroll_admin_benefit_deductions ON payroll.benefit_deductions
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%payroll-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%payroll-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
        OR employee_id::text = current_setting('app.current_user_id', true)
    );

CREATE POLICY payroll_admin_direct_deposit ON payroll.direct_deposit_accounts
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%payroll-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%payroll-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
        OR employee_id::text = current_setting('app.current_user_id', true)
    );

CREATE POLICY payroll_admin_contractors ON payroll.contractors
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%payroll-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%payroll-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

CREATE POLICY payroll_admin_contractor_payments ON payroll.contractor_payments
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%payroll-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%payroll-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- Create tamshai_app user for RLS-enforced operations (used by MCP servers and tests)
-- This user does NOT have BYPASSRLS - RLS policies will be enforced
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tamshai_app') THEN
        CREATE ROLE tamshai_app WITH LOGIN PASSWORD 'changeme';
    END IF;
END
$$;

-- Grant permissions to tamshai_app user (without BYPASSRLS)
GRANT USAGE ON SCHEMA payroll TO tamshai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA payroll TO tamshai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA payroll TO tamshai_app;
