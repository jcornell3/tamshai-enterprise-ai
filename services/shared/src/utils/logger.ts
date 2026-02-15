/**
 * Logger Factory
 *
 * Creates consistent Winston loggers across all MCP services.
 * Pattern: Environment-aware formatting with service metadata and error stack traces.
 *
 * Usage:
 *   import { createLogger } from '@tamshai/shared';
 *   const logger = createLogger('mcp-hr');
 */
import winston from 'winston';

/**
 * Logger interface for dependency injection.
 * Matches Winston's Logger interface for common methods.
 */
export interface ILogger {
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

/**
 * Create a Winston logger with consistent configuration.
 *
 * Features:
 * - Environment-aware formatting (JSON in production, colorized in dev)
 * - Service name in defaultMeta for log aggregation
 * - Error stack trace support
 * - Configurable via LOG_LEVEL environment variable
 *
 * @param serviceName - Service identifier (e.g., 'mcp-hr', 'mcp-gateway')
 * @returns Configured Winston logger instance
 */
export function createLogger(serviceName: string): winston.Logger {
  const logLevel = process.env.LOG_LEVEL || 'info';

  return winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.Console({
        format:
          process.env.NODE_ENV === 'production'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
              ),
      }),
    ],
  });
}
