/**
 * Redis Utility Unit Tests
 *
 * Tests that the thin wrapper correctly delegates to @tamshai/shared
 * createRedisConfirmationCache with service name 'sales'.
 */

// Create mock functions
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

import { storePendingConfirmation, confirmationExists, closeRedis } from './redis';

describe('Redis Utility Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetex.mockResolvedValue('OK');
    mockExists.mockResolvedValue(1);
    mockQuit.mockResolvedValue('OK');
  });

  describe('storePendingConfirmation', () => {
    it('should store confirmation with default TTL', async () => {
      const confirmationId = 'test-confirmation-123';
      const data = {
        action: 'delete_opportunity',
        opportunityId: 'opp-123',
        userId: 'user-123',
      };

      await storePendingConfirmation(confirmationId, data);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:test-confirmation-123',
        300,
        JSON.stringify(data)
      );
    });

    it('should store confirmation with custom TTL', async () => {
      const confirmationId = 'test-confirmation-456';
      const data = { action: 'close_opportunity' };
      const customTTL = 600;

      await storePendingConfirmation(confirmationId, data, customTTL);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:test-confirmation-456',
        600,
        JSON.stringify(data)
      );
    });

    it('should throw error when storage fails', async () => {
      mockSetex.mockRejectedValue(new Error('Redis connection failed'));

      const confirmationId = 'test-confirmation-789';
      const data = { action: 'delete_customer' };

      await expect(storePendingConfirmation(confirmationId, data))
        .rejects.toThrow('Redis connection failed');
    });

    it('should handle complex data objects', async () => {
      const confirmationId = 'complex-123';
      const data = {
        action: 'delete_opportunity',
        mcpServer: 'sales',
        userId: 'user-123',
        timestamp: Date.now(),
        opportunityId: 'opp-123',
        customerName: 'Acme Corp',
        value: 50000,
        stage: 'PROPOSAL',
        reason: 'Customer requested cancellation',
        metadata: {
          source: 'api',
          version: '1.4',
        },
      };

      await storePendingConfirmation(confirmationId, data);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:complex-123',
        300,
        JSON.stringify(data)
      );
    });
  });

  describe('confirmationExists', () => {
    it('should return true when confirmation exists', async () => {
      mockExists.mockResolvedValue(1);

      const result = await confirmationExists('existing-confirmation');

      expect(result).toBe(true);
      expect(mockExists).toHaveBeenCalledWith('pending:existing-confirmation');
    });

    it('should return false when confirmation does not exist', async () => {
      mockExists.mockResolvedValue(0);

      const result = await confirmationExists('non-existing-confirmation');

      expect(result).toBe(false);
    });

    it('should propagate errors from Redis', async () => {
      mockExists.mockRejectedValue(new Error('Connection timeout'));

      await expect(confirmationExists('failed-check')).rejects.toThrow('Connection timeout');
    });
  });

  describe('closeRedis', () => {
    it('should close the Redis connection', async () => {
      await closeRedis();

      expect(mockQuit).toHaveBeenCalled();
    });
  });
});
