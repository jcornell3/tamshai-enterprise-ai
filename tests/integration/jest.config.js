/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '**/*.test.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 120000, // 120 seconds for SSE streaming tests with Claude
  verbose: true,
  bail: false, // Continue running tests after first failure
  maxWorkers: 1, // Run tests sequentially to avoid race conditions
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
