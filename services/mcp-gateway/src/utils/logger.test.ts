/**
 * Logger Utility Tests
 *
 * Tests for the Winston logger configuration and formatting.
 */

import { logger } from './logger';

describe('Logger', () => {
  let consoleOutput: string[] = [];
  const originalStdoutWrite = process.stdout.write;

  beforeEach(() => {
    consoleOutput = [];
    // Capture console output
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      if (typeof chunk === 'string') {
        consoleOutput.push(chunk);
      }
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  describe('log formatting', () => {
    it('should format message without metadata', () => {
      logger.info('Test message without metadata');

      expect(consoleOutput.length).toBeGreaterThan(0);
      const output = consoleOutput[0];
      expect(output).toContain('[INFO]');
      expect(output).toContain('Test message without metadata');
      // Should NOT contain JSON metadata
      expect(output).not.toContain('{');
    });

    it('should format message with metadata', () => {
      logger.info('Test message with metadata', { userId: '123', action: 'test' });

      expect(consoleOutput.length).toBeGreaterThan(0);
      const output = consoleOutput[0];
      expect(output).toContain('[INFO]');
      expect(output).toContain('Test message with metadata');
      // Should contain JSON metadata
      expect(output).toContain('"userId":"123"');
      expect(output).toContain('"action":"test"');
    });

    it('should include timestamp in log output', () => {
      logger.info('Timestamp test');

      expect(consoleOutput.length).toBeGreaterThan(0);
      const output = consoleOutput[0];
      // Timestamp format: YYYY-MM-DD HH:mm:ss
      expect(output).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('should format different log levels correctly', () => {
      logger.debug('Debug message');
      logger.warn('Warning message');
      logger.error('Error message');

      // Note: debug may not appear if LOG_LEVEL is 'info'
      const hasWarn = consoleOutput.some(o => o.includes('[WARN]'));
      const hasError = consoleOutput.some(o => o.includes('[ERROR]'));

      expect(hasWarn).toBe(true);
      expect(hasError).toBe(true);
    });

    it('should handle empty metadata object', () => {
      // Empty object should not add JSON to output
      logger.info('Empty metadata test', {});

      expect(consoleOutput.length).toBeGreaterThan(0);
      const output = consoleOutput[0];
      expect(output).toContain('Empty metadata test');
      // Empty object has no keys, so no JSON should be appended
      expect(output).not.toContain('{}');
    });
  });

  describe('logger interface', () => {
    it('should have all required log methods', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });
});
