/**
 * Logger Utility
 *
 * Provides a consistent logging interface for the MCP Gateway.
 * Includes Better Stack (Logtail) integration for error/warning logs.
 *
 * Environment Variables:
 *   LOG_LEVEL - Minimum log level (default: info)
 *   BETTER_STACK_SOURCE_TOKEN - Better Stack source token for remote logging
 *
 * Better Stack Integration:
 *   When BETTER_STACK_SOURCE_TOKEN is set, warn/error logs are forwarded
 *   to Better Stack for centralized troubleshooting. Info/debug logs are
 *   NOT sent to avoid noise - only problems are forwarded.
 */
import winston from 'winston';
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';

export interface ILogger {
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

const SERVICE_NAME = 'mcp-gateway';
const logLevel = process.env.LOG_LEVEL || 'info';

// Build transports array
const transports: winston.transport[] = [
  new winston.transports.Console({
    format:
      process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
  }),
];

// Add Better Stack transport for warn/error only (troubleshooting, not noise)
if (process.env.BETTER_STACK_SOURCE_TOKEN) {
  const logtail = new Logtail(process.env.BETTER_STACK_SOURCE_TOKEN);
  transports.push(
    new LogtailTransport(logtail, {
      level: 'warn', // Only send warn and error (not info/debug)
    })
  );
}

export const logger: winston.Logger & ILogger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: SERVICE_NAME },
  transports,
});

// Log startup info about Better Stack integration
if (process.env.BETTER_STACK_SOURCE_TOKEN) {
  logger.info('Better Stack logging enabled (warn/error only)');
}
