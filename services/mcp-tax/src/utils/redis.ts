/**
 * Redis Utility for Pending Confirmations - Tax Server
 *
 * Thin wrapper around @tamshai/shared Redis confirmation cache.
 * Used for human-in-the-loop approval flow.
 */

import { createRedisConfirmationCache, RedisConfirmationCache } from '@tamshai/shared';
import { logger } from './logger';

const cache: RedisConfirmationCache = createRedisConfirmationCache('tax', logger);

/**
 * Store a pending confirmation with TTL
 */
export const storePendingConfirmation = cache.storePendingConfirmation;

/**
 * Retrieve and delete a pending confirmation (one-time use)
 */
export const getPendingConfirmation = cache.getPendingConfirmation;

/**
 * Check if a confirmation exists
 */
export const confirmationExists = cache.confirmationExists;

/**
 * Check Redis connection health
 */
export const checkRedisConnection = cache.checkRedisConnection;

/**
 * Close Redis connection (for graceful shutdown)
 */
export const closeRedis = cache.closeRedis;

/**
 * Get the underlying Redis client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRedisClient(): any {
  return cache.getRedisClient();
}
