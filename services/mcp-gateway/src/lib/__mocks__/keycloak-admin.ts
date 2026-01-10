/**
 * Mock for Keycloak Admin Client
 * Used in tests to avoid ES module import issues
 */

export const mockKcAdminClient = {
  users: {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'new-user-123' }),
    update: jest.fn().mockResolvedValue({}),
    del: jest.fn().mockResolvedValue({}),
    resetPassword: jest.fn().mockResolvedValue({}),
    listRealmRoleMappings: jest.fn().mockResolvedValue([]),
    addRealmRoleMappings: jest.fn().mockResolvedValue({}),
  },
  roles: {
    find: jest.fn().mockResolvedValue([]),
  },
};

export async function getKeycloakAdminClient() {
  return mockKcAdminClient;
}

export async function healthCheck() {
  return { healthy: true, authenticated: true };
}

export async function cleanup() {
  // No-op in mock
}
