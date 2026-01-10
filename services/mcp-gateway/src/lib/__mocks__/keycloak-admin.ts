/**
 * Mock for Keycloak Admin Client
 * Used in tests to avoid actual Keycloak connections
 *
 * IMPORTANT: This mock uses a singleton pattern to ensure that
 * the same mock instance is returned by getKeycloakAdminClient()
 * and is accessible to tests via mockKcAdminClient export.
 */

// Singleton mock client instance
// This ensures tests can manipulate the same instance that routes will use
const mockKcAdminClient = {
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
  setConfig: jest.fn(),
};

// Export the mock client so tests can manipulate it
export { mockKcAdminClient };

// Mock implementation of getKeycloakAdminClient
// Returns the singleton mock instance
export async function getKeycloakAdminClient() {
  return mockKcAdminClient;
}

// Mock implementation of cleanup function
export function cleanupKeycloakAdminClient() {
  // No-op in mock
}

// Mock implementation of health check
export async function isKeycloakAdminHealthy() {
  return true;
}
