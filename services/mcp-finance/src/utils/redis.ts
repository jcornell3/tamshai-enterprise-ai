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
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT!, 10),
  password: process.env.REDIS_PASSWORD,
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
 * Get pending confirmation data from Redis
 *
 * @param confirmationId - UUID for the confirmation
 * @returns Confirmation data or null if not found/expired
 */
export async function getPendingConfirmation(
  confirmationId: string
): Promise<Record<string, unknown> | null> {
  const key = `pending:${confirmationId}`;

  try {
    const data = await redis.get(key);
    if (!data) {
      logger.warn('Confirmation not found or expired', { confirmationId });
      return null;
    }
    return JSON.parse(data);
  } catch (error) {
    logger.error('Failed to get pending confirmation', { confirmationId, error });
    return null;
  }
}

/**
 * Delete a pending confirmation from Redis
 *
 * @param confirmationId - UUID for the confirmation
 */
export async function deletePendingConfirmation(confirmationId: string): Promise<void> {
  const key = `pending:${confirmationId}`;

  try {
    await redis.del(key);
    logger.info('Deleted pending confirmation', { confirmationId });
  } catch (error) {
    logger.error('Failed to delete pending confirmation', { confirmationId, error });
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
