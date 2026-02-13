# HR Application Data Model

## 1. Overview

This document defines the database schema for the HR application. All data is stored in PostgreSQL with Row-Level Security (RLS) policies enforcing access control.

**Database**: `tamshai_hr`
**Schema**: `hr`

---

## 2. Core Tables

### 2.1 Employees

```sql
CREATE TABLE hr.employees (
    employee_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number     VARCHAR(20) UNIQUE NOT NULL,        -- EMP-0001

    -- Personal Information
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    preferred_name      VARCHAR(100),
    email               VARCHAR(255) UNIQUE NOT NULL,
    personal_email      VARCHAR(255),
    phone               VARCHAR(20),

    -- Location (US-based remote workers)
    address_line1       VARCHAR(255),
    address_line2       VARCHAR(255),
    city                VARCHAR(100),
    state               CHAR(2) NOT NULL,                   -- CA, TX, NY, etc.
    zip_code            VARCHAR(10),
    country             CHAR(2) DEFAULT 'US',
    timezone            VARCHAR(50) DEFAULT 'America/Los_Angeles',

    -- Employment
    title               VARCHAR(100) NOT NULL,
    department_id       UUID REFERENCES hr.departments(department_id),
    manager_id          UUID REFERENCES hr.employees(employee_id),
    hire_date           DATE NOT NULL,
    termination_date    DATE,
    employment_status   VARCHAR(20) DEFAULT 'active',       -- active, terminated, on_leave
    employment_type     VARCHAR(20) DEFAULT 'full_time',    -- full_time, part_time, contractor

    -- Compensation (confidential)
    salary              DECIMAL(12, 2),
    salary_currency     CHAR(3) DEFAULT 'USD',
    pay_frequency       VARCHAR(20) DEFAULT 'bi_weekly',    -- weekly, bi_weekly, monthly

    -- Emergency Contact
    emergency_contact_name   VARCHAR(200),
    emergency_contact_phone  VARCHAR(20),
    emergency_contact_rel    VARCHAR(50),

    -- Metadata
    profile_photo_url   VARCHAR(500),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID,
    updated_by          UUID
);

-- Indexes
CREATE INDEX idx_employees_department ON hr.employees(department_id);
CREATE INDEX idx_employees_manager ON hr.employees(manager_id);
CREATE INDEX idx_employees_status ON hr.employees(employment_status);
CREATE INDEX idx_employees_state ON hr.employees(state);
CREATE INDEX idx_employees_email ON hr.employees(email);

-- Full-text search
CREATE INDEX idx_employees_search ON hr.employees
    USING GIN(to_tsvector('english', first_name || ' ' || last_name || ' ' || COALESCE(preferred_name, '') || ' ' || title));
```

### 2.2 Departments

```sql
CREATE TABLE hr.departments (
    department_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL UNIQUE,
    code                VARCHAR(20) NOT NULL UNIQUE,        -- ENG, FIN, SAL, SUP, HR
    description         TEXT,
    parent_department_id UUID REFERENCES hr.departments(department_id),
    head_employee_id    UUID REFERENCES hr.employees(employee_id),
    cost_center         VARCHAR(20),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO hr.departments (name, code, description) VALUES
    ('Engineering', 'ENG', 'Software development and infrastructure'),
    ('Finance', 'FIN', 'Accounting, budgets, and financial operations'),
    ('Sales', 'SAL', 'Business development and account management'),
    ('Support', 'SUP', 'Customer success and technical support'),
    ('Human Resources', 'HR', 'People operations and talent management'),
    ('Executive', 'EXEC', 'C-suite and company leadership');
```

### 2.3 Employment History

