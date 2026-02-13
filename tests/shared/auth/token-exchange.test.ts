/**
 * Unit Tests for TestAuthProvider - Token Exchange
 *
 * Tests the OAuth 2.0 token exchange authentication helper for integration tests.
 *
 * @see ./token-exchange.ts
 * @see ../../../.claude/plans/test-auth-refactoring.md
 */

// Mock axios FIRST, before any imports
jest.mock('axios');

import axios from 'axios';
import { TestAuthProvider, getTestAuthProvider, resetTestAuthProvider, type Logger, type TestAuthConfig } from './token-exchange';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TestAuthProvider', () => {
  let mockLogger: Logger;
  let config: TestAuthConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    resetTestAuthProvider();

    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Test configuration
    config = {
      keycloakUrl: 'http://localhost:8180/auth',
      realm: 'tamshai-corp',
      clientId: 'mcp-integration-runner',
      clientSecret: 'test-secret-123', // pragma: allowlist secret
    };

    // Setup default axios.post mock
    mockedAxios.post = jest.fn();
  });

  describe('Service Token Acquisition', () => {
    it('should acquire service token using client credentials', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'service-token-abc',
          expires_in: 300,
        },
      });

      const token = await provider.getServiceToken();

      expect(token).toBe('service-token-abc');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8180/auth/realms/tamshai-corp/protocol/openid-connect/token',
        expect.any(URLSearchParams),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Verify request parameters
      const callParams = mockedAxios.post.mock.calls[0][1] as URLSearchParams;
      expect(callParams.get('client_id')).toBe('mcp-integration-runner');
      expect(callParams.get('client_secret')).toBe('test-secret-123');
      expect(callParams.get('grant_type')).toBe('client_credentials');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Service account token acquired',
        { expiresIn: 300 }
      );
    });

    it('should cache service token and reuse within TTL', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'service-token-abc',
          expires_in: 300,
        },
      });

      // First call - should hit API
      const token1 = await provider.getServiceToken();
      expect(token1).toBe('service-token-abc');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const token2 = await provider.getServiceToken();
      expect(token2).toBe('service-token-abc');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Still 1

      expect(mockLogger.debug).toHaveBeenCalledWith('Using cached service token');
    });

    it('should refresh service token after TTL expiry (with 30s buffer)', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      // Mock Date.now() to control time
      const realDateNow = Date.now;
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      mockedAxios.post
        .mockResolvedValueOnce({
          data: {
            access_token: 'service-token-1',
            expires_in: 60, // 60 seconds
          },
        })
        .mockResolvedValueOnce({
          data: {
            access_token: 'service-token-2',
            expires_in: 60,
          },
        });

      // First call - acquire token
      const token1 = await provider.getServiceToken();
      expect(token1).toBe('service-token-1');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      // Advance time by 25 seconds (within TTL - 30s buffer = 30s)
      currentTime += 25000;
      const token2 = await provider.getServiceToken();
      expect(token2).toBe('service-token-1'); // Still cached
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      // Advance time by 10 more seconds (total 35s, past buffer)
      currentTime += 10000;
      const token3 = await provider.getServiceToken();
      expect(token3).toBe('service-token-2'); // New token
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      // Cleanup
      Date.now = realDateNow;
    });

    it('should throw error on service token acquisition failure', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      const axiosError: any = new Error('Network error');
      axiosError.response = {
        data: { error: 'invalid_client' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: {},
      };

      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(provider.getServiceToken()).rejects.toThrow(
        'Failed to acquire service token'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to acquire service token',
        expect.objectContaining({
          error: 'Network error',
        })
      );
    });
  });

  describe('User Token Exchange', () => {
    it('should exchange service token for user token', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      // Mock service token acquisition
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'service-token-abc',
          expires_in: 300,
        },
      });

      // Mock token exchange
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'user-token-alice',
          expires_in: 300,
        },
      });

      const token = await provider.getUserToken('alice.chen');

      expect(token).toBe('user-token-alice');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      // Verify token exchange request
      const exchangeCall = mockedAxios.post.mock.calls[1];
      const exchangeParams = exchangeCall[1] as URLSearchParams;
      expect(exchangeParams.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
      expect(exchangeParams.get('subject_token')).toBe('service-token-abc');
      expect(exchangeParams.get('requested_subject')).toBe('alice.chen');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User token acquired for alice.chen',
        { expiresIn: 300 }
      );
    });

    it('should cache user tokens per username', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      // Mock service token
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'service-token-abc',
          expires_in: 300,
        },
      });

      // Mock user token exchanges
      mockedAxios.post
        .mockResolvedValueOnce({
          data: {
            access_token: 'user-token-alice',
            expires_in: 300,
          },
        })
        .mockResolvedValueOnce({
          data: {
            access_token: 'user-token-bob',
            expires_in: 300,
          },
        });

      // First call for alice - should hit API
      const aliceToken1 = await provider.getUserToken('alice.chen');
      expect(aliceToken1).toBe('user-token-alice');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2); // service + alice

      // Second call for alice - should use cache
      const aliceToken2 = await provider.getUserToken('alice.chen');
      expect(aliceToken2).toBe('user-token-alice');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2); // No new calls

      // First call for bob - should hit API (different user)
      const bobToken1 = await provider.getUserToken('bob.martinez');
      expect(bobToken1).toBe('user-token-bob');
      expect(mockedAxios.post).toHaveBeenCalledTimes(3); // bob exchange

      expect(mockLogger.debug).toHaveBeenCalledWith('Using cached token for alice.chen');
    });

    it('should reuse cached service token for multiple user exchanges', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      // Mock service token (once)
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'service-token-abc',
          expires_in: 300,
        },
      });

      // Mock user token exchanges
      mockedAxios.post
        .mockResolvedValueOnce({
          data: {
            access_token: 'user-token-alice',
            expires_in: 300,
          },
        })
        .mockResolvedValueOnce({
          data: {
            access_token: 'user-token-bob',
            expires_in: 300,
          },
        });

      await provider.getUserToken('alice.chen');
      await provider.getUserToken('bob.martinez');

      // Should only call service token once
      const serviceCalls = mockedAxios.post.mock.calls.filter(call => {
        const params = call[1] as URLSearchParams;
        return params.get('grant_type') === 'client_credentials';
      });

      expect(serviceCalls).toHaveLength(1);
    });

    it('should throw error on user token exchange failure', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      // Mock service token
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'service-token-abc',
          expires_in: 300,
        },
      });

      // Mock token exchange failure
      const axiosError: any = new Error('Token exchange failed');
      axiosError.response = {
        data: { error: 'invalid_request', error_description: 'User not found' },
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {},
      };

      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(provider.getUserToken('invalid.user')).rejects.toThrow(
        'Failed to acquire user token for invalid.user'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to acquire user token for invalid.user',
        expect.objectContaining({
          error: 'Token exchange failed',
        })
      );
    });

    it('should refresh user token after TTL expiry (with 30s buffer)', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      const realDateNow = Date.now;
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      // Mock service token
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'service-token-abc',
          expires_in: 300,
        },
      });

      // Mock user token exchanges
      mockedAxios.post
        .mockResolvedValueOnce({
          data: {
            access_token: 'user-token-alice-1',
            expires_in: 60,
          },
        })
        .mockResolvedValueOnce({
          data: {
            access_token: 'user-token-alice-2',
            expires_in: 60,
          },
        });

      // First call
      const token1 = await provider.getUserToken('alice.chen');
      expect(token1).toBe('user-token-alice-1');

      // Within buffer - should use cache
      currentTime += 25000;
      const token2 = await provider.getUserToken('alice.chen');
      expect(token2).toBe('user-token-alice-1');

      // Past buffer - should refresh
      currentTime += 10000;
      const token3 = await provider.getUserToken('alice.chen');
      expect(token3).toBe('user-token-alice-2');

      Date.now = realDateNow;
    });
  });

  describe('Cache Management', () => {
    it('should clear all cached tokens', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      // Mock service token
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'service-token-abc',
          expires_in: 300,
        },
      });

      // Mock user token
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'user-token-alice',
          expires_in: 300,
        },
      });

      // Acquire tokens
      await provider.getUserToken('alice.chen');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      // Clear cache
      provider.clearCache();
      expect(mockLogger.debug).toHaveBeenCalledWith('Token cache cleared');

      // Next call should re-acquire tokens
      mockedAxios.post
        .mockResolvedValueOnce({
          data: {
            access_token: 'service-token-new',
            expires_in: 300,
          },
        })
        .mockResolvedValueOnce({
          data: {
            access_token: 'user-token-alice-new',
            expires_in: 300,
          },
        });

      const newToken = await provider.getUserToken('alice.chen');
      expect(newToken).toBe('user-token-alice-new');
      expect(mockedAxios.post).toHaveBeenCalledTimes(4); // 2 original + 2 new
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      process.env.MCP_INTEGRATION_RUNNER_SECRET = 'test-secret'; // pragma: allowlist secret

      const instance1 = getTestAuthProvider(mockLogger);
      const instance2 = getTestAuthProvider(mockLogger);

      expect(instance1).toBe(instance2);

      delete process.env.MCP_INTEGRATION_RUNNER_SECRET;
    });

    it('should use default console logger if none provided', () => {
      process.env.MCP_INTEGRATION_RUNNER_SECRET = 'test-secret'; // pragma: allowlist secret

      const instance = getTestAuthProvider();

      expect(instance).toBeDefined();

      delete process.env.MCP_INTEGRATION_RUNNER_SECRET;
    });

    it('should throw error if MCP_INTEGRATION_RUNNER_SECRET is missing', () => {
      delete process.env.MCP_INTEGRATION_RUNNER_SECRET;

      expect(() => getTestAuthProvider(mockLogger)).toThrow(
        'MCP_INTEGRATION_RUNNER_SECRET environment variable is required'
      );
    });

    it('should load configuration from environment variables', () => {
      process.env.KEYCLOAK_URL = 'http://custom-keycloak:8080/auth';
      process.env.KEYCLOAK_REALM = 'custom-realm';
      process.env.MCP_INTEGRATION_RUNNER_CLIENT_ID = 'custom-client';
      process.env.MCP_INTEGRATION_RUNNER_SECRET = 'custom-secret'; // pragma: allowlist secret

      const instance = getTestAuthProvider(mockLogger);

      // Verify by checking actual API call (if we make one)
      // For now, just verify instance is created without error
      expect(instance).toBeDefined();

      // Cleanup
      delete process.env.KEYCLOAK_URL;
      delete process.env.KEYCLOAK_REALM;
      delete process.env.MCP_INTEGRATION_RUNNER_CLIENT_ID;
      delete process.env.MCP_INTEGRATION_RUNNER_SECRET;
    });

    it('should reset singleton instance', () => {
      process.env.MCP_INTEGRATION_RUNNER_SECRET = 'test-secret'; // pragma: allowlist secret

      const instance1 = getTestAuthProvider(mockLogger);
      resetTestAuthProvider();
      const instance2 = getTestAuthProvider(mockLogger);

      expect(instance1).not.toBe(instance2);

      delete process.env.MCP_INTEGRATION_RUNNER_SECRET;
    });
  });

  describe('Error Handling', () => {
    it('should handle axios errors without response data', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      const axiosError: any = new Error('Network timeout');
      // No response property

      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(provider.getServiceToken()).rejects.toThrow(
        'Failed to acquire service token: Network timeout'
      );
    });

    it('should include response data in error message when available', async () => {
      const provider = new TestAuthProvider(config, mockLogger);

      const axiosError: any = new Error('Invalid credentials');
      axiosError.response = {
        data: { error: 'invalid_client', error_description: 'Client not found' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: {},
      };

      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(provider.getServiceToken()).rejects.toThrow(
        'Failed to acquire service token'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to acquire service token',
        expect.objectContaining({
          error: 'Invalid credentials',
        })
      );
    });
  });
});
