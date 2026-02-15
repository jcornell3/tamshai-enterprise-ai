/**
 * Redis Utility for Pending Confirmations (Architecture v1.4 - Section 5.6)
 *
 * Thin wrapper around @tamshai/shared Redis confirmation cache.
 * Provides Redis client for storing pending write operation confirmations
 * with 5-minute TTL before they expire.
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

const cache: RedisConfirmationCache = createRedisConfirmationCache('hr', logger);

/**
 * Store a pending confirmation with TTL (5 minutes)
 */
export const storePendingConfirmation = cache.storePendingConfirmation;

/**
 * Check if a confirmation exists (for Gateway to retrieve)
 */
export const confirmationExists = cache.confirmationExists;

/**
 * Get the underlying Redis client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRedisClient(): any {
  return cache.getRedisClient();
}

/**
 * Check Redis connection health
 */
export const checkRedisConnection = cache.checkRedisConnection;

/**
 * Close Redis connection (for graceful shutdown)
 */
export const closeRedis = cache.closeRedis;

/**
 * Retrieve and delete a pending confirmation (one-time use)
 */
export const getPendingConfirmation = cache.getPendingConfirmation;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const redisClient: any = cache.getRedisClient();
export default redisClient;
