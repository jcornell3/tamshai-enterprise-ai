/**
 * Create Pay Run Tool Tests
 */
import { createPayRun, executeCreatePayRun } from './create-pay-run';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';
import * as redis from '../utils/redis';

jest.mock('../database/connection');
jest.mock('../utils/redis');
jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('createPayRun', () => {
  const writeUserContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['payroll-write'],
  };

  const readOnlyUserContext: UserContext = {
    userId: 'user-456',
    username: 'alice.chen',
    email: 'alice.chen@tamshai.com',
    roles: ['payroll-read'],
  };

  const validInput = {
    period_start: '2026-02-01',
    period_end: '2026-02-14',
    pay_date: '2026-02-20',
    employees: [
      { employee_id: 'emp-001', gross_pay: 5769.23, hours_worked: 0, overtime_hours: 0 },
      { employee_id: 'emp-002', gross_pay: 3600, hours_worked: 80, overtime_hours: 0 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (redis.storePendingConfirmation as jest.Mock).mockResolvedValue(undefined);
  });

  it('should return pending_confirmation for valid input', async () => {
    const result = await createPayRun(validInput, writeUserContext);

    expect(result.status).toBe('pending_confirmation');
    if (result.status === 'pending_confirmation') {
      expect(result.confirmationId).toBeDefined();
      expect(result.message).toContain('$9,369.23');
      expect(result.message).toContain('2 ');
      expect(redis.storePendingConfirmation).toHaveBeenCalledTimes(1);
    }
  });

  it('should reject users without write permission', async () => {
    const result = await createPayRun(validInput, readOnlyUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('WRITE_PERMISSION_REQUIRED');
    }
  });

  it('should reject invalid date ranges', async () => {
    const result = await createPayRun(
      { ...validInput, period_start: '2026-02-14', period_end: '2026-02-01' },
      writeUserContext
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INVALID_DATE_RANGE');
    }
  });

  it('should reject empty employees array', async () => {
    const result = await createPayRun(
      { ...validInput, employees: [] },
      writeUserContext
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INVALID_INPUT');
    }
  });

  it('should allow executive role', async () => {
    const execContext: UserContext = {
      userId: 'exec-123',
      username: 'eve.thompson',
      email: 'eve@tamshai.com',
      roles: ['executive'],
    };

    const result = await createPayRun(validInput, execContext);
    expect(result.status).toBe('pending_confirmation');
  });
});

describe('executeCreatePayRun', () => {
  const writeUserContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['payroll-write'],
  };

  const confirmationData = {
    action: 'create_pay_run',
    mcpServer: 'payroll',
    userId: 'user-123',
    timestamp: Date.now(),
    period_start: '2026-02-01',
    period_end: '2026-02-14',
    pay_date: '2026-02-20',
    employees: [
      { employee_id: 'emp-001', gross_pay: 5769.23, hours_worked: 0, overtime_hours: 0 },
    ],
    totalGross: 5769.23,
    employeeCount: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (dbConnection.queryWithRLS as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('should create pay run and pay stubs', async () => {
    const result = await executeCreatePayRun(confirmationData, writeUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.pay_run_id).toBeDefined();
      expect(result.data.status).toBe('DRAFT');
      expect(result.data.employee_count).toBe(1);
      expect(result.data.total_gross).toBe(5769.23);
    }

    // Should have been called twice: once for pay_run INSERT, once for pay_stub INSERT
    expect(dbConnection.queryWithRLS).toHaveBeenCalledTimes(2);
  });

  it('should insert multiple pay stubs for multiple employees', async () => {
    const multiEmployeeData = {
      ...confirmationData,
      employees: [
        { employee_id: 'emp-001', gross_pay: 5769.23, hours_worked: 0, overtime_hours: 0 },
        { employee_id: 'emp-002', gross_pay: 3600, hours_worked: 80, overtime_hours: 0 },
        { employee_id: 'emp-003', gross_pay: 4800, hours_worked: 80, overtime_hours: 10 },
      ],
      totalGross: 14169.23,
      employeeCount: 3,
    };

    const result = await executeCreatePayRun(multiEmployeeData, writeUserContext);

    expect(result.status).toBe('success');
    // 1 pay_run INSERT + 3 pay_stub INSERTs = 4 calls
    expect(dbConnection.queryWithRLS).toHaveBeenCalledTimes(4);
  });
});
