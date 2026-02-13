# Finance Application Data Model

## 1. Overview

This document defines the database schema for the Finance application. All data is stored in PostgreSQL with Row-Level Security (RLS) policies.

**Database**: `tamshai_finance`
**Schema**: `finance`

---

## 2. Revenue & SaaS Tables

### 2.1 Customers

```sql
CREATE TABLE finance.customers (
    customer_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id         VARCHAR(50) UNIQUE,                 -- CRM reference
    name                VARCHAR(200) NOT NULL,
    legal_name          VARCHAR(200),
    billing_email       VARCHAR(255),
    billing_address     JSONB,                              -- Structured address
    tax_id              VARCHAR(50),                        -- EIN for US customers
    payment_terms       INTEGER DEFAULT 30,                 -- Net days
    credit_limit        DECIMAL(12, 2),
    status              VARCHAR(20) DEFAULT 'active',       -- active, inactive, suspended
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_status ON finance.customers(status);
CREATE INDEX idx_customers_name ON finance.customers USING GIN(to_tsvector('english', name));
```

### 2.2 Subscriptions (SaaS ARR Source)

```sql
CREATE TABLE finance.subscriptions (
    subscription_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID REFERENCES finance.customers(customer_id) NOT NULL,
    plan_id             UUID REFERENCES finance.plans(plan_id) NOT NULL,

    -- Billing details
    mrr                 DECIMAL(10, 2) NOT NULL,            -- Monthly recurring revenue
    arr                 DECIMAL(12, 2) GENERATED ALWAYS AS (mrr * 12) STORED,
    billing_cycle       VARCHAR(20) DEFAULT 'monthly',      -- monthly, quarterly, annual
    billing_day         INTEGER,                            -- Day of month for billing

    -- Dates
    start_date          DATE NOT NULL,
    end_date            DATE,                               -- NULL = ongoing
    trial_end_date      DATE,
    next_billing_date   DATE,

    -- Status
    status              VARCHAR(20) DEFAULT 'active',       -- trial, active, cancelled, churned

    -- Metadata
    quantity            INTEGER DEFAULT 1,                  -- Seat count
    discount_percent    DECIMAL(5, 2),
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_customer ON finance.subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON finance.subscriptions(status);
CREATE INDEX idx_subscriptions_dates ON finance.subscriptions(start_date, end_date);
```

### 2.3 Plans

```sql
CREATE TABLE finance.plans (
    plan_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL,
    code                VARCHAR(20) NOT NULL UNIQUE,
    description         TEXT,

    -- Pricing
    base_price_monthly  DECIMAL(10, 2) NOT NULL,
    base_price_annual   DECIMAL(10, 2),                     -- NULL = monthly * 12
    price_per_seat      DECIMAL(10, 2),
    setup_fee           DECIMAL(10, 2),

    -- Features
    features            JSONB,                              -- Feature flags
    max_users           INTEGER,
    max_storage_gb      INTEGER,

    status              VARCHAR(20) DEFAULT 'active',
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.4 ARR Snapshots (Monthly Tracking)

```sql
CREATE TABLE finance.arr_snapshots (
    snapshot_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date       DATE NOT NULL,
    period_type         VARCHAR(10) NOT NULL,               -- daily, monthly

    -- ARR components
    starting_arr        DECIMAL(12, 2) NOT NULL,
    new_arr             DECIMAL(12, 2) DEFAULT 0,           -- New customers
    expansion_arr       DECIMAL(12, 2) DEFAULT 0,           -- Upgrades
    contraction_arr     DECIMAL(12, 2) DEFAULT 0,           -- Downgrades (negative)
    churn_arr           DECIMAL(12, 2) DEFAULT 0,           -- Lost customers (negative)
    ending_arr          DECIMAL(12, 2) GENERATED ALWAYS AS
        (starting_arr + new_arr + expansion_arr + contraction_arr + churn_arr) STORED,

    -- Derived metrics
    net_new_arr         DECIMAL(12, 2) GENERATED ALWAYS AS
        (new_arr + expansion_arr + contraction_arr + churn_arr) STORED,
    gross_retention_rate DECIMAL(5, 4),                     -- (Starting - Churn) / Starting
    net_retention_rate  DECIMAL(5, 4),                      -- (Starting + Exp + Contr - Churn) / Starting

    -- Customer counts
    starting_customers  INTEGER,
    new_customers       INTEGER DEFAULT 0,
    churned_customers   INTEGER DEFAULT 0,
    ending_customers    INTEGER,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(snapshot_date, period_type)
);

