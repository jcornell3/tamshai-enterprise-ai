/**
 * List Audit Logs Tool Tests
 */
import { listAuditLogs } from './list-audit-logs';
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

describe('listAuditLogs', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['tax-read'],
  };

  const mockAuditLogs = [
    {
      log_id: 'log-001',
      timestamp: '2026-02-01T14:30:00Z',
      action: 'create',
      entity_type: 'filing',
      entity_id: 'fil-001',
      user_id: 'user-123',
      user_name: 'Bob Martinez',
      previous_value: null,
      new_value: { status: 'draft', total_amount: 75000 },
      ip_address: '192.168.1.100',
      notes: 'Created new 1099-NEC filing',
    },
    {
      log_id: 'log-002',
      timestamp: '2026-02-01T15:00:00Z',
      action: 'submit',
      entity_type: 'filing',
      entity_id: 'fil-001',
      user_id: 'user-123',
      user_name: 'Bob Martinez',
      previous_value: { status: 'draft' },
      new_value: { status: 'filed' },
      ip_address: '192.168.1.100',
      notes: 'Submitted filing to IRS',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns audit logs with success status', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: mockAuditLogs,
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listAuditLogs({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.action).toBe('create');
      expect(result.data[0]!.entity_type).toBe('filing');
    }
  });

  it('applies action filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [mockAuditLogs[0]!],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listAuditLogs({ limit: 50, action: 'create' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('action = $1');
    expect(values).toContain('create');
  });

  it('applies entityType filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: mockAuditLogs,
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listAuditLogs({ limit: 50, entityType: 'filing' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('entity_type = $1');
    expect(values).toContain('filing');
  });

  it('applies userId filter correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: mockAuditLogs,
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listAuditLogs({ limit: 50, userId: 'user-123' }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('user_id = $1');
    expect(values).toContain('user-123');
  });

  it('applies date range filters correctly', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: mockAuditLogs,
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listAuditLogs({
      limit: 50,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    }, mockUserContext);

    expect(result.status).toBe('success');
    expect(mockQueryWithRLS).toHaveBeenCalled();
    const [, query, values] = mockQueryWithRLS.mock.calls[0]!;
    expect(query).toContain('timestamp >= $1');
    expect(query).toContain('timestamp <= $2');
    expect(values).toContain('2026-02-01');
    expect(values).toContain('2026-02-28');
  });

  it('returns pagination metadata when more records exist', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockResolvedValue({
      rows: [...mockAuditLogs, { ...mockAuditLogs[0], log_id: 'log-003' }],
      rowCount: 3,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await listAuditLogs({ limit: 2 }, mockUserContext);

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

    const result = await listAuditLogs({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(0);
      expect(result.metadata).toBeUndefined();
    }
  });

  it('handles invalid cursor gracefully', async () => {
    const result = await listAuditLogs({ limit: 50, cursor: 'invalid-cursor' }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.suggestedAction).toContain('cursor');
    }
  });

  it('handles database errors', async () => {
    const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
    mockQueryWithRLS.mockRejectedValue(new Error('Database connection failed'));

    const result = await listAuditLogs({ limit: 50 }, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
  });
});
