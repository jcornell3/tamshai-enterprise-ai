/**
 * Calculate Earnings Tool Tests
 */
import { calculateEarnings } from './calculate-earnings';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';

jest.mock('../database/connection');
jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('calculateEarnings', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['payroll-read'],
  };

  const mockSalaryEmployees = [
    {
      employee_id: 'emp-001',
      first_name: 'Alice',
      last_name: 'Chen',
      department: 'Human Resources',
      pay_type: 'SALARY',
      salary: 150000,
      hourly_rate: null,
    },
    {
      employee_id: 'emp-002',
      first_name: 'Bob',
      last_name: 'Martinez',
      department: 'Finance',
      pay_type: 'SALARY',
      salary: 140000,
      hourly_rate: null,
    },
  ];

  const mockHourlyEmployee = {
    employee_id: 'emp-003',
    first_name: 'Frank',
    last_name: 'Davis',
    department: 'IT',
    pay_type: 'HOURLY',
    salary: null,
    hourly_rate: 45.0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should calculate biweekly salary correctly (14-day period)', async () => {
    (dbConnection.queryWithRLS as jest.Mock).mockResolvedValue({
      rows: [mockSalaryEmployees[0]],
      rowCount: 1,
    });

    const result = await calculateEarnings(
      { period_start: '2026-01-01', period_end: '2026-01-14', standard_hours: 80 },
      mockUserContext
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(1);
      // $150,000 / 26 biweekly periods = $5,769.23 per period
      expect(result.data[0].gross_pay).toBeCloseTo(5769.23, 1);
      expect(result.data[0].pay_type).toBe('SALARY');
      expect(result.data[0].hours_worked).toBe(0); // Salary employees don't track hours
    }
  });

  it('should calculate hourly pay correctly', async () => {
    (dbConnection.queryWithRLS as jest.Mock).mockResolvedValue({
      rows: [mockHourlyEmployee],
      rowCount: 1,
    });

    const result = await calculateEarnings(
      { period_start: '2026-01-01', period_end: '2026-01-14', standard_hours: 80 },
      mockUserContext
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(1);
      // $45/hr * 80 hours = $3,600
      expect(result.data[0].gross_pay).toBe(3600);
      expect(result.data[0].hours_worked).toBe(80);
      expect(result.data[0].overtime_hours).toBe(0);
    }
  });

  it('should handle custom standard_hours for hourly employees', async () => {
    (dbConnection.queryWithRLS as jest.Mock).mockResolvedValue({
      rows: [mockHourlyEmployee],
      rowCount: 1,
    });

    const result = await calculateEarnings(
      { period_start: '2026-01-01', period_end: '2026-01-07', standard_hours: 40 },
      mockUserContext
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      // $45/hr * 40 hours = $1,800
      expect(result.data[0].gross_pay).toBe(1800);
      expect(result.data[0].hours_worked).toBe(40);
    }
  });

  it('should handle multiple employees (salary + hourly mix)', async () => {
    (dbConnection.queryWithRLS as jest.Mock).mockResolvedValue({
      rows: [...mockSalaryEmployees, mockHourlyEmployee],
      rowCount: 3,
    });

    const result = await calculateEarnings(
      { period_start: '2026-01-01', period_end: '2026-01-14', standard_hours: 80 },
      mockUserContext
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(3);
      // All should have gross_pay > 0
      result.data.forEach((emp) => {
        expect(emp.gross_pay).toBeGreaterThan(0);
      });
    }
  });

  it('should return empty array when no active employees', async () => {
    (dbConnection.queryWithRLS as jest.Mock).mockResolvedValue({
      rows: [],
      rowCount: 0,
    });

    const result = await calculateEarnings(
      { period_start: '2026-01-01', period_end: '2026-01-14', standard_hours: 80 },
      mockUserContext
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(0);
    }
  });

  it('should prorate salary for non-standard period lengths', async () => {
    (dbConnection.queryWithRLS as jest.Mock).mockResolvedValue({
      rows: [mockSalaryEmployees[0]],
      rowCount: 1,
    });

    // 7-day period = half of biweekly
    const result = await calculateEarnings(
      { period_start: '2026-01-01', period_end: '2026-01-07', standard_hours: 40 },
      mockUserContext
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      // $150,000/26 * (7/14) = $2,884.62
      expect(result.data[0].gross_pay).toBeCloseTo(2884.62, 1);
    }
  });
});
