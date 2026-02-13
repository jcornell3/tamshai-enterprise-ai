# Tax Application Data Model

## 1. Overview

This document defines the database schema for the Tax application. All data is stored in PostgreSQL with Row-Level Security (RLS) policies.

**Database**: `tamshai_tax`
**Schema**: `tax`

---

## 2. Sales Tax Tables

### 2.1 Tax Jurisdictions

```sql
CREATE TABLE tax.jurisdictions (
    jurisdiction_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state               CHAR(2) NOT NULL,
    county              VARCHAR(100),
    city                VARCHAR(100),
    jurisdiction_code   VARCHAR(20) NOT NULL UNIQUE,        -- State-assigned code
    jurisdiction_name   VARCHAR(200) NOT NULL,
    jurisdiction_type   VARCHAR(20) NOT NULL,               -- state, county, city, district

    -- Tax rates
    rate                DECIMAL(6, 4) NOT NULL,             -- e.g., 0.0625 for 6.25%
    rate_effective_date DATE NOT NULL,

    -- Sourcing rules
    sourcing_rule       VARCHAR(20) NOT NULL,               -- origin, destination

    -- Status
    active              BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jurisdictions_state ON tax.jurisdictions(state);
CREATE INDEX idx_jurisdictions_code ON tax.jurisdictions(jurisdiction_code);

-- Seed data for key jurisdictions
INSERT INTO tax.jurisdictions (state, jurisdiction_name, jurisdiction_type, rate, rate_effective_date, sourcing_rule, jurisdiction_code) VALUES
    ('CA', 'California', 'state', 0.0600, '2024-01-01', 'destination', 'CA'),
    ('NY', 'New York', 'state', 0.0400, '2024-01-01', 'destination', 'NY'),
    ('TX', 'Texas', 'state', 0.0625, '2024-01-01', 'origin', 'TX'),
    ('FL', 'Florida', 'state', 0.0600, '2024-01-01', 'destination', 'FL');
```

### 2.2 Tax Rate History

```sql
CREATE TABLE tax.rate_history (
    rate_history_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id     UUID REFERENCES tax.jurisdictions(jurisdiction_id) NOT NULL,
    old_rate            DECIMAL(6, 4) NOT NULL,
    new_rate            DECIMAL(6, 4) NOT NULL,
    effective_date      DATE NOT NULL,
    source              VARCHAR(100),                       -- Reference to legal authority
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_history_jurisdiction ON tax.rate_history(jurisdiction_id);
CREATE INDEX idx_rate_history_date ON tax.rate_history(effective_date);
```

### 2.3 Product Taxability

```sql
CREATE TABLE tax.product_taxability (
    taxability_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state               CHAR(2) NOT NULL,
    product_category    VARCHAR(50) NOT NULL,               -- saas, digital_goods, services, etc.

    is_taxable          BOOLEAN NOT NULL,
    tax_type            VARCHAR(30),                        -- sales, use, communications, etc.
    special_rate        DECIMAL(6, 4),                      -- If different from standard rate
    exemption_code      VARCHAR(20),

    -- Legal reference
    statute_reference   VARCHAR(200),
    effective_date      DATE NOT NULL,
    notes               TEXT,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(state, product_category)
);

-- Seed data for SaaS taxability by state
INSERT INTO tax.product_taxability (state, product_category, is_taxable, statute_reference, effective_date) VALUES
    ('CA', 'saas', true, 'Revenue and Taxation Code Section 6016', '2024-01-01'),
    ('NY', 'saas', true, 'Tax Law Section 1105(c)(9)', '2024-01-01'),
    ('TX', 'saas', false, 'Texas Tax Code Section 151.0101', '2024-01-01'),
    ('FL', 'saas', false, 'Florida Statute 212.08', '2024-01-01'),
    ('WA', 'saas', true, 'RCW 82.04.050', '2024-01-01'),
    ('PA', 'saas', true, '72 P.S. Section 7201', '2024-01-01'),
    ('AZ', 'saas', false, 'A.R.S. Section 42-5061', '2024-01-01');
```

---

## 3. Nexus Tables

### 3.1 Nexus Status

