/**
 * List Pay Runs Tool Tests
 */
import { listPayRuns } from './list-pay-runs';
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

describe('listPayRuns', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['payroll-read'],
  };

  const mockPayRuns = [
    {
      pay_run_id: 'pr-001',
      pay_period_start: '2026-01-01',
      pay_period_end: '2026-01-15',
      pay_date: '2026-01-20',
      pay_frequency: 'BI_WEEKLY',
      status: 'PROCESSED',
      total_gross: 150000,
      total_net: 105000,
      total_taxes: 30000,
      total_deductions: 15000,
      employee_count: 50,
      created_at: '2026-01-01T00:00:00Z',
      processed_at: '2026-01-18T00:00:00Z',
    },
    {
      pay_run_id: 'pr-002',
      pay_period_start: '2026-01-16',
      pay_period_end: '2026-01-31',
      pay_date: '2026-02-05',
      pay_frequency: 'BI_WEEKLY',
      status: 'PENDING',
      total_gross: 155000,
      total_net: 108500,
      total_taxes: 31000,
      total_deductions: 15500,
      employee_count: 52,
      created_at: '2026-01-16T00:00:00Z',
      processed_at: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns pay runs with success status', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: mockPayRuns,
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listPayRuns({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].pay_run_id).toBe('pr-001');
    }
  });

  it('applies status filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockPayRuns[0]],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listPayRuns({ limit: 50, status: 'PROCESSED' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0];
    expect(query).toContain('status = $1');
    expect(values).toContain('PROCESSED');
  });

  it('returns pagination metadata when more records exist', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    // Return 3 records when limit is 2 (indicates more exist)
    mockQueryWithRLS.mockResolvedValue({
      rows: [...mockPayRuns, { ...mockPayRuns[0], pay_run_id: 'pr-003' }],
      rowCount: 3,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listPayRuns({ limit: 2 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(2);
      expect(result.metadata?.hasMore).toBe(true);
      expect(result.metadata?.nextCursor).toBeDefined();
    }
  });

  it('handles empty results', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listPayRuns({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(0);
      expect(result.metadata).toBeUndefined();
    }
  });

  it('handles invalid cursor gracefully', async () => {
    const result = await listPayRuns({ limit: 50, cursor: 'invalid-cursor' }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.suggestedAction).toContain('cursor');
    }
  });

  it('handles database errors', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockRejectedValue(new Error('Database connection failed'));

    const result = await listPayRuns({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
  });
});