```sql
CREATE TABLE hr.employment_history (
    history_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID REFERENCES hr.employees(employee_id) NOT NULL,

    -- Change record
    change_type         VARCHAR(50) NOT NULL,               -- hire, promotion, transfer, termination, salary_change
    effective_date      DATE NOT NULL,

    -- Previous values (for change tracking)
    previous_title      VARCHAR(100),
    new_title           VARCHAR(100),
    previous_department_id UUID REFERENCES hr.departments(department_id),
    new_department_id   UUID REFERENCES hr.departments(department_id),
    previous_manager_id UUID REFERENCES hr.employees(employee_id),
    new_manager_id      UUID REFERENCES hr.employees(employee_id),
    previous_salary     DECIMAL(12, 2),
    new_salary          DECIMAL(12, 2),

    -- Termination details
    termination_reason  VARCHAR(50),                        -- voluntary, involuntary, retirement, layoff
    termination_notes   TEXT,

    -- Metadata
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID
);

CREATE INDEX idx_employment_history_employee ON hr.employment_history(employee_id);
CREATE INDEX idx_employment_history_date ON hr.employment_history(effective_date);
```

---

## 3. Time Off Tables

### 3.1 Time Off Types

```sql
CREATE TABLE hr.time_off_types (
    type_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(50) NOT NULL UNIQUE,
    code                VARCHAR(20) NOT NULL UNIQUE,
    description         TEXT,
    default_annual_days DECIMAL(5, 2),                      -- NULL = unlimited
    accrual_frequency   VARCHAR(20),                        -- monthly, bi_weekly, annual
    carryover_allowed   BOOLEAN DEFAULT true,
    max_carryover_days  DECIMAL(5, 2),
    requires_approval   BOOLEAN DEFAULT true,
    paid                BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO hr.time_off_types (name, code, default_annual_days, accrual_frequency, max_carryover_days) VALUES
    ('Vacation', 'VAC', 15.00, 'bi_weekly', 5.00),
    ('Sick Leave', 'SICK', 10.00, 'annual', 0),
    ('Personal Days', 'PTO', 3.00, 'annual', 0),
    ('Bereavement', 'BRV', NULL, NULL, NULL),
    ('Jury Duty', 'JURY', NULL, NULL, NULL),
    ('Parental Leave', 'PARENT', 12.00, NULL, NULL);  -- 12 weeks
```

### 3.2 Time Off Balances

```sql
CREATE TABLE hr.time_off_balances (
    balance_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID REFERENCES hr.employees(employee_id) NOT NULL,
    type_id             UUID REFERENCES hr.time_off_types(type_id) NOT NULL,
    year                INTEGER NOT NULL,

    -- Balances
    annual_entitlement  DECIMAL(5, 2) NOT NULL,
    carryover           DECIMAL(5, 2) DEFAULT 0,
    adjustments         DECIMAL(5, 2) DEFAULT 0,            -- Manual HR adjustments
    used                DECIMAL(5, 2) DEFAULT 0,
    pending             DECIMAL(5, 2) DEFAULT 0,            -- Approved but not yet taken

    -- Computed
    available           DECIMAL(5, 2) GENERATED ALWAYS AS
        (annual_entitlement + carryover + adjustments - used - pending) STORED,

    last_accrual_date   DATE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(employee_id, type_id, year)
);

CREATE INDEX idx_time_off_balances_employee ON hr.time_off_balances(employee_id);
```

### 3.3 Time Off Requests

```sql
CREATE TABLE hr.time_off_requests (
    request_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID REFERENCES hr.employees(employee_id) NOT NULL,
    type_id             UUID REFERENCES hr.time_off_types(type_id) NOT NULL,

    -- Request details
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    half_day_start      BOOLEAN DEFAULT false,
    half_day_end        BOOLEAN DEFAULT false,
    total_days          DECIMAL(5, 2) NOT NULL,
    notes               TEXT,

    -- Approval workflow
    status              VARCHAR(20) DEFAULT 'pending',      -- pending, approved, rejected, cancelled
    approver_id         UUID REFERENCES hr.employees(employee_id),
    approved_at         TIMESTAMPTZ,
    approval_comments   TEXT,

    -- Metadata
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_time_off_requests_employee ON hr.time_off_requests(employee_id);
CREATE INDEX idx_time_off_requests_status ON hr.time_off_requests(status);
CREATE INDEX idx_time_off_requests_dates ON hr.time_off_requests(start_date, end_date);
```

