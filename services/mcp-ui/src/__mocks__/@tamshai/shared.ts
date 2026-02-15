/**
 * Mock for @tamshai/shared package
 * Used in unit tests to bypass gateway authentication middleware
 */
export const requireGatewayAuth = jest.fn(() => {
  return (req: unknown, res: unknown, next: () => void) => {
    next();
  };
});

export interface ILogger {
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

export const createLogger = jest.fn((): ILogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
