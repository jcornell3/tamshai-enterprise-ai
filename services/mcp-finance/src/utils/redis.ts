/**
 * Redis Utility for Pending Confirmations
 *
 * Thin wrapper around @tamshai/shared Redis confirmation cache.
 * Implements Section 5.6: Human-in-the-Loop Confirmations
 * Stores pending write operations with 5-minute TTL
 */

import { createRedisConfirmationCache, RedisConfirmationCache } from '@tamshai/shared';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

const cache: RedisConfirmationCache = createRedisConfirmationCache('finance', logger);

/**
 * Store a pending confirmation with TTL
 */
export const storePendingConfirmation = cache.storePendingConfirmation;

/**
 * Check if a confirmation exists in Redis
 */
export const confirmationExists = cache.confirmationExists;

/**
 * Get pending confirmation data from Redis (one-time use: retrieves and deletes)
 */
export const getPendingConfirmation = cache.getPendingConfirmation;

/**
 * Delete a pending confirmation from Redis
 *
 * @deprecated Use getPendingConfirmation which auto-deletes. Kept for backward compatibility.
 */
export async function deletePendingConfirmation(confirmationId: string): Promise<void> {
  // getPendingConfirmation already deletes, but this is called separately in finance.
  // We need to just delete the key without retrieving.
  const client = cache.getRedisClient();
  const key = `pending:${confirmationId}`;
  try {
    await client.del(key);
    logger.info('Deleted pending confirmation', { confirmationId });
  } catch (error) {
    logger.error('Failed to delete pending confirmation', { confirmationId, error });
  }
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export const closeRedis = cache.closeRedis;

/**
 * Check Redis connection health
 */
export const checkRedisConnection = cache.checkRedisConnection;

/**
 * Get the underlying Redis client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRedisClient(): any {
  return cache.getRedisClient();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const redisClient: any = cache.getRedisClient();
export default redisClient;
