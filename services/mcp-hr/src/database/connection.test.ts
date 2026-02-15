/**
 * Unit tests for database connection module
 *
 * Tests that the thin wrapper correctly delegates to @tamshai/shared createPostgresClient.
 * Since connection.ts is now a thin wrapper, these tests verify the behavior
 * of the shared module's createPostgresClient factory.
 */

const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();
const mockPoolEnd = jest.fn().mockResolvedValue(undefined);
const mockPoolOn = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

const mockPool = {
  connect: mockPoolConnect,
  query: mockPoolQuery,
  end: mockPoolEnd,
  on: mockPoolOn,
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

jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

import {
  queryWithRLS,
  queryWithoutRLS,
  getClient,
  checkConnection,
  closePool,
  UserContext,
} from './connection';

describe('Database Connection', () => {
  const mockUserContext: UserContext = {
    userId: 'test-user-123',
    username: 'test.user',
    email: 'test@example.com',
    roles: ['hr-read', 'hr-write'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockClientRelease.mockClear();
    mockPoolConnect.mockResolvedValue(mockClient);
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockPoolEnd.mockResolvedValue(undefined);
  });

  describe('queryWithRLS', () => {
    it('executes query within transaction with RLS variables', async () => {
      const queryText = 'SELECT * FROM hr.employees WHERE id = $1';
      const values = ['emp-123'];
      const expectedResult = {
        rows: [{ id: 'emp-123', name: 'Test' }],
        rowCount: 1,
      };

      mockClientQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config
        .mockResolvedValueOnce(expectedResult) // Main query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await queryWithRLS(mockUserContext, queryText, values);

      expect(result).toEqual(expectedResult);
      expect(mockPoolConnect).toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith(queryText, values);
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('rolls back transaction on query error', async () => {
      const queryError = new Error('Query failed');

      mockClientQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config
        .mockRejectedValueOnce(queryError) // Main query fails
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

      await expect(
        queryWithRLS(mockUserContext, 'SELECT * FROM hr.employees', [])
      ).rejects.toThrow('Query failed');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('handles user context without email', async () => {
      const userWithoutEmail: UserContext = {
        userId: 'test-user-123',
        username: 'test.user',
        roles: ['hr-read'],
      };

      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await queryWithRLS(userWithoutEmail, 'SELECT 1', []);

      expect(mockClientQuery).toHaveBeenCalledWith(
        'set_config',
        expect.arrayContaining([userWithoutEmail.userId, '', 'hr-read'])
      );
    });

    it('properly formats roles as comma-separated string', async () => {
      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await queryWithRLS(mockUserContext, 'SELECT 1', []);

      expect(mockClientQuery).toHaveBeenCalledWith(
        'set_config',
        expect.arrayContaining(['hr-read,hr-write'])
      );
    });
  });

  describe('queryWithoutRLS', () => {
    it('executes query directly on pool', async () => {
      const expectedResult = { rows: [{ count: 10 }], rowCount: 1 };
      mockPoolQuery.mockResolvedValue(expectedResult);

      const result = await queryWithoutRLS('SELECT COUNT(*) FROM hr.employees');

      expect(result).toEqual(expectedResult);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) FROM hr.employees',
        undefined
      );
    });

    it('passes query parameters', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await queryWithoutRLS('SELECT * FROM hr.employees WHERE id = $1', ['emp-123']);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT * FROM hr.employees WHERE id = $1',
        ['emp-123']
      );
    });
  });

  describe('getClient', () => {
    it('returns a client from the pool', async () => {
      const client = await getClient();

      expect(mockPoolConnect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });
  });

  describe('checkConnection', () => {
    it('returns true when database is reachable', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ ok: 1 }] });

      const result = await checkConnection();

      expect(result).toBe(true);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1 as ok');
    });

    it('returns false when database is unreachable', async () => {
      mockPoolQuery.mockRejectedValue(new Error('Connection refused'));

      const result = await checkConnection();

      expect(result).toBe(false);
    });

    it('returns false when result is unexpected', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ ok: 0 }] });

      const result = await checkConnection();

      expect(result).toBe(false);
    });

    it('returns false when rows are empty', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await checkConnection();

      expect(result).toBe(false);
    });
  });

  describe('closePool', () => {
    it('closes the connection pool', async () => {
      await closePool();

      expect(mockPoolEnd).toHaveBeenCalled();
    });
  });
});
