/**
 * Get Tax Summary Tool Tests
 */
import { getTaxSummary } from './get-tax-summary';
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

describe('getTaxSummary', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['tax-read'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns tax summary with success status', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

    // Mock estimates query
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ total_liability: 100000, paid_to_date: 85000 }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    // Mock deadlines query
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [
        { description: 'Q1 Estimated Tax', due_date: '2026-04-15', amount: 0 },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    // Mock state breakdown query
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [
        { state: 'California', registration_count: 2 },
        { state: 'Texas', registration_count: 1 },
      ],
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    // Mock recent filings query
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [
        {
          id: 'fil-001',
          year: 2025,
          filing_type: '1099-NEC',
          entity_name: 'Acme LLC',
          entity_id: 'ent-001',
          total_amount: 75000,
          filing_date: '2026-01-28',
          due_date: '2026-01-31',
          status: 'filed',
          confirmation_number: 'CONF-001',
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    // Mock overdue query
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ overdue_count: '0' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getTaxSummary({ year: 2026 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.currentYear).toBe(2026);
      expect(result.data.totalTaxLiability).toBe(100000);
      expect(result.data.paidToDate).toBe(85000);
      expect(result.data.remainingBalance).toBe(15000);
      expect(result.data.complianceStatus).toBe('compliant');
    }
  });

  it('uses current year when year not specified', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    const currentYear = new Date().getFullYear();

    // Mock all queries
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ total_liability: 50000, paid_to_date: 50000 }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ overdue_count: '0' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getTaxSummary({}, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.currentYear).toBe(currentYear);
    }
  });

  it('returns at_risk compliance status when paid less than 80%', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

    // Mock estimates showing underpayment
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ total_liability: 100000, paid_to_date: 70000 }], // 70% paid
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ overdue_count: '0' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getTaxSummary({ year: 2026 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.complianceStatus).toBe('at_risk');
    }
  });

  it('returns non_compliant status when overdue payments exist', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ total_liability: 100000, paid_to_date: 90000 }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ overdue_count: '2' }], // Has overdue items
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getTaxSummary({ year: 2026 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.complianceStatus).toBe('non_compliant');
    }
  });

  it('includes upcoming deadlines in response', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ total_liability: 100000, paid_to_date: 100000 }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [
        { description: 'Q1 Federal Estimated Tax', due_date: '2026-04-15', amount: 0 },
        { description: 'Q1 State Estimated Tax', due_date: '2026-04-15', amount: 0 },
      ],
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ overdue_count: '0' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getTaxSummary({ year: 2026 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.upcomingDeadlines).toHaveLength(2);
      expect(result.data.upcomingDeadlines[0]!.description).toBe('Q1 Federal Estimated Tax');
    }
  });

  it('includes state breakdown in response', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ total_liability: 100000, paid_to_date: 100000 }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [
        { state: 'California', registration_count: 3 },
        { state: 'Texas', registration_count: 2 },
        { state: 'New York', registration_count: 1 },
      ],
      rowCount: 3,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ overdue_count: '0' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getTaxSummary({ year: 2026 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.stateBreakdown).toHaveLength(3);
      expect(result.data.stateBreakdown[0]!.state).toBe('California');
    }
  });

  it('includes recent filings in response', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ total_liability: 100000, paid_to_date: 100000 }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [
        {
          id: 'fil-001',
          year: 2025,
          filing_type: '1099-NEC',
          entity_name: 'Contractor A',
          entity_id: 'ent-001',
          total_amount: 50000,
          filing_date: '2026-01-28',
          due_date: '2026-01-31',
          status: 'filed',
          confirmation_number: 'CONF-123',
        },
        {
          id: 'fil-002',
          year: 2025,
          filing_type: 'W-2',
          entity_name: 'All Employees',
          entity_id: null,
          total_amount: 500000,
          filing_date: null,
          due_date: '2026-01-31',
          status: 'draft',
          confirmation_number: null,
        },
      ],
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ overdue_count: '0' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getTaxSummary({ year: 2026 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.recentFilings).toHaveLength(2);
      expect(result.data.recentFilings[0]!.filingType).toBe('1099-NEC');
      expect(result.data.recentFilings[1]!.status).toBe('draft');
    }
  });

  it('handles database errors', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockRejectedValue(new Error('Database connection failed'));

    const result = await getTaxSummary({ year: 2026 }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
  });

  it('handles null values in query results gracefully', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

    // Mock with null/undefined values
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ total_liability: null, paid_to_date: null }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
    mockQueryWithRLS.mockResolvedValueOnce({
      rows: [{ overdue_count: null }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getTaxSummary({ year: 2026 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.totalTaxLiability).toBe(0);
      expect(result.data.paidToDate).toBe(0);
      expect(result.data.remainingBalance).toBe(0);
    }
  });
});
