/**
 * JWT Validator Service
 *
 * Handles JWT token validation with Keycloak JWKS
 * Extracted from index.ts for testability and separation of concerns
 */

import jwt from 'jsonwebtoken';
import jwksRsa, { JwksClient } from 'jwks-rsa';
import { Logger } from 'winston';
import { UserContext } from '../test-utils/mock-user-context';

export interface JWTValidatorConfig {
  jwksUri: string;
  issuer: string;
  clientId: string;
  algorithms?: jwt.Algorithm[];
}

/**
 * JWT Validator Service
 *
 * Validates JWT tokens from Keycloak using JWKS
 * Extracts user context (userId, username, email, roles, groups)
 */
export class JWTValidator {
  private jwksClient: JwksClient;
  private config: JWTValidatorConfig;
  private logger: Logger;

  /**
   * @param config - JWT validation configuration
   * @param logger - Winston logger instance
   * @param jwksClient - Optional JWKS client for testing (injectable for DI)
   */
  constructor(config: JWTValidatorConfig, logger: Logger, jwksClient?: JwksClient) {
    this.config = {
      ...config,
      algorithms: config.algorithms || ['RS256'],
    };
    this.logger = logger;

    // Use provided client or create default (ADDENDUM #5: DI for testability)
    this.jwksClient = jwksClient || jwksRsa({
      jwksUri: config.jwksUri,
      cache: true,
      rateLimit: true,
    });
  }

  /**
   * Get signing key from JWKS endpoint
   */
  private getSigningKey(header: jwt.JwtHeader): Promise<string> {
    return new Promise((resolve, reject) => {
      this.jwksClient.getSigningKey(header.kid, (err, key) => {
        if (err) {
          reject(err);
          return;
        }
        const signingKey = key?.getPublicKey();
        if (!signingKey) {
          reject(new Error('No signing key found'));
          return;
        }
        resolve(signingKey);
      });
    });
  }

  /**
   * Validate JWT token and extract user context
   *
   * @param token - JWT token string (without "Bearer " prefix)
   * @returns UserContext with userId, username, email, roles, groups
   * @throws Error if token is invalid, expired, or has invalid signature
   */
  async validateToken(token: string): Promise<UserContext> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          this.getSigningKey(header)
            .then(key => callback(null, key))
            .catch(err => callback(err));
        },
        {
          algorithms: this.config.algorithms,
          issuer: this.config.issuer,
          audience: [this.config.clientId, 'account'],
        },
        (err, decoded) => {
          if (err) {
            reject(err);
            return;
          }

          const payload = decoded as jwt.JwtPayload;

          // Extract roles from Keycloak token structure
          // Support both realm roles (legacy/global) and client roles (best practice)
          const realmRoles = payload.realm_access?.roles || [];
          const clientRoles = payload.resource_access?.[this.config.clientId]?.roles || [];
          const groups = payload.groups || [];

          // Merge and deduplicate roles from both sources
          const allRoles = Array.from(new Set([...realmRoles, ...clientRoles]));

          // Log available claims for debugging
          this.logger.debug('JWT claims:', {
            sub: payload.sub,
            preferred_username: payload.preferred_username,
            email: payload.email,
            name: payload.name,
            given_name: payload.given_name,
            family_name: payload.family_name,
            azp: payload.azp,
            realm_access: payload.realm_access,
            resource_access: payload.resource_access,
            realmRoles,
            clientRoles,
            mergedRoles: allRoles,
          });

          // Keycloak may not include preferred_username in access token
          // Try multiple claim sources for username
          const username = payload.preferred_username ||
                          payload.name ||
                          payload.given_name ||
                          (payload.sub ? `user-${payload.sub.substring(0, 8)}` : 'unknown');

          // GAP-005: Warn when critical claims are missing (Keycloak protocol mapper misconfiguration)
          if (!payload.preferred_username) {
            this.logger.warn('JWT missing preferred_username claim - Keycloak protocol mapper may be misconfigured', {
              hasSub: !!payload.sub,
              hasName: !!payload.name,
              hasGivenName: !!payload.given_name,
              usedFallback: username,
            });
          }
          if (!payload.email) {
            this.logger.warn('JWT missing email claim - user identity queries may fail', {
              userId: payload.sub,
              username,
            });
          }

          resolve({
            userId: payload.sub || '',
            username: username,
            email: payload.email || '',
            roles: allRoles,
            groups: groups,
          });
        }
      );
    });
  }
}
