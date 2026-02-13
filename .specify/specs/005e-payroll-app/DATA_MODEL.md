# Payroll Application Data Model

## 1. Overview

This document defines the database schema for the Payroll application. All data is stored in PostgreSQL with Row-Level Security (RLS) policies protecting sensitive compensation data.

**Database**: `tamshai_payroll`
**Schema**: `payroll`

---

## 2. Core Tables

### 2.1 Pay Runs

```sql
CREATE TABLE payroll.pay_runs (
    pay_run_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pay_run_number      VARCHAR(20) NOT NULL UNIQUE,        -- PR-2024-001

    -- Pay period
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    pay_date            DATE NOT NULL,

    -- Type
    pay_type            VARCHAR(20) DEFAULT 'regular',      -- regular, bonus, off_cycle, final
    pay_frequency       VARCHAR(20) DEFAULT 'bi_weekly',

    -- Totals
    employee_count      INTEGER DEFAULT 0,
    gross_pay           DECIMAL(12, 2) DEFAULT 0,
    total_deductions    DECIMAL(12, 2) DEFAULT 0,
    net_pay             DECIMAL(12, 2) DEFAULT 0,

    -- Tax totals
    federal_tax         DECIMAL(12, 2) DEFAULT 0,
    state_tax           DECIMAL(12, 2) DEFAULT 0,
    social_security     DECIMAL(12, 2) DEFAULT 0,
    medicare            DECIMAL(12, 2) DEFAULT 0,
    employer_taxes      DECIMAL(12, 2) DEFAULT 0,

    -- Benefits totals
    employee_benefits   DECIMAL(12, 2) DEFAULT 0,
    employer_benefits   DECIMAL(12, 2) DEFAULT 0,

    -- 401(k) totals
    employee_401k       DECIMAL(12, 2) DEFAULT 0,
    employer_401k_match DECIMAL(12, 2) DEFAULT 0,

    -- Status workflow
    status              VARCHAR(20) DEFAULT 'draft',        -- draft, review, approved, processing, completed, cancelled
    submitted_at        TIMESTAMPTZ,
    submitted_by        UUID,
    approved_at         TIMESTAMPTZ,
    approved_by         UUID,
    processed_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancelled_by        UUID,
    cancellation_reason TEXT,

    -- ACH batch
    ach_batch_id        VARCHAR(50),
    ach_submitted_at    TIMESTAMPTZ,

    -- Metadata
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID,

    CONSTRAINT valid_pay_period CHECK (period_end >= period_start),
    CONSTRAINT valid_pay_date CHECK (pay_date >= period_end)
);

CREATE INDEX idx_pay_runs_dates ON payroll.pay_runs(period_start, period_end);
CREATE INDEX idx_pay_runs_pay_date ON payroll.pay_runs(pay_date);
CREATE INDEX idx_pay_runs_status ON payroll.pay_runs(status);
```

### 2.2 Pay Stubs