```sql
CREATE TABLE tax.nexus_status (
    nexus_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state               CHAR(2) NOT NULL,
    tax_year            INTEGER NOT NULL,

    -- Nexus type
    has_physical_nexus  BOOLEAN DEFAULT false,
    has_economic_nexus  BOOLEAN DEFAULT false,
    physical_presence   TEXT,                               -- Description of physical presence

    -- Economic nexus tracking
    revenue_ytd         DECIMAL(12, 2) DEFAULT 0,
    transaction_count   INTEGER DEFAULT 0,
    threshold_revenue   DECIMAL(12, 2),                     -- State threshold
    threshold_transactions INTEGER,                         -- State threshold (alternative)
    threshold_percent   DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE WHEN threshold_revenue > 0
             THEN (revenue_ytd / threshold_revenue) * 100
             ELSE 0
        END
    ) STORED,

    -- Registration
    is_registered       BOOLEAN DEFAULT false,
    registration_id     VARCHAR(50),
    registration_date   DATE,
    filing_frequency    VARCHAR(20),                        -- monthly, quarterly, annual

    -- Status
    status              VARCHAR(20) DEFAULT 'monitoring',   -- monitoring, approaching, registered, closed

    -- Dates
    effective_date      DATE,
    closed_date         DATE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(state, tax_year)
);

CREATE INDEX idx_nexus_status_state ON tax.nexus_status(state);
CREATE INDEX idx_nexus_status_year ON tax.nexus_status(tax_year);
CREATE INDEX idx_nexus_status_threshold ON tax.nexus_status(threshold_percent) WHERE threshold_percent > 80;
```

### 3.2 State Thresholds

```sql
CREATE TABLE tax.economic_nexus_thresholds (
    threshold_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state               CHAR(2) NOT NULL UNIQUE,
    revenue_threshold   DECIMAL(12, 2),                     -- e.g., $100,000
    transaction_threshold INTEGER,                          -- e.g., 200 transactions
    threshold_type      VARCHAR(20) NOT NULL,               -- revenue_only, transactions_only, either, both
    measurement_period  VARCHAR(20) DEFAULT 'calendar_year', -- calendar_year, trailing_12_months
    effective_date      DATE NOT NULL,
    source_reference    VARCHAR(200),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data (2024 thresholds)
INSERT INTO tax.economic_nexus_thresholds (state, revenue_threshold, transaction_threshold, threshold_type, effective_date) VALUES
    ('CA', 500000, NULL, 'revenue_only', '2024-01-01'),
    ('NY', 500000, 100, 'either', '2024-01-01'),
    ('TX', 500000, NULL, 'revenue_only', '2024-01-01'),
    ('FL', 100000, NULL, 'revenue_only', '2024-01-01'),
    ('WA', 100000, NULL, 'revenue_only', '2024-01-01'),
    ('PA', 100000, NULL, 'revenue_only', '2024-01-01'),
    ('CO', 100000, NULL, 'revenue_only', '2024-01-01'),
    ('AZ', 100000, NULL, 'revenue_only', '2024-01-01');
```

---

## 4. Exemption Tables

### 4.1 Exemption Certificates

```sql
CREATE TABLE tax.exemption_certificates (
    certificate_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL,                      -- Finance customer reference
    customer_name       VARCHAR(200) NOT NULL,

    -- Certificate details
    state               CHAR(2) NOT NULL,
    certificate_number  VARCHAR(50),
    exemption_type      VARCHAR(50) NOT NULL,               -- resale, government, non_profit, manufacturing, etc.
    exemption_reason    VARCHAR(200),

    -- Validity
    valid_from          DATE NOT NULL,
    valid_until         DATE,                               -- NULL = no expiration
    is_single_use       BOOLEAN DEFAULT false,

    -- Document
    document_url        VARCHAR(500),                       -- MinIO path
    document_uploaded_at TIMESTAMPTZ,

    -- Status
    status              VARCHAR(20) DEFAULT 'pending',      -- pending, valid, expired, revoked

    -- Verification
    verified_at         TIMESTAMPTZ,
    verified_by         UUID,

    -- Metadata
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exemption_certs_customer ON tax.exemption_certificates(customer_id);
CREATE INDEX idx_exemption_certs_state ON tax.exemption_certificates(state);
CREATE INDEX idx_exemption_certs_expiry ON tax.exemption_certificates(valid_until) WHERE valid_until IS NOT NULL;
CREATE INDEX idx_exemption_certs_status ON tax.exemption_certificates(status);
```

### 4.2 Exemption Usage Log

```sql
CREATE TABLE tax.exemption_usage (
    usage_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id      UUID REFERENCES tax.exemption_certificates(certificate_id) NOT NULL,
    invoice_id          UUID NOT NULL,                      -- Finance invoice reference
    invoice_number      VARCHAR(30),
    invoice_date        DATE NOT NULL,
    exempt_amount       DECIMAL(12, 2) NOT NULL,
    tax_avoided         DECIMAL(10, 2) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exemption_usage_cert ON tax.exemption_usage(certificate_id);
CREATE INDEX idx_exemption_usage_invoice ON tax.exemption_usage(invoice_id);
```

---

## 5. Filing Tables

### 5.1 Filing Calendar

