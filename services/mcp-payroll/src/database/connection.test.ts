/**
 * Database Connection Unit Tests
 *
 * Tests that the thin wrapper correctly delegates to @tamshai/shared createPostgresClient.
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

jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { UserContext, queryWithRLS, queryWithoutRLS, checkConnection, closePool } from './connection';

describe('Database Connection Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockPoolConnect.mockResolvedValue(mockClient);
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockPoolEnd.mockResolvedValue(undefined);
  });

  describe('UserContext interface', () => {
    it('should accept valid user context', () => {
      const userContext: UserContext = {
        userId: 'user-123',
        username: 'alice.chen',
        email: 'alice@tamshai.local',
        roles: ['payroll-read', 'payroll-write'],
        departmentId: 'dept-hr',
        managerId: 'mgr-456',
      };

      expect(userContext.userId).toBe('user-123');
      expect(userContext.roles).toContain('payroll-read');
    });

    it('should accept minimal user context', () => {
      const userContext: UserContext = {
        userId: 'user-123',
        username: 'bob',
        roles: [],
      };

      expect(userContext.email).toBeUndefined();
      expect(userContext.departmentId).toBeUndefined();
    });
  });

  describe('queryWithRLS', () => {
    const userContext: UserContext = {
      userId: 'user-123',
      username: 'alice.chen',
      email: 'alice@tamshai.local',
      roles: ['payroll-read'],
      departmentId: 'dept-hr',
      managerId: 'mgr-456',
    };

    it('should execute query with RLS context', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // set_config
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // actual query
        .mockResolvedValueOnce({}); // COMMIT

      const result = await queryWithRLS(
        userContext,
        'SELECT * FROM pay_runs WHERE id = $1',
        ['pr-123']
      );

      expect(result.rows).toEqual([{ id: 1 }]);
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should set all session variables', async () => {
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({});

      await queryWithRLS(userContext, 'SELECT 1');

      const setConfigCall = mockClientQuery.mock.calls[1];
      expect(setConfigCall[1]).toEqual([
        'user-123',
        'alice@tamshai.local',
        'payroll-read',
        'dept-hr',
        'mgr-456',
      ]);
    });

    it('should rollback on query error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // set_config
        .mockRejectedValueOnce(new Error('Query failed')) // actual query
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        queryWithRLS(userContext, 'SELECT * FROM invalid_table')
      ).rejects.toThrow('Query failed');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should handle empty optional fields', async () => {
      const minimalContext: UserContext = {
        userId: 'user-456',
        username: 'bob',
        roles: ['payroll-read', 'payroll-write'],
      };

      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({});

      await queryWithRLS(minimalContext, 'SELECT 1');

      const setConfigCall = mockClientQuery.mock.calls[1];
      expect(setConfigCall[1]).toEqual([
        'user-456',
        '', // empty email
        'payroll-read,payroll-write',
        '', // empty departmentId
        '', // empty managerId
      ]);
    });
  });

  describe('queryWithoutRLS', () => {
    it('should execute query directly on pool', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ count: 10 }], rowCount: 1 });

      const result = await queryWithoutRLS('SELECT COUNT(*) FROM pay_runs');

      expect(result.rows).toEqual([{ count: 10 }]);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT COUNT(*) FROM pay_runs', undefined);
    });

    it('should pass query parameters', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await queryWithoutRLS('SELECT * FROM employees WHERE id = $1', ['emp-123']);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT * FROM employees WHERE id = $1',
        ['emp-123']
      );
    });
  });

  describe('checkConnection', () => {
    it('should return true when connection is healthy', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ ok: 1 }] });

      const result = await checkConnection();

      expect(result).toBe(true);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1 as ok');
    });

    it('should return false when query fails', async () => {
      mockPoolQuery.mockRejectedValue(new Error('Connection failed'));

      const result = await checkConnection();

      expect(result).toBe(false);
    });

    it('should return false when result is unexpected', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ ok: 0 }] });

      const result = await checkConnection();

      expect(result).toBe(false);
    });

    it('should return false when rows are empty', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await checkConnection();

      expect(result).toBe(false);
    });
  });

  describe('closePool', () => {
    it('should close the connection pool', async () => {
      await closePool();

      expect(mockPoolEnd).toHaveBeenCalled();
    });
  });
});
