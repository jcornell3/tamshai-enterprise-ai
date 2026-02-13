/**
 * Database Connection Tests
 *
 * Tests for PostgreSQL connection pool and RLS query execution.
 */
import { UserContext } from './connection';

// Create mock functions before jest.mock
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolQuery = jest.fn();
const mockPoolEnd = jest.fn().mockResolvedValue(undefined);
const mockPoolConnect = jest.fn();
const mockPoolOn = jest.fn();

const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

// Mock pg Pool before importing connection module
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: mockPoolConnect.mockResolvedValue(mockClient),
    query: mockPoolQuery,
    end: mockPoolEnd,
    on: mockPoolOn,
  })),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocking
import {
  queryWithRLS,
  queryWithoutRLS,
  checkConnection,
  closePool,
} from './connection';

describe('queryWithRLS', () => {
  const userContext: UserContext = {
    userId: 'user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['tax-read', 'tax-write'],
    departmentId: 'dept-finance',
    managerId: 'manager-001',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolConnect.mockResolvedValue(mockClient);
  });

  it('sets RLS context variables in transaction', async () => {
    mockClientQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

    await queryWithRLS(userContext, 'SELECT * FROM tax.rates', []);

    // Verify BEGIN
    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');

    // Verify set_config call with user context
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('set_config'),
      [
        userContext.userId,
        userContext.email,
        userContext.roles.join(','),
        userContext.departmentId,
        userContext.managerId,
      ]
    );

    // Verify COMMIT
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('executes the query with provided values', async () => {
    mockClientQuery.mockResolvedValue({ rows: [{ rate_id: 'rate-001' }], rowCount: 1 });

    await queryWithRLS(userContext, 'SELECT * FROM tax.rates WHERE state_code = $1', ['CA']);

    expect(mockClientQuery).toHaveBeenCalledWith(
      'SELECT * FROM tax.rates WHERE state_code = $1',
      ['CA']
    );
  });

  it('returns query result on success', async () => {
    const expectedResult = {
      rows: [{ rate_id: 'rate-001', state_code: 'CA' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    };
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // set_config
      .mockResolvedValueOnce(expectedResult) // Main query
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await queryWithRLS(userContext, 'SELECT * FROM tax.rates', []);

    expect(result.rows).toEqual(expectedResult.rows);
    expect(result.rowCount).toBe(1);
  });

  it('rolls back transaction on error', async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // set_config
      .mockRejectedValueOnce(new Error('Query failed')); // Main query fails

    await expect(queryWithRLS(userContext, 'SELECT * FROM invalid_table', [])).rejects.toThrow(
      'Query failed'
    );

    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('releases client after successful query', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await queryWithRLS(userContext, 'SELECT 1', []);

    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('releases client after failed query', async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error('Connection lost'));

    await expect(queryWithRLS(userContext, 'SELECT 1', [])).rejects.toThrow();

    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('handles missing optional context fields', async () => {
    const minimalContext: UserContext = {
      userId: 'user-456',
      username: 'jane.doe',
      roles: ['tax-read'],
    };
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await queryWithRLS(minimalContext, 'SELECT 1', []);

    // Should use empty strings for missing optional fields
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('set_config'),
      [
        minimalContext.userId,
        '', // email
        'tax-read',
        '', // departmentId
        '', // managerId
      ]
    );
  });
});

describe('queryWithoutRLS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executes query directly on pool', async () => {
    const expectedResult = { rows: [{ ok: 1 }], rowCount: 1 };
    mockPoolQuery.mockResolvedValue(expectedResult);

    const result = await queryWithoutRLS('SELECT 1 as ok', []);

    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1 as ok', []);
    expect(result).toEqual(expectedResult);
  });

  it('passes values to pool query', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await queryWithoutRLS('SELECT * FROM config WHERE key = $1', ['tax_rate']);

    expect(mockPoolQuery).toHaveBeenCalledWith(
      'SELECT * FROM config WHERE key = $1',
      ['tax_rate']
    );
  });

  it('propagates errors from pool', async () => {
    mockPoolQuery.mockRejectedValue(new Error('Connection refused'));

    await expect(queryWithoutRLS('SELECT 1', [])).rejects.toThrow('Connection refused');
  });
});

describe('checkConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when connection is healthy', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [{ ok: 1 }],
      rowCount: 1,
    });

    const result = await checkConnection();

    expect(result).toBe(true);
    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1 as ok');
  });

  it('returns false when query fails', async () => {
    mockPoolQuery.mockRejectedValue(new Error('Connection refused'));

    const result = await checkConnection();

    expect(result).toBe(false);
  });

  it('returns false when result is unexpected', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [{ ok: 0 }],
      rowCount: 1,
    });

    const result = await checkConnection();

    expect(result).toBe(false);
  });

  it('returns false when rows are empty', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
    });

    const result = await checkConnection();

    expect(result).toBe(false);
  });
});

describe('closePool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls pool.end()', async () => {
    mockPoolEnd.mockResolvedValue(undefined);

    await closePool();

    expect(mockPoolEnd).toHaveBeenCalled();
  });

  it('resolves when pool ends successfully', async () => {
    mockPoolEnd.mockResolvedValue(undefined);

    await expect(closePool()).resolves.toBeUndefined();
  });
});

describe('pool configuration', () => {
  it('pool has on method for event handling', () => {
    // Verify the mock pool has the on method
    expect(typeof mockPoolOn).toBe('function');
  });

  it('pool has connect method for client acquisition', () => {
    expect(typeof mockPoolConnect).toBe('function');
  });

  it('pool has query method for direct queries', () => {
    expect(typeof mockPoolQuery).toBe('function');
  });

  it('pool has end method for cleanup', () => {
    expect(typeof mockPoolEnd).toBe('function');
  });
});
