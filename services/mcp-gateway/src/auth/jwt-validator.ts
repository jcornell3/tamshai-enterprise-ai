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
    // Split Horizon DNS Fix:
    // When running integration tests, Keycloak is accessed via 'localhost:8180' from the test runner,
    // generating tokens with iss="http://localhost:8180...".
    // However, the Gateway inside Docker sees Keycloak as "http://keycloak:8080...".
    // We must accept multiple issuers to allow integration tests to pass.
    const validIssuers = [this.config.issuer];

    // If the configured issuer is the internal Docker DNS, allow the external localhost equivalent
    if (this.config.issuer && this.config.issuer.includes('keycloak:8080')) {
      const localhostIssuer = this.config.issuer.replace('keycloak:8080', 'localhost:8180');
      validIssuers.push(localhostIssuer);
      this.logger.debug(`Adding alternate issuer for testing: ${localhostIssuer}`);
    }

    // Also handle HTTPS Caddy proxy URLs
    if (this.config.issuer && this.config.issuer.includes('www.tamshai.local')) {
      const httpIssuer = this.config.issuer.replace('https://', 'http://').replace(':443', ':8180');
      if (!validIssuers.includes(httpIssuer)) {
        validIssuers.push(httpIssuer);
        this.logger.debug(`Adding alternate HTTP issuer for testing: ${httpIssuer}`);
      }
    }

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
          // Don't validate issuer here - we'll do it manually below to support multiple issuers
          audience: [this.config.clientId, 'account', 'mcp-integration-runner'],
        },
        (err: Error | null, decoded: unknown) => {
          if (err) {
            // Enhanced debugging for 401 investigation
            // Log specific validation failure reason without leaking token data
            this.logger.error(`JWT Verification Failed: ${err.message}`, {
              errorName: err.name,
              expectedAudiences: [this.config.clientId, 'account', 'mcp-integration-runner'],
            });
            reject(new Error('Invalid or expired token'));
            return;
          }

          // Manual issuer validation to support multiple valid issuers (Split Horizon DNS fix)
          const payload = decoded as jwt.JwtPayload;
          const tokenIssuer = payload.iss;

          if (!tokenIssuer || !validIssuers.includes(tokenIssuer)) {
            this.logger.error('JWT issuer validation failed', {
              tokenIssuer,
              validIssuers,
            });
            reject(new Error('Invalid token issuer'));
            return;
          }

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
