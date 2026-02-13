// Prevent tests from binding to the real service port (avoids conflicts with Docker containers)
process.env.PORT = '0';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: '50%', // v1.5: Parallel test execution
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@tamshai/shared$': '<rootDir>/src/__mocks__/@tamshai/shared.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/__tests__/integration/setup.ts', // Test fixtures and utilities
    '!src/index.ts',
    '!src/utils/logger.ts', // Configuration file
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  clearMocks: true,
  resetMocks: true,
};
