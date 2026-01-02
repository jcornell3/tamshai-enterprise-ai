/**
 * MCP Client Service
 *
 * Handles communication with MCP servers
 * Extracted from index.ts for testability and separation of concerns
 */

import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';
import { MCPServerConfig } from './role-mapper';
import { UserContext } from '../test-utils/mock-user-context';
import {
  MCPToolResponse,
  isSuccessResponse,
} from '../types/mcp-response';

export interface MCPClientConfig {
  readTimeout: number;   // Timeout for read operations (ms)
  writeTimeout: number;  // Timeout for write operations (ms)
  maxPages?: number;      // Maximum pages to fetch during pagination (default: 10)
}

export interface MCPQueryResult {
  server: string;
  status: 'success' | 'error' | 'timeout';
  data: unknown;
  error?: string;
  durationMs?: number;
}

/**
 * MCP Client Service
 *
 * Handles HTTP communication with MCP servers including:
 * - Configurable timeouts (read vs write operations)
 * - Automatic pagination
 * - Error handling and timeout detection
 * - User context propagation
 */
export class MCPClient {
  private axios: AxiosInstance;
  private config: Required<MCPClientConfig>;
  private logger: Logger;

  constructor(config: MCPClientConfig, logger: Logger, axiosInstance?: AxiosInstance) {
    this.config = {
      ...config,
      maxPages: config.maxPages ?? 10,
    };
    this.logger = logger;
    this.axios = axiosInstance || axios;
  }

  /**
   * Query an MCP server with configurable timeout (v1.5 Performance)
   *
   * Implements per-service timeouts with graceful degradation.
   * Automatically paginates through results if the server supports it.
   *
   * @param server - MCP server configuration
   * @param query - Query string to send to the server
   * @param userContext - User context (userId, username, email, roles, groups)
   * @param cursor - Pagination cursor for subsequent pages (optional)
   * @param autoPaginate - Automatically fetch all pages (default: true)
   * @param isWriteOperation - Use longer timeout for writes (default: false)
   * @returns Query result with status, data, and duration
   */
  async queryServer(
    server: MCPServerConfig,
    query: string,
    userContext: UserContext,
    cursor?: string,
    autoPaginate: boolean = true,
    isWriteOperation: boolean = false
  ): Promise<MCPQueryResult> {
    const startTime = Date.now();
    const timeout = isWriteOperation ? this.config.writeTimeout : this.config.readTimeout;

    try {
      const allData: unknown[] = [];
      let currentCursor = cursor;
      let pageCount = 0;

      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        do {
          const response = await this.axios.post(
            `${server.url}/query`,
            {
              query,
              userContext: {
                userId: userContext.userId,
                username: userContext.username,
                email: userContext.email,
                roles: userContext.roles,
              },
              ...(currentCursor && { cursor: currentCursor }),
            },
            {
              timeout: timeout,
              signal: controller.signal,
              headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userContext.userId,
                'X-User-Roles': userContext.roles.join(','),
              },
            }
          );

          const mcpResponse = response.data as MCPToolResponse;

          // Accumulate data
          if (isSuccessResponse(mcpResponse) && Array.isArray(mcpResponse.data)) {
            allData.push(...mcpResponse.data);
            pageCount++;

            // Check for more pages
            if (
              autoPaginate &&
              mcpResponse.metadata?.hasMore &&
              mcpResponse.metadata?.nextCursor &&
              pageCount < this.config.maxPages
            ) {
              currentCursor = mcpResponse.metadata.nextCursor;
              this.logger.info(
                `Auto-paginating ${server.name}, fetched page ${pageCount}, ${allData.length} records so far`
              );
            } else {
              // No more pages or auto-pagination disabled
              if (allData.length > 0) {
                // Return aggregated data
                return {
                  server: server.name,
                  status: 'success',
                  data: {
                    status: 'success',
                    data: allData,
                    metadata: {
                      returnedCount: allData.length,
                      totalCount: allData.length,
                      pagesRetrieved: pageCount,
                    },
                  },
                  durationMs: Date.now() - startTime,
                };
              }
              break;
            }
          } else {
            // Non-array response or error, return as-is
            return {
              server: server.name,
              status: 'success',
              data: response.data,
              durationMs: Date.now() - startTime,
            };
          }
        } while (autoPaginate && pageCount < this.config.maxPages);

        // Loop exited with no data accumulated (empty responses)
        return {
          server: server.name,
          status: 'success',
          data: null,
          durationMs: Date.now() - startTime,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Check if this was a timeout (AbortError or ECONNABORTED)
      if (
        error instanceof Error &&
        (error.name === 'AbortError' ||
          error.name === 'CanceledError' ||
          (axios.isAxiosError(error) && error.code === 'ECONNABORTED'))
      ) {
        this.logger.warn(`MCP server ${server.name} timeout after ${durationMs}ms (limit: ${timeout}ms)`);
        return {
          server: server.name,
          status: 'timeout',
          data: null,
          error: `Service did not respond within ${timeout}ms`,
          durationMs,
        };
      }

      this.logger.error(`MCP server ${server.name} error after ${durationMs}ms:`, error);
      return {
        server: server.name,
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      };
    }
  }
}
