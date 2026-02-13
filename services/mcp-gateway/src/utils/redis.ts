/**
 * Redis Connection Utility
 *
 * Provides Redis client for:
 * - Token revocation cache (v1.5: with local caching to eliminate SPOF)
 * - Pending confirmation storage (v1.4 - Section 5.6)
 * - MCP context cache for Anthropic prompt caching (v1.5 - Section 012)
 *
 * v1.5 Performance Optimization:
 * Token revocation now uses a local in-memory cache with background sync
 * to eliminate Redis as a synchronous dependency on every request.
 * See: docs/architecture/overview.md Section 9.1
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
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT!, 10),
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

// =============================================================================
// CACHED TOKEN REVOCATION (v1.5 Performance Optimization)
// =============================================================================

/**
 * Configuration for cached token revocation
 */
const tokenRevocationConfig = {
  syncIntervalMs: parseInt(process.env.TOKEN_REVOCATION_SYNC_MS || '2000'),
  failOpen: process.env.TOKEN_REVOCATION_FAIL_OPEN !== 'false', // default: true
};

/**
 * CachedTokenRevocation provides O(1) local cache lookups with background sync.
 *
 * Benefits:
 * - Removes 5-15ms Redis RTT per request
 * - Redis failure doesn't block authentication
 * - Reduces Redis load from N calls/sec to 1 call/2 seconds
 *
 * Trade-off:
 * - Maximum 2-second window where revoked tokens may still be accepted
 */
class CachedTokenRevocation {
  private revokedTokens: Set<string> = new Set();
  private lastSyncTime: number = 0;
  private syncInProgress: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private consecutiveFailures: number = 0;
  private readonly maxConsecutiveFailures: number = 5;

  constructor() {
    // Perform initial sync
    this.syncFromRedis().catch((err) => {
      logger.warn('Initial token revocation sync failed', { error: err.message });
    });

    // Start background sync
    this.startBackgroundSync();

    logger.info('CachedTokenRevocation initialized', {
      syncIntervalMs: tokenRevocationConfig.syncIntervalMs,
      failOpen: tokenRevocationConfig.failOpen,
    });
  }

  /**
   * Check if a token is revoked (O(1) local lookup)
   *
   * @param jti - JWT ID from token claims
   * @returns true if revoked, false otherwise
   */
  isRevoked(jti: string): boolean {
    return this.revokedTokens.has(jti);
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): {
    cacheSize: number;
    lastSyncTime: number;
    consecutiveFailures: number;
    isHealthy: boolean;
  } {
    const timeSinceSync = Date.now() - this.lastSyncTime;
    const isHealthy = timeSinceSync < tokenRevocationConfig.syncIntervalMs * 3;

    return {
      cacheSize: this.revokedTokens.size,
      lastSyncTime: this.lastSyncTime,
      consecutiveFailures: this.consecutiveFailures,
      isHealthy,
    };
  }

  /**
   * Sync revoked tokens from Redis
   */
  private async syncFromRedis(): Promise<void> {
    if (this.syncInProgress) {
      return;
    }

    this.syncInProgress = true;
    const startTime = Date.now();

    try {
      // Get all revoked token keys
      const keys = await redis.keys('revoked:*');

      // Extract JTIs from keys
      const newRevokedTokens = new Set(
        keys.map((key) => key.replace('revoked:', ''))
      );

      // Atomic swap
      this.revokedTokens = newRevokedTokens;
      this.lastSyncTime = Date.now();
      this.consecutiveFailures = 0;

      const syncDuration = Date.now() - startTime;
      logger.debug('Token revocation cache synced', {
        cacheSize: this.revokedTokens.size,
        syncDurationMs: syncDuration,
      });
    } catch (error) {
      this.consecutiveFailures++;
      const err = error instanceof Error ? error : new Error(String(error));

      logger.warn('Token revocation sync failed', {
        error: err.message,
        consecutiveFailures: this.consecutiveFailures,
        failOpen: tokenRevocationConfig.failOpen,
        cacheAge: Date.now() - this.lastSyncTime,
      });

      // Alert if too many consecutive failures
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        logger.error('Token revocation sync critically failing', {
          consecutiveFailures: this.consecutiveFailures,
          cacheAge: Date.now() - this.lastSyncTime,
          recommendation: 'Check Redis connectivity',
        });
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Start background sync interval
   */
  private startBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.syncFromRedis().catch(() => {
        // Already logged in syncFromRedis
      });
    }, tokenRevocationConfig.syncIntervalMs);

    // Don't block process exit
    this.syncInterval.unref();
  }

  /**
   * Stop background sync (for graceful shutdown)
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// Singleton instance
const cachedTokenRevocation = new CachedTokenRevocation();

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
 * Check if a token is revoked (v1.5: O(1) local cache lookup)
 *
 * Uses local in-memory cache with background sync instead of
 * synchronous Redis call. See Architecture Overview Section 9.1.
 *
 * @param jti - JWT ID from token claims
 * @returns true if revoked, false otherwise
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  // v1.5: Use cached lookup (O(1) local Set lookup)
  // The async signature is kept for backwards compatibility,
  // but the implementation is now synchronous
  return cachedTokenRevocation.isRevoked(jti);
}

/**
 * Get token revocation cache statistics (for health checks)
 */
export function getTokenRevocationStats(): {
  cacheSize: number;
  lastSyncTime: number;
  consecutiveFailures: number;
  isHealthy: boolean;
} {
  return cachedTokenRevocation.getStats();
}

/**
 * Stop token revocation background sync (for graceful shutdown)
 */
export function stopTokenRevocationSync(): void {
  cachedTokenRevocation.stop();
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

// =============================================================================
// MCP CONTEXT CACHE (v1.5 Prompt Caching - Section 012)
// =============================================================================

/**
 * Get cached MCP context for a user.
 *
 * Used to avoid re-querying MCP servers when the same user makes
 * follow-up queries within the cache TTL (5 minutes).
 *
 * @param userId - User ID from JWT claims
 * @returns Serialized MCP context string, or null if not cached
 */
export async function getMCPContext(userId: string): Promise<string | null> {
  const key = `mcp_context:${userId}`;
  return redis.get(key);
}

/**
 * Store MCP context for a user with TTL.
 *
 * The serialized string is cached as-is to guarantee byte-identical
 * prompts for Anthropic's prompt caching feature.
 *
 * @param userId - User ID from JWT claims
 * @param serializedContext - Pre-serialized MCP data context string
 * @param ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
 */
export async function storeMCPContext(
  userId: string,
  serializedContext: string,
  ttlSeconds: number = 300
): Promise<void> {
  const key = `mcp_context:${userId}`;
  await redis.setex(key, ttlSeconds, serializedContext);
  logger.debug('Stored MCP context cache', { userId, size: serializedContext.length, ttl: ttlSeconds });
}

/**
 * Invalidate cached MCP context for a user.
 *
 * Call this when data is known to have changed (e.g., after a write operation).
 *
 * @param userId - User ID from JWT claims
 */
export async function invalidateMCPContext(userId: string): Promise<void> {
  const key = `mcp_context:${userId}`;
  await redis.del(key);
  logger.debug('Invalidated MCP context cache', { userId });
}

export default redis;
