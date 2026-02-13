/**
 * Manual mock for axios
 * Used by token-exchange.test.ts to prevent real HTTP calls
 */

const axiosMock: any = {
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  request: jest.fn(),
  create: jest.fn(function(this: any) { return this; }),
};

export default axiosMock;
