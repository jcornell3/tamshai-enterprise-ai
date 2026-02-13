/**
 * MCP Client Tests
 *
 * These tests define the expected behavior for the MCP client that calls
 * MCP servers through the MCP Gateway.
 *
 * TDD Phase: GREEN - Full test coverage with auth support
 */

import axios from 'axios';
import { callMCPTool, MCPCall, UserContext, setAuthService, getAuthService } from '../mcp-client';
import { KeycloakAuthService } from '../../auth/keycloak-auth';

jest.mock('axios');
jest.mock('../../auth/keycloak-auth');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const MockedKeycloakAuthService = KeycloakAuthService as jest.MockedClass<typeof KeycloakAuthService>;

describe('MCPClient', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    roles: ['hr-read', 'finance-read'],
    username: 'testuser',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({
      data: { status: 'success', data: {} },
    });
  });

  describe('Endpoint Construction', () => {
    it('calls correct MCP endpoint URL', async () => {
      const call: MCPCall = {
        server: 'hr',
        tool: 'get_org_chart',
        paramMap: { userId: 'userId' },
      };

      await callMCPTool(call, { userId: 'me' }, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/mcp/hr/get_org_chart'),
        expect.any(Object)
      );
    });

    it('uses MCP_GATEWAY_URL environment variable when set', async () => {
      const originalEnv = process.env.MCP_GATEWAY_URL;
      process.env.MCP_GATEWAY_URL = 'http://custom-gateway:9999';

      const call: MCPCall = { server: 'sales', tool: 'list_customers', paramMap: {} };
      await callMCPTool(call, {}, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('http://custom-gateway:9999'),
        expect.any(Object)
      );

      process.env.MCP_GATEWAY_URL = originalEnv;
    });

    it('defaults to localhost:3100 when MCP_GATEWAY_URL not set', async () => {
      const originalEnv = process.env.MCP_GATEWAY_URL;
      delete process.env.MCP_GATEWAY_URL;

      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };
      await callMCPTool(call, {}, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('localhost:3100'),
        expect.any(Object)
      );

      process.env.MCP_GATEWAY_URL = originalEnv;
    });
  });

  describe('Parameter Mapping', () => {
    it('maps directive params to tool params using paramMap', async () => {
      const call: MCPCall = {
        server: 'hr',
        tool: 'get_org_chart',
        paramMap: { userId: 'userId', maxDepth: 'depth' },
      };

      await callMCPTool(call, { userId: 'me', depth: '2' }, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: { userId: 'me', maxDepth: '2' },
        })
      );
    });

    it('ignores directive params not in paramMap', async () => {
      const call: MCPCall = {
        server: 'hr',
        tool: 'get_org_chart',
        paramMap: { userId: 'userId' },
      };

      await callMCPTool(call, { userId: 'me', extraParam: 'ignored' }, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: { userId: 'me' },
        })
      );
    });

    it('handles empty paramMap', async () => {
      const call: MCPCall = { server: 'hr', tool: 'list_all', paramMap: {} };

      await callMCPTool(call, { someParam: 'value' }, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {},
        })
      );
    });

    it('handles missing directive params gracefully', async () => {
      const call: MCPCall = {
        server: 'hr',
        tool: 'get',
        paramMap: { userId: 'userId', limit: 'limit' },
      };

      await callMCPTool(call, { userId: 'me' }, mockUserContext);

      // Should not throw, missing params become undefined or empty
      expect(mockedAxios.get).toHaveBeenCalled();
    });
  });

  describe('User Context Headers', () => {
    it('includes X-User-ID header', async () => {
      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };

      await callMCPTool(call, {}, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-User-ID': 'user-123',
          }),
        })
      );
    });

    it('includes X-User-Roles header as comma-separated string', async () => {
      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };

      await callMCPTool(call, {}, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-User-Roles': 'hr-read,finance-read',
          }),
        })
      );
    });

    it('handles single role', async () => {
      const singleRoleContext: UserContext = {
        userId: 'user-456',
        roles: ['admin'],
      };
      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };

      await callMCPTool(call, {}, singleRoleContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-User-Roles': 'admin',
          }),
        })
      );
    });

    it('handles empty roles array', async () => {
      const noRolesContext: UserContext = {
        userId: 'user-789',
        roles: [],
      };
      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };

      await callMCPTool(call, {}, noRolesContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-User-Roles': '',
          }),
        })
      );
    });
  });

  describe('Response Handling', () => {
    it('returns response data on success', async () => {
      const mockResponse = {
        status: 'success',
        data: { employee: { id: '1', name: 'Test User' } },
      };
      mockedAxios.get.mockResolvedValue({ data: mockResponse });

      const call: MCPCall = { server: 'hr', tool: 'get', paramMap: {} };
      const result = await callMCPTool(call, {}, mockUserContext);

      expect(result).toEqual(mockResponse);
    });

    it('returns error response from MCP server', async () => {
      const mockError = {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Employee not found',
        suggestedAction: 'Check the employee ID',
      };
      mockedAxios.get.mockResolvedValue({ data: mockError });

      const call: MCPCall = { server: 'hr', tool: 'get', paramMap: {} };
      const result = await callMCPTool(call, {}, mockUserContext);

      expect(result).toEqual(mockError);
    });

    it('preserves metadata in response', async () => {
      const mockResponse = {
        status: 'success',
        data: [{ id: '1' }],
        metadata: { truncated: true, totalCount: '100+' },
      };
      mockedAxios.get.mockResolvedValue({ data: mockResponse });

      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };
      const result = await callMCPTool(call, {}, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.metadata).toEqual({ truncated: true, totalCount: '100+' });
      }
    });
  });

  describe('Error Handling', () => {
    it('throws on network error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      const call: MCPCall = { server: 'hr', tool: 'get', paramMap: {} };

      await expect(callMCPTool(call, {}, mockUserContext)).rejects.toThrow('Network Error');
    });

    it('throws on timeout', async () => {
      mockedAxios.get.mockRejectedValue(new Error('timeout of 30000ms exceeded'));

      const call: MCPCall = { server: 'hr', tool: 'get', paramMap: {} };

      await expect(callMCPTool(call, {}, mockUserContext)).rejects.toThrow('timeout');
    });

    it('throws on 5xx server error', async () => {
      const error = new Error('Request failed with status code 500');
      (error as any).response = { status: 500 };
      mockedAxios.get.mockRejectedValue(error);

      const call: MCPCall = { server: 'hr', tool: 'get', paramMap: {} };

      await expect(callMCPTool(call, {}, mockUserContext)).rejects.toThrow();
    });
  });

  describe('Authentication', () => {
    let mockAuthService: jest.Mocked<KeycloakAuthService>;

    beforeEach(() => {
      mockAuthService = new MockedKeycloakAuthService({
        keycloakUrl: 'http://keycloak:8080',
        realm: 'test',
        clientId: 'test',
        clientSecret: 'secret',
      }) as jest.Mocked<KeycloakAuthService>;

      mockAuthService.getAccessToken = jest.fn().mockResolvedValue('test-jwt-token');
      mockAuthService.invalidateToken = jest.fn();
    });

    it('includes Authorization header when auth service is provided', async () => {
      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };

      await callMCPTool(call, {}, mockUserContext, { authService: mockAuthService });

      expect(mockAuthService.getAccessToken).toHaveBeenCalled();
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt-token',
          }),
        })
      );
    });

    it('uses global auth service when set', async () => {
      setAuthService(mockAuthService);

      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };
      await callMCPTool(call, {}, mockUserContext);

      expect(mockAuthService.getAccessToken).toHaveBeenCalled();
      expect(getAuthService()).toBe(mockAuthService);

      // Clean up global state
      setAuthService(null as any);
    });

    it('proceeds without auth when token fetch fails', async () => {
      mockAuthService.getAccessToken.mockRejectedValue(new Error('Auth failed'));

      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };
      await callMCPTool(call, {}, mockUserContext, { authService: mockAuthService });

      // Should still make the request without Authorization header
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        })
      );
    });

    it('retries with fresh token on 401 response', async () => {
      const error = new Error('Unauthorized');
      (error as any).response = { status: 401 };

      // First call fails with 401, second succeeds
      mockedAxios.get
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: { status: 'success', data: {} } });

      mockAuthService.getAccessToken
        .mockResolvedValueOnce('old-token')
        .mockResolvedValueOnce('fresh-token');

      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };
      const result = await callMCPTool(call, {}, mockUserContext, { authService: mockAuthService });

      expect(mockAuthService.invalidateToken).toHaveBeenCalled();
      expect(mockAuthService.getAccessToken).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('success');
    });

    it('does not retry infinitely on persistent 401', async () => {
      const error = new Error('Unauthorized');
      (error as any).response = { status: 401 };

      // Always fails with 401
      mockedAxios.get.mockRejectedValue(error);

      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };

      await expect(
        callMCPTool(call, {}, mockUserContext, { authService: mockAuthService })
      ).rejects.toThrow();

      // Should only retry once
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('can disable retry on auth error', async () => {
      const error = new Error('Unauthorized');
      (error as any).response = { status: 401 };

      mockedAxios.get.mockRejectedValue(error);

      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };

      await expect(
        callMCPTool(call, {}, mockUserContext, {
          authService: mockAuthService,
          retryOnAuthError: false,
        })
      ).rejects.toThrow();

      // Should not retry
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
