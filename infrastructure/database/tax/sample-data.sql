-- Tax Sample Data
-- Sample sales tax rates, quarterly estimates, filings, registrations, etc.

-- Connect to tax database (required for Docker init scripts)
\c tamshai_tax;

-- Clear existing data (for reseeding)
TRUNCATE tax.calendar_events CASCADE;
TRUNCATE tax.audit_logs CASCADE;
TRUNCATE tax.state_registrations CASCADE;
TRUNCATE tax.annual_filings CASCADE;
TRUNCATE tax.quarterly_estimates CASCADE;
TRUNCATE tax.sales_tax_rates CASCADE;

-- Sample Sales Tax Rates (2026 rates)
INSERT INTO tax.sales_tax_rates (rate_id, state, state_code, county, city, base_rate, local_rate, combined_rate, effective_date, notes) VALUES
-- California
('ca100001-0001-0001-0001-000000000001', 'California', 'CA', NULL, NULL, 0.0725, 0.0000, 0.0725, '2026-01-01', 'California base state rate'),
('ca100002-0002-0002-0002-000000000002', 'California', 'CA', 'Los Angeles', NULL, 0.0725, 0.0225, 0.0950, '2026-01-01', 'LA County rate'),
('ca100003-0003-0003-0003-000000000003', 'California', 'CA', 'San Francisco', 'San Francisco', 0.0725, 0.0125, 0.0850, '2026-01-01', 'SF City/County rate'),
('ca100004-0004-0004-0004-000000000004', 'California', 'CA', 'Santa Clara', 'San Jose', 0.0725, 0.0150, 0.0875, '2026-01-01', 'San Jose rate'),
-- Texas (no state income tax)
('00100001-0001-0001-0001-100000000001', 'Texas', 'TX', NULL, NULL, 0.0625, 0.0000, 0.0625, '2026-01-01', 'Texas base state rate'),
('00100002-0002-0002-0002-100000000002', 'Texas', 'TX', 'Harris', 'Houston', 0.0625, 0.0200, 0.0825, '2026-01-01', 'Houston rate'),
('00100003-0003-0003-0003-100000000003', 'Texas', 'TX', 'Dallas', 'Dallas', 0.0625, 0.0200, 0.0825, '2026-01-01', 'Dallas rate'),
-- New York
('00200001-0001-0001-0001-200000000001', 'New York', 'NY', NULL, NULL, 0.0400, 0.0000, 0.0400, '2026-01-01', 'New York base state rate'),
('00200002-0002-0002-0002-200000000002', 'New York', 'NY', 'New York', 'New York City', 0.0400, 0.0450, 0.0850, '2026-01-01', 'NYC rate'),
-- Florida
('00300001-0001-0001-0001-300000000001', 'Florida', 'FL', NULL, NULL, 0.0600, 0.0000, 0.0600, '2026-01-01', 'Florida base state rate'),
('00300002-0002-0002-0002-300000000002', 'Florida', 'FL', 'Miami-Dade', 'Miami', 0.0600, 0.0100, 0.0700, '2026-01-01', 'Miami rate'),
-- Washington (no state income tax)
('00400001-0001-0001-0001-400000000001', 'Washington', 'WA', NULL, NULL, 0.0650, 0.0000, 0.0650, '2026-01-01', 'Washington base state rate'),
('00400002-0002-0002-0002-400000000002', 'Washington', 'WA', 'King', 'Seattle', 0.0650, 0.0360, 0.1010, '2026-01-01', 'Seattle rate'),
-- Oregon (no sales tax)
('00500001-0001-0001-0001-500000000001', 'Oregon', 'OR', NULL, NULL, 0.0000, 0.0000, 0.0000, '2026-01-01', 'Oregon has no sales tax');

