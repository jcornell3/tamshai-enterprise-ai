/**
 * Logger Utility
 *
 * Provides a consistent logging interface for the MCP Gateway.
 */
import { createLogger, ILogger } from '@tamshai/shared';

export const logger: ILogger = createLogger('mcp-gateway');

export type { ILogger };
