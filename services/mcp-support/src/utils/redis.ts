/**
 * Redis Utility for Pending Confirmations - Support Server
 */

import Redis from 'ioredis';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
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

redis.on('error', (err) => logger.error('Redis connection error', err));
redis.on('connect', () => logger.info('Connected to Redis'));

export async function storePendingConfirmation(confirmationId: string, data: Record<string, unknown>, ttlSeconds: number = 300): Promise<void> {
  const key = `pending:${confirmationId}`;
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
    logger.info('Stored pending confirmation', { confirmationId, ttlSeconds });
  } catch (error) {
    logger.error('Failed to store pending confirmation', { confirmationId, error });
    throw new Error('Failed to store confirmation');
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis connection closed');
}

export default redis;
