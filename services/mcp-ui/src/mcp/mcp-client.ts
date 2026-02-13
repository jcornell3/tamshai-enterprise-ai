/**
 * MCP Client - Implementation
 *
 * This module provides the client for calling MCP tools via the MCP Gateway.
 * The gateway handles routing to appropriate MCP servers based on the server name.
 *
 * Features:
 * - JWT authentication via Keycloak service account
 * - User context propagation for RBAC
 * - Automatic token refresh on 401 errors
 *
 * TDD Phase: GREEN - Full implementation to pass all tests
 */

import axios from 'axios';
import { KeycloakAuthService } from '../auth/keycloak-auth';
import { logger } from '../utils/logger';

/**
 * Represents an MCP tool call configuration.
 */
export interface MCPCall {
  /** The MCP server to call (e.g., 'hr', 'finance', 'sales') */
  server: string;
  /** The tool name to invoke (e.g., 'get_org_chart', 'list_employees') */
  tool: string;
  /** Maps tool parameter names to directive parameter names */
  paramMap: Record<string, string>;
  /** Optional field name for merging response data (for multi-call components) */
  dataField?: string;
}

/**
 * User context for authorization headers.
 */
export interface UserContext {
  /** The user's unique identifier */
  userId: string;
  /** Array of roles assigned to the user */
  roles: string[];
  /** Optional username */
  username?: string;
  /** Optional email */
  email?: string;
}

/**
 * MCP Tool Response - discriminated union for success/error/pending states.
 */
export type MCPToolResponse =
  | { status: 'success'; data: any; metadata?: { truncated?: boolean; totalCount?: string } }
  | { status: 'error'; code: string; message: string; suggestedAction: string }
  | { status: 'pending_confirmation'; confirmationId: string; message: string };

/**
 * Options for calling MCP tools.
 */
export interface MCPCallOptions {
  /** Optional auth service for JWT authentication */
  authService?: KeycloakAuthService;
  /** Retry on 401 with refreshed token (default: true) */
  retryOnAuthError?: boolean;
  /** Optional user JWT token to forward (instead of using service account token) */
  userToken?: string;
}

// Module-level auth service instance (set via setAuthService)
let globalAuthService: KeycloakAuthService | null = null;

/**
 * Set the global auth service for all MCP calls.
 * This allows the auth service to be injected at startup.
 *
 * @param authService - The Keycloak auth service instance
 */
export function setAuthService(authService: KeycloakAuthService): void {
  globalAuthService = authService;
  logger.info('MCP Client auth service configured');
}

/**
 * Get the current global auth service.
 *
 * @returns The current auth service or null
 */
export function getAuthService(): KeycloakAuthService | null {
  return globalAuthService;
}

/**
 * Calls an MCP tool via the MCP Gateway.
 *
 * @param call - The MCP call configuration (server, tool, paramMap)
 * @param params - The directive parameters to map to tool parameters
 * @param userContext - User context for authorization headers
 * @param options - Optional call options (auth service, retry behavior)
 * @returns The MCP tool response
 * @throws Error on network or server errors
 *
 * @example
 * const result = await callMCPTool(
 *   { server: 'hr', tool: 'get_org_chart', paramMap: { userId: 'userId' } },
 *   { userId: 'me' },
 *   { userId: 'user-123', roles: ['hr-read'] }
 * );
 */
export async function callMCPTool(
  call: MCPCall,
  params: Record<string, string>,
  userContext: UserContext,
  options: MCPCallOptions = {}
): Promise<MCPToolResponse> {
  const { authService = globalAuthService, retryOnAuthError = true, userToken } = options;

  // Get gateway URL from environment (required)
  const gatewayUrl = process.env.MCP_GATEWAY_URL;

  // Construct the full endpoint URL
  const url = `${gatewayUrl}/api/mcp/${call.server}/${call.tool}`;

  // Map directive params to tool params using paramMap
  // paramMap format: { toolParamName: directiveParamName }
  const toolParams: Record<string, string> = {};
  for (const [toolParam, directiveParam] of Object.entries(call.paramMap)) {
    if (params[directiveParam] !== undefined) {
      let value = params[directiveParam];
      // Special case: resolve "me" to the actual user ID
      // Works for any tool param that represents a user identifier
      if (value === 'me' && (toolParam === 'userId' || toolParam === 'rootEmployeeId' || toolParam.toLowerCase().includes('user'))) {
        value = userContext.userId;
      }
      toolParams[toolParam] = value;
    }
  }

  // Build headers with user context
  const headers: Record<string, string> = {
    'X-User-ID': userContext.userId,
    'X-User-Roles': userContext.roles.join(','),
  };

  // Add Authorization header
  // Priority: userToken (forwarded from browser) > service account token
  if (userToken) {
    // Forward the user's original JWT token
    headers['Authorization'] = `Bearer ${userToken}`;
    logger.debug('Using forwarded user token for MCP call', {
      server: call.server,
      tool: call.tool,
      userId: userContext.userId,
    });
  } else if (authService) {
    // Fall back to service account token (for non-user-initiated calls)
    try {
      const token = await authService.getAccessToken();
      headers['Authorization'] = `Bearer ${token}`;
      logger.debug('Using service account token for MCP call', {
        server: call.server,
        tool: call.tool,
      });
    } catch (error) {
      logger.warn('Failed to get auth token, proceeding without authentication', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  try {
    // Make the request - let axios throw on network/server errors
    const response = await axios.get(url, {
      params: toolParams,
      headers,
    });

    // Return the response data directly (MCP server handles error responses)
    return response.data;
  } catch (error: any) {
    // Handle 401 Unauthorized - retry with fresh token
    if (error.response?.status === 401 && authService && retryOnAuthError) {
      logger.info('Received 401, invalidating token and retrying');
      authService.invalidateToken();

      // Retry once with fresh token
      return callMCPTool(call, params, userContext, {
        ...options,
        retryOnAuthError: false, // Don't retry again
      });
    }

    // Re-throw other errors
    throw error;
  }
}
