/**
 * Redis Confirmation Cache (Shared Utility)
 *
 * Provides a standardized Redis-based confirmation cache for human-in-the-loop
 * approval flows across all MCP services (Architecture v1.4 - Section 5.6).
 *
 * Uses a lazy-loading singleton pattern for the Redis client.
 * Key format: `pending:{confirmationId}` (matches MCP Gateway's confirmation endpoint)
 *
 * Usage:
 *   import { createRedisConfirmationCache } from '@tamshai/shared';
 *   const cache = createRedisConfirmationCache('hr', logger);
 *   await cache.storePendingConfirmation(id, data);
 */

import Redis from 'ioredis';

/**
 * Minimal logger interface compatible with Winston and other loggers.
 */
export interface ConfirmationLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Interface for the confirmation cache returned by the factory.
 */
export interface RedisConfirmationCache {
  storePendingConfirmation(
    confirmationId: string,
    data: Record<string, unknown>,
    ttlSeconds?: number
  ): Promise<void>;

  getPendingConfirmation(
    confirmationId: string
  ): Promise<Record<string, unknown> | null>;

  confirmationExists(confirmationId: string): Promise<boolean>;

  checkRedisConnection(): Promise<boolean>;

  closeRedis(): Promise<void>;

  getRedisClient(): Redis;
}

// Lazy-loading singleton Redis client shared across all service caches
let sharedRedisClient: Redis | null = null;
let sharedLogger: ConfirmationLogger | null = null;

/**
 * Get or create the shared Redis client singleton.
 * Uses lazy initialization - only connects when first accessed.
 */
function getOrCreateRedisClient(logger: ConfirmationLogger): Redis {
  if (!sharedRedisClient) {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;

    sharedRedisClient = new Redis({
      host,
      port,
      password,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    sharedRedisClient.on('error', (err) => {
      const activeLogger = sharedLogger || logger;
      activeLogger.error('Redis connection error', { error: err.message });
    });

    sharedRedisClient.on('connect', () => {
      const activeLogger = sharedLogger || logger;
      activeLogger.info('Redis connected', { host, port });
    });

    sharedLogger = logger;
  }

  return sharedRedisClient;
}

/**
 * Create a Redis confirmation cache for a specific MCP service.
 *
 * Uses a simple key format (`pending:{confirmationId}`) that matches the
 * MCP Gateway's confirmation endpoint expectations.
 *
 * @param serviceName - Service identifier for logging purposes (e.g., 'hr', 'finance')
 * @param logger - Logger instance (Winston-compatible)
 * @returns RedisConfirmationCache interface
 */
export function createRedisConfirmationCache(
  serviceName: string,
  logger: ConfirmationLogger
): RedisConfirmationCache {
  function buildKey(confirmationId: string): string {
    return `pending:${confirmationId}`;
  }

  return {
    async storePendingConfirmation(
      confirmationId: string,
      data: Record<string, unknown>,
      ttlSeconds: number = 300
    ): Promise<void> {
      const client = getOrCreateRedisClient(logger);
      const key = buildKey(confirmationId);

      try {
        await client.setex(key, ttlSeconds, JSON.stringify(data));
        logger.debug('Stored pending confirmation', {
          confirmationId,
          serviceName,
          ttlSeconds,
        });
      } catch (error) {
        logger.error('Failed to store pending confirmation', {
          confirmationId,
          serviceName,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Failed to store confirmation');
      }
    },

    async getPendingConfirmation(
      confirmationId: string
    ): Promise<Record<string, unknown> | null> {
      const client = getOrCreateRedisClient(logger);
      const key = buildKey(confirmationId);

      try {
        const data = await client.get(key);

        if (!data) {
          logger.warn('Confirmation not found or expired', {
            confirmationId,
            serviceName,
          });
          return null;
        }

        // Delete after retrieval (one-time use)
        await client.del(key);
        logger.debug('Retrieved and deleted pending confirmation', {
          confirmationId,
          serviceName,
        });

        return JSON.parse(data);
      } catch (error) {
        logger.error('Failed to get pending confirmation', {
          confirmationId,
          serviceName,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },

    async confirmationExists(confirmationId: string): Promise<boolean> {
      const client = getOrCreateRedisClient(logger);
      const key = buildKey(confirmationId);

      try {
        const exists = await client.exists(key);
        return exists === 1;
      } catch (error) {
        logger.error('Failed to check confirmation existence', {
          confirmationId,
          serviceName,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },

    async checkRedisConnection(): Promise<boolean> {
      try {
        const client = getOrCreateRedisClient(logger);
        const result = await client.ping();
        return result === 'PONG';
      } catch (error) {
        logger.error('Redis connection check failed', {
          serviceName,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },

    async closeRedis(): Promise<void> {
      if (sharedRedisClient) {
        await sharedRedisClient.quit();
        sharedRedisClient = null;
        sharedLogger = null;
        logger.info('Redis connection closed', { serviceName });
      }
    },

    getRedisClient(): Redis {
      return getOrCreateRedisClient(logger);
    },
  };
}

/**
 * Reset the shared Redis client (primarily for testing).
 * Forces a new connection on the next `createRedisConfirmationCache` call.
 */
export function resetSharedRedisClient(): void {
  if (sharedRedisClient) {
    sharedRedisClient.disconnect();
    sharedRedisClient = null;
    sharedLogger = null;
  }
}
