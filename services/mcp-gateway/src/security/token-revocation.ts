/**
 * Token Revocation Service
 * 
 * Provides Redis-backed token revocation checking for immediate
 * invalidation of terminated employee access.
 * 
 * Security Review Finding: Section 3.3 - Token Lifecycle and Revocation
 */

import Redis from 'ioredis';
import { Request, Response, NextFunction } from 'express';

export interface TokenRevocationService {
  isRevoked(tokenJti: string): Promise<boolean>;
  revokeToken(tokenJti: string, expiresInSeconds: number): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;
  close(): Promise<void>;
}

export interface RevocationConfig {
  redisUrl: string;
  keyPrefix: string;
  defaultTtlSeconds: number;
}

const DEFAULT_CONFIG: RevocationConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6380',
  keyPrefix: 'tamshai:revoked:',
  defaultTtlSeconds: 3600, // 1 hour (longer than max token lifetime)
};

/**
 * Redis-backed token revocation service
 * 
 * When a user is disabled in Keycloak or logs out, their tokens
 * are added to this revocation list. The Kong gateway checks this
 * list on every request.
 */
export class RedisTokenRevocationService implements TokenRevocationService {
  private redis: Redis;
  private config: RevocationConfig;

  constructor(config: Partial<RevocationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis for token revocation');
    });
  }

  /**
   * Check if a token has been revoked
   * @param tokenJti - The JWT ID (jti) claim from the token
   * @returns true if the token has been revoked
   */
  async isRevoked(tokenJti: string): Promise<boolean> {
    try {
      const key = `${this.config.keyPrefix}token:${tokenJti}`;
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Error checking token revocation:', error);
      // Fail secure: if we can't check, assume revoked
      return true;
    }
  }

  /**
   * Revoke a specific token
   * @param tokenJti - The JWT ID (jti) claim from the token
   * @param expiresInSeconds - How long to keep the revocation record
   */
  async revokeToken(tokenJti: string, expiresInSeconds?: number): Promise<void> {
    try {
      const key = `${this.config.keyPrefix}token:${tokenJti}`;
      const ttl = expiresInSeconds || this.config.defaultTtlSeconds;
      await this.redis.setex(key, ttl, Date.now().toString());
      console.log(`Token ${tokenJti} revoked for ${ttl} seconds`);
    } catch (error) {
      console.error('Error revoking token:', error);
      throw error;
    }
  }

  /**
   * Revoke all tokens for a user (e.g., on account disable)
   * @param userId - The user's Keycloak subject ID
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      const key = `${this.config.keyPrefix}user:${userId}`;
      // Store revocation timestamp - tokens issued before this are invalid
      await this.redis.setex(key, this.config.defaultTtlSeconds, Date.now().toString());
      console.log(`All tokens for user ${userId} revoked`);
    } catch (error) {
      console.error('Error revoking user tokens:', error);
      throw error;
    }
  }

  /**
   * Check if all tokens for a user have been revoked
   * @param userId - The user's Keycloak subject ID
   * @param tokenIssuedAt - When the token was issued (iat claim)
   * @returns true if the token was issued before the revocation
   */
  async isUserRevoked(userId: string, tokenIssuedAt: number): Promise<boolean> {
    try {
      const key = `${this.config.keyPrefix}user:${userId}`;
      const revocationTime = await this.redis.get(key);
      
      if (!revocationTime) {
        return false;
      }

      // Token is revoked if it was issued before the revocation time
      const revocationTimestamp = parseInt(revocationTime, 10);
      return tokenIssuedAt * 1000 < revocationTimestamp;
    } catch (error) {
      console.error('Error checking user revocation:', error);
      // Fail secure
      return true;
    }
  }

  /**
   * Combined check for token and user revocation
   */
  async isTokenValid(tokenJti: string, userId: string, tokenIssuedAt: number): Promise<boolean> {
    const [tokenRevoked, userRevoked] = await Promise.all([
      this.isRevoked(tokenJti),
      this.isUserRevoked(userId, tokenIssuedAt),
    ]);

    return !tokenRevoked && !userRevoked;
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Singleton instance
let revocationService: TokenRevocationService | null = null;

export function getRevocationService(): TokenRevocationService {
  if (!revocationService) {
    revocationService = new RedisTokenRevocationService();
  }
  return revocationService;
}

/**
 * Middleware function for Express/Koa to check token revocation
 */
export function createRevocationMiddleware() {
  const service = getRevocationService();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract JWT claims (assumes previous JWT validation middleware)
      const jwtPayload = (req as Request & { user?: { jti?: string; sub?: string; iat?: number }; auth?: { jti?: string; sub?: string; iat?: number } }).user || (req as Request & { auth?: { jti?: string; sub?: string; iat?: number } }).auth;
      
      if (!jwtPayload) {
        return res.status(401).json({ error: 'No authentication token' });
      }

      const { jti, sub, iat } = jwtPayload;

      if (!jti || !sub || !iat) {
        return res.status(401).json({ error: 'Invalid token claims' });
      }

      // Check revocation
      const isValid = await (service as RedisTokenRevocationService).isTokenValid(jti, sub, iat);
      
      if (!isValid) {
        console.log(`Revoked token used: jti=${jti}, user=${sub}`);
        return res.status(401).json({ 
          error: 'Token has been revoked',
          code: 'TOKEN_REVOKED'
        });
      }

      next();
    } catch (error) {
      console.error('Revocation check error:', error);
      // Fail secure
      return res.status(401).json({ error: 'Authentication error' });
    }
  };
}

// =============================================================================
// Keycloak Event Listener Integration
// =============================================================================

/**
 * Handle Keycloak admin events (user disable, logout, etc.)
 * This would be called by a Keycloak event listener SPI or webhook
 */
export async function handleKeycloakEvent(event: {
  type: string;
  userId?: string;
  sessionId?: string;
  tokenId?: string;
}): Promise<void> {
  const service = getRevocationService();

  switch (event.type) {
    case 'USER_DISABLED':
    case 'USER_DELETED':
      if (event.userId) {
        await service.revokeAllUserTokens(event.userId);
        console.log(`User ${event.userId} disabled/deleted - all tokens revoked`);
      }
      break;

    case 'LOGOUT':
    case 'LOGOUT_ALL':
      if (event.userId) {
        await service.revokeAllUserTokens(event.userId);
        console.log(`User ${event.userId} logged out - all tokens revoked`);
      }
      break;

    case 'TOKEN_REVOKED':
      if (event.tokenId) {
        await service.revokeToken(event.tokenId, 3600);
        console.log(`Token ${event.tokenId} explicitly revoked`);
      }
      break;

    default:
      console.log(`Unhandled Keycloak event type: ${event.type}`);
  }
}
