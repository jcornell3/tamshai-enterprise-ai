/**
 * List State Registrations Tool Tests
 */
import { listStateRegistrations } from './list-state-registrations';
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

describe('listStateRegistrations', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['tax-read'],
  };

  const mockRegistrations = [
    {
      registration_id: 'reg-001',
      state: 'California',
      state_code: 'CA',
      registration_type: 'sales_tax',
      registration_number: 'ST-CA-12345678',
      registration_date: '2024-01-15',
      expiration_date: null,
      status: 'active',
      filing_frequency: 'quarterly',
      next_filing_due: '2026-04-30',
      account_representative: 'CA Tax Board',
      notes: 'Primary sales tax registration',
    },
    {
      registration_id: 'reg-002',
      state: 'Texas',
      state_code: 'TX',
      registration_type: 'franchise_tax',
      registration_number: 'FT-TX-87654321',
      registration_date: '2024-03-01',
      expiration_date: '2027-03-01',
      status: 'active',
      filing_frequency: 'annual',
      next_filing_due: '2026-05-15',
      account_representative: 'TX Comptroller',
      notes: 'Franchise tax filing',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns state registrations with success status', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: mockRegistrations,
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listStateRegistrations({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.state_code).toBe('CA');
      expect(result.data[0]!.registration_type).toBe('sales_tax');
    }
  });

  it('applies stateCode filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockRegistrations[0]!],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listStateRegistrations({ limit: 50, stateCode: 'CA' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('state_code = $1');
    expect(values).toContain('CA');
  });

  it('applies registrationType filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockRegistrations[1]!],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listStateRegistrations({ limit: 50, registrationType: 'franchise_tax' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('registration_type = $1');
    expect(values).toContain('franchise_tax');
  });

  it('applies status filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: mockRegistrations,
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listStateRegistrations({ limit: 50, status: 'active' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('status = $1');
    expect(values).toContain('active');
  });

  it('returns pagination metadata when more records exist', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [...mockRegistrations, { ...mockRegistrations[0], registration_id: 'reg-003' }],
      rowCount: 3,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listStateRegistrations({ limit: 2 }, mockUserContext);

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

    const result = await listStateRegistrations({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(0);
      expect(result.metadata).toBeUndefined();
    }
  });

  it('handles invalid cursor gracefully', async () => {
    const result = await listStateRegistrations({ limit: 50, cursor: 'invalid-cursor' }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.suggestedAction).toContain('cursor');
    }
  });

  it('handles database errors', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockRejectedValue(new Error('Database connection failed'));

    const result = await listStateRegistrations({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
  });
});
