/**
 * MongoDB SSL Configuration Tests (H3 Phase 2)
 */

import * as fs from 'fs';
import {
  getMongoSSLConfig,
  withMongoSSL,
  isMongoSSLEnabled,
  logMongoSSLStatus,
  MongoSSLConfig,
} from './mongodb';

// Store original env
const originalEnv = { ...process.env };

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();

// Mock fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdtempSync: jest.fn().mockReturnValue('/tmp/mongodb-ssl-abc123'),
}));

// Mock crypto module
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: () => 'deadbeef12345678',
  }),
}));

// Mock os module
jest.mock('os', () => ({
  tmpdir: jest.fn().mockReturnValue('/tmp'),
}));

describe('MongoDB SSL Configuration', () => {
  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.MONGODB_SSL;
    delete process.env.MONGODB_SSL_CA;
    delete process.env.MONGODB_SSL_REJECT_UNAUTHORIZED;
    delete process.env.NODE_ENV;

    // Reset mocks
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
  });

  describe('isMongoSSLEnabled', () => {
    it('should return false when MONGODB_SSL is not set', () => {
      expect(isMongoSSLEnabled()).toBe(false);
    });

    it('should return false when MONGODB_SSL is "false"', () => {
      process.env.MONGODB_SSL = 'false';
      expect(isMongoSSLEnabled()).toBe(false);
    });

    it('should return true when MONGODB_SSL is "true"', () => {
      process.env.MONGODB_SSL = 'true';
      expect(isMongoSSLEnabled()).toBe(true);
    });

    it('should return true when MONGODB_SSL is "require"', () => {
      process.env.MONGODB_SSL = 'require';
      expect(isMongoSSLEnabled()).toBe(true);
    });

    it('should return true when MONGODB_SSL is "1"', () => {
      process.env.MONGODB_SSL = '1';
      expect(isMongoSSLEnabled()).toBe(true);
    });

    it('should be case-insensitive', () => {
      process.env.MONGODB_SSL = 'TRUE';
      expect(isMongoSSLEnabled()).toBe(true);

      process.env.MONGODB_SSL = 'REQUIRE';
      expect(isMongoSSLEnabled()).toBe(true);
    });
  });

  describe('getMongoSSLConfig', () => {
    it('should return null when SSL is disabled', () => {
      expect(getMongoSSLConfig()).toBeNull();
    });

    it('should return basic config when SSL is enabled without CA', () => {
      process.env.MONGODB_SSL = 'true';
      process.env.NODE_ENV = 'development';

      const config = getMongoSSLConfig();

      expect(config).not.toBeNull();
      expect(config?.tls).toBe(true);
      expect(config?.tlsInsecure).toBe(true); // dev mode
      expect(config?.tlsCAFile).toBeUndefined();
    });

    it('should enable strict mode in production', () => {
      process.env.MONGODB_SSL = 'true';
      process.env.NODE_ENV = 'production';

      const config = getMongoSSLConfig();

      expect(config?.tls).toBe(true);
      expect(config?.tlsInsecure).toBe(false);
      expect(config?.tlsAllowInvalidHostnames).toBe(false);
    });

    it('should load CA from file path', () => {
      process.env.MONGODB_SSL = 'true';
      process.env.MONGODB_SSL_CA = '/path/to/ca.crt';
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const config = getMongoSSLConfig();

      expect(config?.tlsCAFile).toBe('/path/to/ca.crt');
    });

    it('should throw if CA file does not exist', () => {
      process.env.MONGODB_SSL = 'true';
      process.env.MONGODB_SSL_CA = '/nonexistent/ca.crt';
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      expect(() => getMongoSSLConfig()).toThrow('MongoDB SSL CA certificate not found');
    });

    it('should handle PEM content as CA securely', () => {
      process.env.MONGODB_SSL = 'true';
      process.env.MONGODB_SSL_CA = '-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----';
      (fs.writeFileSync as jest.Mock).mockImplementation();
      (fs.mkdtempSync as jest.Mock).mockReturnValue('/tmp/mongodb-ssl-secure123');

      const config = getMongoSSLConfig();

      // Verify secure temp file path (random directory + random filename)
      // Use path separator agnostic check for cross-platform compatibility
      expect(config?.tlsCAFile).toMatch(/mongodb-ssl-secure123.*ca-deadbeef12345678\.crt$/);
      // Verify restrictive file permissions (0o600)
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { mode: 0o600 }
      );
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('MONGODB_SSL_CA contains PEM content')
      );
    });

    it('should allow insecure mode when explicitly set', () => {
      process.env.MONGODB_SSL = 'true';
      process.env.NODE_ENV = 'production';
      process.env.MONGODB_SSL_REJECT_UNAUTHORIZED = 'false';

      const config = getMongoSSLConfig();

      expect(config?.tlsInsecure).toBe(true);
    });
  });

  describe('withMongoSSL', () => {
    it('should return original options when SSL is disabled', () => {
      const options = { maxPoolSize: 10 };
      const result = withMongoSSL(options);

      expect(result).toEqual({ maxPoolSize: 10 });
    });

    it('should merge SSL config with existing options', () => {
      process.env.MONGODB_SSL = 'true';
      process.env.NODE_ENV = 'development';

      const options = { maxPoolSize: 10 };
      const result = withMongoSSL(options);

      expect(result.maxPoolSize).toBe(10);
      expect(result.tls).toBe(true);
    });

    it('should work with empty options', () => {
      process.env.MONGODB_SSL = 'true';
      process.env.NODE_ENV = 'development';

      const result = withMongoSSL();

      expect(result.tls).toBe(true);
    });
  });

  describe('logMongoSSLStatus', () => {
    it('should log status via console when no logger provided', () => {
      process.env.MONGODB_SSL = 'false';

      logMongoSSLStatus();

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB SSL configuration'),
        expect.any(String)
      );
    });

    it('should log status via provided logger', () => {
      process.env.MONGODB_SSL = 'true';
      process.env.NODE_ENV = 'development';

      const mockLogger = { info: jest.fn() };
      logMongoSSLStatus(mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MongoDB SSL configuration',
        expect.objectContaining({ enabled: true })
      );
    });
  });
});
