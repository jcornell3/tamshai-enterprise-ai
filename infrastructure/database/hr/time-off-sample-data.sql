-- Tamshai Corp HR Time-Off Sample Data
-- Balances and requests for testing time-off functionality

\c tamshai_hr;

-- =============================================================================
-- TIME-OFF BALANCES (2025 & 2026)
-- Standard entitlements: VACATION=15, SICK=6, PERSONAL=3
-- =============================================================================

-- Insert 2025 balances for all active employees with some used time
INSERT INTO hr.time_off_balances (employee_id, type_code, fiscal_year, entitlement, used, pending, carryover)
SELECT
    e.id,
    'VACATION',
    2025,
    15.0,                                    -- Standard entitlement
    FLOOR(RANDOM() * 10)::DECIMAL(5,2),      -- Random used days 0-9
    0,
    0
FROM hr.employees e
WHERE e.status = 'ACTIVE'
ON CONFLICT (employee_id, type_code, fiscal_year) DO NOTHING;

INSERT INTO hr.time_off_balances (employee_id, type_code, fiscal_year, entitlement, used, pending, carryover)
SELECT
    e.id,
    'SICK',
    2025,
    6.0,
    FLOOR(RANDOM() * 3)::DECIMAL(5,2),
    0,
    0
FROM hr.employees e
WHERE e.status = 'ACTIVE'
ON CONFLICT (employee_id, type_code, fiscal_year) DO NOTHING;

INSERT INTO hr.time_off_balances (employee_id, type_code, fiscal_year, entitlement, used, pending, carryover)
SELECT
    e.id,
    'PERSONAL',
    2025,
    3.0,
    FLOOR(RANDOM() * 2)::DECIMAL(5,2),
    0,
    0
FROM hr.employees e
WHERE e.status = 'ACTIVE'
ON CONFLICT (employee_id, type_code, fiscal_year) DO NOTHING;

-- Insert 2026 balances with carryover from 2025
INSERT INTO hr.time_off_balances (employee_id, type_code, fiscal_year, entitlement, used, pending, carryover)
SELECT
    e.id,
    'VACATION',
    2026,
    15.0,
    0,
    0,
    LEAST(5.0, GREATEST(0, 15.0 - (SELECT COALESCE(used, 0) FROM hr.time_off_balances b
                                    WHERE b.employee_id = e.id
                                    AND b.type_code = 'VACATION'
                                    AND b.fiscal_year = 2025)))
FROM hr.employees e
WHERE e.status = 'ACTIVE'
ON CONFLICT (employee_id, type_code, fiscal_year) DO NOTHING;

INSERT INTO hr.time_off_balances (employee_id, type_code, fiscal_year, entitlement, used, pending, carryover)
SELECT
    e.id,
    'SICK',
    2026,
    6.0,
    0,
    0,
    LEAST(3.0, GREATEST(0, 6.0 - (SELECT COALESCE(used, 0) FROM hr.time_off_balances b
                                   WHERE b.employee_id = e.id
                                   AND b.type_code = 'SICK'
                                   AND b.fiscal_year = 2025)))
FROM hr.employees e
WHERE e.status = 'ACTIVE'
ON CONFLICT (employee_id, type_code, fiscal_year) DO NOTHING;

INSERT INTO hr.time_off_balances (employee_id, type_code, fiscal_year, entitlement, used, pending, carryover)
SELECT
    e.id,
    'PERSONAL',
    2026,
    3.0,
    0,
    0,
    LEAST(2.0, GREATEST(0, 3.0 - (SELECT COALESCE(used, 0) FROM hr.time_off_balances b
                                   WHERE b.employee_id = e.id
                                   AND b.type_code = 'PERSONAL'
                                   AND b.fiscal_year = 2025)))
FROM hr.employees e
WHERE e.status = 'ACTIVE'
ON CONFLICT (employee_id, type_code, fiscal_year) DO NOTHING;

-- =============================================================================
-- E2E TEST USER (test-user.journey) - Required for Playwright E2E tests
-- Must match the Keycloak user provisioned by tests/e2e/global-setup.ts
-- =============================================================================

