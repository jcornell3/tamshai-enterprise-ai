-- Tamshai Corp HR Time-Off Schema
-- Time-off types, balances, and request management
--
-- This schema extends the HR module with time-off functionality
-- All tables use RLS for role-based access control
--
-- ACCESS MODEL:
-- 1. SELF: Employees can view their own balances and requests
-- 2. MANAGER: Managers can view/approve requests from their reports
-- 3. HR: HR staff can view all time-off data

\c tamshai_hr;

-- =============================================================================
-- TIME-OFF TYPES (Reference table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS hr.time_off_types (
    type_code VARCHAR(20) PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL,
    description TEXT,
    accrual_rate DECIMAL(4,2) DEFAULT 0,  -- Days accrued per month
    max_carryover DECIMAL(4,1) DEFAULT 0,  -- Max days that carry to next year
    requires_approval BOOLEAN DEFAULT true,
    min_notice_days INTEGER DEFAULT 0,     -- Minimum advance notice required
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert standard time-off types
INSERT INTO hr.time_off_types (type_code, type_name, description, accrual_rate, max_carryover, requires_approval, min_notice_days) VALUES
    ('VACATION', 'Vacation', 'Paid time off for vacation and personal travel', 1.25, 5.0, true, 7),
    ('SICK', 'Sick Leave', 'Paid sick leave for illness or medical appointments', 0.5, 3.0, true, 0),
    ('PERSONAL', 'Personal Day', 'Personal time off for non-vacation purposes', 0.25, 2.0, true, 2),
    ('BEREAVEMENT', 'Bereavement Leave', 'Paid leave for death of immediate family member', 0, 0, true, 0),
    ('JURY_DUTY', 'Jury Duty', 'Paid leave for jury service', 0, 0, false, 0),
    ('PARENTAL', 'Parental Leave', 'Paid leave for new parents', 0, 0, true, 30),
    ('UNPAID', 'Unpaid Leave', 'Leave without pay', 0, 0, true, 14)
ON CONFLICT (type_code) DO NOTHING;

-- =============================================================================
-- TIME-OFF BALANCES (Per employee, per year)
-- =============================================================================
CREATE TABLE IF NOT EXISTS hr.time_off_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES hr.employees(id) ON DELETE CASCADE,
    type_code VARCHAR(20) NOT NULL REFERENCES hr.time_off_types(type_code),
    fiscal_year INTEGER NOT NULL,
    entitlement DECIMAL(5,2) DEFAULT 0,  -- Total days available for the year
    used DECIMAL(5,2) DEFAULT 0,         -- Days already used
    pending DECIMAL(5,2) DEFAULT 0,      -- Days in pending requests
    carryover DECIMAL(5,2) DEFAULT 0,    -- Days carried from previous year
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, type_code, fiscal_year)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_time_off_balances_employee ON hr.time_off_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_off_balances_year ON hr.time_off_balances(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_time_off_balances_type ON hr.time_off_balances(type_code);

-- =============================================================================
-- TIME-OFF REQUESTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS hr.time_off_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES hr.employees(id) ON DELETE CASCADE,
    type_code VARCHAR(20) NOT NULL REFERENCES hr.time_off_types(type_code),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days DECIMAL(4,2) NOT NULL,    -- Calculated days (accounting for weekends)
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected, cancelled
    approver_id UUID REFERENCES hr.employees(id),
    approved_at TIMESTAMP,
    notes TEXT,                          -- Employee's notes/reason
    approver_notes TEXT,                 -- Manager's notes on approval/rejection
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_date_range CHECK (end_date >= start_date),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT valid_total_days CHECK (total_days > 0)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_time_off_requests_employee ON hr.time_off_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_off_requests_status ON hr.time_off_requests(status);
CREATE INDEX IF NOT EXISTS idx_time_off_requests_dates ON hr.time_off_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_time_off_requests_approver ON hr.time_off_requests(approver_id);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to calculate business days between two dates (excluding weekends)
CREATE OR REPLACE FUNCTION hr.calculate_business_days(start_date DATE, end_date DATE)
RETURNS DECIMAL(4,2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    total_days INTEGER := 0;
    loop_date DATE := start_date;
BEGIN
    WHILE loop_date <= end_date LOOP
        -- Skip Saturday (6) and Sunday (0)
        IF EXTRACT(DOW FROM loop_date) NOT IN (0, 6) THEN
            total_days := total_days + 1;
        END IF;
        loop_date := loop_date + INTERVAL '1 day';
    END LOOP;
    RETURN total_days;
END;
$$;

-- Function to get available balance for an employee
CREATE OR REPLACE FUNCTION hr.get_available_balance(p_employee_id UUID, p_type_code VARCHAR, p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hr, public
AS $$
DECLARE
    balance DECIMAL(5,2);
BEGIN
    SELECT (COALESCE(entitlement, 0) + COALESCE(carryover, 0) - COALESCE(used, 0) - COALESCE(pending, 0))
    INTO balance
    FROM hr.time_off_balances
    WHERE employee_id = p_employee_id
      AND type_code = p_type_code
      AND fiscal_year = p_year;

    RETURN COALESCE(balance, 0);
END;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on time_off_types (public read)
ALTER TABLE hr.time_off_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_off_types_public_read ON hr.time_off_types
    FOR SELECT
    USING (true);

-- Enable RLS on time_off_balances
ALTER TABLE hr.time_off_balances ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own balances
CREATE POLICY balance_self_access ON hr.time_off_balances
    FOR SELECT
    USING (
        employee_id IN (
            SELECT id FROM hr.employees
            WHERE work_email = current_setting('app.current_user_email', true)
        )
    );

-- Policy: HR can see all balances
CREATE POLICY balance_hr_access ON hr.time_off_balances
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%hr-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%hr-write%'
    );

-- Policy: Managers can see balances for their reports
CREATE POLICY balance_manager_access ON hr.time_off_balances
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND employee_id IN (
            SELECT e.id FROM hr.employees e
            WHERE is_manager_of(current_setting('app.current_user_email', true), e.work_email)
        )
    );

-- Policy: HR can update balances
CREATE POLICY balance_hr_update ON hr.time_off_balances
    FOR UPDATE
    USING (
        current_setting('app.current_user_roles', true) LIKE '%hr-write%'
    );

CREATE POLICY balance_hr_insert ON hr.time_off_balances
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_roles', true) LIKE '%hr-write%'
    );

-- Enable RLS on time_off_requests
ALTER TABLE hr.time_off_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own requests
CREATE POLICY request_self_access ON hr.time_off_requests
    FOR SELECT
    USING (
        employee_id IN (
            SELECT id FROM hr.employees
            WHERE work_email = current_setting('app.current_user_email', true)
        )
    );

-- Policy: HR can see all requests
CREATE POLICY request_hr_access ON hr.time_off_requests
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%hr-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%hr-write%'
    );

