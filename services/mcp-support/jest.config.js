// Prevent tests from binding to the real service port (avoids conflicts with Docker containers)
process.env.PORT = '0';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: '50%', // v1.5: Parallel test execution
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/index.ts', // Excluded: Main server file, covered by integration tests
    '!src/database/connection.ts', // Excluded: MongoDB connection infrastructure, covered by integration tests
    '!src/types/response.ts', // Excluded: Existing file, not part of backend abstraction
    '!src/utils/redis.ts', // Excluded: Existing file, not part of backend abstraction
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
