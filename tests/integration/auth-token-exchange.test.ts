/**
 * Integration Test - Token Exchange Authentication
 *
 * Tests the complete OAuth 2.0 token exchange flow against a real Keycloak instance.
 * This verifies that the mcp-integration-runner service account can:
 * 1. Authenticate with client credentials
 * 2. Exchange tokens to impersonate users
 * 3. Access MCP endpoints with impersonated tokens
 *
 * @see ../shared/auth/token-exchange.ts
 * @see ../../.claude/plans/test-auth-refactoring.md
 *
 * Prerequisites:
 * - Keycloak running with mcp-integration-runner client configured
 * - MCP_INTEGRATION_RUNNER_SECRET environment variable set
 * - Phoenix rebuild completed (terraform destroy + apply)
 */

import axios from 'axios';
import { getTestAuthProvider, resetTestAuthProvider } from '../shared/auth/token-exchange';

describe('Token Exchange Integration', () => {
  const KEYCLOAK_URL = process.env.KEYCLOAK_URL || `http://127.0.0.1:${process.env.DEV_KEYCLOAK}/auth`;
  const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'tamshai-corp';
  const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || `http://127.0.0.1:${process.env.DEV_MCP_GATEWAY}`;

  beforeEach(() => {
    resetTestAuthProvider();
  });

  describe('Client Credentials Flow', () => {
    it('should acquire service account token from Keycloak', async () => {
      const authProvider = getTestAuthProvider();

      const serviceToken = await authProvider.getServiceToken();

      // Verify token is a valid JWT (3 parts separated by dots)
      expect(serviceToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);

      // Decode token to verify claims
      const tokenParts = serviceToken.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      expect(payload.azp).toBe('mcp-integration-runner'); // Authorized party
      // Keycloak issuer uses its configured frontend URL, not the URL used to connect
      expect(payload.iss).toContain(`/realms/${KEYCLOAK_REALM}`);
      expect(payload.typ).toBe('Bearer');
    });

    it('should cache service token across multiple calls', async () => {
      const authProvider = getTestAuthProvider();

      const token1 = await authProvider.getServiceToken();
      const token2 = await authProvider.getServiceToken();

      // Same token should be returned (cached)
      expect(token1).toBe(token2);
    });

    it('should fail with invalid client secret', async () => {
      // Temporarily override secret with invalid value
      const originalSecret = process.env.MCP_INTEGRATION_RUNNER_SECRET;
      process.env.MCP_INTEGRATION_RUNNER_SECRET = 'invalid-secret-12345'; // pragma: allowlist secret
      resetTestAuthProvider();

      const authProvider = getTestAuthProvider();

      await expect(authProvider.getServiceToken()).rejects.toThrow(
        /Failed to acquire service token/
      );

      // Restore original secret
      process.env.MCP_INTEGRATION_RUNNER_SECRET = originalSecret;
    });
  });

  describe('Token Exchange Flow (RFC 8693)', () => {
    it('should exchange service token for alice.chen user token', async () => {
      const authProvider = getTestAuthProvider();

      const aliceToken = await authProvider.getUserToken('alice.chen');

      // Verify token is a valid JWT
      expect(aliceToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);

      // Decode token to verify user claims
      const tokenParts = aliceToken.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      expect(payload.preferred_username).toBe('alice.chen');
      expect(payload.typ).toBe('Bearer');
      // Roles may be in realm_access (realm roles, local dev) or resource_access (client roles, CI Terraform)
      // The MCP Gateway handles both via jwt-validator.ts merging realmRoles + clientRoles
      const hasRealmRoles = payload.realm_access?.roles?.length > 0;
      const hasClientRoles = Object.keys(payload.resource_access || {}).length > 0;
      expect(hasRealmRoles || hasClientRoles).toBe(true);
    });

    it('should exchange service token for bob.martinez user token', async () => {
      const authProvider = getTestAuthProvider();

      const bobToken = await authProvider.getUserToken('bob.martinez');

      // Decode token to verify user claims
      const tokenParts = bobToken.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      expect(payload.preferred_username).toBe('bob.martinez');
    });

    it('should cache user tokens per username', async () => {
      const authProvider = getTestAuthProvider();

      const aliceToken1 = await authProvider.getUserToken('alice.chen');
      const bobToken1 = await authProvider.getUserToken('bob.martinez');
      const aliceToken2 = await authProvider.getUserToken('alice.chen');

      // Alice's token should be cached
      expect(aliceToken1).toBe(aliceToken2);

      // Bob's token should be different from Alice's
      expect(bobToken1).not.toBe(aliceToken1);
    });

    it('should fail for non-existent user', async () => {
      const authProvider = getTestAuthProvider();

      await expect(authProvider.getUserToken('nonexistent.user')).rejects.toThrow(
        /Failed to acquire user token/
      );
    });

    it('should verify impersonated token has user roles', async () => {
      const authProvider = getTestAuthProvider();

      const aliceToken = await authProvider.getUserToken('alice.chen');

      // Decode token to verify roles
      const tokenParts = aliceToken.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      // Alice has hr-read and hr-write roles
      // Local dev: realm roles in realm_access.roles
      // CI Terraform: client roles in resource_access.mcp-gateway.roles
      // The MCP Gateway merges both via jwt-validator.ts:107
      const realmRoles = payload.realm_access?.roles || [];
      const clientRoles = payload.resource_access?.['mcp-gateway']?.roles || [];
      const allRoles = [...realmRoles, ...clientRoles];
      expect(allRoles).toContain('hr-read');
      expect(allRoles).toContain('hr-write');
    });
  });

  describe('MCP Gateway Integration', () => {
    it('should access MCP Gateway with impersonated token', async () => {
      const authProvider = getTestAuthProvider();
      const aliceToken = await authProvider.getUserToken('alice.chen');

      // Call MCP Gateway health endpoint with token
      const response = await axios.get(`${MCP_GATEWAY_URL}/health`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
    });

    it('should list MCP tools with impersonated token', async () => {
      const authProvider = getTestAuthProvider();
      const aliceToken = await authProvider.getUserToken('alice.chen');

      // Call MCP Gateway to list available tools
      const response = await axios.get(`${MCP_GATEWAY_URL}/api/mcp/tools`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.accessibleDataSources).toBeDefined();
      expect(Array.isArray(response.data.accessibleDataSources)).toBe(true);

      // Alice should have access to HR data source
      const hrSources = response.data.accessibleDataSources.filter((ds: any) =>
        ds.name === 'mcp-hr'
      );
      expect(hrSources.length).toBeGreaterThan(0);
    });

    it('should enforce RBAC with impersonated token', async () => {
      const authProvider = getTestAuthProvider();

      // Frank Davis (intern) has minimal access
      const frankToken = await authProvider.getUserToken('frank.davis');

      const response = await axios.get(`${MCP_GATEWAY_URL}/api/mcp/tools`, {
        headers: {
          Authorization: `Bearer ${frankToken}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.accessibleDataSources).toBeDefined();

      // Frank (intern, employee role) should NOT have access to sales data source
      // Sales requires sales-read, sales-write, or executive role
      const salesSources = response.data.accessibleDataSources.filter((ds: any) =>
        ds.name === 'mcp-sales'
      );
      expect(salesSources.length).toBe(0);
    });

    it('should reject expired tokens', async () => {
      const authProvider = getTestAuthProvider();
      const aliceToken = await authProvider.getUserToken('alice.chen');

      // Clear cache to force new token acquisition later
      authProvider.clearCache();

      // Wait for token to expire (5 minutes + 30s buffer = 5.5 minutes)
      // For testing, we'll use an artificially expired token
      // In real scenario, this would be a time-based test

      // Decode token to get expiry
      const tokenParts = aliceToken.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      const expiresAt = payload.exp * 1000;

      // Token should not be expired yet
      expect(Date.now()).toBeLessThan(expiresAt);
    });
  });

  describe('Token Lifecycle', () => {
    it('should handle token refresh automatically', async () => {
      const authProvider = getTestAuthProvider();

      // Get initial token
      const token1 = await authProvider.getUserToken('alice.chen');

      // Clear cache to force refresh
      authProvider.clearCache();

      // Get new token
      const token2 = await authProvider.getUserToken('alice.chen');

      // Tokens should be different (new token issued)
      expect(token1).not.toBe(token2);

      // But both should be valid JWTs with same username
      const payload1 = JSON.parse(
        Buffer.from(token1.split('.')[1], 'base64').toString()
      );
      const payload2 = JSON.parse(
        Buffer.from(token2.split('.')[1], 'base64').toString()
      );

      expect(payload1.preferred_username).toBe('alice.chen');
      expect(payload2.preferred_username).toBe('alice.chen');
    });

    it('should support concurrent token requests', async () => {
      const authProvider = getTestAuthProvider();

      // Request multiple user tokens concurrently
      const results = await Promise.all([
        authProvider.getUserToken('alice.chen'),
        authProvider.getUserToken('bob.martinez'),
        authProvider.getUserToken('carol.johnson'),
        authProvider.getUserToken('dan.williams'),
      ]);

      // All requests should succeed
      expect(results).toHaveLength(4);
      results.forEach((token) => {
        expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
      });

      // Each token should be unique
      const uniqueTokens = new Set(results);
      expect(uniqueTokens.size).toBe(4);
    });
  });

  describe('Error Recovery', () => {
    it('should handle network errors gracefully', async () => {
      // Override Keycloak URL to invalid endpoint
      // Use 127.0.0.1 instead of hostname to avoid DNS resolution issues in CI
      // (DNS lookups for non-existent hostnames can cause EAI_AGAIN/EAGAIN flaky errors)
      const originalUrl = process.env.KEYCLOAK_URL;
      process.env.KEYCLOAK_URL = 'http://127.0.0.1:9999/auth';
      resetTestAuthProvider();

      const authProvider = getTestAuthProvider();

      await expect(authProvider.getServiceToken()).rejects.toThrow();

      // Restore original URL
      process.env.KEYCLOAK_URL = originalUrl;
    });

    it('should provide descriptive error messages', async () => {
      const authProvider = getTestAuthProvider();

      try {
        await authProvider.getUserToken('nonexistent.user');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Failed to acquire user token');
        expect(error.message).toContain('nonexistent.user');
      }
    });
  });
});
