/**
 * Test utilities for mcp-hr service
 *
 * Provides typed mock factories for testing IdentityService and related components.
 * All mocks are designed to be type-safe and avoid `any` usage.
 */

// Keycloak Admin Client mocks
export {
  createMockKcAdmin,
  resetMockKcAdmin,
  createMockUser,
  createMockRole,
  type MockKcAdminClient,
  type MockKeycloakUsers,
  type MockKeycloakClients,
  type MockUserRepresentation,
  type MockRoleRepresentation,
  type MockSessionRepresentation,
} from './mock-keycloak-admin';

// PostgreSQL Pool/Client mocks
export {
  createMockPool,
  createMockPoolClient,
  createMockQueryResult,
  createMockEmployee,
  createMockAuditLog,
  resetMockPool,
  type MockPool,
  type MockPoolClient,
  type MockQueryResult,
} from './mock-db';

// BullMQ Queue/Worker mocks
export {
  createMockQueue,
  createMockWorker,
  createMockJob,
  resetMockQueue,
  type MockQueue,
  type MockWorker,
  type MockJob,
  type MockJobOptions,
  type MockDeleteUserJobData,
  type MockWorkerProcessor,
} from './mock-queue';
