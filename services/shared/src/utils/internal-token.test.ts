/**
 * Internal Token Utility Tests
 *
 * Tests for HMAC-based token generation and validation used for
 * MCP Gateway → MCP Server authentication.
 */

import {
  generateInternalToken,
  validateInternalToken,
  extractUserContext,
  DEFAULT_REPLAY_WINDOW_SECONDS,
} from './internal-token';

describe('generateInternalToken', () => {
  const secret = 'test-secret-key-12345';
  const userId = 'user-123';
  const roles = ['hr-read', 'hr-write'];

  it('generates a token with correct format', () => {
    const token = generateInternalToken(secret, userId, roles);

    // Token format: timestamp:userId:roles.hmac
    expect(token).toMatch(/^\d+:[^:]+:[^.]*\.[a-f0-9]{64}$/);
  });

  it('includes userId in the token payload', () => {
    const token = generateInternalToken(secret, userId, roles);
    const [payload] = token.split('.');

    expect(payload).toContain(userId);
  });

  it('includes roles in the token payload', () => {
    const token = generateInternalToken(secret, userId, roles);
    const [payload] = token.split('.');

    expect(payload).toContain('hr-read');
    expect(payload).toContain('hr-write');
  });

  it('generates different tokens for different users', () => {
    const token1 = generateInternalToken(secret, 'user-1', roles);
    const token2 = generateInternalToken(secret, 'user-2', roles);

    expect(token1).not.toBe(token2);
  });

  it('generates different signatures for different secrets', () => {
    const token1 = generateInternalToken('secret-1', userId, roles);
    const token2 = generateInternalToken('secret-2', userId, roles);

    const hmac1 = token1.split('.')[1];
    const hmac2 = token2.split('.')[1];

    expect(hmac1).not.toBe(hmac2);
  });

  it('throws error when secret is empty', () => {
    expect(() => generateInternalToken('', userId, roles)).toThrow(
      'MCP_INTERNAL_SECRET is required'
    );
  });

  it('throws error when userId is empty', () => {
    expect(() => generateInternalToken(secret, '', roles)).toThrow(
      'userId is required'
    );
  });

  it('handles empty roles array', () => {
    const token = generateInternalToken(secret, userId, []);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });
});

describe('validateInternalToken', () => {
  const secret = 'test-secret-key-12345';
  const userId = 'user-123';
  const roles = ['hr-read', 'hr-write'];

  it('validates a freshly generated token', () => {
    const token = generateInternalToken(secret, userId, roles);
    const result = validateInternalToken(secret, token);

    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload?.userId).toBe(userId);
    expect(result.payload?.roles).toEqual(roles);
  });

  it('rejects token with wrong secret', () => {
    const token = generateInternalToken(secret, userId, roles);
    const result = validateInternalToken('wrong-secret', token);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid token signature');
  });

  it('rejects token with tampered payload', () => {
    const token = generateInternalToken(secret, userId, roles);
    const [, hmac] = token.split('.');
    const tamperedToken = `9999999999:hacker:executive.${hmac}`;

    const result = validateInternalToken(secret, tamperedToken);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid token signature');
  });

  it('rejects token with invalid format', () => {
    const result = validateInternalToken(secret, 'not-a-valid-token');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid token format');
  });

  it('rejects empty token', () => {
    const result = validateInternalToken(secret, '');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Token is required');
  });

  it('rejects expired token', () => {
    // Create a token with a timestamp 60 seconds ago
    const oldTimestamp = Math.floor(Date.now() / 1000) - 60;
    const payload = `${oldTimestamp}:${userId}:${roles.join(',')}`;

    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const expiredToken = `${payload}.${hmac}`;

    const result = validateInternalToken(secret, expiredToken, 30);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Token expired');
  });

  it('accepts token within custom replay window', () => {
    // Create a token with a timestamp 45 seconds ago
    const oldTimestamp = Math.floor(Date.now() / 1000) - 45;
    const payload = `${oldTimestamp}:${userId}:${roles.join(',')}`;

    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const oldToken = `${payload}.${hmac}`;

    // Should be invalid with 30s window
    const result30 = validateInternalToken(secret, oldToken, 30);
    expect(result30.valid).toBe(false);

    // Should be valid with 60s window
    const result60 = validateInternalToken(secret, oldToken, 60);
    expect(result60.valid).toBe(true);
  });

  it('rejects token with future timestamp', () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
    const payload = `${futureTimestamp}:${userId}:${roles.join(',')}`;

    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const futureToken = `${payload}.${hmac}`;

    const result = validateInternalToken(secret, futureToken);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('future');
  });

  it('returns error when secret is not configured', () => {
    const token = generateInternalToken(secret, userId, roles);
    const result = validateInternalToken('', token);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('MCP_INTERNAL_SECRET is not configured');
  });

  it('handles empty roles in token', () => {
    const token = generateInternalToken(secret, userId, []);
    const result = validateInternalToken(secret, token);

    expect(result.valid).toBe(true);
    expect(result.payload?.roles).toEqual([]);
  });

  it('extracts timestamp from token', () => {
    const beforeTime = Math.floor(Date.now() / 1000);
    const token = generateInternalToken(secret, userId, roles);
    const afterTime = Math.floor(Date.now() / 1000);

    const result = validateInternalToken(secret, token);

    expect(result.payload?.timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(result.payload?.timestamp).toBeLessThanOrEqual(afterTime);
  });
});

describe('extractUserContext', () => {
  const secret = 'test-secret-key-12345';
  const userId = 'user-123';
  const roles = ['hr-read', 'hr-write'];

  it('extracts user context from valid token', () => {
    const token = generateInternalToken(secret, userId, roles);
    const context = extractUserContext(secret, token);

    expect(context).not.toBeNull();
    expect(context?.userId).toBe(userId);
    expect(context?.roles).toEqual(roles);
  });

  it('returns null for invalid token', () => {
    const context = extractUserContext(secret, 'invalid-token');

    expect(context).toBeNull();
  });

  it('returns null for token with wrong secret', () => {
    const token = generateInternalToken(secret, userId, roles);
    const context = extractUserContext('wrong-secret', token);

    expect(context).toBeNull();
  });
});

describe('DEFAULT_REPLAY_WINDOW_SECONDS', () => {
  it('is set to 30 seconds', () => {
    expect(DEFAULT_REPLAY_WINDOW_SECONDS).toBe(30);
  });
});