-- Quarterly Tax Estimates
INSERT INTO tax.quarterly_estimates (estimate_id, year, quarter, federal_estimate, state_estimate, local_estimate, total_estimate, due_date, status, paid_amount, paid_date, payment_reference, notes) VALUES
-- 2025 Q4 (completed)
('0e100001-2025-0004-0001-000000000001', 2025, 4, 28000.00, 8500.00, 500.00, 37000.00, '2026-01-15', 'paid', 37000.00, '2026-01-10', 'EFTPS-2025Q4-12345', 'Q4 2025 estimated taxes paid on time'),
-- 2026 Q1
('0e100002-2026-0001-0001-000000000001', 2026, 1, 30000.00, 9000.00, 600.00, 39600.00, '2026-04-15', 'pending', 0.00, NULL, NULL, 'Q1 2026 estimates based on projected income'),
-- 2026 Q2
('0e100003-2026-0002-0001-000000000001', 2026, 2, 32000.00, 9500.00, 650.00, 42150.00, '2026-06-15', 'pending', 0.00, NULL, NULL, 'Q2 2026 estimates - increased for summer revenue'),
-- 2026 Q3
('0e100004-2026-0003-0001-000000000001', 2026, 3, 31000.00, 9200.00, 620.00, 40820.00, '2026-09-15', 'pending', 0.00, NULL, NULL, 'Q3 2026 estimates'),
-- 2026 Q4
('0e100005-2026-0004-0001-000000000001', 2026, 4, 35000.00, 10500.00, 700.00, 46200.00, '2027-01-15', 'pending', 0.00, NULL, NULL, 'Q4 2026 estimates - holiday season increase'),
-- 2025 Q3 (historical, partial payment)
('0e100006-2025-0003-0001-000000000001', 2025, 3, 26000.00, 7800.00, 450.00, 34250.00, '2025-09-15', 'paid', 34250.00, '2025-09-12', 'EFTPS-2025Q3-11234', 'Q3 2025 paid'),
-- 2025 Q2
('0e100007-2025-0002-0001-000000000001', 2025, 2, 24000.00, 7200.00, 400.00, 31600.00, '2025-06-15', 'paid', 31600.00, '2025-06-14', 'EFTPS-2025Q2-10123', 'Q2 2025 paid');

