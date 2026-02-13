-- Payroll Sample Data
-- Sample employees, pay runs, pay stubs, contractors, etc.
-- Employee IDs reference hr.employees for cross-service joins

-- Connect to payroll database (required for Docker init scripts)
\c tamshai_payroll;

-- Clear existing data (for reseeding)
TRUNCATE payroll.contractor_payments CASCADE;
TRUNCATE payroll.contractors CASCADE;
TRUNCATE payroll.direct_deposit_accounts CASCADE;
TRUNCATE payroll.benefit_deductions CASCADE;
TRUNCATE payroll.tax_withholdings CASCADE;
TRUNCATE payroll.pay_stub_deductions CASCADE;
TRUNCATE payroll.pay_stub_taxes CASCADE;
TRUNCATE payroll.pay_stub_earnings CASCADE;
TRUNCATE payroll.pay_stubs CASCADE;
TRUNCATE payroll.pay_runs CASCADE;
TRUNCATE payroll.employees CASCADE;

-- Sample Employees (UUIDs match hr.employees for cross-service joins)
-- Display names: Alice Chen, Bob Martinez, Carol Johnson, Dan Williams, Eve Thompson, Frank Davis, Sarah Kim, Kevin Brown
INSERT INTO payroll.employees (employee_id, first_name, last_name, email, hire_date, department, job_title, employment_type, pay_type, annual_salary, hourly_rate, pay_frequency, status) VALUES
('f104eddc-21ab-457c-a254-78051ad7ad67', 'Alice', 'Chen', 'alice@tamshai-playground.local', '2020-03-15', 'Human Resources', 'VP of HR', 'FULL_TIME', 'SALARY', 150000.00, NULL, 'BI_WEEKLY', 'ACTIVE'),
('1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'Bob', 'Martinez', 'bob@tamshai-playground.local', '2019-08-01', 'Finance', 'Finance Director', 'FULL_TIME', 'SALARY', 140000.00, NULL, 'BI_WEEKLY', 'ACTIVE'),
('c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'Carol', 'Johnson', 'carol@tamshai-playground.local', '2021-01-10', 'Sales', 'VP of Sales', 'FULL_TIME', 'SALARY', 160000.00, NULL, 'BI_WEEKLY', 'ACTIVE'),
('d7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'Dan', 'Williams', 'dan@tamshai-playground.local', '2020-06-01', 'Support', 'Support Director', 'FULL_TIME', 'SALARY', 130000.00, NULL, 'BI_WEEKLY', 'ACTIVE'),
('e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'Eve', 'Thompson', 'eve@tamshai-playground.local', '2018-01-01', 'Executive', 'CEO', 'FULL_TIME', 'SALARY', 250000.00, NULL, 'SEMI_MONTHLY', 'ACTIVE'),
('b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e', 'Frank', 'Davis', 'frank@tamshai-playground.local', '2023-06-15', 'IT', 'IT Intern', 'FULL_TIME', 'HOURLY', NULL, 22.50, 'BI_WEEKLY', 'ACTIVE'),
('e1000000-0000-0000-0000-000000000003', 'Sarah', 'Kim', 'sarah.k@tamshai-playground.local', '2022-02-01', 'Engineering', 'Senior Developer', 'FULL_TIME', 'SALARY', 135000.00, NULL, 'BI_WEEKLY', 'ACTIVE'),
('e1000000-0000-0000-0000-000000000022', 'Kevin', 'Brown', 'kevin.b@tamshai-playground.local', '2021-09-01', 'Marketing', 'Marketing Manager', 'FULL_TIME', 'SALARY', 95000.00, NULL, 'BI_WEEKLY', 'ACTIVE');

-- Sample Pay Runs
INSERT INTO payroll.pay_runs (pay_run_id, pay_period_start, pay_period_end, pay_date, pay_frequency, status, total_gross, total_net, total_taxes, total_deductions, employer_taxes, employer_benefits, employee_count, processed_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-01-01', '2026-01-15', '2026-01-20', 'BI_WEEKLY', 'PROCESSED', 85000.00, 59500.00, 17000.00, 8500.00, 6502.50, 4250.00, 8, '2026-01-18 10:00:00'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-01-16', '2026-01-31', '2026-02-05', 'BI_WEEKLY', 'APPROVED', 86000.00, 60200.00, 17200.00, 8600.00, 6579.00, 4300.00, 8, NULL),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-02-01', '2026-02-15', '2026-02-20', 'BI_WEEKLY', 'DRAFT', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0, NULL);

-- Sample Pay Stubs for Alice Chen (Jan 1-15)
INSERT INTO payroll.pay_stubs (pay_stub_id, employee_id, pay_run_id, pay_period_start, pay_period_end, pay_date, gross_pay, net_pay, total_taxes, total_deductions, hours_worked, overtime_hours, ytd_gross, ytd_net, ytd_taxes) VALUES
('a1000001-0001-0001-0001-000000000001', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-01-01', '2026-01-15', '2026-01-20', 5769.23, 4038.46, 1153.85, 576.92, 80, 0, 5769.23, 4038.46, 1153.85);

INSERT INTO payroll.pay_stub_earnings (pay_stub_id, earning_type, description, hours, rate, amount) VALUES
('a1000001-0001-0001-0001-000000000001', 'REGULAR', 'Salary', NULL, NULL, 5769.23);

INSERT INTO payroll.pay_stub_taxes (pay_stub_id, tax_type, description, amount, ytd_amount) VALUES
('a1000001-0001-0001-0001-000000000001', 'FEDERAL', 'Federal Income Tax', 692.31, 692.31),
('a1000001-0001-0001-0001-000000000001', 'STATE', 'CA State Tax', 288.46, 288.46),
('a1000001-0001-0001-0001-000000000001', 'FICA_SS', 'Social Security', 115.38, 115.38),
('a1000001-0001-0001-0001-000000000001', 'FICA_MED', 'Medicare', 57.70, 57.70);

INSERT INTO payroll.pay_stub_deductions (pay_stub_id, deduction_type, description, amount, is_pretax, ytd_amount) VALUES
('a1000001-0001-0001-0001-000000000001', 'HEALTH', 'Health Insurance - PPO', 250.00, true, 250.00),
('a1000001-0001-0001-0001-000000000001', '401K', '401(k) Contribution (6%)', 346.15, true, 346.15),
('a1000001-0001-0001-0001-000000000001', 'DENTAL', 'Dental Insurance', 35.00, true, 35.00);

-- Sample Pay Stub for Bob Martinez (Jan 1-15)
INSERT INTO payroll.pay_stubs (pay_stub_id, employee_id, pay_run_id, pay_period_start, pay_period_end, pay_date, gross_pay, net_pay, total_taxes, total_deductions, hours_worked, overtime_hours, ytd_gross, ytd_net, ytd_taxes) VALUES
('b2000002-0002-0002-0002-000000000002', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-01-01', '2026-01-15', '2026-01-20', 5384.62, 3769.23, 1076.92, 538.47, 80, 0, 5384.62, 3769.23, 1076.92);

INSERT INTO payroll.pay_stub_earnings (pay_stub_id, earning_type, description, hours, rate, amount) VALUES
('b2000002-0002-0002-0002-000000000002', 'REGULAR', 'Salary', NULL, NULL, 5384.62);

INSERT INTO payroll.pay_stub_taxes (pay_stub_id, tax_type, description, amount, ytd_amount) VALUES
('b2000002-0002-0002-0002-000000000002', 'FEDERAL', 'Federal Income Tax', 646.15, 646.15),
('b2000002-0002-0002-0002-000000000002', 'STATE', 'CA State Tax', 269.23, 269.23),
('b2000002-0002-0002-0002-000000000002', 'FICA_SS', 'Social Security', 107.69, 107.69),
('b2000002-0002-0002-0002-000000000002', 'FICA_MED', 'Medicare', 53.85, 53.85);

INSERT INTO payroll.pay_stub_deductions (pay_stub_id, deduction_type, description, amount, is_pretax, ytd_amount) VALUES
('b2000002-0002-0002-0002-000000000002', 'HEALTH', 'Health Insurance - HMO', 200.00, true, 200.00),
('b2000002-0002-0002-0002-000000000002', '401K', '401(k) Contribution (5%)', 269.23, true, 269.23),
('b2000002-0002-0002-0002-000000000002', 'HSA', 'Health Savings Account', 100.00, true, 100.00);

-- Sample Tax Withholdings (employee_id references hr.employees)
INSERT INTO payroll.tax_withholdings (withholding_id, employee_id, federal_filing_status, federal_allowances, federal_additional, state, state_filing_status, state_allowances, effective_date) VALUES
('c1000001-1111-1111-1111-111111111111', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'MARRIED_FILING_JOINTLY', 2, 0, 'CA', 'Married', 2, '2020-03-15'),
('c2000002-2222-2222-2222-222222222222', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'SINGLE', 1, 50, 'CA', 'Single', 1, '2019-08-01'),
('c3000003-3333-3333-3333-333333333333', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'HEAD_OF_HOUSEHOLD', 3, 0, 'CA', 'Head of Household', 2, '2021-01-10'),
('c4000004-4444-4444-4444-444444444444', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 'MARRIED_FILING_JOINTLY', 2, 25, 'WA', NULL, 0, '2020-06-01'),
('c5000005-5555-5555-5555-555555555555', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'SINGLE', 0, 100, 'CA', 'Single', 0, '2018-01-01'),
('c6000006-6666-6666-6666-666666666666', 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e', 'SINGLE', 0, 0, 'CA', 'Single', 0, '2023-06-15'),
('c7000007-7777-7777-7777-777777777777', 'e1000000-0000-0000-0000-000000000003', 'MARRIED_FILING_SEPARATELY', 1, 0, 'OR', 'Married Filing Separately', 1, '2022-02-01'),
('c8000008-8888-8888-8888-888888888888', 'e1000000-0000-0000-0000-000000000022', 'SINGLE', 1, 0, 'TX', NULL, 0, '2021-09-01');

-- Sample Benefit Deductions (employee_id references hr.employees)
INSERT INTO payroll.benefit_deductions (deduction_id, employee_id, benefit_type, benefit_name, employee_amount, employer_contribution, frequency, is_pretax, effective_date, status) VALUES
-- Alice Chen's benefits
('d1000001-0001-0001-0001-000000000001', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'health', 'Health Insurance - PPO', 250.00, 500.00, 'PER_PAY_PERIOD', true, '2020-03-15', 'ACTIVE'),
('d1000002-0001-0001-0001-000000000002', 'f104eddc-21ab-457c-a254-78051ad7ad67', '401k', '401(k) Retirement', 346.15, 173.08, 'PER_PAY_PERIOD', true, '2020-03-15', 'ACTIVE'),
('d1000003-0001-0001-0001-000000000003', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'dental', 'Dental Insurance', 35.00, 35.00, 'PER_PAY_PERIOD', true, '2020-03-15', 'ACTIVE'),
-- Bob Martinez's benefits
('d2000001-0002-0002-0002-000000000001', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'health', 'Health Insurance - HMO', 200.00, 450.00, 'PER_PAY_PERIOD', true, '2019-08-01', 'ACTIVE'),
('d2000002-0002-0002-0002-000000000002', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', '401k', '401(k) Retirement', 269.23, 134.62, 'PER_PAY_PERIOD', true, '2019-08-01', 'ACTIVE'),
('d2000003-0002-0002-0002-000000000003', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'hsa', 'Health Savings Account', 100.00, 0.00, 'PER_PAY_PERIOD', true, '2019-08-01', 'ACTIVE'),
-- Carol Johnson's benefits
('d3000001-0003-0003-0003-000000000001', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'health', 'Health Insurance - PPO Family', 450.00, 900.00, 'PER_PAY_PERIOD', true, '2021-01-10', 'ACTIVE'),
('d3000002-0003-0003-0003-000000000002', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', '401k', '401(k) Retirement', 615.38, 307.69, 'PER_PAY_PERIOD', true, '2021-01-10', 'ACTIVE'),
('d3000003-0003-0003-0003-000000000003', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'vision', 'Vision Insurance', 15.00, 15.00, 'PER_PAY_PERIOD', true, '2021-01-10', 'ACTIVE');

-- Sample Direct Deposit Accounts (employee_id references hr.employees)
INSERT INTO payroll.direct_deposit_accounts (account_id, employee_id, account_type, bank_name, routing_number, account_number, allocation_type, allocation_value, priority, status) VALUES
('e1000001-0001-0001-0001-000000000001', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'CHECKING', 'Chase Bank', '021000021', '123456789012', 'PERCENTAGE', 80, 1, 'ACTIVE'),
('e1000002-0001-0001-0001-000000000002', 'f104eddc-21ab-457c-a254-78051ad7ad67', 'SAVINGS', 'Chase Bank', '021000021', '987654321098', 'REMAINDER', NULL, 2, 'ACTIVE'),
('e2000001-0002-0002-0002-000000000001', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 'CHECKING', 'Bank of America', '026009593', '112233445566', 'REMAINDER', NULL, 1, 'ACTIVE'),
('e3000001-0003-0003-0003-000000000001', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'CHECKING', 'Wells Fargo', '121000248', '778899001122', 'FIXED_AMOUNT', 3000.00, 1, 'ACTIVE'),
('e3000002-0003-0003-0003-000000000002', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 'SAVINGS', 'Marcus', '124085066', '334455667788', 'REMAINDER', NULL, 2, 'ACTIVE');

-- Sample Contractors (independent of HR employees)
INSERT INTO payroll.contractors (contractor_id, first_name, last_name, company_name, email, phone, tax_id, city, state, zip_code, status, payment_method, hourly_rate, contract_start_date, contract_end_date, ytd_payments) VALUES
('f0000001-0001-0001-0001-000000000001', 'John', 'Smith', 'Smith Consulting LLC', 'john.smith@smithconsulting.com', '555-123-4567', '123456789', 'San Francisco', 'CA', '94102', 'ACTIVE', 'ACH', 150.00, '2025-01-01', NULL, 45000.00),
('f0000002-0002-0002-0002-000000000002', 'Sarah', 'Lee', NULL, 'sarah.lee@freelance.com', '555-987-6543', '987654321', 'Portland', 'OR', '97201', 'ACTIVE', 'ACH', 125.00, '2025-03-15', '2026-03-14', 28750.00),
('f0000003-0003-0003-0003-000000000003', 'Michael', 'Wang', 'Wang Design Studio', 'michael@wangdesign.com', '555-456-7890', '456789123', 'Seattle', 'WA', '98101', 'ACTIVE', 'CHECK', 100.00, '2024-06-01', NULL, 72000.00),
('f0000004-0004-0004-0004-000000000004', 'Jennifer', 'Garcia', 'JG Marketing', 'jen@jgmarketing.com', '555-321-9876', '321987654', 'Austin', 'TX', '78701', 'INACTIVE', 'ACH', 175.00, '2024-01-01', '2025-12-31', 87500.00);

-- Sample Contractor Payments
INSERT INTO payroll.contractor_payments (payment_id, contractor_id, payment_date, amount, description, invoice_number, status, payment_method, processed_at) VALUES
('ff000001-0001-0001-0001-000000000001', 'f0000001-0001-0001-0001-000000000001', '2026-01-15', 7500.00, 'Software development - January', 'INV-2026-001', 'PROCESSED', 'ACH', '2026-01-15 10:00:00'),
('ff000002-0002-0002-0002-000000000002', 'f0000002-0002-0002-0002-000000000002', '2026-01-15', 5000.00, 'UX consulting - January', 'INV-2026-015', 'PROCESSED', 'ACH', '2026-01-15 10:00:00'),
('ff000003-0003-0003-0003-000000000003', 'f0000003-0003-0003-0003-000000000003', '2026-01-20', 4000.00, 'Logo redesign project', 'WD-2026-003', 'PROCESSED', 'CHECK', '2026-01-22 14:00:00'),
('ff000004-0004-0004-0004-000000000004', 'f0000001-0001-0001-0001-000000000001', '2026-02-01', 7500.00, 'Software development - February', 'INV-2026-002', 'PENDING', 'ACH', NULL);

-- Update statistics
ANALYZE payroll.employees;
ANALYZE payroll.pay_runs;
ANALYZE payroll.pay_stubs;
ANALYZE payroll.tax_withholdings;
ANALYZE payroll.benefit_deductions;
ANALYZE payroll.direct_deposit_accounts;
ANALYZE payroll.contractors;
ANALYZE payroll.contractor_payments;
