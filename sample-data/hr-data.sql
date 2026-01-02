-- Tamshai Corp HR Sample Data
-- This script runs after database initialization
--
-- ACCESS MODEL:
-- 1. SELF: Any authenticated employee can view their own data (basic info + salary)
-- 2. MANAGER: Managers can view data for their direct reports (including salary, grade, title)
-- 3. HR: HR staff can view all employee data across the organization
-- 4. EXECUTIVE: Read-only access to all data for reporting purposes
--
-- The manager_id field establishes the reporting hierarchy for manager-level access.

\c tamshai_hr;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SCHEMA (v1.4)
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS hr;

-- Grant permissions to tamshai user
GRANT USAGE ON SCHEMA hr TO tamshai;
GRANT ALL ON ALL TABLES IN SCHEMA hr TO tamshai;
GRANT ALL ON ALL SEQUENCES IN SCHEMA hr TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA hr GRANT ALL ON TABLES TO tamshai;
ALTER DEFAULT PRIVILEGES IN SCHEMA hr GRANT ALL ON SEQUENCES TO tamshai;

-- IMPORTANT: Allow tamshai to bypass Row-Level Security policies
-- Required for identity-sync service account to read all employees
ALTER USER tamshai BYPASSRLS;

-- =============================================================================
-- DEPARTMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS hr.departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    description TEXT,
    budget DECIMAL(15, 2) DEFAULT 0,
    head_employee_id UUID,  -- Department head (for org chart)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO hr.departments (id, name, code, description, budget) VALUES
    ('d1000000-0000-0000-0000-000000000001', 'Executive', 'EXEC', 'Executive leadership team', 5000000.00),
    ('d1000000-0000-0000-0000-000000000002', 'Human Resources', 'HR', 'People operations and talent management', 750000.00),
    ('d1000000-0000-0000-0000-000000000003', 'Finance', 'FIN', 'Financial planning and accounting', 900000.00),
    ('d1000000-0000-0000-0000-000000000004', 'Sales', 'SALES', 'Revenue generation and client relations', 2000000.00),
    ('d1000000-0000-0000-0000-000000000005', 'Customer Support', 'SUPPORT', 'Customer service and success', 600000.00),
    ('d1000000-0000-0000-0000-000000000006', 'Engineering', 'ENG', 'Product development and technology', 3500000.00),
    ('d1000000-0000-0000-0000-000000000007', 'Marketing', 'MKT', 'Brand and demand generation', 1200000.00),
    ('d1000000-0000-0000-0000-000000000008', 'Operations', 'OPS', 'Business operations and administration', 800000.00),
    ('d1000000-0000-0000-0000-000000000009', 'Legal', 'LEGAL', 'Legal and compliance', 500000.00),
    ('d1000000-0000-0000-0000-000000000010', 'IT', 'IT', 'Information technology and infrastructure', 1000000.00)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- GRADE LEVELS (for compensation structure)
-- =============================================================================
CREATE TABLE IF NOT EXISTS hr.grade_levels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grade VARCHAR(10) UNIQUE NOT NULL,
    title_prefix VARCHAR(50) NOT NULL,
    min_salary DECIMAL(12, 2) NOT NULL,
    max_salary DECIMAL(12, 2) NOT NULL,
    description TEXT
);

INSERT INTO hr.grade_levels (grade, title_prefix, min_salary, max_salary, description) VALUES
    ('L1', 'Intern/Trainee', 40000, 55000, 'Entry level - interns and trainees'),
    ('L2', 'Associate', 55000, 75000, 'Early career individual contributor'),
    ('L3', 'Specialist', 70000, 95000, 'Experienced individual contributor'),
    ('L4', 'Senior', 90000, 130000, 'Senior individual contributor'),
    ('L5', 'Lead/Manager', 120000, 175000, 'Team lead or first-level manager'),
    ('L6', 'Senior Manager', 160000, 220000, 'Senior manager or director'),
    ('L7', 'Director', 200000, 300000, 'Department director'),
    ('L8', 'VP', 280000, 400000, 'Vice President'),
    ('L9', 'SVP/C-Level', 350000, 600000, 'Senior VP or C-Suite executive')
ON CONFLICT (grade) DO NOTHING;

-- =============================================================================
-- EMPLOYEES
-- Key fields for access control:
--   - id: Unique employee identifier (matches Keycloak sub claim)
--   - employee_number: Human-readable employee ID (matches Keycloak employeeId attribute)
--   - manager_id: References the employee's direct manager (for manager access)
--   - email: Matches Keycloak email (for self-access lookups)
--   - grade: Job grade level (L1-L9)
-- =============================================================================
CREATE TABLE IF NOT EXISTS hr.employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_number VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    department_id UUID REFERENCES hr.departments(id),
    manager_id UUID REFERENCES hr.employees(id),
    title VARCHAR(100),
    grade VARCHAR(10) REFERENCES hr.grade_levels(grade),
    hire_date DATE NOT NULL,
    salary DECIMAL(12, 2),
    salary_currency VARCHAR(3) DEFAULT 'USD',
    bonus_target_pct DECIMAL(5, 2) DEFAULT 0,  -- Target bonus as % of salary
    employment_type VARCHAR(20) DEFAULT 'FULL_TIME',
    status VARCHAR(20) DEFAULT 'ACTIVE',
    location VARCHAR(100),
    work_email VARCHAR(255),  -- Same as email for SSO matching
    is_manager BOOLEAN DEFAULT false,  -- Flag for manager role assignment
    keycloak_user_id VARCHAR(255),  -- Link to Keycloak identity
    terminated_at TIMESTAMP WITH TIME ZONE,  -- Timestamp when employee was terminated
    deleted_at TIMESTAMP WITH TIME ZONE,  -- Soft delete timestamp
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- EMPLOYEE DATA - ORGANIZED BY REPORTING HIERARCHY
-- This hierarchy is critical for the manager access model
-- =============================================================================

