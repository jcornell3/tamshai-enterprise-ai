// Prevent tests from binding to the real service port (avoids conflicts with Docker containers)
process.env.PORT = '0';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: '50%', // v1.5: Parallel test execution
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/index.ts', // Excluded: Will be covered during MCP Gateway refactor (Issue #65)
    '!src/scripts/**', // Excluded: CLI scripts wrap already-tested IdentityService
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
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
