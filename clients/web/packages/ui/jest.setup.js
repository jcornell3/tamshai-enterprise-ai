/**
 * Jest Setup for @tamshai/ui package
 *
 * Configures testing-library matchers and global test utilities.
 */

const matchers = require('@testing-library/jest-dom/matchers');
expect.extend(matchers);
