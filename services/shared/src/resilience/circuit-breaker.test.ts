/**
 * Unit tests for Circuit Breaker module
 */

import CircuitBreaker from 'opossum';
import {
  createCircuitBreaker,
  createCircuitBreakerWithFallback,
  getStats,
  isHealthy,
  forceOpen,
  forceClose,
  MCPCircuitBreakerFactory,
  CircuitBreakerLogger,
} from './circuit-breaker';

describe('Circuit Breaker', () => {
  // Helper function that succeeds
  const successFn = jest.fn().mockResolvedValue({ data: 'success' });

  // Helper function that fails
  const failFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

  // Mock logger
  const mockLogger: CircuitBreakerLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCircuitBreaker', () => {
    it('should create a circuit breaker with default config', () => {
      const breaker = createCircuitBreaker(successFn);

      expect(breaker).toBeInstanceOf(CircuitBreaker);
      expect(breaker.opened).toBe(false);
    });

    it('should pass through successful calls', async () => {
      const breaker = createCircuitBreaker(successFn);

      const result = await breaker.fire();

      expect(result).toEqual({ data: 'success' });
      expect(successFn).toHaveBeenCalled();
    });

    it('should use custom timeout configuration', () => {
      const breaker = createCircuitBreaker(successFn, { timeout: 10000 });

      // Verify breaker was created (options are internal)
      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should use custom error threshold configuration', () => {
      const breaker = createCircuitBreaker(successFn, {
        errorThresholdPercentage: 75,
      });

      // Verify breaker was created (options are internal)
      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should log state changes when logger is provided', async () => {
      const breaker = createCircuitBreaker(failFn, {
        name: 'test-circuit',
        volumeThreshold: 1,
        errorThresholdPercentage: 1,
      }, mockLogger);

      // Trigger failures to open the circuit
      try {
        await breaker.fire();
      } catch {
        // Expected failure
      }

      // Circuit should open after failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker OPEN - failing fast',
        expect.objectContaining({
          circuit: 'test-circuit',
          state: 'OPEN',
        })
      );
    });
  });

  describe('createCircuitBreakerWithFallback', () => {
    it('should execute fallback when circuit is open', async () => {
      const fallbackFn = jest.fn().mockResolvedValue({ data: 'fallback' });

      const breaker = createCircuitBreakerWithFallback(
        failFn,
        fallbackFn,
        { volumeThreshold: 1, errorThresholdPercentage: 1 }
      );

      // First call fails and opens circuit
      const result1 = await breaker.fire();
      expect(result1).toEqual({ data: 'fallback' });

      // Second call uses fallback because circuit is open
      const result2 = await breaker.fire();
      expect(result2).toEqual({ data: 'fallback' });
    });
  });

  describe('getStats', () => {
    it('should return circuit breaker statistics', async () => {
      const breaker = createCircuitBreaker(successFn);

      // Make some successful calls
      await breaker.fire();
      await breaker.fire();

      const stats = getStats(breaker);

      expect(stats.state).toBe('CLOSED');
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(0);
    });

    it('should track failures', async () => {
      const breaker = createCircuitBreaker(failFn, { volumeThreshold: 10 });

      try {
        await breaker.fire();
      } catch {
        // Expected failure
      }

      const stats = getStats(breaker);
      expect(stats.failures).toBe(1);
    });
  });

  describe('isHealthy', () => {
    it('should return true for closed circuit', () => {
      const breaker = createCircuitBreaker(successFn);

      expect(isHealthy(breaker)).toBe(true);
    });

    it('should return false for open circuit', async () => {
      const breaker = createCircuitBreaker(failFn, {
        volumeThreshold: 1,
        errorThresholdPercentage: 1,
      });

      try {
        await breaker.fire();
      } catch {
        // Expected
      }

      expect(isHealthy(breaker)).toBe(false);
    });
  });

  describe('forceOpen / forceClose', () => {
    it('should force circuit to open state', () => {
      const breaker = createCircuitBreaker(successFn);

      forceOpen(breaker);

      expect(breaker.opened).toBe(true);
      expect(isHealthy(breaker)).toBe(false);
    });

    it('should force circuit to closed state', async () => {
      const breaker = createCircuitBreaker(failFn, {
        volumeThreshold: 1,
        errorThresholdPercentage: 1,
      });

      // Open the circuit
      try {
        await breaker.fire();
      } catch {
        // Expected
      }

      expect(breaker.opened).toBe(true);

      // Force close
      forceClose(breaker);

      expect(breaker.opened).toBe(false);
    });
  });

  describe('MCPCircuitBreakerFactory', () => {
    it('should create breakers for different servers', () => {
      const factory = new MCPCircuitBreakerFactory();

      const hrBreaker = factory.getBreaker('hr', successFn);
      const financeBreaker = factory.getBreaker('finance', successFn);

      expect(hrBreaker).toBeInstanceOf(CircuitBreaker);
      expect(financeBreaker).toBeInstanceOf(CircuitBreaker);
      expect(hrBreaker).not.toBe(financeBreaker);
    });

    it('should return same breaker for same server', () => {
      const factory = new MCPCircuitBreakerFactory();

      const breaker1 = factory.getBreaker('hr', successFn);
      const breaker2 = factory.getBreaker('hr', successFn);

      expect(breaker1).toBe(breaker2);
    });

    it('should get all stats', async () => {
      const factory = new MCPCircuitBreakerFactory();

      const hrBreaker = factory.getBreaker('hr', successFn);
      await hrBreaker.fire();

      const stats = factory.getAllStats();

      expect(stats['hr']).toBeDefined();
      expect(stats['hr'].state).toBe('CLOSED');
    });

    it('should check if all circuits are healthy', () => {
      const factory = new MCPCircuitBreakerFactory();

      factory.getBreaker('hr', successFn);
      factory.getBreaker('finance', successFn);

      expect(factory.allHealthy()).toBe(true);
    });

    it('should get unhealthy circuits', async () => {
      const factory = new MCPCircuitBreakerFactory({
        volumeThreshold: 1,
        errorThresholdPercentage: 1,
      });

      factory.getBreaker('hr', successFn);
      const financeBreaker = factory.getBreaker('finance', failFn);

      try {
        await financeBreaker.fire();
      } catch {
        // Expected
      }

      const unhealthy = factory.getUnhealthyCircuits();

      expect(unhealthy).toContain('finance');
      expect(unhealthy).not.toContain('hr');
    });

    it('should shutdown all breakers', () => {
      const factory = new MCPCircuitBreakerFactory();

      const hrBreaker = factory.getBreaker('hr', successFn);
      const shutdownSpy = jest.spyOn(hrBreaker, 'shutdown');

      factory.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
    });

    it('should use custom config', () => {
      const factory = new MCPCircuitBreakerFactory({
        timeout: 10000,
        resetTimeout: 60000,
      });

      const breaker = factory.getBreaker('hr', successFn);

      // Verify breaker was created with factory config
      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should use logger if provided', async () => {
      const factory = new MCPCircuitBreakerFactory(
        { volumeThreshold: 1, errorThresholdPercentage: 1 },
        mockLogger
      );

      const breaker = factory.getBreaker('test', failFn);

      try {
        await breaker.fire();
      } catch {
        // Expected
      }

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
