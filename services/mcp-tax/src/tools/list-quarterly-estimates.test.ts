/**
 * List Quarterly Estimates Tool Tests
 */
import { listQuarterlyEstimates } from './list-quarterly-estimates';
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

describe('listQuarterlyEstimates', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['tax-read'],
  };

  const mockEstimates = [
    {
      estimate_id: 'est-001',
      year: 2026,
      quarter: 1,
      federal_estimate: 25000,
      state_estimate: 8000,
      local_estimate: 2000,
      total_estimate: 35000,
      due_date: '2026-04-15',
      status: 'pending',
      paid_amount: 0,
      paid_date: null,
      payment_reference: null,
      notes: 'Q1 2026 estimate',
    },
    {
      estimate_id: 'est-002',
      year: 2025,
      quarter: 4,
      federal_estimate: 24000,
      state_estimate: 7500,
      local_estimate: 1800,
      total_estimate: 33300,
      due_date: '2026-01-15',
      status: 'paid',
      paid_amount: 33300,
      paid_date: '2026-01-10',
      payment_reference: 'PAY-2026-001',
      notes: 'Q4 2025 - paid on time',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns quarterly estimates with success status', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: mockEstimates,
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listQuarterlyEstimates({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.year).toBe(2026);
      expect(result.data[0]!.total_estimate).toBe(35000);
    }
  });

  it('applies year filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockEstimates[0]!],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listQuarterlyEstimates({ limit: 50, year: 2026 }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('year = $1');
    expect(values).toContain(2026);
  });

  it('applies quarter filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockEstimates[0]!],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listQuarterlyEstimates({ limit: 50, quarter: 1 }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('quarter = $1');
    expect(values).toContain(1);
  });

  it('applies status filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockEstimates[1]!],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listQuarterlyEstimates({ limit: 50, status: 'paid' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('status = $1');
    expect(values).toContain('paid');
  });

  it('returns pagination metadata when more records exist', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [...mockEstimates, { ...mockEstimates[0], estimate_id: 'est-003' }],
      rowCount: 3,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listQuarterlyEstimates({ limit: 2 }, mockUserContext);

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

    const result = await listQuarterlyEstimates({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(0);
      expect(result.metadata).toBeUndefined();
    }
  });

  it('handles invalid cursor gracefully', async () => {
    const result = await listQuarterlyEstimates({ limit: 50, cursor: 'invalid-cursor' }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.suggestedAction).toContain('cursor');
    }
  });

  it('handles database errors', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockRejectedValue(new Error('Database connection failed'));

    const result = await listQuarterlyEstimates({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
  });
});
