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
 * Credential representation for password reset
 */
export interface MockCredentialRepresentation {
  type: string;
  value: string;
  temporary: boolean;
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
  resetPassword: jest.Mock<
    Promise<void>,
    [{ id: string; credential: MockCredentialRepresentation }]
  >;
  addClientRoleMappings: jest.Mock<
    Promise<void>,
    [{ id: string; clientUniqueId: string; roles: MockRoleRepresentation[] }]
  >;
  addRealmRoleMappings: jest.Mock<
    Promise<void>,
    [{ id: string; roles: MockRoleRepresentation[] }]
  >;
  listClientRoleMappings: jest.Mock<
    Promise<MockRoleRepresentation[]>,
    [{ id: string; clientUniqueId: string }]
  >;
  listSessions: jest.Mock<Promise<MockSessionRepresentation[]>, [{ id: string }]>;
  logout: jest.Mock<Promise<void>, [{ id: string }]>;
  addToGroup: jest.Mock<Promise<void>, [{ id: string; groupId: string }]>;
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
 * Typed mock for KcAdminClient.roles methods (realm-level roles)
 */
export interface MockKeycloakRoles {
  find: jest.Mock<Promise<MockRoleRepresentation[]>, []>;
  findOneByName: jest.Mock<Promise<MockRoleRepresentation | undefined>, [{ name: string }]>;
}

/**
 * Keycloak group representation
 */
export interface MockGroupRepresentation {
  id?: string;
  name?: string;
}

/**
 * Typed mock for KcAdminClient.groups methods
 */
export interface MockKeycloakGroups {
  find: jest.Mock<Promise<MockGroupRepresentation[]>, [{ search?: string }?]>;
}

/**
 * Typed mock for KcAdminClient
 */
export interface MockKcAdminClient {
  users: MockKeycloakUsers;
  groups: MockKeycloakGroups;
  clients: MockKeycloakClients;
  roles: MockKeycloakRoles;
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
      resetPassword: jest.fn().mockResolvedValue(undefined),
      addClientRoleMappings: jest.fn().mockResolvedValue(undefined),
      addRealmRoleMappings: jest.fn().mockResolvedValue(undefined),
      listClientRoleMappings: jest.fn().mockResolvedValue([]),
      listSessions: jest.fn().mockResolvedValue([]),
      logout: jest.fn().mockResolvedValue(undefined),
      addToGroup: jest.fn().mockResolvedValue(undefined),
    },
    groups: {
      find: jest.fn().mockResolvedValue([{ id: 'group-all-employees', name: 'All-Employees' }]),
    },
    clients: {
      find: jest.fn().mockResolvedValue([{ id: 'client-uuid-default', clientId: 'mcp-gateway' }]),
      listRoles: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    },
    roles: {
      find: jest.fn().mockResolvedValue([]),
      findOneByName: jest.fn().mockResolvedValue(undefined),
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
  Object.values(mock.groups).forEach((fn) => fn.mockReset());
  Object.values(mock.clients).forEach((fn) => fn.mockReset());
  Object.values(mock.roles).forEach((fn) => fn.mockReset());
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
