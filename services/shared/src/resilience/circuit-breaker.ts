/**
 * Circuit Breaker Pattern (v1.5 Performance Optimization)
 *
 * Prevents cascading failures when MCP servers or external services are unavailable.
 * Uses the opossum library for battle-tested circuit breaker implementation.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail fast without calling the service
 * - HALF-OPEN: Testing if service has recovered
 *
 * Configuration:
 * - timeout: How long to wait before timing out a request
 * - errorThresholdPercentage: Percentage of failures to trigger OPEN state
 * - resetTimeout: How long to wait before testing recovery (HALF-OPEN)
 * - volumeThreshold: Minimum requests before calculating error percentage
 */

import CircuitBreaker from 'opossum';

export interface CircuitBreakerConfig {
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Percentage of failures to trigger OPEN state (default: 50) */
  errorThresholdPercentage?: number;
  /** Time in ms before trying again after OPEN (default: 30000) */
  resetTimeout?: number;
  /** Minimum requests before calculating error percentage (default: 5) */
  volumeThreshold?: number;
  /** Name for logging purposes */
  name?: string;
}

export interface CircuitBreakerLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export interface CircuitBreakerStats {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
  fallbacks: number;
  timeouts: number;
  cacheHits: number;
  cacheMisses: number;
  percentiles: Record<string, number>;
}

const DEFAULT_CONFIG: Required<Omit<CircuitBreakerConfig, 'name'>> = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

/**
 * Create a circuit breaker for an async function
 *
 * @param fn - The async function to protect
 * @param config - Circuit breaker configuration
 * @param logger - Optional logger for state changes
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  config: CircuitBreakerConfig = {},
  logger?: CircuitBreakerLogger
): CircuitBreaker<Parameters<T>, Awaited<ReturnType<T>>> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const name = config.name || 'unnamed';

  const breaker = new CircuitBreaker(fn, {
    timeout: finalConfig.timeout,
    errorThresholdPercentage: finalConfig.errorThresholdPercentage,
    resetTimeout: finalConfig.resetTimeout,
    volumeThreshold: finalConfig.volumeThreshold,
  });

  // Set up event listeners for logging
  if (logger) {
    breaker.on('open', () => {
      logger.warn('Circuit breaker OPEN - failing fast', {
        circuit: name,
        state: 'OPEN',
        stats: getStats(breaker),
      });
    });

    breaker.on('halfOpen', () => {
      logger.info('Circuit breaker HALF-OPEN - testing recovery', {
        circuit: name,
        state: 'HALF_OPEN',
      });
    });

    breaker.on('close', () => {
      logger.info('Circuit breaker CLOSED - normal operation resumed', {
        circuit: name,
        state: 'CLOSED',
      });
    });

    breaker.on('timeout', () => {
      logger.warn('Circuit breaker request timed out', {
        circuit: name,
        timeout: finalConfig.timeout,
      });
    });

    breaker.on('reject', () => {
      logger.warn('Circuit breaker rejected request (circuit OPEN)', {
        circuit: name,
      });
    });

    breaker.on('fallback', (result: unknown) => {
      logger.info('Circuit breaker fallback executed', {
        circuit: name,
        fallbackResult: typeof result,
      });
    });
  }

  return breaker as CircuitBreaker<Parameters<T>, Awaited<ReturnType<T>>>;
}

/**
 * Get circuit breaker statistics
 */
export function getStats(breaker: CircuitBreaker): CircuitBreakerStats {
  const stats = breaker.stats;
  return {
    state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
    failures: stats.failures,
    successes: stats.successes,
    fallbacks: stats.fallbacks,
    timeouts: stats.timeouts,
    cacheHits: stats.cacheHits,
    cacheMisses: stats.cacheMisses,
    percentiles: stats.percentiles,
  };
}

/**
 * Check if circuit is healthy (CLOSED state)
 */
export function isHealthy(breaker: CircuitBreaker): boolean {
  return !breaker.opened && !breaker.halfOpen;
}

/**
 * Force circuit to OPEN state (for testing or manual intervention)
 */
export function forceOpen(breaker: CircuitBreaker): void {
  breaker.open();
}

/**
 * Force circuit to CLOSED state (for testing or manual intervention)
 */
export function forceClose(breaker: CircuitBreaker): void {
  breaker.close();
}

/**
 * Create a circuit breaker with a fallback function
 *
 * @param fn - The async function to protect
 * @param fallbackFn - Function to call when circuit is OPEN
 * @param config - Circuit breaker configuration
 * @param logger - Optional logger
 * @returns Circuit breaker with fallback
 */
export function createCircuitBreakerWithFallback<
  T extends (...args: unknown[]) => Promise<unknown>,
  F extends (...args: Parameters<T>) => ReturnType<T>
>(
  fn: T,
  fallbackFn: F,
  config: CircuitBreakerConfig = {},
  logger?: CircuitBreakerLogger
): CircuitBreaker<Parameters<T>, Awaited<ReturnType<T>>> {
  const breaker = createCircuitBreaker(fn, config, logger);
  breaker.fallback(fallbackFn);
  return breaker;
}

/**
 * MCP Server Circuit Breaker Factory
 *
 * Creates pre-configured circuit breakers for MCP server queries
 * with sensible defaults for the Tamshai platform.
 */
export class MCPCircuitBreakerFactory {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private logger?: CircuitBreakerLogger;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = {}, logger?: CircuitBreakerLogger) {
    this.config = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 5,
      ...config,
    };
    this.logger = logger;
  }

  /**
   * Get or create a circuit breaker for an MCP server
   */
  getBreaker<T extends (...args: unknown[]) => Promise<unknown>>(
    serverName: string,
    queryFn: T
  ): CircuitBreaker<Parameters<T>, Awaited<ReturnType<T>>> {
    const existing = this.breakers.get(serverName);
    if (existing) {
      return existing as CircuitBreaker<Parameters<T>, Awaited<ReturnType<T>>>;
    }

    const breaker = createCircuitBreaker(queryFn, {
      ...this.config,
      name: `mcp-${serverName}`,
    }, this.logger);

    this.breakers.set(serverName, breaker);
    return breaker;
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = getStats(breaker);
    }
    return stats;
  }

  /**
   * Check if all circuits are healthy
   */
  allHealthy(): boolean {
    for (const breaker of this.breakers.values()) {
      if (!isHealthy(breaker)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get unhealthy circuit names
   */
  getUnhealthyCircuits(): string[] {
    const unhealthy: string[] = [];
    for (const [name, breaker] of this.breakers) {
      if (!isHealthy(breaker)) {
        unhealthy.push(name);
      }
    }
    return unhealthy;
  }

  /**
   * Shutdown all circuit breakers
   */
  shutdown(): void {
    for (const breaker of this.breakers.values()) {
      breaker.shutdown();
    }
    this.breakers.clear();
  }
}
