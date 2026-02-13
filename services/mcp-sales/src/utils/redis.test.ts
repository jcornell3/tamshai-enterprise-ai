/**
 * Redis Utility Unit Tests
 *
 * Tests for pending confirmation storage and retrieval.
 */

// Create mock functions
const mockSetex = jest.fn();
const mockExists = jest.fn();
const mockQuit = jest.fn();
const mockOn = jest.fn();

// Mock ioredis before importing
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    setex: mockSetex,
    exists: mockExists,
    quit: mockQuit,
    on: mockOn,
  }));
});

import { storePendingConfirmation, confirmationExists, closeRedis } from './redis';

describe('Redis Utility Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storePendingConfirmation', () => {
    it('should store confirmation with default TTL', async () => {
      mockSetex.mockResolvedValue('OK');

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
      mockSetex.mockResolvedValue('OK');

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
        .rejects.toThrow('Failed to store confirmation');
    });

    it('should handle complex data objects', async () => {
      mockSetex.mockResolvedValue('OK');

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

    it('should return false when Redis check fails', async () => {
      mockExists.mockRejectedValue(new Error('Connection timeout'));

      const result = await confirmationExists('failed-check');

      expect(result).toBe(false);
    });
  });

  describe('closeRedis', () => {
    it('should close the Redis connection', async () => {
      mockQuit.mockResolvedValue('OK');

      await closeRedis();

      expect(mockQuit).toHaveBeenCalled();
    });
  });
});
