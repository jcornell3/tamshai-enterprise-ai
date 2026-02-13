/**
 * Keycloak Authentication Service Tests
 *
 * Tests for the OAuth2 client credentials flow used by MCP-UI
 * to authenticate with MCP Gateway.
 *
 * TDD Phase: RED - Write failing tests first
 */

import axios from 'axios';
import { KeycloakAuthService, KeycloakAuthConfig } from '../keycloak-auth';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KeycloakAuthService', () => {
  const mockConfig: KeycloakAuthConfig = {
    keycloakUrl: 'http://keycloak:8080',
    realm: 'tamshai-corp',
    clientId: 'mcp-ui',
    clientSecret: 'test-secret',
  };

  let authService: KeycloakAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    authService = new KeycloakAuthService(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getAccessToken', () => {
    it('should fetch a new token from Keycloak on first call', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'test-access-token',
          expires_in: 300, // 5 minutes
          token_type: 'Bearer',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);

      const token = await authService.getAccessToken();

      expect(token).toBe('test-access-token');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://keycloak:8080/realms/tamshai-corp/protocol/openid-connect/token',
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      // Verify the form data
      const callArgs = mockedAxios.post.mock.calls[0];
      const formData = callArgs[1] as URLSearchParams;
      expect(formData.get('grant_type')).toBe('client_credentials');
      expect(formData.get('client_id')).toBe('mcp-ui');
      expect(formData.get('client_secret')).toBe('test-secret');
    });

    it('should return cached token if not expired', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'cached-token',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);

      // First call - fetches token
      const token1 = await authService.getAccessToken();
      expect(token1).toBe('cached-token');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const token2 = await authService.getAccessToken();
      expect(token2).toBe('cached-token');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Still 1 call
    });

    it('should refresh token when expired', async () => {
      const mockTokenResponse1 = {
        data: {
          access_token: 'first-token',
          expires_in: 60, // 1 minute
          token_type: 'Bearer',
        },
      };

      const mockTokenResponse2 = {
        data: {
          access_token: 'refreshed-token',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      mockedAxios.post
        .mockResolvedValueOnce(mockTokenResponse1)
        .mockResolvedValueOnce(mockTokenResponse2);

      // First call
      const token1 = await authService.getAccessToken();
      expect(token1).toBe('first-token');

      // Advance time past expiration (with 30-second buffer)
      jest.advanceTimersByTime(35 * 1000); // 35 seconds

      // Second call - should refresh
      const token2 = await authService.getAccessToken();
      expect(token2).toBe('refreshed-token');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should refresh token proactively before expiration buffer', async () => {
      const mockTokenResponse1 = {
        data: {
          access_token: 'first-token',
          expires_in: 60, // 1 minute
          token_type: 'Bearer',
        },
      };

      const mockTokenResponse2 = {
        data: {
          access_token: 'proactive-refresh-token',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      mockedAxios.post
        .mockResolvedValueOnce(mockTokenResponse1)
        .mockResolvedValueOnce(mockTokenResponse2);

      // First call
      await authService.getAccessToken();

      // Advance time to 35 seconds (within 30-second buffer of 60-second expiry)
      jest.advanceTimersByTime(31 * 1000);

      // Should trigger refresh because we're within buffer
      const token2 = await authService.getAccessToken();
      expect(token2).toBe('proactive-refresh-token');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should throw error on authentication failure', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { error: 'unauthorized_client' },
        },
      });

      await expect(authService.getAccessToken()).rejects.toThrow(
        'Failed to authenticate with Keycloak'
      );
    });

    it('should throw error on network failure', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(authService.getAccessToken()).rejects.toThrow(
        'Failed to authenticate with Keycloak'
      );
    });

    it('should handle concurrent token requests', async () => {
      // Use real timers for this test since we need actual Promise resolution
      jest.useRealTimers();

      const mockTokenResponse = {
        data: {
          access_token: 'concurrent-token',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      // Add a small delay to simulate network latency
      mockedAxios.post.mockImplementationOnce(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(mockTokenResponse), 10))
      );

      // Make concurrent requests
      const [token1, token2, token3] = await Promise.all([
        authService.getAccessToken(),
        authService.getAccessToken(),
        authService.getAccessToken(),
      ]);

      // All should return the same token
      expect(token1).toBe('concurrent-token');
      expect(token2).toBe('concurrent-token');
      expect(token3).toBe('concurrent-token');

      // Only one request should have been made
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      // Restore fake timers for other tests
      jest.useFakeTimers();
    });
  });

  describe('invalidateToken', () => {
    it('should force token refresh on next getAccessToken call', async () => {
      const mockTokenResponse1 = {
        data: {
          access_token: 'first-token',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      const mockTokenResponse2 = {
        data: {
          access_token: 'new-token-after-invalidate',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      mockedAxios.post
        .mockResolvedValueOnce(mockTokenResponse1)
        .mockResolvedValueOnce(mockTokenResponse2);

      // First call
      const token1 = await authService.getAccessToken();
      expect(token1).toBe('first-token');

      // Invalidate
      authService.invalidateToken();

      // Next call should fetch new token
      const token2 = await authService.getAccessToken();
      expect(token2).toBe('new-token-after-invalidate');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('isTokenValid', () => {
    it('should return false when no token is cached', () => {
      expect(authService.isTokenValid()).toBe(false);
    });

    it('should return true when token is valid and not expired', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'valid-token',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);

      await authService.getAccessToken();
      expect(authService.isTokenValid()).toBe(true);
    });

    it('should return false when token is expired', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'expiring-token',
          expires_in: 30, // 30 seconds
          token_type: 'Bearer',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);

      await authService.getAccessToken();

      // Advance time past expiration
      jest.advanceTimersByTime(35 * 1000);

      expect(authService.isTokenValid()).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should use custom token endpoint if provided', async () => {
      const customConfig: KeycloakAuthConfig = {
        ...mockConfig,
        tokenEndpoint: 'http://custom-endpoint/token',
      };

      const customAuthService = new KeycloakAuthService(customConfig);

      const mockTokenResponse = {
        data: {
          access_token: 'custom-endpoint-token',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);

      await customAuthService.getAccessToken();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://custom-endpoint/token',
        expect.any(URLSearchParams),
        expect.any(Object)
      );
    });

    it('should use custom expiry buffer if provided', async () => {
      const customConfig: KeycloakAuthConfig = {
        ...mockConfig,
        expiryBufferSeconds: 60, // 1 minute buffer
      };

      const customAuthService = new KeycloakAuthService(customConfig);

      const mockTokenResponse1 = {
        data: {
          access_token: 'first-token',
          expires_in: 120, // 2 minutes
          token_type: 'Bearer',
        },
      };

      const mockTokenResponse2 = {
        data: {
          access_token: 'refreshed-early',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      mockedAxios.post
        .mockResolvedValueOnce(mockTokenResponse1)
        .mockResolvedValueOnce(mockTokenResponse2);

      await customAuthService.getAccessToken();

      // Advance time to 65 seconds (within 60-second buffer)
      jest.advanceTimersByTime(65 * 1000);

      const token2 = await customAuthService.getAccessToken();
      expect(token2).toBe('refreshed-early');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });
});
