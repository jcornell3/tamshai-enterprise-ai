/**
 * Mock Logger Factory
 *
 * Create mock Winston logger for testing
 * Reduces test boilerplate from 10 lines to 1 line
 */

import { Logger } from 'winston';

/**
 * Create a mock Winston logger for testing
 *
 * Usage:
 *   const logger = createMockLogger();
 *   const service = new MyService(logger);
 *   expect(logger.error).toHaveBeenCalledWith(...);
 */
export function createMockLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
    log: jest.fn(),
    // Add other Logger methods as needed
  } as unknown as jest.Mocked<Logger>;
}