```sql
CREATE TABLE payroll.pay_stubs (
    pay_stub_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pay_run_id          UUID REFERENCES payroll.pay_runs(pay_run_id) NOT NULL,
    employee_id         UUID NOT NULL,                      -- HR employee reference

    -- Employee snapshot (at time of pay run)
    employee_name       VARCHAR(200) NOT NULL,
    department          VARCHAR(100),
    title               VARCHAR(100),
    state               CHAR(2) NOT NULL,                   -- Tax state

    -- Earnings
    regular_hours       DECIMAL(6, 2) DEFAULT 80,           -- Standard bi-weekly
    regular_rate        DECIMAL(10, 2),
    regular_pay         DECIMAL(10, 2) DEFAULT 0,
    overtime_hours      DECIMAL(6, 2) DEFAULT 0,
    overtime_rate       DECIMAL(10, 2),
    overtime_pay        DECIMAL(10, 2) DEFAULT 0,
    bonus               DECIMAL(10, 2) DEFAULT 0,
    commission          DECIMAL(10, 2) DEFAULT 0,
    other_earnings      DECIMAL(10, 2) DEFAULT 0,
    gross_pay           DECIMAL(10, 2) NOT NULL,

    -- Federal taxes
    federal_income_tax  DECIMAL(10, 2) DEFAULT 0,
    social_security     DECIMAL(10, 2) DEFAULT 0,
    medicare            DECIMAL(10, 2) DEFAULT 0,
    medicare_additional DECIMAL(10, 2) DEFAULT 0,           -- Additional 0.9% over $200K

    -- State taxes
    state_income_tax    DECIMAL(10, 2) DEFAULT 0,
    state_disability    DECIMAL(10, 2) DEFAULT 0,           -- CA SDI, etc.
    local_tax           DECIMAL(10, 2) DEFAULT 0,           -- NYC, etc.

    -- Pre-tax deductions
    health_insurance    DECIMAL(10, 2) DEFAULT 0,
    dental_insurance    DECIMAL(10, 2) DEFAULT 0,
    vision_insurance    DECIMAL(10, 2) DEFAULT 0,
    hsa_contribution    DECIMAL(10, 2) DEFAULT 0,
    fsa_contribution    DECIMAL(10, 2) DEFAULT 0,
    retirement_401k     DECIMAL(10, 2) DEFAULT 0,

    -- Post-tax deductions
    roth_401k           DECIMAL(10, 2) DEFAULT 0,
    life_insurance      DECIMAL(10, 2) DEFAULT 0,
    garnishments        DECIMAL(10, 2) DEFAULT 0,
    other_deductions    DECIMAL(10, 2) DEFAULT 0,

    -- Totals
    total_taxes         DECIMAL(10, 2) GENERATED ALWAYS AS (
        federal_income_tax + social_security + medicare + medicare_additional +
        state_income_tax + state_disability + local_tax
    ) STORED,
    total_deductions    DECIMAL(10, 2) GENERATED ALWAYS AS (
        health_insurance + dental_insurance + vision_insurance +
        hsa_contribution + fsa_contribution + retirement_401k +
        roth_401k + life_insurance + garnishments + other_deductions
    ) STORED,
    net_pay             DECIMAL(10, 2) NOT NULL,

    -- YTD (at time of pay stub)
    ytd_gross           DECIMAL(12, 2) DEFAULT 0,
    ytd_federal_tax     DECIMAL(12, 2) DEFAULT 0,
    ytd_state_tax       DECIMAL(12, 2) DEFAULT 0,
    ytd_social_security DECIMAL(12, 2) DEFAULT 0,
    ytd_medicare        DECIMAL(12, 2) DEFAULT 0,
    ytd_401k            DECIMAL(12, 2) DEFAULT 0,
    ytd_net             DECIMAL(12, 2) DEFAULT 0,

    -- Direct deposit
    payment_method      VARCHAR(20) DEFAULT 'direct_deposit', -- direct_deposit, check
    check_number        VARCHAR(20),

    -- Metadata
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pay_stubs_pay_run ON payroll.pay_stubs(pay_run_id);
CREATE INDEX idx_pay_stubs_employee ON payroll.pay_stubs(employee_id);
CREATE INDEX idx_pay_stubs_state ON payroll.pay_stubs(state);
```

### 2.3 Employee Tax Settings

```sql
CREATE TABLE payroll.employee_tax_settings (
    tax_setting_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID NOT NULL UNIQUE,               -- HR employee reference

    -- Federal W-4 (2020+ format)
    federal_filing_status VARCHAR(30) NOT NULL,             -- single, married_filing_jointly, head_of_household
    federal_multiple_jobs BOOLEAN DEFAULT false,            -- Step 2(c)
    federal_dependents_credit DECIMAL(10, 2) DEFAULT 0,     -- Step 3
    federal_other_income DECIMAL(10, 2) DEFAULT 0,          -- Step 4(a)
    federal_deductions  DECIMAL(10, 2) DEFAULT 0,           -- Step 4(b)
    federal_extra_withholding DECIMAL(10, 2) DEFAULT 0,     -- Step 4(c)
    federal_exempt      BOOLEAN DEFAULT false,              -- Claim exempt

    -- State tax settings
    state               CHAR(2) NOT NULL,
    state_filing_status VARCHAR(30),
    state_allowances    INTEGER DEFAULT 0,
    state_extra_withholding DECIMAL(10, 2) DEFAULT 0,
    state_exempt        BOOLEAN DEFAULT false,

    -- Local tax (if applicable)
    local_tax_jurisdiction VARCHAR(50),
    local_filing_status VARCHAR(30),
    local_extra_withholding DECIMAL(10, 2) DEFAULT 0,

    -- Effective dates
    effective_date      DATE NOT NULL,
    w4_signed_date      DATE,

    -- Metadata
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_by          UUID
);

CREATE INDEX idx_tax_settings_employee ON payroll.employee_tax_settings(employee_id);
CREATE INDEX idx_tax_settings_state ON payroll.employee_tax_settings(state);
```

