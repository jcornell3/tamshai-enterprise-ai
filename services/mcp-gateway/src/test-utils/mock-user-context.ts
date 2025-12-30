/**
 * Mock User Context Factory
 *
 * Create mock user contexts for testing with pre-defined test users
 */

// UserContext interface matching the one in index.ts
export interface UserContext {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  groups: string[];
}

/**
 * Create a mock user context for testing
 *
 * Usage:
 *   const alice = createMockUserContext({ username: 'alice', roles: ['hr-read', 'hr-write'] });
 *   const intern = createMockUserContext({ roles: ['intern'] });
 */
export function createMockUserContext(
  overrides?: Partial<UserContext>
): UserContext {
  return {
    userId: 'test-user-123',
    username: 'testuser',
    email: 'test@example.com',
    roles: ['hr-read'],
    groups: [],
    ...overrides,
  };
}

/**
 * Pre-defined user contexts for common test scenarios
 * Mirrors the test users from keycloak/realm-export-dev.json
 */
export const TEST_USERS = {
  hrManager: createMockUserContext({
    userId: 'alice-123',
    username: 'alice.chen',
    email: 'alice@tamshai.com',
    roles: ['hr-read', 'hr-write'],
    groups: ['/tamshai/hr'],
  }),
  executive: createMockUserContext({
    userId: 'eve-456',
    username: 'eve.thompson',
    email: 'eve@tamshai.com',
    roles: ['executive'],
    groups: ['/tamshai/executive'],
  }),
  financeManager: createMockUserContext({
    userId: 'bob-789',
    username: 'bob.martinez',
    email: 'bob@tamshai.com',
    roles: ['finance-read', 'finance-write'],
    groups: ['/tamshai/finance'],
  }),
  salesManager: createMockUserContext({
    userId: 'carol-012',
    username: 'carol.johnson',
    email: 'carol@tamshai.com',
    roles: ['sales-read', 'sales-write'],
    groups: ['/tamshai/sales'],
  }),
  supportManager: createMockUserContext({
    userId: 'dan-345',
    username: 'dan.williams',
    email: 'dan@tamshai.com',
    roles: ['support-read', 'support-write'],
    groups: ['/tamshai/support'],
  }),
  engineer: createMockUserContext({
    userId: 'marcus-678',
    username: 'marcus.johnson',
    email: 'marcus@tamshai.com',
    roles: ['user'],
    groups: ['/tamshai/engineering'],
  }),
  intern: createMockUserContext({
    userId: 'frank-901',
    username: 'frank.davis',
    email: 'frank@tamshai.com',
    roles: ['intern'],
    groups: ['/tamshai/engineering'],
  }),
};
