/**
 * Jest Test Setup
 *
 * This file runs before all tests to set up the testing environment.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379';

// Silence console output during tests (optional - comment out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Increase timeout for slow tests
jest.setTimeout(10000);

// Clean up after all tests
afterAll(() => {
  // Add any global cleanup here
});