### 2.4 Deduction Types

```sql
CREATE TABLE payroll.deduction_types (
    deduction_type_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(20) NOT NULL UNIQUE,
    name                VARCHAR(100) NOT NULL,
    category            VARCHAR(20) NOT NULL,               -- tax, benefit, retirement, garnishment, other
    is_pretax           BOOLEAN DEFAULT true,
    is_employer_paid    BOOLEAN DEFAULT false,
    calculation_type    VARCHAR(20) NOT NULL,               -- fixed, percent, per_pay_period
    default_amount      DECIMAL(10, 2),
    default_percent     DECIMAL(5, 4),
    max_annual          DECIMAL(12, 2),                     -- Annual limit
    active              BOOLEAN DEFAULT true,
    sort_order          INTEGER,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO payroll.deduction_types (code, name, category, is_pretax, calculation_type, max_annual, sort_order) VALUES
    ('FED_TAX', 'Federal Income Tax', 'tax', false, 'calculated', NULL, 1),
    ('SS_TAX', 'Social Security', 'tax', false, 'percent', 168600, 2),  -- 2024 wage base
    ('MED_TAX', 'Medicare', 'tax', false, 'percent', NULL, 3),
    ('STATE_TAX', 'State Income Tax', 'tax', false, 'calculated', NULL, 4),
    ('HEALTH', 'Health Insurance', 'benefit', true, 'fixed', NULL, 10),
    ('DENTAL', 'Dental Insurance', 'benefit', true, 'fixed', NULL, 11),
    ('VISION', 'Vision Insurance', 'benefit', true, 'fixed', NULL, 12),
    ('401K', '401(k) Traditional', 'retirement', true, 'percent', 23000, 20),  -- 2024 limit
    ('401K_ROTH', '401(k) Roth', 'retirement', false, 'percent', 23000, 21),
    ('HSA', 'Health Savings Account', 'benefit', true, 'fixed', 4150, 30),  -- 2024 individual
    ('FSA', 'Flexible Spending Account', 'benefit', true, 'fixed', 3200, 31),  -- 2024 limit
    ('LIFE', 'Life Insurance', 'benefit', false, 'fixed', NULL, 40),
    ('GARNISH', 'Garnishment', 'garnishment', false, 'fixed', NULL, 50);
```

### 2.5 Employee Deductions

```sql
CREATE TABLE payroll.employee_deductions (
    employee_deduction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID NOT NULL,                      -- HR employee reference
    deduction_type_id   UUID REFERENCES payroll.deduction_types(deduction_type_id) NOT NULL,

    -- Amount
    amount              DECIMAL(10, 2),                     -- Fixed amount per pay period
    percent             DECIMAL(5, 4),                      -- Percentage of gross
    annual_limit        DECIMAL(12, 2),                     -- Override type limit

    -- Status
    status              VARCHAR(20) DEFAULT 'active',       -- active, suspended, terminated
    effective_date      DATE NOT NULL,
    end_date            DATE,

    -- YTD tracking
    ytd_amount          DECIMAL(12, 2) DEFAULT 0,

    -- Metadata
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(employee_id, deduction_type_id)
);

CREATE INDEX idx_employee_deductions_employee ON payroll.employee_deductions(employee_id);
CREATE INDEX idx_employee_deductions_type ON payroll.employee_deductions(deduction_type_id);
```

