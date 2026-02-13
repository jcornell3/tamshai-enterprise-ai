/**
 * Internal Token Utilities for MCP Gateway → MCP Server Authentication
 *
 * Implements HMAC-SHA256 based token generation and validation to ensure
 * that MCP servers only accept requests from the authenticated MCP Gateway.
 *
 * Security Model:
 * - MCP Gateway generates a signed token containing timestamp, userId, and roles
 * - Token format: `timestamp:userId:roles.hmac`
 * - MCP servers validate the HMAC signature using a shared secret
 * - 30-second replay window prevents token reuse attacks
 *
 * This prevents the critical authentication bypass vector where an attacker
 * could directly call MCP servers with fabricated X-User-ID headers.
 */

import crypto from 'crypto';

/**
 * Token payload structure
 */
export interface TokenPayload {
  timestamp: number;
  userId: string;
  roles: string[];
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
}

/**
 * Default replay window in seconds (30 seconds)
 */
export const DEFAULT_REPLAY_WINDOW_SECONDS = 30;

/**
 * Generate an internal authentication token for MCP Gateway → MCP Server communication
 *
 * The token contains:
 * - Timestamp (Unix epoch in seconds)
 * - User ID from the authenticated JWT
 * - Comma-separated list of roles
 *
 * The token is signed with HMAC-SHA256 using the shared secret.
 *
 * @param secret - Shared secret between Gateway and MCP servers
 * @param userId - User ID from the authenticated JWT
 * @param roles - Array of roles from the authenticated JWT
 * @returns Signed token in format: `timestamp:userId:roles.hmac`
 */
export function generateInternalToken(
  secret: string,
  userId: string,
  roles: string[]
): string {
  if (!secret) {
    throw new Error('MCP_INTERNAL_SECRET is required for token generation');
  }

  if (!userId) {
    throw new Error('userId is required for token generation');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const rolesString = roles.join(',');
  const payload = `${timestamp}:${userId}:${rolesString}`;

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return `${payload}.${hmac}`;
}

/**
 * Validate an internal authentication token
 *
 * Checks:
 * 1. Token format is valid (payload.hmac)
 * 2. HMAC signature matches
 * 3. Timestamp is within the replay window
 *
 * @param secret - Shared secret between Gateway and MCP servers
 * @param token - Token to validate
 * @param replayWindowSeconds - Maximum age of token in seconds (default: 30)
 * @returns Validation result with payload if valid
 */
export function validateInternalToken(
  secret: string,
  token: string,
  replayWindowSeconds: number = DEFAULT_REPLAY_WINDOW_SECONDS
): TokenValidationResult {
  if (!secret) {
    return { valid: false, error: 'MCP_INTERNAL_SECRET is not configured' };
  }

  if (!token) {
    return { valid: false, error: 'Token is required' };
  }

  // Split token into payload and signature
  const lastDotIndex = token.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return { valid: false, error: 'Invalid token format' };
  }

  const payload = token.substring(0, lastDotIndex);
  const receivedHmac = token.substring(lastDotIndex + 1);

  // Validate HMAC signature
  const expectedHmac = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(expectedHmac))) {
    return { valid: false, error: 'Invalid token signature' };
  }

  // Parse payload
  const parts = payload.split(':');
  if (parts.length < 2) {
    return { valid: false, error: 'Invalid token payload format' };
  }

  const timestamp = parseInt(parts[0], 10);
  const userId = parts[1];
  const rolesString = parts.slice(2).join(':'); // Rejoin in case roles had colons
  const roles = rolesString ? rolesString.split(',') : [];

  if (isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp in token' };
  }

  // Check replay window
  const now = Math.floor(Date.now() / 1000);
  const tokenAge = now - timestamp;

  if (tokenAge < 0) {
    return { valid: false, error: 'Token timestamp is in the future' };
  }

  if (tokenAge > replayWindowSeconds) {
    return { valid: false, error: `Token expired (${tokenAge}s old, max ${replayWindowSeconds}s)` };
  }

  return {
    valid: true,
    payload: {
      timestamp,
      userId,
      roles,
    },
  };
}

/**
 * Extract user context from a validated token
 *
 * Convenience function that validates the token and returns the user context
 * in the format expected by MCP server handlers.
 *
 * @param secret - Shared secret
 * @param token - Token to validate
 * @returns User context if valid, null otherwise
 */
export function extractUserContext(
  secret: string,
  token: string
): { userId: string; roles: string[] } | null {
  const result = validateInternalToken(secret, token);

  if (!result.valid || !result.payload) {
    return null;
  }

  return {
    userId: result.payload.userId,
    roles: result.payload.roles,
  };
}
