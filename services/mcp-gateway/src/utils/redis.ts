/**
 * Redis Connection Utility
 *
 * Provides Redis client for:
 * - Token revocation cache
 * - Pending confirmation storage (v1.4 - Section 5.6)
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

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

const redis = new Redis(redisConfig);

redis.on('connect', () => {
  logger.info('Redis connected', {
    host: redisConfig.host,
    port: redisConfig.port,
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
    ttl: ttlSeconds,
  });
}

/**
 * Retrieve and delete a pending confirmation (atomic operation)
 *
 * @param confirmationId - Unique confirmation ID
 * @returns Confirmation data or null if not found/expired
 */
export async function getPendingConfirmation(
  confirmationId: string
): Promise<Record<string, unknown> | null> {
  const key = `pending:${confirmationId}`;

  // Get the value
  const data = await redis.get(key);

  if (!data) {
    logger.warn('Pending confirmation not found or expired', { confirmationId });
    return null;
  }

  // Delete it immediately to prevent double-execution
  await redis.del(key);

  logger.info('Retrieved and deleted pending confirmation', { confirmationId });
  return JSON.parse(data);
}

/**
 * Delete a pending confirmation (for rejections)
 *
 * @param confirmationId - Unique confirmation ID
 */
export async function deletePendingConfirmation(
  confirmationId: string
): Promise<void> {
  const key = `pending:${confirmationId}`;
  await redis.del(key);
  logger.info('Deleted pending confirmation', { confirmationId });
}

/**
 * Check if a token is revoked
 *
 * @param jti - JWT ID from token claims
 * @returns true if revoked, false otherwise
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  const key = `revoked:${jti}`;
  const result = await redis.get(key);
  return result !== null;
}

/**
 * Revoke a token by storing its JTI with TTL matching token expiry
 *
 * @param jti - JWT ID from token claims
 * @param ttlSeconds - TTL matching the token's remaining lifetime
 */
export async function revokeToken(
  jti: string,
  ttlSeconds: number
): Promise<void> {
  const key = `revoked:${jti}`;
  await redis.setex(key, ttlSeconds, '1');
  logger.info('Revoked token', { jti, ttl: ttlSeconds });
}

export default redis;
