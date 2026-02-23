/**
 * Logger Utility
 *
 * Provides a consistent logging interface for the MCP Gateway.
 * Includes Better Stack integration for error/warning logs via HTTP.
 *
 * Environment Variables:
 *   LOG_LEVEL - Minimum log level (default: info)
 *   BETTER_STACK_SOURCE_TOKEN - Better Stack source token for remote logging
 *
 * Better Stack Integration:
 *   When BETTER_STACK_SOURCE_TOKEN is set, warn/error logs are forwarded
 *   to Better Stack via HTTP for centralized troubleshooting. Info/debug logs
 *   are NOT sent to avoid noise - only problems are forwarded.
 */
import winston from 'winston';
import Transport from 'winston-transport';

export interface ILogger {
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

const SERVICE_NAME = 'mcp-gateway';
const logLevel = process.env.LOG_LEVEL || 'info';
const BETTER_STACK_ENDPOINT = 'https://in.logs.betterstack.com';

/**
 * Custom Winston transport that forwards logs to Better Stack via HTTP.
 * Uses native fetch (Node 18+) to avoid additional dependencies.
 */
class BetterStackTransport extends Transport {
  private token: string;

  constructor(opts: Transport.TransportStreamOptions & { token: string }) {
    super(opts);
    this.token = opts.token;
  }

  log(info: { level: string; message: string; timestamp?: string; [key: string]: unknown }, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Fire-and-forget HTTP request to Better Stack
    // Destructure to avoid TypeScript duplicate property errors
    const { level, message, timestamp, ...rest } = info;
    const payload = {
      ...rest,
      dt: timestamp || new Date().toISOString(),
      level,
      message,
      service: SERVICE_NAME,
    };

    fetch(BETTER_STACK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      // Silently ignore errors - don't disrupt application logging
    });

    callback();
  }
}

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

// Add Better Stack HTTP transport for warn/error only (troubleshooting, not noise)
if (process.env.BETTER_STACK_SOURCE_TOKEN) {
  transports.push(
    new BetterStackTransport({
      token: process.env.BETTER_STACK_SOURCE_TOKEN,
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
  logger.info('Better Stack logging enabled (warn/error only via HTTP)');
}
