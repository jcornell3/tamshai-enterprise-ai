/**
 * Redis Utility for Pending Confirmations
 *
 * Implements Section 5.6: Human-in-the-Loop Confirmations
 * Stores pending write operations with 5-minute TTL
 */

import Redis from 'ioredis';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('error', (err) => {
  logger.error('Redis connection error', err);
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

/**
 * Store a pending confirmation with TTL
 *
 * @param confirmationId - UUID for the confirmation
 * @param data - Action data to store
 * @param ttlSeconds - Time to live in seconds (default 300 = 5 minutes)
 */
export async function storePendingConfirmation(
  confirmationId: string,
  data: Record<string, unknown>,
  ttlSeconds: number = 300
): Promise<void> {
  const key = `pending:${confirmationId}`;

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
    logger.info('Stored pending confirmation', { confirmationId, ttlSeconds });
  } catch (error) {
    logger.error('Failed to store pending confirmation', { confirmationId, error });
    throw new Error('Failed to store confirmation');
  }
}

/**
 * Check if a confirmation exists in Redis
 *
 * @param confirmationId - UUID for the confirmation
 * @returns true if confirmation exists, false otherwise
 */
export async function confirmationExists(confirmationId: string): Promise<boolean> {
  const key = `pending:${confirmationId}`;

  try {
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error('Failed to check confirmation existence', { confirmationId, error });
    return false;
  }
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis connection closed');
}

export default redis;