INSERT INTO hr.employees (id, employee_id, employee_number, first_name, last_name, email, work_email, department, title, status)
VALUES ('e1000000-0000-0000-0000-000000000e2e', 'TEST001', 'E2E-001', 'Test', 'Journey', 'test-user@tamshai.com', 'test-user@tamshai.com', 'Testing', 'Journey Test Account', 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

INSERT INTO hr.time_off_balances (employee_id, type_code, fiscal_year, entitlement, used, pending, carryover)
VALUES
  ('e1000000-0000-0000-0000-000000000e2e', 'VACATION', 2025, 15.0, 3.0, 0, 0),
  ('e1000000-0000-0000-0000-000000000e2e', 'SICK', 2025, 6.0, 1.0, 0, 0),
  ('e1000000-0000-0000-0000-000000000e2e', 'PERSONAL', 2025, 3.0, 0, 0, 0),
  ('e1000000-0000-0000-0000-000000000e2e', 'VACATION', 2026, 15.0, 3.0, 0, 2.0),
  ('e1000000-0000-0000-0000-000000000e2e', 'SICK', 2026, 6.0, 1.0, 0, 1.0),
  ('e1000000-0000-0000-0000-000000000e2e', 'PERSONAL', 2026, 3.0, 0, 0, 1.0)
ON CONFLICT (employee_id, type_code, fiscal_year) DO NOTHING;

-- =============================================================================
-- SAMPLE TIME-OFF REQUESTS (Various statuses for testing)
-- =============================================================================

-- Approved vacation requests (past)
INSERT INTO hr.time_off_requests (employee_id, type_code, start_date, end_date, total_days, status, approver_id, approved_at, notes, approver_notes)
VALUES
    -- Marcus Johnson took vacation in December 2025
    ('e1000000-0000-0000-0000-000000000052', 'VACATION', '2025-12-20', '2025-12-31', 8, 'approved',
     'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', '2025-12-01 10:00:00',
     'Holiday vacation with family', 'Approved. Enjoy your holidays!'),

    -- Sophia Wang took sick leave
    ('e1000000-0000-0000-0000-000000000053', 'SICK', '2025-11-15', '2025-11-17', 2, 'approved',
     'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', '2025-11-15 08:00:00',
     'Flu symptoms, doctor appointment', 'Get well soon!'),

    -- Tyler Scott personal day
    ('e1000000-0000-0000-0000-000000000054', 'PERSONAL', '2025-10-25', '2025-10-25', 1, 'approved',
     'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d', '2025-10-20 14:00:00',
     'Moving to new apartment', NULL)
ON CONFLICT DO NOTHING;

-- Pending requests (for testing approval workflow)
INSERT INTO hr.time_off_requests (employee_id, type_code, start_date, end_date, total_days, status, notes)
VALUES
    -- Marcus Johnson wants vacation in March 2026
    ('e1000000-0000-0000-0000-000000000052', 'VACATION', '2026-03-10', '2026-03-14', 5, 'pending',
     'Spring break trip to Hawaii'),

    -- Amanda White wants time off in February
    ('e1000000-0000-0000-0000-000000000032', 'VACATION', '2026-02-14', '2026-02-18', 3, 'pending',
     'Extended Valentine weekend getaway'),

    -- David Park personal day
    ('e1000000-0000-0000-0000-000000000012', 'PERSONAL', '2026-02-10', '2026-02-10', 1, 'pending',
     'Doctor appointment in the morning'),

    -- Lisa Anderson sick leave
    ('e1000000-0000-0000-0000-000000000021', 'SICK', '2026-02-03', '2026-02-04', 2, 'pending',
     'Not feeling well, will see doctor'),

    -- Benjamin Carter vacation
    ('e1000000-0000-0000-0000-000000000055', 'VACATION', '2026-04-01', '2026-04-10', 8, 'pending',
     'Two week vacation to Japan')
ON CONFLICT DO NOTHING;

-- Rejected request (for testing rejection flow)
INSERT INTO hr.time_off_requests (employee_id, type_code, start_date, end_date, total_days, status, approver_id, approved_at, notes, approver_notes)
VALUES
    -- Chris Taylor request rejected due to team coverage
    ('e1000000-0000-0000-0000-000000000033', 'VACATION', '2025-12-26', '2025-12-31', 4, 'rejected',
     'e1000000-0000-0000-0000-000000000031', '2025-12-10 09:00:00',
     'End of year vacation', 'Unfortunately we need coverage during this critical sales period. Please request alternative dates.')
ON CONFLICT DO NOTHING;

-- Cancelled request (user cancelled their own request)
INSERT INTO hr.time_off_requests (employee_id, type_code, start_date, end_date, total_days, status, notes)
VALUES
    ('e1000000-0000-0000-0000-000000000042', 'VACATION', '2025-11-28', '2025-11-29', 2, 'cancelled',
     'Thanksgiving extension - plans changed')
ON CONFLICT DO NOTHING;

-- Update pending counts in balances for pending requests
UPDATE hr.time_off_balances b
SET pending = (
    SELECT COALESCE(SUM(r.total_days), 0)
    FROM hr.time_off_requests r
    WHERE r.employee_id = b.employee_id
      AND r.type_code = b.type_code
      AND r.status = 'pending'
      AND EXTRACT(YEAR FROM r.start_date) = b.fiscal_year
)
WHERE EXISTS (
    SELECT 1 FROM hr.time_off_requests r
    WHERE r.employee_id = b.employee_id
      AND r.type_code = b.type_code
      AND r.status = 'pending'
      AND EXTRACT(YEAR FROM r.start_date) = b.fiscal_year
);
