/**
 * List Sales Tax Rates Tool Tests
 */
import { listSalesTaxRates } from './list-sales-tax-rates';
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

describe('listSalesTaxRates', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['tax-read'],
  };

  const mockTaxRates = [
    {
      rate_id: 'rate-001',
      state: 'California',
      state_code: 'CA',
      county: 'Los Angeles',
      city: 'Los Angeles',
      base_rate: 7.25,
      local_rate: 2.25,
      combined_rate: 9.5,
      effective_date: '2026-01-01',
      end_date: null,
    },
    {
      rate_id: 'rate-002',
      state: 'Texas',
      state_code: 'TX',
      county: 'Harris',
      city: 'Houston',
      base_rate: 6.25,
      local_rate: 2.0,
      combined_rate: 8.25,
      effective_date: '2026-01-01',
      end_date: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns sales tax rates with success status', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: mockTaxRates,
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listSalesTaxRates({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.state_code).toBe('CA');
      expect(result.data[0]!.combined_rate).toBe(9.5);
    }
  });

  it('applies stateCode filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockTaxRates[0]!],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listSalesTaxRates({ limit: 50, stateCode: 'CA' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('state_code = $1');
    expect(values).toContain('CA');
  });

  it('applies county filter with ILIKE', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockTaxRates[0]!],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listSalesTaxRates({ limit: 50, county: 'Los' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('county ILIKE $1');
    expect(values).toContain('%Los%');
  });

  it('applies city filter with ILIKE', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockTaxRates[1]!],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listSalesTaxRates({ limit: 50, city: 'Houston' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('city ILIKE $1');
    expect(values).toContain('%Houston%');
  });

  it('returns pagination metadata when more records exist', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [...mockTaxRates, { ...mockTaxRates[0], rate_id: 'rate-003' }],
      rowCount: 3,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listSalesTaxRates({ limit: 2 }, mockUserContext);

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

    const result = await listSalesTaxRates({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(0);
      expect(result.metadata).toBeUndefined();
    }
  });

  it('handles invalid cursor gracefully', async () => {
    const result = await listSalesTaxRates({ limit: 50, cursor: 'invalid-cursor' }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.suggestedAction).toContain('cursor');
    }
  });

  it('handles database errors', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockRejectedValue(new Error('Database connection failed'));

    const result = await listSalesTaxRates({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
  });
});