---

## 3. Direct Deposit Tables

### 3.1 Bank Accounts

```sql
CREATE TABLE payroll.direct_deposit_accounts (
    account_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID NOT NULL,                      -- HR employee reference

    -- Bank info
    bank_name           VARCHAR(100) NOT NULL,
    routing_number      VARCHAR(9) NOT NULL,                -- ABA routing
    account_number_encrypted BYTEA NOT NULL,                -- Encrypted
    account_number_last4 CHAR(4) NOT NULL,                  -- For display
    account_type        VARCHAR(20) NOT NULL,               -- checking, savings

    -- Allocation
    allocation_type     VARCHAR(20) NOT NULL,               -- percent, fixed, remainder
    allocation_amount   DECIMAL(10, 2),                     -- If fixed
    allocation_percent  DECIMAL(5, 2),                      -- If percent
    priority            INTEGER NOT NULL,                   -- 1 = primary

    -- Verification
    is_verified         BOOLEAN DEFAULT false,
    verified_at         TIMESTAMPTZ,
    verification_method VARCHAR(20),                        -- micro_deposit, instant

    -- Status
    status              VARCHAR(20) DEFAULT 'active',       -- active, pending, inactive

    -- Metadata
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_direct_deposit_employee ON payroll.direct_deposit_accounts(employee_id);
```

### 3.2 Direct Deposit Audit

```sql
CREATE TABLE payroll.direct_deposit_audit (
    audit_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID NOT NULL,
    account_id          UUID REFERENCES payroll.direct_deposit_accounts(account_id),
    action              VARCHAR(20) NOT NULL,               -- created, updated, deleted
    old_values          JSONB,
    new_values          JSONB,
    changed_by          UUID NOT NULL,
    changed_at          TIMESTAMPTZ DEFAULT NOW(),
    ip_address          INET
);

CREATE INDEX idx_dd_audit_employee ON payroll.direct_deposit_audit(employee_id);
CREATE INDEX idx_dd_audit_date ON payroll.direct_deposit_audit(changed_at);
```

---

## 4. Contractor (1099) Tables

### 4.1 Contractors

```sql
CREATE TABLE payroll.contractors (
    contractor_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_number   VARCHAR(20) NOT NULL UNIQUE,        -- CON-001

    -- Personal/Business info
    contractor_type     VARCHAR(20) NOT NULL,               -- individual, business
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    business_name       VARCHAR(200),
    display_name        VARCHAR(200) NOT NULL,

    -- Contact
    email               VARCHAR(255) NOT NULL,
    phone               VARCHAR(20),
    address_line1       VARCHAR(255),
    address_line2       VARCHAR(255),
    city                VARCHAR(100),
    state               CHAR(2),
    zip_code            VARCHAR(10),

    -- Tax info
    tax_id_type         VARCHAR(10) NOT NULL,               -- ssn, ein
    tax_id_encrypted    BYTEA NOT NULL,                     -- Encrypted SSN/EIN
    tax_id_last4        CHAR(4) NOT NULL,                   -- For display
    w9_on_file          BOOLEAN DEFAULT false,
    w9_signed_date      DATE,

    -- Payment
    default_payment_method VARCHAR(20) DEFAULT 'check',     -- check, direct_deposit
    bank_account_id     UUID REFERENCES payroll.direct_deposit_accounts(account_id),

    -- Status
    status              VARCHAR(20) DEFAULT 'active',       -- active, inactive, terminated

    -- Metadata
    start_date          DATE,
    end_date            DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contractors_status ON payroll.contractors(status);
CREATE INDEX idx_contractors_name ON payroll.contractors USING GIN(to_tsvector('english', display_name));
```

### 4.2 Contractor Payments

