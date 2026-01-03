/**
 * Jest Integration Test Configuration
 *
 * Separate config for integration tests that require running services
 * (PostgreSQL, Redis, etc.)
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: 1, // Run serially to avoid database conflicts
  testMatch: [
    '**/integration/**/*.test.ts',
    '**/integration/**/*.spec.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration/setup.ts'],
  testTimeout: 30000, // 30 second timeout for database operations
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)',
  ],
  // Integration tests are slower, disable coverage thresholds
  coverageThreshold: undefined,
};