CREATE INDEX idx_arr_snapshots_date ON finance.arr_snapshots(snapshot_date);
```

---

## 3. Invoice Tables

### 3.1 Invoices

```sql
CREATE TABLE finance.invoices (
    invoice_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number      VARCHAR(30) NOT NULL UNIQUE,        -- INV-2024-0001
    customer_id         UUID REFERENCES finance.customers(customer_id) NOT NULL,
    subscription_id     UUID REFERENCES finance.subscriptions(subscription_id),
    opportunity_id      VARCHAR(50),                        -- Sales CRM reference

    -- Dates
    invoice_date        DATE NOT NULL,
    due_date            DATE NOT NULL,
    paid_date           DATE,

    -- Amounts
    subtotal            DECIMAL(12, 2) NOT NULL,
    tax_amount          DECIMAL(12, 2) DEFAULT 0,
    total               DECIMAL(12, 2) GENERATED ALWAYS AS (subtotal + tax_amount) STORED,
    amount_paid         DECIMAL(12, 2) DEFAULT 0,
    balance_due         DECIMAL(12, 2) GENERATED ALWAYS AS (subtotal + tax_amount - amount_paid) STORED,

    -- Tax info
    tax_rate            DECIMAL(5, 4),
    tax_jurisdiction    VARCHAR(50),

    -- Status
    status              VARCHAR(20) DEFAULT 'draft',        -- draft, sent, paid, partial, overdue, void
    payment_terms       INTEGER DEFAULT 30,

    -- Billing details
    billing_address     JSONB,
    billing_contact     JSONB,
    purchase_order      VARCHAR(50),

    -- Revenue recognition
    revenue_start_date  DATE,
    revenue_end_date    DATE,
    deferred_revenue    DECIMAL(12, 2) DEFAULT 0,

    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID
);