---

## 4. Performance Management Tables

### 4.1 Review Cycles

```sql
CREATE TABLE hr.review_cycles (
    cycle_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL,              -- "2024 Annual Review"
    year                INTEGER NOT NULL,
    cycle_type          VARCHAR(20) NOT NULL,               -- annual, mid_year, quarterly

    -- Phase dates
    goal_setting_start  DATE,
    goal_setting_end    DATE,
    self_assessment_start DATE,
    self_assessment_end DATE,
    manager_review_start DATE,
    manager_review_end  DATE,
    calibration_start   DATE,
    calibration_end     DATE,
    finalization_date   DATE,

    status              VARCHAR(20) DEFAULT 'draft',        -- draft, active, completed
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 Performance Reviews

```sql
CREATE TABLE hr.performance_reviews (
    review_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id            UUID REFERENCES hr.review_cycles(cycle_id) NOT NULL,
    employee_id         UUID REFERENCES hr.employees(employee_id) NOT NULL,
    reviewer_id         UUID REFERENCES hr.employees(employee_id) NOT NULL,

    -- Ratings (1-5 scale)
    self_rating         DECIMAL(2, 1),
    manager_rating      DECIMAL(2, 1),
    final_rating        DECIMAL(2, 1),

    -- Assessments
    self_assessment     TEXT,
    manager_assessment  TEXT,
    strengths           TEXT,
    areas_for_improvement TEXT,
    development_plan    TEXT,

    -- Status
    status              VARCHAR(20) DEFAULT 'pending',      -- pending, in_progress, submitted, calibrated, finalized
    submitted_at        TIMESTAMPTZ,
    finalized_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(cycle_id, employee_id)
);