-- Annual Filings
INSERT INTO tax.annual_filings (filing_id, year, filing_type, entity_name, entity_id, total_amount, filing_date, due_date, status, confirmation_number, notes) VALUES
-- 2025 1099s for contractors
('af100001-2025-1099-0001-000000000001', 2025, '1099', 'Acme Consulting LLC', 'contractor-1', 85000.00, '2026-01-28', '2026-01-31', 'filed', 'IRS-1099-2025-12345', 'Filed electronically'),
('af100002-2025-1099-0002-000000000002', 2025, '1099', 'Smith Consulting LLC', 'f0000001-0001-0001-0001-000000000001', 45000.00, '2026-01-29', '2026-01-31', 'filed', 'IRS-1099-2025-12346', 'Filed electronically'),
('af100003-2025-1099-0003-000000000003', 2025, '1099', 'Sarah Lee Freelance', 'f0000002-0002-0002-0002-000000000002', 28750.00, '2026-01-29', '2026-01-31', 'filed', 'IRS-1099-2025-12347', NULL),
('af100004-2025-1099-0004-000000000004', 2025, '1099', 'Wang Design Studio', 'f0000003-0003-0003-0003-000000000003', 72000.00, '2026-01-30', '2026-01-31', 'accepted', 'IRS-1099-2025-12348', 'IRS accepted'),
('af100005-2025-1099-0005-000000000005', 2025, '1099', 'JG Marketing', 'f0000004-0004-0004-0004-000000000004', 87500.00, '2026-01-30', '2026-01-31', 'accepted', 'IRS-1099-2025-12349', 'IRS accepted'),
-- 2025 W-2s (entity_id references hr.employees for cross-service joins)
('af100006-2025-0200-0001-000000000001', 2025, 'W-2', 'Alice Chen', 'f104eddc-21ab-457c-a254-78051ad7ad67', 150000.00, '2026-01-28', '2026-01-31', 'accepted', 'SSA-W2-2025-67890', 'SSA accepted'),
('af100007-2025-0200-0002-000000000002', 2025, 'W-2', 'Bob Martinez', '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1', 140000.00, '2026-01-28', '2026-01-31', 'accepted', 'SSA-W2-2025-67891', 'SSA accepted'),
('af100008-2025-0200-0003-000000000003', 2025, 'W-2', 'Carol Johnson', 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c', 160000.00, '2026-01-28', '2026-01-31', 'accepted', 'SSA-W2-2025-67892', 'SSA accepted'),
('af100009-2025-0200-0004-000000000004', 2025, 'W-2', 'Dan Williams', 'd7f8e9c0-2a3b-4c5d-9e1f-8a7b6c5d4e3f', 130000.00, '2026-01-28', '2026-01-31', 'accepted', 'SSA-W2-2025-67893', 'SSA accepted'),
('af100010-2025-0200-0005-000000000005', 2025, 'W-2', 'Eve Thompson', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 250000.00, '2026-01-28', '2026-01-31', 'accepted', 'SSA-W2-2025-67894', 'SSA accepted'),
('af100011-2025-0200-0006-000000000006', 2025, 'W-2', 'Sarah Kim', 'e1000000-0000-0000-0000-000000000003', 135000.00, '2026-01-30', '2026-01-31', 'accepted', 'SSA-W2-2025-67895', NULL),
-- 2025 941 Quarterly payroll tax returns
('af100012-2025-9410-0004-000000000001', 2025, '941', 'Q4 2025 Payroll Tax', '00000004-0000-0000-0000-000000000004', 45000.00, NULL, '2026-01-31', 'draft', NULL, 'Q4 941 in preparation'),
('af100013-2025-9410-0003-000000000001', 2025, '941', 'Q3 2025 Payroll Tax', '00000003-0000-0000-0000-000000000003', 43500.00, '2025-10-30', '2025-10-31', 'accepted', 'IRS-941-2025Q3-34567', 'Filed and accepted'),
-- 2024 amended 1099
('af100014-2024-1099-0001-000000000001', 2024, '1099', 'Old Vendor Inc', 'c0000000-0000-0000-0000-000000000001', 32000.00, '2025-01-15', '2025-01-31', 'amended', 'IRS-1099C-2024-99999', 'Corrected TIN');

-- State Tax Registrations
INSERT INTO tax.state_registrations (registration_id, state, state_code, registration_type, registration_number, registration_date, expiration_date, status, filing_frequency, next_filing_due, account_representative, notes) VALUES
('5a100001-ca00-5a1e-0001-000000000001', 'California', 'CA', 'sales_tax', 'CA-SALES-123456', '2023-01-15', NULL, 'active', 'quarterly', '2026-04-30', 'Jane Wilson (CDTFA)', 'California Sales Tax permit'),
('5a100002-ca00-1c00-0001-000000000001', 'California', 'CA', 'income_tax', 'CA-CORP-789012', '2023-01-15', NULL, 'active', 'quarterly', '2026-04-15', 'Mike Roberts (FTB)', 'CA corporation tax account'),
('5a100003-0000-f0a0-0001-000000000001', 'Texas', 'TX', 'franchise_tax', 'TX-FRAN-789012', '2023-03-01', '2026-03-01', 'active', 'annually', '2026-05-15', 'Texas Comptroller', 'Texas Franchise Tax registration'),
('5a100004-0000-1c00-0001-000000000001', 'New York', 'NY', 'income_tax', 'NY-INC-345678', '2022-06-01', NULL, 'pending', 'quarterly', '2026-04-15', NULL, 'Awaiting confirmation from NY Tax Authority'),
('5a100005-f100-5a1e-0001-000000000001', 'Florida', 'FL', 'sales_tax', 'FL-SALES-901234', '2021-01-01', '2024-01-01', 'expired', 'monthly', NULL, NULL, 'Renewal submitted - awaiting new certificate'),
('5a100006-0a00-b000-0001-000000000001', 'Washington', 'WA', 'sales_tax', 'WA-UBI-456789', '2022-08-01', NULL, 'active', 'quarterly', '2026-04-25', 'WA DOR Support', 'Washington B&O and Sales Tax'),
('5a100007-0000-1c00-0001-000000000001', 'Oregon', 'OR', 'income_tax', 'OR-BIN-234567', '2023-02-01', NULL, 'active', 'quarterly', '2026-04-15', NULL, 'Oregon has no sales tax - income only');

-- Audit Log Entries
INSERT INTO tax.audit_logs (log_id, timestamp, action, entity_type, entity_id, user_id, user_name, previous_value, new_value, ip_address, notes) VALUES
('a1100001-0001-0001-0001-000000000001', '2026-02-01 14:30:00+00', 'submit', 'filing', 'af100012-2025-9410-0004-000000000001', '00000001-0000-0000-0000-000000000001', 'Alice Chen', '{"status": "draft"}', '{"status": "filed", "confirmationNumber": "IRS-941-2026Q4-45678"}', '192.168.1.100', NULL),
('a1100002-0002-0002-0002-000000000002', '2026-01-31 10:15:00+00', 'create', 'filing', 'af100001-2025-1099-0001-000000000001', '00000001-0000-0000-0000-000000000001', 'Alice Chen', NULL, '{"entityName": "Acme Consulting LLC", "amount": 85000}', '192.168.1.100', NULL),
('a1100003-0003-0003-0003-000000000003', '2026-01-28 09:00:00+00', 'update', 'estimate', '0e100002-2026-0001-0001-000000000001', '00000002-0000-0000-0000-000000000002', 'Bob Martinez', '{"federalEstimate": 28000}', '{"federalEstimate": 30000}', '192.168.1.101', 'Adjusted based on Q4 income'),
('a1100004-0004-0004-0004-000000000004', '2026-01-25 16:45:00+00', 'approve', 'registration', '5a100001-ca00-5a1e-0001-000000000001', '00000003-0000-0000-0000-000000000003', 'Carol Johnson', '{"status": "pending"}', '{"status": "active"}', '192.168.1.102', NULL),
('a1100005-0005-0005-0005-000000000005', '2026-01-20 11:30:00+00', 'create', 'estimate', '0e100003-2026-0002-0001-000000000001', '00000002-0000-0000-0000-000000000002', 'Bob Martinez', NULL, '{"year": 2026, "quarter": 2, "totalEstimate": 42150}', '192.168.1.101', 'Initial Q2 estimate created'),
('a1100006-0006-0006-0006-000000000006', '2026-01-15 08:00:00+00', 'update', 'rate', 'ca100003-0003-0003-0003-000000000003', '00000000-0000-0000-0000-000000000000', 'System', '{"combinedRate": 0.0825}', '{"combinedRate": 0.0850}', NULL, 'Annual rate adjustment'),
('a1100007-0007-0007-0007-000000000007', '2026-01-10 14:00:00+00', 'submit', 'estimate', '0e100001-2025-0004-0001-000000000001', '00000002-0000-0000-0000-000000000002', 'Bob Martinez', '{"status": "pending", "paidAmount": 0}', '{"status": "paid", "paidAmount": 37000}', '192.168.1.101', 'Q4 2025 payment submitted via EFTPS');

-- Calendar Events (Tax Deadlines)
INSERT INTO tax.calendar_events (event_id, title, description, event_type, due_date, status, related_entity_type, related_entity_id, reminder_days) VALUES
('ce100001-0001-0001-0001-000000000001', 'Q1 2026 Federal Estimated Tax', 'Federal estimated tax payment due', 'deadline', '2026-04-15', 'pending', 'estimate', '0e100002-2026-0001-0001-000000000001', ARRAY[14, 7, 3]),
('ce100002-0002-0002-0002-000000000002', 'Q1 2026 CA Estimated Tax', 'California estimated tax payment due', 'deadline', '2026-04-15', 'pending', 'estimate', '0e100002-2026-0001-0001-000000000001', ARRAY[14, 7, 3]),
('ce100003-0003-0003-0003-000000000003', 'Q1 CA Sales Tax Return', 'California quarterly sales tax return', 'deadline', '2026-04-30', 'pending', 'registration', '5a100001-ca00-5a1e-0001-000000000001', ARRAY[14, 7, 3, 1]),
('ce100004-0004-0004-0004-000000000004', 'Texas Franchise Tax Annual Report', 'Annual Texas franchise tax filing', 'deadline', '2026-05-15', 'pending', 'registration', '5a100003-0000-f0a0-0001-000000000001', ARRAY[30, 14, 7]),
('ce100005-0005-0005-0005-000000000005', 'Form 940 (FUTA) Annual Filing', 'Annual federal unemployment tax return', 'deadline', '2026-01-31', 'completed', 'filing', NULL, ARRAY[14, 7, 3]),
('ce100006-0006-0006-0006-000000000006', 'W-2 Distribution Deadline', 'Distribute W-2s to employees', 'deadline', '2026-01-31', 'completed', 'filing', NULL, ARRAY[14, 7]),
('ce100007-0007-0007-0007-000000000007', 'Q2 2026 Federal Estimated Tax', 'Federal estimated tax payment due', 'deadline', '2026-06-15', 'pending', 'estimate', '0e100003-2026-0002-0001-000000000001', ARRAY[14, 7, 3]),
('ce100008-0008-0008-0008-000000000008', 'WA B&O Quarterly Return', 'Washington B&O and sales tax return', 'deadline', '2026-04-25', 'pending', 'registration', '5a100006-0a00-b000-0001-000000000001', ARRAY[14, 7, 3]);

-- Update statistics
ANALYZE tax.sales_tax_rates;
ANALYZE tax.quarterly_estimates;
ANALYZE tax.annual_filings;
ANALYZE tax.state_registrations;
ANALYZE tax.audit_logs;
ANALYZE tax.calendar_events;