CREATE INDEX idx_invoices_customer ON finance.invoices(customer_id);
CREATE INDEX idx_invoices_status ON finance.invoices(status);
CREATE INDEX idx_invoices_dates ON finance.invoices(invoice_date, due_date);
CREATE INDEX idx_invoices_number ON finance.invoices(invoice_number);
```

### 3.2 Invoice Line Items

```sql
CREATE TABLE finance.invoice_line_items (
    line_item_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          UUID REFERENCES finance.invoices(invoice_id) NOT NULL,
    line_number         INTEGER NOT NULL,

    description         VARCHAR(500) NOT NULL,
    quantity            DECIMAL(10, 4) NOT NULL DEFAULT 1,
    unit_price          DECIMAL(10, 2) NOT NULL,
    amount              DECIMAL(12, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,

    -- Categorization
    revenue_category    VARCHAR(50),                        -- subscription, services, other
    product_id          UUID,
    service_period_start DATE,
    service_period_end  DATE,

    tax_exempt          BOOLEAN DEFAULT false,

    UNIQUE(invoice_id, line_number)
);

CREATE INDEX idx_invoice_line_items_invoice ON finance.invoice_line_items(invoice_id);
```

### 3.3 Payments

```sql
CREATE TABLE finance.payments (
    payment_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          UUID REFERENCES finance.invoices(invoice_id),
    customer_id         UUID REFERENCES finance.customers(customer_id) NOT NULL,

    payment_date        DATE NOT NULL,
    amount              DECIMAL(12, 2) NOT NULL,
    payment_method      VARCHAR(30) NOT NULL,               -- check, wire, ach, credit_card
    reference_number    VARCHAR(100),                       -- Check #, transaction ID

    -- Bank reconciliation
    bank_transaction_id UUID,
    reconciled          BOOLEAN DEFAULT false,
    reconciled_at       TIMESTAMPTZ,

    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID
);

CREATE INDEX idx_payments_invoice ON finance.payments(invoice_id);
CREATE INDEX idx_payments_customer ON finance.payments(customer_id);
CREATE INDEX idx_payments_date ON finance.payments(payment_date);
CREATE INDEX idx_payments_reconciled ON finance.payments(reconciled) WHERE NOT reconciled;
```

---

## 4. Budget Tables

### 4.1 Fiscal Years

```sql
CREATE TABLE finance.fiscal_years (
    fiscal_year_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year                INTEGER NOT NULL UNIQUE,
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    status              VARCHAR(20) DEFAULT 'open',         -- planning, open, closed
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO finance.fiscal_years (year, start_date, end_date, status) VALUES
    (2024, '2024-01-01', '2024-12-31', 'closed'),
    (2025, '2025-01-01', '2025-12-31', 'open'),
    (2026, '2026-01-01', '2026-12-31', 'planning');
```

### 4.2 Budget Categories

```sql
CREATE TABLE finance.budget_categories (
    category_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL,
    code                VARCHAR(20) NOT NULL UNIQUE,
    parent_category_id  UUID REFERENCES finance.budget_categories(category_id),
    category_type       VARCHAR(20) NOT NULL,               -- revenue, expense, capex
    gl_account_prefix   VARCHAR(10),                        -- General ledger mapping
    sort_order          INTEGER,
    active              BOOLEAN DEFAULT true
);

-- Seed data
INSERT INTO finance.budget_categories (name, code, category_type, sort_order) VALUES
    ('Subscription Revenue', 'REV-SUB', 'revenue', 1),
    ('Professional Services', 'REV-SVC', 'revenue', 2),
    ('Other Revenue', 'REV-OTH', 'revenue', 3),
    ('Personnel', 'EXP-PERS', 'expense', 10),
    ('Software & Infrastructure', 'EXP-SOFT', 'expense', 20),
    ('Marketing', 'EXP-MKT', 'expense', 30),
    ('Office & Facilities', 'EXP-OFF', 'expense', 40),
    ('Professional Services', 'EXP-PRO', 'expense', 50),
    ('Travel & Entertainment', 'EXP-TRV', 'expense', 60),
    ('Equipment', 'CAP-EQ', 'capex', 100);
```

### 4.3 Budgets

```sql
CREATE TABLE finance.budgets (
    budget_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_year_id      UUID REFERENCES finance.fiscal_years(fiscal_year_id) NOT NULL,
    department_id       UUID NOT NULL,                      -- HR departments reference
    category_id         UUID REFERENCES finance.budget_categories(category_id) NOT NULL,

    -- Budget amounts by month
    jan_amount          DECIMAL(12, 2) DEFAULT 0,
    feb_amount          DECIMAL(12, 2) DEFAULT 0,
    mar_amount          DECIMAL(12, 2) DEFAULT 0,
    apr_amount          DECIMAL(12, 2) DEFAULT 0,
    may_amount          DECIMAL(12, 2) DEFAULT 0,
    jun_amount          DECIMAL(12, 2) DEFAULT 0,
    jul_amount          DECIMAL(12, 2) DEFAULT 0,
    aug_amount          DECIMAL(12, 2) DEFAULT 0,
    sep_amount          DECIMAL(12, 2) DEFAULT 0,
    oct_amount          DECIMAL(12, 2) DEFAULT 0,
    nov_amount          DECIMAL(12, 2) DEFAULT 0,
    dec_amount          DECIMAL(12, 2) DEFAULT 0,

    -- Computed total
    annual_amount       DECIMAL(12, 2) GENERATED ALWAYS AS (
        jan_amount + feb_amount + mar_amount + apr_amount +
        may_amount + jun_amount + jul_amount + aug_amount +
        sep_amount + oct_amount + nov_amount + dec_amount
    ) STORED,

    -- Approval workflow
    status              VARCHAR(20) DEFAULT 'draft',        -- draft, submitted, approved, rejected
    submitted_at        TIMESTAMPTZ,
    submitted_by        UUID,
    approved_at         TIMESTAMPTZ,
    approved_by         UUID,
    approval_comments   TEXT,

    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(fiscal_year_id, department_id, category_id)
);

CREATE INDEX idx_budgets_fiscal_year ON finance.budgets(fiscal_year_id);
CREATE INDEX idx_budgets_department ON finance.budgets(department_id);
CREATE INDEX idx_budgets_status ON finance.budgets(status);
```

### 4.4 Budget Actuals (Monthly Tracking)

```sql
CREATE TABLE finance.budget_actuals (
    actual_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id           UUID REFERENCES finance.budgets(budget_id) NOT NULL,
    month               INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year                INTEGER NOT NULL,

    actual_amount       DECIMAL(12, 2) NOT NULL,
    variance            DECIMAL(12, 2),                     -- Computed at insert
    variance_percent    DECIMAL(7, 4),

    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(budget_id, year, month)
);

CREATE INDEX idx_budget_actuals_budget ON finance.budget_actuals(budget_id);
CREATE INDEX idx_budget_actuals_period ON finance.budget_actuals(year, month);
```

---

## 5. Expense Tables

### 5.1 Expense Reports

```sql
CREATE TABLE finance.expense_reports (
    expense_report_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number       VARCHAR(30) NOT NULL UNIQUE,        -- EXP-2024-0001
    employee_id         UUID NOT NULL,                      -- HR employee reference
    department_id       UUID NOT NULL,

    -- Report details
    report_title        VARCHAR(200) NOT NULL,
    report_date         DATE NOT NULL,
    total_amount        DECIMAL(10, 2) DEFAULT 0,

    -- Status workflow
    status              VARCHAR(20) DEFAULT 'draft',        -- draft, submitted, manager_approved, finance_approved, rejected, paid
    submitted_at        TIMESTAMPTZ,
    manager_approved_at TIMESTAMPTZ,
    manager_approved_by UUID,
    finance_approved_at TIMESTAMPTZ,
    finance_approved_by UUID,
    rejected_at         TIMESTAMPTZ,
    rejected_by         UUID,
    rejection_reason    TEXT,
    paid_at             TIMESTAMPTZ,
    payment_reference   VARCHAR(100),

    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expense_reports_employee ON finance.expense_reports(employee_id);
CREATE INDEX idx_expense_reports_status ON finance.expense_reports(status);
CREATE INDEX idx_expense_reports_date ON finance.expense_reports(report_date);
```

### 5.2 Expense Items

```sql
CREATE TABLE finance.expense_items (
    expense_item_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_report_id   UUID REFERENCES finance.expense_reports(expense_report_id) NOT NULL,

    -- Expense details
    expense_date        DATE NOT NULL,
    category            VARCHAR(50) NOT NULL,               -- travel, meals, supplies, etc.
    description         VARCHAR(500) NOT NULL,
    vendor              VARCHAR(200),
    amount              DECIMAL(10, 2) NOT NULL,
    currency            CHAR(3) DEFAULT 'USD',

    -- Receipt
    receipt_url         VARCHAR(500),
    receipt_required    BOOLEAN DEFAULT true,
    receipt_uploaded    BOOLEAN DEFAULT false,

    -- Categorization
    budget_category_id  UUID REFERENCES finance.budget_categories(category_id),
    project_id          UUID,
    client_billable     BOOLEAN DEFAULT false,

    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expense_items_report ON finance.expense_items(expense_report_id);
CREATE INDEX idx_expense_items_category ON finance.expense_items(category);
CREATE INDEX idx_expense_items_date ON finance.expense_items(expense_date);

-- Update report total trigger
CREATE OR REPLACE FUNCTION update_expense_report_total()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE finance.expense_reports
    SET total_amount = (
        SELECT COALESCE(SUM(amount), 0)
        FROM finance.expense_items
        WHERE expense_report_id = COALESCE(NEW.expense_report_id, OLD.expense_report_id)
    ),
    updated_at = NOW()
    WHERE expense_report_id = COALESCE(NEW.expense_report_id, OLD.expense_report_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expense_items_total_trigger
AFTER INSERT OR UPDATE OR DELETE ON finance.expense_items
FOR EACH ROW EXECUTE FUNCTION update_expense_report_total();
```

---

## 6. Bank Reconciliation Tables

### 6.1 Bank Accounts

```sql
CREATE TABLE finance.bank_accounts (
    account_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_name        VARCHAR(100) NOT NULL,
    account_number_last4 VARCHAR(4),                        -- Masked
    bank_name           VARCHAR(100),
    account_type        VARCHAR(20),                        -- checking, savings
    currency            CHAR(3) DEFAULT 'USD',
    opening_balance     DECIMAL(14, 2),
    current_balance     DECIMAL(14, 2),
    active              BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.2 Bank Transactions

```sql
CREATE TABLE finance.bank_transactions (
    transaction_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          UUID REFERENCES finance.bank_accounts(account_id) NOT NULL,

    transaction_date    DATE NOT NULL,
    post_date           DATE,
    description         VARCHAR(500),
    amount              DECIMAL(12, 2) NOT NULL,            -- Positive = credit, Negative = debit
    balance             DECIMAL(14, 2),

    -- Reconciliation
    reconciled          BOOLEAN DEFAULT false,
    reconciled_at       TIMESTAMPTZ,
    matched_invoice_id  UUID REFERENCES finance.invoices(invoice_id),
    matched_payment_id  UUID REFERENCES finance.payments(payment_id),
    matched_expense_id  UUID REFERENCES finance.expense_items(expense_item_id),

    -- Import metadata
    import_id           VARCHAR(100),
    imported_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bank_transactions_account ON finance.bank_transactions(account_id);
CREATE INDEX idx_bank_transactions_date ON finance.bank_transactions(transaction_date);
CREATE INDEX idx_bank_transactions_unreconciled ON finance.bank_transactions(account_id, reconciled) WHERE NOT reconciled;
```

---

## 7. Row-Level Security Policies

### 7.1 Invoice Policies

```sql
ALTER TABLE finance.invoices ENABLE ROW LEVEL SECURITY;

-- Finance team can see all invoices
CREATE POLICY invoices_select_finance ON finance.invoices
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%finance-read%');

-- Executives can see all invoices
CREATE POLICY invoices_select_executive ON finance.invoices
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%executive%');

-- Finance-write can modify invoices
CREATE POLICY invoices_modify_finance ON finance.invoices
    FOR ALL
    USING (current_setting('app.current_user_roles', true) LIKE '%finance-write%');
```

### 7.2 Budget Policies

```sql
ALTER TABLE finance.budgets ENABLE ROW LEVEL SECURITY;

-- Finance can see all budgets
CREATE POLICY budgets_select_finance ON finance.budgets
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%finance-read%');

-- Managers can see their department budgets
CREATE POLICY budgets_select_department ON finance.budgets
    FOR SELECT
    USING (
        department_id IN (
            SELECT department_id FROM hr.employees
            WHERE employee_id = current_setting('app.current_user_id')::uuid
        )
    );

-- Only finance-write can approve
CREATE POLICY budgets_approve_finance ON finance.budgets
    FOR UPDATE
    USING (current_setting('app.current_user_roles', true) LIKE '%finance-write%');
```

### 7.3 Expense Report Policies

```sql
ALTER TABLE finance.expense_reports ENABLE ROW LEVEL SECURITY;

-- Users can see their own reports
CREATE POLICY expense_reports_select_own ON finance.expense_reports
    FOR SELECT
    USING (employee_id = current_setting('app.current_user_id')::uuid);

-- Managers can see their team's reports
CREATE POLICY expense_reports_select_manager ON finance.expense_reports
    FOR SELECT
    USING (
        employee_id IN (
            SELECT e.employee_id FROM hr.employees e
            WHERE e.manager_id = current_setting('app.current_user_id')::uuid
        )
    );

-- Finance can see all
CREATE POLICY expense_reports_select_finance ON finance.expense_reports
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%finance-read%');
```

---

## 8. Sample Data Requirements

### 8.1 Customer Data

| Customer | Plan | MRR | Status |
|----------|------|-----|--------|
| Acme Corp | Enterprise | $5,000 | Active |
| Widget Industries | Professional | $2,000 | Active |
| TechStart Inc | Starter | $500 | Active |
| GlobalTech | Enterprise | $8,000 | Active |
| SmallBiz Co | Starter | $500 | Churned |

### 8.2 ARR Baseline

```
Starting ARR (Jan 2024): $1,200,000
Monthly breakdown:
- Enterprise tier: $600,000 (50%)
- Professional tier: $400,000 (33%)
- Starter tier: $200,000 (17%)
```

### 8.3 Budget by Department

| Department | Annual Budget | Categories |
|------------|---------------|------------|
| Engineering | $2,400,000 | Personnel (80%), Software (15%), Other (5%) |
| Sales | $1,800,000 | Personnel (60%), Marketing (25%), Travel (15%) |
| Support | $1,200,000 | Personnel (85%), Software (10%), Training (5%) |
| G&A | $600,000 | Personnel (50%), Office (30%), Professional (20%) |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial Finance data model |
| 1.1 | Feb 2026 | Added ARR tracking, bank reconciliation |
