/**
 * Logger Utility Tests
 *
 * Tests for the Winston logger configuration and formatting.
 */

import winston from 'winston';
import { Writable } from 'stream';

describe('Logger', () => {
  // Test the logger module exports and configuration
  describe('logger module', () => {
    it('should export a logger with required methods', async () => {
      const { logger } = await import('./logger');

      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should export ILogger interface types', async () => {
      // Just verify the module exports work
      const mod = await import('./logger');
      expect(mod.logger).toBeDefined();
    });
  });

  describe('log formatting (printf)', () => {
    // Test the formatting logic directly by creating a logger with a capturing transport
    let capturedLogs: string[] = [];

    const createTestLogger = (level: string = 'debug') => {
      capturedLogs = [];

      const capturingStream = new Writable({
        write(chunk, _encoding, callback) {
          capturedLogs.push(chunk.toString().trim());
          callback();
        },
      });

      return winston.createLogger({
        level,
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
        transports: [new winston.transports.Stream({ stream: capturingStream })],
      });
    };

    it('should format message without metadata', () => {
      const testLogger = createTestLogger();
      testLogger.info('Test message without metadata');

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]).toContain('[INFO]');
      expect(capturedLogs[0]).toContain('Test message without metadata');
      // Should NOT contain JSON metadata (no curly braces)
      expect(capturedLogs[0]).not.toContain('{');
    });

    it('should format message with metadata', () => {
      const testLogger = createTestLogger();
      testLogger.info('Test message with metadata', { userId: '123', action: 'test' });

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]).toContain('[INFO]');
      expect(capturedLogs[0]).toContain('Test message with metadata');
      expect(capturedLogs[0]).toContain('"userId":"123"');
      expect(capturedLogs[0]).toContain('"action":"test"');
    });

    it('should include timestamp in log output', () => {
      const testLogger = createTestLogger();
      testLogger.info('Timestamp test');

      expect(capturedLogs.length).toBe(1);
      // Timestamp format: YYYY-MM-DD HH:mm:ss
      expect(capturedLogs[0]).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('should format different log levels correctly', () => {
      const testLogger = createTestLogger('debug');
      testLogger.debug('Debug message');
      testLogger.info('Info message');
      testLogger.warn('Warning message');
      testLogger.error('Error message');

      expect(capturedLogs).toHaveLength(4);
      expect(capturedLogs[0]).toContain('[DEBUG]');
      expect(capturedLogs[1]).toContain('[INFO]');
      expect(capturedLogs[2]).toContain('[WARN]');
      expect(capturedLogs[3]).toContain('[ERROR]');
    });

    it('should handle empty metadata object', () => {
      const testLogger = createTestLogger();
      testLogger.info('Empty metadata test', {});

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]).toContain('Empty metadata test');
      // Empty object has no keys, so no JSON should be appended
      expect(capturedLogs[0]).not.toContain('{}');
    });

    it('should not log debug when level is info', () => {
      const testLogger = createTestLogger('info');
      testLogger.debug('Should not appear');
      testLogger.info('Should appear');

      expect(capturedLogs).toHaveLength(1);
      expect(capturedLogs[0]).toContain('Should appear');
    });
  });
});
