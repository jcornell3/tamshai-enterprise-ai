/**
 * Unit tests for database connection module
 *
 * Tests RLS session variable management and connection pooling
 */

// Mock pg module before importing connection
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
  query: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPool),
}));

// Mock winston to prevent console output during tests
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
    // Reset mock implementations
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockClient.release.mockClear();
    mockPool.connect.mockResolvedValue(mockClient);
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockPool.end.mockResolvedValue(undefined);
  });

  describe('queryWithRLS', () => {
    it('executes query within transaction with RLS variables', async () => {
      const queryText = 'SELECT * FROM hr.employees WHERE id = $1';
      const values = ['emp-123'];
      const expectedResult = {
        rows: [{ id: 'emp-123', name: 'Test' }],
        rowCount: 1,
      };

      // Mock the query results for optimized implementation:
      // BEGIN -> set_config SELECT -> Main query -> COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config SELECT (combined)
        .mockResolvedValueOnce(expectedResult) // Main query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await queryWithRLS(mockUserContext, queryText, values);

      expect(result).toEqual(expectedResult);
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      // Check for optimized set_config call with parameters
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        expect.arrayContaining([mockUserContext.userId, mockUserContext.email, 'hr-read,hr-write'])
      );
      expect(mockClient.query).toHaveBeenCalledWith(queryText, values);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back transaction on query error', async () => {
      const queryError = new Error('Query failed');

      // Mock for optimized implementation: BEGIN -> set_config -> Main query fails -> ROLLBACK
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config SELECT
        .mockRejectedValueOnce(queryError) // Main query fails
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

      await expect(
        queryWithRLS(mockUserContext, 'SELECT * FROM hr.employees', [])
      ).rejects.toThrow('Query failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('releases client even when rollback fails', async () => {
      const queryError = new Error('Query failed');
      const rollbackError = new Error('Rollback failed');

      // Mock for optimized implementation
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config SELECT
        .mockRejectedValueOnce(queryError) // Main query fails
        .mockRejectedValueOnce(rollbackError); // ROLLBACK fails

      await expect(
        queryWithRLS(mockUserContext, 'SELECT * FROM hr.employees', [])
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('handles user context without email', async () => {
      const userWithoutEmail: UserContext = {
        userId: 'test-user-123',
        username: 'test.user',
        roles: ['hr-read'],
      };

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await queryWithRLS(userWithoutEmail, 'SELECT 1', []);

      // Should still set user_email with empty string via set_config
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        expect.arrayContaining([userWithoutEmail.userId, '', 'hr-read'])
      );
    });

    it('properly formats roles as comma-separated string', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await queryWithRLS(mockUserContext, 'SELECT 1', []);

      // Check that roles are joined in set_config call
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        expect.arrayContaining(['hr-read,hr-write'])
      );
    });
  });

  describe('queryWithoutRLS', () => {
    it('executes query directly on pool', async () => {
      const expectedResult = { rows: [{ count: 10 }], rowCount: 1 };
      mockPool.query.mockResolvedValue(expectedResult);

      const result = await queryWithoutRLS('SELECT COUNT(*) FROM hr.employees');

      expect(result).toEqual(expectedResult);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) FROM hr.employees',
        undefined
      );
    });

    it('passes query parameters', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await queryWithoutRLS('SELECT * FROM hr.employees WHERE id = $1', ['emp-123']);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM hr.employees WHERE id = $1',
        ['emp-123']
      );
    });
  });

  describe('getClient', () => {
    it('returns a client from the pool', async () => {
      const client = await getClient();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });
  });

  describe('checkConnection', () => {
    it('returns true when database is reachable', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

      const result = await checkConnection();

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns false when database is unreachable', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      const result = await checkConnection();

      expect(result).toBe(false);
    });

    it('returns false when query returns no rows', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await checkConnection();

      expect(result).toBe(false);
    });
  });

  describe('closePool', () => {
    it('closes the connection pool', async () => {
      await closePool();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});
