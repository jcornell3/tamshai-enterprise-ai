/**
 * Logger Utility Tests
 *
 * Tests for Winston logger configuration.
 * Note: Process event handlers are not tested as they would terminate the test process.
 */
import { logger } from './logger';

describe('logger', () => {
  it('is defined and has logging methods', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('has correct service metadata', () => {
    expect(logger.defaultMeta).toEqual({ service: 'mcp-tax' });
  });

  it('can log info messages', () => {
    // This should not throw
    expect(() => logger.info('Test info message')).not.toThrow();
  });

  it('can log with metadata', () => {
    expect(() => logger.info('Test with metadata', { key: 'value' })).not.toThrow();
  });

  it('can log error messages', () => {
    expect(() => logger.error('Test error', { error: new Error('test') })).not.toThrow();
  });

  it('has console transport configured', () => {
    const consoleTransport = logger.transports.find(
      (t) => t instanceof (require('winston').transports.Console)
    );
    expect(consoleTransport).toBeDefined();
  });
});
