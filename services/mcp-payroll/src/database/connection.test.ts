/**
 * Database Connection Unit Tests
 */

// Mock pg module before imports
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();
const mockEnd = jest.fn();
const mockPoolOn = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    connect: mockConnect,
    end: mockEnd,
    on: mockPoolOn,
  })),
}));

// Mock logger
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
  const mockClient = {
    query: jest.fn(),
    release: mockRelease,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue(mockClient);
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
      mockClient.query
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
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should set all session variables', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({});

      await queryWithRLS(userContext, 'SELECT 1');

      // Check set_config call
      const setConfigCall = mockClient.query.mock.calls[1];
      expect(setConfigCall[0]).toContain('set_config');
      expect(setConfigCall[1]).toEqual([
        'user-123',
        'alice@tamshai.local',
        'payroll-read',
        'dept-hr',
        'mgr-456',
      ]);
    });

    it('should rollback on query error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // set_config
        .mockRejectedValueOnce(new Error('Query failed')) // actual query
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        queryWithRLS(userContext, 'SELECT * FROM invalid_table')
      ).rejects.toThrow('Query failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should handle empty optional fields', async () => {
      const minimalContext: UserContext = {
        userId: 'user-456',
        username: 'bob',
        roles: ['payroll-read', 'payroll-write'],
      };

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({});

      await queryWithRLS(minimalContext, 'SELECT 1');

      const setConfigCall = mockClient.query.mock.calls[1];
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
      mockQuery.mockResolvedValue({ rows: [{ count: 10 }], rowCount: 1 });

      const result = await queryWithoutRLS('SELECT COUNT(*) FROM pay_runs');

      expect(result.rows).toEqual([{ count: 10 }]);
      expect(mockQuery).toHaveBeenCalledWith('SELECT COUNT(*) FROM pay_runs', undefined);
    });

    it('should pass query parameters', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await queryWithoutRLS('SELECT * FROM employees WHERE id = $1', ['emp-123']);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM employees WHERE id = $1',
        ['emp-123']
      );
    });
  });

  describe('checkConnection', () => {
    it('should return true when connection is healthy', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ok: 1 }] });

      const result = await checkConnection();

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1 as ok');
    });

    it('should return false when query fails', async () => {
      mockQuery.mockRejectedValue(new Error('Connection failed'));

      const result = await checkConnection();

      expect(result).toBe(false);
    });

    it('should return false when result is unexpected', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ok: 0 }] });

      const result = await checkConnection();

      expect(result).toBe(false);
    });

    it('should return false when rows are empty', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await checkConnection();

      expect(result).toBe(false);
    });
  });

  describe('closePool', () => {
    it('should close the connection pool', async () => {
      mockEnd.mockResolvedValue(undefined);

      await closePool();

      expect(mockEnd).toHaveBeenCalled();
    });
  });
});
