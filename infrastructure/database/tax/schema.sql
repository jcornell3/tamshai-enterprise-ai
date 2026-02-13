-- Tax Database Schema
-- MCP Tax Server - Port 3107

-- Connect to tax database (required for Docker init scripts)
\c tamshai_tax;

-- Create schema
CREATE SCHEMA IF NOT EXISTS tax;

-- Grant permissions to tamshai user (admin/sync operations)
GRANT USAGE ON SCHEMA tax TO tamshai;
GRANT ALL ON ALL TABLES IN SCHEMA tax TO tamshai;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tax TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA tax GRANT ALL ON TABLES TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA tax GRANT ALL ON SEQUENCES TO tamshai;

-- IMPORTANT: Allow tamshai to bypass Row-Level Security policies
-- Required for admin operations and integration tests
ALTER USER tamshai BYPASSRLS;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sales Tax Rates table
CREATE TABLE IF NOT EXISTS tax.sales_tax_rates (
    rate_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state VARCHAR(100) NOT NULL,
    state_code VARCHAR(2) NOT NULL,
    county VARCHAR(100),
    city VARCHAR(100),
    base_rate DECIMAL(6, 4) NOT NULL, -- State base rate (e.g., 0.0725 = 7.25%)
    local_rate DECIMAL(6, 4) DEFAULT 0, -- Local/district rate
    combined_rate DECIMAL(6, 4) NOT NULL, -- Total combined rate
    effective_date DATE NOT NULL,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quarterly Tax Estimates table
CREATE TABLE IF NOT EXISTS tax.quarterly_estimates (
    estimate_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL,
    quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    federal_estimate DECIMAL(14, 2) NOT NULL DEFAULT 0,
    state_estimate DECIMAL(14, 2) NOT NULL DEFAULT 0,
    local_estimate DECIMAL(14, 2) DEFAULT 0,
    total_estimate DECIMAL(14, 2) NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, paid, overdue, partial
    paid_amount DECIMAL(14, 2) DEFAULT 0,
    paid_date DATE,
    payment_reference VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (year, quarter)
);

-- Annual Filings table (1099s, W-2s, 941s, etc.)
CREATE TABLE IF NOT EXISTS tax.annual_filings (
    filing_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL,
    filing_type VARCHAR(50) NOT NULL, -- 1099, W-2, 941, 940, 1120S, etc.
    entity_name VARCHAR(255) NOT NULL,
    entity_id VARCHAR(100), -- Reference to employee/contractor
    total_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    filing_date DATE,
    due_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'draft', -- draft, filed, accepted, rejected, amended
    confirmation_number VARCHAR(100),
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- State Tax Registrations table
CREATE TABLE IF NOT EXISTS tax.state_registrations (
    registration_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state VARCHAR(100) NOT NULL,
    state_code VARCHAR(2) NOT NULL,
    registration_type VARCHAR(50) NOT NULL, -- sales_tax, income_tax, franchise_tax, unemployment
    registration_number VARCHAR(100) NOT NULL,
    registration_date DATE NOT NULL,
    expiration_date DATE,
    status VARCHAR(50) DEFAULT 'active', -- active, pending, expired, suspended, revoked
    filing_frequency VARCHAR(50) NOT NULL, -- monthly, quarterly, annually
    next_filing_due DATE,
    account_representative VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (state_code, registration_type)
);

-- Audit Log table
CREATE TABLE IF NOT EXISTS tax.audit_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    action VARCHAR(50) NOT NULL, -- create, update, delete, submit, approve, reject
    entity_type VARCHAR(50) NOT NULL, -- filing, estimate, registration, rate
    entity_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    previous_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    notes TEXT
);

-- Tax Calendar Events table (deadlines, reminders)
CREATE TABLE IF NOT EXISTS tax.calendar_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) NOT NULL, -- deadline, reminder, filing_period
    due_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, completed, overdue
    related_entity_type VARCHAR(50), -- filing, estimate, registration
    related_entity_id UUID,
    reminder_days INTEGER[] DEFAULT ARRAY[7, 3, 1], -- Days before to send reminders
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sales_tax_rates_state ON tax.sales_tax_rates(state_code);
CREATE INDEX IF NOT EXISTS idx_sales_tax_rates_effective ON tax.sales_tax_rates(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_quarterly_estimates_year ON tax.quarterly_estimates(year DESC, quarter);
CREATE INDEX IF NOT EXISTS idx_quarterly_estimates_status ON tax.quarterly_estimates(status);
CREATE INDEX IF NOT EXISTS idx_quarterly_estimates_due ON tax.quarterly_estimates(due_date);
CREATE INDEX IF NOT EXISTS idx_annual_filings_year ON tax.annual_filings(year DESC);
CREATE INDEX IF NOT EXISTS idx_annual_filings_type ON tax.annual_filings(filing_type);
CREATE INDEX IF NOT EXISTS idx_annual_filings_status ON tax.annual_filings(status);
CREATE INDEX IF NOT EXISTS idx_annual_filings_due ON tax.annual_filings(due_date);
CREATE INDEX IF NOT EXISTS idx_state_registrations_state ON tax.state_registrations(state_code);
CREATE INDEX IF NOT EXISTS idx_state_registrations_status ON tax.state_registrations(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON tax.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON tax.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON tax.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_due ON tax.calendar_events(due_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON tax.calendar_events(status);

-- Row-Level Security Policies
ALTER TABLE tax.sales_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.quarterly_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.annual_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.state_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Sales tax rates are read-only reference data (public read)
CREATE POLICY tax_rates_public_read ON tax.sales_tax_rates
    FOR SELECT
    USING (true);

CREATE POLICY tax_rates_admin_write ON tax.sales_tax_rates
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- RLS Policy: Quarterly estimates - tax roles can read, tax-write can modify
CREATE POLICY tax_estimates_read ON tax.quarterly_estimates
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

CREATE POLICY tax_estimates_write ON tax.quarterly_estimates
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- RLS Policy: Annual filings - tax roles can read, tax-write can modify
CREATE POLICY tax_filings_read ON tax.annual_filings
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

CREATE POLICY tax_filings_write ON tax.annual_filings
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- RLS Policy: State registrations - tax roles can read, tax-write can modify
CREATE POLICY tax_registrations_read ON tax.state_registrations
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

CREATE POLICY tax_registrations_write ON tax.state_registrations
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- RLS Policy: Audit logs - tax roles can read, system can write
CREATE POLICY tax_audit_read ON tax.audit_logs
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

CREATE POLICY tax_audit_write ON tax.audit_logs
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- RLS Policy: Calendar events - tax roles can read and manage
CREATE POLICY tax_calendar_read ON tax.calendar_events
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%tax-write%'
        OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

CREATE POLICY tax_calendar_write ON tax.calendar_events
    FOR ALL
    USING (
        current_setting('app.current_user_roles', true) LIKE '%tax-write%'
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
GRANT USAGE ON SCHEMA tax TO tamshai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tax TO tamshai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tax TO tamshai_app;
