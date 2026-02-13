/**
 * E2E Test Utilities
 *
 * Centralized exports for all E2E test utilities.
 * Import from this file for access to all utility functions.
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * @example
 * ```typescript
 * import {
 *   createDatabaseSnapshot,
 *   rollbackToSnapshot,
 *   expectBulkMenuEnabled,
 *   selectTableRows,
 *   expectWizardStepActive,
 *   goToNextStep
 * } from '../utils';
 * ```
 */

// Database utilities for test state isolation
export {
  createDatabaseSnapshot,
  rollbackToSnapshot,
  resetFinanceInvoices,
  seedTestData,
  clearTestData,
  getDatabaseStateHash,
  waitForDatabaseReady,
  deleteSnapshot,
  listSnapshots,
} from './database';

// Bulk action utilities for DataTable testing
export {
  expectBulkMenuEnabled,
  expectBulkMenuDisabled,
  selectTableRows,
  deselectTableRows,
  selectAllRows,
  deselectAllRows,
  getSelectedRowCount,
  clickBulkAction,
  confirmBulkAction,
  cancelBulkAction,
  expectSelectedCount,
  expectBulkActionsAvailable,
  expectHeaderCheckboxIndeterminate,
  getSelectedRowsData,
} from './bulk-actions';

// Wizard utilities for multi-step flow testing
export {
  expectWizardStepActive,
  expectStepCompleted,
  expectStepDisabled,
  goToNextStep,
  goToPreviousStep,
  submitWizard,
  cancelWizard,
  goToStepByBreadcrumb,
  getCurrentStepNumber,
  getTotalSteps,
  expectValidationErrors,
  expectNoValidationErrors,
  expectWizardProcessing,
  waitForWizardComplete,
  expectPreviousButtonHidden,
  expectSubmitButtonVisible,
  expectNextButtonShowsStep,
  fillWizardField,
  selectWizardOption,
  getStepTitle,
  getStepDescription,
  expectBreadcrumbsVisible,
  expectBreadcrumbsHidden,
} from './wizard';

// Authentication utilities for SSO + TOTP login flow
export {
  authenticateUser,
  createAuthenticatedContext,
  warmUpContext,
  generateTotpCode,
  loadTotpSecret,
  ENV,
  BASE_URLS,
  TEST_USER,
} from './auth';
