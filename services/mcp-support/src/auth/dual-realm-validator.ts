/**
 * Dual-Realm JWT Validator for MCP Support
 *
 * Validates tokens from both internal (tamshai) and customer (tamshai-customers) realms.
 * This enables the MCP Support service to serve both internal support agents and
 * external customers through a unified API.
 *
 * Architecture: v1.4 with dual-realm authentication
 */

import jwt from 'jsonwebtoken';
import jwksClient, { JwksClient, SigningKey } from 'jwks-rsa';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * Realm type discriminator
 */
export type RealmType = 'internal' | 'customer';

/**
 * Extended user context with realm information
 */
export interface DualRealmUserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  realm: RealmType;
  // Customer-specific fields
  organizationId?: string;
  organizationName?: string;
}

/**
 * Decoded JWT payload structure
 */
interface JWTPayload {
  sub: string;
  preferred_username: string;
  email?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
  // Customer realm custom claims
  organization_id?: string;
  organization_name?: string;
  iss: string;
  exp: number;
  iat: number;
}

// Environment-based Keycloak URLs (required)
const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const INTERNAL_REALM = process.env.KEYCLOAK_INTERNAL_REALM || 'tamshai';
const CUSTOMER_REALM = process.env.KEYCLOAK_CUSTOMER_REALM || 'tamshai-customers';

// JWKS clients for each realm (singleton pattern)
let internalJwksClient: JwksClient | null = null;
let customerJwksClient: JwksClient | null = null;

/**
 * Get JWKS client for internal realm
 */
function getInternalJwksClient(): JwksClient {
  if (!internalJwksClient) {
    internalJwksClient = jwksClient({
      jwksUri: `${KEYCLOAK_URL}/realms/${INTERNAL_REALM}/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
    });
  }
  return internalJwksClient;
}

/**
 * Get JWKS client for customer realm
 */
function getCustomerJwksClient(): JwksClient {
  if (!customerJwksClient) {
    customerJwksClient = jwksClient({
      jwksUri: `${KEYCLOAK_URL}/realms/${CUSTOMER_REALM}/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
    });
  }
  return customerJwksClient;
}

/**
 * Get signing key from JWKS client
 */
async function getSigningKey(client: JwksClient, kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err: Error | null, key?: SigningKey) => {
      if (err) {
        reject(err);
        return;
      }
      if (!key) {
        reject(new Error('No signing key found'));
        return;
      }
      const signingKey = key.getPublicKey();
      resolve(signingKey);
    });
  });
}

/**
 * Determine realm from JWT issuer claim
 *
 * Note: Customer realm check comes first because 'tamshai' is a substring
 * of 'tamshai-customers', so we need to check the more specific one first.
 */
function getRealmFromIssuer(issuer: string): RealmType | null {
  // Check customer realm first (more specific - avoids substring match issue)
  if (issuer.includes(`/realms/${CUSTOMER_REALM}`)) {
    return 'customer';
  }
  if (issuer.includes(`/realms/${INTERNAL_REALM}`)) {
    return 'internal';
  }
  return null;
}

/**
 * Extract roles from JWT payload
 * - Internal realm: Uses resource_access and realm_access
 * - Customer realm: Uses realm_access only
 */
function extractRoles(payload: JWTPayload, realm: RealmType): string[] {
  const roles: Set<string> = new Set();

  // Realm-level roles
  if (payload.realm_access?.roles) {
    payload.realm_access.roles.forEach(role => roles.add(role));
  }

  // Resource-level roles (internal realm typically uses mcp-gateway client)
  if (realm === 'internal' && payload.resource_access) {
    const mcpGatewayRoles = payload.resource_access['mcp-gateway']?.roles || [];
    mcpGatewayRoles.forEach(role => roles.add(role));
  }

  return Array.from(roles);
}

/**
 * Validate JWT token from either realm
 *
 * @param token - JWT token string (without 'Bearer ' prefix)
 * @returns DualRealmUserContext with realm type
 * @throws Error if token is invalid or from unknown realm
 */
export async function validateDualRealmToken(token: string): Promise<DualRealmUserContext> {
  // Decode token header to get kid (key ID) and decode payload for issuer
  const decoded = jwt.decode(token, { complete: true });

  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('Invalid token format: missing key ID');
  }

  const payload = decoded.payload as JWTPayload;

  if (!payload.iss) {
    throw new Error('Invalid token: missing issuer claim');
  }

  // Determine realm from issuer
  const realm = getRealmFromIssuer(payload.iss);

  if (!realm) {
    throw new Error(`Invalid token: unknown issuer ${payload.iss}`);
  }

  // Get appropriate JWKS client
  const jwks = realm === 'internal' ? getInternalJwksClient() : getCustomerJwksClient();

  // Get signing key and verify token
  const signingKey = await getSigningKey(jwks, decoded.header.kid);

  // Verify token signature and expiration
  jwt.verify(token, signingKey, {
    algorithms: ['RS256'],
    issuer: payload.iss,
  });

  // Extract roles
  const roles = extractRoles(payload, realm);

  // Build user context
  const userContext: DualRealmUserContext = {
    userId: payload.sub,
    username: payload.preferred_username,
    email: payload.email,
    roles,
    realm,
  };

  // Add customer-specific fields
  if (realm === 'customer') {
    userContext.organizationId = payload.organization_id;
    userContext.organizationName = payload.organization_name;
  }

  logger.debug('Token validated', {
    userId: userContext.userId,
    realm: userContext.realm,
    roles: userContext.roles,
    organizationId: userContext.organizationId,
  });

  return userContext;
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Check if user context is from customer realm
 */
export function isCustomerRealm(userContext: DualRealmUserContext): boolean {
  return userContext.realm === 'customer';
}

/**
 * Check if user context is from internal realm
 */
export function isInternalRealm(userContext: DualRealmUserContext): boolean {
  return userContext.realm === 'internal';
}

export default {
  validateDualRealmToken,
  extractBearerToken,
  isCustomerRealm,
  isInternalRealm,
};