CREATE INDEX idx_performance_reviews_employee ON hr.performance_reviews(employee_id);
CREATE INDEX idx_performance_reviews_cycle ON hr.performance_reviews(cycle_id);
```

### 4.3 Goals

```sql
CREATE TABLE hr.goals (
    goal_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID REFERENCES hr.employees(employee_id) NOT NULL,
    cycle_id            UUID REFERENCES hr.review_cycles(cycle_id),

    title               VARCHAR(200) NOT NULL,
    description         TEXT,
    category            VARCHAR(50),                        -- performance, development, project

    -- Measurable outcomes
    key_results         JSONB,                              -- Array of {description, target, actual}

    -- Progress
    progress_percent    INTEGER DEFAULT 0,
    status              VARCHAR(20) DEFAULT 'not_started',  -- not_started, in_progress, completed, cancelled

    -- Timeline
    due_date            DATE,
    completed_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goals_employee ON hr.goals(employee_id);
CREATE INDEX idx_goals_cycle ON hr.goals(cycle_id);
```

---

## 5. Document Management Tables

### 5.1 Document Types

```sql
CREATE TABLE hr.document_types (
    type_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL UNIQUE,
    code                VARCHAR(20) NOT NULL UNIQUE,
    description         TEXT,
    required_for_hire   BOOLEAN DEFAULT false,
    retention_years     INTEGER,                            -- NULL = permanent
    requires_signature  BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO hr.document_types (name, code, required_for_hire, retention_years, requires_signature) VALUES
    ('W-4 Tax Withholding', 'W4', true, NULL, true),
    ('I-9 Employment Verification', 'I9', true, 3, true),
    ('Offer Letter', 'OFFER', true, NULL, true),
    ('Performance Review', 'REVIEW', false, 7, false),
    ('Disciplinary Notice', 'DISCIPLINE', false, 7, true),
    ('Termination Letter', 'TERM', false, NULL, true),
    ('Direct Deposit Form', 'DD', false, NULL, true),
    ('Emergency Contact Form', 'EMERG', false, NULL, false),
    ('Confidentiality Agreement', 'NDA', true, NULL, true),
    ('Company Handbook Acknowledgment', 'HANDBOOK', true, NULL, true);
```

### 5.2 Documents

```sql
CREATE TABLE hr.documents (
    document_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID REFERENCES hr.employees(employee_id) NOT NULL,
    type_id             UUID REFERENCES hr.document_types(type_id) NOT NULL,

    -- File info
    file_name           VARCHAR(255) NOT NULL,
    file_path           VARCHAR(500) NOT NULL,              -- MinIO path
    file_size           INTEGER,
    mime_type           VARCHAR(100),

    -- Version control
    version             INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES hr.documents(document_id),

    -- Dates
    document_date       DATE,                               -- Date on document
    effective_date      DATE,
    expiration_date     DATE,                               -- For I-9 re-verification

    -- Signature
    signed              BOOLEAN DEFAULT false,
    signed_at           TIMESTAMPTZ,
    signed_by           UUID REFERENCES hr.employees(employee_id),
    signature_data      JSONB,                              -- E-signature metadata

    -- Status
    status              VARCHAR(20) DEFAULT 'active',       -- active, superseded, archived

    -- Metadata
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID,

    -- Computed retention
    destroy_after       DATE GENERATED ALWAYS AS (
        CASE
            WHEN (SELECT retention_years FROM hr.document_types WHERE type_id = documents.type_id) IS NULL
            THEN NULL
            ELSE document_date + ((SELECT retention_years FROM hr.document_types WHERE type_id = documents.type_id) || ' years')::interval
        END
    ) STORED
);

CREATE INDEX idx_documents_employee ON hr.documents(employee_id);
CREATE INDEX idx_documents_type ON hr.documents(type_id);
CREATE INDEX idx_documents_expiration ON hr.documents(expiration_date) WHERE expiration_date IS NOT NULL;
```

---

## 6. Row-Level Security Policies

### 6.1 Employee Access Policies

```sql
-- Enable RLS
ALTER TABLE hr.employees ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all employees (basic info)
CREATE POLICY employees_select_basic ON hr.employees
    FOR SELECT
    USING (true);

-- Policy: Users can only update their own non-sensitive fields
CREATE POLICY employees_update_self ON hr.employees
    FOR UPDATE
    USING (employee_id = current_setting('app.current_user_id')::uuid)
    WITH CHECK (
        -- Can only update these fields
        salary IS NOT DISTINCT FROM (SELECT salary FROM hr.employees WHERE employee_id = current_setting('app.current_user_id')::uuid)
        AND department_id IS NOT DISTINCT FROM (SELECT department_id FROM hr.employees WHERE employee_id = current_setting('app.current_user_id')::uuid)
    );

-- Policy: HR can update any employee
CREATE POLICY employees_update_hr ON hr.employees
    FOR UPDATE
    USING (current_setting('app.current_user_roles', true) LIKE '%hr-write%');

-- Salary masking handled in view
CREATE VIEW hr.employees_public AS
SELECT
    employee_id,
    employee_number,
    first_name,
    last_name,
    preferred_name,
    email,
    phone,
    city,
    state,
    title,
    department_id,
    manager_id,
    hire_date,
    termination_date,
    employment_status,
    employment_type,
    CASE
        WHEN current_setting('app.current_user_roles', true) LIKE '%hr-write%'
        THEN salary
        ELSE NULL
    END AS salary,
    profile_photo_url,
    created_at,
    updated_at
FROM hr.employees;
```

### 6.2 Time Off Request Policies

```sql
ALTER TABLE hr.time_off_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY time_off_select_own ON hr.time_off_requests
    FOR SELECT
    USING (employee_id = current_setting('app.current_user_id')::uuid);

-- Managers can view their team's requests
CREATE POLICY time_off_select_manager ON hr.time_off_requests
    FOR SELECT
    USING (
        employee_id IN (
            SELECT e.employee_id FROM hr.employees e
            WHERE e.manager_id = current_setting('app.current_user_id')::uuid
        )
    );

-- HR can view all requests
CREATE POLICY time_off_select_hr ON hr.time_off_requests
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%hr-read%');

-- Users can create their own requests
CREATE POLICY time_off_insert_own ON hr.time_off_requests
    FOR INSERT
    WITH CHECK (employee_id = current_setting('app.current_user_id')::uuid);

-- Managers can approve their team's requests
CREATE POLICY time_off_update_manager ON hr.time_off_requests
    FOR UPDATE
    USING (
        employee_id IN (
            SELECT e.employee_id FROM hr.employees e
            WHERE e.manager_id = current_setting('app.current_user_id')::uuid
        )
    );
```

### 6.3 Performance Review Policies

```sql
ALTER TABLE hr.performance_reviews ENABLE ROW LEVEL SECURITY;

-- Employees can view their own finalized reviews
CREATE POLICY reviews_select_own ON hr.performance_reviews
    FOR SELECT
    USING (
        employee_id = current_setting('app.current_user_id')::uuid
        AND status = 'finalized'
    );

-- Reviewers can view reviews they're assigned to
CREATE POLICY reviews_select_reviewer ON hr.performance_reviews
    FOR SELECT
    USING (reviewer_id = current_setting('app.current_user_id')::uuid);

-- HR can view all reviews
CREATE POLICY reviews_select_hr ON hr.performance_reviews
    FOR SELECT
    USING (current_setting('app.current_user_roles', true) LIKE '%hr-read%');
```

---

## 7. Sample Data Requirements

### 7.1 Employee Distribution

| Department | Count | State Distribution |
|------------|-------|-------------------|
| Engineering | 15 | CA: 8, TX: 4, NY: 3 |
| Finance | 8 | CA: 5, CO: 2, WA: 1 |
| Sales | 12 | CA: 4, TX: 3, NY: 2, FL: 3 |
| Support | 10 | CA: 3, TX: 3, AZ: 2, OR: 2 |
| HR | 5 | CA: 3, TX: 2 |
| Executive | 4 | CA: 4 |
| **Total** | **54** | **CA: 27 (50%)** |

### 7.2 Organizational Hierarchy

```
CEO (Eve Thompson)
├── VP of HR (Alice Chen)
│   ├── HR Manager (Sarah Wilson)
│   │   └── HR Coordinator (Amy Brown)
│   └── Recruiter (Mike Davis)
├── Finance Director (Bob Martinez)
│   ├── Senior Accountant (Lisa Wang)
│   └── Accountant (Tom Jackson)
├── VP of Sales (Carol Johnson)
│   ├── Sales Manager West (Dan Williams)
│   │   └── 3 Account Executives
│   └── Sales Manager East (Emily Chen)
│       └── 3 Account Executives
├── Support Director (Frank Davis)
│   ├── Support Team Lead (Nina Patel)
│   │   └── 5 Support Agents
│   └── KB Manager (James Lee)
└── VP of Engineering (Marcus Johnson)
    ├── Engineering Manager (Rachel Kim)
    │   └── 8 Software Engineers
    └── DevOps Lead (Chris Taylor)
        └── 2 DevOps Engineers
```

---

## 8. Migration Scripts

### 8.1 Schema Creation Order

```sql
-- 1. Create schema
CREATE SCHEMA IF NOT EXISTS hr;

-- 2. Create tables in order (foreign key dependencies)
-- hr.departments (no dependencies)
-- hr.employees (references departments)
-- hr.employment_history (references employees, departments)
-- hr.time_off_types (no dependencies)
-- hr.time_off_balances (references employees, time_off_types)
-- hr.time_off_requests (references employees, time_off_types)
-- hr.review_cycles (no dependencies)
-- hr.performance_reviews (references review_cycles, employees)
-- hr.goals (references employees, review_cycles)
-- hr.document_types (no dependencies)
-- hr.documents (references employees, document_types)

-- 3. Create indexes
-- 4. Create RLS policies
-- 5. Create views
-- 6. Insert seed data
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial HR data model |
| 1.1 | Feb 2026 | Added time-off, performance, document tables |
