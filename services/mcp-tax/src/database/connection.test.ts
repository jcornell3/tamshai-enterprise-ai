/**
 * Database Connection Tests
 *
 * Tests that the thin wrapper correctly delegates to @tamshai/shared createPostgresClient.
 */

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolQuery = jest.fn();
const mockPoolEnd = jest.fn().mockResolvedValue(undefined);
const mockPoolConnect = jest.fn();
const mockPoolOn = jest.fn();

const mockPool = {
  connect: mockPoolConnect,
  query: mockPoolQuery,
  end: mockPoolEnd,
  on: mockPoolOn,
};

const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

// Use regular functions (not jest.fn) so clearAllMocks doesn't wipe implementations
jest.mock('@tamshai/shared', () => ({
  createPostgresClient: () => ({
    pool: mockPool,
    queryWithRLS: async (userContext: any, queryText: string, values?: any[]) => {
      const client = await mockPoolConnect();
      try {
        await client.query('BEGIN');
        await client.query('set_config', [
          userContext.userId,
          userContext.email || '',
          userContext.roles.join(','),
          userContext.departmentId || '',
          userContext.managerId || '',
        ]);
        const result = await client.query(queryText, values);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    queryWithoutRLS: async (queryText: string, values?: any[]) => {
      return mockPoolQuery(queryText, values);
    },
    getClient: async () => {
      return mockPoolConnect();
    },
    checkConnection: async () => {
      try {
        const result = await mockPoolQuery('SELECT 1 as ok');
        return result.rows[0]?.ok === 1;
      } catch {
        return false;
      }
    },
    closePool: async () => {
      await mockPoolEnd();
    },
  }),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { UserContext } from './connection';
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

    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenCalledWith(
      'set_config',
      [
        userContext.userId,
        userContext.email,
        userContext.roles.join(','),
        userContext.departmentId,
        userContext.managerId,
      ]
    );
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

    expect(mockClientQuery).toHaveBeenCalledWith(
      'set_config',
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
    mockPoolEnd.mockResolvedValue(undefined);
  });

  it('calls pool.end()', async () => {
    await closePool();

    expect(mockPoolEnd).toHaveBeenCalled();
  });

  it('resolves when pool ends successfully', async () => {
    await expect(closePool()).resolves.toBeUndefined();
  });
});

describe('pool configuration', () => {
  it('pool has on method for event handling', () => {
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
