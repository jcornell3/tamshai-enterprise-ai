/**
 * Redis Utility for Pending Confirmations (Architecture v1.4 - Section 5.6)
 *
 * Provides Redis client for storing pending write operation confirmations
 * with 5-minute TTL before they expire.
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
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('Redis connected', {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  });
});

redis.on('error', (err) => {
  logger.error('Redis error:', err);
});

/**
 * Store a pending confirmation with TTL (5 minutes)
 *
 * @param confirmationId - Unique confirmation ID (UUID)
 * @param data - Confirmation data to store
 * @param ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
 */
export async function storePendingConfirmation(
  confirmationId: string,
  data: Record<string, unknown>,
  ttlSeconds: number = 300
): Promise<void> {
  const key = `pending:${confirmationId}`;
  await redis.setex(key, ttlSeconds, JSON.stringify(data));
  logger.info('Stored pending confirmation', {
    confirmationId,
    action: data.action,
    ttl: ttlSeconds,
  });
}

/**
 * Check if a confirmation exists (for Gateway to retrieve)
 *
 * Note: The Gateway handles actual retrieval and deletion.
 * This function is for internal MCP server checks only.
 */
export async function confirmationExists(
  confirmationId: string
): Promise<boolean> {
  const key = `pending:${confirmationId}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

export default redis;
