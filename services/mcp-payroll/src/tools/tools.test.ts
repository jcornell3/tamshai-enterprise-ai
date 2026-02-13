/**
 * Payroll Tools Unit Tests
 */

// Mock database connection before imports
const mockQueryWithRLS = jest.fn();

jest.mock('../database/connection', () => ({
  queryWithRLS: mockQueryWithRLS,
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { UserContext } from '../database/connection';
import { getBenefits, GetBenefitsInput, BenefitDeduction } from './get-benefits';
import { getDirectDeposit, GetDirectDepositInput } from './get-direct-deposit';
import { getPayStub, GetPayStubInput } from './get-pay-stub';
import { getPayrollSummary, GetPayrollSummaryInput } from './get-payroll-summary';
import { getTaxWithholdings, GetTaxWithholdingsInput } from './get-tax-withholdings';
import { listContractors, ListContractorsInput } from './list-contractors';
import { listPayStubs, ListPayStubsInput } from './list-pay-stubs';

describe('Payroll Tools', () => {
  // Use valid UUIDs for test data
  const validEmployeeId = '550e8400-e29b-41d4-a716-446655440000';
  const validPayStubId = '550e8400-e29b-41d4-a716-446655440001';

  const userContext: UserContext = {
    userId: validEmployeeId,
    username: 'alice.chen',
    email: 'alice@tamshai.local',
    roles: ['payroll-read', 'payroll-write'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBenefits', () => {
    it('should return benefits for specified employee', async () => {
      const mockBenefits: BenefitDeduction[] = [
        {
          deduction_id: 'ded-1',
          employee_id: validEmployeeId,
          type: 'HEALTH',
          name: 'Medical Insurance',
          amount: 200,
          employer_contribution: 400,
          frequency: 'MONTHLY',
          is_pretax: true,
          effective_date: '2026-01-01',
          end_date: null,
          status: 'ACTIVE',
        },
      ];

      mockQueryWithRLS.mockResolvedValue({ rows: mockBenefits, rowCount: 1 });

      const input: GetBenefitsInput = { employeeId: validEmployeeId };
      const result = await getBenefits(input, userContext);

      expect(result.status).toBe('success');
      expect((result as any).data).toEqual(mockBenefits);
    });

    it('should use current user ID when employeeId not provided', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      const input: GetBenefitsInput = {};
      await getBenefits(input, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        [validEmployeeId]
      );
    });

    it('should return empty array when no benefits found', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await getBenefits({}, userContext);

      expect(result.status).toBe('success');
      expect((result as any).data).toEqual([]);
    });
  });

  describe('getDirectDeposit', () => {
    it('should return direct deposit accounts for employee', async () => {
      const mockAccounts = [
        {
          account_id: 'acc-1',
          employee_id: validEmployeeId,
          account_type: 'CHECKING',
          bank_name: 'First Bank',
          account_last_four: '1234',
          routing_number_last_four: '5678',
          allocation_type: 'PERCENTAGE',
          allocation_value: 100,
          is_primary: true,
          status: 'ACTIVE',
        },
      ];

      mockQueryWithRLS.mockResolvedValue({ rows: mockAccounts, rowCount: 1 });

      const input: GetDirectDepositInput = { employeeId: validEmployeeId };
      const result = await getDirectDeposit(input, userContext);

      expect(result.status).toBe('success');
      expect((result as any).data).toEqual(mockAccounts);
    });

    it('should use current user ID when employeeId not provided', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      await getDirectDeposit({}, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        [validEmployeeId]
      );
    });
  });

  describe('getPayStub', () => {
    it('should return pay stub by ID', async () => {
      const mockHeader = {
        pay_stub_id: validPayStubId,
        employee_id: validEmployeeId,
        employee_name: 'Alice Chen',
        pay_run_id: 'pr-123',
        pay_period_start: '2026-01-01',
        pay_period_end: '2026-01-15',
        pay_date: '2026-01-15',
        gross_pay: 5000,
        net_pay: 3800,
        total_taxes: 900,
        total_deductions: 300,
        hours_worked: 80,
        overtime_hours: 0,
        ytd_gross: 5000,
        ytd_net: 3800,
        ytd_taxes: 900,
      };
      const mockEarnings = [{ type: 'REGULAR', description: 'Base Pay', hours: 80, rate: 62.50, amount: 5000 }];
      const mockTaxes = [{ type: 'FEDERAL', description: 'Federal Tax', amount: 500, ytd_amount: 500 }];
      const mockDeductions = [{ type: 'HEALTH', description: 'Health Insurance', amount: 200, is_pretax: true, ytd_amount: 200 }];

      // Mock the 4 queries: header, earnings, taxes, deductions
      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockHeader], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockEarnings, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockTaxes, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockDeductions, rowCount: 1 });

      const input: GetPayStubInput = { payStubId: validPayStubId };
      const result = await getPayStub(input, userContext);

      expect(result.status).toBe('success');
      expect((result as any).data.pay_stub_id).toBe(validPayStubId);
      expect((result as any).data.earnings).toEqual(mockEarnings);
      expect((result as any).data.taxes).toEqual(mockTaxes);
      expect((result as any).data.deductions).toEqual(mockDeductions);
    });

    it('should return error when pay stub not found', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      const input: GetPayStubInput = { payStubId: validPayStubId };
      const result = await getPayStub(input, userContext);

      expect(result.status).toBe('error');
      expect((result as any).code).toBe('PAY_STUB_NOT_FOUND');
    });
  });

  describe('getPayrollSummary', () => {
    it('should return payroll summary for year and month', async () => {
      // Mock the 6 queries in order: summary, employee count, contractor count, pending, next pay date, ytd
      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [{  // summary data
          total_gross_pay: '250000',
          total_net_pay: '190000',
          total_taxes: '45000',
          total_deductions: '15000',
          total_employer_taxes: '20000',
          total_employer_benefits: '30000',
          pay_run_count: '2',
        }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '50' }], rowCount: 1 }) // employee count
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 }) // contractor count
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // pending count
        .mockResolvedValueOnce({ rows: [{ pay_date: '2026-01-31' }], rowCount: 1 }) // next pay date
        .mockResolvedValueOnce({ rows: [{  // ytd totals
          gross_pay: '250000',
          net_pay: '190000',
          taxes: '45000',
          deductions: '15000',
        }], rowCount: 1 });

      const input: GetPayrollSummaryInput = { year: 2026, month: 1 };
      const result = await getPayrollSummary(input, userContext);

      expect(result.status).toBe('success');
      expect((result as any).data).toBeDefined();
      expect((result as any).data.period).toBe('2026-01');
      expect((result as any).data.employee_count).toBe(50);
    });

    it('should use current year when year not provided', async () => {
      // Mock the 6 queries with valid string data (DB returns strings)
      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [{ total_gross_pay: '0', total_net_pay: '0', total_taxes: '0', total_deductions: '0', total_employer_taxes: '0', total_employer_benefits: '0', pay_run_count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ gross_pay: '0', net_pay: '0', taxes: '0', deductions: '0' }], rowCount: 1 });

      const input: GetPayrollSummaryInput = {};
      await getPayrollSummary(input, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalled();
    });
  });

  describe('getTaxWithholdings', () => {
    it('should return tax withholdings for employee', async () => {
      const mockWithholdings = {
        employee_id: validEmployeeId,
        federal_filing_status: 'SINGLE',
        federal_allowances: 1,
        additional_federal_withholding: 0,
        state: 'CA',
        state_filing_status: 'SINGLE',
        state_allowances: 1,
        additional_state_withholding: 0,
        is_exempt_federal: false,
        is_exempt_state: false,
        effective_date: '2026-01-01',
      };

      mockQueryWithRLS.mockResolvedValue({ rows: [mockWithholdings], rowCount: 1 });

      const input: GetTaxWithholdingsInput = { employeeId: validEmployeeId };
      const result = await getTaxWithholdings(input, userContext);

      expect(result.status).toBe('success');
      expect((result as any).data).toEqual(mockWithholdings);
    });

    it('should return success with null when withholdings not found', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      const input: GetTaxWithholdingsInput = { employeeId: validEmployeeId };
      const result = await getTaxWithholdings(input, userContext);

      // Implementation returns success with null data for "no withholding configured"
      expect(result.status).toBe('success');
      expect((result as any).data).toBeNull();
      expect((result as any).metadata?.hint).toBe('No withholding configured');
    });
  });

  describe('listContractors', () => {
    it('should return paginated list of contractors', async () => {
      const mockContractors = [
        {
          contractor_id: 'c-1',
          first_name: 'John',
          last_name: 'Doe',
          company_name: 'Doe Consulting',
          email: 'john@doe.com',
          phone: '555-1234',
          tax_id_last_four: '1234',
          status: 'ACTIVE',
          payment_method: 'ACH',
          hourly_rate: 75,
          contract_start_date: '2025-06-01',
          contract_end_date: null,
          ytd_payments: 15000,
          created_at: '2025-06-01',
        },
      ];

      mockQueryWithRLS.mockResolvedValue({ rows: mockContractors, rowCount: 1 });

      const input: ListContractorsInput = { limit: 50 };
      const result = await listContractors(input, userContext);

      expect(result.status).toBe('success');
      expect((result as any).data).toEqual(mockContractors);
    });

    it('should filter by status', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      const input: ListContractorsInput = { limit: 50, status: 'ACTIVE' };
      await listContractors(input, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalled();
      const [, query, params] = mockQueryWithRLS.mock.calls[0];
      expect(query).toContain('status');
      expect(params).toContain('ACTIVE');
    });

    it('should search by name or company', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      const input: ListContractorsInput = { limit: 50, search: 'John' };
      await listContractors(input, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalled();
      const [, query, params] = mockQueryWithRLS.mock.calls[0];
      expect(query).toContain('ILIKE');
      expect(params).toContain('%John%');
    });

    it('should include pagination metadata when hasMore is true', async () => {
      // Return 51 records to trigger hasMore
      const mockContractors = Array(51).fill(null).map((_, i) => ({
        contractor_id: `c-${i}`,
        first_name: 'John',
        last_name: `Doe${i}`,
        company_name: null,
        email: `john${i}@example.com`,
        phone: null,
        tax_id_last_four: '1234',
        status: 'ACTIVE',
        payment_method: 'ACH',
        hourly_rate: 75,
        contract_start_date: '2025-06-01',
        contract_end_date: null,
        ytd_payments: 0,
        created_at: '2025-06-01',
      }));

      mockQueryWithRLS.mockResolvedValue({ rows: mockContractors, rowCount: 51 });

      const input: ListContractorsInput = { limit: 50 };
      const result = await listContractors(input, userContext);

      expect(result.status).toBe('success');
      expect((result as any).data.length).toBe(50);
      expect((result as any).metadata?.hasMore).toBe(true);
      expect((result as any).metadata?.nextCursor).toBeDefined();
    });

    it('should return error for invalid cursor', async () => {
      const input: ListContractorsInput = { limit: 50, cursor: 'invalid-cursor' };
      const result = await listContractors(input, userContext);

      expect(result.status).toBe('error');
      expect((result as any).code).toBe('INVALID_INPUT');
    });
  });

  describe('listPayStubs', () => {
    it('should return paginated list of pay stubs', async () => {
      const mockPayStubs = [
        {
          pay_stub_id: 'ps-1',
          employee_id: validEmployeeId,
          employee_name: 'Alice Chen',
          pay_run_id: 'pr-1',
          gross_pay: 5000,
          net_pay: 3800,
          pay_date: '2026-01-15',
          pay_period_start: '2026-01-01',
          pay_period_end: '2026-01-15',
          total_taxes: 900,
          total_deductions: 300,
          hours_worked: 80,
          overtime_hours: 0,
          created_at: '2026-01-15',
        },
      ];

      mockQueryWithRLS.mockResolvedValue({ rows: mockPayStubs, rowCount: 1 });

      const input: ListPayStubsInput = { limit: 50 };
      const result = await listPayStubs(input, userContext);

      expect(result.status).toBe('success');
      expect((result as any).data).toEqual(mockPayStubs);
    });

    it('should filter by employeeId', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      const input: ListPayStubsInput = { limit: 50, employeeId: validEmployeeId };
      await listPayStubs(input, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalled();
      const [, query, params] = mockQueryWithRLS.mock.calls[0];
      expect(query).toContain('employee_id');
      expect(params[0]).toBe(validEmployeeId);
    });

    it('should use current user ID when employeeId not provided', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      const input: ListPayStubsInput = { limit: 50 };
      await listPayStubs(input, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalled();
      const [, , params] = mockQueryWithRLS.mock.calls[0];
      expect(params[0]).toBe(validEmployeeId);
    });

    it('should filter by year', async () => {
      mockQueryWithRLS.mockResolvedValue({ rows: [], rowCount: 0 });

      const input: ListPayStubsInput = { limit: 50, year: 2026 };
      await listPayStubs(input, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalled();
      const [, query, params] = mockQueryWithRLS.mock.calls[0];
      expect(query).toContain('EXTRACT');
      expect(params).toContain(2026);
    });
  });
});
