/**
 * Unit tests for Redis utility functions
 *
 * Tests confirmation storage and retrieval with mocked Redis client
 */

// Create a mock Redis instance
const mockSetex = jest.fn().mockResolvedValue('OK');
const mockExists = jest.fn().mockResolvedValue(1);
const mockOn = jest.fn();

// Mock ioredis before importing redis utility
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: mockOn,
    setex: mockSetex,
    exists: mockExists,
  }));
});

import {
  storePendingConfirmation,
  confirmationExists,
} from './redis';

describe('Redis Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      const customTtl = 600; // 10 minutes

      await storePendingConfirmation(confirmationId, data, customTtl);

      expect(mockSetex).toHaveBeenCalledWith(
        `pending:${confirmationId}`,
        customTtl,
        JSON.stringify(data)
      );
    });

    it('prefixes confirmation ID with "pending:"', async () => {
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

    it('handles empty data object', async () => {
      const confirmationId = 'id-123';
      const data = {};

      await storePendingConfirmation(confirmationId, data as any);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:id-123',
        300,
        '{}'
      );
    });

    it('handles data with nested objects', async () => {
      const confirmationId = 'id-123';
      const data = {
        action: 'test',
        mcpServer: 'hr',
        userId: 'user',
        timestamp: 123,
        metadata: {
          nested: {
            deeply: {
              value: 'test',
            },
          },
        },
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

    it('prefixes confirmation ID with "pending:"', async () => {
      mockExists.mockResolvedValue(1);

      const confirmationId = 'test-id-456';
      await confirmationExists(confirmationId);

      expect(mockExists).toHaveBeenCalledWith('pending:test-id-456');
    });

    it('checks exact key in Redis', async () => {
      mockExists.mockResolvedValue(1);

      const confirmationId = '123e4567-e89b-12d3-a456-426614174000';
      await confirmationExists(confirmationId);

      const callArgs = mockExists.mock.calls[0];
      expect(callArgs[0]).toBe('pending:123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('Redis key format', () => {
    it('uses consistent key format across functions', async () => {
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
      const largeTtl = 86400; // 24 hours

      await storePendingConfirmation(confirmationId, data, largeTtl);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:id-123',
        largeTtl,
        expect.any(String)
      );
    });
  });
});
