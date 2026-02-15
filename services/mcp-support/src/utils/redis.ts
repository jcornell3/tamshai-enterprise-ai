/**
 * Redis Utility for Pending Confirmations - Support Server
 *
 * Thin wrapper around @tamshai/shared Redis confirmation cache.
 * Implements Section 5.6: Human-in-the-Loop Confirmations
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

const cache: RedisConfirmationCache = createRedisConfirmationCache('support', logger);

/**
 * Store a pending confirmation with TTL
 */
export const storePendingConfirmation = cache.storePendingConfirmation;

/**
 * Check if a confirmation exists
 */
export const confirmationExists = cache.confirmationExists;

/**
 * Get pending confirmation data (one-time use: retrieves and deletes)
 */
export const getPendingConfirmation = cache.getPendingConfirmation;

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