```sql
CREATE TABLE payroll.contractor_payments (
    payment_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id       UUID REFERENCES payroll.contractors(contractor_id) NOT NULL,

    -- Payment details
    payment_date        DATE NOT NULL,
    amount              DECIMAL(10, 2) NOT NULL,
    description         VARCHAR(500),
    invoice_number      VARCHAR(50),

    -- Payment method
    payment_method      VARCHAR(20) NOT NULL,               -- check, direct_deposit, wire
    check_number        VARCHAR(20),
    ach_trace_number    VARCHAR(50),

    -- Status
    status              VARCHAR(20) DEFAULT 'pending',      -- pending, processed, cancelled

    -- Metadata
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID
);

CREATE INDEX idx_contractor_payments_contractor ON payroll.contractor_payments(contractor_id);
CREATE INDEX idx_contractor_payments_date ON payroll.contractor_payments(payment_date);
CREATE INDEX idx_contractor_payments_year ON payroll.contractor_payments(EXTRACT(YEAR FROM payment_date));
```

### 4.3 1099 Forms

```sql
CREATE TABLE payroll.form_1099 (
    form_1099_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id       UUID REFERENCES payroll.contractors(contractor_id) NOT NULL,
    tax_year            INTEGER NOT NULL,

    -- Box amounts (1099-NEC)
    box1_nonemployee_compensation DECIMAL(12, 2) DEFAULT 0,
    box4_federal_tax_withheld DECIMAL(12, 2) DEFAULT 0,     -- Usually 0 for contractors

    -- Status
    status              VARCHAR(20) DEFAULT 'draft',        -- draft, generated, filed, corrected
    generated_at        TIMESTAMPTZ,
    filed_at            TIMESTAMPTZ,
    filed_confirmation  VARCHAR(100),

    -- PDF storage
    pdf_url             VARCHAR(500),

    -- Corrections
    is_corrected        BOOLEAN DEFAULT false,
    original_form_id    UUID REFERENCES payroll.form_1099(form_1099_id),

    -- Metadata
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(contractor_id, tax_year) WHERE NOT is_corrected
);

CREATE INDEX idx_1099_contractor ON payroll.form_1099(contractor_id);
CREATE INDEX idx_1099_year ON payroll.form_1099(tax_year);
CREATE INDEX idx_1099_status ON payroll.form_1099(status);
```

---

## 5. State Tax Tables

### 5.1 State Tax Rates

```sql
CREATE TABLE payroll.state_tax_rates (
    rate_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state               CHAR(2) NOT NULL,
    tax_year            INTEGER NOT NULL,

    -- Income tax
    has_income_tax      BOOLEAN DEFAULT true,
    income_tax_type     VARCHAR(20),                        -- progressive, flat, none
    flat_rate           DECIMAL(6, 4),                      -- If flat rate state

    -- Progressive brackets (if applicable)
    brackets            JSONB,                              -- Array of {min, max, rate, base}

    -- Other state taxes
    has_sdi             BOOLEAN DEFAULT false,              -- State Disability Insurance
    sdi_rate            DECIMAL(6, 4),
    sdi_wage_base       DECIMAL(12, 2),

    has_sui             BOOLEAN DEFAULT false,              -- State Unemployment (employer)
    sui_rate            DECIMAL(6, 4),
    sui_wage_base       DECIMAL(12, 2),

    -- Standard deduction / exemptions
    standard_deduction  DECIMAL(10, 2),
    personal_exemption  DECIMAL(10, 2),

    effective_date      DATE NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(state, tax_year)
);

-- Seed data for key states (2024)
INSERT INTO payroll.state_tax_rates (state, tax_year, has_income_tax, income_tax_type, brackets, has_sdi, sdi_rate, sdi_wage_base, effective_date) VALUES
(
    'CA', 2024, true, 'progressive',
    '[
        {"min": 0, "max": 10412, "rate": 0.01, "base": 0},
        {"min": 10412, "max": 24684, "rate": 0.02, "base": 104.12},
        {"min": 24684, "max": 38959, "rate": 0.04, "base": 389.56},
        {"min": 38959, "max": 54081, "rate": 0.06, "base": 960.56},
        {"min": 54081, "max": 68350, "rate": 0.08, "base": 1867.88},
        {"min": 68350, "max": 349137, "rate": 0.093, "base": 3009.40},
        {"min": 349137, "max": 418961, "rate": 0.103, "base": 29122.59},
        {"min": 418961, "max": 698271, "rate": 0.113, "base": 36314.46},
        {"min": 698271, "max": 1000000, "rate": 0.123, "base": 67876.51},
        {"min": 1000000, "max": null, "rate": 0.133, "base": 104987.18}
    ]'::jsonb,
    true, 0.009, 153164, '2024-01-01'
),
('TX', 2024, false, 'none', NULL, false, NULL, NULL, '2024-01-01'),
('FL', 2024, false, 'none', NULL, false, NULL, NULL, '2024-01-01'),
('NY', 2024, true, 'progressive',
    '[
        {"min": 0, "max": 8500, "rate": 0.04, "base": 0},
        {"min": 8500, "max": 11700, "rate": 0.045, "base": 340},
        {"min": 11700, "max": 13900, "rate": 0.0525, "base": 484},
        {"min": 13900, "max": 80650, "rate": 0.0585, "base": 600},
        {"min": 80650, "max": 215400, "rate": 0.0625, "base": 4504},
        {"min": 215400, "max": 1077550, "rate": 0.0685, "base": 12926},
        {"min": 1077550, "max": 5000000, "rate": 0.0965, "base": 71984},
        {"min": 5000000, "max": 25000000, "rate": 0.103, "base": 450500},
        {"min": 25000000, "max": null, "rate": 0.109, "base": 2510500}
    ]'::jsonb,
    false, NULL, NULL, '2024-01-01'
),
('CO', 2024, true, 'flat', NULL, false, NULL, NULL, '2024-01-01');

UPDATE payroll.state_tax_rates SET flat_rate = 0.044 WHERE state = 'CO';
```

