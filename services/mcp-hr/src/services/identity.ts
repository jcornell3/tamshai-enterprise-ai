/**
 * IdentityService - Keycloak Atomic User Provisioning
 *
 * STUB FILE: This is a placeholder for TDD Red Phase.
 * Tests should fail until implementation is complete.
 *
 * @see .specify/Keycloak-Atomic-Dev.md for implementation details
 */

import type { Pool, PoolClient } from 'pg';

/**
 * Employee data for Keycloak user creation
 */
export interface EmployeeData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department: string;
}

/**
 * Result of user termination
 */
export interface TerminationResult {
  success: boolean;
  keycloakUserId: string;
  sessionsRevoked: number;
  scheduledDeletionAt: Date;
}

/**
 * IdentityService manages Keycloak user provisioning and de-provisioning.
 *
 * Uses dependency injection for KcAdminClient and Queue to enable unit testing
 * with mocks. When not provided, creates default instances from config.
 *
 * STUB: All methods throw "Not implemented" for TDD Red Phase.
 */
export class IdentityService {
  /**
   * @param db - PostgreSQL connection pool
   * @param kcAdmin - Optional KcAdminClient instance (for testing)
   * @param cleanupQueue - Optional BullMQ queue (for testing)
   */
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _db: Pool,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _kcAdmin?: unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _cleanupQueue?: unknown
  ) {
    // STUB: Not implemented
  }

  /**
   * Authenticate with Keycloak using service account credentials.
   * Must be called before any user management operations.
   */
  async authenticate(): Promise<void> {
    throw new Error('Not implemented: authenticate');
  }

  /**
   * Create user in Keycloak during employee onboarding.
   * MUST be called within a database transaction for atomicity.
   *
   * @throws Error if Keycloak creation fails (caller should rollback transaction)
   */
  async createUserInKeycloak(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _employeeData: EmployeeData,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _client: PoolClient
  ): Promise<string> {
    throw new Error('Not implemented: createUserInKeycloak');
  }

  /**
   * Terminate user access (offboarding).
   * Immediate disable + session revocation, delayed deletion (72 hours).
   */
  async terminateUser(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _employeeId: string
  ): Promise<TerminationResult> {
    throw new Error('Not implemented: terminateUser');
  }

  /**
   * Permanently delete user from Keycloak (called by cleanup worker after 72 hours).
   */
  async deleteUserPermanently(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _keycloakUserId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _employeeId: string
  ): Promise<void> {
    throw new Error('Not implemented: deleteUserPermanently');
  }
}