```sql
CREATE TABLE tax.filing_deadlines (
    deadline_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state               CHAR(2) NOT NULL,
    tax_type            VARCHAR(30) NOT NULL,               -- sales_tax, income_tax, franchise_tax, etc.
    form_name           VARCHAR(50),                        -- e.g., "Form 540", "Sales Tax Return"

    -- Period
    tax_year            INTEGER NOT NULL,
    period_type         VARCHAR(20) NOT NULL,               -- monthly, quarterly, annual
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,

    -- Dates
    original_due_date   DATE NOT NULL,
    extended_due_date   DATE,
    actual_filed_date   DATE,

    -- Amounts
    tax_amount          DECIMAL(12, 2),
    payment_amount      DECIMAL(12, 2),
    payment_date        DATE,
    payment_method      VARCHAR(20),                        -- ach, check, eft

    -- Status
    status              VARCHAR(20) DEFAULT 'upcoming',     -- upcoming, due_soon, overdue, filed, extended

    -- Filing details
    confirmation_number VARCHAR(50),
    filed_by            UUID,
    notes               TEXT,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(state, tax_type, tax_year, period_start)
);

CREATE INDEX idx_filing_deadlines_state ON tax.filing_deadlines(state);
CREATE INDEX idx_filing_deadlines_due ON tax.filing_deadlines(original_due_date);
CREATE INDEX idx_filing_deadlines_status ON tax.filing_deadlines(status);
CREATE INDEX idx_filing_deadlines_year ON tax.filing_deadlines(tax_year);
```

### 5.2 Quarterly Estimates

```sql
CREATE TABLE tax.quarterly_estimates (
    estimate_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_year            INTEGER NOT NULL,
    quarter             INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    tax_type            VARCHAR(30) NOT NULL,               -- federal, state_ca, state_ny, etc.

    -- Estimate calculation
    estimated_income    DECIMAL(12, 2),
    estimated_tax       DECIMAL(12, 2) NOT NULL,
    safe_harbor_amount  DECIMAL(12, 2),                     -- 110% of prior year

    -- Payment
    due_date            DATE NOT NULL,
    paid_date           DATE,
    paid_amount         DECIMAL(12, 2) DEFAULT 0,
    payment_method      VARCHAR(20),
    payment_reference   VARCHAR(50),

    -- Status
    status              VARCHAR(20) DEFAULT 'pending',      -- pending, paid, underpaid, overpaid

    -- Adjustments
    prior_year_overpayment DECIMAL(12, 2) DEFAULT 0,
    adjustment_amount   DECIMAL(12, 2) DEFAULT 0,
    adjustment_reason   TEXT,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tax_year, quarter, tax_type)
);

CREATE INDEX idx_quarterly_estimates_year ON tax.quarterly_estimates(tax_year);
CREATE INDEX idx_quarterly_estimates_due ON tax.quarterly_estimates(due_date);
```

---

## 6. Audit Tables

### 6.1 Tax Transactions

```sql
CREATE TABLE tax.transactions (
    transaction_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          UUID NOT NULL,                      -- Finance invoice reference
    invoice_number      VARCHAR(30),
    invoice_date        DATE NOT NULL,

    -- Customer
    customer_id         UUID NOT NULL,
    customer_name       VARCHAR(200),

    -- Location
    ship_to_state       CHAR(2) NOT NULL,
    ship_to_city        VARCHAR(100),
    ship_to_zip         VARCHAR(10),

    -- Amounts
    taxable_amount      DECIMAL(12, 2) NOT NULL,
    exempt_amount       DECIMAL(12, 2) DEFAULT 0,
    non_taxable_amount  DECIMAL(12, 2) DEFAULT 0,

    -- Tax calculated
    state_tax           DECIMAL(10, 2) DEFAULT 0,
    county_tax          DECIMAL(10, 2) DEFAULT 0,
    city_tax            DECIMAL(10, 2) DEFAULT 0,
    district_tax        DECIMAL(10, 2) DEFAULT 0,
    total_tax           DECIMAL(10, 2) GENERATED ALWAYS AS (
        state_tax + county_tax + city_tax + district_tax
    ) STORED,
    effective_rate      DECIMAL(6, 4),

    -- Exemption
    exemption_certificate_id UUID REFERENCES tax.exemption_certificates(certificate_id),
    exemption_reason    VARCHAR(100),

    -- Product info
    product_category    VARCHAR(50),
    is_saas             BOOLEAN DEFAULT true,

    -- Audit
    calculation_details JSONB,                              -- Full rate breakdown
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tax_transactions_invoice ON tax.transactions(invoice_id);
CREATE INDEX idx_tax_transactions_customer ON tax.transactions(customer_id);
CREATE INDEX idx_tax_transactions_date ON tax.transactions(invoice_date);
CREATE INDEX idx_tax_transactions_state ON tax.transactions(ship_to_state);
```

### 6.2 Audit Log

