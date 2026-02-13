/**
 * Mock for @tamshai/shared package
 * Used in unit tests to bypass gateway authentication middleware
 */
export const requireGatewayAuth = jest.fn(() => {
  return (req: unknown, res: unknown, next: () => void) => {
    next();
  };
});