---

## 6. Row-Level Security Policies

### 6.1 Pay Stub Policies

```sql
ALTER TABLE payroll.pay_stubs ENABLE ROW LEVEL SECURITY;

-- Employees can see their own pay stubs
CREATE POLICY pay_stubs_select_own ON payroll.pay_stubs
    FOR SELECT
    USING (employee_id = current_setting('app.current_user_id')::uuid);

-- Payroll admin can see all pay stubs
CREATE POLICY pay_stubs_select_admin ON payroll.pay_stubs
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%payroll-read%');

-- Executives can see all pay stubs
CREATE POLICY pay_stubs_select_executive ON payroll.pay_stubs
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%executive%');
```

### 6.2 Direct Deposit Policies

```sql
ALTER TABLE payroll.direct_deposit_accounts ENABLE ROW LEVEL SECURITY;

-- Employees can see their own accounts
CREATE POLICY direct_deposit_select_own ON payroll.direct_deposit_accounts
    FOR SELECT
    USING (employee_id = current_setting('app.current_user_id')::uuid);

-- Employees can update their own accounts
CREATE POLICY direct_deposit_update_own ON payroll.direct_deposit_accounts
    FOR UPDATE
    USING (employee_id = current_setting('app.current_user_id')::uuid);

-- Payroll admin can manage all
CREATE POLICY direct_deposit_admin ON payroll.direct_deposit_accounts
    FOR ALL
    USING (current_setting('app.current_user_roles', true) LIKE '%payroll-write%');
```

---

## 7. Sample Data Requirements

### 7.1 Pay Run Data

```
2024 Pay Runs (completed):
- PR-2024-001: Jan 1-14, paid Jan 19
- PR-2024-002: Jan 15-28, paid Feb 2
- ... (26 pay periods)

Totals per run (approx):
- Gross Pay: $400,000 - $450,000
- Net Pay: $250,000 - $280,000
- Employees: 54
```

### 7.2 Employee Distribution by State

| State | Employees | % of Payroll |
|-------|-----------|--------------|
| CA | 27 | 55% |
| TX | 10 | 18% |
| NY | 5 | 12% |
| FL | 3 | 5% |
| CO | 3 | 4% |
| Other | 6 | 6% |

### 7.3 Contractor Data

| Contractor | YTD Payments | 1099 Required |
|------------|--------------|---------------|
| Consultant A | $25,000 | Yes |
| Consultant B | $12,000 | Yes |
| Vendor C | $500 | No (<$600) |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial Payroll data model |