-- LEVEL 1: CEO (no manager)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'EMP001', 'Eve', 'Thompson', 'eve@tamshai.local', 'eve@tamshai.local', '+1-555-100-0001', 'd1000000-0000-0000-0000-000000000001', NULL, 'Chief Executive Officer', 'L9', '2018-01-15', 450000.00, 50, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- LEVEL 2: C-Suite (reports to CEO)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000002', 'EMP002', 'Michael', 'Roberts', 'michael.r@tamshai.local', 'michael.r@tamshai.local', '+1-555-100-0002', 'd1000000-0000-0000-0000-000000000001', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'Chief Financial Officer', 'L9', '2018-03-01', 380000.00, 45, 'Seattle, WA', true),
    ('e1000000-0000-0000-0000-000000000003', 'EMP003', 'Sarah', 'Kim', 'sarah.k@tamshai.local', 'sarah.k@tamshai.local', '+1-555-100-0003', 'd1000000-0000-0000-0000-000000000001', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'Chief Technology Officer', 'L9', '2018-02-15', 395000.00, 45, 'Seattle, WA', true),
    ('e1000000-0000-0000-0000-000000000004', 'EMP004', 'James', 'Wilson', 'james.w@tamshai.local', 'james.w@tamshai.local', '+1-555-100-0004', 'd1000000-0000-0000-0000-000000000001', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'Chief Operating Officer', 'L9', '2018-06-01', 360000.00, 45, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- LEVEL 3: VPs and Directors (reports to C-Suite)

-- HR Department - Reports to COO (James Wilson)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('f104eddc-21ab-457c-a254-78051ad7ad67', 'EMP010', 'Alice', 'Chen', 'alice@tamshai.local', 'alice@tamshai.local', '+1-555-200-0001', 'd1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000004', 'VP of Human Resources', 'L8', '2019-02-01', 185000.00, 30, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- Finance Department - Reports to CFO (Michael Roberts)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'EMP020', 'Bob', 'Martinez', 'bob@tamshai.local', 'bob@tamshai.local', '+1-555-300-0001', 'd1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000002', 'Finance Director', 'L7', '2019-04-01', 165000.00, 25, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- Sales Department - Reports to CEO (Eve Thompson)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'EMP030', 'Carol', 'Johnson', 'carol@tamshai.local', 'carol@tamshai.local', '+1-555-400-0001', 'd1000000-0000-0000-0000-000000000004', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'VP of Sales', 'L8', '2019-01-15', 195000.00, 40, 'San Francisco, CA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- Support Department - Reports to COO (James Wilson)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('d7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'EMP040', 'Dan', 'Williams', 'dan@tamshai.local', 'dan@tamshai.local', '+1-555-500-0001', 'd1000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000004', 'Support Director', 'L7', '2020-01-01', 145000.00, 20, 'Austin, TX', true)
ON CONFLICT (employee_number) DO NOTHING;

-- Engineering Department - Reports to CTO (Sarah Kim)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000050', 'EMP050', 'Alex', 'Turner', 'alex.t@tamshai.local', 'alex.t@tamshai.local', '+1-555-600-0001', 'd1000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000003', 'Engineering Director', 'L7', '2019-03-01', 210000.00, 25, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- IT Department - Reports to CTO (Sarah Kim)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000060', 'EMP060', 'Brian', 'Adams', 'brian.a@tamshai.local', 'brian.a@tamshai.local', '+1-555-700-0001', 'd1000000-0000-0000-0000-000000000010', 'e1000000-0000-0000-0000-000000000003', 'IT Manager', 'L5', '2019-05-01', 130000.00, 15, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- LEVEL 4: Managers (reports to Directors/VPs)

-- HR Team - Reports to Alice Chen
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000011', 'EMP011', 'Jennifer', 'Lee', 'jennifer.l@tamshai.local', 'jennifer.l@tamshai.local', '+1-555-200-0002', 'd1000000-0000-0000-0000-000000000002', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'HR Manager', 'L5', '2020-03-15', 95000.00, 15, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- Finance Team - Reports to Bob Martinez
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000021', 'EMP021', 'Lisa', 'Anderson', 'lisa.a@tamshai.local', 'lisa.a@tamshai.local', '+1-555-300-0002', 'd1000000-0000-0000-0000-000000000003', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'Senior Accountant', 'L4', '2020-01-15', 92000.00, 10, 'Seattle, WA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Sales Team - Reports to Carol Johnson
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000031', 'EMP031', 'Ryan', 'Garcia', 'ryan.g@tamshai.local', 'ryan.g@tamshai.local', '+1-555-400-0002', 'd1000000-0000-0000-0000-000000000004', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'Sales Manager', 'L5', '2020-02-01', 125000.00, 30, 'San Francisco, CA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- Support Team - Reports to Dan Williams
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000041', 'EMP041', 'Emily', 'Clark', 'emily.c@tamshai.local', 'emily.c@tamshai.local', '+1-555-500-0002', 'd1000000-0000-0000-0000-000000000005', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'Senior Support Engineer', 'L4', '2020-06-15', 78000.00, 10, 'Austin, TX', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Engineering Team - Reports to Alex Turner
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'EMP051', 'Nina', 'Patel', 'nina.p@tamshai.local', 'nina.p@tamshai.local', '+1-555-600-0002', 'd1000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000050', 'Engineering Manager', 'L5', '2019-08-15', 175000.00, 20, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- LEVEL 5: Individual Contributors

-- HR ICs - Reports to Jennifer Lee
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000012', 'EMP012', 'David', 'Park', 'david.p@tamshai.local', 'david.p@tamshai.local', '+1-555-200-0003', 'd1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000011', 'Recruiter', 'L3', '2021-06-01', 72000.00, 10, 'Seattle, WA', false),
    ('e1000000-0000-0000-0000-000000000013', 'EMP013', 'Maria', 'Santos', 'maria.s@tamshai.local', 'maria.s@tamshai.local', '+1-555-200-0004', 'd1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000011', 'HR Coordinator', 'L2', '2022-03-01', 58000.00, 5, 'Seattle, WA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Finance ICs - Reports to Bob Martinez (via Lisa for some)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000022', 'EMP022', 'Kevin', 'Brown', 'kevin.b@tamshai.local', 'kevin.b@tamshai.local', '+1-555-300-0003', 'd1000000-0000-0000-0000-000000000003', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'Financial Analyst', 'L3', '2021-08-01', 78000.00, 10, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000023', 'EMP023', 'Amanda', 'Wright', 'amanda.wr@tamshai.local', 'amanda.wr@tamshai.local', '+1-555-300-0004', 'd1000000-0000-0000-0000-000000000003', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'Junior Accountant', 'L2', '2023-01-15', 62000.00, 5, 'Seattle, WA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Sales ICs - Reports to Ryan Garcia
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000032', 'EMP032', 'Amanda', 'White', 'amanda.w@tamshai.local', 'amanda.w@tamshai.local', '+1-555-400-0003', 'd1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000031', 'Account Executive', 'L4', '2021-03-15', 85000.00, 25, 'New York, NY', false),
    ('e1000000-0000-0000-0000-000000000033', 'EMP033', 'Chris', 'Taylor', 'chris.t@tamshai.local', 'chris.t@tamshai.local', '+1-555-400-0004', 'd1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000031', 'Account Executive', 'L4', '2021-05-01', 82000.00, 25, 'Chicago, IL', false),
    ('e1000000-0000-0000-0000-000000000034', 'EMP034', 'Michelle', 'Davis', 'michelle.d@tamshai.local', 'michelle.d@tamshai.local', '+1-555-400-0005', 'd1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000031', 'Sales Development Rep', 'L2', '2022-01-10', 65000.00, 20, 'Remote', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Support ICs - Reports to Dan Williams
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000042', 'EMP042', 'Jason', 'Miller', 'jason.m@tamshai.local', 'jason.m@tamshai.local', '+1-555-500-0003', 'd1000000-0000-0000-0000-000000000005', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'Support Engineer', 'L3', '2021-09-01', 68000.00, 10, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000043', 'EMP043', 'Rachel', 'Moore', 'rachel.m@tamshai.local', 'rachel.m@tamshai.local', '+1-555-500-0004', 'd1000000-0000-0000-0000-000000000005', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'Support Engineer', 'L3', '2022-02-15', 65000.00, 10, 'Remote', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Engineering ICs - Reports to Nina Patel
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000052', 'EMP052', 'Marcus', 'Johnson', 'marcus.j@tamshai.local', 'marcus.j@tamshai.local', '+1-555-600-0003', 'd1000000-0000-0000-0000-000000000006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'Software Engineer', 'L4', '2020-11-01', 145000.00, 15, 'Seattle, WA', false),
    ('e1000000-0000-0000-0000-000000000053', 'EMP053', 'Sophia', 'Wang', 'sophia.w@tamshai.local', 'sophia.w@tamshai.local', '+1-555-600-0004', 'd1000000-0000-0000-0000-000000000006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'Software Engineer', 'L4', '2021-02-15', 140000.00, 15, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000054', 'EMP054', 'Tyler', 'Scott', 'tyler.s@tamshai.local', 'tyler.s@tamshai.local', '+1-555-600-0005', 'd1000000-0000-0000-0000-000000000006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'Junior Software Engineer', 'L2', '2022-06-01', 95000.00, 10, 'Seattle, WA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- IT ICs - Reports to Brian Adams (including the intern Frank)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e', 'EMP061', 'Frank', 'Davis', 'frank@tamshai.local', 'frank@tamshai.local', '+1-555-700-0002', 'd1000000-0000-0000-0000-000000000010', 'e1000000-0000-0000-0000-000000000060', 'IT Intern', 'L1', '2024-06-01', 45000.00, 0, 'Seattle, WA', false),
    ('e1000000-0000-0000-0000-000000000062', 'EMP062', 'Tony', 'Nguyen', 'tony.n@tamshai.local', 'tony.n@tamshai.local', '+1-555-700-0003', 'd1000000-0000-0000-0000-000000000010', 'e1000000-0000-0000-0000-000000000060', 'Systems Administrator', 'L3', '2021-04-01', 85000.00, 10, 'Seattle, WA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- =============================================================================
-- ADDITIONAL EMPLOYEES (to reach 59 total)
-- =============================================================================

-- Marketing Department - Reports to CEO (Eve Thompson)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000070', 'EMP070', 'Patricia', 'Morgan', 'patricia.m@tamshai.local', 'patricia.m@tamshai.local', '+1-555-800-0001', 'd1000000-0000-0000-0000-000000000007', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'VP of Marketing', 'L8', '2019-07-01', 190000.00, 30, 'San Francisco, CA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- Marketing Team - Reports to Patricia Morgan
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000071', 'EMP071', 'Steven', 'Harris', 'steven.h@tamshai.local', 'steven.h@tamshai.local', '+1-555-800-0002', 'd1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000070', 'Marketing Manager', 'L5', '2020-08-01', 115000.00, 20, 'San Francisco, CA', true),
    ('e1000000-0000-0000-0000-000000000072', 'EMP072', 'Linda', 'Thompson', 'linda.t@tamshai.local', 'linda.t@tamshai.local', '+1-555-800-0003', 'd1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000071', 'Content Strategist', 'L4', '2021-03-01', 88000.00, 15, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000073', 'EMP073', 'Robert', 'Jackson', 'robert.j@tamshai.local', 'robert.j@tamshai.local', '+1-555-800-0004', 'd1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000071', 'Digital Marketing Specialist', 'L3', '2021-09-01', 75000.00, 10, 'New York, NY', false),
    ('e1000000-0000-0000-0000-000000000074', 'EMP074', 'Jessica', 'Lewis', 'jessica.l@tamshai.local', 'jessica.l@tamshai.local', '+1-555-800-0005', 'd1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000071', 'Social Media Manager', 'L3', '2022-01-15', 72000.00, 10, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000075', 'EMP075', 'Andrew', 'Young', 'andrew.y@tamshai.local', 'andrew.y@tamshai.local', '+1-555-800-0006', 'd1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000071', 'Marketing Coordinator', 'L2', '2023-03-01', 58000.00, 5, 'San Francisco, CA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Operations Department - Reports to COO (James Wilson)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000080', 'EMP080', 'William', 'Robinson', 'william.r@tamshai.local', 'william.r@tamshai.local', '+1-555-900-0001', 'd1000000-0000-0000-0000-000000000008', 'e1000000-0000-0000-0000-000000000004', 'Operations Director', 'L7', '2019-09-01', 155000.00, 25, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- Operations Team - Reports to William Robinson
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000081', 'EMP081', 'Elizabeth', 'Hall', 'elizabeth.h@tamshai.local', 'elizabeth.h@tamshai.local', '+1-555-900-0002', 'd1000000-0000-0000-0000-000000000008', 'e1000000-0000-0000-0000-000000000080', 'Operations Manager', 'L5', '2020-04-01', 105000.00, 15, 'Seattle, WA', true),
    ('e1000000-0000-0000-0000-000000000082', 'EMP082', 'Charles', 'Allen', 'charles.a@tamshai.local', 'charles.a@tamshai.local', '+1-555-900-0003', 'd1000000-0000-0000-0000-000000000008', 'e1000000-0000-0000-0000-000000000081', 'Business Analyst', 'L4', '2021-06-01', 85000.00, 10, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000083', 'EMP083', 'Dorothy', 'King', 'dorothy.k@tamshai.local', 'dorothy.k@tamshai.local', '+1-555-900-0004', 'd1000000-0000-0000-0000-000000000008', 'e1000000-0000-0000-0000-000000000081', 'Project Coordinator', 'L3', '2022-02-01', 68000.00, 10, 'Seattle, WA', false),
    ('e1000000-0000-0000-0000-000000000084', 'EMP084', 'Daniel', 'Wright', 'daniel.w@tamshai.local', 'daniel.w@tamshai.local', '+1-555-900-0005', 'd1000000-0000-0000-0000-000000000008', 'e1000000-0000-0000-0000-000000000081', 'Operations Associate', 'L2', '2023-01-15', 55000.00, 5, 'Seattle, WA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Legal Department - Reports to CEO (Eve Thompson)
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000090', 'EMP090', 'Margaret', 'Scott', 'margaret.s@tamshai.local', 'margaret.s@tamshai.local', '+1-555-950-0001', 'd1000000-0000-0000-0000-000000000009', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'General Counsel', 'L8', '2019-04-01', 220000.00, 30, 'Seattle, WA', true)
ON CONFLICT (employee_number) DO NOTHING;

-- Legal Team - Reports to Margaret Scott
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000091', 'EMP091', 'Joseph', 'Green', 'joseph.g@tamshai.local', 'joseph.g@tamshai.local', '+1-555-950-0002', 'd1000000-0000-0000-0000-000000000009', 'e1000000-0000-0000-0000-000000000090', 'Corporate Counsel', 'L6', '2020-06-01', 175000.00, 20, 'Seattle, WA', false),
    ('e1000000-0000-0000-0000-000000000092', 'EMP092', 'Susan', 'Adams', 'susan.a@tamshai.local', 'susan.a@tamshai.local', '+1-555-950-0003', 'd1000000-0000-0000-0000-000000000009', 'e1000000-0000-0000-0000-000000000090', 'Legal Coordinator', 'L3', '2021-11-01', 72000.00, 10, 'Seattle, WA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Additional Engineering ICs - Reports to Nina Patel
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000055', 'EMP055', 'Benjamin', 'Carter', 'benjamin.c@tamshai.local', 'benjamin.c@tamshai.local', '+1-555-600-0006', 'd1000000-0000-0000-0000-000000000006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'Senior Software Engineer', 'L4', '2020-09-01', 155000.00, 15, 'Seattle, WA', false),
    ('e1000000-0000-0000-0000-000000000056', 'EMP056', 'Olivia', 'Phillips', 'olivia.p@tamshai.local', 'olivia.p@tamshai.local', '+1-555-600-0007', 'd1000000-0000-0000-0000-000000000006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'Software Engineer', 'L3', '2021-07-01', 125000.00, 12, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000057', 'EMP057', 'Ethan', 'Campbell', 'ethan.c@tamshai.local', 'ethan.c@tamshai.local', '+1-555-600-0008', 'd1000000-0000-0000-0000-000000000006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'QA Engineer', 'L3', '2021-10-01', 105000.00, 10, 'Seattle, WA', false),
    ('e1000000-0000-0000-0000-000000000058', 'EMP058', 'Emma', 'Mitchell', 'emma.m@tamshai.local', 'emma.m@tamshai.local', '+1-555-600-0009', 'd1000000-0000-0000-0000-000000000006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'DevOps Engineer', 'L4', '2020-12-01', 145000.00, 15, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000059', 'EMP059', 'Alexander', 'Roberts', 'alexander.r@tamshai.local', 'alexander.r@tamshai.local', '+1-555-600-0010', 'd1000000-0000-0000-0000-000000000006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'Junior Developer', 'L2', '2023-06-01', 85000.00, 8, 'Seattle, WA', false),
    ('e1000000-0000-0000-0000-00000000005a', 'EMP05A', 'Isabella', 'Turner', 'isabella.t@tamshai.local', 'isabella.t@tamshai.local', '+1-555-600-0011', 'd1000000-0000-0000-0000-000000000006', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'Engineering Intern', 'L1', '2024-05-15', 48000.00, 0, 'Seattle, WA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Additional Sales ICs - Reports to Ryan Garcia
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000035', 'EMP035', 'Matthew', 'Evans', 'matthew.e@tamshai.local', 'matthew.e@tamshai.local', '+1-555-400-0006', 'd1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000031', 'Account Executive', 'L4', '2021-08-01', 88000.00, 25, 'Boston, MA', false),
    ('e1000000-0000-0000-0000-000000000036', 'EMP036', 'Samantha', 'Collins', 'samantha.c@tamshai.local', 'samantha.c@tamshai.local', '+1-555-400-0007', 'd1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000031', 'Account Executive', 'L4', '2022-03-01', 82000.00, 25, 'Los Angeles, CA', false),
    ('e1000000-0000-0000-0000-000000000037', 'EMP037', 'Joshua', 'Stewart', 'joshua.s@tamshai.local', 'joshua.s@tamshai.local', '+1-555-400-0008', 'd1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000031', 'Sales Development Rep', 'L2', '2022-09-01', 62000.00, 20, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000038', 'EMP038', 'Ashley', 'Sanchez', 'ashley.s@tamshai.local', 'ashley.s@tamshai.local', '+1-555-400-0009', 'd1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000031', 'Sales Intern', 'L1', '2024-06-15', 42000.00, 10, 'San Francisco, CA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Additional Support ICs - Reports to Dan Williams
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000044', 'EMP044', 'Brandon', 'Morris', 'brandon.m@tamshai.local', 'brandon.m@tamshai.local', '+1-555-500-0005', 'd1000000-0000-0000-0000-000000000005', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'Senior Support Engineer', 'L4', '2020-07-01', 82000.00, 12, 'Austin, TX', false),
    ('e1000000-0000-0000-0000-000000000045', 'EMP045', 'Kimberly', 'Rogers', 'kimberly.r@tamshai.local', 'kimberly.r@tamshai.local', '+1-555-500-0006', 'd1000000-0000-0000-0000-000000000005', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'Support Engineer', 'L3', '2021-05-01', 70000.00, 10, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000046', 'EMP046', 'Justin', 'Reed', 'justin.r@tamshai.local', 'justin.r@tamshai.local', '+1-555-500-0007', 'd1000000-0000-0000-0000-000000000005', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'Support Associate', 'L2', '2022-08-01', 58000.00, 8, 'Remote', false),
    ('e1000000-0000-0000-0000-000000000047', 'EMP047', 'Stephanie', 'Cook', 'stephanie.c@tamshai.local', 'stephanie.c@tamshai.local', '+1-555-500-0008', 'd1000000-0000-0000-0000-000000000005', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'Customer Success Rep', 'L2', '2023-02-01', 55000.00, 8, 'Austin, TX', false)
ON CONFLICT (employee_number) DO NOTHING;

-- Additional Finance ICs - Reports to Bob Martinez
INSERT INTO hr.employees (id, employee_number, first_name, last_name, email, work_email, phone, department_id, manager_id, title, grade, hire_date, salary, bonus_target_pct, location, is_manager) VALUES
    ('e1000000-0000-0000-0000-000000000024', 'EMP024', 'Nicole', 'Bailey', 'nicole.b@tamshai.local', 'nicole.b@tamshai.local', '+1-555-300-0005', 'd1000000-0000-0000-0000-000000000003', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'Accounts Payable Specialist', 'L3', '2021-10-01', 72000.00, 10, 'Seattle, WA', false),
    ('e1000000-0000-0000-0000-000000000025', 'EMP025', 'Timothy', 'Murphy', 'timothy.m@tamshai.local', 'timothy.m@tamshai.local', '+1-555-300-0006', 'd1000000-0000-0000-0000-000000000003', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'Finance Intern', 'L1', '2024-06-01', 45000.00, 0, 'Seattle, WA', false)
ON CONFLICT (employee_number) DO NOTHING;

-- =============================================================================
-- PERFORMANCE REVIEWS (CONFIDENTIAL - HR and Manager access only)
-- =============================================================================
CREATE TABLE IF NOT EXISTS hr.performance_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES hr.employees(id),
    reviewer_id UUID REFERENCES hr.employees(id),
    review_period VARCHAR(20) NOT NULL,
    review_date DATE NOT NULL,
    overall_rating DECIMAL(2, 1) CHECK (overall_rating >= 1 AND overall_rating <= 5),
    goals_met_percentage INTEGER CHECK (goals_met_percentage >= 0 AND goals_met_percentage <= 100),
    strengths TEXT,
    areas_for_improvement TEXT,
    comments TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO hr.performance_reviews (employee_id, reviewer_id, review_period, review_date, overall_rating, goals_met_percentage, strengths, areas_for_improvement) VALUES
    ('f104eddc-21ab-457c-a254-78051ad7ad67', 'e1000000-0000-0000-0000-000000000004', '2024-H1', '2024-07-15', 4.5, 95, 'Excellent leadership, strong employee relations', 'Could delegate more effectively'),
    ('1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'e1000000-0000-0000-0000-000000000002', '2024-H1', '2024-07-15', 4.2, 90, 'Strong financial acumen, detail-oriented', 'Improve cross-department communication'),
    ('c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', '2024-H1', '2024-07-15', 4.8, 100, 'Exceeded sales targets, excellent team builder', 'Continue developing strategic partnerships'),
    ('d7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'e1000000-0000-0000-0000-000000000004', '2024-H1', '2024-07-15', 4.0, 88, 'Great customer satisfaction scores', 'Reduce average ticket resolution time'),
    ('a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', 'e1000000-0000-0000-0000-000000000050', '2024-H1', '2024-07-15', 4.3, 92, 'Strong technical skills, great mentor', 'Improve documentation practices'),
    ('e1000000-0000-0000-0000-000000000052', 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', '2024-H1', '2024-07-15', 3.8, 85, 'Solid coding skills, reliable', 'Take on more leadership responsibilities')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- FUNCTIONS FOR HIERARCHICAL ACCESS CONTROL
-- These functions support the manager hierarchy access model
-- =============================================================================

-- Function to get all direct reports for a manager (one level)
CREATE OR REPLACE FUNCTION get_direct_reports(manager_email VARCHAR)
RETURNS TABLE (
    employee_id UUID,
    employee_number VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    email VARCHAR,
    title VARCHAR,
    grade VARCHAR,
    department_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.employee_number, e.first_name, e.last_name, 
           e.email, e.title, e.grade, d.name as department_name
    FROM hr.employees e
    JOIN hr.departments d ON e.department_id = d.id
    WHERE e.manager_id = (SELECT id FROM hr.employees WHERE work_email = manager_email)
    AND e.status = 'ACTIVE';
END;
$$ LANGUAGE plpgsql;

-- Function to get all reports (recursive - all levels below)
CREATE OR REPLACE FUNCTION get_all_reports(manager_email VARCHAR)
RETURNS TABLE (
    employee_id UUID,
    employee_number VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    email VARCHAR,
    title VARCHAR,
    grade VARCHAR,
    salary DECIMAL,
    department_name VARCHAR,
    level_from_manager INT
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE report_chain AS (
        -- Base case: direct reports
        SELECT e.id, e.employee_number, e.first_name, e.last_name,
               e.email, e.title, e.grade, e.salary, d.name as dept_name, 1 as lvl
        FROM hr.employees e
        JOIN hr.departments d ON e.department_id = d.id
        WHERE e.manager_id = (SELECT id FROM hr.employees WHERE work_email = manager_email)
        AND e.status = 'ACTIVE'
        
        UNION ALL
        
        -- Recursive case: reports of reports
        SELECT e.id, e.employee_number, e.first_name, e.last_name,
               e.email, e.title, e.grade, e.salary, d.name, rc.lvl + 1
        FROM hr.employees e
        JOIN hr.departments d ON e.department_id = d.id
        JOIN report_chain rc ON e.manager_id = rc.id
        WHERE e.status = 'ACTIVE'
    )
    SELECT * FROM report_chain ORDER BY lvl, last_name;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user A is a manager of user B (direct or indirect)
-- FIXED: Added SECURITY DEFINER to bypass RLS recursion, depth limit, and proper chain traversal
-- See docs/development/lessons-learned.md Lesson 6 for details on the original bug
CREATE OR REPLACE FUNCTION is_manager_of(manager_email VARCHAR, employee_email VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with creator's privileges to avoid RLS recursion
SET search_path = hr, public  -- Security: set explicit search path
AS $$
DECLARE
    result BOOLEAN := FALSE;
    manager_id_val UUID;
    employee_id_val UUID;
BEGIN
    -- Handle edge cases
    IF manager_email IS NULL OR employee_email IS NULL THEN
        RETURN FALSE;
    END IF;

    -- A person cannot be their own manager
    IF manager_email = employee_email THEN
        RETURN FALSE;
    END IF;

    -- Get employee IDs first (more efficient)
    SELECT id INTO employee_id_val FROM hr.employees WHERE work_email = employee_email;
    SELECT id INTO manager_id_val FROM hr.employees WHERE work_email = manager_email;

    -- If either doesn't exist, return false
    IF employee_id_val IS NULL OR manager_id_val IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Walk UP the management chain from employee to find manager
    -- Uses depth limit (20 levels max) to prevent infinite loops
    WITH RECURSIVE management_chain(current_id, depth) AS (
        -- Base case: start with the employee's manager
        SELECT manager_id, 1
        FROM hr.employees
        WHERE id = employee_id_val
          AND manager_id IS NOT NULL

        UNION ALL

        -- Recursive case: walk UP to each manager
        SELECT e.manager_id, mc.depth + 1
        FROM hr.employees e
        JOIN management_chain mc ON e.id = mc.current_id
        WHERE e.manager_id IS NOT NULL
          AND mc.depth < 20  -- Prevent deep recursion (20 levels max for any org)
    )
    SELECT EXISTS (
        SELECT 1 FROM management_chain WHERE current_id = manager_id_val
    ) INTO result;

    RETURN COALESCE(result, FALSE);
END;
$$;

-- =============================================================================
-- VIEWS FOR ROLE-BASED ACCESS
-- =============================================================================

-- View for SELF access (any authenticated employee sees their own data)
-- Used when employee looks up their own information
CREATE OR REPLACE VIEW employee_self_view AS
SELECT 
    e.id,
    e.employee_number,
    e.first_name,
    e.last_name,
    e.email,
    e.phone,
    e.title,
    e.grade,
    e.hire_date,
    e.salary,
    e.salary_currency,
    e.bonus_target_pct,
    e.employment_type,
    e.status,
    e.location,
    d.name as department_name,
    d.code as department_code,
    m.first_name || ' ' || m.last_name as manager_name,
    m.email as manager_email
FROM hr.employees e
LEFT JOIN hr.departments d ON e.department_id = d.id
LEFT JOIN hr.employees m ON e.manager_id = m.id;

-- View for MANAGER access (basic info without sensitive data)
-- Managers see this for their direct/indirect reports
CREATE OR REPLACE VIEW employee_manager_view AS
SELECT 
    e.id,
    e.employee_number,
    e.first_name,
    e.last_name,
    e.email,
    e.phone,
    e.title,
    e.grade,
    e.hire_date,
    e.salary,
    e.bonus_target_pct,
    e.status,
    e.location,
    e.is_manager,
    d.name as department_name,
    m.first_name || ' ' || m.last_name as manager_name
FROM hr.employees e
LEFT JOIN hr.departments d ON e.department_id = d.id
LEFT JOIN hr.employees m ON e.manager_id = m.id
WHERE e.status = 'ACTIVE';

-- View for HR access (all employee data)
CREATE OR REPLACE VIEW employee_hr_view AS
SELECT 
    e.*,
    d.name as department_name,
    d.code as department_code,
    d.budget as department_budget,
    m.first_name || ' ' || m.last_name as manager_name,
    m.email as manager_email,
    g.title_prefix as grade_title,
    g.min_salary as grade_min,
    g.max_salary as grade_max
FROM hr.employees e
LEFT JOIN hr.departments d ON e.department_id = d.id
LEFT JOIN hr.employees m ON e.manager_id = m.id
LEFT JOIN hr.grade_levels g ON e.grade = g.grade;

-- View for public directory (no sensitive info - anyone authenticated)
CREATE OR REPLACE VIEW employee_directory AS
SELECT 
    e.id,
    e.employee_number,
    e.first_name,
    e.last_name,
    e.email,
    e.title,
    e.location,
    d.name as department_name,
    d.code as department_code,
    m.first_name || ' ' || m.last_name as manager_name
FROM hr.employees e
LEFT JOIN hr.departments d ON e.department_id = d.id
LEFT JOIN hr.employees m ON e.manager_id = m.id
WHERE e.status = 'ACTIVE';

-- View for department headcount
CREATE OR REPLACE VIEW department_headcount AS
SELECT 
    d.name as department,
    d.code,
    COUNT(e.id) as employee_count,
    AVG(e.salary) as avg_salary  -- Only visible to HR
FROM hr.departments d
LEFT JOIN hr.employees e ON d.id = e.department_id AND e.status = 'ACTIVE'
GROUP BY d.id, d.name, d.code
ORDER BY d.name;

-- View for org chart (shows hierarchy)
-- DISABLED (v1.4): This view has a recursive CTE type mismatch issue
-- and is not used by v1.4 MCP servers. Can be re-enabled if needed.
--
-- CREATE OR REPLACE VIEW org_chart AS
-- WITH RECURSIVE org_tree AS (
--     SELECT id, employee_number, first_name, last_name, title,
--            manager_id, 0 as level, ARRAY[last_name] as path
--     FROM hr.employees WHERE manager_id IS NULL AND status = 'ACTIVE'
--
--     UNION ALL
--
--     SELECT e.id, e.employee_number, e.first_name, e.last_name, e.title,
--            e.manager_id, ot.level + 1, ot.path || e.last_name
--     FROM hr.employees e
--     JOIN org_tree ot ON e.manager_id = ot.id
--     WHERE e.status = 'ACTIVE'
-- )
-- SELECT * FROM org_tree ORDER BY path;

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_employees_department ON hr.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON hr.employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON hr.employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_email ON hr.employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_work_email ON hr.employees(work_email);
CREATE INDEX IF NOT EXISTS idx_employees_grade ON hr.employees(grade);
CREATE INDEX IF NOT EXISTS idx_employees_is_manager ON hr.employees(is_manager);

-- Update department heads
UPDATE hr.departments SET head_employee_id = 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b' WHERE code = 'EXEC';
UPDATE hr.departments SET head_employee_id = 'f104eddc-21ab-457c-a254-78051ad7ad67' WHERE code = 'HR';
UPDATE hr.departments SET head_employee_id = '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1' WHERE code = 'FIN';
UPDATE hr.departments SET head_employee_id = 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c' WHERE code = 'SALES';
UPDATE hr.departments SET head_employee_id = 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f' WHERE code = 'SUPPORT';
UPDATE hr.departments SET head_employee_id = 'e1000000-0000-0000-0000-000000000050' WHERE code = 'ENG';
UPDATE hr.departments SET head_employee_id = 'e1000000-0000-0000-0000-000000000060' WHERE code = 'IT';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) - Defense in Depth
-- 
-- RLS policies enforce access control at the database level, providing
-- protection even if the application layer has vulnerabilities.
--
-- Session variables (set by MCP server from JWT claims):
--   app.current_user_email - The authenticated user's email
--   app.current_user_roles - Comma-separated list of user's roles
-- =============================================================================

-- Enable RLS on the employees table
ALTER TABLE hr.employees ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can always see their own data
CREATE POLICY employee_self_access ON hr.employees
    FOR SELECT
    USING (work_email = current_setting('app.current_user_email', true));

-- Policy 2: Users with hr-read or hr-write role can see all employees
CREATE POLICY employee_hr_access ON hr.employees
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%hr-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%hr-write%'
    );

-- Policy 3: Users with executive role can see all employees (read-only)
CREATE POLICY employee_executive_access ON hr.employees
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%executive%'
    );

-- Policy 4: Managers can see their direct and indirect reports
-- Uses the is_manager_of function defined earlier
CREATE POLICY employee_manager_access ON hr.employees
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND is_manager_of(current_setting('app.current_user_email', true), work_email)
    );

-- Enable RLS on performance_reviews table
ALTER TABLE hr.performance_reviews ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own reviews
CREATE POLICY review_self_access ON hr.performance_reviews
    FOR SELECT
    USING (
        employee_id IN (
            SELECT id FROM hr.employees 
            WHERE work_email = current_setting('app.current_user_email', true)
        )
    );

-- Policy: HR can see all reviews
CREATE POLICY review_hr_access ON hr.performance_reviews
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%hr-read%'
        OR current_setting('app.current_user_roles', true) LIKE '%hr-write%'
    );

-- Policy: Managers can see reviews for their reports
CREATE POLICY review_manager_access ON hr.performance_reviews
    FOR SELECT
    USING (
        current_setting('app.current_user_roles', true) LIKE '%manager%'
        AND employee_id IN (
            SELECT e.id FROM hr.employees e
            WHERE is_manager_of(current_setting('app.current_user_email', true), e.work_email)
        )
    );

-- =============================================================================
-- HELPER FUNCTION: Set session context from JWT
-- Called by MCP server at the start of each request
-- =============================================================================
CREATE OR REPLACE FUNCTION set_user_context(user_email VARCHAR, user_roles VARCHAR)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_email', user_email, true);
    PERFORM set_config('app.current_user_roles', user_roles, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- AUDIT TABLE for access logging
-- =============================================================================
CREATE TABLE IF NOT EXISTS hr.access_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP DEFAULT NOW(),
    user_email VARCHAR(255) NOT NULL,
    user_roles TEXT,
    action VARCHAR(50) NOT NULL,  -- 'SELECT', 'AI_QUERY', etc.
    resource VARCHAR(100) NOT NULL,  -- 'employees', 'performance_reviews', etc.
    target_id UUID,  -- The record being accessed (if applicable)
    access_decision VARCHAR(20) NOT NULL,  -- 'ALLOWED', 'DENIED'
    access_justification TEXT,  -- Why access was allowed/denied
    query_text TEXT,  -- The AI query (if applicable)
    result_count INTEGER,  -- Number of records returned
    security_flags TEXT[],  -- Any prompt injection flags, etc.
    request_id UUID  -- Correlation ID for request tracing
);

-- Make audit log append-only (no updates or deletes)
CREATE RULE audit_no_update AS ON UPDATE TO hr.access_audit_log DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO hr.access_audit_log DO INSTEAD NOTHING;

-- Index for efficient audit queries
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON hr.access_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user ON hr.access_audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_decision ON hr.access_audit_log(access_decision);
CREATE INDEX IF NOT EXISTS idx_audit_request ON hr.access_audit_log(request_id);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tamshai;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tamshai;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO tamshai;
