/**
 * Redis Utility
 *
 * Redis client for storing pending confirmations.
 * Used for human-in-the-loop approval flow.
 */
import Redis from 'ioredis';
import { logger } from './logger';

const redisHost = process.env.REDIS_HOST;
const redisPort = parseInt(process.env.REDIS_PORT!, 10);
const redisPassword = process.env.REDIS_PASSWORD;

let redis: Redis | null = null;

/**
 * Get or create Redis client.
 */
export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('error', (err) => {
      logger.error('Redis error', { error: err.message });
    });

    redis.on('connect', () => {
      logger.info('Redis connected', { host: redisHost, port: redisPort });
    });
  }
  return redis;
}

/**
 * Store a pending confirmation with TTL.
 */
export async function storePendingConfirmation(
  confirmationId: string,
  data: Record<string, unknown>,
  ttlSeconds: number = 300
): Promise<void> {
  const client = getRedisClient();
  const key = `pending:tax:${confirmationId}`;
  await client.setex(key, ttlSeconds, JSON.stringify(data));
  logger.debug('Stored pending confirmation', { confirmationId, ttlSeconds });
}

/**
 * Retrieve and delete a pending confirmation.
 */
export async function getPendingConfirmation(
  confirmationId: string
): Promise<Record<string, unknown> | null> {
  const client = getRedisClient();
  const key = `pending:tax:${confirmationId}`;
  const data = await client.get(key);

  if (!data) {
    return null;
  }

  // Delete after retrieval (one-time use)
  await client.del(key);
  return JSON.parse(data);
}

/**
 * Check Redis connection health.
 */
export async function checkRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis connection check failed', { error });
    return false;
  }
}

/**
 * Close Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
