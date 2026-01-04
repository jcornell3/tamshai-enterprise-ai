/**
 * Typed mock factory for @keycloak/keycloak-admin-client
 *
 * Provides type-safe mocks to avoid `any` types in tests.
 * All mock functions return sensible defaults that can be overridden per-test.
 */

/**
 * Keycloak user representation (subset of actual type)
 */
export interface MockUserRepresentation {
  id?: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
  requiredActions?: string[];
}

/**
 * Keycloak role representation
 */
export interface MockRoleRepresentation {
  id?: string;
  name?: string;
  description?: string;
  composite?: boolean;
}

/**
 * Keycloak session representation
 */
export interface MockSessionRepresentation {
  id: string;
  username?: string;
  userId?: string;
  ipAddress?: string;
  start?: number;
  lastAccess?: number;
}

/**
 * Typed mock for KcAdminClient.users methods
 */
export interface MockKeycloakUsers {
  create: jest.Mock<Promise<{ id: string }>, [Partial<MockUserRepresentation>]>;
  update: jest.Mock<Promise<void>, [{ id: string }, Partial<MockUserRepresentation>]>;
  del: jest.Mock<Promise<void>, [{ id: string }]>;
  findOne: jest.Mock<Promise<MockUserRepresentation | null>, [{ id: string }]>;
  find: jest.Mock<Promise<MockUserRepresentation[]>, [{ email?: string; search?: string; max?: number }?]>;
  addClientRoleMappings: jest.Mock<
    Promise<void>,
    [{ id: string; clientUniqueId: string; roles: MockRoleRepresentation[] }]
  >;
  listClientRoleMappings: jest.Mock<
    Promise<MockRoleRepresentation[]>,
    [{ id: string; clientUniqueId: string }]
  >;
  listSessions: jest.Mock<Promise<MockSessionRepresentation[]>, [{ id: string }]>;
  logout: jest.Mock<Promise<void>, [{ id: string }]>;
}

/**
 * Keycloak client representation
 */
export interface MockClientRepresentation {
  id?: string;
  clientId?: string;
}

/**
 * Typed mock for KcAdminClient.clients methods
 */
export interface MockKeycloakClients {
  find: jest.Mock<Promise<MockClientRepresentation[]>, [{ clientId: string }]>;
  listRoles: jest.Mock<Promise<MockRoleRepresentation[]>, [{ id: string }]>;
  findOne: jest.Mock<Promise<{ id: string; clientId: string } | null>, [{ id: string }]>;
}

/**
 * Typed mock for KcAdminClient
 */
export interface MockKcAdminClient {
  users: MockKeycloakUsers;
  clients: MockKeycloakClients;
  auth: jest.Mock<
    Promise<void>,
    [{ grantType: string; clientId: string; clientSecret: string }]
  >;
  setConfig: jest.Mock<void, [{ realmName: string }]>;
}

/**
 * Factory function to create a typed KcAdminClient mock
 *
 * @returns Fresh mock instance with default implementations
 */
export function createMockKcAdmin(): MockKcAdminClient {
  return {
    users: {
      create: jest.fn().mockResolvedValue({ id: 'kc-user-default' }),
      update: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      addClientRoleMappings: jest.fn().mockResolvedValue(undefined),
      listClientRoleMappings: jest.fn().mockResolvedValue([]),
      listSessions: jest.fn().mockResolvedValue([]),
      logout: jest.fn().mockResolvedValue(undefined),
    },
    clients: {
      find: jest.fn().mockResolvedValue([{ id: 'client-uuid-default', clientId: 'mcp-gateway' }]),
      listRoles: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    },
    auth: jest.fn().mockResolvedValue(undefined),
    setConfig: jest.fn(),
  };
}

/**
 * Reset all mocks in a MockKcAdminClient instance
 *
 * @param mock - The mock instance to reset
 */
export function resetMockKcAdmin(mock: MockKcAdminClient): void {
  Object.values(mock.users).forEach((fn) => fn.mockReset());
  Object.values(mock.clients).forEach((fn) => fn.mockReset());
  mock.auth.mockReset();
  mock.setConfig.mockReset();
}

/**
 * Create a mock user for testing
 *
 * @param overrides - Properties to override defaults
 * @returns Mock user representation
 */
export function createMockUser(
  overrides: Partial<MockUserRepresentation> = {}
): MockUserRepresentation {
  return {
    id: `kc-user-${Date.now()}`,
    username: 'test@tamshai.com',
    email: 'test@tamshai.com',
    firstName: 'Test',
    lastName: 'User',
    enabled: true,
    emailVerified: false,
    attributes: {},
    requiredActions: [],
    ...overrides,
  };
}

/**
 * Create a mock role for testing
 *
 * @param name - Role name
 * @param id - Optional role ID
 * @returns Mock role representation
 */
export function createMockRole(
  name: string,
  id?: string
): MockRoleRepresentation {
  return {
    id: id || `role-${name}`,
    name,
    description: `${name} role`,
    composite: false,
  };
}
