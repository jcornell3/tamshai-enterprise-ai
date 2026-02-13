/**
 * Redis Utility Unit Tests
 */

// Create mock functions at the top level
const mockSetex = jest.fn();
const mockGet = jest.fn();
const mockDel = jest.fn();
const mockPing = jest.fn();
const mockQuit = jest.fn();
const mockOn = jest.fn();

const mockRedisInstance = {
  setex: mockSetex,
  get: mockGet,
  del: mockDel,
  ping: mockPing,
  quit: mockQuit,
  on: mockOn,
};

// Mock ioredis before importing
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Mock logger
jest.mock('./logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Need to reset modules to clear the cached redis instance
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('Redis Utility Module', () => {
  describe('getRedisClient', () => {
    it('should return a Redis client instance', async () => {
      const { getRedisClient } = await import('./redis');
      const client = getRedisClient();
      expect(client).toBeDefined();
    });

    it('should return the same instance on subsequent calls', async () => {
      const { getRedisClient } = await import('./redis');
      const client1 = getRedisClient();
      const client2 = getRedisClient();
      expect(client1).toBe(client2);
    });
  });

  describe('storePendingConfirmation', () => {
    it('should store confirmation with default TTL', async () => {
      mockSetex.mockResolvedValue('OK');
      const { storePendingConfirmation } = await import('./redis');

      const confirmationId = 'test-confirmation-123';
      const data = {
        action: 'approve_pay_run',
        payRunId: 'pr-123',
        userId: 'user-123',
      };

      await storePendingConfirmation(confirmationId, data);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:payroll:test-confirmation-123',
        300,
        JSON.stringify(data)
      );
    });

    it('should store confirmation with custom TTL', async () => {
      mockSetex.mockResolvedValue('OK');
      const { storePendingConfirmation } = await import('./redis');

      const confirmationId = 'test-confirmation-456';
      const data = { action: 'process_payroll' };
      const customTTL = 600;

      await storePendingConfirmation(confirmationId, data, customTTL);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:payroll:test-confirmation-456',
        600,
        JSON.stringify(data)
      );
    });

    it('should handle complex data objects', async () => {
      mockSetex.mockResolvedValue('OK');
      const { storePendingConfirmation } = await import('./redis');

      const confirmationId = 'complex-123';
      const data = {
        action: 'approve_pay_run',
        mcpServer: 'payroll',
        userId: 'admin-123',
        timestamp: 1234567890,
        payRunId: 'pr-456',
        employeeCount: 50,
        totalAmount: 125000.00,
        metadata: {
          source: 'api',
          version: '1.0',
        },
      };

      await storePendingConfirmation(confirmationId, data);

      expect(mockSetex).toHaveBeenCalledWith(
        'pending:payroll:complex-123',
        300,
        JSON.stringify(data)
      );
    });
  });

  describe('getPendingConfirmation', () => {
    it('should retrieve and delete confirmation', async () => {
      const storedData = {
        action: 'approve_pay_run',
        payRunId: 'pr-123',
      };

      mockGet.mockResolvedValue(JSON.stringify(storedData));
      mockDel.mockResolvedValue(1);

      const { getPendingConfirmation } = await import('./redis');
      const result = await getPendingConfirmation('existing-confirmation');

      expect(result).toEqual(storedData);
      expect(mockGet).toHaveBeenCalledWith('pending:payroll:existing-confirmation');
      expect(mockDel).toHaveBeenCalledWith('pending:payroll:existing-confirmation');
    });

    it('should return null when confirmation not found', async () => {
      mockGet.mockResolvedValue(null);

      const { getPendingConfirmation } = await import('./redis');
      const result = await getPendingConfirmation('non-existing-confirmation');

      expect(result).toBeNull();
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should handle complex stored data', async () => {
      const storedData = {
        action: 'process_payroll',
        payRunId: 'pr-789',
        employees: [
          { id: 'emp-1', amount: 5000 },
          { id: 'emp-2', amount: 6000 },
        ],
      };

      mockGet.mockResolvedValue(JSON.stringify(storedData));
      mockDel.mockResolvedValue(1);

      const { getPendingConfirmation } = await import('./redis');
      const result = await getPendingConfirmation('complex-data');

      expect(result).toEqual(storedData);
    });
  });

  describe('checkRedisConnection', () => {
    it('should return true when ping succeeds', async () => {
      mockPing.mockResolvedValue('PONG');

      const { checkRedisConnection } = await import('./redis');
      const result = await checkRedisConnection();

      expect(result).toBe(true);
      expect(mockPing).toHaveBeenCalled();
    });

    it('should return false when ping returns unexpected value', async () => {
      mockPing.mockResolvedValue('NOT_PONG');

      const { checkRedisConnection } = await import('./redis');
      const result = await checkRedisConnection();

      expect(result).toBe(false);
    });

    it('should return false when ping fails', async () => {
      mockPing.mockRejectedValue(new Error('Connection refused'));

      const { checkRedisConnection } = await import('./redis');
      const result = await checkRedisConnection();

      expect(result).toBe(false);
    });
  });

  describe('closeRedis', () => {
    it('should close the Redis connection', async () => {
      mockQuit.mockResolvedValue('OK');

      const { getRedisClient, closeRedis } = await import('./redis');
      // First get a client to ensure it exists
      getRedisClient();

      await closeRedis();

      expect(mockQuit).toHaveBeenCalled();
    });

    it('should do nothing if redis is not initialized', async () => {
      // Reset modules to get fresh state without initialized redis
      jest.resetModules();

      const { closeRedis } = await import('./redis');
      // Don't call getRedisClient first

      await closeRedis();

      // quit should not be called since redis was null
      expect(mockQuit).not.toHaveBeenCalled();
    });
  });
});