-- Policy: Managers can see requests from their reports
CREATE POLICY request_manager_access ON hr.time_off_requests
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND employee_id IN (
            SELECT e.id FROM hr.employees e
            WHERE is_manager_of(current_setting('app.current_user_email', true), e.work_email)
        )
    );

-- Policy: Users can create their own requests
CREATE POLICY request_self_insert ON hr.time_off_requests
    FOR INSERT
    WITH CHECK (
        employee_id IN (
            SELECT id FROM hr.employees
            WHERE work_email = current_setting('app.current_user_email', true)
        )
    );

-- Policy: Users can update their own pending requests (cancel)
CREATE POLICY request_self_update ON hr.time_off_requests
    FOR UPDATE
    USING (
        status = 'pending'
        AND employee_id IN (
            SELECT id FROM hr.employees
            WHERE work_email = current_setting('app.current_user_email', true)
        )
    );

-- Policy: Managers can update (approve/reject) requests from their reports
CREATE POLICY request_manager_update ON hr.time_off_requests
    FOR UPDATE
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND employee_id IN (
            SELECT e.id FROM hr.employees e
            WHERE is_manager_of(current_setting('app.current_user_email', true), e.work_email)
        )
    );

-- Policy: HR can update any request
CREATE POLICY request_hr_update ON hr.time_off_requests
    FOR UPDATE
    USING (
        current_setting('app.current_user_roles', true) LIKE '%hr-write%'
    );

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Grant permissions to tamshai user
GRANT ALL ON hr.time_off_types TO tamshai;
GRANT ALL ON hr.time_off_balances TO tamshai;
GRANT ALL ON hr.time_off_requests TO tamshai;

-- Grant permissions to tamshai_app (RLS-enforced)
GRANT ALL ON hr.time_off_types TO tamshai_app;
GRANT ALL ON hr.time_off_balances TO tamshai_app;
GRANT ALL ON hr.time_off_requests TO tamshai_app;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION hr.calculate_business_days TO tamshai;
GRANT EXECUTE ON FUNCTION hr.calculate_business_days TO tamshai_app;
GRANT EXECUTE ON FUNCTION hr.get_available_balance TO tamshai;
GRANT EXECUTE ON FUNCTION hr.get_available_balance TO tamshai_app;
