/**
 * Logger Utility
 *
 * Provides a consistent logging interface for the MCP Gateway.
 * Uses Winston for structured logging with configurable levels.
 */

import winston from 'winston';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/**
 * Create Winston logger with console transport.
 * Format: timestamp [level]: message {metadata}
 */
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, ...metadata }) => {
      let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
      if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
      }
      return msg;
    })
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Logger interface for dependency injection.
 * Matches Winston's Logger interface for the common methods.
 */
export interface ILogger {
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}