```sql
CREATE TABLE tax.audit_log (
    audit_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type         VARCHAR(50) NOT NULL,               -- transaction, exemption, filing, rate, etc.
    entity_id           UUID NOT NULL,
    action              VARCHAR(20) NOT NULL,               -- created, updated, deleted, filed, approved
    description         TEXT,

    -- Change details
    old_values          JSONB,
    new_values          JSONB,

    -- Actor
    performed_by        UUID,
    performed_by_name   VARCHAR(200),
    performed_at        TIMESTAMPTZ DEFAULT NOW(),

    -- Context
    ip_address          INET,
    user_agent          TEXT
);

CREATE INDEX idx_tax_audit_entity ON tax.audit_log(entity_type, entity_id);
CREATE INDEX idx_tax_audit_date ON tax.audit_log(performed_at);
CREATE INDEX idx_tax_audit_actor ON tax.audit_log(performed_by);
```

---

## 7. Liability Tables

### 7.1 Tax Liabilities

```sql
CREATE TABLE tax.liabilities (
    liability_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state               CHAR(2) NOT NULL,
    tax_type            VARCHAR(30) NOT NULL,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,

    -- Amounts
    tax_collected       DECIMAL(12, 2) DEFAULT 0,
    tax_owed            DECIMAL(12, 2) DEFAULT 0,
    tax_paid            DECIMAL(12, 2) DEFAULT 0,
    balance             DECIMAL(12, 2) GENERATED ALWAYS AS (
        tax_owed - tax_paid
    ) STORED,

    -- Status
    status              VARCHAR(20) DEFAULT 'accrued',      -- accrued, due, paid, overpaid

    -- Payment tracking
    due_date            DATE,
    paid_date           DATE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(state, tax_type, period_start)
);

CREATE INDEX idx_liabilities_state ON tax.liabilities(state);
CREATE INDEX idx_liabilities_period ON tax.liabilities(period_start, period_end);
CREATE INDEX idx_liabilities_due ON tax.liabilities(due_date) WHERE status IN ('accrued', 'due');
```

### 7.2 Liability Summary View

```sql
CREATE VIEW tax.liability_summary AS
SELECT
    state,
    tax_type,
    SUM(balance) as total_balance,
    COUNT(*) FILTER (WHERE status = 'due') as periods_due,
    MIN(due_date) FILTER (WHERE status IN ('accrued', 'due')) as next_due_date
FROM tax.liabilities
WHERE status IN ('accrued', 'due')
GROUP BY state, tax_type;
```

---

## 8. Row-Level Security Policies

### 8.1 Transaction Policies

```sql
ALTER TABLE tax.transactions ENABLE ROW LEVEL SECURITY;

-- Tax team can see all transactions
CREATE POLICY transactions_select_tax ON tax.transactions
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%tax-read%');

-- Finance team can see transactions
CREATE POLICY transactions_select_finance ON tax.transactions
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%finance-read%');

-- Executives can see all
CREATE POLICY transactions_select_executive ON tax.transactions
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%executive%');
```

### 8.2 Filing Policies

```sql
ALTER TABLE tax.filing_deadlines ENABLE ROW LEVEL SECURITY;

-- Tax team can see all filings
CREATE POLICY filings_select_tax ON tax.filing_deadlines
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%tax-read%');

-- Only tax-write can modify
CREATE POLICY filings_modify_tax ON tax.filing_deadlines
    FOR ALL
    USING (current_setting('app.current_user_roles', true) LIKE '%tax-write%');
```

---

## 9. Sample Data Requirements

### 9.1 State Distribution

| State | Status | Registration ID | Filing Freq |
|-------|--------|-----------------|-------------|
| CA | Registered | 123-456-789 | Quarterly |
| NY | Registered | 98-7654321 | Monthly |
| TX | Registered | 32-123456-7 | Quarterly |
| WA | Registered | 601-234-567 | Monthly |
| FL | Monitoring | - | - |
| CO | Approaching | - | - |

### 9.2 Transaction Volume

```
Monthly sales by state (typical):
- CA: $150,000 (30%)
- NY: $100,000 (20%)
- TX: $80,000 (16%)
- WA: $50,000 (10%)
- Other: $120,000 (24%)
Total: $500,000/month

Tax collected (where applicable):
- CA: $12,000 (8% avg)
- NY: $8,000 (8% avg)
- WA: $5,000 (10% avg)
Total: ~$25,000/month
```

### 9.3 Filing Calendar Sample

| Deadline | State | Type | Due Date | Status |
|----------|-------|------|----------|--------|
| Q4 Sales Tax | CA | Sales | Mar 31 | Upcoming |
| Jan Sales Tax | NY | Sales | Feb 28 | Due Soon |
| Q4 Sales Tax | TX | Sales | Apr 30 | Upcoming |
| Annual Reconciliation | CA | Sales | Apr 15 | Upcoming |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial Tax data model |
