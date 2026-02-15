/**
 * Unit tests for Redis utility functions
 *
 * Tests that the thin wrapper correctly delegates to @tamshai/shared
 * createRedisConfirmationCache with service name 'hr'.
 */

const mockSetex = jest.fn().mockResolvedValue('OK');
const mockExists = jest.fn().mockResolvedValue(1);
const mockGet = jest.fn();
const mockDel = jest.fn().mockResolvedValue(1);
const mockPing = jest.fn().mockResolvedValue('PONG');
const mockQuit = jest.fn().mockResolvedValue('OK');

// Mock @tamshai/shared's createRedisConfirmationCache and createLogger
jest.mock('@tamshai/shared', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  createRedisConfirmationCache: (serviceName: string) => ({
    storePendingConfirmation: async (confirmationId: string, data: unknown, ttl = 300) => {
      await mockSetex(`pending:${confirmationId}`, ttl, JSON.stringify(data));
    },
    confirmationExists: async (confirmationId: string) => {
      const result = await mockExists(`pending:${confirmationId}`);
      return result === 1;
    },
    getPendingConfirmation: async (confirmationId: string) => {
      const data = await mockGet(`pending:${confirmationId}`);
      if (data) {
        await mockDel(`pending:${confirmationId}`);
        return JSON.parse(data);
      }
      return null;
    },
    checkRedisConnection: async () => {
      const result = await mockPing();
      return result === 'PONG';
    },
    closeRedis: async () => {
      await mockQuit();
    },
    getRedisClient: () => ({
      setex: mockSetex,
      exists: mockExists,
      get: mockGet,
      del: mockDel,
      ping: mockPing,
      quit: mockQuit,
    }),
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
  storePendingConfirmation,
  confirmationExists,
  getPendingConfirmation,
  checkRedisConnection,
  closeRedis,
} from './redis';

describe('Redis Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetex.mockResolvedValue('OK');
    mockExists.mockResolvedValue(1);
    mockGet.mockResolvedValue(null);
    mockDel.mockResolvedValue(1);
    mockPing.mockResolvedValue('PONG');
    mockQuit.mockResolvedValue('OK');
  });

  describe('storePendingConfirmation', () => {
    it('stores confirmation with default TTL (300 seconds)', async () => {
      const confirmationId = '123e4567-e89b-12d3-a456-426614174000';
      const data = {
        action: 'delete_employee',
        mcpServer: 'hr',
        userId: '223e4567-e89b-12d3-a456-426614174000',
        employeeId: '323e4567-e89b-12d3-a456-426614174000',
        timestamp: Date.now(),
      };

      await storePendingConfirmation(confirmationId, data);

      expect(mockSetex).toHaveBeenCalledWith(
        `pending:${confirmationId}`,
        300,
        JSON.stringify(data)
      );
    });

    it('stores confirmation with custom TTL', async () => {
      const confirmationId = '123e4567-e89b-12d3-a456-426614174000';
      const data = {
        action: 'update_employee',
        mcpServer: 'hr',
        userId: 'user-123',
        timestamp: Date.now(),
      };
      const customTtl = 600;

      await storePendingConfirmation(confirmationId, data, customTtl);

      expect(mockSetex).toHaveBeenCalledWith(
        `pending:${confirmationId}`,
        customTtl,
        JSON.stringify(data)
      );
    });

    it('prefixes confirmation ID with service-specific prefix', async () => {
      const confirmationId = 'test-id-123';
      const data = { action: 'test', mcpServer: 'hr', userId: 'user', timestamp: 123 };

      await storePendingConfirmation(confirmationId, data);

      const callArgs = mockSetex.mock.calls[0];
      expect(callArgs[0]).toBe('pending:test-id-123');
    });

    it('serializes data to JSON', async () => {
      const confirmationId = 'id-123';
      const data = {
        action: 'delete_employee',
        mcpServer: 'hr',
        userId: 'user-123',
        timestamp: 1234567890,
        employeeId: 'emp-456',
        employeeName: 'John Doe',
      };

      await storePendingConfirmation(confirmationId, data);

      const callArgs = mockSetex.mock.calls[0];
      const serializedData = callArgs[2];
      expect(serializedData).toBe(JSON.stringify(data));
      expect(JSON.parse(serializedData)).toEqual(data);
    });

    it('handles data with nested objects', async () => {
      const confirmationId = 'id-123';
      const data = {
        action: 'test',
        mcpServer: 'hr',
        userId: 'user',
        timestamp: 123,
        metadata: { nested: { deeply: { value: 'test' } } },
      };

      await storePendingConfirmation(confirmationId, data);

      const callArgs = mockSetex.mock.calls[0];
      const parsed = JSON.parse(callArgs[2]);
      expect(parsed.metadata.nested.deeply.value).toBe('test');
    });

    it('handles data with arrays', async () => {
      const confirmationId = 'id-123';
      const data = {
        action: 'bulk_delete',
        mcpServer: 'hr',
        userId: 'user',
        timestamp: 123,
        employeeIds: ['id1', 'id2', 'id3'],
      };

      await storePendingConfirmation(confirmationId, data);

      const callArgs = mockSetex.mock.calls[0];
      const parsed = JSON.parse(callArgs[2]);
      expect(parsed.employeeIds).toEqual(['id1', 'id2', 'id3']);
    });
  });

  describe('confirmationExists', () => {
    it('returns true when confirmation exists', async () => {
      mockExists.mockResolvedValue(1);

      const confirmationId = '123e4567-e89b-12d3-a456-426614174000';
      const result = await confirmationExists(confirmationId);

      expect(result).toBe(true);
      expect(mockExists).toHaveBeenCalledWith(`pending:${confirmationId}`);
    });

    it('returns false when confirmation does not exist', async () => {
      mockExists.mockResolvedValue(0);

      const confirmationId = 'non-existent-id';
      const result = await confirmationExists(confirmationId);

      expect(result).toBe(false);
      expect(mockExists).toHaveBeenCalledWith(`pending:${confirmationId}`);
    });

    it('uses service-specific key prefix', async () => {
      mockExists.mockResolvedValue(1);

      const confirmationId = 'test-id-456';
      await confirmationExists(confirmationId);

      expect(mockExists).toHaveBeenCalledWith('pending:test-id-456');
    });
  });

  describe('getPendingConfirmation', () => {
    it('retrieves and deletes confirmation (one-time use)', async () => {
      const data = { action: 'test', mcpServer: 'hr', userId: 'user', timestamp: 123 };
      mockGet.mockResolvedValue(JSON.stringify(data));

      const result = await getPendingConfirmation('conf-123');

      expect(result).toEqual(data);
      expect(mockGet).toHaveBeenCalledWith('pending:conf-123');
      expect(mockDel).toHaveBeenCalledWith('pending:conf-123');
    });

    it('returns null for non-existent confirmation', async () => {
      mockGet.mockResolvedValue(null);

      const result = await getPendingConfirmation('missing-id');

      expect(result).toBeNull();
      expect(mockDel).not.toHaveBeenCalled();
    });
  });

  describe('Redis key format', () => {
    it('uses consistent service-prefixed key format across functions', async () => {
      const confirmationId = 'test-uuid-123';
      const data = { action: 'test', mcpServer: 'hr', userId: 'user', timestamp: 123 };

      await storePendingConfirmation(confirmationId, data);
      const storeKey = mockSetex.mock.calls[0][0];

      mockExists.mockResolvedValue(1);
      await confirmationExists(confirmationId);
      const existsKey = mockExists.mock.calls[0][0];

      expect(storeKey).toBe(existsKey);
      expect(storeKey).toBe('pending:test-uuid-123');
    });
  });

  describe('checkRedisConnection', () => {
    it('returns true when Redis is reachable', async () => {
      const result = await checkRedisConnection();
      expect(result).toBe(true);
    });
  });

  describe('closeRedis', () => {
    it('closes the Redis connection', async () => {
      await closeRedis();
      expect(mockQuit).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('propagates Redis setex errors', async () => {
      const error = new Error('Redis connection failed');
      mockSetex.mockRejectedValue(error);

      const confirmationId = 'id-123';
      const data = { action: 'test', mcpServer: 'hr', userId: 'user', timestamp: 123 };

      await expect(storePendingConfirmation(confirmationId, data)).rejects.toThrow(
        'Redis connection failed'
      );
    });

    it('propagates Redis exists errors', async () => {
      const error = new Error('Redis unavailable');
      mockExists.mockRejectedValue(error);

      const confirmationId = 'id-123';

      await expect(confirmationExists(confirmationId)).rejects.toThrow(
        'Redis unavailable'
      );
    });
  });

  describe('TTL handling', () => {
    it('accepts 0 TTL (immediate expiration)', async () => {
      const confirmationId = 'id-123';
      const data = { action: 'test', mcpServer: 'hr', userId: 'user', timestamp: 123 };

      await storePendingConfirmation(confirmationId, data, 0);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:id-123',
        0,
        expect.any(String)
      );
    });

    it('accepts large TTL values', async () => {
      const confirmationId = 'id-123';
      const data = { action: 'test', mcpServer: 'hr', userId: 'user', timestamp: 123 };
      const largeTtl = 86400;

      await storePendingConfirmation(confirmationId, data, largeTtl);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:id-123',
        largeTtl,
        expect.any(String)
      );
    });
  });
});
