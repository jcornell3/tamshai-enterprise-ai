/**
 * Query Result Caching (v1.5 Performance Optimization)
 *
 * Provides Redis-based caching for list queries to reduce database calls by ~50%.
 * Uses key patterns for efficient cache invalidation on write operations.
 *
 * Cache Key Patterns:
 * - employees:{department}:{location}:{cursor} - HR employee lists
 * - invoices:{status}:{date_range}:{cursor} - Finance invoice lists
 * - tickets:{status}:{priority}:{cursor} - Support ticket lists
 * - leads:{stage}:{owner}:{cursor} - Sales lead lists
 */

import Redis from 'ioredis';

export interface QueryCacheConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  defaultTTL?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * Query Cache Manager
 *
 * Provides caching for database query results with automatic TTL expiration
 * and pattern-based cache invalidation.
 */
export class QueryCache {
  private redis: Redis;
  private keyPrefix: string;
  private defaultTTL: number;
  private stats: { hits: number; misses: number };

  constructor(config: QueryCacheConfig = {}) {
    this.redis = new Redis({
      host: config.host || process.env.REDIS_HOST,
      port: config.port || parseInt(process.env.REDIS_PORT!, 10),
      password: config.password || process.env.REDIS_PASSWORD,
      db: config.db || parseInt(process.env.REDIS_CACHE_DB || '1'), // Use DB 1 for cache (DB 0 for confirmations)
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.keyPrefix = config.keyPrefix || 'cache:';
    this.defaultTTL = config.defaultTTL || 60; // 60 seconds default
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get or compute a cached value
   *
   * @param key - Cache key (will be prefixed automatically)
   * @param queryFn - Function to execute if cache miss
   * @param ttlSeconds - Optional TTL override
   * @returns Cached or computed result
   */
  async cachedQuery<T>(
    key: string,
    queryFn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const fullKey = `${this.keyPrefix}${key}`;
    const ttl = ttlSeconds ?? this.defaultTTL;

    // Try cache first
    const cached = await this.redis.get(fullKey);
    if (cached) {
      this.stats.hits++;
      return JSON.parse(cached) as T;
    }

    // Cache miss - execute query
    this.stats.misses++;
    const result = await queryFn();

    // Store in cache (don't await - fire and forget for performance)
    this.redis.setex(fullKey, ttl, JSON.stringify(result)).catch(() => {
      // Silently ignore cache write failures
    });

    return result;
  }

  /**
   * Invalidate a specific cache key
   *
   * @param key - Cache key to invalidate
   */
  async invalidate(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}${key}`;
    await this.redis.del(fullKey);
  }

  /**
   * Invalidate all cache keys matching a pattern
   *
   * @param pattern - Pattern to match (e.g., "employees:*" for all employee caches)
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const fullPattern = `${this.keyPrefix}${pattern}`;
    const keys = await this.redis.keys(fullPattern);

    if (keys.length === 0) {
      return 0;
    }

    // Remove prefix for deletion
    await this.redis.del(...keys);
    return keys.length;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Check if Redis is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Generate a cache key from query parameters
 *
 * @param domain - Domain name (e.g., 'employees', 'invoices')
 * @param params - Query parameters object
 * @returns Normalized cache key
 */
export function generateCacheKey(
  domain: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  // Sort keys for consistent key generation
  const sortedParams = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined)
    .map((k) => `${k}:${params[k]}`)
    .join(':');

  return `${domain}:${sortedParams || 'default'}`;
}

// Singleton instance for shared use
let defaultInstance: QueryCache | null = null;

/**
 * Get the default QueryCache instance
 */
export function getQueryCache(): QueryCache {
  if (!defaultInstance) {
    defaultInstance = new QueryCache();
  }
  return defaultInstance;
}

/**
 * Create a new QueryCache instance with custom config
 */
export function createQueryCache(config: QueryCacheConfig): QueryCache {
  return new QueryCache(config);
}
